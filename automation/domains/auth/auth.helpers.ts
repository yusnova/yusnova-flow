import type { z } from 'zod'
import { apiAuthPayload, type UserCredentials } from '@bootstrap/credentials'
import { ApiAssertions } from '@core/api/api-assertions'
import type { FoundryAPI } from '@core/api/foundry-api'
import type { StateStore } from '@core/state/state-store'
import { loginResponseSchema } from './auth.schemas'

export type AuthSession = {
  accessToken: string
  refreshToken: string
}

export const SESSION_KEY = 'session'

export async function createAuthSession(
  foundryAPI: FoundryAPI,
  state: StateStore,
  creds: UserCredentials,
): Promise<AuthSession> {
  const res = await foundryAPI.Auth.authLogin(apiAuthPayload(creds))
  ApiAssertions.assertStatus(res, 200)
  ApiAssertions.assertSchema(res, loginResponseSchema)

  const data = res.data as z.infer<typeof loginResponseSchema>

  state.set(SESSION_KEY, {
    id: String(data.id),
    createdAt: Date.now(),
    meta: { username: data.username, email: data.email },
  })

  return { accessToken: data.accessToken, refreshToken: data.refreshToken }
}
