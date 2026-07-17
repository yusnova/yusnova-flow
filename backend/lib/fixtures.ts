import type { Address } from "@/lib/types"

export function normalisePostcode(pc: string): string {
  return pc.replace(/\s+/g, "").toUpperCase()
}

/** SW1A 1AA — 12+ addresses (assessment fixture). */
export const SW1A_ADDRESSES: Address[] = [
  { id: "addr_1", line1: "10 Downing Street", city: "London" },
  { id: "addr_2", line1: "11 Downing Street", city: "London" },
  { id: "addr_3", line1: "12 Whitehall", city: "London" },
  { id: "addr_4", line1: "15 Great George Street", city: "London" },
  { id: "addr_5", line1: "1 Parliament Street", city: "London" },
  { id: "addr_6", line1: "7 Horse Guards Road", city: "London" },
  { id: "addr_7", line1: "22 The Mall", city: "London" },
  { id: "addr_8", line1: "3 Birdcage Walk", city: "London" },
  { id: "addr_9", line1: "18 St James's Park", city: "London" },
  { id: "addr_10", line1: "5 Storey's Gate", city: "London" },
  { id: "addr_11", line1: "9 Dean Trench Street", city: "London" },
  { id: "addr_12", line1: "14 Smith Square", city: "London" },
]

const BASE_SKIPS = [
  { size: "2-yard", price: 95, disabled: false },
  { size: "3-yard", price: 105, disabled: false },
  { size: "4-yard", price: 120, disabled: false },
  { size: "6-yard", price: 165, disabled: false },
  { size: "8-yard", price: 195, disabled: false },
  { size: "10-yard", price: 220, disabled: false },
  { size: "12-yard", price: 260, disabled: false },
  { size: "14-yard", price: 295, disabled: false },
] as const

export function buildSkipsList(opts: {
  heavyWaste: boolean
  plasterboard: boolean
  plasterboardOption: string | null
}) {
  return BASE_SKIPS.map((s) => {
    let disabled = false
    if (opts.heavyWaste && (s.size === "12-yard" || s.size === "14-yard")) {
      disabled = true
    }
    if (
      opts.plasterboard &&
      opts.plasterboardOption === "dedicated" &&
      (s.size === "2-yard" || s.size === "3-yard")
    ) {
      disabled = true
    }
    return { size: s.size, price: s.price, disabled }
  })
}
