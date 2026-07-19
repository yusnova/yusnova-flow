# yusnova-flow

Playwright + TypeScript test automation with **codegen:agent** and an agentic **stlc:orchestrator** pipeline.

```text
yusnova-flow/
├── automation/    # tests, POM, STLC, dashboard, MCP
├── frontend/      # optional local demo UI (booking)
└── backend/       # optional local demo API handlers
```

All `npm` commands below run from **`automation/`** unless noted.

## Contents

- [Quick start](#quick-start)
- [Run STLC (interactive)](#run-stlc-interactive)
- [Core commands](#core-commands)
- [Dashboard vs CLI](#dashboard-vs-cli)
- [Environment](#environment)
- [Layout (automation)](#layout-automation)
- [STLC pipeline](#stlc-pipeline)
- [CI](#ci)
- [Debug](#debug)
- [License](#license)

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

Point `.env` at localhost (`DEMO_BASE_URL`, `DEMO_API_BASE_URL`, `DEMO_SKIP_AUTH=true`), then use the interactive STLC flow below.

---

## Run STLC (interactive)

From `automation/`:

```bash
npm run stlc:orchestrator
```

You get a guided setup (no long flag lists required):

| Step | Prompt | What you enter |
|------|--------|----------------|
| 1 | **Target page URL** | Live page to analyse (e.g. `http://localhost:3000`) |
| 2 | **Domain name** | Feature folder under `suites/` and `domains/` |
| 3 | **Page class name** | Name for the generated Page Object |
| 4 | **Requirement file** | Optional path to AC markdown — leave empty to auto-generate from the page |
| 5 | **Run Playwright tests after generation?** | `N` = design + codegen only · `Y` = also execute + triage |
| 6 | **Codegen options** | Overwrite existing files? · Show browser during generation? |

Then a **Summary** is printed (URL, domain, page, pipeline, LLM on/off). Confirm with `Y` to start.

After confirmation the pipeline runs phases such as:

1. Analysing requirements…
2. Building risk-based test strategy…
3. Designing test cases…
4. Reviewing test design (coverage & duplicates)…
5. Generating POM, fixture, and spec…
6. Validating generated code conventions…
7. *(optional)* Executing Playwright tests… → Triaging failures…
8. Computing quality gate recommendation…

Outputs land under `tmp/stlc/{runId}/` plus generated files in `pages/`, `domains/`, and `suites/`.

For flags and advanced use: `npm run stlc:orchestrator -- --help`.

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
| `stlc:orchestrator` | Requirements, design coverage, quality report, optional test run |

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

**POM:** page class in `pages/`, fixture in `domains/{feature}/`, specs import `@domains/...`. Mark hand-written tests with `// @stlc:manual` so overwrite keeps them.

---

## STLC pipeline

Interactive flow is the default path — see [Run STLC (interactive)](#run-stlc-interactive).

Phases (generate-only vs full run):

| Phase | Always | With “run tests = Yes” |
|-------|--------|-------------------------|
| Requirements → planning → design → review | ✓ | ✓ |
| Codegen + convention validate | ✓ | ✓ |
| Execution + triage | | ✓ |
| Quality reporting | ✓ | ✓ |

Requirements are **opt-in** (wizard step 4, or `--requirement` / `--requirement-file`). Unrelated files under `requirements/` are ignored.

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
