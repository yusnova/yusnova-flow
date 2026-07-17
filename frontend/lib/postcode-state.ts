import { normalisePostcode } from "@/lib/fixtures"

const bs1LookupCount = new Map<string, number>()

export function shouldFailBs1Lookup(postcode: string): boolean {
  const key = normalisePostcode(postcode)
  if (key !== "BS14DJ") return false
  const n = (bs1LookupCount.get(key) ?? 0) + 1
  bs1LookupCount.set(key, n)
  return n === 1
}

export function resetBs1FixtureForTests() {
  bs1LookupCount.delete("BS14DJ")
}
