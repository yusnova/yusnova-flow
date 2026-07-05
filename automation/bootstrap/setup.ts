import { test as setup, expect, type Page } from '@playwright/test'
import { AUTH_STATE_FILE, AUTH_STATE_FILES, activeEnv, configEnv } from './config'
import { testCredentials, type UserCredentials } from './credentials'

const { regularUser, adminUser } = testCredentials

async function uiLogin(page: Page, creds: UserCredentials): Promise<void> {
  await page.goto(configEnv.loginURL)
  await page.locator('[data-test="username"]').fill(creds.username)
  await page.locator('[data-test="password"]').fill(creds.password)
  await page.locator('[data-test="login-button"]').click()
  await expect(page).toHaveURL(/inventory/, { timeout: 15_000 })
  await page.locator('[data-test="inventory-item-name"]').first().waitFor({ state: 'visible' })
}

setup('[RegularUserSession] | verify that a regular user can successfully log in', async ({ page }) => {

  await setup.step('sign in as regular user on the login page', async () => {
    await uiLogin(page, regularUser)
  })

  await setup.step('save regular user session to auth-state.json', async () => {
    await page.context().storageState({ path: AUTH_STATE_FILE })
  })

})

setup('[AdminUserSession] | verify that an admin user can successfully log in', async ({ page }) => {
  setup.skip(activeEnv === 'demo', 'locked_out_user cannot sign in on demo SauceDemo')

  await setup.step('sign in as admin user on the login page', async () => {
    await uiLogin(page, adminUser)
  })

  await setup.step('save admin user session to admin-user-auth.json', async () => {
    await page.context().storageState({ path: AUTH_STATE_FILES.adminUser })
  })

})
