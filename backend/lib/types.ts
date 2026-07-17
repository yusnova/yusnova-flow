export type Address = { id: string; line1: string; city: string }

export type PlasterboardOption = "mixed" | "separate" | "dedicated" | null

export type SkipSize = {
  size: string
  price: number
  disabled: boolean
}

export type BookingPayload = {
  postcode: string
  addressId: string | null
  manualAddress: string | null
  heavyWaste: boolean
  plasterboard: boolean
  plasterboardOption: PlasterboardOption
  skipSize: string
  price: number
}
