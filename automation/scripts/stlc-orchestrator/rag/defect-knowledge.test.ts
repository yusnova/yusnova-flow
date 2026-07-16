import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { DefectKnowledgeBase } from './defect-knowledge'
import { cosineSimilarity, EmbeddingProvider } from './embeddings'

// --- cosineSimilarity basics ---
assert.equal(cosineSimilarity([1, 0], [1, 0]), 1)
assert.equal(cosineSimilarity([1, 0], [0, 1]), 0)
assert.equal(cosineSimilarity([], [1]), 0)
assert.equal(cosineSimilarity([1, 2], [1, 2, 3]), 0)

class DisabledProvider implements EmbeddingProvider {
  isEnabled(): boolean {
    return false
  }
  async embed(): Promise<number[][]> {
    return []
  }
}

/** Deterministic fake: assigns a fixed vector per known text substring so tests don't need real network calls. */
class FakeSemanticProvider implements EmbeddingProvider {
  isEnabled(): boolean {
    return true
  }
  async embed(texts: string[]): Promise<number[][]> {
    return texts.map((text) => {
      const lower = text.toLowerCase()
      if (lower.includes('cart') || lower.includes('basket')) return [0, 1, 0]
      if (lower.includes('checkout') || lower.includes('payment')) return [1, 0, 0]
      return [0, 0, 1]
    })
  }
}

async function withKnowledgeDir(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stlc-rag-'))
  try {
    await fn(dir)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

async function main(): Promise<void> {
  // --- without embeddings: pure keyword search (unchanged behavior) ---
  await withKnowledgeDir(async (dir) => {
    const rag = new DefectKnowledgeBase(dir, new DisabledProvider())
    rag.ingestFromDefects(
      [
        {
          id: 'DEF-1',
          title: 'Cart total does not update after removing item',
          severity: 'major',
          dedupHash: 'cart-total',
          triageStatus: 'confirmed',
          rootCauseHypothesis: 'Stale cart state cache',
          linkedCaseIds: [],
          confidence: 0.8,
        },
      ],
      'checkout',
      'run-1',
    )

    const matches = await rag.search('user removes item from cart', 'checkout')
    assert.ok(matches.length > 0, 'expected keyword overlap match')
    assert.ok(matches[0]!.reason.includes('Keyword overlap'))
  })

  // --- with embeddings enabled: semantic-only match surfaces even with zero keyword overlap ---
  await withKnowledgeDir(async (dir) => {
    const rag = new DefectKnowledgeBase(dir, new FakeSemanticProvider())
    rag.ingestFromDefects(
      [
        {
          id: 'DEF-2',
          title: 'Basket icon shows stale count',
          severity: 'minor',
          dedupHash: 'basket-count',
          triageStatus: 'confirmed',
          rootCauseHypothesis: 'Frontend event listener not re-subscribed',
          linkedCaseIds: [],
          confidence: 0.7,
        },
      ],
      'checkout',
      'run-2',
    )

    // "cart" query has zero literal keyword overlap with "Basket icon shows stale count",
    // but both embed to the same fake vector bucket ([0,1,0]) → semantic match should surface.
    const matches = await rag.search('cart', 'checkout')
    assert.ok(matches.length > 0, 'expected semantic match despite no keyword overlap')
    assert.ok(matches[0]!.reason.includes('semantic'), `expected semantic reason, got: ${matches[0]!.reason}`)

    const cacheFile = path.join(dir, 'defect-embeddings.json')
    assert.ok(fs.existsSync(cacheFile), 'expected embedding cache to be persisted')

    const matchesAgain = await rag.search('cart', 'checkout')
    assert.deepEqual(matchesAgain.map((m) => m.pattern.id), matches.map((m) => m.pattern.id))
  })

  console.log('defect-knowledge.test.ts: all assertions passed')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
