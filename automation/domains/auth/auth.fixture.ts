import { test as baseTest } from '@core/fixtures/base.fixture'
import { LoginPage } from '@pages/login-page'

interface AuthFixtures {
  loginPage: LoginPage
}

export const test = baseTest.extend<AuthFixtures>({
  loginPage: async ({ page }, use) => {
    await use(new LoginPage(page))
  },
})

export { expect } from '@playwright/test'
