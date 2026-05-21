const OpenAI = require("openai");

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

function buildDateAnchors() {
  const now = new Date();
  // Use local date to avoid UTC-vs-local timezone confusion
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const fmt = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };

  const sub = (days) => {
    const d = new Date(today);
    d.setDate(d.getDate() - days);
    return d;
  };

  const startOfWeek = new Date(today);
  const dow = startOfWeek.getDay();
  startOfWeek.setDate(startOfWeek.getDate() - (dow === 0 ? 6 : dow - 1));

  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const startOfYear = new Date(today.getFullYear(), 0, 1);

  return [
    `today              → ${fmt(today)}`,
    `last 7 days start  → ${fmt(sub(7))}`,
    `last 14 days start → ${fmt(sub(14))}`,
    `last 30 days start → ${fmt(sub(30))}`,
    `last 90 days start → ${fmt(sub(90))}`,
    `this week (Mon)    → ${fmt(startOfWeek)}`,
    `this month         → ${fmt(startOfMonth)}`,
    `this year          → ${fmt(startOfYear)}`,
  ].join("\n");
}

// Model for query generation (needs strong JSON/reasoning ability)
const QUERY_MODEL = process.env.OPENAI_QUERY_MODEL || "gpt-4o-mini";
// Model for answer formatting (simpler task)
const FORMAT_MODEL = process.env.OPENAI_FORMAT_MODEL || "gpt-4o-mini";

/**
 * Call 1: Ask the model to produce a MongoDB query (collection + pipeline/find).
 * Returns a parsed { collection, query } object.
 * Throws if the model returns unparseable JSON.
 */
