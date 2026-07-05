import type { AxiosInstance } from 'axios'

export interface ConfigurationParameters {
  basePath: string
  accessToken?: string
  axiosInstance: AxiosInstance
}

export class Configuration {
  readonly basePath: string
  readonly accessToken: string | undefined
  readonly axiosInstance: AxiosInstance

  constructor(params: ConfigurationParameters) {
    this.basePath = params.basePath.replace(/\/$/, '')
    this.accessToken = params.accessToken
    this.axiosInstance = params.axiosInstance
  }
}
