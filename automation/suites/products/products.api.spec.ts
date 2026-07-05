import { test, expect } from '@domains/products/products.fixture'
import { ApiAssertions } from '@core/api/api-assertions'
import { createProductViaApi, PRODUCT_STATE_KEY } from '@domains/products/products.helpers'
import { ProductRequestBuilder } from '@domains/products/product-request-builder'
import { productListResponseSchema } from '@domains/products/products.schemas'

test.describe('[ProductsAPI] Create', () => {

  test('[CreateProduct] | verify that a valid request body returns 200 with a product id', async ({ foundryAPI, state }) => {
    let productId = 0

    await test.step('POST /products/add with builder payload', async () => {
      const data = await createProductViaApi(
        foundryAPI,
        state,
        new ProductRequestBuilder().withCategory('electronics'),
      )
      productId = data.id
    })

    await test.step('Assert product id is stored in state', async () => {
      const stored = state.get(PRODUCT_STATE_KEY)
      expect(stored.id).toBe(String(productId))
      expect(stored.meta?.['title']).toBeTruthy()
    })
  })

  test('[CreateCustomTitle] | verify that builder overrides are reflected in the response', async ({ foundryAPI }) => {
    const customTitle = `custom-${Date.now()}`

    await test.step('POST /products/add with custom title', async () => {
      const res = await foundryAPI.Products.productsAdd(
        new ProductRequestBuilder().withTitle(customTitle).build(),
      )
      ApiAssertions.assertStatus(res, 201)
      expect(res.data.title).toBe(customTitle)
    })
  })

})

test.describe('[ProductsAPI] List', () => {

  test('[ListProducts] | verify that GET /products returns a paginated product list', async ({ foundryAPI }) => {
    let res: Awaited<ReturnType<typeof foundryAPI.Products.productsList>>

    await test.step('GET /products?limit=5', async () => {
      res = await foundryAPI.Products.productsList(5)
    })

    await test.step('Assert 200 and list schema', async () => {
      ApiAssertions.assertStatus(res!, 200)
      ApiAssertions.assertSchema(res!, productListResponseSchema)
      expect(res!.data.products.length).toBeLessThanOrEqual(5)
    })
  })

})