async function generateMongoQuery(question, schemaSummary, previousAttempts = [], knownValues = {}) {
  const knownValuesBlock = Object.keys(knownValues).length > 0
    ? `\nKNOWN VALUES (use these exact strings when matching):\n` +
      Object.entries(knownValues)
        .map(([key, vals]) => `- ${key}: ${vals.map((v) => JSON.stringify(v)).join(", ")}`)
        .join("\n")
    : "";

  const systemPrompt = `You are a read-only MongoDB query generator for a gateway analytics service.

SAFETY: Never generate insert, update, delete, drop, createCollection, replaceOne, updateOne, bulkWrite, findAndModify, or any write. If the question implies a write, return { "collection": "", "query": {} } and nothing else.

COLLECTION SEMANTICS (understand before querying):
- gateway                        : Partner/tenant config. One doc per partner. gateway.name is the unique partner key (lowercase slug, e.g. "smallcase-website"). Use for partner metadata, flags, stats.
- gatewayTransactions            : User transaction sessions. gateway field = FK → gateway.name. Primary time field: createdAt (when session started); use completedAt only when asked about completion time.
- gatewayUsers                   : Broker-connected users per partner. gateway field = FK → gateway.name. accountId = ObjectId ref → gatewayAccounts._id.
- gatewayAccounts                : Broker account records. accountId = ObjectId ref to broker's own user ID (not gatewayUsers._id).
- gatewayPartnerAnalyticsConfigs : Per-partner analytics event config. partnerId = FK → gateway.name.

FOREIGN KEY JOINS (for $lookup stages):
- gatewayTransactions → gateway         : localField "gateway",   foreignField "name"
- gatewayUsers        → gateway         : localField "gateway",   foreignField "name"
- gatewayUsers        → gatewayAccounts : localField "accountId", foreignField "_id"

QUERY PATTERN (most analytical questions follow this shape):
1. $match  { gateway: <partnerName>, createdAt: { $gte: ... } }   ← always filter early
2. $match  { status: ..., intent: ... }                            ← add if question implies it
3. $group / $count / $project                                      ← aggregate or project
Use gatewayTransactions for session/funnel/conversion questions. Use gateway for partner-level config or stats questions.

COMPARISON RULE: When the question compares multiple gateways ("X vs Y", "compare A and B", "for each gateway"):
- Use { "gateway": { "$in": ["partnerA", "partnerB"] } } in the $match stage — never filter to just one.
- Always include a $group stage with _id: "$gateway" so results are broken out per gateway.

COUNT RULE: When the question asks "how many", "count", or "total number of" — ALWAYS use an aggregation pipeline with $count, never a find filter. A find filter returns raw documents, not a count.
Example: "how many X" → [{ "$match": { ... } }, { "$count": "total" }]

DATE RULES:
- Express all dates as Extended JSON: { "$date": "YYYY-MM-DDT00:00:00Z" }
- Use these pre-computed anchors directly — do NOT recalculate:
${buildDateAnchors()}
- For unlisted ranges (e.g. "last 45 days"), subtract exactly N days from today with no off-by-one.
- For open-ended time ranges ("last N days", "this week", "this month", "this year"):
  * Use ONLY $gte on createdAt — NEVER add $lte or any upper-bound date filter.
  * Write it as a direct field filter: { "createdAt": { "$gte": { "$date": "..." } } }
  * Do NOT use $expr for simple date filters — $expr is only for cross-field comparisons.
- Only add $lte if the question explicitly names both a start AND end date.
- Always use createdAt for date range filtering unless the question explicitly says "completed on/by/after".
- "COMPLETED" refers to the status value — it is NOT a time reference. Do not use completedAt just because status is COMPLETED.
- Only use completedAt if the question explicitly says "completed on", "finished by", or "completion date".

DEFENSIVE RULES (schema may have missing/null fields from schema evolution):
- Array fields with $size: use { "$size": { "$ifNull": ["$fieldName", []] } }
- Nullable numeric arithmetic: wrap in $ifNull or $cond
- Filtering on computed values: prefer $match with $expr over $addFields + $match

KNOWN VALUES RESOLUTION:
When the user mentions a name (partner, intent, status), resolve it to the closest known value:
1. If the user's token is an exact match in the list (case-insensitive) — use it directly.
2. If the user's token looks like a full slug (contains hyphens or looks complete, e.g. "gatewaydemo-stag") — use it as-is even if not in the list. Trust the user.
3. If the user's token is a partial word (e.g. "smallcase"), pick the known value whose slug contains it as a substring (e.g. → "smallcase-website").
4. If multiple candidates match a partial token, use { "$regex": "<userToken>", "$options": "i" } instead of guessing.
Never silently drop a name the user explicitly provided — if unsure, use it as-is or with $regex.

OUTPUT FORMAT:
Return ONLY a raw JSON object with exactly two fields:
- "collection" (string): the collection to query
- "query": aggregation pipeline (array) or find filter (plain object)
No explanation. No markdown. No code fences. Just the raw JSON.

SCHEMA:
${schemaSummary}${knownValuesBlock}`;

  const messages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: question },
  ];

  for (const { query, error } of previousAttempts) {
    messages.push({ role: "assistant", content: JSON.stringify(query) });
    messages.push({
      role: "user",
      content: `That query failed with this error:\n${error}\n\nPlease fix the query and try again. Return only the corrected JSON object.`,
    });
  }

  console.log(`[query-gen] attempt=${previousAttempts.length + 1} model=${QUERY_MODEL}\n${JSON.stringify(messages, null, 2)}`);

  let response;
  try {
    response = await client.chat.completions.create({
      model: QUERY_MODEL,
      messages,
      temperature: 0,
    });
  } catch (apiErr) {
    const msg = apiErr?.message ?? "";
    if (msg.includes("free-models-per-day") || msg.includes("per-day")) {
      const err = new Error("Daily free model limit exhausted. Add credits to OpenRouter or try again tomorrow.");
      err.isDailyLimit = true;
      err.statusCode = 429;
      throw err;
    }
    throw apiErr;
  }

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
 * Returns { answer_text, summary, markdown, assumptions, confidence }
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
- "summary": 2-4 plain sentences with full context, trends, notable details, and any caveats about the data
- "markdown": if the data has multiple records or multiple fields that form a table, a GitHub-flavored markdown table string with column-width-aligned separators (e.g. |---------|-------|); otherwise null
- "assumptions": any assumptions you made about the question or data interpretation (null if none)
- "confidence": "high" if data directly answers the question, "medium" if partial or approximate, "low" if data is sparse or ambiguous

