# Skill: POM File Creation
> Read this skill before creating or editing any Page Object Model file.

## File location

```
automation/pages/{FeatureName}Page.ts   ← flat, NO sub-folders
```

Examples: `pages/LoginPage.ts`, `pages/ProductListPage.ts`, `pages/ActivityPage.ts`

---

## Exact template

```typescript
import { Page } from '@playwright/test';
import { BasePage } from './BasePage';  // always relative

export class {FeatureName}Page extends BasePage {
  constructor(page: Page) {
    super(page);  // no ctx, no UiActions instance
  }

  get url(): string {
    return '/path/to/page';
  }

  // ─── Locators (private getters only) ────────────────────────────────────
  // Priority: data-testid > #id > [name] > aria-label > css-path
  // NEVER use getByLabel() or getByRole()

  private get emailInput() {
    return this.page.locator('[data-testid="email-input"]');
  }

  private get submitBtn() {
    return this.page.locator('[data-testid="submit-btn"]');
  }

  // ─── Load detection ──────────────────────────────────────────────────────

  async waitForLoad(): Promise<void> {
    await this.page.waitForURL(/\/path\/to\/page/);
    await this.assertVisible(this.emailInput, 'Email input');
    await this.assertVisible(this.submitBtn, 'Submit button');
  }

  // ─── Interactions ────────────────────────────────────────────────────────
  // Call inherited BasePage methods: this.fillInput, this.clickElement, etc.
  // DO NOT create a new UiActions instance.

  async fillEmail(email: string): Promise<void> {
    await this.fillInput(this.emailInput, email);
  }

  async clickSubmit(): Promise<void> {
    await this.clickElement(this.submitBtn);
  }

  async login(email: string, password: string): Promise<void> {
    await this.fillEmail(email);
    await this.fillInput(this.page.locator('[data-testid="password-input"]'), password);
    await this.clickSubmit();
  }

  // ─── Assertions ──────────────────────────────────────────────────────────
  // All assertion methods start with `assert`.
  // Accept string | RegExp for text checks.

  async assertErrorBanner(expected: string | RegExp): Promise<void> {
    const banner = this.page.locator('[data-testid="error-banner"]');
    await this.assertVisible(banner, 'Error banner');
    if (typeof expected === 'string') {
      await this.assertText(banner, expected);
    } else {
      await this.assertTextRegex(banner, expected);
    }
  }

  async assertRedirectedTo(pattern: string | RegExp): Promise<void> {
    await this.assertURL(pattern, 'Redirect URL');
  }
}
```

---

## Key differences from old pattern

| Old (deleted) | New |
|---------------|-----|
| `import { UiActions } from 'core/ui/actions/UiActions'` | ❌ removed |
| `private readonly actions: UiActions` | ❌ removed |
| `this.actions.fillInput(...)` | `this.fillInput(...)` (BasePage method) |
| `constructor(page, ctx: ITestContext)` | `constructor(page: Page)` |
| Located in `domains/auth/pages/` | Located in `pages/` (flat) |

---

## Selector priority (enforced by `.cursorrules`)

| # | Pattern | Confidence |
|---|---------|------------|
| 1 | `[data-testid="value"]` | high |
| 2 | `#stableId` (non-generated) | high |
| 3 | `form [name="value"]` | medium |
| 4 | `[aria-label="value"]` | medium |
| 5 | `tag[attr] > child` (≤ 3 levels) | low |

**Never use:** `getByLabel()`, `getByRole()`, `nth-child()`, generated class names.

---

## Domain fixture wiring (in `domains/{feature}/{feature}.fixture.ts`)

```typescript
import { test as baseTest } from '../../../core/fixtures/base.fixture';
import { LoginPage } from '../../../pages/LoginPage';

export const test = baseTest.extend({
  loginPage: async ({ page }, use) => {
    await use(new LoginPage(page));  // pass page only
  },
});
export { expect } from '@playwright/test';
```

---

## Checklist before committing a POM

- [ ] `extends BasePage` from `pages/BasePage.ts`
- [ ] Constructor takes `(page: Page)` only
- [ ] No `UiActions` import or instance
- [ ] All locators are private getters
- [ ] `waitForLoad()` uses `this.assertVisible()`
- [ ] Interaction methods call `this.fillInput()` / `this.clickElement()` etc.
- [ ] Assertion methods start with `assert`
- [ ] No hardcoded test data in the POM
- [ ] File is in `automation/pages/` (not inside suites/)
