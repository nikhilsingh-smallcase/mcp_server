const { MongoClient } = require("mongodb");

let _client = null;
let _db = null;

/**
 * Lazily connects to MongoDB and returns the Db instance.
 */
function buildUri() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set in environment");

  const user = process.env.MONGODB_USER;
  const pass = process.env.MONGODB_PASS;

  if (!user && !pass) return uri;

  const url = new URL(uri);
  if (user) url.username = encodeURIComponent(user);
  if (pass) url.password = encodeURIComponent(pass);
  return url.toString();
}

async function getDb() {
  if (_db) return _db;

  const uri = buildUri();
  _client = new MongoClient(uri);
  await _client.connect();

  // Extract DB name from URI; fall back to "gateway"
  const url = new URL(process.env.MONGODB_URI);
  const dbName = url.pathname.slice(1) || "gateway";
  _db = _client.db(dbName);

  console.log(`[mongo] Connected to database: ${dbName}`);
  return _db;
}

/**
 * Gracefully close the MongoDB connection.
 */
async function closeDb() {
  if (_client) {
    await _client.close();
    _client = null;
    _db = null;
  }
}

// Aggregation stages that are safe to execute (read-only)
const ALLOWED_PIPELINE_STAGES = new Set([
  "$match", "$group", "$sort", "$limit", "$skip", "$project",
  "$lookup", "$unwind", "$count", "$facet", "$addFields",
  "$replaceRoot", "$sample", "$set", "$replaceWith",
  "$sortByCount", "$bucket", "$bucketAuto", "$unionWith",
]);

// Operators that execute arbitrary JS or write data — hard block, no retry
const DANGEROUS_OPERATORS = new Set([
  "$where", "$function", "$accumulator", "$out", "$merge",
]);

function findDangerousOperators(value, found = []) {
  if (value === null || value === undefined) return found;
  if (Array.isArray(value)) {
    for (const item of value) findDangerousOperators(item, found);
  } else if (typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      if (DANGEROUS_OPERATORS.has(k)) found.push(k);
      findDangerousOperators(v, found);
    }
  }
  return found;
}

/**
 * Validate a LLM-generated query before executing it.
 * Throws with err.isSecurity=true for hard blocks (no retry).
 * Throws with err.isRetryable=true for fixable issues (feed back to LLM).
 * Mutates pipeline array in-place to inject $limit if missing.
 *
 * @param {string} collectionName
 * @param {Array|Object} query
 * @param {Set<string>} knownCollections - collection names loaded from schemas
 */
function validateQuery(collectionName, query, knownCollections) {
  // 1. Collection must be in the known allowlist
  if (knownCollections && !knownCollections.has(collectionName)) {
    const err = new Error(
      `Unknown collection "${collectionName}". Valid collections: ${[...knownCollections].join(", ")}`
    );
    err.isRetryable = true;
    throw err;
  }

  // 2. Query must be an array (pipeline) or plain object (find filter)
  if (!Array.isArray(query) && (typeof query !== "object" || query === null)) {
    const err = new Error(
      `Query must be an array (pipeline) or plain object (find filter), got ${typeof query}`
    );
    err.isRetryable = true;
    throw err;
  }

  // 3. Dangerous operators — hard fail, no retry
  const dangerous = findDangerousOperators(query);
  if (dangerous.length > 0) {
    const err = new Error(
      `Query contains forbidden operator(s): ${dangerous.join(", ")}. These operators are not permitted.`
    );
    err.isSecurity = true;
    throw err;
  }

  // 4. Aggregation pipeline: validate stage names + inject $limit if missing
  if (Array.isArray(query)) {
    for (const stage of query) {
      if (typeof stage !== "object" || stage === null) continue;
      for (const key of Object.keys(stage)) {
        if (key.startsWith("$") && !ALLOWED_PIPELINE_STAGES.has(key)) {
          const err = new Error(
            `Pipeline contains disallowed stage "${key}". Allowed stages: ${[...ALLOWED_PIPELINE_STAGES].join(", ")}`
          );
          err.isRetryable = true;
          throw err;
        }
      }
    }

    // Auto-inject $limit if the pipeline has none (silent fix, no retry)
    const hasLimit = query.some((stage) => "$limit" in stage);
    if (!hasLimit) {
      query.push({ $limit: 100 });
    }
  }
}

/**
 * Recursively convert Extended JSON date nodes { "$date": "..." } to JS Date objects.
 * The MongoDB Node.js driver does not auto-deserialize EJSON in query objects.
 */
function deserializeDates(value) {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(deserializeDates);
  if (typeof value === "object") {
    // EJSON date node
    if (Object.keys(value).length === 1 && value.$date !== undefined) {
      return new Date(value.$date);
    }
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = deserializeDates(v);
    }
    return out;
  }
  return value;
}

/**
 * Execute a query produced by Claude against MongoDB.
 *
 * @param {string} collectionName
 * @param {Array|Object} query  - aggregation pipeline (array) or find filter (object)
 * @returns {Array} up to 100 documents
 */
async function runQuery(collectionName, query) {
  const db = await getDb();
  const collection = db.collection(collectionName);
  query = deserializeDates(query);

  let results;

  if (Array.isArray(query)) {
    // Aggregation pipeline
    results = await collection.aggregate(query).toArray();
  } else if (query && typeof query === "object") {
    // Simple find with a filter object
    results = await collection.find(query).limit(100).toArray();
  } else {
    throw new Error(`Unsupported query type: ${typeof query}`);
  }

  return results;
}

/**
 * Fetch distinct values for key lookup fields across collections.
 * Used to ground the LLM prompt with real DB values.
 *
 * @param {Array<{collection: string, field: string}>} targets
 * @returns {Object} map of "collection.field" -> distinct values array
 */
async function fetchDistinctValues(targets) {
  const db = await getDb();
  const result = {};
  await Promise.all(
    targets.map(async ({ collection, field }) => {
      try {
        const values = await db.collection(collection).distinct(field);
        result[`${collection}.${field}`] = values.filter(Boolean).slice(0, 200);
      } catch (err) {
        console.warn(`[mongo] Could not fetch distinct ${collection}.${field}: ${err.message}`);
      }
    })
  );
  return result;
}

module.exports = { runQuery, closeDb, fetchDistinctValues, validateQuery };
