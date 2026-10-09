# Phase 4 independent review

Scope: P4-01/P4-02 changes from `92f9c911718902d3699b4816ec278653d1451a8d`, including native browser harness. A separate read-only reviewer examined standards, spec, backend semantics and recovery behavior. Review found no Critical issues and three Important issues.

| Finding | Implementer fix | Regression evidence |
| --- | --- | --- |
| Opener-created tabs inherit sessionStorage identity and can overwrite/clear unknown commands. | Allocate a fresh durable command namespace before each new intent; preserve the original namespace, ID and body for retry. Distinct tabs retain distinct pending records even if their initial identities were copied. | `keeps distinct durable intents when tabs inherit an identical sessionStorage identity`; both original intents retained; reconciling one preserves the other. |
| Definite witness rejection remains pending forever; the backend replays the same recorded error. | Settle `WITNESS_INVALID`, `WITNESS_REQUIRED`, `JOB_STALE` and `STALE_HEAD` 409 responses, fetch fresh world/history and preserve the diagnostic. Ambiguous/transient/auth/integrity failures keep the original intent. | Three rejection cases fail before the fix, then pass with no repeated POST and successful explicit scenario change. |
| Another tab changes the shared session pointer, making the original Accept unreachable after reload. | Authenticate GET of the pending Accept's original owned session before reading its physical state. Validate session/build binding; preserve original revision/job/request ID. | Reload with a different shared pointer restores the original session and retries the exact original body. |

The fix pass added five failing cases (inherited identity, three terminal rejection codes, original session recovery), then passed them. Full post-fix verification: 260 tests in 36 files, typecheck and build, exit 0. These results validate the author's fixes; they are not a second independent reviewer sign-off. Native S1 results are recorded separately in `phase4-native.json`.

Phase 3 reviewer sign-off, physical touch/WebView testing and Phase 5–7 implementation remain outside this review's completed scope. Default mock and offline assets remain intact.
