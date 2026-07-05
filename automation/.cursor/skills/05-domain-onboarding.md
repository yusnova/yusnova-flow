# Skill: Feature Onboarding (adding a new test suite)
> Read this skill when adding a new feature area to the automation framework.

## Directory layout

```
automation/
├── .env / .env.example          ← all credentials (TEST_*), never in code
├── bootstrap/
│   ├── config.ts                ← URLs per ENV
│   └── credentials.ts           ← reads .env, exports testCredentials
├── domains/
│   └── {feature}/
│       ├── {feature}.schemas.ts
│       ├── {feature}.api-errors.ts
│       ├── {feature}.ui-messages.ts
│       └── {feature}.fixture.ts
├── pages/
└── suites/{feature}/            ← *.spec.ts only
```

## Credentials rule

All usernames/passwords → `.env` only. Tests import:

```typescript
import { testCredentials } from '@bootstrap/credentials';
const { valid } = testCredentials.api;
```

Add feature-specific users to `.env` with `TEST_*` prefix. See `.env.example`.

---

## Step-by-step onboarding

### 1 · Create structure

```bash
FEATURE=projects
mkdir -p automation/domains/${FEATURE}
mkdir -p automation/suites/${FEATURE}/{api,ui}
```

### 2 · `domains/{feature}/{feature}.schemas.ts` — Zod only

```typescript
import { z } from 'zod';

export const projectSchema = z.object({
  id: z.string(), name: z.string(),
});
```

### 3 · `domains/{feature}/{feature}.api-errors.ts`

```typescript
export const ProjectApiErrors = {
  notFound: { status: 404 as const, message: 'Project not found' },
} as const;
```

### 4 · `domains/{feature}/{feature}.ui-messages.ts`

```typescript
export const ProjectUiMessages = {
  form: { nameRequired: /Name is required/i },
  toast: { created: 'Project created successfully' },
} as const;
```

### 5 · `domains/{feature}/{feature}.fixture.ts`

```typescript
import { test as baseTest } from '@core/fixtures/base.fixture';
import { ProjectListPage } from '@pages/ProjectListPage';

export const test = baseTest.extend({
  projectListPage: async ({ page }, use) => {
    await use(new ProjectListPage(page));
  },
});

export { expect } from '@playwright/test';
```

### 6 · Spec imports

```typescript
import { testCredentials } from '@bootstrap/credentials';
import { ProjectApiErrors } from '@domains/projects/projects.api-errors';
import { projectSchema } from '@domains/projects/projects.schemas';

ApiAssertions.assertErrorResponse(res, ProjectApiErrors.notFound.status, ...);
```

---

## Checklist

- [ ] Credentials in `.env`, not in domain/spec files
- [ ] `domains/{feature}/` — schemas, api-errors, ui-messages, fixture
- [ ] `suites/{feature}/` — spec files only
- [ ] `npx tsc --noEmit` passes
