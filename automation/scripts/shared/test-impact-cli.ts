#!/usr/bin/env ts-node
/**
 * CLI wrapper around analyzeTestImpact() for local use and CI.
 *
 * Usage:
 *   npx ts-node scripts/shared/test-impact-cli.ts --base origin/main --head HEAD
 *   npx ts-node scripts/shared/test-impact-cli.ts --files a.ts,b.ts   # bypass git, useful for testing
 *   npx ts-node scripts/shared/test-impact-cli.ts --base origin/main --format github
 */
import { execSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { Command } from 'commander'
import { analyzeTestImpact, listAllDomains } from './test-impact-analysis'

const AUTOMATION_ROOT = path.resolve(__dirname, '..', '..')
const REPO_ROOT = path.resolve(AUTOMATION_ROOT, '..')

function buildProgram(): Command {
  return new Command()
    .name('test-impact')
    .description('Map changed files to affected test domains (git diff based)')
    .option('--base <ref>', 'base git ref to diff against', 'origin/main')
    .option('--head <ref>', 'head git ref', 'HEAD')
    .option('--files <list>', 'comma-separated file list (bypasses git diff)')
    .option('--format <fmt>', 'output format: text | json | github', 'text')
    .option('--all-domains', 'skip git diff entirely and list every known domain (for nightly full runs)', false)
}

function getChangedFiles(base: string, head: string): string[] {
  try {
    const mergeBase = execSync(`git merge-base ${base} ${head}`, { cwd: REPO_ROOT, encoding: 'utf-8' }).trim()
    const output = execSync(`git diff --name-only ${mergeBase} ${head}`, { cwd: REPO_ROOT, encoding: 'utf-8' })
    return output.split('\n').map((line) => line.trim()).filter(Boolean)
  } catch (err) {
    process.stderr.write(`Warning: git diff failed (${(err as Error).message}); falling back to full suite.\n`)
    return []
  }
}

function writeGithubOutput(pairs: Record<string, string>): void {
  const target = process.env.GITHUB_OUTPUT
  const lines = Object.entries(pairs).map(([key, value]) => `${key}=${value}`)
  if (target) {
    fs.appendFileSync(target, `${lines.join('\n')}\n`)
  } else {
    process.stdout.write(`${lines.join('\n')}\n`)
  }
}

function main(): void {
  const program = buildProgram()
  program.parse(process.argv)
  const opts = program.opts<{ base: string; head: string; files?: string; format: string; allDomains: boolean }>()

  if (opts.allDomains) {
    const allDomains = listAllDomains(AUTOMATION_ROOT)
    if (opts.format === 'github') {
      writeGithubOutput({
        affected_domains: allDomains.join(','),
        affected_domains_json: JSON.stringify(allDomains),
        run_full_suite: 'true',
        has_impact: String(allDomains.length > 0),
      })
    } else if (opts.format === 'json') {
      console.log(JSON.stringify({ affectedDomains: allDomains, runFullSuite: true }, null, 2))
    } else {
      console.log(`All domains: ${allDomains.join(', ')}`)
    }
    return
  }

  const changedFiles = opts.files
    ? opts.files.split(',').map((f) => f.trim()).filter(Boolean)
    : getChangedFiles(opts.base, opts.head)

  const gitDiffFailed = !opts.files && changedFiles.length === 0 && opts.base
  const result = analyzeTestImpact(changedFiles, REPO_ROOT)
  const allDomains = listAllDomains(AUTOMATION_ROOT)
  const runFullSuite = result.runFullSuite || gitDiffFailed
  const effectiveDomains = runFullSuite ? allDomains : result.affectedDomains

  if (opts.format === 'json') {
    console.log(JSON.stringify({ ...result, runFullSuite, effectiveDomains, allDomains }, null, 2))
    return
  }

  if (opts.format === 'github') {
    writeGithubOutput({
      affected_domains: effectiveDomains.join(','),
      affected_domains_json: JSON.stringify(effectiveDomains),
      run_full_suite: String(runFullSuite),
      has_impact: String(effectiveDomains.length > 0),
    })
    return
  }

  console.log(`Changed files analyzed : ${changedFiles.length}`)
  console.log(`Run full suite         : ${runFullSuite}`)
  console.log(`Affected domains       : ${effectiveDomains.join(', ') || '(none)'}`)
  if (result.reasons.length > 0) {
    console.log('\nReasons:')
    for (const reason of result.reasons) console.log(`  - ${reason}`)
  }
  if (result.unmatchedFiles.length > 0) {
    console.log('\nUnmatched automation files (no test impact assumed):')
    for (const file of result.unmatchedFiles) console.log(`  - ${file}`)
  }
}

main()
