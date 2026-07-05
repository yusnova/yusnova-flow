import * as dotenv from 'dotenv'
import { paths } from '@core/infra/paths'
import { activeEnv } from './config'

dotenv.config({ path: paths.env })

export interface UserCredentials {
  readonly username: string
  readonly password: string
}

const must = (key: string): string => {
  const value = process.env[key]?.trim()
  if (!value) throw new Error(`.env missing: ${key}`)
  return value
}

const optional = (key: string): string | undefined => process.env[key]?.trim() || undefined

export const testCredentials = {
  regularUser: {
    username: must('REGULAR_USER_USERNAME'),
    password: must('REGULAR_USER_PASSWORD'),
  },
  adminUser: {
    username: must('ADMIN_USER_USERNAME'),
    password: must('ADMIN_USER_PASSWORD'),
  },
} as const

export const apiTestCredentials = {
  regularUser: {
    username: optional('API_REGULAR_USER_USERNAME') ?? must('REGULAR_USER_USERNAME'),
    password: optional('API_REGULAR_USER_PASSWORD') ?? must('REGULAR_USER_PASSWORD'),
  },
} as const

export const apiAuthPayload = ({ username, password }: UserCredentials) => {
  if (activeEnv === 'demo') {
    return { username, password }
  }

  return { email: username, password }
}
