# Phase 2 independent review and fix verification

Scope: P2-01–P2-03 against the existing integration spec/plan, baseline `a0f49a5`. The reviewer read the frontend changes and native M3 0.8.0 source, performed read-only reproductions, and changed no files or backend state.

Initial verdict: **With fixes**; no Critical issues, two Important issues, no deferred Minor issues.

1. A definite `409 STALE_HEAD` rejection retained a pending compare forever. Refresh repeated the obsolete request and scenario change was blocked. Native ProfileService checks an existing receipt first, then rejects stale revision before batch creation. Fix: retire only that definitively rejected intent, read fresh world, and require an explicit new Optimize. Unknown transport outcomes, authentication failures and idempotency conflicts retain identity.
2. Failed command storage left in-memory pending state which Refresh could submit without a durable write. Failed comparison-pointer storage could also clear the recovery ID prematurely. Fix: transactional store writes, re-persist the same intent before retry, and require a persisted comparison reference before completing the intent. Command storage failure now fails closed before POST.

Three API regression tests reproduced these failures before fixes, then passed:

- `definite STALE_HEAD refreshes world and permits a new explicit intent`
- `does not submit an undurable intent after storage fails then Refresh`
- `retains the same recovery ID when comparison pointer persistence fails`

After fixes, publication checkout verification passed **196 tests in 31 files**, typecheck and build. Additional tests verify mutation priority, ignored late poll replies, hidden/unsubscribe/session changes, typed BUSY retry limits and deadline abort even when a GET never settles. The author verified fixes through their regressions and the full suite; no second independent review is claimed.

Deliberately outside this review's implementation scope: Phase 3 geometry/KPI adapters, Phases 4–6 Select/Accept/Event/Replay/cross-tab synchronization, and Phase 7 production import isolation/pack cleanup. These keep their original gates. Native acceptance is certified separately by [the browser receipt](phase2-latest.json), not by this review.
