# streaik-mcp-catalog

[`catalog.json`](catalog.json) bundles complete `server.json` documents in its `servers` array. Each document uses the [MCP Registry server schema](https://static.modelcontextprotocol.io/schemas/2025-10-17/server.schema.json), a deployment-independent name, and a Streamable HTTP remote. The reserved `https://default-mcp-host.invalid` origin keeps the documents valid without claiming a live endpoint. The [Streaik registry](../streaik-mcp-registry/README.md) replaces that origin with the configured MCP base URL, retaining the route and any deployment prefix.

Remote headers describe the [header-auth runtime](../streaik-mcp-servers/README.md). OpenAI uses a `Bearer {openai_api_key}` template with a required secret variable. Gemini and Anthropic use required secret header inputs directly. Never put real values, secret defaults, or upstream provider URLs in this catalog. The Entra runtime does not use these header definitions.

Run `node --test` in this directory to check the catalog documents and credential metadata without running either service. Keep each remote path in sync with the corresponding tool route when adding or changing a default. This repository does not run tools, serve discovery, or accept user publications.
