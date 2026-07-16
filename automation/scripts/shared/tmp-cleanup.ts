import * as fs from 'node:fs'
import * as path from 'node:path'

export interface TmpCleanupOptions {
  /** STLC output root, e.g. automation/tmp/stlc */
  stlcDir: string
  /** Bug-hunter exploration output root, e.g. automation/tmp/stlc/exploration */
  explorationDir?: string
  /** Keep at most this many recent run folders (UUID dirs). */
  maxRuns?: number
  /** Keep at most this many recent exploration run folders (explore-* dirs). Defaults to maxRuns. */
  maxExplorationRuns?: number | undefined
  /** Delete run folders older than this many days. */
  maxAgeDays?: number
  /** Do not delete — only report what would be removed. */
  dryRun?: boolean
  /** Never delete these directory names under stlcDir. */
  preserveDirs?: string[]
  /** Run folder names to always keep (e.g. current run). */
  keepRunIds?: string[]
  /** Exploration run folder names to always keep. */
  keepExplorationRunIds?: string[]
  /** Log removed paths to stdout. */
  verbose?: boolean
}

export interface TmpCleanupResult {
  removed: string[]
  kept: number
  skipped: string[]
  explorationRemoved: string[]
  explorationKept: number
}

const UUID_DIR = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const EXPLORE_RUN_DIR = /^explore-\d+$/i

function isStlcRunDir(name: string): boolean {
  return UUID_DIR.test(name)
}

function isExplorationRunDir(name: string): boolean {
  return EXPLORE_RUN_DIR.test(name)
}

function dirModifiedMs(dirPath: string): number {
  try {
    const stat = fs.statSync(dirPath)
    return stat.mtimeMs
  } catch {
    return 0
  }
}

function pruneRunDirectories(input: {
  parentDir: string
  isRunDir: (name: string) => boolean
  maxRuns: number
  maxAgeDays: number
  keepRunIds: string[]
  preserveDirs?: string[]
  dryRun: boolean
  verbose: boolean
}): { removed: string[]; kept: number; skipped: string[] } {
  const {
    parentDir,
    isRunDir,
    maxRuns,
    maxAgeDays,
    keepRunIds,
    preserveDirs = [],
    dryRun,
    verbose,
  } = input

  const removed: string[] = []
  const skipped: string[] = []

  if (!fs.existsSync(parentDir)) {
    return { removed, kept: 0, skipped }
  }

  const keepSet = new Set(keepRunIds)
  const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000
  const now = Date.now()

  const entries = fs.readdirSync(parentDir, { withFileTypes: true })
  const runDirs = entries
    .filter((entry) => entry.isDirectory() && isRunDir(entry.name) && !preserveDirs.includes(entry.name))
    .map((entry) => ({
      name: entry.name,
      path: path.join(parentDir, entry.name),
      mtime: dirModifiedMs(path.join(parentDir, entry.name)),
    }))
    .sort((a, b) => b.mtime - a.mtime)

  const toRemove = new Set<string>()

  for (const run of runDirs) {
    if (keepSet.has(run.name)) continue

    const tooOld = maxAgeDays > 0 && now - run.mtime > maxAgeMs
    if (tooOld) toRemove.add(run.name)
  }

  const sortedByRecency = [...runDirs]
  const runCap = maxRuns > 0 ? maxRuns : 0
  for (let i = runCap; i < sortedByRecency.length; i += 1) {
    const run = sortedByRecency[i]!
    if (!keepSet.has(run.name)) toRemove.add(run.name)
  }

  for (const run of runDirs) {
    if (!toRemove.has(run.name)) continue
    if (dryRun) {
      removed.push(run.path)
      if (verbose) console.log(`Would remove: ${run.path}`)
      continue
    }
    try {
      fs.rmSync(run.path, { recursive: true, force: true })
      removed.push(run.path)
      if (verbose) console.log(`Removed: ${run.path}`)
    } catch {
      skipped.push(run.path)
    }
  }

  return {
    removed,
    kept: runDirs.length - removed.length,
    skipped,
  }
}

