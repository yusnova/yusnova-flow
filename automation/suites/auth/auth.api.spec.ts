import { test, expect } from '@domains/auth/auth.fixture'
import { apiAuthPayload, apiTestCredentials } from '@bootstrap/credentials'
import { ApiAssertions, type HttpResponse } from '@core/api/api-assertions'
import { withExpectedStatus } from '@core/api/axios-client'
import { errorResponseSchema } from '@core/api/common-schemas'
import { createAuthSession } from '@domains/auth/auth.helpers'
import { AuthApiErrors } from '@domains/auth/auth.api-errors'
import { loginResponseSchema, refreshResponseSchema } from '@domains/auth/auth.schemas'
import type { LoginResponse } from '@core/api/generated'

const { regularUser } = apiTestCredentials

test.describe('[AuthAPI] State flow', () => {

  test('[LoginThenRefreshChain] | verify that a stored session supports a follow-up refresh call', async ({ foundryAPI, state }) => {
    let refreshToken = ''

    await test.step('create auth session via API and store user id in state', async () => {
      const session = await createAuthSession(foundryAPI, state, regularUser)
      refreshToken = session.refreshToken
    })

    await test.step('refresh tokens using output from the prior step', async () => {
      const res = await foundryAPI.Auth.authRefresh({ refreshToken, expiresInMins: 30 })
      ApiAssertions.assertStatus(res, 200)
      ApiAssertions.assertSchema(res, refreshResponseSchema)
    })

    await test.step('assert session identity is still available in state', async () => {
      const { id, meta } = state.get('session')
      expect(id).not.toBe('')
      expect(meta?.['username']).toBeTruthy()
    })
  })

  test('[LoginWithLocalPayload] | verify that login response matches local payload without storing the full body', async ({ foundryAPI, state }) => {
    const payload = { ...apiAuthPayload(regularUser), expiresInMins: 60 }

    await test.step('submit login and store only id plus minimal meta', async () => {
      const res = await foundryAPI.Auth.authLogin(payload)
      ApiAssertions.assertStatus(res, 200)
      const data = loginResponseSchema.parse(res.data)

      state.set('session', {
        id: String(data.id),
        createdAt: Date.now(),
        meta: { username: data.username },
      })

      expect(data.username).toBe(regularUser.username)
    })

    await test.step('read session from state for a downstream API step', async () => {
      const { id, meta } = state.get('session')
      expect(id).not.toBe('')
      expect(meta?.['username']).toBe(regularUser.username)
    })
  })

})

test.describe('[AuthAPI] Login', () => {

  test('[LoginWithValidCredentials] | verify that valid credentials return 200 with access and refresh tokens', async ({ foundryAPI }) => {
    let res: HttpResponse<LoginResponse>

    await test.step('POST /auth/login', async () => {
      res = await foundryAPI.Auth.authLogin({
        ...apiAuthPayload(regularUser),
        expiresInMins: 60,
      })
    })

    await test.step('Assert 200 + token schema', async () => {
      ApiAssertions.assertStatus(res, 200)
      ApiAssertions.assertSchema(res, loginResponseSchema)
    })
  })

  test('[LoginWithWrongPassword] | verify that wrong password returns 400 with an error message', async ({ foundryAPI }) => {
    let res: HttpResponse<unknown>

    await test.step('POST /auth/login with wrong password', async () => {
      res = await foundryAPI.Auth.authLogin(
        { ...apiAuthPayload({ ...regularUser, password: 'totally-wrong-password' }) },
        withExpectedStatus(400),
      )
    })

    await test.step('Assert 400 + invalid credentials error', async () => {
      ApiAssertions.assertErrorResponse(
        res,
        AuthApiErrors.login.invalidCredentials.status,
        errorResponseSchema,
        AuthApiErrors.login.invalidCredentials.message,
      )
    })
  })

  test('[LoginWithEmptyEmail] | verify that empty email returns 400 with a validation message', async ({ foundryAPI }) => {
    let res: HttpResponse<unknown>

    await test.step('POST /auth/login with empty email', async () => {
      res = await foundryAPI.Auth.authLogin(
        { ...apiAuthPayload({ ...regularUser, username: '' }) },
        withExpectedStatus(400),
      )
    })

    await test.step('Assert 400 + missing credentials error', async () => {
      ApiAssertions.assertErrorResponse(
        res,
        AuthApiErrors.login.missingCredentials.status,
        errorResponseSchema,
        AuthApiErrors.login.missingCredentials.message,
      )
    })
  })

})

test.describe('[AuthAPI] Token', () => {

  test('[RefreshToken] | verify that a valid refresh token returns a new token pair', async ({ foundryAPI, state }) => {
    let refreshToken = ''
    let res: HttpResponse<unknown>

    await test.step('login via API and store user session', async () => {
      const session = await createAuthSession(foundryAPI, state, regularUser)
      refreshToken = session.refreshToken
    })

    await test.step('POST /auth/refresh with valid token', async () => {
      res = await foundryAPI.Auth.authRefresh({ refreshToken, expiresInMins: 30 })
    })

    await test.step('Assert 200 + new token schema', async () => {
      ApiAssertions.assertStatus(res, 200)
      ApiAssertions.assertSchema(res, refreshResponseSchema)
    })
  })

})

test.describe('[AuthAPI] Parallel', () => {

  test('[ConcurrentLoginAndProducts] | verify that concurrent login and products requests both succeed', async ({ foundryAPI }) => {
    let loginRes: Awaited<ReturnType<typeof foundryAPI.Auth.authLogin>>
    let productsRes: Awaited<ReturnType<typeof foundryAPI.Products.productsList>>

    await test.step('run login and products requests in parallel', async () => {
      const results = await Promise.all([
        foundryAPI.Auth.authLogin(apiAuthPayload(regularUser)),
        foundryAPI.Products.productsList(1),
      ])
      loginRes = results[0]
      productsRes = results[1]
    })

    await test.step('assert both responses succeed', async () => {
      ApiAssertions.assertStatus(loginRes!, 200)
      expect(productsRes!.status).toBe(200)
    })
  })

})
