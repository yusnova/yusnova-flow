"use client"

import { useCallback, useMemo, useState } from "react"
import type { Address, PlasterboardOption } from "@/lib/types"
import { formatPostcodeDisplay } from "@/lib/uk-postcode"
import { StepPostcode } from "@/components/StepPostcode"
import { StepReview } from "@/components/StepReview"
import { StepSkip } from "@/components/StepSkip"
import { StepWaste } from "@/components/StepWaste"

export type WastePath = "general" | "heavy" | "plasterboard"

export type BookingState = {
  step: 1 | 2 | 3 | 4
  postcode: string
  addresses: Address[]
  addressId: string | null
  manualAddress: string
  useManualAddress: boolean
  wastePath: WastePath
  plasterboardOption: PlasterboardOption
  skipSize: string | null
  skipPrice: number | null
}

const initial: BookingState = {
  step: 1,
  postcode: "",
  addresses: [],
  addressId: null,
  manualAddress: "",
  useManualAddress: false,
  wastePath: "general",
  plasterboardOption: null,
  skipSize: null,
  skipPrice: null,
}

export function BookingFlow() {
  const [state, setState] = useState<BookingState>(initial)

  const heavyWaste = state.wastePath === "heavy"
  const plasterboard = state.wastePath === "plasterboard"

  const resetFlow = useCallback(() => {
    setState(initial)
  }, [])

  const summaryPostcode = useMemo(
    () => (state.postcode ? formatPostcodeDisplay(state.postcode) : ""),
    [state.postcode],
  )

  return (
    <div
      className="mx-auto max-w-2xl px-4 py-10 sm:px-6"
      data-testid="booking-flow"
    >
      <header className="mb-10">
        <p className="text-sm font-medium uppercase tracking-wide text-slate-400">
          Demo booking
        </p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight text-white">
          Skip hire
        </h1>
        <p className="mt-2 text-slate-400">
          Postcode, waste type, skip size, then confirm. Fixtures:{" "}
          <span className="font-mono text-slate-300">SW1A 1AA</span>,{" "}
          <span className="font-mono text-slate-300">EC1A 1BB</span>,{" "}
          <span className="font-mono text-slate-300">M1 1AE</span>,{" "}
          <span className="font-mono text-slate-300">BS1 4DJ</span>.
        </p>
      </header>

      <ol
        className="mb-8 flex flex-wrap gap-2 text-sm"
        aria-label="Progress"
        data-testid="step-indicator"
      >
        {[1, 2, 3, 4].map((n) => (
          <li
            key={n}
            data-testid={`step-dot-${n}`}
            className={`rounded-full px-3 py-1 font-medium ${
              state.step === n
                ? "bg-accent text-white"
                : state.step > n
                  ? "bg-emerald-900/50 text-emerald-200"
                  : "bg-surface-muted text-slate-500"
            }`}
          >
            Step {n}
          </li>
        ))}
      </ol>

      {state.step === 1 && <StepPostcode state={state} setState={setState} />}
      {state.step === 2 && <StepWaste state={state} setState={setState} />}
      {state.step === 3 && (
        <StepSkip
          state={state}
          setState={setState}
          heavyWaste={heavyWaste}
          plasterboard={plasterboard}
        />
      )}
      {state.step === 4 && (
        <StepReview
          state={state}
          setState={setState}
          summaryPostcode={summaryPostcode}
          heavyWaste={heavyWaste}
          plasterboard={plasterboard}
          onStartAgain={resetFlow}
        />
      )}
    </div>
  )
}