export function pruneStlcRuns(options: TmpCleanupOptions): TmpCleanupResult {
  const {
    stlcDir,
    maxRuns = 15,
    maxAgeDays = 14,
    preserveDirs = ['knowledge', 'exploration'],
    keepRunIds = [],
    verbose = false,
    dryRun = false,
  } = options

  const stlc = pruneRunDirectories({
    parentDir: stlcDir,
    isRunDir: isStlcRunDir,
    maxRuns,
    maxAgeDays,
    keepRunIds,
    preserveDirs,
    dryRun,
    verbose,
  })

  return {
    removed: stlc.removed,
    kept: stlc.kept,
    skipped: stlc.skipped,
    explorationRemoved: [],
    explorationKept: 0,
  }
}

/**
 * Prunes bug-hunter exploration runs under tmp/stlc/exploration/ (folders
 * named explore-<timestamp>). Screenshots are the main disk cost here, so
 * these runs use the same retention window as STLC UUID runs by default.
 */
export function pruneExplorationRuns(options: TmpCleanupOptions): Pick<TmpCleanupResult, 'explorationRemoved' | 'explorationKept' | 'skipped'> {
  const {
    stlcDir,
    explorationDir,
    maxRuns = 15,
    maxExplorationRuns,
    maxAgeDays = 14,
    keepExplorationRunIds = [],
    verbose = false,
    dryRun = false,
  } = options

  const parentDir = explorationDir ?? path.join(stlcDir, 'exploration')
  const exploration = pruneRunDirectories({
    parentDir,
    isRunDir: isExplorationRunDir,
    maxRuns: maxExplorationRuns ?? maxRuns,
    maxAgeDays,
    keepRunIds: keepExplorationRunIds,
    dryRun,
    verbose,
  })

  return {
    explorationRemoved: exploration.removed,
    explorationKept: exploration.kept,
    skipped: exploration.skipped,
  }
}

export function cleanCodegenScratch(automationRoot: string, maxAgeDays = 7): string[] {
  const removed: string[] = []
  const candidates = [
    path.join(automationRoot, 'tmp', 'codegen-raw.ts'),
    path.join(automationRoot, 'tmp', 'codegen-explore.ts'),
  ]
  const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000
  const now = Date.now()

  for (const filePath of candidates) {
    if (!fs.existsSync(filePath)) continue
    try {
      const { mtimeMs } = fs.statSync(filePath)
      if (now - mtimeMs > maxAgeMs) {
        fs.rmSync(filePath, { force: true })
        removed.push(filePath)
      }
    } catch {
      // ignore
    }
  }

  return removed
}

export function pruneAutomationTmp(
  automationRoot: string,
  options: Partial<TmpCleanupOptions> = {},
): TmpCleanupResult & { codegenRemoved: string[] } {
  const stlcDir = options.stlcDir ?? path.join(automationRoot, 'tmp', 'stlc')
  const shared: TmpCleanupOptions = {
    stlcDir,
    maxRuns: options.maxRuns ?? 15,
    maxAgeDays: options.maxAgeDays ?? 14,
    preserveDirs: options.preserveDirs ?? ['knowledge', 'exploration'],
    keepRunIds: options.keepRunIds ?? [],
    keepExplorationRunIds: options.keepExplorationRunIds ?? [],
    verbose: options.verbose ?? false,
    dryRun: options.dryRun ?? false,
    ...(options.maxExplorationRuns !== undefined ? { maxExplorationRuns: options.maxExplorationRuns } : {}),
    ...(options.explorationDir ? { explorationDir: options.explorationDir } : {}),
  }

  const stlc = pruneStlcRuns(shared)
  const exploration = pruneExplorationRuns(shared)
  const codegenRemoved = cleanCodegenScratch(automationRoot, shared.maxAgeDays ?? 14)

  return {
    removed: stlc.removed,
    kept: stlc.kept,
    skipped: [...stlc.skipped, ...exploration.skipped],
    explorationRemoved: exploration.explorationRemoved,
    explorationKept: exploration.explorationKept,
    codegenRemoved,
  }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function tmpDirSize(dirPath: string): number {
  if (!fs.existsSync(dirPath)) return 0
  let total = 0
  const stack = [dirPath]
  while (stack.length > 0) {
    const current = stack.pop()!
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(current, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      const abs = path.join(current, entry.name)
      if (entry.isDirectory()) stack.push(abs)
      else {
        try {
          total += fs.statSync(abs).size
        } catch {
          // ignore
        }
      }
    }
  }
  return total
}
