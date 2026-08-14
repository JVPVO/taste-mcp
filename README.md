# ai coding agents don't have taste.

A basic, stateless MCP that agents call when making decisions, backed by your curated development bookmarks.

So it's your fault now when things go wrong.

![Taste library interface](screenshots/commonplace-dark.png)

## MCP

The MCP server is available over Streamable HTTP at:

```text
http://localhost:8787/mcp
```

Point an MCP client or coding agent at that URL. The endpoint implements the final `2026-07-28` protocol and also accepts stateless legacy clients. Every request receives a fresh server instance: there is no session ID, sticky routing, or per-client memory.

Agents can use:

- `consult_taste` to search the library for a development decision;
- `get_taste_item` to inspect one exact bookmark;
- `list_taste_categories` to discover the available taxonomy;
- `taste://library` and `taste://items/{itemId}` as read-only resources;
- `make_tasteful_decision` as a reusable decision prompt.

The MCP surface is intentionally read-only. Curation and human review stay in the Web UI.

For access from another machine, expose the app and explicitly allow the hostname or IP used by MCP clients:

```dotenv
APP_HOST=0.0.0.0
MCP_ALLOWED_HOSTS=localhost,127.0.0.1,192.168.1.5
```

The `.env` file is optional. Without an API key, the enrichment flow runs in demo mode.

## Configure AI enrichment

Add your DeepSeek API key to `.env`:

```dotenv
DEEPSEEK_API_KEY=your-key
```

- Docker binds the application to `127.0.0.1` by default.
- The application currently has no authentication. Do not bind it to a public interface unless it is protected by an authenticated HTTPS proxy.
- Public GitHub pages are read without a GitHub token. Private repositories are not supported.

Your bookmarks and reviews remain in your local SQLite database. Back up the Docker volume or the local `data/` directory before moving installations.
