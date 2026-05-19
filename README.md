# Gateway Q&A Service

Natural-language Q&A over gateway MongoDB data using Claude AI.

## How it works

1. On startup, every `.js` file in `models/` is loaded and its Mongoose schema is parsed into a plain-text summary.
2. `POST /ask` accepts a plain-English question.
3. **Claude call 1** (Query Generator) receives the schema summary and the question, and returns a raw JSON `{ collection, query }` — either an aggregation pipeline or a find filter.
4. The query is executed against MongoDB using the **native driver** (read-only).
5. **Claude call 2** (Answer Formatter) converts the raw results into a concise 2-3 sentence human-readable answer.

## Setup

```bash
npm install
cp .env.example .env   # or edit .env directly
```

Edit `.env`:

```
MONGO_URI=mongodb://localhost:27017/gateway
ANTHROPIC_API_KEY=sk-ant-...
PORT=3000
```

## Adding models

Drop any Mongoose model file into `models/`. The server reads all `.js` files at startup and extracts collection names and field types automatically — no hardcoding required.

## Start

```bash
npm start          # production
npm run dev        # node --watch (auto-restarts on file changes)
```

## API

### `POST /ask`

```json
// Request
{ "question": "Which intent is failing the most this week?" }

// Response
{ "answer": "The most failing intent this week is 'placeOrder' with 1,243 failures." }
```

### `GET /health`

```json
{ "status": "ok" }
```

## Error responses

| Situation | HTTP status |
|---|---|
| Missing/empty question | 400 |
| Claude returns invalid JSON | 400 (with `raw_response`) |
| MongoDB query fails | 500 |
| Claude formatter fails | 500 |
