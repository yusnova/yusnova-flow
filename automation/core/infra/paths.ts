import { resolve } from 'node:path'

export const AUTOMATION_ROOT = resolve(__dirname, '../..')

export const paths = {
  env: resolve(AUTOMATION_ROOT, '.env'),
  authState: resolve(AUTOMATION_ROOT, 'core/fixtures/auth-state.json'),
  adminUserAuth: resolve(AUTOMATION_ROOT, 'core/fixtures/admin-user-auth.json'),
  fixtures: resolve(AUTOMATION_ROOT, 'core/fixtures'),
} as const
