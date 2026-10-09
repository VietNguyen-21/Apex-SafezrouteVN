import { useState } from "react";
import { useDispatch } from "../app/DispatchContext";

export function DemoControls() {
  const { api, snapshot, pending, invoke } = useDispatch();
  const [message, setMessage] = useState("");
  if (!snapshot || snapshot.backend || !api.setPlayback || !api.importScenario || !api.exportScenario) return null;
  const playback = snapshot.executionState.playback;
  const speed = playback?.speed ?? 30;
  const canPlay = Boolean(snapshot.planState.activeAcceptedPlanId && navigator.locks);
  function download() {
    if (!snapshot) return;
    const blob = new Blob([JSON.stringify(api.exportScenario!(), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${snapshot.decisionState.scenarioId}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }
  return <section className="demo-playback" aria-label="Demo playback and import">
    <strong>Vehicle simulation</strong>
    <p>Accept a plan, start playback, then confirm pickup in Driver. Vehicles wait at each delivery stop.</p>
    <div className="demo-playback-actions">
      <button type="button" disabled={pending || !canPlay} onClick={() => void invoke(() => api.setPlayback!(!playback?.playing, speed))}>
        {playback?.playing ? "Pause vehicles" : "Play vehicles"}
      </button>
      <select aria-label="Simulation speed" value={speed} disabled={pending || !canPlay}
        onChange={e => void invoke(() => api.setPlayback!(playback?.playing ?? false, Number(e.target.value)))}>
        {[1, 10, 30, 60].map(value => <option key={value} value={value}>{value}×</option>)}
      </select>
    </div>
    <p>Simulated movement, not live GPS. Moving-world re-optimization needs a new runtime export.</p>
    <button type="button" onClick={download}>Download scenario template</button>
    <label>Import scenario JSON
      <input type="file" accept=".json,application/json" disabled={pending || Boolean(playback?.playing)} onChange={async e => {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (!file) return;
        try {
          if (file.size > 2_000_000) throw new Error("Scenario must be smaller than 2 MB.");
          const value: unknown = JSON.parse(await file.text());
          // Validation happens before a new session replaces the current demo.
          await invoke(async () => {
            const next = await api.importScenario!(value);
            setMessage(`Imported ${next.decisionState.scenarioId}. Select Optimize to prepare its routes.`);
            return next;
          });
        } catch (error) { setMessage(error instanceof Error ? error.message : "Invalid scenario JSON."); }
      }} />
    </label>
    <p>Import starts a new demo session. Supports unchanged S0–S4 templates with matching offline routes.</p>
    {message && <p role="status">{message}</p>}
  </section>;
}
