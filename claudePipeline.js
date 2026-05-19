const OpenAI = require("openai");

const client = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
});

// Model for query generation (needs strong JSON/reasoning ability)
const QUERY_MODEL = process.env.OPENROUTER_QUERY_MODEL || "deepseek/deepseek-v4-flash:free";
// Model for answer formatting (simpler task, use a different provider to avoid rate limits)
const FORMAT_MODEL = process.env.OPENROUTER_FORMAT_MODEL || "google/gemma-4-31b-it:free";

/**
 * Call 1: Ask the model to produce a MongoDB query (collection + pipeline/find).
 * Returns a parsed { collection, query } object.
 * Throws if the model returns unparseable JSON.
 */
async function generateMongoQuery(question, schemaSummary, previousAttempts = []) {
  const systemPrompt = `You are a read-only MongoDB query generator for a gateway service.

STRICT RULE: Only generate read-only queries. You may ONLY use:
- find filters (plain objects)
- aggregation pipelines using $match, $group, $sort, $limit, $skip, $project, $lookup, $unwind, $count, $facet, $addFields, $replaceRoot, $sample, and other read-only stages

NEVER generate insert, update, delete, drop, createCollection, replaceOne, updateOne, bulkWrite, findAndModify, or any other mutating operation. If the question implies a write, respond with { "collection": "", "query": {} } and nothing else.

DEFENSIVE RULES (documents may have missing/null fields due to schema evolution):
- Always wrap array fields in $ifNull when using $size: {"$size": {"$ifNull": ["$fieldName", []]}}
- Always use $ifNull or $cond when arithmetic on nullable Number fields
- Prefer $match with $expr over $addFields+$match when filtering by computed values

Given the schema below and a natural language question, return ONLY a raw JSON object with exactly two fields:
- "collection" (string): the collection to query
- "query" (object): either a MongoDB aggregation pipeline (array) or a find filter (object)

No explanation. No markdown. No code fences. Just the raw JSON object.

If you use an aggregation pipeline, use an array for "query".
If you use a simple find, use a plain object for "query".

SCHEMA:
${schemaSummary}`;

  // Build messages: system + user question + interleaved retry turns
  const messages = [{ role: "system", content: systemPrompt }];

  for (const { query, error } of previousAttempts) {
    messages.push({ role: "assistant", content: JSON.stringify(query) });
    messages.push({
      role: "user",
      content: `That query failed with this MongoDB error:\n${error}\n\nPlease fix the query and try again. Return only the corrected JSON object.`,
    });
  }

  // First turn or final retry turn
  if (previousAttempts.length === 0) {
    messages.push({ role: "user", content: question });
  }

  console.log(`[query-gen] attempt=${previousAttempts.length + 1} model=${QUERY_MODEL}\n${JSON.stringify(messages, null, 2)}`);

  const response = await client.chat.completions.create({
    model: QUERY_MODEL,
    messages,
  });

  const raw = response.choices[0]?.message?.content?.trim() ?? "";
  const stripped = raw.replace(/^```[a-z]*\n?/, "").replace(/```$/, "").trim();

  let parsed;
  try {
    parsed = JSON.parse(stripped);
  } catch {
    const err = new Error("Model returned invalid JSON for the query");
    err.raw = raw;
    err.statusCode = 400;
    throw err;
  }

  if (
    typeof parsed.collection !== "string" ||
    !parsed.collection ||
    parsed.query === undefined
  ) {
    const err = new Error(
      'Model response is missing required fields "collection" and/or "query"'
    );
    err.raw = raw;
    err.statusCode = 400;
    throw err;
  }

  return parsed;
}

/**
 * Call 2: Ask the model to format raw MongoDB results into a structured response object.
 * Returns { answer_text, summary, assumptions, confidence }
 */
async function formatAnswer(question, queryResult) {
  const resultText =
    queryResult === null || queryResult === undefined
      ? "(no results)"
      : JSON.stringify(queryResult, null, 2);

  const messages = [
    {
      role: "system",
      content: `You are a helpful data analyst. Given a user question and raw MongoDB query results, return ONLY a raw JSON object with these fields:
- "answer_text": one concise sentence directly answering the question with the key number/fact
- "summary": 2-4 sentences with full context, trends, notable details, and any caveats about the data
- "assumptions": any assumptions you made about the question or data interpretation (null if none)
- "confidence": "high" if data directly answers the question, "medium" if partial or approximate, "low" if data is sparse or ambiguous

No markdown. No code fences. Just the raw JSON object.`,
    },
    {
      role: "user",
      content: `Question: ${question}\n\nRaw results:\n${resultText}`,
    },
  ];
  console.log(`[format-answer] model=${FORMAT_MODEL}\n${JSON.stringify(messages, null, 2)}`);

  try {
    const response = await client.chat.completions.create({
      model: FORMAT_MODEL,
      messages,
    });
    const raw = response.choices[0]?.message?.content?.trim() ?? "";
    const stripped = raw.replace(/^```[a-z]*\n?/, "").replace(/```$/, "").trim();
    try {
      return JSON.parse(stripped);
    } catch {
      return plainFallback(queryResult);
    }
  } catch (err) {
    if (err.status === 429) {
      console.warn("[format-answer] Rate limited — returning raw result");
      return plainFallback(queryResult);
    }
    throw err;
  }
}

function plainFallback(queryResult) {
  if (!queryResult || queryResult.length === 0) {
    return { answer_text: "No results found.", summary: "The query returned no data.", assumptions: null, confidence: "low" };
  }

  // Single document with a single numeric field — most common case (count, sum, etc.)
  if (queryResult.length === 1) {
    const entries = Object.entries(queryResult[0]);
    if (entries.length === 1 && typeof entries[0][1] === "number") {
      const [key, val] = entries[0];
      const readable = val.toLocaleString();
      return {
        answer_text: `${key}: ${readable}`,
        summary: `The query returned a ${key} of ${readable}.`,
        assumptions: null,
        confidence: "medium",
      };
    }
    // Single doc, multiple fields — render as readable key-value lines
    const lines = entries.map(([k, v]) => `• ${k}: ${typeof v === "number" ? v.toLocaleString() : v}`).join("\n");
    return { answer_text: entries.map(([k, v]) => `${k}: ${v}`).join(", "), summary: lines, assumptions: null, confidence: "medium" };
  }

  // Multiple records — render as a readable list
  const lines = queryResult.map((doc, i) => {
    const parts = Object.entries(doc).map(([k, v]) => `${k}: ${typeof v === "number" ? v.toLocaleString() : v}`).join(", ");
    return `${i + 1}. ${parts}`;
  }).join("\n");
  return {
    answer_text: `${queryResult.length} records returned.`,
    summary: lines,
    assumptions: null,
    confidence: "medium",
  };
}

module.exports = { generateMongoQuery, formatAnswer };
