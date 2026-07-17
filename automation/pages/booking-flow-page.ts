import { Locator, Page } from '@playwright/test'
import { BasePage } from './base-page'

export class BookingFlowPage extends BasePage {
  readonly postcodeInput: Locator
  readonly lookupButtonBtn: Locator
  readonly manualAddressToggleCheckbox: Locator
  readonly nextFromStep1Btn: Locator
  readonly addressOptionAddr1Radio: Locator
  readonly addressOptionAddr2Radio: Locator
  readonly addressOptionAddr3Radio: Locator
  readonly addressOptionAddr4Radio: Locator
  readonly addressOptionAddr5Radio: Locator
  readonly addressOptionAddr6Radio: Locator
  readonly addressOptionAddr7Radio: Locator
  readonly addressOptionAddr8Radio: Locator
  readonly addressOptionAddr9Radio: Locator
  readonly addressOptionAddr10Radio: Locator
  readonly addressOptionAddr11Radio: Locator
  readonly addressOptionAddr12Radio: Locator
  readonly wastePathGeneralBtn: Locator
  readonly wastePathHeavyBtn: Locator
  readonly wastePathPlasterboardBtn: Locator
  readonly backFromStep2Btn: Locator
  readonly nextFromStep2Btn: Locator
  readonly skipOption2YardRadio: Locator
  readonly skipOption3YardRadio: Locator
  readonly skipOption4YardRadio: Locator
  readonly skipOption6YardRadio: Locator
  readonly skipOption8YardRadio: Locator
  readonly skipOption10YardRadio: Locator
  readonly skipOption12YardRadio: Locator
  readonly skipOption14YardRadio: Locator
  readonly normalizeDemoBtn: Locator
  readonly backFromStep3Btn: Locator
  readonly nextFromStep3Btn: Locator
  readonly backFromStep4Btn: Locator
  readonly confirmBookingBtn: Locator
  readonly startAgainBtn: Locator

  constructor(page: Page) {
    super(page)
    this.postcodeInput = page.locator("[data-testid=\"postcode-input\"]")
    this.lookupButtonBtn = page.locator("[data-testid=\"lookup-button\"]")
    this.manualAddressToggleCheckbox = page.locator("[data-testid=\"manual-address-toggle\"]")
    this.nextFromStep1Btn = page.locator("[data-testid=\"next-from-step1\"]")
    this.addressOptionAddr1Radio = page.locator("[data-testid=\"address-option-addr_1\"]")
    this.addressOptionAddr2Radio = page.locator("[data-testid=\"address-option-addr_2\"]")
    this.addressOptionAddr3Radio = page.locator("[data-testid=\"address-option-addr_3\"]")
    this.addressOptionAddr4Radio = page.locator("[data-testid=\"address-option-addr_4\"]")
    this.addressOptionAddr5Radio = page.locator("[data-testid=\"address-option-addr_5\"]")
    this.addressOptionAddr6Radio = page.locator("[data-testid=\"address-option-addr_6\"]")
    this.addressOptionAddr7Radio = page.locator("[data-testid=\"address-option-addr_7\"]")
    this.addressOptionAddr8Radio = page.locator("[data-testid=\"address-option-addr_8\"]")
    this.addressOptionAddr9Radio = page.locator("[data-testid=\"address-option-addr_9\"]")
    this.addressOptionAddr10Radio = page.locator("[data-testid=\"address-option-addr_10\"]")
    this.addressOptionAddr11Radio = page.locator("[data-testid=\"address-option-addr_11\"]")
    this.addressOptionAddr12Radio = page.locator("[data-testid=\"address-option-addr_12\"]")
    this.wastePathGeneralBtn = page.locator("[data-testid=\"waste-path-general\"]")
    this.wastePathHeavyBtn = page.locator("[data-testid=\"waste-path-heavy\"]")
    this.wastePathPlasterboardBtn = page.locator("[data-testid=\"waste-path-plasterboard\"]")
    this.backFromStep2Btn = page.locator("[data-testid=\"back-from-step2\"]")
    this.nextFromStep2Btn = page.locator("[data-testid=\"next-from-step2\"]")
    this.skipOption2YardRadio = page.locator("[data-testid=\"skip-option-2-yard\"]")
    this.skipOption3YardRadio = page.locator("[data-testid=\"skip-option-3-yard\"]")
    this.skipOption4YardRadio = page.locator("[data-testid=\"skip-option-4-yard\"]")
    this.skipOption6YardRadio = page.locator("[data-testid=\"skip-option-6-yard\"]")
    this.skipOption8YardRadio = page.locator("[data-testid=\"skip-option-8-yard\"]")
    this.skipOption10YardRadio = page.locator("[data-testid=\"skip-option-10-yard\"]")
    this.skipOption12YardRadio = page.locator("[data-testid=\"skip-option-12-yard\"]")
    this.skipOption14YardRadio = page.locator("[data-testid=\"skip-option-14-yard\"]")
    this.normalizeDemoBtn = page.locator("[data-testid=\"normalize-demo\"]")
    this.backFromStep3Btn = page.locator("[data-testid=\"back-from-step3\"]")
    this.nextFromStep3Btn = page.locator("[data-testid=\"next-from-step3\"]")
    this.backFromStep4Btn = page.locator("[data-testid=\"back-from-step4\"]")
    this.confirmBookingBtn = page.locator("[data-testid=\"confirm-booking\"]")
    this.startAgainBtn = page.locator("[data-testid=\"start-again\"]")
  }

