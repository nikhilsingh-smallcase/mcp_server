require("dotenv").config();

const express = require("express");
const path = require("path");
const { loadSchemas } = require("./schemaLoader");
const { generateMongoQuery, formatAnswer } = require("./claudePipeline");
const { runQuery, closeDb, fetchDistinctValues, validateQuery } = require("./mongoExecutor");

const app = express();
app.use(express.json());

// ── Schema loading ────────────────────────────────────────────────────────────

const modelsDir = path.join(__dirname, "models");
const { schemas, summary: schemaSummary } = loadSchemas(modelsDir);

if (schemas.length === 0) {
  console.warn(
    "[startup] No Mongoose models found in models/. Claude will have no schema context."
  );
} else {
  console.log(
    `[startup] Loaded ${schemas.length} model(s):\n${schemaSummary}\n`
  );
}

const knownCollections = new Set(schemas.map((s) => s.collectionName));

// Key fields to ground the LLM with real DB values (name resolution)
const DISTINCT_TARGETS = [
  { collection: "gateway", field: "name" },
  { collection: "gatewayTransactions", field: "gateway" },
  { collection: "gatewayTransactions", field: "intent" },
  { collection: "gatewayTransactions", field: "status" },
  { collection: "gatewayUsers", field: "gateway" },
];

let knownValues = {};

// ── POST /ask ─────────────────────────────────────────────────────────────────

app.post("/ask", async (req, res) => {
  const startedAt = Date.now();
  const { question } = req.body ?? {};

  const errorResponse = (httpStatus, errorCode, errorMessage, queryId = null) =>
    res.status(httpStatus).json({
      status: "error",
      error_code: errorCode,
      error_message: errorMessage,
      ...(queryId != null ? { query_id: queryId } : {}),
    });

  if (!question || typeof question !== "string" || !question.trim()) {
    return errorResponse(400, "INVALID_REQUEST", 'Body must contain a non-empty "question" string.');
  }

  // ── Steps 1+2: Generate query and execute, with up to 3 retries on MongoDB error ──
  const MAX_RETRIES = 3;
  const previousAttempts = [];
  let queryResult;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    let mongoQuery;
    try {
      mongoQuery = await generateMongoQuery(question.trim(), schemaSummary, previousAttempts, knownValues);
    } catch (err) {
      console.warn(`[/ask] Query generation failed (attempt ${attempt}): ${err.message}`);

      if (err.isDailyLimit) {
        return errorResponse(429, "RATE_LIMIT_DAILY", err.message);
      }

      previousAttempts.push({ query: err.raw ?? null, error: `Invalid JSON returned by model: ${err.raw ?? err.message}` });

      if (attempt === MAX_RETRIES) {
        return errorResponse(400, "QUERY_GENERATION_FAILED", `Failed to generate a valid query after ${MAX_RETRIES} attempts.`);
      }
      console.log(`[/ask] Retrying with error context…`);
      continue;
    }

    const { collection, query } = mongoQuery;
    console.log(`[/ask] attempt=${attempt} collection="${collection}" query=${JSON.stringify(query)}`);

    // Validate before executing — mutates pipeline in-place to inject $limit if missing
    try {
      validateQuery(collection, query, knownCollections);
    } catch (err) {
      if (err.isSecurity) {
        console.warn(`[/ask] Security violation: ${err.message}`);
        return errorResponse(400, "QUERY_SECURITY_VIOLATION", err.message);
      }
      console.warn(`[/ask] Query validation failed (attempt ${attempt}): ${err.message}`);
      previousAttempts.push({ query: mongoQuery, error: err.message });
      if (attempt === MAX_RETRIES) {
        return errorResponse(400, "QUERY_VALIDATION_FAILED", `Query validation failed after ${MAX_RETRIES} attempts: ${err.message}`);
      }
      console.log(`[/ask] Retrying with error context…`);
      continue;
    }

    try {
      queryResult = await runQuery(collection, query);
      break; // success — exit retry loop
    } catch (err) {
      console.warn(`[/ask] MongoDB execution failed (attempt ${attempt}): ${err.message}`);
      previousAttempts.push({ query: mongoQuery, error: err.message });

      if (attempt === MAX_RETRIES) {
        return errorResponse(500, "QUERY_EXECUTION_FAILED", `MongoDB query failed after ${MAX_RETRIES} attempts: ${err.message}`);
      }
      console.log(`[/ask] Retrying with error context…`);
    }
  }

  // ── Step 3: Format result as a human-friendly answer via Claude ───────────
  let formatted;
  try {
    formatted = await formatAnswer(question.trim(), queryResult);
  } catch (err) {
    console.error("[/ask] Answer formatting failed:", err.message);
    return errorResponse(500, "FORMAT_FAILED", `Failed to format answer: ${err.message}`);
  }

  return res.json({
    status: "ok",
    answer_text: formatted.answer_text,
    summary: formatted.summary,
    ...(formatted.markdown ? { markdown: formatted.markdown } : {}),
    ...(formatted.assumptions ? { assumptions: formatted.assumptions } : {}),
    confidence: formatted.confidence,
    data_source: "db",
    took_ms: Date.now() - startedAt,
  });
});

// ── Health check ──────────────────────────────────────────────────────────────

app.get("/health", (_req, res) => res.json({ status: "ok" }));

// ── Start ─────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3000;

(async () => {
  try {
    knownValues = await fetchDistinctValues(DISTINCT_TARGETS);
    console.log("[startup] Loaded known DB values for name resolution");
  } catch (err) {
    console.warn("[startup] Could not load known DB values — name resolution will be degraded:", err.message);
  }

  const server = app.listen(PORT, () => {
    console.log(`[server] Listening on http://localhost:${PORT}`);
  });

  const shutdown = async (signal) => {
    console.log(`\n[server] ${signal} received. Shutting down…`);
    server.close(async () => {
      await closeDb();
      process.exit(0);
    });
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
})();
