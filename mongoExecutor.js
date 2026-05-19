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

const READ_ONLY_CHECK = /^\s*(insert|update|delete|drop|create|rename|replace)/i;

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

  // Safety: reject if query string starts with a mutating keyword
  const queryStr = JSON.stringify(query).toLowerCase();
  if (READ_ONLY_CHECK.test(queryStr)) {
    throw new Error("Refusing to execute a potentially mutating query");
  }

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

module.exports = { runQuery, closeDb };
