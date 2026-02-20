# CLAUDE.md — notebook-ai

## Rules

- Playwright: only launch when the user explicitly requests it. Never start Playwright proactively for testing.
- notebook-ai uses ports **3000** (Vite frontend) and **3002** (backend API). Restart only needs to handle these two ports. Use `./restart.sh` to restart.

