# yusnova-flow

Playwright + TypeScript test automation with **codegen:agent** and an agentic **stlc:orchestrator** pipeline.

```text
yusnova-flow/
├── automation/    # tests, POM, STLC, dashboard, MCP
├── frontend/      # optional local demo UI (booking)
└── backend/       # optional local demo API handlers
```

All `npm` commands below run from **`automation/`** unless noted.

---

## Quick start

```bash
git clone https://github.com/yusnova/yusnova-flow.git
cd yusnova-flow/automation
cp .env.example .env          # set URLs + credentials
npm install
npx playwright install

npm run demo:ui               # UI tests
npm run demo:api              # API tests
npm run report                # last HTML report
```

**Local booking demo** (optional):

```bash
cd ../frontend && npm install && npm run dev   # http://localhost:3000
```

With `.env` pointing at localhost (`DEMO_BASE_URL`, `DEMO_API_BASE_URL`, `DEMO_SKIP_AUTH=true`), run STLC against it:

```bash
cd ../automation
npm run stlc:orchestrator -- \
  --url http://localhost:3000 \
  --domain booking \
  --page BookingFlow \
  --overwrite --skip-human-gates --headless --no-llm
```

---

## Core commands

| Script | Purpose |
|--------|---------|
| `codegen:agent` | URL → POM + fixture + UI spec |
| `stlc:orchestrator` | Full STLC: requirements → design → codegen → review → (optional tests) → report |
| `validate:conventions -- --domain <name>` | Check POM + spec conventions (banned selectors, fixture imports) |
| `demo:ui` / `demo:api` | Run Playwright suites (`ENV=demo`) |
| `dashboard` | Local UI for runs, healing, flaky (`http://localhost:4790`) |
| `explore:bugs` | Mini-orchestrator: crawl → triage → report (`state.json` under `tmp/stlc/exploration/`) |
| `lint` / `typecheck` / `tmp:clean` | Quality & maintenance |

```bash
npm run codegen:agent
npm run stlc:orchestrator
npm run stlc:orchestrator -- --help
```

| Use | When |
|-----|------|
| `codegen:agent` | Fast POM + spec from a URL |
| `stlc:orchestrator` | Requirements, design coverage, quality report, optional `--run-tests` |

Deep dives: `automation/.cursor/skills/` (POM, API patterns, codegen, STLC, MCP/dashboard/explorer).

---

## Dashboard vs CLI

`npm run dashboard` is the local UI over shared handlers (`scripts/mcp-server/handlers.ts`). MCP (`scripts/mcp-server/server.ts`) and test-impact CLI remain in the repo for Cursor wiring / CI — they are not day-to-day npm scripts.

---

## Environment

Copy `.env.example` → `.env`. Important knobs:

| Variable | Purpose |
|----------|---------|
| `DEMO_*_URL` / `DEV_*` / `STAGING_*` | App + API base URLs (defaults stay `*.example.com`) |
| `DEMO_SKIP_AUTH` | `true` for public demos with no login (e.g. local booking) |
| `REGULAR_USER_*` / `API_REGULAR_USER_*` | UI / API credentials |
| `STLC_LLM_API_KEY` | Optional LLM for requirements/design (heuristics work without it) |
| `STLC_APP_ROOT` | Optional path to app source for API/selector scan (`../frontend`) |

---

## Layout (automation)

```text
automation/
├── bootstrap/          # env, credentials, auth setup
├── core/               # API client, fixtures, shared infra
├── domains/            # per-feature fixtures / schemas
├── pages/              # Page Objects
├── suites/             # *.ui.spec.ts / *.api.spec.ts
├── requirements/       # optional AC markdown for STLC
├── scripts/
│   ├── codegen-agent/
│   ├── stlc-orchestrator/
│   ├── explorer-agent/
│   ├── dashboard/
│   ├── mcp-server/
│   ├── validator/
│   └── shared/
├── playwright.config.ts
└── package.json
```

**Selectors:** prefer `data-testid` / `data-test` → stable `id` → role+name. Avoid dynamic IDs and hashed CSS classes.

**POM:** page class in `pages/`, fixture in `domains/{feature}/`, specs import `@domains/...`. Mark hand-written tests with `// @stlc:manual` so `--overwrite` keeps them.

---

## STLC in brief

```bash
npm run stlc:orchestrator -- \
  --url https://your-app.example/path \
  --domain myFeature \
  --page MyFeaturePage \
  --requirement-file ./requirements/example.md \
  --overwrite --skip-human-gates
```

Phases: requirements → planning → design → review → codegen → validate → (execution) → triage → reporting.

Outputs: `tmp/stlc/{runId}/state.json`, `quality-report.md`, plus POM/spec under `pages/` / `suites/` / `domains/`.

Requirements are **opt-in** (`--requirement` / `--requirement-file`). Unrelated files under `requirements/` are ignored.

---

## CI

| Workflow | Role |
|----------|------|
| `.github/workflows/stlc-pr.yml` | PR: test-impact → targeted validate + Playwright |
| `.github/workflows/stlc-nightly.yml` | Nightly full suite; healing proposals on failure (no auto-write to POM) |

```bash
npx ts-node scripts/shared/test-impact-cli.ts --base origin/main --head HEAD
```

---

## Debug

```bash
ENV=demo npx playwright test --project=ui --ui
ENV=demo npx playwright test --project=ui --debug
ENV=demo npx playwright test suites/booking/booking.ui.spec.ts --headed
```

---

## License

MIT — see [`LICENSE`](./LICENSE).

**Links:** [Playwright](https://playwright.dev/docs/intro) · skills in `automation/.cursor/skills/`
