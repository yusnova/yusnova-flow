#!/usr/bin/env ts-node
/**
 * Reports on known flaky tests accumulated across STLC runs.
 *
 * Usage:
 *   npm run flaky:report                              # all domains
 *   npm run flaky:report -- --domain example
 *   npm run flaky:report -- --domain example --min-score 0.5
 */
import { Command } from 'commander'
import { style } from '../terminal'
import { TestHistoryTracker } from './test-history'

function buildProgram(): Command {
  return new Command()
    .name('flaky:report')
    .description('List known flaky tests from historical STLC execution data')
    .option('--domain <name>', 'limit to one domain')
    .option('--min-score <n>', 'minimum flaky score to show (0-1)', '0.3')
}

function main(): void {
  const program = buildProgram()
  program.parse(process.argv)
  const opts = program.opts<{ domain?: string; minScore: string }>()

  const tracker = new TestHistoryTracker()
  const entries = tracker.flakyTests(opts.domain, Number(opts.minScore))

  if (entries.length === 0) {
    console.log(`No flaky tests found${opts.domain ? ` for domain "${opts.domain}"` : ''} above score ${opts.minScore}.`)
    return
  }

  console.log(style.bold(`Flaky tests${opts.domain ? ` — ${opts.domain}` : ' (all domains)'}\n`))
  for (const entry of entries) {
    const color = entry.recommendation === 'quarantine_candidate' ? style.yellow : style.dim
    console.log(
      `${color(entry.recommendation.padEnd(20))} score ${entry.flakyScore.toFixed(2)}  ` +
        `(${entry.sampleSize} runs)  [${entry.domain}] ${entry.caseId}`,
    )
    console.log(style.dim(`  recent: ${entry.lastStatuses.join(' → ')}`))
  }

  const quarantineCount = entries.filter((entry) => entry.recommendation === 'quarantine_candidate').length
  if (quarantineCount > 0) {
    console.log(
      style.yellow(`\n${quarantineCount} test(s) recommended for quarantine (score >= 0.5, consistently mixed results).`),
    )
  }
}

main()
