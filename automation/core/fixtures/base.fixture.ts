import { test as base, type Page } from '@playwright/test'
import axios from 'axios'
import * as dotenv from 'dotenv'
import { configEnv } from '@bootstrap/config'
import { apiAuthPayload, apiTestCredentials, testCredentials } from '@bootstrap/credentials'
import { FoundryAPI } from '@core/api/foundry-api'
import { paths } from '@core/infra/paths'
import { createStateStore, type StateStore } from '@core/state/state-store'
import { TestContext, type ITestContext, type TestContextData } from '@core/state/test-context'
import { BasePage } from '@pages/base-page'

dotenv.config({ path: paths.env })

export interface BoundPageFactory {
  create<T extends BasePage>(PageClass: new (page: Page) => T): T
}

export interface BaseFixtures {
  foundryAPI: FoundryAPI
  state: StateStore
  testContext: ITestContext
  pageFactory: BoundPageFactory
  testPage: Page
}

export interface WorkerFixtures {
  apiToken: string
}

type LoginResponse = { accessToken?: string; token?: string }

const WORKER_LOGIN_TIMEOUT_MS = 10_000

const fetchWorkerApiToken = async (): Promise<string> => {
  if (process.env['DEMO_SKIP_AUTH']?.trim().toLowerCase() === 'true') {
    return ''
  }

  try {
    const { data } = await axios.post<LoginResponse>(
      `${configEnv.apiBaseURL}/auth/login`,
      apiAuthPayload(apiTestCredentials.regularUser),
      { timeout: WORKER_LOGIN_TIMEOUT_MS },
    )
    return data.accessToken ?? data.token ?? ''
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    process.stderr.write(
      [
        '[base.fixture] Worker API login failed.',
        'Authenticated requests will run without a Bearer token and are likely to return 401.',
        `  endpoint : ${configEnv.apiBaseURL}/auth/login`,
        `  user     : ${apiTestCredentials.regularUser.username}`,
        `  reason   : ${reason}`,
        '  check    : API is up, ENV matches your target, .env has REGULAR_USER_USERNAME / REGULAR_USER_PASSWORD.',
      ].join('\n') + '\n',
    )
    return ''
  }
}

const buildTestContextData = (
  apiToken: string,
  workerIndex: number,
  title: string,
): TestContextData => ({
  credentials: {
    accessToken: apiToken,
    refreshToken: '',
    username: testCredentials.regularUser.username,
  },
  testKey: `${workerIndex}::${title}`,
  startedAt: new Date().toISOString(),
})

const clearBrowserSession = async (page: Page): Promise<void> => {
  try {
    await page.context().clearCookies()
    await page.evaluate(() => {
      localStorage.clear()
      sessionStorage.clear()
    })
  } catch {
    // page may already be closed after a fatal failure
  }
}

export const test = base.extend<BaseFixtures, WorkerFixtures>({
  apiToken: [
    async ({}, use) => {
      await use(await fetchWorkerApiToken())
    },
    { scope: 'worker' },
  ],

  testContext: [
    async ({ apiToken }, use, testInfo) => {
      const data = buildTestContextData(apiToken, testInfo.workerIndex, testInfo.title)
      await TestContext.run(data, async () => {
        await use(TestContext.current())
      })
    },
    { auto: true },
  ],

  foundryAPI: async ({ testContext }, use) => {
    const { accessToken } = testContext.getCredentials()
    await use(FoundryAPI.create(accessToken))
  },

  state: async ({ testContext: _ctx }, use) => {
    const store = createStateStore()
    await use(store)
    store.reset()
  },

  pageFactory: async ({ page }, use) => {
    await use({
      create: <T extends BasePage>(PageClass: new (page: Page) => T) => new PageClass(page),
    })
  },

  testPage: async ({ page }, use) => {
    await use(page)
    await clearBrowserSession(page)
  },
})

export { expect } from '@playwright/test'
