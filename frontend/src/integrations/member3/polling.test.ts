import { afterEach, describe, expect, it, vi } from "vitest";
import { createPollCoordinator } from "./polling";
import { comparison } from "./testFixtures";
import type { M3ComparisonView } from "./types";
import type { DispatchSnapshot } from "../../shared/types/dispatch";
import { Member3Error } from "./errors";

function setup() {
  vi.useFakeTimers(); let visible = true; let visibility = () => {};
  const readWorld = vi.fn(async () => ({ decisionState: { sessionId: "session-test" } } as DispatchSnapshot));
  const readComparison = vi.fn(async () => ({ ...comparison(), status: "RUNNING", outcome: null } as M3ComparisonView));
  const publishWorld = vi.fn(), publishComparison = vi.fn(), onError = vi.fn();
  const coordinator = createPollCoordinator({ readWorld, readComparison, publishWorld, publishComparison, onError, now: Date.now,
    schedule: (cb, ms) => { const t = setTimeout(cb, ms); return () => clearTimeout(t); }, isVisible: () => visible,
    subscribeVisibility: cb => { visibility = cb; return () => { visibility = () => {}; }; } });
  return { coordinator, readWorld, readComparison, publishWorld, publishComparison, onError, hide: () => { visible = false; visibility(); }, show: () => { visible = true; visibility(); } };
}
afterEach(() => { vi.useRealTimers(); });
describe("single coordinator", () => {
  it("polls_without_overlap_and_stops_terminal", async () => {
    const s = setup(); let release!: (v: M3ComparisonView) => void;
    s.readComparison.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
    s.coordinator.watchWorld("session-test"); s.coordinator.watchComparison("session-test", "comparison-test");
    await vi.advanceTimersByTimeAsync(1000); expect(s.readComparison).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(7000); expect(s.readComparison).toHaveBeenCalledTimes(1);
    release(comparison() as M3ComparisonView); await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(10000); expect(s.readComparison).toHaveBeenCalledTimes(1);
    expect(s.readWorld.mock.calls.length).toBeGreaterThan(1); s.coordinator.stop();
  });
  it("aborts_stale_session_and_unmount and resumes read-only", async () => {
    const s = setup(); let release!: (v: DispatchSnapshot) => void; let signal!: AbortSignal;
    s.readWorld.mockImplementationOnce(async (_sid?: string, sig?: AbortSignal) => { signal = sig!; return new Promise(resolve => { release = resolve; }); });
    s.coordinator.watchWorld("session-test"); await vi.advanceTimersByTimeAsync(2500);
    s.hide(); expect(signal.aborted).toBe(true);
    release({ decisionState: { sessionId: "old" } } as DispatchSnapshot); await vi.advanceTimersByTimeAsync(0);
    expect(s.publishWorld).not.toHaveBeenCalled(); s.show(); await vi.advanceTimersByTimeAsync(0);
    expect(s.publishWorld).toHaveBeenCalledTimes(1); s.coordinator.stop();
    await vi.advanceTimersByTimeAsync(10000); expect(s.publishWorld).toHaveBeenCalledTimes(1);
  });
  it("bounded_retries_and_deadline", async () => {
    const s = setup(); s.readComparison.mockRejectedValue(new Member3Error("RUNTIME_BUSY", "Busy", 503));
    s.coordinator.watchComparison("session-test", "comparison-test");
    await vi.advanceTimersByTimeAsync(1000 + 1000 + 2000 + 4000);
    expect(s.readComparison).toHaveBeenCalledTimes(4);
    await vi.advanceTimersByTimeAsync(20000); expect(s.readComparison).toHaveBeenCalledTimes(4); s.coordinator.stop();
    const d = setup(); d.coordinator.watchComparison("session-test", "comparison-test");
    await vi.advanceTimersByTimeAsync(600001);
    expect(d.onError).toHaveBeenCalledWith(expect.objectContaining({ code: "COMPARISON_UNKNOWN" }));
    expect(d.publishComparison.mock.calls.at(-1)?.[0].status).toBe("RUNNING"); d.coordinator.stop();
  });
  it.each(["UNAUTHORIZED", "FORBIDDEN", "INVALID_RESPONSE", "IDEMPOTENCY_CONFLICT"])("does not retry %s", async code => {
    const s = setup(); s.readComparison.mockRejectedValue(new Member3Error(code, "Stop", 409));
    s.coordinator.watchComparison("session-test", "comparison-test"); await vi.advanceTimersByTimeAsync(10000);
    expect(s.readComparison).toHaveBeenCalledTimes(1); s.coordinator.stop();
  });
  it("fences old-session comparison replies and restarts a stopped subscription", async () => {
    const s = setup(); let release!: (v: M3ComparisonView) => void;
    s.readComparison.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
    s.coordinator.watchComparison("old-session", "old-comparison"); await vi.advanceTimersByTimeAsync(1000);
    s.coordinator.watchComparison("new-session", "new-comparison");
    release(comparison() as M3ComparisonView); await vi.advanceTimersByTimeAsync(0);
    expect(s.publishComparison).toHaveBeenCalledTimes(1);
    expect(s.readComparison.mock.calls.at(-1)?.slice(0, 2)).toEqual(["new-session", "new-comparison"]);
    s.coordinator.stop(); s.coordinator.watchWorld("new-session"); await vi.advanceTimersByTimeAsync(2500);
    expect(s.publishWorld).toHaveBeenCalled(); s.coordinator.stop();
  });
  it("manual refresh resumes a halted watch without a new submit", async () => {
    const s = setup(); s.readComparison.mockRejectedValueOnce(new Member3Error("UNAUTHORIZED", "Expired", 401));
    s.coordinator.watchComparison("session-test", "comparison-test"); await vi.advanceTimersByTimeAsync(1000);
    await s.coordinator.refresh(); expect(s.publishComparison).toHaveBeenCalledTimes(1); s.coordinator.stop();
  });
  it("reports unknown at deadline even when a comparison GET never settles", async () => {
    const s = setup(); let signal!: AbortSignal;
    s.readComparison.mockImplementation(async (_sid?: string, _cid?: string, sig?: AbortSignal) => { signal = sig!; return new Promise(() => {}); });
    s.coordinator.watchComparison("session-test", "comparison-test");
    await vi.advanceTimersByTimeAsync(600000);
    expect(signal.aborted).toBe(true);
    expect(s.onError).toHaveBeenCalledWith(expect.objectContaining({ code: "COMPARISON_UNKNOWN" })); s.coordinator.stop();
  });
});
