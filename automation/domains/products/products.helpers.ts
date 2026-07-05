import { ApiAssertions } from '@core/api/api-assertions'
import type { FoundryAPI } from '@core/api/foundry-api'
import type { StateStore } from '@core/state/state-store'
import type { z } from 'zod'
import { ProductRequestBuilder } from './product-request-builder'
import { createProductResponseSchema } from './products.schemas'

export const PRODUCT_STATE_KEY = 'product'

export type CreatedProduct = z.infer<typeof createProductResponseSchema>

export async function createProductViaApi(
  foundryAPI: FoundryAPI,
  state: StateStore,
  builder: ProductRequestBuilder = new ProductRequestBuilder(),
): Promise<CreatedProduct> {
  const payload = builder.build()
  const res = await foundryAPI.Products.productsAdd(payload)

  ApiAssertions.assertStatus(res, 201)
  ApiAssertions.assertSchema(res, createProductResponseSchema)

  const data = createProductResponseSchema.parse(res.data)

  state.set(PRODUCT_STATE_KEY, {
    id: String(data.id),
    createdAt: Date.now(),
    meta: { title: data.title, price: data.price },
  })

  return data
}
