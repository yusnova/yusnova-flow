import { test as baseTest } from '@core/fixtures/base.fixture'
import { InventoryPage } from '@pages/inventory-page'

interface ProductsFixtures {
  inventoryPage: InventoryPage
}

export const test = baseTest.extend<ProductsFixtures>({
  inventoryPage: async ({ page }, use) => {
    await use(new InventoryPage(page))
  },
})

export { expect } from '@playwright/test'