No code fences. Just the raw JSON object.`,
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
      const parsed = JSON.parse(stripped);
      if (parsed.markdown) parsed.markdown = normalizeMarkdownTable(parsed.markdown);
      return parsed;
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

function normalizeMarkdownTable(md) {
  const lines = md.split("\n").map((l) => l.trim()).filter(Boolean);
  const isSeparator = (l) => /^\|[\s\-|]+\|$/.test(l);

  while (lines.length > 0 && isSeparator(lines[0])) lines.shift();

  if (lines.length < 2) return md;

  const header = lines[0];
  const rest = lines.slice(1).filter((l) => !isSeparator(l));
  const colCount = (header.match(/\|/g) ?? []).length - 1;
  const separator = `| ${Array(colCount).fill("---").join(" | ")} |`;

  return [header, separator, ...rest].join("\n");
}

function formatValue(v) {
  if (v === null || v === undefined) return "null";
  if (typeof v === "number") return v.toLocaleString();
  if (typeof v === "string") return v;
  if (Array.isArray(v)) {
    if (v.length === 0) return "(none)";
    const keys = v[0] != null && typeof v[0] === "object" ? Object.keys(v[0]) : null;
    if (keys && keys.length === 1) {
      const key = keys[0];
      return v.map((item) => formatValue(item[key])).join(", ");
    }
    return v.map((item) => formatValue(item)).join("; ");
  }
  if (typeof v === "object") {
    return Object.entries(v).map(([k, val]) => `${k}: ${formatValue(val)}`).join(", ");
  }
  return String(v);
}

function plainFallback(queryResult) {
  if (!queryResult || queryResult.length === 0) {
    return { answer_text: "No results found.", summary: "The query returned no data.", assumptions: null, confidence: "low" };
  }

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
    const colW0 = Math.max("Field".length, ...entries.map(([k]) => k.length));
    const colW1 = Math.max("Value".length, ...entries.map(([, v]) => formatValue(v).length));
    const p = (str, len) => str.padEnd(len);
    const markdown = [
      `| ${"Field".padEnd(colW0)} | ${"Value".padEnd(colW1)} |`,
      `| ${"-".repeat(colW0)} | ${"-".repeat(colW1)} |`,
      ...entries.map(([k, v]) => `| ${p(k, colW0)} | ${p(formatValue(v), colW1)} |`),
    ].join("\n");
    const shortAnswer = entries.map(([k, v]) => `${k}: ${formatValue(v)}`).join(" | ");
    const summary = entries.map(([k, v]) => `${k} is ${formatValue(v)}`).join(". ") + ".";
    return { answer_text: shortAnswer, summary, markdown, assumptions: null, confidence: "medium" };
  }

  const headers = Object.keys(queryResult[0]);
  const rows = queryResult.map((doc) => headers.map((h) => formatValue(doc[h])));
  const colWidths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => r[i].length))
  );
  const p = (str, len) => str.padEnd(len);
  const headerRow = `| ${headers.map((h, i) => p(h, colWidths[i])).join(" | ")} |`;
  const separatorRow = `| ${colWidths.map((w) => "-".repeat(w)).join(" | ")} |`;
  const dataRows = rows.map((r) =>
    `| ${r.map((cell, i) => p(cell, colWidths[i])).join(" | ")} |`
  ).join("\n");
  const markdown = [headerRow, separatorRow, dataRows].join("\n");
  return {
    answer_text: `${queryResult.length} records returned.`,
    summary: `Query returned ${queryResult.length} records across ${headers.length} fields: ${headers.join(", ")}.`,
    markdown,
    assumptions: null,
    confidence: "medium",
  };
}

module.exports = { generateMongoQuery, formatAnswer };
