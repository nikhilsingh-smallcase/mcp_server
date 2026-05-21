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

const ALLOWED_PIPELINE_STAGES = new Set([
  "$match", "$group", "$sort", "$limit", "$skip", "$project",
  "$lookup", "$unwind", "$count", "$facet", "$addFields",
  "$replaceRoot", "$sample", "$set", "$replaceWith",
  "$sortByCount", "$bucket", "$bucketAuto", "$unionWith",
]);

const DANGEROUS_OPERATORS = new Set([
  "$where", "$function", "$accumulator", "$out", "$merge",
]);

function findDangerousOperators(value, path = "") {
  if (value === null || typeof value !== "object") return null;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const hit = findDangerousOperators(value[i], `${path}[${i}]`);
      if (hit) return hit;
    }
    return null;
  }
  for (const [k, v] of Object.entries(value)) {
    if (DANGEROUS_OPERATORS.has(k)) return `${path}.${k}`;
    const hit = findDangerousOperators(v, `${path}.${k}`);
    if (hit) return hit;
  }
  return null;
}

/**
 * Validate a query before execution.
 * Throws with err.isSecurity=true for hard blocks, plain Error for soft issues.
 */
function validateQuery(collectionName, query, knownCollections) {
  // 1. Collection must be in the known set
  if (knownCollections && !knownCollections.has(collectionName)) {
    const err = new Error(`Unknown collection: "${collectionName}"`);
    err.isSecurity = true;
    throw err;
  }

  // 2. Block dangerous operators anywhere in the query
  const hit = findDangerousOperators(query);
  if (hit) {
    const err = new Error(`Dangerous operator found at ${hit}`);
    err.isSecurity = true;
    throw err;
  }

  // 3. For aggregation pipelines, validate stage names and inject $limit
  if (Array.isArray(query)) {
    for (const stage of query) {
      const keys = Object.keys(stage);
      if (keys.length !== 1) continue;
      const stageName = keys[0];
      if (!ALLOWED_PIPELINE_STAGES.has(stageName)) {
        const err = new Error(`Pipeline stage "${stageName}" is not allowed`);
        err.isSecurity = true;
        throw err;
      }
    }
    // Auto-inject $limit if no $count and no $limit already present
    const hasCount = query.some((s) => s.$count !== undefined);
    const hasLimit = query.some((s) => s.$limit !== undefined);
    if (!hasCount && !hasLimit) {
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
    results = await collection.aggregate(query).toArray();
  } else if (query && typeof query === "object") {
    results = await collection.find(query).limit(100).toArray();
  } else {
    throw new Error(`Unsupported query type: ${typeof query}`);
  }

  return results;
}

/**
 * Fetch distinct values for a list of { collection, field } targets.
 * Returns an object keyed by "collection.field".
 */
async function fetchDistinctValues(targets) {
  const db = await getDb();
  const result = {};
  await Promise.all(
    targets.map(async ({ collection, field }) => {
      try {
        const vals = await db.collection(collection).distinct(field);
        result[`${collection}.${field}`] = vals.filter(
          (v) => v !== null && v !== undefined && v !== ""
        );
      } catch {
        // Non-fatal: collection may not exist yet
      }
    })
  );
  return result;
}

module.exports = { runQuery, closeDb, validateQuery, fetchDistinctValues };
