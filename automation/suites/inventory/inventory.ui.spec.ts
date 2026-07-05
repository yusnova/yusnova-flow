import { test, expect } from '@domains/inventory/inventory.fixture'

test.describe('[] Explore', () => {
  test('[RecordedClickThrough] | verify that recorded click-through flow covers page interactions', async ({ inventoryPage }) => {
    await test.step('Navigate to page', async () => {
      await inventoryPage.page.goto("/inventory.html")
      await inventoryPage.selectProductSort("Name (A to Z)")
      await inventoryPage.selectProductSort("Name (Z to A)")
      await inventoryPage.selectProductSort("Price (low to high)")
      await inventoryPage.selectProductSort("Price (high to low)")
      await inventoryPage.clickReactBurgerMenu()
      await inventoryPage.page.locator("#react-burger-cross-btn").click()
      await inventoryPage.addProductToCart("sauce-labs-fleece-jacket")
      await inventoryPage.addProductToCart("sauce-labs-backpack")
      await inventoryPage.addProductToCart("sauce-labs-bolt-t-shirt")
      await inventoryPage.addProductToCart("test.allthethings()-t-shirt-(red)")
      await inventoryPage.addProductToCart("sauce-labs-bike-light")
    })
    await test.step('Interact with inventory elements', async () => {
    })
  })

})
test.describe('[] List', () => {
  test('[TheInventoryPage] | verify that the inventory page displays product items', async ({ inventoryPage }) => {
    await test.step('Navigate to page', async () => {
      await inventoryPage.page.goto("/inventory.html")
    })
    await test.step('Assert product list', async () => {
      await expect(inventoryPage.page).toHaveURL(/inventory/)
      await expect(inventoryPage.inventoryItemName).toHaveCount(6)
    })
  })

})
test.describe('[] Sort', () => {
  test('[SortingByPrice] | verify that sorting by price low to high reorders products', async ({ inventoryPage }) => {
    await test.step('Navigate to page', async () => {
      await inventoryPage.page.goto("/inventory.html")
    })
    await test.step('Sort products', async () => {
      await inventoryPage.selectProductSort('Price (low to high)')
    })
    await test.step('Assert sort applied', async () => {
      await expect(inventoryPage.inventoryItemName.first()).toBeVisible()
    })
  })

})
test.describe('[] Cart', () => {
  test('[AddingAProduct] | verify that adding a product updates the cart badge count', async ({ inventoryPage }) => {
    await test.step('Navigate to page', async () => {
      await inventoryPage.page.goto("/inventory.html")
    })
    await test.step('Add product to cart', async () => {
      await inventoryPage.addProductToCart('sauce-labs-backpack')
    })
    await test.step('Assert cart badge', async () => {
      await expect(inventoryPage.shoppingCartLink).toBeVisible()
    })
  })

})
test.describe('[] Detail', () => {
  test('[ClickingAProduct] | verify that clicking a product name opens the detail page', async ({ inventoryPage }) => {
    await test.step('Navigate to page', async () => {
      await inventoryPage.page.goto("/inventory.html")
    })
    await test.step('Open product detail', async () => {
      await inventoryPage.openItemTitle(0)
    })
    await test.step('Assert detail page URL', async () => {
      await expect(inventoryPage.page).toHaveURL(/inventory-item/)
    })
  })

})
