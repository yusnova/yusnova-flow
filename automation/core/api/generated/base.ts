import type { AxiosRequestConfig, AxiosResponse } from 'axios'
import type { Configuration } from '@core/api/generated/configuration'

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

export class BaseAPI {
  constructor(protected readonly configuration: Configuration) {}

  protected async request<T = unknown>(
    method: HttpMethod,
    path: string,
    data?: unknown,
    options: AxiosRequestConfig = {},
  ): Promise<AxiosResponse<T>> {
    const headers = {
      ...(options.headers as Record<string, string> | undefined),
    }

    if (this.configuration.accessToken && !headers['Authorization']) {
      headers['Authorization'] = `Bearer ${this.configuration.accessToken}`
    }

    return this.configuration.axiosInstance.request<T>({
      method,
      url: `${this.configuration.basePath}${path}`,
      data,
      headers,
      ...options,
    })
  }
}
