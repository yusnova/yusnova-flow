import type { AxiosRequestConfig, AxiosResponse } from 'axios'
import { BaseAPI } from '@core/api/generated/base'
import type { Configuration } from '@core/api/generated/configuration'
import type { CreateProductRequest, CreateProductResponse, ProductListResponse } from '@core/api/generated/model'

export class ProductsApi extends BaseAPI {
  constructor(configuration: Configuration) {
    super(configuration)
  }

  productsList(limit?: number, options?: AxiosRequestConfig): Promise<AxiosResponse<ProductListResponse>> {
    const query = limit !== undefined ? `?limit=${limit}` : ''
    return this.request<ProductListResponse>('GET', `/products${query}`, undefined, options)
  }

  productsAdd(
    body: CreateProductRequest,
    options?: AxiosRequestConfig,
  ): Promise<AxiosResponse<CreateProductResponse>> {
    return this.request<CreateProductResponse>('POST', '/products/add', body, options)
  }
}
