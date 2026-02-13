# GitHub MCP Server (Node + TypeScript)

Docker-friendly Model Context Protocol server that lets Codex create and manage GitHub repositories with a single personal access token (PAT).

## Features
- `create_repository`: create a repo under the authenticated user or a given org.
- `upsert_file`: create/update files with commit messages on a branch.
- `create_branch`: branch off any ref (defaults from `main`).
- `whoami`: show the PAT identity.

## Requirements
- Node 20+ (or Docker).
- GitHub PAT in `GITHUB_TOKEN` with at least `repo` scope (or `public_repo` if you only touch public repos).
- For org repos, ensure the token can create repos in that org and that SSO/org policies allow it.

## Local dev
```bash
npm install
npm run dev
```

## Docker build and run
```bash
docker build -t github-mcp .
docker run -i --rm -e GITHUB_TOKEN=... github-mcp
```

## Wire up to Codex (VS Code)
The server speaks MCP over stdio. Configure Codex to start it with:

```json
{
  "mcpServers": {
    "github-mcp": {
      "command": "docker",
      "args": ["run", "-i", "--rm", "-e", "GITHUB_TOKEN", "github-mcp"]
    }
  }
}
```

Important: use `"-e", "GITHUB_TOKEN"` (without `=${GITHUB_TOKEN}`) when the command is launched directly (non-shell), so Docker forwards the host `GITHUB_TOKEN` value correctly.

## Notes and safety
- The server uses your PAT directly; treat it like a password.
- Actions are direct commits; there is no local clone.
- If you need organization SAML, approve the PAT for that org first.

## Extending
- Add tools via `server.tool(name, { description, inputSchema }, handler)` in `src/index.ts`.
