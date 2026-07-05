import * as fs from 'node:fs'
import * as path from 'node:path'
import * as readline from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'
import { normalizeDomainName, validateDomainInput } from '../codegen-agent/domain-name'
import { normalizePageName, validatePageNameInput } from '../codegen-agent/page-name'
import { GeneratorOptions } from '../codegen-agent/types'
import { PR_PHASES } from './profiles'
import { OrchestratorOptions, StlcPhase } from './types'
import { style } from './terminal'

const TOTAL_STEPS = 6

const DEFAULT_REQUIREMENT = [
  'AC: User can view the product list',
  'AC: User must be able to add items to cart',
  'AC: User can sort products by price',
].join('\n')

export interface ResolvedStlcRun {
  requirementText: string
  requirementFile?: string
  options: OrchestratorOptions
}

export async function runInteractiveWizard(
  automationRoot: string,
  defaultOutput: string,
): Promise<ResolvedStlcRun> {
  const rl = readline.createInterface({ input, output })

  try {
    printWelcome()

    const url = await askRequired(rl, 1, 'Target page URL', {
      hint: 'The live page the STLC pipeline will analyse and generate tests for.',
      example: 'https://www.saucedemo.com/inventory.html',
      validate: validateUrl,
    })

    const domainInput = await askRequired(rl, 2, 'Domain name', {
      hint: 'Feature folder under suites/ and domains/. kebab-case, snake_case or PascalCase are all fine.',
      example: 'inventory-page, inventory_page, inventory',
      validate: validateDomainInput,
    })
    const domain = normalizeDomainName(domainInput)
    if (domain !== domainInput) {
      console.log(`${style.dim('  Using folder:')} ${style.green(domain)}`)
    }

    const pageInput = await askRequired(rl, 3, 'Page class name', {
      hint: 'Name for the generated Page Object class.',
      example: 'inventory-page, InventoryPage',
      validate: validatePageNameInput,
    })
    const page = normalizePageName(pageInput)
    if (page !== pageInput) {
      console.log(`${style.dim('  Using class:')} ${style.green(page)}`)
    }

    const requirementFile = await askOptionalPath(rl, 4, 'Requirement file', {
      hint: 'Markdown or text with acceptance criteria. Leave empty for built-in demo AC lines.',
      example: './requirements/inventory.md',
    })

    const runTests = await askYesNo(rl, 5, 'Run Playwright tests after generation?', {
      hint: 'No = design + codegen only (fast, typical for local work). Yes = also execute the suite and triage failures.',
      defaultYes: false,
    })

    const { explore, overwrite, headless } = await askCodegenOptions(rl, 6)

    const llmAvailable = Boolean(process.env.STLC_LLM_API_KEY?.trim())
    const useLlm = llmAvailable && process.env.STLC_USE_LLM === 'true'
    if (!llmAvailable) {
      console.log(`\n${style.dim('  LLM:')} ${style.yellow('STLC_LLM_API_KEY not set — using heuristics')}`)
    } else if (!useLlm) {
      console.log(`\n${style.dim('  LLM:')} ${style.dim('off (set STLC_USE_LLM=true in .env or use CLI flags to enable)')}`)
    }

    const requirementText = requirementFile
      ? fs.readFileSync(path.resolve(automationRoot, requirementFile), 'utf-8')
      : DEFAULT_REQUIREMENT

    const codegen: GeneratorOptions = {
      url,
      domain,
      page,
      type: 'ui',
      explore,
      overwrite,
      headless,
      noCodegen: false,
    }

    const phases: StlcPhase[] | undefined = runTests ? undefined : PR_PHASES

    const options: OrchestratorOptions = {
      requirementText,
      ...(requirementFile ? { requirementFile } : {}),
      codegen,
      ...(phases ? { phases } : {}),
      skipHumanGates: true,
      runTests,
      enableLlm: useLlm,
      enableRag: true,
      enableSelfHealing: true,
      outputDir: defaultOutput,
      humanConfidenceThreshold: 0.75,
    }

    await confirmSummary(rl, options, requirementFile)
    return { requirementText, ...(requirementFile ? { requirementFile } : {}), options }
  } finally {
    rl.close()
  }
}

function printWelcome(): void {
  console.log(`
${style.bold('╔══════════════════════════════════════════════╗')}
${style.bold('║')}   ${style.cyan('stlc:orchestrator')}  ·  interactive setup     ${style.bold('║')}
${style.bold('╚══════════════════════════════════════════════╝')}

${style.dim('Requirements → design → codegen → review → report. Codegen uses the same engine as codegen:agent.')}
`)
}

