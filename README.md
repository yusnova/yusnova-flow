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
- [Validation, Lint & Unit Tests](#validation-lint--unit-tests)
- [Debugging](#debugging)
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
ENV=aws-dev npx playwright test --project=api
```

---

## Environment Variables

Copy `.env.example` → `.env` and adjust as needed.

| Variable | Purpose |
|----------|---------|
| `REGULAR_USER_USERNAME` / `REGULAR_USER_PASSWORD` | Primary UI user (tests + codegen auto-login) |
| `ADMIN_USER_USERNAME` / `ADMIN_USER_PASSWORD` | Secondary UI user |
| `API_REGULAR_USER_USERNAME` / `API_REGULAR_USER_PASSWORD` | API test credentials |
| `STLC_LLM_API_KEY` | Optional — LLM for requirements/design agents |
| `STLC_LLM_BASE_URL` | Optional — defaults to OpenAI-compatible endpoint |
| `STLC_LLM_MODEL` | Optional — e.g. `gpt-4o-mini` |
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
│   │   ├── stlc-orchestrator/     # Full agentic STLC pipeline
│   │   ├── validator/             # Convention checks for POM/spec
│   │   └── shared/                # Codebase scanner, tmp cleanup
│   ├── tmp/stlc/                  # STLC run state & reports (gitignored)
│   ├── playwright.config.ts
│   └── package.json
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

`codegen:agent` and `stlc:orchestrator` use the same priority engine (`scripts/codegen-agent/locator-priority.ts`):

| Priority | Strategy | Confidence |
|----------|----------|------------|
| 1 | `data-testid` / `data-test-id` / `data-test` / `data-cy` / `data-qa` | high |
| 2 | Stable `id` (e.g. `#login-form`) | medium |
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
  --url https://your-app.example.com/products \
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

Help: `npm run codegen:agent:help`

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
  --url https://your-app.example.com/products \
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
  --url https://your-app.example.com/products \
  --domain products \
  --page ProductsPage \
  --requirement-file ./requirements/products.md \
  --run-tests \
  --skip-human-gates
```

Help: `npm run stlc:orchestrator:help`

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

### Tmp cleanup

STLC creates a UUID folder per run under `tmp/stlc/`. Auto-pruned before each orchestrator start (keeps last 15 runs / 14 days).

```bash
npm run tmp:clean          # prune old runs
npm run tmp:clean:dry      # preview only
npm run tmp:clean -- --max-runs 5
```

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

## Validation, Lint & Unit Tests

```bash
# Convention validator (POM + spec structure)
npm run validate -- --domain products

# TypeScript
npm run typecheck

# ESLint
npm run lint

# Codegen unit tests
npm run test:locators
npm run test:naming
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

## Helpful Links

- Playwright — [https://playwright.dev/docs/intro](https://playwright.dev/docs/intro)
- CSS attribute selectors — [https://www.w3schools.com/cssref/css_selectors.php](https://www.w3schools.com/cssref/css_selectors.php)
- Faker.js — [https://fakerjs.dev/api/](https://fakerjs.dev/api/)
- Axios — [https://axios-http.com/docs/intro](https://axios-http.com/docs/intro)
- Internal skills (Cursor) — `automation/.cursor/skills/` (POM, API patterns, codegen, STLC)

---

> Contributions welcome! Keep selectors stable, page objects cohesive, tests independent, and let the agents do the boilerplate. 💪
