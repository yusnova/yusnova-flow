import * as fs from 'node:fs'
import * as path from 'node:path'
import { toFixtureInterfaceName, toPageImportPath, toPageVar } from '@codegen-agent/naming/page-name'

export class FixtureWriter {
  async write(opts: {
    domain: string
    pageClassName: string
    automationRoot: string
    overwrite: boolean
  }): Promise<string> {
    const outDir = path.join(opts.automationRoot, 'domains', opts.domain)
    const outPath = path.join(outDir, `${opts.domain}.fixture.ts`)
    const pageVar = toPageVar(opts.pageClassName)
    const pageImport = toPageImportPath(opts.pageClassName)
    const fixturesInterface = toFixtureInterfaceName(opts.domain)

    if (fs.existsSync(outPath) && !opts.overwrite) {
      throw new Error(`Fixture already exists: ${outPath} (use --overwrite to replace)`)
    }

    const content = `import { test as baseTest } from '@core/fixtures/base.fixture'
import { ${opts.pageClassName} } from '@pages/${pageImport}'

interface ${fixturesInterface} {
  ${pageVar}: ${opts.pageClassName}
}

export const test = baseTest.extend<${fixturesInterface}>({
  ${pageVar}: async ({ page }, use) => {
    await use(new ${opts.pageClassName}(page))
  },
})

export { expect } from '@playwright/test'
`

    fs.mkdirSync(outDir, { recursive: true })
    fs.writeFileSync(outPath, content, 'utf-8')
    return outPath
  }
}
