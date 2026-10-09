# Native UI diagnostic handoff — 2026-10-08

Status: unresolved runtime latency / refresh failure. No product code fix was
applied during this diagnostic. This report is separate from the earlier Phase 7
acceptance receipts and does not claim a new native PASS.

## Observed reproduction

Source baseline: `dc52662ff804519ebd646befb4d4bf3cb24e62c2`.
Real Chrome, Admin viewport 1440×1000, backend mode, S0, authenticated dispatcher,
M3 API/worker and the existing r2 SDK. A separate browser profile and server
session were used. One Optimize click; no Accept or replay mutations.
The local API port was 8006 and Vite port 5173; these ports are not required
installation defaults.

- Observation ran 2026-10-08 14:21:51–14:26:56 UTC, approximately five minutes.
- Initial usable Admin took approximately 105 seconds.
- Optimize was enabled and the click submitted successfully:
  `POST /api/sessions/{session_id}/profiles/compare` returned HTTP 202.
- While the comparison was running, a subsequent
  `GET /api/sessions/{session_id}/vehicles` returned HTTP 503.
- The UI displayed `RUNTIME_BUSY: Verified runtime rejected the server operation`,
  marked its world stale and disabled Optimize. No JavaScript page errors were
  captured. The browser observation ended before selectable results appeared.
- Subsequent worker logs showed all three jobs (FASTEST, BALANCED, SAFER) finished
  `COMPLETED`, business status `FEASIBLE`. Those logs do not prove that the browser
  recovered or that Select/Accept worked in this observation.
- Worker logs also contained `SDK access busy operation=read_notifications_batch
  deadline_seconds=120.000`. These lines show contention; they do not identify
  which operation held the lock when the vehicles read failed.
- Map tiles were unavailable while supplied markers were visible; treat tile
  loading as a separate observation from the Optimize refresh failure.

## Code paths to investigate

- `backend/services/runtime_gateway.py`: non-compute bridge operations acquire
  `SdkAccessLock` before running the verified SDK subprocess. Lock wait consumes
  the operation deadline. Compute is explicitly exempt from this M3 access lock.
- `backend/services/sdk_access_lock.py`: cross-process lock scoped to the resolved
  authority. Exhausting its acquisition deadline produces `RUNTIME_BUSY`.
- `backend/services/compute_worker.py`: worker compute, polling and outbox reads.
- `frontend/src/services/api/BackendDispatchApi.ts`: `readWorld()` reads state,
  orders, vehicles, locations, events, replay history and playback sequentially.
  `optimize()` reads the world before submitting the comparison. Read failures
  mark the world stale and disable capabilities.
- `frontend/src/admin/AdminPage.tsx`: pending, stale and comparison status control
  the enabled state of Optimize and recovery controls.

Current hypothesis: expensive SDK reads and contention among bridge operations
delay both initial load and comparison refresh. Sequential frontend reads and
limited progress feedback amplify the perceived stall. The precise long-running
lock holder and underlying SDK cost still require timing/profiling evidence;
do not attribute the M3 access lock directly to compute without tracing it.

For reproduction, use the [clone/startup guide](clone-and-run.md) and preserve
server session/request identities. Collect request timings, gateway lock-wait
and subprocess timings, and worker logs from the same interval. Keep credentials,
private installation paths, authority databases and raw private browser captures
outside Git. The original local diagnostic captures were not needed to build/run
the frontend and are not included in this handoff.
