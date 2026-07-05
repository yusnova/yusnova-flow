# Skill: codegen-agent Usage
> Read this skill before running the codegen agent or interpreting its output.

## What it does

`codegen-agent` navigates to a URL, extracts interactive elements, resolves optimal
locators, generates a test plan, and writes a complete `pages/{Page}Page.ts` POM and
`suites/{feature}/ui/{feature}.ui.spec.ts` spec file.

## CLI command

Interactive mode (recommended):

```bash
cd automation
npm run codegen:agent
```

Follow the terminal prompts for URL, domain, page name, explore and overwrite.

Non-interactive mode:

```bash
npm run codegen:agent -- \
  --url    https://<host>/example-path \
  --domain domainName \
  --page   PomPageName \
  --type   ui \
  --explore
```

Or with a pre-recorded codegen file:

```bash
npx playwright codegen \
  --output tmp/codegen-raw.ts \
  https://<host>/example-path

npm run codegen:agent -- \
  --url  https://<host>/example-path \
  --domain domainName \
  --page   PomPageName \
  --type   ui \
  --codegen-file tmp/codegen-raw.ts
```

## All flags

| Flag | Required | Default | Description |
|------|----------|---------|-------------|
| `--url` | ✓ | — | Target page URL |
| `--domain` | ✓ | — | Feature name (e.g. `projects`) |
| `--page` | ✓ | — | PascalCase page name (e.g. `ProjectList`) |
| `--type` | ✓ | — | `ui` \| `api` \| `e2e` |
| `--headless` | — | headed | Force headless browser |
| `--overwrite` | — | false | Overwrite existing files |
| `--codegen-file` | — | — | Path to saved codegen output |
| `--no-codegen` | — | false | Skip codegen step |

## Generated file locations

| Output | Location |
|--------|----------|
| POM class | `automation/pages/{PageName}Page.ts` |
| UI spec | `automation/suites/{feature}/ui/{feature}.ui.spec.ts` |

## Codegen transformation table

| Codegen output | Generated output |
|---------------|-----------------|
| `page.getByLabel('Email').fill(v)` | `await featurePage.fillEmailInput(v)` |
| `page.getByRole('button',{name:'Save'}).click()` | `await featurePage.clickSaveBtn()` |
| `page.waitForTimeout(1000)` | **REMOVED** (anti-pattern) |
| `page.locator('text=X').click()` | `await featurePage.clickXLink()` |
| `page.goto(url)` | `await featurePage.navigate()` |

## Low-confidence locator warning

If the console shows `⚠ low=N`:
1. Ask the FE team to add `data-testid` attributes.
2. Or validate with `npm run validate -- --domain {feature} --browser --base-url URL`.

## After generation — review TODOs

```bash
grep -r "// TODO" automation/pages/{PageName}Page.ts
grep -r "// TODO" automation/suites/{feature}/
```

Replace all `// TODO` comments with real assertions before committing.

## Re-generate after UI changes

```bash
npm run codegen:agent -- \
  --url https://<host>/example-path \
  --domain domainName \
  --page PomPageName \
  --type ui \
  --overwrite
```

**Caution:** `--overwrite` replaces hand-edited files. Only use it when the page
structure has changed significantly. For minor changes, edit the POM manually.
