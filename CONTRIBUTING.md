# Contributing to HydraBot

Thanks for your interest in contributing to HydraBot! This guide will help you get started.

## Development Environment Setup

1. **Fork and clone the repository**
   ```bash
   git clone https://github.com/YOUR_USERNAME/hydrabot.git
   cd hydrabot
   ```

2. **Install dependencies**
   ```bash
   # Run the installer (installs Node.js 22, Python deps, Claude CLI, etc.)
   sudo HYDRABOT_DIR=$(pwd) bash deploy/install.sh
   ```

3. **Set up a test bot**
   ```bash
   cp -r bots/template bots/testbot
   cp bots/template/.env.example bots/testbot/.env
   # Edit bots/testbot/.env with your test bot token
   npm install --prefix bots/testbot
   ```

4. **Start the Circus API**
   ```bash
   sudo systemctl start circus-api
   curl http://localhost:6200/health  # Should return {"status": "ok"}
   ```

## Pull Request Guidelines

- **Open an issue first** for large changes or new features. Discuss the approach before writing code.
- **Keep PRs focused** — one feature or fix per PR. Smaller PRs are easier to review and merge.
- **Write clear commit messages** — describe what changed and why, not how.
- **Test your changes** — run your bot locally and verify functionality.
- **Update docs** if you change APIs, add features, or modify configuration.

## Code Style

- **ESM modules** — use `import`/`export`, not `require`.
- **Async/await** — prefer async/await over raw promises or callbacks.
- **No semicolons** (optional) — the codebase omits semicolons; follow the existing style.
- **Descriptive variable names** — prefer clarity over brevity.
- **Error handling** — catch errors and log them meaningfully. Don't let bots crash silently.

## Architecture Documentation

Before making structural changes, read the architecture docs:

- `docs/architecture.md` — system overview, layer responsibilities
- `docs/ai-iq.md` — memory system design
- `docs/configuration.md` — environment variables and secrets

## Questions?

Open an issue or reach out in the Discussions tab. We're happy to help!
