🎉 **Congratulations — you now have a working Keycloak MCP plugin!**
Below is a **comprehensive README** you can include in your repo (e.g., `README.md`).
It explains setup, usage, prompt examples, and best practices for getting the most out of this new **Keycloak Docs MCP Tool** in Cursor.

---

# 🔑 Keycloak Docs MCP — README

## Overview

This MCP server lets you **query and browse Keycloak documentation** (Server Admin Guide + Admin REST API Reference) directly inside **Cursor** or any MCP-enabled IDE.
It provides instant, offline, cross-linked answers drawn from version **26.4.2** documentation.

---

## 🚀 Features

✅ **Full-text search** across the Server Admin Guide and Admin REST API
✅ **Retrieve detailed sections by ID** (e.g., to read entire chapters)
✅ **Offline operation** once the JSONL file is built
✅ **Cross-linked results** showing both doc and API connections
✅ **Cursor-native integration** (shows up under *Model Context Protocol > keycloak-docs*)

---

## 🧩 Prerequisites

* Node.js ≥ 20.x
* TypeScript ≥ 5.x
* Cursor (latest version)
* Built JSONL dataset (`keycloak_docs_plus_api_26.4.2.jsonl`)

---

## ⚙️ Installation

1. Clone your project folder:

   ```bash
   git clone https://github.com/yourname/keycloak-docs-mcp
   cd keycloak-docs-mcp
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Build the project:

   ```bash
   npm run build
   ```

4. Verify it runs:

   ```bash
   KEYCLOAK_DOCS_JSONL="/absolute/path/to/keycloak_docs_plus_api_26.4.2.jsonl" npm run start
   ```

   If no errors appear, the server is ready.

---

## 🔧 Configure in Cursor

Edit or create:

```
~/.cursor/mcp.json
```

Add this entry:

```json
{
  "mcpServers": {
    "keycloak-docs": {
      "command": "node",
      "args": ["dist/server.js"],
      "directory": "/absolute/path/to/keycloak-docs-mcp",
      "env": {
        "KEYCLOAK_DOCS_JSONL": "/absolute/path/to/keycloak_docs_plus_api_26.4.2.jsonl"
      }
    }
  }
}
```

Restart Cursor and go to:

> Settings → Model Context Protocol
> You should see ✅ `keycloak-docs` with three tools:

* `ping`
* `docs_search`
* `docs_get`

---

## 🧠 Available Tools

### 🟢 `ping`

Test tool to verify the connection.

```bash
@keycloak-docs.ping
```

---

### 🔍 `docs_search`

Search Keycloak documentation for a keyword or phrase.

**Parameters:**

* `query` *(string, required)* — text to search.
* `k` *(number, optional)* — number of top matches (default = 5).

**Example:**

```bash
@keycloak-docs.docs_search query="realm roles" k=5
```

**Output:**

* `id` — internal doc identifier
* `title` — section title
* `url` — direct Keycloak docs link
* `guide` — `server_admin` or `admin_rest`
* `snippet` — short preview
* `score` — relevance metric
* `links` — related API or guide sections (if any)

---

### 📄 `docs_get`

Retrieve a complete section by its ID (from search results).

**Parameters:**

* `id` *(string, required)* — the doc chunk ID

**Example:**

```bash
@keycloak-docs.docs_get id="server_admin-managing-realm-roles--chunk-001"
```

---

## 🧭 Prompt Examples

### 🧱 Basic

> “Use keycloak-docs to explain how to create and assign realm roles.”

### 🧩 Context-aware

> “Using the Keycloak Admin REST API, how can I update a client’s protocol mapper?
> Search keycloak-docs for relevant endpoints.”

### 🧮 Compare Guides

> “Search both the Server Admin Guide and Admin REST API for ‘user federation’ and summarize how they differ.”

### ⚙️ Deep Dive

> “Find where session timeout configuration is documented in Keycloak 26.4.2 and show me the JSON snippet from the Admin REST endpoint.”

### 🧰 Developer Flow

> “I’m debugging Keycloak OIDC clients — show me both the admin console configuration and the REST API endpoint docs for OIDC client updates.”

---

## 🪄 Pro Tips

1. **Start general, then drill down**

   * Use `docs_search` to locate relevant chunks.
   * Then use `docs_get` to retrieve the full details.

2. **Cross-reference API and guide**

   * Look for `links.related_api` and `links.related_guide` fields — they often bridge “how-to” and REST syntax.

3. **Stay within version 26.4.2**

   * The dataset is static for this Keycloak release, ensuring reproducible answers.

4. **Avoid stdout logs**

   * Use `console.error()` for debugging; stdout is reserved for JSON-RPC.

5. **Easily extend**

   * Add new JSONL files for newer Keycloak versions and switch the path in your `mcp.json`.

---

## 🧰 Maintenance & Updates

To rebuild the dataset (for a new Keycloak release):

```bash
python3 scripts/scrape_admin_rest_openapi.py
python3 scripts/scrape_admin_guide.py
python3 scripts/merge_jsonl.py --guide out/server_admin.jsonl --api out/admin_rest.jsonl --out out/keycloak_docs_plus_api_<VERSION>.jsonl
```

Then update your MCP `env.KEYCLOAK_DOCS_JSONL` path.

---

## 🧑‍💻 Example Workflow

1. You’re writing a Keycloak plugin in Cursor.

2. You ask:

   > “Use keycloak-docs to show me how to configure user federation with LDAP.”

3. Cursor runs:

   ```
   @keycloak-docs.docs_search query="user federation LDAP" k=3
   ```

4. You get:

   * Relevant guide sections
   * Related Admin REST API endpoints
   * Direct doc URLs for deep reading

---

## 🧾 License

MIT (or your preferred license)

---

## ❤️ Credits

Built by [Aubrey Beach, LLC](https://aubreybeach.com)
Data sourced from [Keycloak 26.4.2 Documentation](https://www.keycloak.org/docs/latest/server_admin/index.html)

---

Perfect — now that everything works, here’s the **“Prompt Cookbook Appendix”** to add at the end of your README.
This gives you (and anyone using your MCP) a library of tested, powerful prompts for various use cases.

---

## 📚 Prompt Cookbook — Keycloak MCP

Below are curated prompt examples grouped by **role** and **goal**.
Each works directly in Cursor with your new `keycloak-docs` MCP server.

---

### 👩‍💻 Developer Essentials

| Goal                             | Example Prompt                                                               |
| -------------------------------- | ---------------------------------------------------------------------------- |
| Understand how to create a realm | `@keycloak-docs.docs_search query="create realm" k=5`                        |
| Configure login themes           | `@keycloak-docs.docs_search query="custom theme login page" k=5`             |
| Integrate OIDC with a client     | `@keycloak-docs.docs_search query="OpenID Connect client configuration" k=5` |
| Learn token lifespans            | `@keycloak-docs.docs_search query="token lifespan configuration" k=5`        |
| Fetch full guide section         | `@keycloak-docs.docs_get id="server_admin-token-lifespan--chunk-001"`        |

---

### 🔐 Security & Access Control

| Goal                                 | Example Prompt                                                          |
| ------------------------------------ | ----------------------------------------------------------------------- |
| Configure roles and role mappings    | `@keycloak-docs.docs_search query="realm roles and role mappings" k=5`  |
| Manage composite roles               | `@keycloak-docs.docs_search query="composite roles" k=5`                |
| Understand fine-grained permissions  | `@keycloak-docs.docs_search query="authorization policies" k=5`         |
| Review password policy configuration | `@keycloak-docs.docs_search query="password policy" k=5`                |
| Check admin REST endpoints for users | `@keycloak-docs.docs_search query="admin rest API user management" k=5` |

---

### 🧰 Sysadmin / DevOps

| Goal                      | Example Prompt                                                                   |
| ------------------------- | -------------------------------------------------------------------------------- |
| Run Keycloak in HA mode   | `@keycloak-docs.docs_search query="high availability cluster configuration" k=5` |
| Use environment variables | `@keycloak-docs.docs_search query="environment variable reference" k=5`          |
| Configure HTTPS / TLS     | `@keycloak-docs.docs_search query="https setup" k=5`                             |
| Backup and restore realms | `@keycloak-docs.docs_search query="realm export import" k=5`                     |
| Monitor with Prometheus   | `@keycloak-docs.docs_search query="prometheus metrics" k=5`                      |

---

### 🧑‍💼 Identity / IAM Architect

| Goal                            | Example Prompt                                                            |
| ------------------------------- | ------------------------------------------------------------------------- |
| Compare realm vs client roles   | `Use keycloak-docs to explain realm roles vs client roles differences.`   |
| Explore user federation options | `@keycloak-docs.docs_search query="user federation LDAP sync" k=5`        |
| Set up identity brokering       | `@keycloak-docs.docs_search query="identity brokering configuration" k=5` |
| Customize mappers               | `@keycloak-docs.docs_search query="protocol mappers" k=5`                 |
| Add SAML identity provider      | `@keycloak-docs.docs_search query="saml identity provider" k=5`           |

---

### 🧑‍🔧 Troubleshooting & Maintenance

| Scenario                       | Example Prompt                                                        |
| ------------------------------ | --------------------------------------------------------------------- |
| Failed login loops             | `@keycloak-docs.docs_search query="failed login troubleshooting" k=5` |
| “Invalid client secret” errors | `@keycloak-docs.docs_search query="client secret invalid" k=5`        |
| Database migration issues      | `@keycloak-docs.docs_search query="database migration upgrade" k=5`   |
| Missing roles after import     | `@keycloak-docs.docs_search query="realm import role missing" k=5`    |
| Cluster node out of sync       | `@keycloak-docs.docs_search query="infinispan cluster sync" k=5`      |

---

### 🔍 Hybrid Search Prompts (Guide + REST)

| Objective                                      | Prompt                                                                                                                |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Find both REST and guide info on role creation | `Use keycloak-docs to show both the Admin REST API endpoint and Server Admin Guide instructions for creating a role.` |
| Compare REST and console config for sessions   | `@keycloak-docs.docs_search query="admin rest session management" k=5`                                                |
| Get API example for user creation              | `@keycloak-docs.docs_search query="POST /admin/realms/{realm}/users" k=5`                                             |
| Fetch full REST chunk                          | `@keycloak-docs.docs_get id="admin_rest-create-user--chunk-000"`                                                      |

---

### 🧩 Advanced Prompt Patterns

| Pattern               | Example                                                                                                |
| --------------------- | ------------------------------------------------------------------------------------------------------ |
| **Explain + Example** | “Use keycloak-docs to explain how to configure an LDAP provider and include the REST payload example.” |
| **Compare Concepts**  | “Use keycloak-docs to compare service accounts vs admin clients.”                                      |
| **Show Steps**        | “Show me the step-by-step process to enable Kerberos authentication in Keycloak.”                      |
| **Cross-reference**   | “Search keycloak-docs for ‘user attributes’ and show related API sections that modify them.”           |
| **Verify Config**     | “How do I confirm my OIDC client is using the correct redirect URI? Search keycloak-docs.”             |

---

### 🧠 Power Tips

* Use **natural questions** — Cursor automatically calls `docs_search`.
* To get deeper context, copy the `"id"` from a search result and run `docs_get`.
* Combine searches:

  > “Search keycloak-docs for ‘email verification’ and ‘SMTP configuration’, then summarize setup steps.”
* Ask Cursor:

  > “Use keycloak-docs to explain, in plain English, what happens when a user logs in via LDAP.”

---

### 🧩 Example “Combo Query” Conversation

```bash
You:  Use keycloak-docs to show how to configure LDAP federation.
Cursor: (runs @keycloak-docs.docs_search query="LDAP federation" k=5)
You:  Great — now show me the full text of chunk #2.
Cursor: (runs @keycloak-docs.docs_get id="server_admin-ldap-provider--chunk-002")
```