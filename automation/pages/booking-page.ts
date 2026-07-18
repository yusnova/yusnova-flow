import { Locator, Page } from '@playwright/test'
import { BasePage } from './base-page'

export class BookingPage extends BasePage {
  readonly postcodeInput: Locator
  readonly lookupButtonBtn: Locator
  readonly manualAddressToggleCheckbox: Locator
  readonly normalizeDemoBtn: Locator
  readonly confirmBookingBtn: Locator
  readonly startAgainBtn: Locator

  constructor(page: Page) {
    super(page)
    this.postcodeInput = page.locator("[data-testid=\"postcode-input\"]")
    this.lookupButtonBtn = page.locator("[data-testid=\"lookup-button\"]")
    this.manualAddressToggleCheckbox = page.locator("[data-testid=\"manual-address-toggle\"]")
    this.normalizeDemoBtn = page.locator("[data-testid=\"normalize-demo\"]")
    this.confirmBookingBtn = page.locator("[data-testid=\"confirm-booking\"]")
    this.startAgainBtn = page.locator("[data-testid=\"start-again\"]")
  }

  addressOption(optionId: string): Locator {
    return this.page.locator(`[data-testid="address-option-${optionId}"]`)
  }

  skipOption(optionId: string): Locator {
    return this.page.locator(`[data-testid="skip-option-${optionId}"]`)
  }

  wastePath(optionId: string): Locator {
    return this.page.locator(`[data-testid="waste-path-${optionId}"]`)
  }

  nextFrom(optionId: string): Locator {
    return this.page.locator(`[data-testid="next-from-${optionId}"]`)
  }

  backFrom(optionId: string): Locator {
    return this.page.locator(`[data-testid="back-from-${optionId}"]`)
  }

}
