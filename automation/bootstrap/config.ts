import { paths } from '@core/infra/paths'

export const ENV_KEYS = [
  'demo',
  'dev',
  'staging',
] as const
export type EnvKey = (typeof ENV_KEYS)[number]

export interface EnvConfig {
  readonly baseURL: string
  readonly loginURL: string
  readonly signupURL: string
  readonly apiBaseURL: string
}

const DEFAULT_ENV: EnvKey = 'demo'

const envUrl = (key: string, fallback: string): string => process.env[key]?.trim() || fallback

export const DEFAULT_ENV_URLS = {
  demoBase: 'https://demo.example.com',
  demoLogin: 'https://demo.example.com/login',
  demoSignup: 'https://demo.example.com/signup',
  demoProducts: 'https://demo.example.com/products',
  apiBase: 'https://api.example.com',
  devBase: 'https://dev.example.com',
  stagingBase: 'https://staging.example.com',
} as const

const ENVIRONMENTS = {
  demo: {
    baseURL: envUrl('DEMO_BASE_URL', DEFAULT_ENV_URLS.demoBase),
    loginURL: envUrl('DEMO_LOGIN_URL', DEFAULT_ENV_URLS.demoLogin),
    signupURL: envUrl('DEMO_SIGNUP_URL', DEFAULT_ENV_URLS.demoSignup),
    apiBaseURL: envUrl('DEMO_API_BASE_URL', DEFAULT_ENV_URLS.apiBase),
  },
  dev: {
    baseURL: envUrl('DEV_BASE_URL', `${DEFAULT_ENV_URLS.devBase}/`),
    loginURL: envUrl('DEV_LOGIN_URL', `${DEFAULT_ENV_URLS.devBase}/login`),
    signupURL: envUrl('DEV_SIGNUP_URL', `${DEFAULT_ENV_URLS.devBase}/signup`),
    apiBaseURL: envUrl('DEV_API_BASE_URL', `${DEFAULT_ENV_URLS.devBase}/api`),
  },
  staging: {
    baseURL: envUrl('STAGING_BASE_URL', `${DEFAULT_ENV_URLS.stagingBase}/`),
    loginURL: envUrl('STAGING_LOGIN_URL', `${DEFAULT_ENV_URLS.stagingBase}/login`),
    signupURL: envUrl('STAGING_SIGNUP_URL', `${DEFAULT_ENV_URLS.stagingBase}/signup`),
    apiBaseURL: envUrl('STAGING_API_BASE_URL', `${DEFAULT_ENV_URLS.stagingBase}/api`),
  },
} satisfies Record<EnvKey, EnvConfig>

export const activeEnv: EnvKey = ENV_KEYS.find((k) => k === process.env['ENV']) ?? DEFAULT_ENV
export const configEnv = ENVIRONMENTS[activeEnv]

export const AUTH_STATE_FILES = {
  regularUser: paths.authState,
  adminUser: paths.adminUserAuth,
} as const

export const AUTH_STATE_FILE = AUTH_STATE_FILES.regularUser
