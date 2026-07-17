#!/usr/bin/env ts-node
/**
 * Loads SWAGGER_PATH from automation/.env (or the environment) and runs
 * openapi-generator-cli against it.
 *
 * Usage:
 *   npm run swagger:api
 */
import { spawnSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as dotenv from 'dotenv'

const AUTOMATION_ROOT = path.resolve(__dirname, '..')
dotenv.config({ path: path.join(AUTOMATION_ROOT, '.env') })

const raw = process.env['SWAGGER_PATH']?.trim()
if (!raw) {
  console.error(
    'SWAGGER_PATH is not set. Add it to automation/.env, e.g.\n' +
      '  SWAGGER_PATH=../backend/openapi.json',
  )
  process.exit(1)
}

const input = path.isAbsolute(raw) ? raw : path.resolve(AUTOMATION_ROOT, raw)
if (!fs.existsSync(input) && !/^https?:\/\//i.test(raw)) {
  console.error(`SWAGGER_PATH not found: ${input}`)
  process.exit(1)
}

const outDir = path.join(AUTOMATION_ROOT, 'core/api/generated')
const args = [
  '@openapitools/openapi-generator-cli',
  'generate',
  '-i',
  /^https?:\/\//i.test(raw) ? raw : input,
  '-g',
  'typescript-axios',
  '-o',
  outDir,
  '--skip-validate-spec',
  '--additional-properties=withSeparateModelsAndApi=true,apiPackage=api,modelPackage=model,supportsES6=true',
]

console.log(`swagger:api ← ${/^https?:\/\//i.test(raw) ? raw : input}`)
const result = spawnSync('npx', args, { cwd: AUTOMATION_ROOT, stdio: 'inherit' })
process.exit(result.status ?? 1)
