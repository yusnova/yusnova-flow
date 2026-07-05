import { paths } from '@core/infra/paths'

export const ENV_KEYS = [
  'demo',
  'dev',
  'staging',
  'aws-dev',
  'aws-staging',
  'gcp-dev',
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

const ENVIRONMENTS = {
  demo: {
    baseURL: 'https://www.saucedemo.com',
    loginURL: 'https://www.saucedemo.com',
    signupURL: 'https://www.saucedemo.com',
    apiBaseURL: 'https://dummyjson.com',
  },
  dev: {
    baseURL: 'https://dev-saucedemo.net/beta/',
    loginURL: 'https://dev-saucedemo.net/beta/login',
    signupURL: 'https://dev-saucedemo.net/beta/self-signup',
    apiBaseURL: 'https://dev-saucedemo.net/beta/api',
  },
  staging: {
    baseURL: 'https://staging-saucedemo.net/beta/',
    loginURL: 'https://staging-saucedemo.net/beta/login',
    signupURL: 'https://staging-saucedemo.net/beta/self-signup',
    apiBaseURL: 'https://staging-saucedemo.net/beta/api',
  },
  'aws-dev': {
    baseURL: envUrl('AWS_DEV_BASE_URL', 'https://aws-dev.example.com'),
    loginURL: envUrl('AWS_DEV_LOGIN_URL', 'https://aws-dev.example.com/login'),
    signupURL: envUrl('AWS_DEV_SIGNUP_URL', 'https://aws-dev.example.com/signup'),
    apiBaseURL: envUrl('AWS_DEV_API_BASE_URL', 'https://aws-dev.example.com/api'),
  },
  'aws-staging': {
    baseURL: envUrl('AWS_STAGING_BASE_URL', 'https://aws-staging.example.com'),
    loginURL: envUrl('AWS_STAGING_LOGIN_URL', 'https://aws-staging.example.com/login'),
    signupURL: envUrl('AWS_STAGING_SIGNUP_URL', 'https://aws-staging.example.com/signup'),
    apiBaseURL: envUrl('AWS_STAGING_API_BASE_URL', 'https://aws-staging.example.com/api'),
  },
  'gcp-dev': {
    baseURL: envUrl('GCP_DEV_BASE_URL', 'https://gcp-dev.example.com'),
    loginURL: envUrl('GCP_DEV_LOGIN_URL', 'https://gcp-dev.example.com/login'),
    signupURL: envUrl('GCP_DEV_SIGNUP_URL', 'https://gcp-dev.example.com/signup'),
    apiBaseURL: envUrl('GCP_DEV_API_BASE_URL', 'https://gcp-dev.example.com/api'),
  },
} satisfies Record<EnvKey, EnvConfig>

export const activeEnv: EnvKey = ENV_KEYS.find((k) => k === process.env['ENV']) ?? DEFAULT_ENV
export const configEnv = ENVIRONMENTS[activeEnv]

export const AUTH_STATE_FILES = {
  regularUser: paths.authState,
  adminUser: paths.adminUserAuth,
} as const

export const AUTH_STATE_FILE = AUTH_STATE_FILES.regularUser
