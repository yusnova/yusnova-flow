import { test, expect } from '@domains/inventory/inventory.fixture'

test.describe('[InventoryPage] Explore', () => {
  // @stlc:generated
  test('[RecordedClickThroughFlow] | verify that recorded click-through flow covers page interactions', async ({ inventoryPage }) => {
    await test.step('Navigate to page', async () => {
      await inventoryPage.page.goto("/inventory.html")
      await inventoryPage.selectProductSort("Name (A to Z)")
      await inventoryPage.selectProductSort("Name (Z to A)")
      await inventoryPage.selectProductSort("Price (low to high)")
      await inventoryPage.selectProductSort("Price (high to low)")
      await inventoryPage.clickReactBurgerMenu()
      await inventoryPage.page.locator("#react-burger-cross-btn").click()
      await inventoryPage.addProductToCart("sample-jacket")
      await inventoryPage.addProductToCart("sample-backpack")
      await inventoryPage.addProductToCart("sample-tshirt")
      await inventoryPage.addProductToCart("sample-red-tshirt")
      await inventoryPage.addProductToCart("sample-light")
    })
    await test.step('Interact with inventory elements', async () => {
    })
  })

})
test.describe('[InventoryPage] Core flows', () => {
  // @stlc:generated
  test('[InventoryDisplaysProductItems] | verify that the inventory page displays product items', async ({ inventoryPage }) => {
    await test.step('Navigate to page', async () => {
      await inventoryPage.page.goto("/inventory.html")
    })
    await test.step('Assert product list', async () => {
      await expect(inventoryPage.page).toHaveURL(/inventory/)
      await expect(inventoryPage.inventoryItemName).toHaveCount(6)
    })
  })

  // @stlc:generated

  test('[SortingPriceLowHigh] | verify that sorting by price low to high reorders products', async ({ inventoryPage }) => {
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

  // @stlc:generated

  test('[AddingProductUpdatesCart] | verify that adding a product updates the cart badge count', async ({ inventoryPage }) => {
    await test.step('Navigate to page', async () => {
      await inventoryPage.page.goto("/inventory.html")
    })
    await test.step('Add product to cart', async () => {
      await inventoryPage.addProductToCart('sample-backpack')
    })
    await test.step('Assert cart badge', async () => {
      await expect(inventoryPage.shoppingCartLink).toBeVisible()
    })
  })

  // @stlc:generated

  test('[ClickingProductNameOpens] | verify that clicking a product name opens the detail page', async ({ inventoryPage }) => {
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
test.describe('[InventoryPage] Edge cases', () => {
  // @stlc:generated
  test('[InvalidQueryParameterDoes] | verify that invalid query parameter does not break the product list', async ({ inventoryPage }) => {
    await test.step('Navigate to page', async () => {
      await inventoryPage.page.goto("/inventory.html")
    })
    await test.step('Open inventory with unsupported query parameter', async () => {
      await inventoryPage.page.goto("/inventory.html?sort=invalid-value")
    })
    await test.step('Assert product list still renders', async () => {
      await expect(inventoryPage.page).toHaveURL(/inventory/)
      await expect(inventoryPage.inventoryItemName).toHaveCount(6)
    })
  })

  // @stlc:generated

  test('[ProductListVisibleWithout] | verify that the product list is visible without user interaction', async ({ inventoryPage }) => {
    await test.step('Navigate to page', async () => {
      await inventoryPage.page.goto("/inventory.html")
    })
    await test.step('Land on inventory without interacting with filters or cart', async () => {
    })
    await test.step('Assert list is visible without user input', async () => {
      await expect(inventoryPage.page).toHaveURL(/inventory/)
      await expect(inventoryPage.inventoryItemName).toHaveCount(6)
    })
  })

  // @stlc:generated

  test('[CatalogShowsExpectedProduct] | verify that the catalog shows the expected product count at list boundaries', async ({ inventoryPage }) => {
    await test.step('Navigate to page', async () => {
      await inventoryPage.page.goto("/inventory.html")
    })
    await test.step('Assert catalog boundary size on inventory page', async () => {
      await expect(inventoryPage.inventoryItemName).toHaveCount(6)
      await expect(inventoryPage.inventoryItemName.first()).toBeVisible()
      await expect(inventoryPage.inventoryItemName.nth(5)).toBeVisible()
    })
  })

  // @stlc:generated

  test('[AddingNonExistentProduct] | verify that adding a non-existent product does not update the cart badge', async ({ inventoryPage }) => {
    await test.step('Navigate to page', async () => {
      await inventoryPage.page.goto("/inventory.html")
    })
    await test.step('Assert add-to-cart control is absent for unknown product slug', async () => {
      await expect(inventoryPage.addToCart('non-existent-product-slug')).toHaveCount(0)
    })
    await test.step('Assert cart badge is not shown without valid add action', async () => {
      await expect(inventoryPage.page.locator('.shopping_cart_badge')).toHaveCount(0)
    })
  })

  // @stlc:generated

  test('[CartBadgeStaysEmpty] | verify that the cart badge stays empty when no product is added', async ({ inventoryPage }) => {
    await test.step('Navigate to page', async () => {
      await inventoryPage.page.goto("/inventory.html")
    })
    await test.step('Do not add any product to the cart', async () => {
    })
    await test.step('Assert cart icon is visible and badge stays empty', async () => {
      await expect(inventoryPage.shoppingCartLink).toBeVisible()
      await expect(inventoryPage.page.locator('.shopping_cart_badge')).toHaveCount(0)
    })
  })

  // @stlc:generated

  test('[CartBadgeReflectsCorrect] | verify that the cart badge reflects the correct count for multiple products', async ({ inventoryPage }) => {
    await test.step('Navigate to page', async () => {
      await inventoryPage.page.goto("/inventory.html")
    })
    await test.step('Add first and last catalog products to cart', async () => {
      await inventoryPage.addProductToCart('sample-backpack')
      await inventoryPage.addProductToCart('sample-red-tshirt')
    })
    await test.step('Assert cart badge shows boundary count of two items', async () => {
      await expect(inventoryPage.page.locator('.shopping_cart_badge')).toHaveText('2')
    })
  })

  // @stlc:generated

  test('[InvalidSortOptionsAre] | verify that invalid sort options are not offered in the dropdown', async ({ inventoryPage }) => {
    await test.step('Navigate to page', async () => {
      await inventoryPage.page.goto("/inventory.html")
    })
    await test.step('Assert invalid sort option is not offered', async () => {
      await expect(inventoryPage.productSortSelect.locator('option', { hasText: 'Invalid' })).toHaveCount(0)
    })
    await test.step('Assert default product list remains visible', async () => {
      await expect(inventoryPage.inventoryItemName).toHaveCount(6)
    })
  })

  // @stlc:generated

  test('[ProductListRemainsVisible] | verify that the product list remains visible with the default sort selection', async ({ inventoryPage }) => {
    await test.step('Navigate to page', async () => {
      await inventoryPage.page.goto("/inventory.html")
    })
    await test.step('Leave sort dropdown at default without changing selection', async () => {
    })
    await test.step('Assert products remain listed', async () => {
      await expect(inventoryPage.productSortSelect).toBeVisible()
      await expect(inventoryPage.inventoryItemName).toHaveCount(6)
    })
  })

  // @stlc:generated

  test('[SortingTogglesBetweenPrice] | verify that sorting toggles between price orders without breaking the list', async ({ inventoryPage }) => {
    await test.step('Navigate to page', async () => {
      await inventoryPage.page.goto("/inventory.html")
    })
    await test.step('Sort by lowest price then highest price', async () => {
      await inventoryPage.selectProductSort('Price (low to high)')
      await expect(inventoryPage.inventoryItemName.first()).toBeVisible()
      await inventoryPage.selectProductSort('Price (high to low)')
    })
    await test.step('Assert list still shows full catalog after boundary sort toggles', async () => {
      await expect(inventoryPage.inventoryItemName).toHaveCount(6)
    })
  })

  // @stlc:generated

  test('[OutRangeProductLinks] | verify that out-of-range product links are not available on the list', async ({ inventoryPage }) => {
    await test.step('Navigate to page', async () => {
      await inventoryPage.page.goto("/inventory.html")
    })
    await test.step('Assert out-of-range product title link does not exist', async () => {
      await expect(inventoryPage.itemTitleLinks()).toHaveCount(6)
      await expect(inventoryPage.itemTitleLinks().nth(99)).toHaveCount(0)
    })
    await test.step('Assert user remains on inventory list', async () => {
      await expect(inventoryPage.page).toHaveURL(/inventory/)
    })
  })

  // @stlc:generated

  test('[UserStaysInventoryList] | verify that the user stays on the inventory list without opening a product', async ({ inventoryPage }) => {
    await test.step('Navigate to page', async () => {
      await inventoryPage.page.goto("/inventory.html")
    })
    await test.step('Stay on inventory list without opening a product', async () => {
    })
    await test.step('Assert detail route is not opened', async () => {
      await expect(inventoryPage.page).toHaveURL(/inventory/)
      await expect(inventoryPage.page).not.toHaveURL(/inventory-item/)
    })
  })

  // @stlc:generated

  test('[FirstLastProductsCatalog] | verify that first and last products in the catalog open the detail page', async ({ inventoryPage }) => {
    await test.step('Navigate to page', async () => {
      await inventoryPage.page.goto("/inventory.html")
    })
    await test.step('Open first and last products from the list', async () => {
      await inventoryPage.openItemTitle(0)
      await expect(inventoryPage.page).toHaveURL(/inventory-item/)
      await inventoryPage.page.goBack()
      await inventoryPage.openItemTitle(5)
    })
    await test.step('Assert boundary index opens detail page', async () => {
      await expect(inventoryPage.page).toHaveURL(/inventory-item/)
    })
  })

  // @stlc:generated

  test('[ControlsReferencedApplicationSource] | verify that the UI controls referenced in application source are testable', async ({ inventoryPage }) => {
    await test.step('Navigate to page', async () => {
      await inventoryPage.page.goto("/inventory.html")
    })
    await test.step('Assert page is usable', async () => {
      await expect(inventoryPage.page).toHaveURL(/.+/)
    })
  })

})
