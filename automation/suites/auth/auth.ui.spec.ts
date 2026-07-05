import { test, expect } from '@domains/auth/auth.fixture'
import { testCredentials } from '@bootstrap/credentials'
import { AuthUiMessages } from '@domains/auth/auth.ui-messages'

const { regularUser, adminUser } = testCredentials
const { login } = AuthUiMessages

test.describe('[Login] Happy Path', () => {

  test('[LoginHappyPath] | verify that valid credentials redirect to the inventory page', async ({ loginPage }) => {
    await test.step('Navigate', async () => {
      await loginPage.page.goto('/')
    })
    await test.step('Login', async () => {
      await loginPage.login(regularUser.username, regularUser.password)
    })
    await test.step('Assert redirect', async () => {
      await expect(loginPage.page).toHaveURL(/inventory/, { timeout: 15_000 })
    })
  })

})

test.describe('[Login] Validation', () => {

  test('[EmptyUsername] | verify that submitting without a username shows a required-field error', async ({ loginPage }) => {
    await test.step('Navigate', async () => {
      await loginPage.page.goto('/')
    })
    await test.step('Submit with empty username', async () => {
      await loginPage.passwordInput.fill(regularUser.password)
      await loginPage.submitBtn.click()
    })
    await test.step('Assert error', async () => {
      await expect(loginPage.errorMessage).toContainText(login.emptyUsername.message)
    })
  })

  test('[EmptyPassword] | verify that submitting without a password shows a required-field error', async ({ loginPage }) => {
    await test.step('Navigate', async () => {
      await loginPage.page.goto('/')
    })
    await test.step('Submit with empty password', async () => {
      await loginPage.usernameInput.fill(regularUser.username)
      await loginPage.submitBtn.click()
    })
    await test.step('Assert error', async () => {
      await expect(loginPage.errorMessage).toContainText(login.emptyPassword.message)
    })
  })

  test('[WrongCredentials] | verify that wrong credentials show an authentication error', async ({ loginPage }) => {
    await test.step('Navigate', async () => {
      await loginPage.page.goto('/')
    })
    await test.step('Submit with wrong password', async () => {
      await loginPage.login(regularUser.username, 'totally_wrong_password')
    })
    await test.step('Assert error and still on login page', async () => {
      await expect(loginPage.errorMessage).toContainText(login.wrongCredentials.message)
      await expect(loginPage.submitBtn).toBeVisible()
    })
  })

  test('[LockedUser] | verify that a locked-out user cannot log in and sees a lock error', async ({ loginPage }) => {
    await test.step('Navigate', async () => {
      await loginPage.page.goto('/')
    })
    await test.step('Login as locked user', async () => {
      await loginPage.login(adminUser.username, adminUser.password)
    })
    await test.step('Assert locked-out error', async () => {
      await expect(loginPage.errorMessage).toContainText(login.lockedOut.message)
      await expect(loginPage.submitBtn).toBeVisible()
    })
  })

})

test.describe('[Login] Accessibility', () => {

  test('[TabNavigation] | verify that Tab key reaches focusable form fields', async ({ loginPage, testPage }) => {
    await test.step('Navigate', async () => {
      await loginPage.page.goto('/')
    })
    await test.step('Tab through form', async () => {
      await testPage.keyboard.press('Tab')
      const tag = await testPage.evaluate(() => document.activeElement?.tagName.toLowerCase())
      expect(['input', 'button', 'a']).toContain(tag)
    })
  })

})
