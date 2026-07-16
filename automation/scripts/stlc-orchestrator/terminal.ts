import * as path from 'node:path'

export type LogLevel = 'step' | 'info' | 'warn' | 'success' | 'error'

export const style = {
  bold: (text: string) => `\x1b[1m${text}\x1b[0m`,
  cyan: (text: string) => `\x1b[36m${text}\x1b[0m`,
  dim: (text: string) => `\x1b[2m${text}\x1b[0m`,
  green: (text: string) => `\x1b[32m${text}\x1b[0m`,
  yellow: (text: string) => `\x1b[33m${text}\x1b[0m`,
  red: (text: string) => `\x1b[31m${text}\x1b[0m`,
}

export function log(level: LogLevel, msg: string): void {
  const prefix: Record<LogLevel, string> = {
    step: '\n\x1b[36m[→]\x1b[0m',
    info: '   \x1b[90m',
    warn: '   \x1b[33m⚠ ',
    success: '   \x1b[32m',
    error: '\x1b[31m[✗]',
  }
  process.stdout.write(`${prefix[level]} ${msg}\x1b[0m\n`)
}

export function logWarnBlock(headline: string, bullets: string[] = []): void {
  log('warn', `     ${headline}`)
  for (const bullet of bullets) {
    process.stdout.write(`   \x1b[90m       · ${bullet}\x1b[0m\n`)
  }
}

export function relativePath(automationRoot: string, absPath: string): string {
  return path.relative(automationRoot, absPath)
}

export function fatalError(err: unknown): never {
  const message = err instanceof Error ? err.message : String(err)
  console.error(`\n\x1b[31m[✗] Fatal error: ${message}\x1b[0m\n`)
  process.exit(1)
}
