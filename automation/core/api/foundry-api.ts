import { configEnv } from '@bootstrap/config'
import { createAxiosInstance } from '@core/api/axios-client'
import {
  AuthApi,
  Configuration,
  ProductsApi,
  type ConfigurationParameters,
} from '@core/api/generated'

export type { Configuration }

const createConfiguration = (accessToken?: string): Configuration => {
  const params: ConfigurationParameters = {
    basePath: configEnv.apiBaseURL,
    axiosInstance: createAxiosInstance(),
  }
  if (accessToken) params.accessToken = accessToken
  return new Configuration(params)
}

export class FoundryAPI {
  readonly Auth: AuthApi
  readonly Products: ProductsApi

  private constructor(config: Configuration) {
    this.Auth = new AuthApi(config)
    this.Products = new ProductsApi(config)
  }

  static create(accessToken = ''): FoundryAPI {
    return new FoundryAPI(createConfiguration(accessToken))
  }

  static createAnonymous(): FoundryAPI {
    return new FoundryAPI(createConfiguration())
  }
}
