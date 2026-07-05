# Skill: API Test Pattern
> Read this skill before creating or editing any `.api.spec.ts` file.

## File location

```
automation/suites/{feature}/api/{feature}.api.spec.ts
```

---

## Required imports

```typescript
import { test, expect } from '@domains/{feature}.fixture';
import { ApiAssertions } from '@core/api/ApiAssertions';
import { loginResponseSchema, AuthApiErrors, errorResponseSchema } from '@domains/{feature}.domain';
```

---

## FoundryAPI call pattern

```typescript
// After running `npm run swagger:api`, methods are fully typed:
const activityRes = await foundryAPI.User.v1UserActivityGet();
const userRes     = await foundryAPI.User.v1UserIdGet(userId);
const createRes   = await foundryAPI.Project.v1ProjectPost(projectCreateBody);
const updateRes   = await foundryAPI.Project.v1ProjectIdPut(projectId, updateBody);
const deleteRes   = await foundryAPI.Project.v1ProjectIdDelete(projectId);

// Unauthenticated calls (login endpoint, public health, etc.):
const anonAPI = FoundryAPI.createAnonymous();
const loginRes = await anonAPI.Auth.v1AuthLoginPost(credentials);
```

---

## Request body shapes

```typescript
// Simple body:
const res = await foundryAPI.User.v1UserPost({
  name: 'Alice',
  email: 'alice@example.com',
  role: 'viewer',
});

// Nested / complex body:
const res = await foundryAPI.Pipeline.v1PipelinePost({
  name: 'My Pipeline',
  stages: [
    { type: 'extract', config: { source: 's3://bucket/path' } },
    { type: 'transform', config: { script: 'transform.py' } },
  ],
});

// Discriminated union body (multiple valid shapes):
type TriggerBody = ManualTrigger | ScheduleTrigger;
const res = await foundryAPI.Pipeline.v1PipelineRunPost(
  triggerBody satisfies TriggerBody,
);

// Path param + body:
const res = await foundryAPI.Project.v1ProjectIdPut(projectId, {
  name: 'Updated Name',
});
```

---

## Complete spec structure

```typescript
import { test, expect } from '@domains/auth/auth.fixture';
import { testCredentials } from '@bootstrap/credentials';
import { ApiAssertions } from '@core/api/ApiAssertions';
import { loginResponseSchema } from '@domains/auth/auth.schemas';
import { AuthApiErrors } from '@domains/auth/auth.api-errors';

test.describe('@feature Feature API – Resource', () => {

  test('POST /v1/resource returns 201', async ({ foundryAPI }) => {

    // ── Arrange ───────────────────────────────────────────────────────────
    const payload = new ResourceBuilder().withValidData().build();

    // ── Act ───────────────────────────────────────────────────────────────
    let res: Awaited<ReturnType<typeof foundryAPI.Resource.v1ResourcePost>>;
    await test.step('POST /v1/resource', async () => {
      res = await foundryAPI.Resource.v1ResourcePost(payload);
    });

    // ── Assert ────────────────────────────────────────────────────────────
    await test.step('Assert 201 and schema', async () => {
      ApiAssertions.assertStatus(res!, 201);
      ApiAssertions.assertSchema(res!, loginResponseSchema);
    });
  });

});
```

---

## Status assertion matrix

```typescript
ApiAssertions.assertStatus(res, 200);           // OK
ApiAssertions.assertStatus(res, 201);           // Created
ApiAssertions.assertStatus(res, 204);           // No Content

ApiAssertions.assertStatus(res, 400);           // Bad Request
ApiAssertions.assertErrorResponse(res, 400, errorResponseSchema, 'Invalid credentials');

// Foundry-style { code, message }:
ApiAssertions.assertErrorShape(res, {
  code: /VALIDATION_ERROR|BAD_REQUEST/,
  message: /.+/,
});

ApiAssertions.assertStatus(res, 401);           // Unauthorised
ApiAssertions.assertStatus(res, 403);           // Forbidden
ApiAssertions.assertStatus(res, 404);           // Not Found
ApiAssertions.assertStatus(res, 409);           // Conflict
ApiAssertions.assertStatus(res, 422);           // Unprocessable
ApiAssertions.assertStatus(res, 500);           // Server Error
```

---

## Concurrent calls (never sequential await in a loop)

```typescript
// ✓ Correct
const [userRes, activityRes] = await Promise.all([
  foundryAPI.User.v1UserIdGet(userId),
  foundryAPI.User.v1UserActivityGet(),
]);

// ✗ Wrong — sequential latency
for (const id of ids) {
  await foundryAPI.Resource.v1ResourceIdGet(id); // bad
}
```

---

## swagger:api workflow

```bash
# 1. Update the OpenAPI spec path in .env:
SWAGGER_PATH=../api/openapi.json

# 2. Generate the TypeScript client:
npm run swagger:api

# After generation, core/api/generated/index.ts is replaced by the real client.
# FoundryAPI.ts imports the generated classes automatically.
```

---

## Checklist before committing an API spec

- [ ] `foundryAPI.*` used (not axios directly)
- [ ] `ApiAssertions.assertStatus()` on every response
- [ ] At least one body assertion per test
- [ ] `Promise.all()` for concurrent independent calls
- [ ] All steps in `test.step()`
- [ ] `test.describe()` wraps all tests
- [ ] Builder used for all request payloads (no inline objects in tests)
- [ ] Tags: `@{feature}` on every test
