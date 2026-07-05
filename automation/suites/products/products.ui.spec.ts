import { test, expect } from '@domains/products/products.fixture'
import { ProductsUiMessages } from '@domains/products/products.ui-messages'

const { pageTitle, sort, products } = ProductsUiMessages

test.describe('[Products] List', () => {

  test('[ProductList] | verify that the inventory page displays product items', async ({ inventoryPage }) => {
    await test.step('Navigate', async () => {
      await inventoryPage.goto()
    })
    await test.step('Assert product list', async () => {
      await expect(inventoryPage.page).toHaveURL(/inventory/)
      await expect(inventoryPage.pageTitle).toHaveText(pageTitle)
      await expect(inventoryPage.productItems).toHaveCount(6)
      await expect(inventoryPage.productNames.first()).toBeVisible()
    })
  })

})

test.describe('[Products] Sort', () => {

  test('[SortByPriceLowHigh] | verify that sorting by price low to high puts the cheapest item first', async ({ inventoryPage }) => {
    await test.step('Navigate and sort', async () => {
      await inventoryPage.goto()
      await inventoryPage.sortBy(sort.priceLowToHigh)
    })
    await test.step('Assert cheapest product is first', async () => {
      await expect(inventoryPage.productNames.first()).toHaveText(products.onesie)
    })
  })

})

test.describe('[Products] Cart', () => {

  test('[AddToCart] | verify that adding a product updates the cart badge count', async ({ inventoryPage }) => {
    await test.step('Navigate and add product', async () => {
      await inventoryPage.goto()
      await inventoryPage.addToCart(products.backpack)
    })
    await test.step('Assert cart badge', async () => {
      await expect(inventoryPage.cartBadge).toHaveText('1')
    })
  })

  test('[RemoveFromCart] | verify that removing a product clears the cart badge', async ({ inventoryPage }) => {
    await test.step('Navigate, add then remove product', async () => {
      await inventoryPage.goto()
      await inventoryPage.addToCart(products.backpack)
      await inventoryPage.removeFromCart(products.backpack)
    })
    await test.step('Assert cart badge is hidden', async () => {
      await expect(inventoryPage.cartBadge).toBeHidden()
    })
  })

})

test.describe('[Products] Detail', () => {

  test('[ProductDetail] | verify that clicking a product name opens the detail page', async ({ inventoryPage }) => {
    await test.step('Navigate and open product', async () => {
      await inventoryPage.goto()
      await inventoryPage.openProductDetail(products.backpack)
    })
    await test.step('Assert detail page URL', async () => {
      await expect(inventoryPage.page).toHaveURL(/inventory-item/)
    })
  })

})
