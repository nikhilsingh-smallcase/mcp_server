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
async function generateMongoQuery(question, schemaSummary) {
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

  const messages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: question },
  ];
  console.log(`[query-gen] model=${QUERY_MODEL}\n${JSON.stringify(messages, null, 2)}`);

  const response = await client.chat.completions.create({
    model: QUERY_MODEL,
    messages,
  });

  const raw = response.choices[0]?.message?.content?.trim() ?? "";

  // Strip any accidental markdown fences (defensive)
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
 * Call 2: Ask the model to format raw MongoDB results into a human-friendly answer.
 */
async function formatAnswer(question, queryResult) {
  const resultText =
    queryResult === null || queryResult === undefined
      ? "(no results)"
      : JSON.stringify(queryResult, null, 2);

  const messages = [
    {
      role: "system",
      content:
        "You are a helpful data analyst. Given a user question and raw MongoDB query results, write a concise 2-3 sentence human-friendly answer. Be specific with numbers and names from the data.",
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
    return response.choices[0]?.message?.content?.trim() ?? plainFallback(queryResult);
  } catch (err) {
    if (err.status === 429) {
      console.warn("[format-answer] Rate limited — returning raw result");
      return plainFallback(queryResult);
    }
    throw err;
  }
}

function plainFallback(queryResult) {
  if (!queryResult || queryResult.length === 0) return "No results found.";
  if (queryResult.length === 1) {
    const entries = Object.entries(queryResult[0])
      .map(([k, v]) => `${k}: ${v}`)
      .join(", ");
    return `Result: ${entries}`;
  }
  return `Found ${queryResult.length} records:\n${JSON.stringify(queryResult, null, 2)}`;
}

module.exports = { generateMongoQuery, formatAnswer };
