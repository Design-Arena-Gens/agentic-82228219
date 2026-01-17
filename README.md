# agentic

Terminal-first productivity agent with an optional Next.js landing page. Tasks live in a local JSON store at `~/.agentic/` with an audit trail for every action.

## Requirements

- Node.js 18+
- npm 9+

## Setup

```bash
npm install
npm run build   # builds CLI + Next.js site
npm test        # quick smoke test of CLI behaviour
```

Run the CLI directly:

```bash
node dist/agent.cjs --help
```

For development you can use the TypeScript sources via ts-node:

```bash
node --loader ts-node/esm src/cli/index.ts add "Finish slides" --due 2026-02-01
```

Launch the optional docs site:

```bash
npm run dev
```

## CLI Overview

- `agent add "Title" --due 2024-07-01 --p high --tags work,deep`
- `agent list --status open`
- `agent view 5`
- `agent done 5`
- `agent snooze 5 +3d`
- `agent export --format csv --yes`

Use `agent --first-run` for a guided primer. The CLI keeps responses under 40 lines unless `--verbose` is supplied. All exports and imports require explicit consent (`--yes` or interactive confirmation).

## Deploy

The Next.js site is deploy-ready on Vercel:

```bash
npm run build
vercel deploy --prod --yes --token $VERCEL_TOKEN --name agentic-82228219
```
