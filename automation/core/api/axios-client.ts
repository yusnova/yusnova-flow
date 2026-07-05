import axios, { AxiosHeaders, isAxiosError, type AxiosInstance, type AxiosRequestConfig, type AxiosResponse } from 'axios'
import { TestContext } from '@core/state/test-context'
import type { KnownStatus, RequestMeta } from '@core/api/api-types'

export type { KnownStatus, RequestMeta } from '@core/api/api-types'

declare module 'axios' {
  export interface AxiosRequestConfig {
    meta?: RequestMeta
  }
}

export const withExpectedStatus = (
  status: KnownStatus | KnownStatus[],
  options: AxiosRequestConfig = {},
): AxiosRequestConfig => ({
  ...options,
  meta: { ...options.meta, expectedStatus: status },
})

const TIMEOUT_MS = 30_000
const BODY_PREVIEW_MAX = 400

type ErrorDetails = {
  message?: string
  code?: string
  bodyPreview?: string
}

const readString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined

const extractErrorDetails = (data: unknown): ErrorDetails => {
  if (typeof data === 'string') {
    return { message: data }
  }

  if (typeof data !== 'object' || data === null) {
    return {}
  }

  const record = data as Record<string, unknown>
  const message =
    readString(record['message']) ??
    readString(record['error']) ??
    readString(record['detail']) ??
    readString(record['title'])

  const code = readString(record['code']) ?? readString(record['errorCode'])

  if (message || code) {
    const details: ErrorDetails = {}
    if (message) details.message = message
    if (code) details.code = code
    return details
  }

  const serialized = JSON.stringify(data)
  return serialized === '{}'
    ? {}
    : { bodyPreview: serialized.slice(0, BODY_PREVIEW_MAX) }
}

const isExpectedStatus = (status: number, expected: KnownStatus | KnownStatus[]): boolean =>
  Array.isArray(expected) ? expected.includes(status as KnownStatus) : expected === status

const readTestKey = (): string | undefined => {
  try {
    return TestContext.current().getTestKey()
  } catch {
    return undefined
  }
}

const writeLog = (lines: Array<string | undefined>): void => {
  const output = lines.filter((line): line is string => line !== undefined)
  if (output.length > 0) process.stderr.write(`${output.join('\n')}\n`)
}

const logHttpIssue = (response: AxiosResponse): void => {
  const { status, config, data } = response
  if (config.meta?.suppressHttpLog) return
  if (status < 400) return
  if (config.meta?.expectedStatus !== undefined && isExpectedStatus(status, config.meta.expectedStatus)) {
    return
  }

  const { message, code, bodyPreview } = extractErrorDetails(data)
  const method = config.method?.toUpperCase() ?? 'GET'
  const url = config.url ?? '(unknown url)'
  const testKey = readTestKey()

  writeLog([
    '[api] unexpected HTTP response',
    testKey ? `  test    : ${testKey}` : undefined,
    `  method  : ${method}`,
    `  url     : ${url}`,
    `  status  : ${status}`,
    message ? `  message : ${message}` : undefined,
    code ? `  code    : ${code}` : undefined,
    bodyPreview ? `  body    : ${bodyPreview}${bodyPreview.length >= BODY_PREVIEW_MAX ? '…' : ''}` : undefined,
  ])
}

const logRequestFailure = (error: unknown): void => {
  if (!isAxiosError(error)) return
  if (error.config?.meta?.suppressHttpLog) return

  const method = error.config?.method?.toUpperCase() ?? 'GET'
  const url = error.config?.url ?? '(unknown url)'
  const testKey = readTestKey()

  if (error.response) {
    logHttpIssue(error.response)
    return
  }

  writeLog([
    '[api] request failed before a response was received',
    testKey ? `  test    : ${testKey}` : undefined,
    `  method  : ${method}`,
    `  url     : ${url}`,
    `  reason  : ${error.message}`,
  ])
}

export const createAxiosInstance = (): AxiosInstance => {
  const instance = axios.create({
    timeout: TIMEOUT_MS,
    validateStatus: () => true,
  })

  instance.interceptors.request.use((config) => {
    try {
      const { accessToken } = TestContext.current().getCredentials()
      if (accessToken) {
        const headers = AxiosHeaders.from(config.headers)
        headers.set('Authorization', `Bearer ${accessToken}`)
        config.headers = headers
      }
    } catch {
      // outside TestContext.run
    }
    return config
  })

  instance.interceptors.response.use(
    (response) => {
      logHttpIssue(response)
      return response
    },
    (error) => {
      logRequestFailure(error)
      return Promise.reject(error)
    },
  )

  return instance
}
