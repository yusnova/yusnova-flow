# Skill: POM File Creation
> Read this skill before creating or editing any Page Object Model file.

## File location

```
automation/pages/{feature}-page.ts   ← flat, kebab-case (match existing pages)
```

Examples: `pages/login-page.ts`, `pages/booking-page.ts`

---

## Core rule: locator-first (DRY + SOLID)

POMs expose **locators**. Specs call **BasePage** primitives on those locators.

| Do | Don't |
|----|--------|
| `await page.fill(page.postcodeInput, value)` | `await page.fillPostcode(value)` thin wrapper |
| `await page.click(page.lookupButtonBtn)` | `await page.clickLookup()` |
| `await page.check(page.addressOption('addr_1'))` | N× `toggleAddressOptionAddrNRadio(check)` |
| `await page.click(page.wastePath('general'))` | `wastePathGeneralBtn` + `wastePathHeavyBtn` + … |
| `login()` / `submitForm()` composites | — |

**Emit a POM method only when it adds behavior** beyond a one-liner BasePage already owns
(multi-step orchestration, waits, non-obvious sequencing). Never forward `.fill` / `.click` /
`.check` / `.selectOption` / `.setInputFiles` through a dedicated wrapper.

**Collapse repeating `data-testid` families** (≥2 siblings, ≥2 static kebab segments) into one
parameterized locator — radios, checkboxes, buttons, links, inputs. Codegen:
`collapseRepeatingLocators`.

```typescript
addressOption(optionId: string): Locator {
  return this.page.locator(`[data-testid="address-option-${optionId}"]`);
}
wastePath(optionId: string): Locator {
  return this.page.locator(`[data-testid="waste-path-${optionId}"]`);
}

// in the test:
await bookingPage.check(bookingPage.addressOption('addr_1'));
await bookingPage.click(bookingPage.wastePath('general'));
await bookingPage.click(bookingPage.nextFrom('step1'));
```

---

## Exact template

```typescript
import { Locator, Page } from '@playwright/test';
import { BasePage } from './base-page';

export class FeaturePage extends BasePage {
  readonly emailInput: Locator;
  readonly submitBtn: Locator;

  constructor(page: Page) {
    super(page);
    this.emailInput = page.locator('[data-testid="email-input"]');
    this.submitBtn = page.locator('[data-testid="submit-btn"]');
  }

  // Parameterized families only — no per-option fields / toggles
  planOption(optionId: string): Locator {
    return this.page.locator(`[data-testid="plan-option-${optionId}"]`);
  }

  // Composite only when multi-step
  async login(email: string, password: string): Promise<void> {
    await this.fill(this.emailInput, email);
    await this.fill(this.page.locator('[data-testid="password-input"]'), password);
    await this.click(this.submitBtn);
  }

  async expectLoaded(): Promise<void> {
    await this.expectPageLoaded();
  }
}```

---

## BasePage primitives (use these in specs)

- `click(locator)` / `fill(locator, value)` / `check` / `uncheck` / `select` / `setFiles`
- Prefer these over inventing `fillX` / `clickX` / `toggleX` on every page

---

## Selector priority

| # | Pattern | Confidence |
|---|---------|------------|
| 1 | `[data-testid="value"]` | high |
| 2 | `#stableId` (non-generated) | high |
| 3 | `form [name="value"]` | medium |
| 4 | `[aria-label="value"]` | medium |
| 5 | `tag[attr] > child` (≤ 3 levels) | low |

**Never use:** `getByLabel()`, `getByRole()`, `nth-child()`, generated class names — unless BasePage
helpers already wrap role-based UI (dropdowns).

---

## Checklist before committing a POM

- [ ] `extends BasePage` from `pages/base-page.ts`
- [ ] Constructor takes `(page: Page)` only
- [ ] Locators are `readonly` fields or parameterized methods — not N clones
- [ ] No thin `fill*` / `click*` / `toggle*` one-liner wrappers
- [ ] Repeating families use one parameterized locator (list helpers only for indexed catalogs that need count/first)

- [ ] Specs use `page.fill` / `page.click` / `page.check` on those locators
- [ ] Composite methods only for real multi-step flows (`login`, `submitForm`)
- [ ] No hardcoded test data in the POM
- [ ] File is in `automation/pages/`
