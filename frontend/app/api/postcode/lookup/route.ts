import { NextResponse } from "next/server"
import { normalisePostcode, SW1A_ADDRESSES } from "@/lib/fixtures"
import { shouldFailBs1Lookup } from "@/lib/postcode-state"

const LATENCY_MS = 2200

export async function POST(req: Request) {
  let body: { postcode?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }
  const raw = body.postcode?.trim()
  if (!raw) {
    return NextResponse.json({ error: "postcode required" }, { status: 400 })
  }

  const key = normalisePostcode(raw)

  if (key === "M11AE") {
    await new Promise((r) => setTimeout(r, LATENCY_MS))
  }

  if (key === "BS14DJ" && shouldFailBs1Lookup(raw)) {
    return NextResponse.json(
      { error: "Upstream service unavailable" },
      { status: 500 },
    )
  }

  if (key === "SW1A1AA") {
    return NextResponse.json({
      postcode: raw.replace(/\s+/g, " ").toUpperCase(),
      addresses: SW1A_ADDRESSES,
    })
  }

  if (key === "EC1A1BB") {
    return NextResponse.json({
      postcode: raw.replace(/\s+/g, " ").toUpperCase(),
      addresses: [],
    })
  }

  if (key === "BS14DJ") {
    return NextResponse.json({
      postcode: raw.replace(/\s+/g, " ").toUpperCase(),
      addresses: [
        {
          id: "addr_bs1_1",
          line1: "1 Broad Quay",
          city: "Bristol",
        },
        {
          id: "addr_bs1_2",
          line1: "7 Welsh Back",
          city: "Bristol",
        },
      ],
    })
  }

  return NextResponse.json({
    postcode: raw.replace(/\s+/g, " ").toUpperCase(),
    addresses: [
      {
        id: "addr_demo_1",
        line1: "1 Demo Street",
        city: "Sample City",
      },
    ],
  })
}
