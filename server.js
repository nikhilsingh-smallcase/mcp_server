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
  const { question } = req.body ?? {};

  if (!question || typeof question !== "string" || !question.trim()) {
    return res.status(400).json({ error: 'Body must contain a non-empty "question" string.' });
  }

  let mongoQuery;

  // ── Step 1: Generate MongoDB query via Claude ──────────────────────────────
  try {
    mongoQuery = await generateMongoQuery(question.trim(), schemaSummary);
  } catch (err) {
    console.error("[/ask] Query generation failed:", err.message, err.raw ?? "");
    const status = err.statusCode === 400 ? 400 : 500;
    return res.status(status).json({
      error: err.message,
      ...(err.raw ? { raw_response: err.raw } : {}),
    });
  }

  const { collection, query } = mongoQuery;
  console.log(
    `[/ask] collection="${collection}" query=${JSON.stringify(query)}`
  );

  // ── Step 2: Execute query against MongoDB ─────────────────────────────────
  let queryResult;
  try {
    queryResult = await runQuery(collection, query);
  } catch (err) {
    console.error("[/ask] MongoDB execution failed:", err.message);
    return res.status(500).json({
      error: `MongoDB query failed: ${err.message}`,
    });
  }

  // ── Step 3: Format result as a human-friendly answer via Claude ───────────
  let answer;
  try {
    answer = await formatAnswer(question.trim(), queryResult);
  } catch (err) {
    console.error("[/ask] Answer formatting failed:", err.message);
    return res.status(500).json({
      error: `Failed to format answer: ${err.message}`,
    });
  }

  return res.json({ answer });
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
