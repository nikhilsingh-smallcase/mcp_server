const fs = require("fs");
const path = require("path");

const TYPE_SHORT = {
  String: "S",
  Number: "N",
  Boolean: "B",
  Date: "D",
  ObjectId: "ID",
  Array: "A",
  Mixed: "M",
  Map: "M",
  Buffer: "M",
  Decimal128: "N",
};

// Fields that contain secrets or are purely internal — never useful in queries
const SKIP_FIELDS = new Set([
  "secret", "rotatedSecret", "apiSecret", "rotatedApiSecret",
  "secretRotations", "clientSecret", "password", "encryptionDecryptionKey",
  "privateKey", "ssrEncryptionKey", "encryptionKey", "decryptionKey",
]);

// Collections to exclude entirely from LLM context
const SKIP_COLLECTIONS = new Set([
  "mfanalytics", "mfholdings", "mfpartnerconfig", "mfusers", "userapplications",
]);

// Field top-level prefixes to exclude globally across all collections
const SKIP_FIELD_PREFIXES = new Set([
  "featureBlacklist", "config", "assetConfig", "postbackContext", "partnerContext", "userConsent",
]);

// Per-collection exact field paths to exclude
const SKIP_FIELDS_BY_COLLECTION = {
  gateway: new Set(["meta", "authorizedDomains", "authorizedDomainExpressions", "downtime"]),
  gatewayTransactions: new Set([
    "funds", "fundsUrl", "sipAction", "imrAction", "postbackStatus",
    "flags.sipCreatedOrUpdated", "flags.imrCreatedOrUpdated", "flags.sessionExtended",
    "flags.hideSubscriptionSuccessScreen", "config.orderName", "config.orderLogo",
    "meta.opener", "meta.subWidgetEncryptedData",
  ]),
};

// Max dot-depth to include (e.g. 2 = "postbackStatus.order" but not "postbackContext.lastUpdates.X.retryAfter")
const MAX_DEPTH = 2;

/**
 * Resolves a Mongoose schema type token to a readable string.
 */
function resolveTypeName(typeValue) {
  if (!typeValue) return "M";
  if (typeof typeValue === "string") return TYPE_SHORT[typeValue] ?? typeValue;

  if (typeof typeValue === "function") {
    return TYPE_SHORT[typeValue.name] ?? "M";
  }

  if (Array.isArray(typeValue)) return "A";

  if (typeof typeValue === "object") {
    if (typeValue.type !== undefined) return resolveTypeName(typeValue.type);
    return "M";
  }

  return "M";
}

/**
 * Walks a Mongoose schema definition object and returns a flat map of
 * fieldName → typeName entries. Nested paths use dot notation.
 */
function flattenSchemaDef(def, prefix = "") {
  const fields = {};

  for (const [key, value] of Object.entries(def)) {
    if (key.startsWith("_") || key === "__v") continue;

    const fullKey = prefix ? `${prefix}.${key}` : key;

    if (value === null || value === undefined) {
      fields[fullKey] = "Mixed";
      continue;
    }

    // Explicit { type: X } descriptor
    if (
      typeof value === "object" &&
      !Array.isArray(value) &&
      value.type !== undefined &&
      typeof value.type !== "object"
    ) {
      fields[fullKey] = resolveTypeName(value.type);
      continue;
    }

    // Array shorthand
    if (Array.isArray(value)) {
      fields[fullKey] = resolveTypeName(value);
      continue;
    }

    // Nested schema object (no explicit `type` key at this level)
    if (
      typeof value === "object" &&
      !Array.isArray(value) &&
      value.type === undefined
    ) {
      const nested = flattenSchemaDef(value, fullKey);
      Object.assign(fields, nested);
      continue;
    }

    // Constructor or primitive default
    fields[fullKey] = resolveTypeName(value);
  }

  return fields;
}

/**
 * Loads all .js files from the models/ directory, requires them, and
 * extracts collection name + field definitions from each Mongoose model.
 *
 * Returns an array of { collectionName, fields } objects and a ready-to-use
 * plain-text schema summary for injection into the Claude system prompt.
 */
function loadSchemas(modelsDir) {
  const schemas = [];

  if (!fs.existsSync(modelsDir)) {
    console.warn(`[schemaLoader] models/ directory not found at ${modelsDir}`);
    return { schemas, summary: "(no models found)" };
  }

  const files = fs
    .readdirSync(modelsDir)
    .filter((f) => f.endsWith(".js") && !f.startsWith("."));

  if (files.length === 0) {
    console.warn("[schemaLoader] No .js files found in models/");
    return { schemas, summary: "(no models found)" };
  }

  for (const file of files) {
    const filePath = path.join(modelsDir, file);
    try {
      // Clear the require cache so reloads work in dev
      delete require.cache[require.resolve(filePath)];
      const exported = require(filePath);

      // Support both `module.exports = Model` and `module.exports = { Model }`
      const candidates = [
        exported,
        ...Object.values(exported || {}),
      ];

      for (const candidate of candidates) {
        // A Mongoose model has a `schema` property with a `paths` object
        if (
          candidate &&
          candidate.schema &&
          candidate.schema.paths &&
          candidate.modelName
        ) {
          const collectionName =
            candidate.collection?.name || candidate.modelName;

          if (SKIP_COLLECTIONS.has(collectionName.toLowerCase())) break;

          // Build fields map from schema.paths (most reliable source)
          const fields = {};
          for (const [pathName, schemaType] of Object.entries(
            candidate.schema.paths
          )) {
            if (pathName === "__v" || pathName === "_id") continue;
            const typeName =
              schemaType.instance ||
              resolveTypeName(schemaType.options?.type) ||
              "Mixed";
            const enumVals = schemaType.options?.enum;
            const enumHint =
              Array.isArray(enumVals) && enumVals.length > 0
                ? `[${enumVals.filter(Boolean).join("|")}]`
                : "";
            fields[pathName] = enumHint ? `${typeName}${enumHint}` : typeName;
          }

          // Fallback: parse the raw schema obj definition if paths gave nothing
          if (Object.keys(fields).length === 0 && candidate.schema.obj) {
            Object.assign(fields, flattenSchemaDef(candidate.schema.obj));
          }

          schemas.push({ collectionName, fields });
          break; // one model per file is the convention
        }
      }
    } catch (err) {
      console.warn(`[schemaLoader] Could not load ${file}: ${err.message}`);
    }
  }

  const legend = "# Types: S=String N=Number B=Boolean D=Date ID=ObjectId A=Array M=Mixed\n";
  const summary = legend + schemas
    .map(({ collectionName, fields }) => {
      const fieldParts = Object.entries(fields)
        .filter(([name]) => {
          const topKey = name.split(".")[0];
          if (SKIP_FIELDS.has(topKey)) return false;
          if (name.split(".").length > MAX_DEPTH) return false;
          if (SKIP_FIELD_PREFIXES.has(topKey)) return false;
          const collectionSkips = SKIP_FIELDS_BY_COLLECTION[collectionName];
          if (collectionSkips && (collectionSkips.has(topKey) || collectionSkips.has(name))) return false;
          return true;
        })
        .map(([name, type]) => {
          const enumMatch = type.match(/^(\w+)(\[.*\])?$/);
          const baseType = enumMatch?.[1] ?? type;
          const enumSuffix = enumMatch?.[2] ?? "";
          const short = (TYPE_SHORT[baseType] ?? baseType) + enumSuffix;
          return `${name}:${short}`;
        });
      return `${collectionName}: ${fieldParts.join(", ")}`;
    })
    .join("\n");

  return { schemas, summary };
}

module.exports = { loadSchemas };
