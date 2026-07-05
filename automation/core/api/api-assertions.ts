import { expect } from '@playwright/test'
import { z, type ZodType } from 'zod'
import type { HttpResponse, KnownStatus } from '@core/api/api-types'

export type { HttpResponse, KnownStatus } from '@core/api/api-types'

export interface PaginationMeta {
  page: number
  pageSize: number
  total: number
}

interface WithItems {
  items: unknown[]
}

interface WithPagination extends WithItems {
  page: number
  pageSize: number
  total: number
}

const hasItems = (data: unknown): data is WithItems =>
  typeof data === 'object' && data !== null && 'items' in data && Array.isArray((data as WithItems).items)

const hasPagination = (data: unknown): data is WithPagination => {
  if (!hasItems(data)) return false
  const record = data as unknown as Record<string, unknown>
  return (
    typeof record['page'] === 'number' &&
    typeof record['pageSize'] === 'number' &&
    typeof record['total'] === 'number'
  )
}

const formatSchemaIssues = (issues: z.core.$ZodIssue[]): string =>
  issues.map((issue) => `  • ${issue.path.map(String).join('.')}: ${issue.message}`).join('\n')

const summarizeBody = (data: unknown, max = 300): string => {
  const text = JSON.stringify(data)
  return text.length > max ? `${text.slice(0, max)}…` : text
}

export class ApiAssertions {
  static assertStatus<T>(res: HttpResponse<T>, expected: KnownStatus): void {
    expect(
      res.status,
      `Expected HTTP status ${expected}, received ${res.status}. Response body: ${summarizeBody(res.data)}`,
    ).toBe(expected)
  }

  static assertSchema<T>(res: HttpResponse<unknown>, schema: ZodType<T>): void {
    const result = schema.safeParse(res.data)
    if (!result.success) {
      throw new Error(
        `Response body did not match the expected schema:\n${formatSchemaIssues(result.error.issues)}\n\nReceived body:\n${JSON.stringify(res.data, null, 2)}`,
      )
    }
  }

  static assertErrorResponse(
    res: HttpResponse<unknown>,
    status: KnownStatus,
    schema: ZodType,
    message: string | RegExp,
  ): void {
    this.assertStatus(res, status)
    this.assertSchema(res, schema)
    const bodyMessage = (res.data as { message?: string }).message
    if (typeof message === 'string') {
      expect(bodyMessage, `Error message expected to be exactly "${message}"`).toBe(message)
    } else {
      expect(bodyMessage ?? '', 'Error message did not match the expected pattern').toMatch(message)
    }
  }

  static assertErrorShape(
    res: HttpResponse<unknown>,
    expected: { code: string | RegExp; message?: string | RegExp },
  ): void {
    const body = res.data as Record<string, unknown>
    const code = body['code'] as string | undefined
    const message = body['message'] as string | undefined

    if (typeof expected.code === 'string') {
      expect(code, `Error code expected to be "${expected.code}"`).toBe(expected.code)
    } else {
      expect(code ?? '').toMatch(expected.code)
    }

    if (expected.message !== undefined) {
      if (typeof expected.message === 'string') {
        expect(message).toContain(expected.message)
      } else {
        expect(message ?? '').toMatch(expected.message)
      }
    }
  }

  static assertPagination(res: HttpResponse<unknown>, expected: Partial<PaginationMeta>): void {
    expect(
      hasPagination(res.data),
      `Response body must include pagination fields (items, page, pageSize, total). Received: ${summarizeBody(res.data)}`,
    ).toBe(true)
    if (!hasPagination(res.data)) return
    if (expected.page !== undefined) expect(res.data.page, 'page').toBe(expected.page)
    if (expected.pageSize !== undefined) expect(res.data.pageSize, 'pageSize').toBe(expected.pageSize)
    if (expected.total !== undefined) expect(res.data.total, 'total').toBe(expected.total)
  }

  static assertListNotEmpty(res: HttpResponse<unknown>): void {
    expect(
      hasItems(res.data),
      `Response body must include an "items" array. Received: ${summarizeBody(res.data)}`,
    ).toBe(true)
    if (hasItems(res.data)) {
      expect(
        res.data.items.length,
        `Response "items" array must not be empty. Received ${res.data.items.length} item(s).`,
      ).toBeGreaterThan(0)
    }
  }

  static assertListSchema<T>(res: HttpResponse<unknown>, schema: ZodType<T>): void {
    expect(
      hasItems(res.data),
      `Response body must include an "items" array before validating list item schemas. Received: ${summarizeBody(res.data)}`,
    ).toBe(true)
    if (!hasItems(res.data)) return
    res.data.items.forEach((item, index) => {
      const result = schema.safeParse(item)
      if (!result.success) {
        throw new Error(
          `List item at index ${index} did not match the expected schema:\n${formatSchemaIssues(result.error.issues)}\n\nItem:\n${JSON.stringify(item, null, 2)}`,
        )
      }
    })
  }
}

export { z }