async function askCodegenOptions(
  rl: readline.Interface,
  step: number,
): Promise<{ explore: boolean; overwrite: boolean; headless: boolean }> {
  console.log(`\n${style.cyan(`━━ Step ${step}/${TOTAL_STEPS} ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)}`)
  console.log(style.bold('Codegen options'))
  console.log(style.dim('Controls DOM analysis and spec generation (shared with codegen:agent).'))

  const explore = await askYesNo(rl, 'Click through page elements (explore)?', {
    hint: 'Auto-clicks buttons, links and dropdowns; merges the recorded flow into the spec.',
    defaultYes: true,
    subQuestion: true,
  })

  const overwrite = await askYesNo(rl, 'Overwrite existing POM and spec files?', {
    hint: 'Replace pages/, domains/, and suites/ files if they already exist.',
    defaultYes: false,
    subQuestion: true,
  })

  const showBrowser = await askYesNo(rl, 'Show browser during generation?', {
    hint: 'Opens a visible browser window while analysing the page and exploring.',
    defaultYes: true,
    subQuestion: true,
  })

  return { explore, overwrite, headless: !showBrowser }
}

async function confirmSummary(
  rl: readline.Interface,
  opts: OrchestratorOptions,
  requirementFile?: string,
): Promise<void> {
  const pipelineLabel = opts.runTests ? 'generate + run tests' : 'generate only'

  console.log(`
${style.bold('━━ Summary ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')}
  URL         : ${opts.codegen.url}
  Domain      : ${opts.codegen.domain}
  Page        : ${opts.codegen.page}
  Pipeline    : ${pipelineLabel}
  Requirement : ${requirementFile ?? '(built-in demo AC lines)'}
  Explore     : ${opts.codegen.explore ? 'yes' : 'no'}
  Overwrite   : ${opts.codegen.overwrite ? 'yes' : 'no'}
  Browser     : ${opts.codegen.headless ? 'hidden' : 'visible'}
  LLM         : ${opts.enableLlm ? 'yes' : 'no (heuristics)'}
`)

  while (true) {
    const answer = (await rl.question(`${style.green('→')} Start STLC pipeline? ${style.dim('(Y/n)')} `)).trim().toLowerCase()
    if (!answer || answer === 'y' || answer === 'yes') return
    if (answer === 'n' || answer === 'no') {
      console.log(`\n${style.yellow('Cancelled.')}\n`)
      process.exit(0)
    }
    console.log(style.yellow('  Please answer y or n.'))
  }
}

interface AskRequiredConfig {
  hint: string
  example?: string
  validate?: (value: string) => string | undefined
}

async function askRequired(
  rl: readline.Interface,
  step: number,
  title: string,
  config: AskRequiredConfig,
): Promise<string> {
  while (true) {
    console.log(`\n${style.cyan(`━━ Step ${step}/${TOTAL_STEPS} ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)}`)
    console.log(style.bold(title))
    console.log(style.dim(config.hint))
    if (config.example) console.log(`${style.dim('Example:')} ${config.example}`)

    const answer = (await rl.question(`${style.green('→')} `)).trim()
    if (!answer) {
      console.log(style.yellow('  This field is required. Please enter a value.'))
      continue
    }

    const error = config.validate?.(answer)
    if (error) {
      console.log(style.yellow(`  ${error}`))
      continue
    }

    return answer
  }
}

async function askOptionalPath(
  rl: readline.Interface,
  step: number,
  title: string,
  config: AskRequiredConfig,
): Promise<string | undefined> {
  console.log(`\n${style.cyan(`━━ Step ${step}/${TOTAL_STEPS} ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)}`)
  console.log(style.bold(title))
  console.log(style.dim(config.hint))
  if (config.example) console.log(`${style.dim('Example:')} ${config.example}`)

  const answer = (await rl.question(`${style.green('→')} ${style.dim('(optional)')} `)).trim()
  if (!answer) return undefined

  const resolved = path.resolve(answer)
  if (!fs.existsSync(resolved)) {
    console.log(style.yellow(`  File not found: ${answer} — using built-in demo AC lines instead.`))
    return undefined
  }

  return answer
}

interface AskYesNoConfig {
  hint: string
  defaultYes: boolean
  subQuestion?: boolean
}

async function askYesNo(
  rl: readline.Interface,
  stepOrTitle: number | string,
  titleOrConfig?: string | AskYesNoConfig,
  config?: AskYesNoConfig,
): Promise<boolean> {
  let step: number | undefined
  let title: string
  let opts: AskYesNoConfig

  if (typeof stepOrTitle === 'number') {
    step = stepOrTitle
    title = titleOrConfig as string
    opts = config!
  } else {
    title = stepOrTitle
    opts = titleOrConfig as AskYesNoConfig
  }

  const defaultLabel = opts.defaultYes ? 'Y/n' : 'y/N'

  while (true) {
    if (step !== undefined && !opts.subQuestion) {
      console.log(`\n${style.cyan(`━━ Step ${step}/${TOTAL_STEPS} ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)}`)
    }
    console.log(style.bold(title))
    console.log(style.dim(opts.hint))

    const answer = (await rl.question(`${style.green('→')} ${style.dim(`(${defaultLabel})`)} `)).trim().toLowerCase()
    if (!answer) return opts.defaultYes
    if (answer === 'y' || answer === 'yes') return true
    if (answer === 'n' || answer === 'no') return false
    console.log(style.yellow('  Please answer y or n.'))
  }
}

function validateUrl(value: string): string | undefined {
  try {
    const parsed = new URL(value)
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return 'URL must start with http:// or https://'
    }
  } catch {
    return 'Enter a valid URL (e.g. https://www.example.com/page)'
  }
  return undefined
}
