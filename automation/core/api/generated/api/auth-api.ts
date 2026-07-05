import type { AxiosRequestConfig, AxiosResponse } from 'axios'
import { BaseAPI } from '@core/api/generated/base'
import type { Configuration } from '@core/api/generated/configuration'
import type { LoginRequest, LoginResponse, RefreshRequest, RefreshResponse } from '@core/api/generated/model'

export class AuthApi extends BaseAPI {
  constructor(configuration: Configuration) {
    super(configuration)
  }

  authLogin(body: LoginRequest, options?: AxiosRequestConfig): Promise<AxiosResponse<LoginResponse>> {
    return this.request<LoginResponse>('POST', '/auth/login', body, options)
  }

  authRefresh(body: RefreshRequest, options?: AxiosRequestConfig): Promise<AxiosResponse<RefreshResponse>> {
    return this.request<RefreshResponse>('POST', '/auth/refresh', body, options)
  }
}
