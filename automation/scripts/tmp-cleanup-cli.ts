#!/usr/bin/env ts-node
import * as path from 'node:path'
import { Command } from 'commander'
import {
  formatBytes,
  pruneAutomationTmp,
  tmpDirSize,
} from './shared/tmp-cleanup'

const AUTOMATION_ROOT = path.resolve(__dirname, '..')

function main(): void {
  const program = new Command()
    .name('tmp:clean')
    .description('Prune old STLC run folders and stale codegen scratch files under automation/tmp/')
    .option('--max-runs <n>', 'keep only the N most recent STLC runs', '15')
    .option('--max-age-days <n>', 'delete STLC runs older than N days', '14')
    .option('--dry-run', 'show what would be removed without deleting', false)
    .option('--all-runs', 'remove all STLC run folders (keeps tmp/stlc/knowledge)', false)
    .parse(process.argv)

  const opts = program.opts<{
    maxRuns: string
    maxAgeDays: string
    dryRun: boolean
    allRuns: boolean
  }>()

  const tmpRoot = path.join(AUTOMATION_ROOT, 'tmp')
  const before = tmpDirSize(tmpRoot)

  if (opts.dryRun) {
    const result = pruneAutomationTmp(AUTOMATION_ROOT, {
      maxRuns: opts.allRuns ? 0 : Number(opts.maxRuns),
      maxAgeDays: opts.allRuns ? 0 : Number(opts.maxAgeDays),
      dryRun: true,
      verbose: true,
    })
    console.log(`
Dry run — nothing deleted
  Would remove ${result.removed.length} STLC run folder(s)
  Current tmp size: ${formatBytes(before)}
`)
    return
  }

  const maxRuns = opts.allRuns ? 0 : Number(opts.maxRuns)
  const maxAgeDays = opts.allRuns ? 0 : Number(opts.maxAgeDays)

  const result = pruneAutomationTmp(AUTOMATION_ROOT, {
    maxRuns,
    maxAgeDays: maxAgeDays > 0 ? maxAgeDays : 0,
    verbose: true,
  })

  const after = tmpDirSize(tmpRoot)
  console.log(`
Pruned automation/tmp
  STLC runs removed : ${result.removed.length}
  STLC runs kept    : ${result.kept}
  Codegen scratch   : ${result.codegenRemoved.length} file(s)
  Size before       : ${formatBytes(before)}
  Size after        : ${formatBytes(after)}
  Freed             : ${formatBytes(Math.max(0, before - after))}
`)
}

main()
