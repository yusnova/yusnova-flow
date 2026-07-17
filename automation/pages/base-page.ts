import { expect, type ConsoleMessage, Locator, Page, type Request } from '@playwright/test'

export class BasePage {
  readonly page: Page

  constructor(page: Page) {
    this.page = page
  }

  async selectOption(text: string, exact = false): Promise<void> {
    await this.page.getByRole('option', { name: text, exact }).click()
  }

  async selectDropdownOption(
    dropdown: Locator,
    optionText: string,
    comboboxInput: Locator,
    inputIndex?: number,
    useSelectOption = true,
  ): Promise<void> {
    await dropdown.click()
    const input = inputIndex !== undefined ? comboboxInput.nth(inputIndex) : comboboxInput
    await input.fill(optionText)
    if (useSelectOption) {
      await this.selectOption(optionText)
    } else {
      await this.page.getByText(optionText, { exact: true }).click()
    }
  }

  async clickByText(text: string): Promise<void> {
    await this.page.getByText(text, { exact: true }).click()
  }

  async clickByRole(text: string, index = 0, exact = false): Promise<void> {
    await this.page.getByRole('button', { name: text, exact }).nth(index).click()
  }

  /** Root content region for load assertions (locator lives in POM only). */
  get pageRoot(): Locator {
    return this.page.locator('main, [role="main"], body').first()
  }

  get validationError(): Locator {
    return this.page.locator('[role="alert"], [class*="error"]').first()
  }

  get searchResults(): Locator {
    return this.page.locator('[data-testid*="result"], [role="list"]').first()
  }

  async expectPageLoaded(): Promise<void> {
    await expect(this.pageRoot).toBeVisible()
  }

  async captureText(locator?: Locator): Promise<string> {
    const target = locator ?? this.pageRoot
    return ((await target.innerText().catch(() => '')) ?? '').trim()
  }

  async expectContentChanged(before: string, locator?: Locator): Promise<void> {
    const target = locator ?? this.pageRoot
    await expect
      .poll(async () => ((await target.innerText().catch(() => '')) ?? '').trim(), { timeout: 10_000 })
      .not.toBe(before)
  }

  async expectValidationError(): Promise<void> {
    await expect(this.validationError).toBeVisible()
  }

  async expectSearchResults(): Promise<void> {
    await expect(this.searchResults).toBeVisible()
  }

  async clickLinkByName(name: string): Promise<void> {
    await this.page.getByRole('link', { name }).click()
  }

  async click(target: Locator): Promise<void> {
    await target.click()
  }

  async fill(target: Locator, value: string): Promise<void> {
    await target.fill(value)
  }

  async check(target: Locator): Promise<void> {
    await target.check()
  }

  /** Click an element by raw CSS/attribute selector (fallback for codegen-recorded actions). */
  async clickBySelector(selector: string): Promise<void> {
    await this.page.locator(selector).first().click()
  }

  /** Fill an input by raw CSS/attribute selector (fallback for codegen-recorded actions). */
  async fillBySelector(selector: string, value: string): Promise<void> {
    await this.page.locator(selector).first().fill(value)
  }

  /** Select a native <select> option by raw CSS/attribute selector (fallback for codegen-recorded actions). */
  async selectBySelector(selector: string, value: string): Promise<void> {
    await this.page.locator(selector).first().selectOption(value)
  }

  async goBack(): Promise<void> {
    await this.page.goBack()
  }

  async clickButtonInTableCell(rowIndex: number, buttonIndex: number): Promise<void> {
    await this.page.locator(`#table-row-${rowIndex} button`).nth(buttonIndex).click()
  }

  async getTooltipText(
    locator: Locator,
    text: string,
    tooltip: Locator,
    index = 0,
  ): Promise<void> {
    await locator.hover()
    await tooltip.nth(index).waitFor({ state: 'visible' })
    await expect
      .poll(async () => (await tooltip.nth(index).textContent())?.trim(), { timeout: 5_000 })
      .toBe(text)
  }

  async verifyTextOnToastMessage(text: string, waitHidden = false): Promise<void> {
    const toastMessage = this.page
      .locator('[data-testid="toast"], [role="alert"], [class*="toast"], [class*="snackbar"]')
      .filter({ hasText: text })
    await expect(toastMessage).toBeVisible()
    if (waitHidden) await expect(toastMessage).toBeHidden()
  }

  async fileUpload(selector: Locator, filePath: string): Promise<void> {
    const [fileChooser] = await Promise.all([
      this.page.waitForEvent('filechooser'),
      selector.click(),
    ])
    await fileChooser.setFiles([filePath])
  }

  async clickAndWaitResponse(pathSegment: string, selector: Locator, status = 200): Promise<void> {
    await Promise.all([
      this.page.waitForResponse((res) => res.url().includes(pathSegment) && res.status() === status),
      selector.click(),
    ])
  }

  async gotoAndWaitResponse(url: string, pathSegment: string, status = 200): Promise<void> {
    await Promise.all([
      this.page.waitForResponse((res) => res.url().includes(pathSegment) && res.status() === status),
      this.page.goto(url),
    ])
  }

  waitForRequestCompletion(
    pathSegment: string,
    method = 'GET',
    timeout = 30_000,
  ): Promise<Request> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.page.off('requestfinished', handler)
        reject(
          new Error(
            `Timeout ${timeout}ms waiting for request with pathSegment=${pathSegment} and method=${method}`,
          ),
        )
      }, timeout)

      const handler = (request: Request) => {
        if (request.url().includes(pathSegment) && request.method() === method) {
          clearTimeout(timer)
          this.page.off('requestfinished', handler)
          resolve(request)
        }
      }

      this.page.on('requestfinished', handler)
    })
  }

  waitForConsoleLog(
    key: string,
    timeout = 15_000,
  ): Promise<{ found: boolean; value?: unknown }> {
    return new Promise((resolve) => {
      let resolved = false

      const cleanup = () => {
        if (!resolved) {
          clearTimeout(timer)
          this.page.off('console', listener)
        }
      }

      const listener = async (msg: ConsoleMessage) => {
        if (resolved) return

        for (const arg of msg.args()) {
          try {
            const json: unknown = await arg.jsonValue()
            if (
              json !== null &&
              typeof json === 'object' &&
              Object.prototype.hasOwnProperty.call(json, key)
            ) {
              resolved = true
              cleanup()
              resolve({ found: true, value: (json as Record<string, unknown>)[key] })
              return
            }
          } catch {}
        }
      }

      this.page.on('console', listener)

      const timer = setTimeout(() => {
        if (!resolved) {
          resolved = true
          cleanup()
          resolve({ found: false })
        }
      }, timeout)
    })
  }
}
