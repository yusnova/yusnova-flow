import { createAuthenticatedPage } from './browser-session'
import { scanPageElements } from './dom-scanner'
import { ElementMap } from '../types'

export { labelFromElement, propertyNameFromElement } from '@codegen-agent/locators/element-naming'

export class PageAnalyser {
  async analyse(url: string, headless: boolean, storageState?: string): Promise<ElementMap> {
    const { browser, page } = await createAuthenticatedPage({
      url,
      headless,
      ...(storageState ? { storageState } : {}),
    })

    try {
      const pageTitle = await page.title()
      const elements = await scanPageElements(page)

      return { url, pageTitle, elements, timestamp: new Date().toISOString() }
    } finally {
      await page.context().close()
      await browser.close()
    }
  }
}
