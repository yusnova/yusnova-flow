import * as dotenv from 'dotenv'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { chromium, type Browser, type BrowserContext, type Page } from '@playwright/test'

const AUTOMATION_ROOT = path.resolve(__dirname, '..', '..')
const AUTH_STATE_FILE = path.join(AUTOMATION_ROOT, 'core/fixtures/auth-state.json')
const FIXTURES_DIR = path.join(AUTOMATION_ROOT, 'core/fixtures')

dotenv.config({ path: path.join(AUTOMATION_ROOT, '.env') })

const LOGIN_URLS: Record<string, string> = {
  demo: 'https://www.saucedemo.com',
  dev: 'https://dev-saucedemo.net/beta/login',
  staging: 'https://staging-saucedemo.net/beta/login',
}

export interface BrowserSessionOptions {
  url: string
  headless: boolean
  storageState?: string
}

export async function createAuthenticatedPage(
  opts: BrowserSessionOptions,
): Promise<{ browser: Browser; context: BrowserContext; page: Page }> {
  const storagePath = resolveStorageStatePath(opts.storageState)
  const browser = await chromium.launch({ headless: opts.headless })
  const context = await browser.newContext(storagePath ? { storageState: storagePath } : {})
  const page = await context.newPage()

  await gotoTargetWithAuth(page, opts.url)

  return { browser, context, page }
}

export async function gotoTargetWithAuth(page: Page, targetUrl: string): Promise<void> {
  await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await page.waitForLoadState('networkidle').catch(() => undefined)

  if (!(await isLoginPage(page))) return

  console.log('   \x1b[33m⚠\x1b[0m  Login required — signing in automatically (REGULAR_USER from .env)…')
  await performUiLogin(page)

  await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 })
  await page.waitForLoadState('networkidle').catch(() => undefined)

  if (await isLoginPage(page)) {
    throw new Error(
      'Still on login page after automatic sign-in. Check .env credentials (REGULAR_USER_*) or pass --storage-state.',
    )
  }

  await persistStorageState(page.context())
  console.log('   \x1b[32m✓\x1b[0m  Session saved → core/fixtures/auth-state.json')
}

function resolveStorageStatePath(explicit?: string): string | undefined {
  if (explicit) {
    const resolved = path.isAbsolute(explicit) ? explicit : path.resolve(AUTOMATION_ROOT, explicit)
    if (fs.existsSync(resolved)) return resolved
  }

  if (fs.existsSync(AUTH_STATE_FILE)) return AUTH_STATE_FILE
  return undefined
}

function getLoginURL(): string {
  const env = process.env['ENV']?.trim() ?? 'demo'
  return LOGIN_URLS[env] ?? process.env['LOGIN_URL']?.trim() ?? LOGIN_URLS.demo!
}

function getCredentials(): { username: string; password: string } {
  const username = process.env['REGULAR_USER_USERNAME']?.trim()
  const password = process.env['REGULAR_USER_PASSWORD']?.trim()

  if (!username || !password) {
    throw new Error('.env missing REGULAR_USER_USERNAME or REGULAR_USER_PASSWORD')
  }

  return { username, password }
}

async function isLoginPage(page: Page): Promise<boolean> {
  if (await page.locator('[data-test="login-button"]').count()) return true

  const passwordFields = await page.locator('input[type="password"]:visible').count()
  const submitButtons = await page.locator(
    'button[type="submit"]:visible, input[type="submit"]:visible, [data-test*="login" i]:visible',
  ).count()

  return passwordFields > 0 && submitButtons > 0
}

async function performUiLogin(page: Page): Promise<void> {
  const { username, password } = getCredentials()

  if (!(await page.locator('[data-test="username"]').count())) {
    await page.goto(getLoginURL(), { waitUntil: 'domcontentloaded', timeout: 60_000 })
  }

  const usernameField = page.locator('[data-test="username"]')
  const passwordField = page.locator('[data-test="password"]')
  const loginButton = page.locator('[data-test="login-button"]')

  if (await usernameField.count()) {
    await usernameField.fill(username)
    await passwordField.fill(password)
    await loginButton.click()
    await page.waitForLoadState('networkidle').catch(() => undefined)
    return
  }

  const passwordInput = page.locator('input[type="password"]:visible').first()
  await passwordInput.waitFor({ state: 'visible', timeout: 15_000 })

  const userInput = page
    .locator('input[type="email"]:visible, input[type="text"]:visible, input[name*="user" i]:visible')
    .first()
  await userInput.fill(username)
  await passwordInput.fill(password)
  await page.locator('button[type="submit"]:visible, input[type="submit"]:visible').first().click()
  await page.waitForLoadState('networkidle').catch(() => undefined)
}

async function persistStorageState(context: BrowserContext): Promise<void> {
  fs.mkdirSync(FIXTURES_DIR, { recursive: true })
  await context.storageState({ path: AUTH_STATE_FILE })
}
