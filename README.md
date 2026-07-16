# 🎭 Playwright — yusnova-flow

A lean, team-friendly guide for getting our Playwright + TypeScript test suite running locally, generating tests with **codegen:agent**, and running the full **stlc:orchestrator** agentic pipeline.

All automation code lives under **`automation/`**. Run every `npm` command from that folder unless noted otherwise.

---

## Table of Contents

- [Prerequisites](#prerequisites)
- [Clone & Project Setup](#clone--project-setup)
- [Open the Project](#open-the-project)
- [Install & Run](#install--run)
- [Environment Variables](#environment-variables)
- [Project Structure](#project-structure)
- [Page Object Model (POM)](#page-object-model-pom)
- [Selector (Locator) Standards](#selector-locator-standards)
- [codegen:agent — DOM → POM + Spec](#codegenagent--dom--pom--spec)
- [stlc:orchestrator — Agentic STLC Pipeline](#stlcorchestrator--agentic-stlc-pipeline)
- [CI/CD — PR & Nightly Pipelines](#cicd--pr--nightly-pipelines)
- [MCP Server, Quality Dashboard & Bug-Hunter Explorer](#mcp-server-quality-dashboard--bug-hunter-explorer)
- [Validation, Lint & Unit Tests](#validation-lint--unit-tests)
- [Debugging](#debugging)
- [License](#license)
- [Helpful Links](#helpful-links)

---

## Prerequisites

> macOS examples below use Homebrew. On Linux/Windows, use equivalent package managers.

1. **Git** — [https://git-scm.com/downloads](https://git-scm.com/downloads)
2. **Node.js (LTS ≥ 18)** — [https://nodejs.org/en/download/](https://nodejs.org/en/download/)
3. **Visual Studio Code** (recommended) — [https://code.visualstudio.com/download](https://code.visualstudio.com/download)
4. **Playwright browsers** — installed via `npx playwright install` (see [Install & Run](#install--run))

Optional (API client generation only):

```bash
brew install openapi-generator
```

---

## Clone & Project Setup

Create or choose a folder and clone the repository:

```bash
cd ~/Desktop/dev
git clone https://github.com/yusnova/yusnova-flow.git
cd yusnova-flow/automation
```

Copy environment variables and install dependencies:

```bash
cp .env.example .env
npm install
npx playwright install
```

> Fill in `.env` with credentials and base URLs for your target environment (see [Environment Variables](#environment-variables)).

---

## Open the Project

1. **VS Code → File → Open Folder…**
2. Select the **`yusnova-flow`** repo root (or open `automation/` directly).

Recommended: install the **Playwright Test for VS Code** extension.

---

## Install & Run

All commands run from **`automation/`**:

```bash
cd automation
npm install
npx playwright install
```

### All npm scripts at a glance

Plain JSON doesn't support comments, so descriptions live here instead of inline in `package.json`:

| Script | What it does |
|--------|---------------|
| `demo:api` | Run the API test suite against the demo environment |
| `demo:ui` | Run the UI test suite against the demo environment (headless Chrome) |
| `report` | Open the last Playwright HTML report in a browser |
| `codegen:agent` | Generate a POM + spec file from a live URL (DOM scan + Playwright codegen) |
| `stlc:orchestrator` | Run the full agentic STLC pipeline: requirements → design → codegen → review → (execution) → reporting |
| `validate` | Check a domain's POM/spec files against naming & fixture-wiring conventions |
| `healing:review` | Human-in-the-loop review of self-healing selector proposals — the only place that writes fixes to POM/spec files |
| `healing:from-log` | Build self-healing proposals from a CI Playwright failure log (no live browser needed) |
| `flaky:report` | List tests flagged as flaky from historical run data |
| `explore:bugs` | Autonomous crawler that clicks through a page and flags anomalies (JS/network errors, broken images) — no test cases needed |
| `dashboard` | Start the local web UI for run history, self-healing review, and flaky reports (`http://localhost:4790`) |
| `mcp:server` | Start the MCP server exposing the STLC pipeline as tools for Cursor/agent clients |
| `test:impact` | Given changed files, report which test domains are affected (used by CI to run targeted tests) |
| `test:unit` | Auto-discover and run every `scripts/**/*.test.ts` unit test file |
| `tmp:clean` | Delete old STLC/exploration run folders and stale scratch files under `automation/tmp/` |
| `lint` / `lint:fix` | Run ESLint / auto-fix what it can |
| `typecheck` | Run the TypeScript compiler in `--noEmit` mode |
| `swagger:api` | Generate a typed API client from a Swagger/OpenAPI spec (requires `SWAGGER_PATH` env var) |

### Run UI tests

```bash
npm run demo:ui
```

### Run API tests

```bash
npm run demo:api
```

### Open HTML report

```bash
npm run report
```

### Other environments

Set `ENV` before running Playwright (see `bootstrap/config.ts`):

```bash
ENV=demo npx playwright test --project=ui
ENV=staging npx playwright test --project=api
```

---

## Environment Variables

Copy `.env.example` → `.env` and adjust as needed.

| Variable | Purpose |
|----------|---------|
| `DEMO_BASE_URL` / `DEMO_LOGIN_URL` / `DEMO_API_BASE_URL` | Override demo URLs (defaults: `demo.example.com`, `api.example.com`) |
| `REGULAR_USER_USERNAME` / `REGULAR_USER_PASSWORD` | Primary UI user (tests + codegen auto-login) |
| `ADMIN_USER_USERNAME` / `ADMIN_USER_PASSWORD` | Secondary UI user |
| `API_REGULAR_USER_USERNAME` / `API_REGULAR_USER_PASSWORD` | API test credentials |
| `STLC_LLM_API_KEY` | Optional — LLM for requirements/design agents |
| `STLC_LLM_BASE_URL` | Optional — defaults to OpenAI-compatible endpoint |
| `STLC_LLM_MODEL` | Optional — e.g. `gpt-4o-mini` |
| `STLC_EMBEDDING_MODEL` | Optional — e.g. `text-embedding-3-small`; enables semantic RAG search when `STLC_LLM_API_KEY` is set |
| `STLC_USE_LLM` | Set `true` to enable LLM in interactive wizard |
| `STLC_TMP_KEEP_RUNS` | Max STLC run folders to keep (default `15`) |
| `STLC_TMP_MAX_AGE_DAYS` | Delete STLC runs older than N days (default `14`) |

---

## Project Structure

```text
yusnova-flow/
├── automation/                    # ← all test automation lives here
│   ├── bootstrap/                 # Global setup, env config, auth state
│   ├── core/                      # API client, fixtures, shared test infra
│   ├── domains/                   # Per-feature fixtures, helpers, schemas
│   ├── pages/                     # Page Object Model classes
│   ├── suites/                    # Playwright specs (*.ui.spec.ts, *.api.spec.ts)
│   ├── requirements/              # Markdown AC files for STLC input
│   ├── scripts/
│   │   ├── codegen-agent/         # Standalone DOM → POM + spec generator
│   │   │   ├── dom/               # Page exploration, DOM scanning, overlays
│   │   │   ├── locators/          # Locator priority/strategy, element naming
│   │   │   ├── naming/            # Domain/page/test name normalization
│   │   │   ├── planning/          # Test planning, AC-grounded case design
│   │   │   ├── writers/           # POM/spec/fixture code generation
│   │   │   ├── safety/            # Link classification, destructive-action guard
│   │   │   ├── utils/             # Codebase context scan, URL helpers
│   │   │   └── templates/         # Handlebars templates for generated files
│   │   ├── stlc-orchestrator/     # Full agentic STLC pipeline
│   │   ├── mcp-server/            # MCP tools over the same STLC handlers
│   │   ├── dashboard/             # Local quality dashboard (static UI + API)
│   │   ├── explorer-agent/        # Autonomous bug-hunter crawler
│   │   ├── validator/             # Convention checks for POM/spec
│   │   └── shared/                # Codebase scanner, tmp cleanup, test impact
│   ├── tmp/stlc/                  # STLC run state & reports (gitignored)
│   ├── playwright.config.ts
│   └── package.json
├── LICENSE                        # MIT
└── README.md
```

---

## Page Object Model (POM)

Each UI feature has a **page class** under `pages/` and a matching **fixture** under `domains/{feature}/`.

**Example**

```ts
// pages/login-page.ts
import { Locator, Page } from '@playwright/test'
import { BasePage } from './base-page'

export class LoginPage extends BasePage {
  readonly usernameInput: Locator
  readonly passwordInput: Locator
  readonly loginButton: Locator

  constructor(page: Page) {
    super(page)
    this.usernameInput = page.locator('[data-testid="username-input"]')
    this.passwordInput = page.locator('[data-testid="password-input"]')
    this.loginButton = page.locator('[data-testid="login-button"]')
  }

  async login(username: string, password: string): Promise<void> {
    await this.usernameInput.fill(username)
    await this.passwordInput.fill(password)
    await this.loginButton.click()
  }
}
```

Specs import the domain fixture, not raw `Page`:

```ts
import { test, expect } from '@domains/login/login.fixture'
```

Manual tests: add `// @stlc:manual` above the test — preserved on `--overwrite` regeneration.

---

## Selector (Locator) Standards

Playwright’s locator engine is powerful. To keep tests **stable and readable**, follow these rules:

1. **Prefer test attributes first**: `data-testid`, `data-test-id`, `data-test`, `data-cy`, `data-qa`.
2. **Stable `id`** next — never use dynamic IDs (`mui-42`, UUID suffixes, `:r1:`).
3. **Role + accessible name**, then `name`, `aria-label`, `placeholder`.
4. **Avoid brittle CSS** — no long chains, no generated class hashes as first choice.
5. Use **camelCase** and **business meaning** in locator property names.

**Naming pattern**

```
[BusinessMeaning][OptionalContext][ElementType]
```

Examples: `loginButton`, `usernameInput`, `submitOrderButton`, `countryDropdown`.

### Codegen locator priority

`codegen:agent` and `stlc:orchestrator` use the same priority engine (`scripts/codegen-agent/locators/locator-priority.ts`):

| Priority | Strategy | Confidence |
|----------|----------|------------|
| 1 | `data-testid` / `data-test-id` / `data-test` / `data-cy` / `data-qa` | high |
| 2 | Stable `id` (e.g. `#login-form`) | high |
| 3 | `role` + accessible name | high |
| 4 | `name`, `aria-label`, `placeholder` | medium |
| 5 | Visible text (`button:has-text(...)`) | medium |
| 6 | Relative CSS (`[class*="token"]`, short ancestor path) | low |

**Good vs bad**

```ts
// ❌ Bad (dynamic id, brittle)
page.locator('#table-6476547564475-45884-74893473')
page.locator('.css-1a2b3c4d')

// ✅ Good (stable, intention-revealing)
page.locator('[data-testid="login-button"]')
page.locator('[data-testid="product-card"]')
page.locator('role=button[name="Submit"]')
```

---

## codegen:agent — DOM → POM + Spec

Standalone generator: analyses a live page, builds POM + fixture + spec.

### Interactive (recommended)

```bash
cd automation
npm run codegen:agent
```

Wizard prompts: URL, domain, page class, explore, overwrite, headless.

### CLI

```bash
npm run codegen:agent -- \
  --url https://demo.example.com/products \
  --domain products \
  --page ProductsPage \
  --explore \
  --overwrite
```

### Outputs

| Artifact | Path |
|----------|------|
| Page Object | `pages/{page}-page.ts` |
| Domain fixture | `domains/{domain}/{domain}.fixture.ts` |
| UI spec | `suites/{domain}/{domain}.ui.spec.ts` |

Help: `npm run codegen:agent -- --help`

---

## stlc:orchestrator — Agentic STLC Pipeline

**stlc:orchestrator** wraps `codegen:agent` inside a full **Software Testing Life Cycle** pipeline with auditable agents. It does **not** replace `codegen:agent` — it adds requirements analysis, design, review, optional execution, and reporting.

### Quick start (interactive wizard)

```bash
cd automation
npm run stlc:orchestrator
```

Wizard steps:

1. Target URL  
2. Domain name (folder under `suites/` / `domains/`)  
3. Page class name  
4. Requirement file (optional — e.g. `./requirements/products.md`)  
5. Run Playwright tests after generation? (`no` = fast codegen only)  
6. Codegen options: explore, overwrite, show browser  

Human review gates are **auto-approved** in the wizard by default (local dev). Use CLI flags for stricter CI behaviour.

### CLI example

```bash
npm run stlc:orchestrator -- \
  --url https://demo.example.com/products \
  --domain products \
  --page ProductsPage \
  --requirement-file ./requirements/products.md \
  --explore \
  --overwrite \
  --skip-human-gates
```

### Full pipeline with test execution

```bash
npm run stlc:orchestrator -- \
  --url https://demo.example.com/products \
  --domain products \
  --page ProductsPage \
  --requirement-file ./requirements/products.md \
  --run-tests \
  --skip-human-gates
```

Help: `npm run stlc:orchestrator -- --help`

### Pipeline phases

| Phase | Agent | What it does |
|-------|-------|----------------|
| requirements | requirements-agent | Parses AC lines, ambiguity flags, testability score |
| planning | planning-agent | Risk matrix, scope, codebase scan (frontend/backend/automation) |
| design | design-agent | Test cases + negative/boundary variants |
| review_design | review-agent | Coverage gaps, duplicates, human gate |
| codegen | codegen-bridge-agent | Runs `codegen:agent` pipeline + merges design cases |
| review_code | review-agent | `npm run validate -- --domain {domain}` |
| execution | execution-agent | Optional Playwright run (`--run-tests`) |
| triage | triage-agent | Failure grouping, defect hypotheses, RAG ingest |
| reporting | reporting-agent | Quality gate recommendation |

**Profiles**

| Mode | Behaviour |
|------|-----------|
| Generate only (wizard default) | Design + codegen + review + report — no Playwright run |
| Generate + run tests | All phases including execution + triage |

### Generated spec structure

Tests are grouped into standard `describe` blocks:

- `[ProductsPage] Explore` — recorded click-through (when explore is on)  
- `[ProductsPage] Core flows` — list, sort (all dropdown options), cart, detail  
- `[ProductsPage] Edge cases` — design-agent negative/boundary / codebase gaps  

Test title format:

```ts
test('[ProductListVisibleOnPageLoad] | verify that the product list is visible when the page loads', ...)
```

### Outputs

| Output | Location |
|--------|----------|
| Run state + audit trail | `automation/tmp/stlc/{runId}/state.json` |
| Quality report | `automation/tmp/stlc/{runId}/quality-report.md` |
| POM / spec / fixture | `pages/`, `suites/`, `domains/` (via codegen phase) |
| Defect RAG knowledge | `automation/tmp/stlc/knowledge/` (preserved on cleanup) |

### Useful CLI flags

| Flag | Description |
|------|-------------|
| `--skip-human-gates` | Auto-approve design/code review gates (local POC) |
| `--run-tests` | Execute Playwright after codegen |
| `--explore` | Click-through recording merged into spec |
| `--overwrite` | Replace existing POM/spec/fixture |
| `--headless` | Hide browser during DOM analysis |
| `--no-llm` | Force heuristic agents (no API key needed) |
| `--no-rag` | Disable defect-pattern RAG |
| `--no-self-healing` | Disable healing proposals after failures |
| `--no-tmp-prune` | Skip auto-cleanup of old `tmp/stlc` runs |
| `--phases requirements,design,codegen,reporting` | Custom phase list |

### Self-healing review (human approval required)

Selector failures produce `healingProposals[]` in `state.json` with `status: pending_human`. Nothing is ever written to a POM/spec file automatically — review and apply with:

```bash
npm run healing:review -- --run <runId>                          # list pending proposals
npm run healing:review -- --run <runId> --approve HEAL-123        # approve + apply one
npm run healing:review -- --run <runId> --reject HEAL-123         # reject one
npm run healing:review -- --run <runId> --approve-all --min-confidence 0.8
npm run healing:review -- --list-runs                             # find runs with pending proposals
```

CI failures also generate reviewable proposals without needing a URL:

```bash
npm run healing:from-log -- --domain example --log-file playwright-output.txt
```

### Flaky test report

Every execution is recorded to `tmp/stlc/knowledge/test-history.json`. Failing tests with a high historical flaky score are automatically downgraded to `minor` severity by the triage agent instead of blocking the quality gate.

```bash
npm run flaky:report                                  # all domains
npm run flaky:report -- --domain example --min-score 0.5
```

### Tmp cleanup

`automation/tmp/` holds ephemeral pipeline output. Nothing here should be committed or manually deleted under normal use — retention is automatic:

| Path | What it stores | Auto-pruned when |
|------|----------------|------------------|
| `tmp/stlc/{uuid}/` | STLC run state + quality report | `stlc:orchestrator` starts (default: keep 15 runs / 14 days) |
| `tmp/stlc/exploration/explore-*/` | Bug-hunter reports, JSON, screenshots | `explore:bugs` starts (same defaults) |
| `tmp/stlc/knowledge/` | RAG defect patterns + flaky history | **Never** pruned |
| `tmp/codegen-raw.ts` etc. | Codegen scratch files | Age > 14 days via `pruneAutomationTmp` |

```bash
npm run tmp:clean          # prune STLC + exploration runs + stale codegen scratch
npm run tmp:clean -- --dry-run    # preview only
npm run tmp:clean -- --max-runs 5
npm run tmp:clean -- --all-runs   # wipe all runs (keeps knowledge/)
```

Override defaults with env vars `STLC_TMP_KEEP_RUNS` and `STLC_TMP_MAX_AGE_DAYS`, or per-command flags `--tmp-keep-runs` / `--tmp-max-age-days` on `stlc:orchestrator` and `explore:bugs`. Disable auto-prune with `--no-tmp-prune`.

### Requirement files

Place acceptance criteria in `automation/requirements/`:

```markdown
AC: User must view the product list on the products page
AC: User must be able to add a product to the cart
AC: User can sort products by name
AC: User can open a product detail page from the list
```

Pass with `--requirement-file ./requirements/products.md` or paste inline via `--requirement "AC: ..."`.

### LLM (optional)

Without `STLC_LLM_API_KEY`, all agents use **heuristics** — fully functional for local demo runs.

```env
STLC_LLM_API_KEY=sk-...
STLC_LLM_MODEL=gpt-4o-mini
STLC_USE_LLM=true
```

### Human gates

Design review may flag low-confidence cases. Without `--skip-human-gates`, codegen can be blocked until cases are approved in `state.json`. For local work, use the wizard (auto-approve) or `--skip-human-gates`.

### Two tools — when to use which

| Tool | Use when |
|------|----------|
| `codegen:agent` | You only need POM + spec from a URL — fast, no STLC overhead |
| `stlc:orchestrator` | You have requirements, want design coverage, review gates, quality report, optional test run |

---

## CI/CD — PR & Nightly Pipelines

Two GitHub Actions workflows live under `.github/workflows/`:

| Workflow | Trigger | What it does |
|----------|---------|----------------|
| `stlc-pr.yml` | Pull request → `main` | Runs [test impact analysis](#test-impact-analysis) on the diff, then validator + Playwright for only the affected domain(s) (or the full suite if shared infra changed), and posts/updates a single summary comment on the PR |
| `stlc-nightly.yml` | Daily cron (`0 2 * * *`) + manual dispatch | Full UI + API regression across every domain; on failure, builds self-healing proposals per domain and opens/updates a tracking issue labelled `stlc-nightly` |

Both workflows never write to POM/spec files — failures only ever produce reviewable proposals (see [Self-healing review](#self-healing-review-human-approval-required)). Required secrets: `REGULAR_USER_USERNAME`, `REGULAR_USER_PASSWORD`, `ADMIN_USER_USERNAME`, `ADMIN_USER_PASSWORD`, `API_REGULAR_USER_USERNAME`, `API_REGULAR_USER_PASSWORD`, and optionally `STLC_LLM_API_KEY`.

### Test impact analysis

Maps changed files to affected test domains so CI (and you, locally) don't have to run the full suite for every change:

```bash
npm run test:impact -- --base origin/main --head HEAD   # git-diff based
npm run test:impact -- --files automation/domains/inventory/inventory.fixture.ts
npm run test:impact -- --all-domains --format json       # nightly: everything
```

Shared infrastructure changes (`core/`, `bootstrap/`, `pages/base-page.ts`, framework scripts, `package.json`, etc.) and any page file not linked to a domain fixture conservatively flip `runFullSuite: true` rather than silently skipping coverage.

## MCP Server, Quality Dashboard & Bug-Hunter Explorer

Three ways to reach the STLC pipeline besides the CLI, all built on the same handlers (`automation/scripts/mcp-server/handlers.ts`) so approve/reject/list behavior is identical everywhere.

### MCP server — drive the pipeline from Cursor chat

```bash
cd automation
npm run mcp:server   # stdio MCP server, for manual testing
```

Register it in `.cursor/mcp.json` (project or user-level) so Cursor's agent can call it directly:

```json
{
  "mcpServers": {
    "stlc": {
      "command": "npx",
      "args": ["ts-node", "scripts/mcp-server/server.ts"],
      "cwd": "/absolute/path/to/yusnova-flow/automation"
    }
  }
}
```

Exposes 13 tools: `stlc_list_runs`, `stlc_get_run`, `stlc_get_report`, `stlc_list_healing_proposals`, `stlc_approve_healing_proposal`, `stlc_reject_healing_proposal`, `stlc_approve_all_healing_proposals`, `stlc_flaky_report`, `stlc_test_impact`, `stlc_list_domains`, `stlc_validate_domain`, `stlc_run_pipeline`, `stlc_explore_bugs`. Approval tools only ever write to POM/spec files for the exact proposal id(s) a human explicitly asked to approve — same safety contract as `healing:review`.

### Quality dashboard — visual run history & one-click healing review

```bash
cd automation
npm run dashboard                       # http://localhost:4790
DASHBOARD_PORT=5000 npm run dashboard   # custom port
```

Local web UI (zero build step) with four tabs: **Runs** (quality gate, coverage, click a row for the full report), **Self-Healing** (approve/reject proposals — writes to disk exactly like `healing:review`, with a confirmation prompt), **Flaky Tests**, and **Test Impact** (paste changed file paths, see affected domains).

### Bug-hunter explorer — autonomous anomaly hunting, no test cases needed

```bash
cd automation
npm run explore:bugs -- --url https://<host>/ --max-pages 8 --max-actions-per-page 15
npm run explore:bugs -- --url https://<host>/ --headless --ingest-rag --module checkout
```

Crawls breadth-first, clicking through buttons/links, and flags anomalies — console errors, uncaught JS exceptions, failed/4xx/5xx network calls, visible error text (leaked stack traces, `[object Object]`, generic error-boundary copy), broken images — each with a screenshot and action trail. Output: `tmp/stlc/exploration/{runId}/{exploration-report.md, anomalies.json, screenshots/}`.

`--ingest-rag` feeds critical/major anomalies into the same defect-pattern RAG knowledge base the requirements/design agents query, so a bug found by exploration informs the next `stlc:orchestrator` run's acceptance criteria. This never modifies application code — it only reads pages and writes reports under `tmp/`.

See `automation/.cursor/skills/07-mcp-dashboard-explorer.md` for extension guidelines.

## Validation, Lint & Unit Tests

```bash
# Convention validator (POM + spec structure)
npm run validate -- --domain products

# TypeScript
npm run typecheck

# ESLint
npm run lint

# Unit tests — auto-discovers every scripts/**/*.test.ts file, no per-file alias needed
npm run test:unit
npm run test:unit -- --filter healing   # only run files matching "healing"
```

---

## Debugging

```bash
# Playwright UI mode
ENV=demo npx playwright test --project=ui --ui

# Step-through debug
ENV=demo npx playwright test --project=ui --debug

# Single spec file
ENV=demo npx playwright test suites/products/products.ui.spec.ts

# Headed browser
ENV=demo npx playwright test --project=ui --headed
```

STLC codegen with visible browser: wizard → **Show browser during generation = yes**, or omit `--headless` on CLI.

More: [Playwright debugging docs](https://playwright.dev/docs/debug)

---

## License

MIT — see [`LICENSE`](./LICENSE).

## Helpful Links

- Playwright — [https://playwright.dev/docs/intro](https://playwright.dev/docs/intro)
- CSS attribute selectors — [https://www.w3schools.com/cssref/css_selectors.php](https://www.w3schools.com/cssref/css_selectors.php)
- Faker.js — [https://fakerjs.dev/api/](https://fakerjs.dev/api/)
- Axios — [https://axios-http.com/docs/intro](https://axios-http.com/docs/intro)
- Internal skills (Cursor) — `automation/.cursor/skills/` (POM, API patterns, codegen, STLC)

---

> Contributions welcome! Keep selectors stable, page objects cohesive, tests independent, and let the agents do the boilerplate. 💪
