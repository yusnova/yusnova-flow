import * as readline from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'
import { GeneratorOptions } from './types'
import { normalizeDomainName, validateDomainInput } from '@codegen-agent/naming/domain-name'
import { normalizePageName, validatePageNameInput } from '@codegen-agent/naming/page-name'

const style = {
  bold: (text: string) => `\x1b[1m${text}\x1b[0m`,
  cyan: (text: string) => `\x1b[36m${text}\x1b[0m`,
  dim: (text: string) => `\x1b[2m${text}\x1b[0m`,
  green: (text: string) => `\x1b[32m${text}\x1b[0m`,
  yellow: (text: string) => `\x1b[33m${text}\x1b[0m`,
}

const TOTAL_STEPS = 4

export async function runInteractiveWizard(): Promise<GeneratorOptions> {
  const rl = readline.createInterface({ input, output })

  try {
    printWelcome()

    const url = await askRequired(rl, 1, 'Target page URL', {
      hint: 'The live page you want to generate a POM and spec from.',
      example: 'https://demo.example.com/products',
      validate: validateUrl,
    })

    const domainInput = await askRequired(rl, 2, 'Domain name', {
      hint: 'Feature folder under suites/ and domains/. kebab-case, snake_case or PascalCase are all fine.',
      example: 'example-page, example_page, example',
      validate: validateDomainInput,
    })
    const domain = normalizeDomainName(domainInput)
    if (domain !== domainInput) {
      console.log(`${style.dim('  Using folder:')} ${style.green(domain)}`)
    }

    const pageInput = await askRequired(rl, 3, 'Page class name', {
      hint: 'Name for the generated Page Object class. kebab-case, snake_case or PascalCase are all fine.',
      example: 'example-page, example_page, ExamplePage',
      validate: validatePageNameInput,
    })
    const page = normalizePageName(pageInput)
    if (page !== pageInput) {
      console.log(`${style.dim('  Using class:')} ${style.green(page)}`)
    }

    const overwrite = await askYesNo(rl, 4, 'Overwrite existing files?', {
      hint: 'Regenerates POM + fixture. Spec: replaces only // @stlc:generated tests; hand-written tests stay. No = abort if files already exist.',
      defaultYes: false,
    })

    const headless = await askYesNo(rl, 4, 'Run headless?', {
      hint: 'Hide the browser window during generation. Leave off to watch the flow while debugging.',
      defaultYes: false,
      optionalStep: true,
    })

    const opts: GeneratorOptions = {
      url,
      domain,
      page,
      type: 'ui',
      explore: true,
      overwrite,
      headless,
      noCodegen: false,
    }

    await confirmSummary(rl, opts)
    return opts
  } finally {
    rl.close()
  }
}

function printWelcome(): void {
  console.log(`
${style.bold('╔══════════════════════════════════════════════╗')}
${style.bold('║')}   ${style.cyan('codegen:agent')}  ·  interactive setup          ${style.bold('║')}
${style.bold('╚══════════════════════════════════════════════╝')}

${style.dim('Type your values below. Examples are suggestions only — empty Enter re-asks the question.')}
${style.dim('Authenticated pages sign in automatically via REGULAR_USER_* in .env.')}
`)
}

async function confirmSummary(rl: readline.Interface, opts: GeneratorOptions): Promise<void> {
  console.log(`
${style.bold('━━ Summary ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')}
  URL        : ${opts.url}
  Domain     : ${opts.domain}
  Page       : ${opts.page}
  Type       : ${opts.type}
  Explore    : yes (always on)
  Overwrite  : ${opts.overwrite ? 'yes' : 'no'}
  Headless   : ${opts.headless ? 'yes' : 'no'}
`)

  while (true) {
    const answer = (await rl.question(`${style.green('→')} Start generation? ${style.dim('(Y/n)')} `)).trim().toLowerCase()
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

interface AskYesNoConfig {
  hint: string
  defaultYes: boolean
  optionalStep?: boolean
}

async function askYesNo(
  rl: readline.Interface,
  step: number,
  title: string,
  config: AskYesNoConfig,
): Promise<boolean> {
  const defaultLabel = config.defaultYes ? 'Y/n' : 'y/N'

  while (true) {
    if (!config.optionalStep) {
      console.log(`\n${style.cyan(`━━ Step ${step}/${TOTAL_STEPS} ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)}`)
    }
    console.log(style.bold(title))
    console.log(style.dim(config.hint))
    if (!config.optionalStep && step === 4) {
      console.log(`${style.dim('Explore:')} ${style.green('on')} ${style.dim('(click-through + modal scan — automatic)')}`)
    }

    const answer = (await rl.question(`${style.green('→')} ${style.dim(`(${defaultLabel})`)} `)).trim().toLowerCase()
    if (!answer) return config.defaultYes
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
