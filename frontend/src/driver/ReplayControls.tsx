import type { DispatchSnapshot } from "../shared/types/dispatch";
import type { DispatchApi } from "../services/api/DispatchApi";
import { canControlPlayback } from "../integrations/member3/capabilities";
import { playbackComplete } from "../integrations/member3/playback";
export interface ReplayControlsProps { api: DispatchApi; snapshot: DispatchSnapshot; pending: boolean; invoke(operation: () => Promise<DispatchSnapshot>): Promise<void> }
export function ReplayControls({ api, snapshot, pending, invoke }: ReplayControlsProps) {
  const backend = snapshot.backend;
  if (!backend) return null;
  const controller = backend.playback;
  const blocked = pending || backend.stale || backend.mutationPending || !backend.capabilities?.replay || !controller;
  const barrier = backend.pendingEvents?.events.some(e => e.apply_allowed);
  const canAdvance = !blocked && controller?.fully_paused && !playbackComplete(controller) && Boolean(backend.executionView.active_job_id) && !barrier;
  const canControl = !pending && canControlPlayback(snapshot);
  return <section className="drv-stop-section" aria-label="Simulated replay controls">
    <div className="drv-empty-card">
      <h2 className="drv-empty-title">Simulated replay</h2>
      <p role="status">{controller?.in_flight ? "Settling reserved tick — server progress may still change." : controller?.paused ? `Paused · ${controller.reason}` : controller ? "Playing on server" : "Controller unavailable"}</p>
      {backend.playbackConverging && <p>Updating server execution. Last confirmed state is shown.</p>}
      {barrier && <p>Event barrier: Apply in Admin before continuing.</p>}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
        <button className="drv-btn drv-btn--outline" type="button" disabled={!canAdvance || !api.replayStep} onClick={() => void invoke(() => api.replayStep!())}>Step</button>
        <button className="drv-btn drv-btn--primary" type="button" disabled={!canAdvance || !api.replayStart} onClick={() => void invoke(() => api.replayStart!(controller!.speed))}>Play</button>
        <button className="drv-btn drv-btn--outline" type="button" disabled={!canControl || !api.replayPause} onClick={() => void invoke(() => api.replayPause!())}>Pause</button>
        <label>Replay speed <select aria-label="Replay speed" value={controller?.speed ?? 1} disabled={!canControl || !api.replaySpeed} onChange={event => {
          const speed = Number(event.target.value) as 1 | 2 | 4 | 8;
          if ([1, 2, 4, 8].includes(speed)) void invoke(() => api.replaySpeed!(speed));
        }}>{[1, 2, 4, 8].map(speed => <option key={speed} value={speed}>{speed}×</option>)}</select></label>
        <button className="drv-btn drv-btn--outline" type="button" disabled={Boolean(blocked) || !controller?.fully_paused || !api.resetSession} onClick={() => void invoke(() => api.resetSession!())}>Reset session</button>
        <button className="drv-btn drv-btn--outline" type="button" disabled={pending} onClick={() => void invoke(() => api.getSnapshot())}>Refresh server</button>
      </div>
    </div>
  </section>;
}
