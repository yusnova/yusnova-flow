import { randomUUID } from 'node:crypto'

export function uniqueTestId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

export function uniqueAlphanumericToken(extraLength = 10): string {
  return `${randomUUID()}${Date.now().toString(36)}${Math.random().toString(36).slice(2, extraLength)}`.replace(
    /[^a-zA-Z0-9]/g,
    '',
  )
}
