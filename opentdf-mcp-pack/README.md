# OpenTDF MCP Pack

A complete, reproducible pipeline to **build a comprehensive JSONL corpus** from the latest OpenTDF docs and GitHub source code, **and expose it to Cursor (or any MCP-compatible host)** via a lightweight MCP server.

> You control when the crawl runs, and you keep the data local. This pack includes a builder script and a ready-to-run MCP server that reads the generated `dataset.opentdf.jsonl`.

## What you get

- **`scripts/opentdf_corpus_builder.py`** — crawler/ingestor that emits a clean JSONL with consistent metadata & chunking.
- **`mcp-server/`** — a small TypeScript MCP server that serves the JSONL as MCP **resources** and **tools** (search & fetch).
- **`config.yml`** — default config for the builder (domains, repo allowlist, chunk sizes, file filters).
- **`dataset.opentdf.sample.jsonl`** — a tiny sample showing the JSONL schema; replace with your real build.
- **`LICENSE-NOTICE.txt`** — redistribution notes & automatic attribution guidance.

## Quick start

1) **Install the crawler deps** (Python 3.10+ recommended):

```bash
python -m venv .venv && source .venv/bin/activate  # or use your preferred environment manager
pip install -r scripts/requirements.txt
```

2) **(Optional) Set a GitHub token** for higher rate limits:

```bash
export GITHUB_TOKEN=ghp_your_token_here
```

3) **Build the corpus** (docs + GitHub, latest by default):

```bash
python scripts/opentdf_corpus_builder.py   --out dataset.opentdf.jsonl   --config config.yml
```

The script will:
- crawl **OpenTDF docs** navigation and/or sitemap to include _Welcome, Getting Started, Architecture, Components & Services, SDK (Overview/Managing Policy/Creating TDFs/Making Authorization Decisions), OpenAPI Clients, Specification (Concepts/Protocol/Schema), Appendix, Release Notes._
- enumerate **all public repos in the `opentdf` organization** via the GitHub API and ingest source files (filterable by extension/size in `config.yml`).

4) **Run the MCP server for Cursor** (Node 18+ recommended):

```bash
cd mcp-server
npm install
npm run build
OPENTDF_JSONL=../dataset.opentdf.jsonl npm start
```

Then configure Cursor to connect to this server as an MCP provider (STDIO). The server exposes:
- **Resources** like `opentdf://page/<id>` and a `opentdf://list` index
- **Tools**: `opentdf.search` (keyword search) and `opentdf.get` (fetch by id)

See `mcp-server/README` section below for details.

---

## JSONL format (schema)

Each line is a JSON object with the following **stable fields**:

```json
{
  "id": "string",                        // stable unique id (source+path+hash+chunk)
  "source_type": "docs|repo|openapi|release",
  "title": "string|null",
  "section": "string|null",
  "url": "string|null",                  // for docs/openapi/release
  "repo": "string|null",                 // e.g. opentdf/platform
  "path": "string|null",                 // path within repo
  "commit": "string|null",               // default branch commit sha when ingested
  "license": "string|null",              // SPDX id if known (e.g., BSD-3-Clause-Clear, CC-BY-SA-4.0)
  "version": "string|null",              // e.g., spec VERSION file or package version if available
  "fetched_at": "ISO-8601 timestamp",
  "attribution": "string|null",          // plain text attribution/credit line
  "content": "string",                   // chunk text (cleaned, normalized)
  "content_type": "text|code|markdown|json|proto",
  "chunk_index": 0,
  "chunk_count": 1,
  "approx_tokens": 1234,                 // rough estimate unless --use-tiktoken is enabled
  "hash": "sha256(content)"
}
```

### Chunking
- Docs pages are **structure-chunked** around headings and size thresholds.
- Code files are **line-chunked** (size-aware) and keep code blocks intact where possible.
- OpenAPI docs (from the generated `docs/openapi` in `opentdf/platform`) are ingested as individual operations/sections.
- A **deterministic `id`** is produced from `(source, path/url, commit or crawl date, chunk_index)`.

### Licenses
- OpenTDF **platform** and most code repositories are **BSD-3-Clause-Clear** licensed (redistribution permitted). The builder queries each repo’s license automatically. citeturn11view0
- The **docs site** sources (`opentdf/docs` repo) are **CC‑BY‑SA‑4.0** (requires attribution & share-alike for derivative redistributions). The builder will embed attribution lines per entry and emit an `ATTRIBUTION.txt`. citeturn14view0

> **Be sure to keep `ATTRIBUTION.txt` with any redistributed dataset.**

### What counts as “latest”?
- **Docs**: fetched from `https://opentdf.io` at crawl time (the site currently organizes content under: *Welcome*, *Getting Started*, *Architecture*, *Components and Services*, *SDK*, *OpenAPI Clients*, *Specification*, *Appendix*, *Release Notes*). citeturn1view0
- **GitHub**: default branch `HEAD` commit for each repo in org `opentdf`, plus recent **Releases** (e.g., the `platform` repo shows latest release `service: v0.11.3` on **Nov 7, 2025**). citeturn16view0

---

## MCP server

The server loads `dataset.opentdf.jsonl` (or `OPENTDF_JSONL`) and exposes:

- **Resources**
  - `opentdf://list` – a paginated index of IDs/titles
  - `opentdf://page/{id}` – returns the text for a single chunk
- **Tools**
  - `opentdf.search(query, limit=20)` – keyword search over title/section/content (simple TF‑IDF fallback; plug in embeddings if you like)
  - `opentdf.get(id)` – fetch an entry by id

This is enough for Cursor to pull context on-demand.

---

## Safety and scope

- The builder **obeys `robots.txt`** and uses polite delays.
- Binary/large files are excluded by default; customize via `config.yml`.
- You’ll find OpenAPI endpoints documented in the docs navigation (Authorization, Entity Resolution, KAS, Policy, Well-known), which the builder will ingest from the docs site and/or generated OpenAPI tables in `opentdf/platform`. citeturn6view0turn18view0

## References
- OpenTDF docs site (nav & pages): *Welcome to OpenTDF Docs*, *Getting Started*, *Architecture*, *Components & Services*, *SDK*, *OpenAPI Clients*, *Specification*, *Appendix*, *Release Notes*. citeturn1view0
- Example deep page: **Architecture** overview and core components. citeturn3view0
- **Components & Services** index (Authorization, Policy, ERS, KAS, CLI). citeturn4view0
- **SDK** section & languages. citeturn5view0
- **OpenAPI Clients** nav: authorization, entityresolution, kas, policy, wellknownconfiguration. citeturn6view0
- **Spec** overview and navigation (Concepts/Protocol/Schema). citeturn7view0
- **Appendix → Feature Matrix.** citeturn8view0
- **Release Notes** top page. citeturn9view0
- GitHub **organization repositories** overview (licenses, languages, recent activity). citeturn16view0

