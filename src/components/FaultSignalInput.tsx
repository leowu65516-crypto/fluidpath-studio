import { useEffect, useState } from "react";
import type { Observation, SignalValue } from "../fault-codes/types";

/** Commit one complete sample, never intermediate keystrokes (e.g. the 0 in 0.5). */
export function FaultSignalInput({ label, value, onCommit }: {
  label: string;
  value: SignalValue;
  onCommit: (value: number, quality: Observation["quality"]) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = () => {
    const number = Number(draft);
    onCommit(Number.isFinite(number) ? number : 0, !draft.trim() ? "missing" : Number.isFinite(number) ? "good" : "invalid");
  };
  return <input aria-label={label} type="text" inputMode="decimal" value={draft}
    onChange={e => setDraft(e.target.value)} onBlur={commit}
    onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); } }} />;
}
