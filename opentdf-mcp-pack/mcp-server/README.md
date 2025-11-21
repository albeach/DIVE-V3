# OpenTDF MCP server

Serve a local OpenTDF JSONL corpus to Cursor (or any MCP host).

## Usage

```bash
npm install
npm run build
OPENTDF_JSONL=../dataset.opentdf.jsonl npm start
```

### Configure in Cursor

In Cursor, add a **Custom MCP** provider pointing to this process (STDIO). Once connected, tools
`opentdf.search` and `opentdf.get` will be available, and resources `opentdf://list` and
`opentdf://page/{id}` can be fetched by the LLM.

### Notes

- The server performs a simple fuzzy search. For production, you can precompute embeddings and
  use a vector index — simply load your own ranking function in `server.ts`.
