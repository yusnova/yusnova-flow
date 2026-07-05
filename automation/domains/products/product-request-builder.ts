import type { CreateProductRequest } from '@core/api/generated'
import { generateDescription, generateName } from '@core/test-data/faker-helpers'
import { uniqueTestId } from '@core/test-data/unique-id'

export class ProductRequestBuilder {
  private body: CreateProductRequest

  constructor() {
    this.body = {
      title: `product-${uniqueTestId()}`,
      price: 9.99,
      stock: 25,
      brand: generateName(),
      category: 'beauty',
      description: generateDescription(),
    }
  }

  withTitle(title: string): this {
    this.body = { ...this.body, title }
    return this
  }

  withPrice(price: number): this {
    this.body = { ...this.body, price }
    return this
  }

  withStock(stock: number): this {
    this.body = { ...this.body, stock }
    return this
  }

  withBrand(brand: string): this {
    this.body = { ...this.body, brand }
    return this
  }

  withCategory(category: string): this {
    this.body = { ...this.body, category }
    return this
  }

  withDescription(description: string): this {
    this.body = { ...this.body, description }
    return this
  }

  build(): CreateProductRequest {
    return { ...this.body }
  }
}
