"use client"

import type { Dispatch, SetStateAction } from "react"
import { useState } from "react"
import type { BookingState } from "@/components/BookingFlow"

type Props = {
  state: BookingState
  setState: Dispatch<SetStateAction<BookingState>>
  summaryPostcode: string
  heavyWaste: boolean
  plasterboard: boolean
  onStartAgain: () => void
}

const VAT_RATE = 0.2

export function StepReview({
  state,
  setState,
  summaryPostcode,
  heavyWaste,
  plasterboard,
  onStartAgain,
}: Props) {
  const [submitting, setSubmitting] = useState(false)
  const [doneId, setDoneId] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const base = state.skipPrice ?? 0
  const permit = 42
  const subtotal = base + permit
  const vat = Math.round(subtotal * VAT_RATE * 100) / 100
  const total = Math.round((subtotal + vat) * 100) / 100

  const confirm = async () => {
    if (submitting || doneId) return
    setErr(null)
    setSubmitting(true)
    try {
      const res = await fetch("/api/booking/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          postcode: summaryPostcode,
          addressId: state.useManualAddress ? null : state.addressId,
          manualAddress: state.useManualAddress ? state.manualAddress : null,
          heavyWaste,
          plasterboard,
          plasterboardOption: state.plasterboardOption,
          skipSize: state.skipSize,
          price: base,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setErr(typeof data.error === "string" ? data.error : "Confirm failed.")
        return
      }
      setDoneId((data as { bookingId?: string }).bookingId ?? "BK-UNKNOWN")
    } catch {
      setErr("Network error confirming booking.")
    } finally {
      setSubmitting(false)
    }
  }

  const addrLabel = state.useManualAddress
    ? state.manualAddress
    : (state.addresses.find((a) => a.id === state.addressId)?.line1 ?? "—")

  if (doneId) {
    return (
      <section
        className="rounded-2xl border border-emerald-900/50 bg-emerald-950/30 p-6"
        data-testid="booking-success"
      >
        <h2 className="text-lg font-semibold text-emerald-100">
          Booking confirmed
        </h2>
        <p className="mt-2 text-slate-300">
          Reference:{" "}
          <span className="font-mono text-white" data-testid="booking-id">
            {doneId}
          </span>
        </p>
        <button
          type="button"
          data-testid="start-again"
          className="mt-6 rounded-lg bg-white px-5 py-2.5 font-semibold text-slate-900"
          onClick={onStartAgain}
        >
          Start new booking
        </button>
      </section>
    )
  }

  return (
    <section
      className="rounded-2xl border border-surface-border bg-surface-muted/40 p-6 shadow-xl"
      aria-labelledby="step4-title"
      data-testid="step-review"
    >
      <h2 id="step4-title" className="text-lg font-semibold text-white">
        Review &amp; pay
      </h2>
      <p className="mt-1 text-sm text-slate-400">
        Check the summary and price breakdown before confirming. The confirm
        button is disabled while submitting to prevent double booking.
      </p>

      <dl
        className="mt-6 space-y-2 rounded-xl border border-surface-border bg-surface/60 p-4 text-sm"
        data-testid="review-summary"
      >
        <div className="flex justify-between gap-4">
          <dt className="text-slate-400">Postcode</dt>
          <dd className="font-mono text-white" data-testid="summary-postcode">
            {summaryPostcode}
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-slate-400">Address</dt>
          <dd className="text-right text-white" data-testid="summary-address">
            {addrLabel}
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-slate-400">Waste</dt>
          <dd className="text-white" data-testid="summary-waste">
            {heavyWaste
              ? "Heavy"
              : plasterboard
                ? `Plasterboard (${state.plasterboardOption})`
                : "General"}
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-slate-400">Skip</dt>
          <dd className="text-white" data-testid="summary-skip">
            {state.skipSize?.replace("-", " ")}
          </dd>
        </div>
      </dl>

      <div
        className="mt-6 rounded-xl border border-surface-border bg-surface/80 p-4"
        data-testid="price-breakdown"
      >
        <h3 className="text-sm font-semibold text-slate-200">
          Price breakdown
        </h3>
        <ul className="mt-3 space-y-2 text-sm">
          <li className="flex justify-between">
            <span className="text-slate-400">Skip hire</span>
            <span className="font-mono" data-testid="price-skip">
              £{base.toFixed(2)}
            </span>
          </li>
          <li className="flex justify-between">
            <span className="text-slate-400">Highway permit (est.)</span>
            <span className="font-mono" data-testid="price-permit">
              £{permit.toFixed(2)}
            </span>
          </li>
          <li className="flex justify-between border-t border-surface-border pt-2">
            <span className="text-slate-400">Subtotal</span>
            <span className="font-mono">£{subtotal.toFixed(2)}</span>
          </li>
          <li className="flex justify-between">
            <span className="text-slate-400">VAT (20%)</span>
            <span className="font-mono" data-testid="price-vat">
              £{vat.toFixed(2)}
            </span>
          </li>
          <li className="flex justify-between pt-2 text-base font-semibold text-white">
            <span>Total</span>
            <span className="font-mono" data-testid="price-total">
              £{total.toFixed(2)}
            </span>
          </li>
        </ul>
      </div>

      {err && (
        <p
          className="mt-4 text-sm text-red-300"
          role="alert"
          data-testid="confirm-error"
        >
          {err}
        </p>
      )}

      <div className="mt-8 flex flex-wrap justify-between gap-3">
        <button
          type="button"
          data-testid="back-from-step4"
          className="rounded-lg border border-surface-border px-4 py-2 text-sm font-medium text-slate-200 hover:bg-surface-muted"
          onClick={() => setState((s) => ({ ...s, step: 3 }))}
          disabled={submitting}
        >
          Back
        </button>
        <button
          type="button"
          data-testid="confirm-booking"
          className="rounded-lg bg-accent px-6 py-2.5 font-semibold text-white hover:bg-accent-hover disabled:opacity-50"
          onClick={() => void confirm()}
          disabled={submitting}
        >
          {submitting ? "Confirming…" : "Confirm booking"}
        </button>
      </div>
    </section>
  )
}
