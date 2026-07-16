#!/usr/bin/env ts-node
/**
 * Single entry point for every `*.test.ts` unit test under scripts/.
 *
 * Replaces one npm alias per test file — adding a new test file just means
 * dropping a `foo.test.ts` next to the code it tests; it's picked up here
 * automatically, no package.json edit required.
 *
 * Usage:
 *   npm run test:unit
 *   npm run test:unit -- --filter healing   # only run files matching "healing"
 */
import { spawnSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'

const SCRIPTS_ROOT = path.resolve(__dirname)
const IGNORED_DIRS = new Set(['node_modules'])

function findTestFiles(dir: string): string[] {
  const results: string[] = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name)) continue
      results.push(...findTestFiles(path.join(dir, entry.name)))
      continue
    }
    if (entry.name.endsWith('.test.ts')) {
      results.push(path.join(dir, entry.name))
    }
  }
  return results
}

function main(): void {
  const filter = process.argv.includes('--filter') ? process.argv[process.argv.indexOf('--filter') + 1] : undefined

  const allFiles = findTestFiles(SCRIPTS_ROOT).sort()
  const files = filter ? allFiles.filter((file) => file.includes(filter)) : allFiles

  if (files.length === 0) {
    console.log(filter ? `No test files matched filter "${filter}".` : 'No test files found.')
    process.exit(filter ? 1 : 0)
  }

  console.log(`\x1b[1mRunning ${files.length} unit test file(s)\x1b[0m\n`)

  const failures: string[] = []

  for (const file of files) {
    const relative = path.relative(SCRIPTS_ROOT, file)
    const result = spawnSync('npx', ['ts-node', file], { cwd: path.resolve(SCRIPTS_ROOT, '..'), stdio: 'inherit' })

    if (result.status !== 0) {
      failures.push(relative)
      console.log(`\x1b[31m✗ ${relative}\x1b[0m\n`)
    } else {
      console.log(`\x1b[32m✓ ${relative}\x1b[0m\n`)
    }
  }

  console.log('\x1b[1m───────────────────────────────\x1b[0m')
  if (failures.length > 0) {
    console.log(`\x1b[31m${failures.length}/${files.length} test file(s) failed:\x1b[0m`)
    for (const failure of failures) console.log(`  - ${failure}`)
    process.exit(1)
  }

  console.log(`\x1b[32mAll ${files.length} test file(s) passed.\x1b[0m`)
}

main()
