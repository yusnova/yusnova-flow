# Workflow: Add a New Feature Suite
> Follow this workflow when the user says "add {X} suite/feature/tests".
> Read skill `05-domain-onboarding.md` before starting.

---

## Pre-flight checklist

Confirm with the user:
1. Feature name (lowercase, e.g. `projects`, `activity`, `pipelines`)
2. Pages / user flows to cover
3. Whether the OpenAPI spec has new endpoints (run `swagger:api` if yes)
4. Application base URL

---

## Step 1 · Create the directory structure

```bash
FEATURE=projects
mkdir -p automation/domains/${FEATURE}
mkdir -p automation/suites/${FEATURE}/{api,ui}
```

Then create using skill `05-domain-onboarding.md`:
- `domains/{feature}/{feature}.schemas.ts`
- `domains/{feature}/{feature}.api-errors.ts`
- `domains/{feature}/{feature}.ui-messages.ts`
- `domains/{feature}/{feature}.fixture.ts`
- `.env` updated with any new `TEST_*` credentials

Verify: `cd automation && npx tsc --noEmit` still passes.

---

## Step 2 · Sync OpenAPI client (if API spec changed)

Only if new endpoints were added to the backend OpenAPI spec:

```bash
# Set the spec path in .env:
SWAGGER_PATH=../api/openapi.json

# Regenerate the TypeScript client:
cd automation && npm run swagger:api
```

Expected: `core/api/generated/index.ts` updated with new API classes.

Then update `core/api/FoundryAPI.ts`:
- Import the new API class
- Add `readonly NewFeature: NewFeatureApi;` property
- Instantiate in the constructor

---

## Step 3 · Create POM files in `pages/`

Create one POM per page using skill `01-pom-creation.md`.
**All POMs go in `automation/pages/` — flat, no sub-folders.**

```bash
# Edit package.json "codegen:agent" placeholders, or pass flags via --:
cd automation
npm run codegen:agent -- \
  --url  https://<host>/example-path \
  --domain domainName \
  --page   PomPageName \
  --type   ui
```

Check console output for `⚠ low=N` warnings (low-confidence selectors).

---

## Step 4 · Create test specs in `suites/{feature}/`

- API tests → `suites/{feature}/api/{feature}.api.spec.ts`
  Pattern: see skill `02-api-test-pattern.md`
- UI tests → `suites/{feature}/ui/{feature}.ui.spec.ts`
  Pattern: see skill `01-pom-creation.md` + `03-hybrid-test-pattern.md`

**Tag every test**: `test('@projects TC001 – ...', ...)`

---

## Step 5 · Run TestValidator

```bash
cd automation
npm run validate:conventions -- \
  --domain  projects           \
  --base-url http://localhost:3000
```

With browser selector check (recommended for CI setup):
```bash
npm run validate:conventions -- \
  --domain  projects           \
  --base-url http://localhost:3000 \
  --browser
```

Target: `autoFixRate ≥ 80%`

---

## Step 6 · Review validation-report.json

```bash
cat automation/reports/validation-report.json
```

Or open it in the IDE and look for `"autoFixed": false` entries.

| Issue type | Manual fix action |
|-----------|------------------|
| `broken-selector` | Add `data-testid` to app, re-run with `--overwrite` |
| `missing-pom-method` | Implement the TODO stub in the POM |
| `missing-assertion` | Replace auto-injected URL check with real assertion |
| `ambiguous-selector` | Narrow the selector (scope to a parent container) |

---

## Step 7 · Run tests to verify

```bash
cd automation

# All tests for the feature:
npx playwright test --grep @projects

# UI tests only, headed (useful for debugging):
npx playwright test suites/projects/ui/ --headed

# API tests only:
npx playwright test suites/projects/api/
```

Expected: all tests green in chromium, firefox, webkit.

If a test fails:
- **Locator issue** → check `data-testid` in the app, re-run codegen-agent with `--overwrite`
- **Assertion mismatch** → update the expected value in the spec
- **Timing issue** → use `expect(locator).toBeVisible({ timeout: N })`. NEVER `waitForTimeout`.

---

## Step 8 · Final integration checklist

- [ ] `npx tsc --noEmit` passes
- [ ] `npm run validate:conventions -- --domain {feature}` ≥ 80% auto-fix rate
- [ ] `npx playwright test --grep @{feature}` green on all browsers
- [ ] All `// TODO` comments in generated files resolved
- [ ] No hardcoded passwords or secrets
- [ ] `@{feature}` tag on all tests
- [ ] `swagger:api` re-run if new API endpoints added
- [ ] `FoundryAPI.ts` updated if new API namespace added
- [ ] No cross-feature imports (`@domains/auth` used inside projects specs → wrong unless shared via `core/`)

---

## Quick reference

```bash
# Generate POM + spec for a page
npm run codegen:agent -- --url https://<host>/example-path --domain domainName --page PomPageName --type ui

# Validate
npm run validate:conventions -- --domain FEAT --base-url URL

# Run feature tests
npx playwright test --grep @FEAT

# Re-generate API client from OpenAPI spec
npm run swagger:api

# Type check
npm run typecheck

# View HTML report
npm run report
```
