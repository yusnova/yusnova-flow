import { AsyncLocalStorage } from 'node:async_hooks'

export interface TestCredentials {
  readonly accessToken: string
  readonly refreshToken: string
  readonly username: string
}

export interface TestContextData {
  credentials: TestCredentials
  testKey: string
  startedAt: string
}

export interface ITestContext {
  getCredentials(): TestCredentials
  updateAccessToken(newToken: string): void
  getTestKey(): string
}

const OUT_OF_SCOPE =
  'TestContext used outside an active run — ensure the base fixture wraps the test.'

const storage = new AsyncLocalStorage<TestContextData>()

const requireStore = (): TestContextData => {
  const data = storage.getStore()
  if (!data) throw new Error(OUT_OF_SCOPE)
  return data
}

const createHandle = (data: TestContextData): ITestContext => ({
  getCredentials: () => data.credentials,
  updateAccessToken: (token) => {
    data.credentials = { ...data.credentials, accessToken: token }
  },
  getTestKey: () => data.testKey,
})

export const TestContext = {
  run<T>(data: TestContextData, fn: () => Promise<T>): Promise<T> {
    return storage.run(data, fn)
  },

  current(): ITestContext {
    return createHandle(requireStore())
  },

  currentData(): TestContextData {
    return requireStore()
  },
}
