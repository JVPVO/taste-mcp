# ai coding agents don't have taste. you do (maybe).

A basic, stateless MCP that agents call when making decisions, backed by your curated development bookmarks.

So it's your fault now when things go wrong.

![Taste library interface](screenshots/commonplace-dark.png)

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
