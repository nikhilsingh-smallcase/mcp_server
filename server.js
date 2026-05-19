require("dotenv").config();

const express = require("express");
const path = require("path");
const { loadSchemas } = require("./schemaLoader");
const { generateMongoQuery, formatAnswer } = require("./claudePipeline");
const { runQuery, closeDb } = require("./mongoExecutor");

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

// ── POST /ask ─────────────────────────────────────────────────────────────────

app.post("/ask", async (req, res) => {
  const startedAt = Date.now();
  const { question } = req.body ?? {};

  const errorResponse = (httpStatus, message) =>
    res.status(httpStatus).json({
      status: "error",
      answer_text: message,
      summary: message,
      assumptions: null,
      confidence: "low",
      data_source: "db",
      timeTaken: `${Date.now() - startedAt}ms`,
    });

  if (!question || typeof question !== "string" || !question.trim()) {
    return errorResponse(400, 'Body must contain a non-empty "question" string.');
  }

  // ── Steps 1+2: Generate query and execute, with up to 3 retries on MongoDB error ──
  const MAX_RETRIES = 3;
  const previousAttempts = [];
  let queryResult;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    let mongoQuery;
    try {
      mongoQuery = await generateMongoQuery(question.trim(), schemaSummary, previousAttempts);
    } catch (err) {
      console.warn(`[/ask] Query generation failed (attempt ${attempt}): ${err.message}`);
      previousAttempts.push({ query: err.raw ?? null, error: `Invalid JSON returned by model: ${err.raw ?? err.message}` });

      if (attempt === MAX_RETRIES) {
        return errorResponse(400, `Failed to generate a valid query after ${MAX_RETRIES} attempts.`);
      }
      console.log(`[/ask] Retrying with error context…`);
      continue;
    }

    const { collection, query } = mongoQuery;
    console.log(`[/ask] attempt=${attempt} collection="${collection}" query=${JSON.stringify(query)}`);

    try {
      queryResult = await runQuery(collection, query);
      break; // success — exit retry loop
    } catch (err) {
      console.warn(`[/ask] MongoDB execution failed (attempt ${attempt}): ${err.message}`);
      previousAttempts.push({ query: mongoQuery, error: err.message });

      if (attempt === MAX_RETRIES) {
        return errorResponse(500, `MongoDB query failed after ${MAX_RETRIES} attempts: ${err.message}`);
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
    return errorResponse(500, `Failed to format answer: ${err.message}`);
  }

  return res.json({
    status: "ok",
    answer_text: formatted.answer_text,
    summary: formatted.summary,
    ...(formatted.assumptions ? { assumptions: formatted.assumptions } : {}),
    confidence: formatted.confidence,
    data_source: "db",
    timeTaken: `${Date.now() - startedAt}ms`,
  });
});

// ── Health check ──────────────────────────────────────────────────────────────

app.get("/health", (_req, res) => res.json({ status: "ok" }));

// ── Start ─────────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
  console.log(`[server] Listening on http://localhost:${PORT}`);
});

// Graceful shutdown
const shutdown = async (signal) => {
  console.log(`\n[server] ${signal} received. Shutting down…`);
  server.close(async () => {
    await closeDb();
    process.exit(0);
  });
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
