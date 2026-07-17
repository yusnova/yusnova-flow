import { NextResponse } from "next/server"

function randomId() {
  const n = Math.floor(10000 + Math.random() * 90000)
  return `BK-${n}`
}

export async function POST(req: Request) {
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }
  const postcode = body.postcode
  const skipSize = body.skipSize
  const price = body.price
  if (typeof postcode !== "string" || !postcode.trim()) {
    return NextResponse.json({ error: "postcode required" }, { status: 400 })
  }
  if (typeof skipSize !== "string" || !skipSize) {
    return NextResponse.json({ error: "skipSize required" }, { status: 400 })
  }
  if (typeof price !== "number") {
    return NextResponse.json({ error: "price required" }, { status: 400 })
  }

  await new Promise((r) => setTimeout(r, 400))

  return NextResponse.json({
    status: "success",
    bookingId: randomId(),
  })
}
