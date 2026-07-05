# Skill: Hybrid Test Pattern (API setup + UI verification)
> Read this before creating or editing `.ui.spec.ts` files that need API setup.

## Concept

Hybrid tests use `foundryAPI` in `test.beforeEach` to create state (entities, data)
and then use POM methods to verify the UI reflects that state. There is NO separate
`e2e/` folder — hybrid tests live in `suites/{feature}/ui/`.

---

## File location

```
automation/suites/{feature}/ui/{feature}.ui.spec.ts
```

---

## Canonical pattern

```typescript
import { test, expect } from '../fixtures/{feature}.fixture';
import { ApiAssertions } from '../../../core/api/ApiAssertions';
import { ProjectRequestBuilder } from '../builders/projectRequestBuilder';

test.describe('@projects Projects – Edit via UI', () => {

  // ── API setup: runs before EACH test in this describe ──────────────────
  test.beforeEach(async ({ foundryAPI, state }) => {
    await test.step('API: Create test project', async () => {
      const payload = new ProjectRequestBuilder().withName('Test Project').build();
      const res = await foundryAPI.Project.v1ProjectPost(payload);
      ApiAssertions.assertStatus(res, 201);

      // Store ONLY the ID — never the full response.
      state.set('testProject', {
        id:        res.data.id as string,
        createdAt: Date.now(),
        meta:      { name: payload.name },
      });
    });
  });

  test('TC001 – user can edit project name via UI', async ({ projectPage, state, testPage }) => {

    const { id, meta } = state.get('testProject');
    const originalName = meta?.['name'] as string;

    await test.step('Navigate to project edit page', async () => {
      await testPage.goto(`/projects/${id}/edit`);
    });

    await test.step('Update project name', async () => {
      await projectPage.clearAndFillName('Updated Project Name');
      await projectPage.clickSave();
    });

    await test.step('Assert success toast', async () => {
      await projectPage.assertSavedToast();
    });

    await test.step('API: Verify change persisted', async () => {
      const res = await foundryAPI.Project.v1ProjectIdGet(id);
      ApiAssertions.assertStatus(res, 200);
      expect(res.data.name).toBe('Updated Project Name');
    });
  });

});
```

---

## StateManager usage

```typescript
// SET (always in beforeEach API step):
state.set('key', {
  id:        'uuid-here',          // required
  createdAt: Date.now(),           // required
  meta:      { name: 'payload' },  // optional small metadata
});

// GET (in test body — throws if missing):
const { id, meta } = state.get('key');

// GET nullable (optional key):
const entry = state.getOrNull('key');

// RESET — automatic in afterEach via base fixture. Never call manually.
```

**Never store in StateManager:**
- Full API response objects
- Passwords or tokens
- Arrays with many items (store count + first ID)

---

## Fixture reference

| Fixture | Source | Scope | Purpose |
|---------|--------|-------|---------|
| `foundryAPI` | base.fixture | test | All API calls via generated client |
| `state` | base.fixture | test | API→UI bridge; reset in afterEach |
| `testPage` | base.fixture | test | Raw Playwright page |
| `pageFactory` | base.fixture | test | Creates POM instances |
| `apiToken` | base.fixture | worker | Auth token, login once per worker |
| `loginPage` | auth.fixture | test | LoginPage POM |

---

## Parallel isolation guarantee

Each test gets:
- Separate browser context (cookies cleared by `testPage` afterEach)
- Separate `StateManager` instance (reset in afterEach)
- Separate `FoundryAPI` instance (auth token from worker fixture)
- Separate `AsyncLocalStorage` scope (no token cross-contamination)

Always use unique data:
```typescript
const uid   = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const email = `test-${uid}@example.com`;
```

---

## Checklist before committing a hybrid UI spec

- [ ] `test.describe()` wraps all tests
- [ ] `beforeEach` uses `foundryAPI.*` for API setup (not UI login)
- [ ] `state.set()` stores only `id` + small `meta`
- [ ] `state.get()` in test body (not in beforeEach)
- [ ] No `page.waitForTimeout()` anywhere
- [ ] Unique test data per run (timestamp/random suffix)
- [ ] API cross-check step for write operations
- [ ] All phases in `test.step()`
- [ ] Tags: `@{feature}` on every test
