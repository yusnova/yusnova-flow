"use client"

import type { Dispatch, SetStateAction } from "react"
import { useState } from "react"
import type { BookingState, WastePath } from "@/components/BookingFlow"
import type { PlasterboardOption } from "@/lib/types"

type Props = {
  state: BookingState
  setState: Dispatch<SetStateAction<BookingState>>
}

export function StepWaste({ state, setState }: Props) {
  const [path, setPath] = useState<WastePath>(state.wastePath)
  const [pOption, setPOption] = useState<PlasterboardOption>(
    state.plasterboardOption,
  )
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const plasterboard = path === "plasterboard"
  const canNext = !plasterboard || (pOption !== null && pOption !== undefined)

  const submit = async () => {
    setErr(null)
    const heavyWaste = path === "heavy"
    const plaster = path === "plasterboard"
    const plasterboardOption = plaster ? pOption : null
    if (plaster && !plasterboardOption) {
      setErr("Choose how plasterboard will be handled.")
      return
    }
    setSaving(true)
    try {
      const res = await fetch("/api/waste-types", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          heavyWaste,
          plasterboard: plaster,
          plasterboardOption: plasterboardOption ?? null,
        }),
      })
      if (!res.ok) {
        setErr("Could not save waste selection.")
        return
      }
      setState((s) => ({
        ...s,
        step: 3,
        wastePath: path,
        plasterboardOption: plasterboardOption ?? null,
      }))
    } catch {
      setErr("Network error. Retry.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <section
      className="rounded-2xl border border-surface-border bg-surface-muted/40 p-6 shadow-xl"
      aria-labelledby="step2-title"
      data-testid="step-waste"
    >
      <h2 id="step2-title" className="text-lg font-semibold text-white">
        Waste type
      </h2>
      <p className="mt-1 text-sm text-slate-400">
        General household, heavy inert waste, or loads containing plasterboard
        (with handling options).
      </p>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        {(
          [
            {
              id: "general" as const,
              title: "General",
              desc: "Mixed household",
            },
            {
              id: "heavy" as const,
              title: "Heavy",
              desc: "Soil, hardcore, rubble",
            },
            {
              id: "plasterboard" as const,
              title: "Plasterboard",
              desc: "Contains gypsum board",
            },
          ] satisfies { id: WastePath; title: string; desc: string }[]
        ).map((o) => (
          <button
            key={o.id}
            type="button"
            data-testid={`waste-path-${o.id}`}
            onClick={() => {
              setPath(o.id)
              if (o.id !== "plasterboard") setPOption(null)
            }}
            className={`rounded-xl border p-4 text-left transition ${
              path === o.id
                ? "border-accent bg-accent/15 ring-1 ring-accent"
                : "border-surface-border hover:border-slate-500"
            }`}
          >
            <span className="block font-semibold text-white">{o.title}</span>
            <span className="mt-1 block text-xs text-slate-400">{o.desc}</span>
          </button>
        ))}
      </div>

      {plasterboard && (
        <fieldset className="mt-8" data-testid="plasterboard-options">
          <legend className="text-sm font-medium text-slate-300">
            Plasterboard handling
          </legend>
          <div className="mt-3 space-y-2">
            {(
              [
                {
                  v: "mixed" as const,
                  label: "Less than 10% plasterboard (mixed load)",
                },
                {
                  v: "separate" as const,
                  label: "Plasterboard segregated on site (separate load)",
                },
                {
                  v: "dedicated" as const,
                  label: "Dedicated plasterboard skip only",
                },
              ] as const
            ).map((o) => (
              <label
                key={o.v}
                className={`flex cursor-pointer rounded-lg border px-3 py-2.5 text-sm ${
                  pOption === o.v
                    ? "border-accent bg-accent/10"
                    : "border-surface-border"
                }`}
              >
                <input
                  type="radio"
                  name="pb"
                  data-testid={`plasterboard-option-${o.v}`}
                  checked={pOption === o.v}
                  onChange={() => setPOption(o.v)}
                />
                <span className="ml-3 text-slate-200">{o.label}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {err && (
        <p
          className="mt-4 text-sm text-red-300"
          role="alert"
          data-testid="waste-error"
        >
          {err}
        </p>
      )}

      <div className="mt-8 flex justify-between gap-3">
        <button
          type="button"
          data-testid="back-from-step2"
          className="rounded-lg border border-surface-border px-4 py-2 text-sm font-medium text-slate-200 hover:bg-surface-muted"
          onClick={() => setState((s) => ({ ...s, step: 1 }))}
        >
          Back
        </button>
        <button
          type="button"
          data-testid="next-from-step2"
          className="rounded-lg bg-white px-5 py-2.5 font-semibold text-slate-900 disabled:opacity-40"
          disabled={!canNext || saving}
          onClick={submit}
        >
          {saving ? "Saving…" : "Continue"}
        </button>
      </div>
    </section>
  )
}
