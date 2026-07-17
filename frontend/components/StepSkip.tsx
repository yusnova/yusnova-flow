"use client"

import type { Dispatch, SetStateAction } from "react"
import { useEffect, useState } from "react"
import type { SkipSize } from "@/lib/types"
import type { BookingState } from "@/components/BookingFlow"
import { normalisePostcode } from "@/lib/fixtures"

type Props = {
  state: BookingState
  setState: Dispatch<SetStateAction<BookingState>>
  heavyWaste: boolean
  plasterboard: boolean
}

function normaliseSkipSizeKey(raw: string): string {
  const t = raw.trim().toLowerCase().replace(/\s+/g, " ")
  const m = t.match(/^(\d+)\s*yard$/)
  if (m) return `${m[1]}-yard`
  return t.replace(/\s+/g, "-")
}

export function StepSkip({ state, setState, heavyWaste, plasterboard }: Props) {
  const [skips, setSkips] = useState<SkipSize[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const pc = normalisePostcode(state.postcode)
  const plasterOpt = state.plasterboardOption

  const load = async () => {
    setLoading(true)
    setError(null)
    const params = new URLSearchParams({
      postcode: pc,
      heavyWaste: String(heavyWaste),
      plasterboard: String(plasterboard),
    })
    if (plasterOpt) params.set("plasterboardOption", plasterOpt)
    try {
      const res = await fetch(`/api/skips?${params.toString()}`)
      if (!res.ok) {
        setError("Could not load skip prices.")
        setSkips([])
        return
      }
      const data = (await res.json()) as { skips: SkipSize[] }
      setSkips(data.skips)
    } catch {
      setError("Network error loading skips.")
      setSkips([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [pc, heavyWaste, plasterboard, plasterOpt])

  const selected = state.skipSize

  return (
    <section
      className="rounded-2xl border border-surface-border bg-surface-muted/40 p-6 shadow-xl"
      aria-labelledby="step3-title"
      data-testid="step-skip"
    >
      <h2 id="step3-title" className="text-lg font-semibold text-white">
        Skip size
      </h2>
      <p className="mt-1 text-sm text-slate-400">
        Sizes are normalised (e.g. &quot;4 yard&quot; → 4-yard). Heavy waste
        disables the largest options in this demo.
      </p>

      {loading && (
        <p className="mt-6 text-sm text-slate-400" data-testid="skips-loading">
          Loading skip options…
        </p>
      )}

      {error && (
        <div
          className="mt-4 rounded-lg border border-red-900/50 bg-red-950/40 p-4 text-red-100"
          role="alert"
          data-testid="skips-error"
        >
          <p>{error}</p>
          <button
            type="button"
            data-testid="retry-skips"
            className="mt-2 text-sm font-semibold underline"
            onClick={() => void load()}
          >
            Retry
          </button>
        </div>
      )}

      {!loading && !error && skips.length > 0 && (
        <ul className="mt-6 space-y-2" data-testid="skip-list">
          {skips.map((s) => {
            const disabled = s.disabled
            return (
              <li key={s.size}>
                <label
                  className={`flex items-center justify-between rounded-xl border px-4 py-3 text-sm ${
                    disabled
                      ? "cursor-not-allowed border-surface-border opacity-60"
                      : "cursor-pointer border-surface-border hover:border-slate-500"
                  } ${
                    !disabled && selected === s.size
                      ? "border-accent bg-accent/10"
                      : ""
                  }`}
                  data-testid={`skip-row-${s.size}`}
                >
                  <span className="flex items-center gap-3">
                    <input
                      type="radio"
                      name="skip"
                      disabled={disabled}
                      data-testid={`skip-option-${s.size}`}
                      checked={selected === s.size}
                      onChange={() =>
                        setState((st) => ({
                          ...st,
                          skipSize: s.size,
                          skipPrice: s.price,
                        }))
                      }
                    />
                    <span>
                      <span className="block font-medium text-white">
                        {s.size.replace("-", " ")}
                      </span>
                      {disabled && (
                        <span
                          className="text-xs text-amber-300/90"
                          data-testid={`skip-disabled-reason-${s.size}`}
                        >
                          Not available for this waste profile
                        </span>
                      )}
                    </span>
                  </span>
                  <span className="font-mono text-slate-200">£{s.price}</span>
                </label>
              </li>
            )
          })}
        </ul>
      )}

      <div className="mt-4 rounded-lg border border-dashed border-surface-border p-3 text-xs text-slate-500">
        Normalisation demo: type alias{" "}
        <span className="font-mono text-slate-400">4 yard</span> matches{" "}
        <span className="font-mono text-slate-400">4-yard</span> (
        <button
          type="button"
          className="text-accent underline"
          data-testid="normalize-demo"
          onClick={() => {
            const key = normaliseSkipSizeKey("4 yard")
            const match = skips.find((x) => x.size === key)
            if (match && !match.disabled) {
              setState((st) => ({
                ...st,
                skipSize: match.size,
                skipPrice: match.price,
              }))
            }
          }}
        >
          select 4-yard via normalisation
        </button>
        )
      </div>

      <div className="mt-8 flex justify-between gap-3">
        <button
          type="button"
          data-testid="back-from-step3"
          className="rounded-lg border border-surface-border px-4 py-2 text-sm font-medium text-slate-200 hover:bg-surface-muted"
          onClick={() => setState((s) => ({ ...s, step: 2 }))}
        >
          Back
        </button>
        <button
          type="button"
          data-testid="next-from-step3"
          className="rounded-lg bg-white px-5 py-2.5 font-semibold text-slate-900 disabled:opacity-40"
          disabled={!selected || !state.skipPrice}
          onClick={() => setState((s) => ({ ...s, step: 4 }))}
        >
          Review booking
        </button>
      </div>
    </section>
  )
}
