"use client"

import type { Dispatch, SetStateAction } from "react"
import { useState } from "react"
import type { BookingState } from "@/components/BookingFlow"
import { isValidUkPostcode, formatPostcodeDisplay } from "@/lib/uk-postcode"

type Props = {
  state: BookingState
  setState: Dispatch<SetStateAction<BookingState>>
}

export function StepPostcode({ state, setState }: Props) {
  const [input, setInput] = useState(state.postcode || "")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const addresses = state.addresses

  const lookup = async () => {
    setError(null)
    if (!isValidUkPostcode(input)) {
      setError("Enter a valid UK postcode (e.g. SW1A 1AA).")
      return
    }
    setLoading(true)
    try {
      const res = await fetch("/api/postcode/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postcode: input.trim() }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        setError(
          typeof j.error === "string"
            ? j.error
            : "Lookup failed. You can retry or enter the address manually.",
        )
        setState((s) => ({
          ...s,
          postcode: input.trim(),
          addresses: [],
          addressId: null,
        }))
        return
      }
      const data = (await res.json()) as {
        postcode: string
        addresses: { id: string; line1: string; city: string }[]
      }
      setState((s) => ({
        ...s,
        postcode: data.postcode,
        addresses: data.addresses,
        addressId: data.addresses[0]?.id ?? null,
        useManualAddress: data.addresses.length === 0,
      }))
    } catch {
      setError("Network error. Check your connection and retry.")
      setState((s) => ({ ...s, addresses: [], addressId: null }))
    } finally {
      setLoading(false)
    }
  }

  const canContinue =
    state.postcode &&
    (state.useManualAddress
      ? state.manualAddress.trim().length > 5
      : !!state.addressId)

  return (
    <section
      className="rounded-2xl border border-surface-border bg-surface-muted/40 p-6 shadow-xl backdrop-blur"
      aria-labelledby="step1-title"
      data-testid="step-postcode"
    >
      <h2 id="step1-title" className="text-lg font-semibold text-white">
        Delivery postcode
      </h2>
      <p className="mt-1 text-sm text-slate-400">
        We validate your postcode and list known addresses. You can enter the
        address manually if needed.
      </p>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label
            htmlFor="postcode"
            className="text-sm font-medium text-slate-300"
          >
            UK postcode
          </label>
          <input
            id="postcode"
            data-testid="postcode-input"
            className="mt-1 w-full rounded-lg border border-surface-border bg-surface px-3 py-2.5 text-white placeholder:text-slate-600"
            placeholder="e.g. SW1A 1AA"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            autoComplete="postal-code"
            disabled={loading}
          />
        </div>
        <button
          type="button"
          data-testid="lookup-button"
          className="rounded-lg bg-accent px-5 py-2.5 font-semibold text-white transition hover:bg-accent-hover disabled:opacity-50"
          onClick={lookup}
          disabled={loading}
        >
          {loading ? "Looking up…" : "Look up"}
        </button>
      </div>

      {error && (
        <div
          className="mt-4 rounded-lg border border-amber-900/60 bg-amber-950/40 p-4 text-amber-100"
          role="alert"
          data-testid="lookup-error"
        >
          <p className="font-medium">Something went wrong</p>
          <p className="mt-1 text-sm text-amber-200/90">{error}</p>
          <button
            type="button"
            data-testid="retry-lookup"
            className="mt-3 text-sm font-semibold text-amber-300 underline hover:text-amber-200"
            onClick={lookup}
          >
            Retry lookup
          </button>
        </div>
      )}

      {loading && (
        <p className="mt-6 text-sm text-slate-400" data-testid="lookup-loading">
          Loading addresses…{" "}
          <span className="text-slate-500">
            (M1 1AE simulates slow network.)
          </span>
        </p>
      )}

      {!loading && state.postcode && addresses.length === 0 && !error && (
        <div
          className="mt-6 rounded-lg border border-slate-700 bg-slate-900/50 p-4"
          data-testid="empty-addresses"
        >
          <p className="font-medium text-slate-200">No addresses found</p>
          <p className="mt-1 text-sm text-slate-400">
            Try <span className="font-mono text-slate-300">EC1A 1BB</span> in
            the demo — or enter the delivery address manually below.
          </p>
        </div>
      )}

      {!loading && addresses.length > 0 && (
        <div className="mt-6" data-testid="address-list">
          <p className="text-sm font-medium text-slate-300">Select address</p>
          <ul className="mt-2 max-h-60 space-y-2 overflow-y-auto pr-1">
            {addresses.map((a) => (
              <li key={a.id}>
                <label
                  className={`flex cursor-pointer rounded-lg border px-3 py-2.5 text-sm transition ${
                    state.addressId === a.id
                      ? "border-accent bg-accent/10"
                      : "border-surface-border hover:border-slate-500"
                  }`}
                >
                  <input
                    type="radio"
                    name="addr"
                    data-testid={`address-option-${a.id}`}
                    checked={state.addressId === a.id}
                    onChange={() =>
                      setState((s) => ({
                        ...s,
                        addressId: a.id,
                        useManualAddress: false,
                      }))
                    }
                    className="mt-0.5"
                  />
                  <span className="ml-3">
                    <span className="block text-white">{a.line1}</span>
                    <span className="text-slate-400">{a.city}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-6 border-t border-surface-border pt-6">
        <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-300">
          <input
            type="checkbox"
            data-testid="manual-address-toggle"
            checked={state.useManualAddress}
            onChange={(e) =>
              setState((s) => ({
                ...s,
                useManualAddress: e.target.checked,
                addressId: e.target.checked
                  ? null
                  : (s.addresses[0]?.id ?? null),
              }))
            }
          />
          Enter address manually
        </label>
        {state.useManualAddress && (
          <textarea
            data-testid="manual-address-input"
            className="mt-2 w-full rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm text-white"
            rows={3}
            placeholder="House number, street, city"
            value={state.manualAddress}
            onChange={(e) =>
              setState((s) => ({ ...s, manualAddress: e.target.value }))
            }
          />
        )}
      </div>

      <div className="mt-8 flex justify-end">
        <button
          type="button"
          data-testid="next-from-step1"
          className="rounded-lg bg-white px-5 py-2.5 font-semibold text-slate-900 disabled:opacity-40"
          disabled={!canContinue}
          onClick={() =>
            setState((s) => ({
              ...s,
              step: 2,
              postcode: formatPostcodeDisplay(input.trim() || s.postcode),
            }))
          }
        >
          Continue
        </button>
      </div>
    </section>
  )
}
