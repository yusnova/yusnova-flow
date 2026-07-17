import { NextResponse } from "next/server"
import { buildSkipsList, normalisePostcode } from "@/lib/fixtures"

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const postcode = searchParams.get("postcode") ?? ""
  const heavyWaste = searchParams.get("heavyWaste") === "true"
  const plasterboard = searchParams.get("plasterboard") === "true"
  const plasterboardOption = searchParams.get("plasterboardOption")

  if (!normalisePostcode(postcode)) {
    return NextResponse.json({ error: "postcode required" }, { status: 400 })
  }

  const skips = buildSkipsList({
    heavyWaste,
    plasterboard,
    plasterboardOption,
  })

  return NextResponse.json({ skips })
}
