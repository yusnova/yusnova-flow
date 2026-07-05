export interface HttpResponse<T = unknown> {
  status: number
  data: T
  headers: unknown
}

export type KnownStatus = 200 | 201 | 204 | 400 | 401 | 403 | 404 | 409 | 422 | 500

export type RequestMeta = {
  expectedStatus?: KnownStatus | KnownStatus[]
  suppressHttpLog?: boolean
}
