import { test as baseTest } from '@core/fixtures/base.fixture'
import { InventoryPage } from '@pages/inventory-page'

interface InventoryFixtures {
  inventoryPage: InventoryPage
}

export const test = baseTest.extend<InventoryFixtures>({
  inventoryPage: async ({ page }, use) => {
    await use(new InventoryPage(page))
  },
})

export { expect } from '@playwright/test'
