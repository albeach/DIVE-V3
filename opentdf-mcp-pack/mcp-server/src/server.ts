import fs from "fs";
import readline from "readline";
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { search as fuzzySearch } from "fast-fuzzy";

type Entry = {
  id: string;
  source_type: string;
  title?: string | null;
  section?: string | null;
  url?: string | null;
  repo?: string | null;
  path?: string | null;
  commit?: string | null;
  license?: string | null;
  version?: string | null;
  fetched_at?: string | null;
  attribution?: string | null;
  content: string;
  content_type: "text" | "code" | "markdown" | "json" | "proto";
  chunk_index: number;
  chunk_count: number;
  approx_tokens?: number | null;
  hash?: string | null;
};

const DATASET = process.env.OPENTDF_JSONL || "../dataset.opentdf.jsonl";

async function loadJsonl(path: string): Promise<Entry[]> {
  if (!fs.existsSync(path)) {
    throw new Error(`JSONL not found: ${path}`);
  }
  const fileStream = fs.createReadStream(path, { encoding: "utf-8" });
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });
  const out: Entry[] = [];
  for await (const line of rl) {
    const t = line.trim();
    if (!t) continue;
    try {
      const obj = JSON.parse(t) as Entry;
      out.push(obj);
    } catch {
      // skip bad line
    }
  }
  return out;
}

function toText(e: Entry): string {
  const headerParts: string[] = [];
  if (e.title) headerParts.push(`# ${e.title}`);
  if (e.section) headerParts.push(`## ${e.section}`);
  if (e.url) {
    headerParts.push(`Source: ${e.url}`);
  } else if (e.repo && e.path) {
    headerParts.push(`Source: https://github.com/${e.repo}/blob/${e.commit ?? "HEAD"}/${e.path}`);
  }
  if (e.attribution) {
    headerParts.push(`Attribution: ${e.attribution}`);
  }
  headerParts.push(""); // blank line before content
  return `${headerParts.join("\n")}\n${e.content}`;
}

async function main() {
  const entries = await loadJsonl(DATASET);
  console.error(`[mcp] loaded ${entries.length} entries from ${DATASET}`);

  const server = new McpServer({
    name: "opentdf-corpus",
    version: "0.1.0",
  });

  // ---------- Resources ----------

  // Index/list resource
  server.registerResource(
    "opentdf-list",
    new ResourceTemplate("opentdf://list", { list: undefined }),
    {
      title: "OpenTDF corpus index",
      description: "Index of OpenTDF corpus entries (sampled).",
    },
    async (uri) => {
      const sample = entries.slice(0, 50).map((e: Entry) => ({
        id: e.id,
        title: e.title ?? null,
        section: e.section ?? null,
        source_type: e.source_type,
        url: e.url ?? null,
        repo: e.repo ?? null,
        path: e.path ?? null,
      }));

      return {
        contents: [
          {
            uri: uri.href,
            text: JSON.stringify(
              {
                count: entries.length,
                sample,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  // Single-page resource
  server.registerResource(
    "opentdf-page",
    new ResourceTemplate("opentdf://page/{id}", { list: undefined }),
    {
      title: "OpenTDF corpus entry",
      description: "Single OpenTDF corpus chunk by ID.",
    },
    async (uri, params) => {
      const id = (params["id"] ?? "") as string;
      const e = entries.find((x: Entry) => x.id === id);
      if (!e) {
        return {
          contents: [
            {
              uri: uri.href,
              text: `Not found: ${id}`,
            },
          ],
        };
      }
      return {
        contents: [
          {
            uri: uri.href,
            text: toText(e),
          },
        ],
      };
    },
  );

  // ---------- Tools ----------

  // Search tool
  server.registerTool(
    "opentdf.search",
    {
      title: "Search OpenTDF corpus",
      description: "Fuzzy search over the OpenTDF JSONL corpus.",
      inputSchema: {
        query: z.string(),
        limit: z.number().int().min(1).max(100).optional(),
        source_type: z.enum(["docs", "repo", "openapi", "release"]).optional(),
      },
      outputSchema: {
        results: z.array(
          z.object({
            id: z.string(),
            title: z.string().nullable().optional(),
            section: z.string().nullable().optional(),
            source_type: z.string(),
            url: z.string().nullable().optional(),
            repo: z.string().nullable().optional(),
            path: z.string().nullable().optional(),
          }),
        ),
      },
    },
    async ({ query, limit = 20, source_type }) => {
      const corpus = source_type
        ? entries.filter((e: Entry) => e.source_type === source_type)
        : entries;

      const ranked: Entry[] = fuzzySearch(
        query,
        corpus,
        {
          keySelector: (e: Entry) =>
            `${e.title ?? ""} ${e.section ?? ""} ${e.content}`,
        },
      ).slice(0, limit);

      const results = ranked.map((e: Entry) => ({
        id: e.id,
        title: e.title ?? null,
        section: e.section ?? null,
        source_type: e.source_type,
        url: e.url ?? null,
        repo: e.repo ?? null,
        path: e.path ?? null,
      }));

      const output = { results };
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(output, null, 2),
          },
        ],
        structuredContent: output,
      };
    },
  );

  // Get-by-id tool
  server.registerTool(
    "opentdf.get",
    {
      title: "Get OpenTDF corpus entry",
      description: "Fetch a specific OpenTDF corpus chunk by ID.",
      inputSchema: {
        id: z.string(),
      },
      outputSchema: {
        content: z.string(),
      },
    },
    async ({ id }) => {
      const e = entries.find((x: Entry) => x.id === id);
      if (!e) {
        const msg = `Not found: ${id}`;
        return {
          content: [{ type: "text", text: msg }],
          structuredContent: { content: msg },
        };
      }
      const text = toText(e);
      return {
        content: [{ type: "text", text }],
        structuredContent: { content: text },
      };
    },
  );

  // ---------- Transport ----------

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