  async fillPostcode(value: string): Promise<void> {
    await this.postcodeInput.fill(value)
  }

  async toggleManualAddressToggle(check: boolean): Promise<void> {
    if (check) { await this.manualAddressToggleCheckbox.check() } else { await this.manualAddressToggleCheckbox.uncheck() }
  }

  async toggleAddressOptionAddr1Radio(check: boolean): Promise<void> {
    if (check) { await this.addressOptionAddr1Radio.check() } else { await this.addressOptionAddr1Radio.uncheck() }
  }

  async toggleAddressOptionAddr2Radio(check: boolean): Promise<void> {
    if (check) { await this.addressOptionAddr2Radio.check() } else { await this.addressOptionAddr2Radio.uncheck() }
  }

  async toggleAddressOptionAddr3Radio(check: boolean): Promise<void> {
    if (check) { await this.addressOptionAddr3Radio.check() } else { await this.addressOptionAddr3Radio.uncheck() }
  }

  async toggleAddressOptionAddr4Radio(check: boolean): Promise<void> {
    if (check) { await this.addressOptionAddr4Radio.check() } else { await this.addressOptionAddr4Radio.uncheck() }
  }

  async toggleAddressOptionAddr5Radio(check: boolean): Promise<void> {
    if (check) { await this.addressOptionAddr5Radio.check() } else { await this.addressOptionAddr5Radio.uncheck() }
  }

  async toggleAddressOptionAddr6Radio(check: boolean): Promise<void> {
    if (check) { await this.addressOptionAddr6Radio.check() } else { await this.addressOptionAddr6Radio.uncheck() }
  }

  async toggleAddressOptionAddr7Radio(check: boolean): Promise<void> {
    if (check) { await this.addressOptionAddr7Radio.check() } else { await this.addressOptionAddr7Radio.uncheck() }
  }

  async toggleAddressOptionAddr8Radio(check: boolean): Promise<void> {
    if (check) { await this.addressOptionAddr8Radio.check() } else { await this.addressOptionAddr8Radio.uncheck() }
  }

  async toggleAddressOptionAddr9Radio(check: boolean): Promise<void> {
    if (check) { await this.addressOptionAddr9Radio.check() } else { await this.addressOptionAddr9Radio.uncheck() }
  }

  async toggleAddressOptionAddr10Radio(check: boolean): Promise<void> {
    if (check) { await this.addressOptionAddr10Radio.check() } else { await this.addressOptionAddr10Radio.uncheck() }
  }

  async toggleAddressOptionAddr11Radio(check: boolean): Promise<void> {
    if (check) { await this.addressOptionAddr11Radio.check() } else { await this.addressOptionAddr11Radio.uncheck() }
  }

  async toggleAddressOptionAddr12Radio(check: boolean): Promise<void> {
    if (check) { await this.addressOptionAddr12Radio.check() } else { await this.addressOptionAddr12Radio.uncheck() }
  }

  async toggleSkipOption2YardRadio(check: boolean): Promise<void> {
    if (check) { await this.skipOption2YardRadio.check() } else { await this.skipOption2YardRadio.uncheck() }
  }

  async toggleSkipOption3YardRadio(check: boolean): Promise<void> {
    if (check) { await this.skipOption3YardRadio.check() } else { await this.skipOption3YardRadio.uncheck() }
  }

  async toggleSkipOption4YardRadio(check: boolean): Promise<void> {
    if (check) { await this.skipOption4YardRadio.check() } else { await this.skipOption4YardRadio.uncheck() }
  }

  async toggleSkipOption6YardRadio(check: boolean): Promise<void> {
    if (check) { await this.skipOption6YardRadio.check() } else { await this.skipOption6YardRadio.uncheck() }
  }

  async toggleSkipOption8YardRadio(check: boolean): Promise<void> {
    if (check) { await this.skipOption8YardRadio.check() } else { await this.skipOption8YardRadio.uncheck() }
  }

  async toggleSkipOption10YardRadio(check: boolean): Promise<void> {
    if (check) { await this.skipOption10YardRadio.check() } else { await this.skipOption10YardRadio.uncheck() }
  }

  async toggleSkipOption12YardRadio(check: boolean): Promise<void> {
    if (check) { await this.skipOption12YardRadio.check() } else { await this.skipOption12YardRadio.uncheck() }
  }

  async toggleSkipOption14YardRadio(check: boolean): Promise<void> {
    if (check) { await this.skipOption14YardRadio.check() } else { await this.skipOption14YardRadio.uncheck() }
  }

}
