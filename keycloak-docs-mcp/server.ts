// server.ts — ESM + MCP SDK v1.21.x + Zod raw shapes + stdio
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import fs from "fs";
import readline from "readline";
import { z } from "zod";

type Rec = {
    id: string;
    title: string;
    section_path: string[];
    url: string;
    guide: "server_admin" | "admin_rest";
    content_markdown: string;
    links?: { related_api?: any[]; related_guide?: any[] };
};

// ---- env + type narrowing ---------------------------------------------------
const DATA = process.env.KEYCLOAK_DOCS_JSONL;
if (!DATA) {
    console.error("ERROR: Set KEYCLOAK_DOCS_JSONL to your merged JSONL path.");
    process.exit(1);
}
const DATA_PATH: string = DATA; // safely narrowed

// ---- iterator over JSONL (robust to single-line concatenation) -------------
async function* iter(): AsyncGenerator<Rec> {
    const { readFile } = await import("fs/promises");

    const text: string = await readFile(DATA_PATH, { encoding: "utf-8" });

    // Sanitize BOM, zero-width, and control characters that can break JSON parsing
    const s = text
        .replace(/\uFEFF/g, "")
        .replace(/[\u200B\u200C\u200D\u2060]/g, "")
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");

    const n = s.length;

    // Find end index of a JSON object starting at `start` (which must be '{')
    function findObjectEnd(start: number): number {
        let depth = 0;
        let inString = false;
        let escaped = false;

        for (let i = start; i < n; i++) {
            const ch = s.charAt(i);

            if (inString) {
                if (escaped) {
                    escaped = false;
                } else if (ch === "\\") {
                    escaped = true;
                } else if (ch === "\"") {
                    inString = false;
                }
                continue;
            }

            if (ch === "\"") {
                inString = true;
                continue;
            }
            if (ch === "{") depth++;
            else if (ch === "}") {
                depth--;
                if (depth === 0) return i; // inclusive end of the object
            }
        }
        return -1; // not found
    }

    let i = 0;
    while (i < n) {
        // Skip whitespace between objects
        while (i < n && /\s/.test(s.charAt(i))) i++;

        if (i >= n) break;

        // Next object start
        const start = s.indexOf("{", i);
        if (start === -1) break;

        const end = findObjectEnd(start);
        if (end === -1) {
            console.error("[docs] unmatched JSON object starting near index", start);
            break;
        }

        const chunk = s.slice(start, end + 1);
        try {
            yield JSON.parse(chunk) as Rec;
        } catch {
            console.error("[docs] skipped malformed JSON segment (starts with):", chunk.slice(0, 120));
            // continue
        }

        i = end + 1; // continue scanning after this object
    }
}

// ---- simple keyword search --------------------------------------------------
async function searchDocs(query: string, k = 5) {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    const scored: { r: Rec; score: number }[] = [];

    try {
        for await (const r of iter()) {
            // Validate required fields
            if (!r || !r.id || !r.title) continue;

            const text = (r.title + " " + (r.section_path || []).join(" / ") + " " + (r.content_markdown || "")).toLowerCase();
            let s = 0;
            for (const term of terms) if (text.includes(term)) s += 1;
            if (s > 0) scored.push({ r, score: s });
        }
    } catch (err) {
        // Log to stderr so it doesn't interfere with JSON output
        console.error("[searchDocs] error:", err instanceof Error ? err.message : String(err));
        throw err;
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, Math.max(1, k)).map(({ r, score }) => ({
        id: String(r.id || ""),
        title: String(r.title || ""),
        url: String(r.url || ""),
        guide: r.guide || "server_admin",
        score,
        section_path: Array.isArray(r.section_path) ? r.section_path : [],
        snippet: String(r.content_markdown || "").slice(0, 240) + (r.content_markdown && r.content_markdown.length > 240 ? "…" : ""),
        links: r.links ?? {},
    }));
}

async function getDoc(id: string) {
    for await (const r of iter()) {
        if (r.id === id) return r;
    }
    return null;
}

// ---- MCP server -------------------------------------------------------------
const server = new McpServer({ name: "keycloak-docs-mcp", version: "1.0.0" });

// Use ZodRawShape (plain object), not z.object(...)
server.registerTool(
    "ping",
    {
        title: "Ping",
        description: "Return 'pong' to verify visibility.",
        inputSchema: {}, // <-- ZodRawShape: empty shape
    },
    async () => ({
        content: [{ type: "text", text: "pong" }],
        structuredContent: { pong: true },
    }),
);

server.registerTool(
    "docs_search",
    {
        title: "Search Keycloak docs (merged)",
        description: "Search the merged Server Admin Guide + Admin REST API JSONL.",
        inputSchema: {
            query: z.string().min(1),
            k: z.number().int().min(1).max(20).optional(),
        },
    },
    // 👇 add `_extra` and allow `k?: number | undefined`
    async (args: { query: string; k?: number | undefined }, _extra: unknown) => {
        try {
            const results = await searchDocs(args.query, args.k ?? 5);
            // Sanitize results to ensure clean JSON
            const sanitized = results.map(r => ({
                id: String(r.id || ""),
                title: String(r.title || ""),
                url: String(r.url || ""),
                guide: String(r.guide || "server_admin"),
                score: Number(r.score || 0),
                section_path: Array.isArray(r.section_path) ? r.section_path.map(String) : [],
                snippet: String(r.snippet || ""),
                links: typeof r.links === "object" && r.links !== null ? r.links : {},
            }));
            const jsonText = JSON.stringify(sanitized, null, 2);
            // Ensure no trailing characters
            return {
                content: [{ type: "text", text: jsonText.trim() }],
                structuredContent: { results: sanitized },
            };
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            return {
                content: [{ type: "text", text: JSON.stringify({ error: errorMsg }, null, 2) }],
                structuredContent: { error: errorMsg },
            };
        }
    }
);

server.registerTool(
    "docs_get",
    {
        title: "Get doc by id",
        description: "Return a full document chunk by id.",
        inputSchema: {
            id: z.string().min(1),
        },
    },
    // 👇 add `_extra` to match SDK handler type
    async (args: { id: string }, _extra: unknown) => {
        const result = await getDoc(args.id);
        if (!result) return { content: [{ type: "text", text: `Not found: ${args.id}` }] };
        return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
            structuredContent: result,
        };
    }
);


// stdio transport for Cursor
const transport = new StdioServerTransport();
await server.connect(transport);
