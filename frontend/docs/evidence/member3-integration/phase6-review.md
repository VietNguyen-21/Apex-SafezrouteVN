# Phase 6 review and disposition

Baseline: `3cd89636f9b7f4aa3422bb4c4001fe5d7e8af02f`. Scope: P6-01 through P6-03 of the approved Member 3 integration spec/plan/tasks. One independent reviewer examined the working diff, frontend consumers and authoritative backend contracts. The reviewer did not rerun tests or native gates; author verification is recorded separately. No second review or external sign-off is claimed.

The review found no Critical issues and two Important issues:

1. A successful comparison POST from session A could attach its comparison pointer to session B after a cross-tab switch. A regression test first failed, then passed with a session/epoch fence before pointer mutation. The validated successful command is reconciled under its original identity; its late receipt cannot alter the new session.
2. Pause could become unavailable while sequential physical reads were chasing an advancing server revision. A confirmed Start could also remain pending solely because subsequent reads failed. API and UI regressions first failed, then passed. Confirmed controller receipts now reconcile durable commands immediately; the physical view stays explicitly stale until a coherent server read converges. Pause/Speed use the known owned controller during observational revision churn, while auth, integrity and session failures still disable controls. Step/Start/Reset remain guarded by fresh physical state and tick settlement.

All three review regression tests passed after the fixes. A separate native harness regression proved that a missing Select button must not count as enabled; its guard was corrected before resuming the unchanged native comparison prerequisite. The failed receipt is retained privately, and the resumed report records its provenance.

Author verification additionally reproduced ambiguous Start recovery after a full API reload: the confirmed controller path previously assumed a last confirmed in-memory snapshot. That test failed with an undefined snapshot, then passed after reload recovery reconciled the original command and read a fresh server world. It never invents a physical view or creates a new Start identity. This author fix was not independently re-reviewed.

Native cold hydration also exposed serialized SDK read-budget contention: three parallel forecast reads could make the last one exhaust its 60-second server deadline. A regression first observed three concurrent reads, then passed with the comparison lane reading one forecast at a time while retaining all three certified alternatives and the existing binding/epoch guards. Backend deadlines and runtime implementation were unchanged. This author fix was not independently re-reviewed.

Native tab activation exposed a further observation recovery issue: a successful coherent poll retained an earlier transient runtime timeout, so the tab stayed stale. A regression first failed, then passed after successful polls cleared transient observation failures. Pending intents remain guarded, and terminal auth/integrity/comparison-unknown errors are not cleared this way. This author fix was not independently re-reviewed. The native harness explicitly activates each tab and uses time-based waits because hidden tabs suspend animation frames and polling.

The reviewer confirmed the correct playback endpoints and request bodies, decimal-string revision handling, durable retry identity, full-basis validation, reserved tick semantics, metadata-only session reference and separation of observed execution from planned deliveries. No additional Minor findings were reported.

A subsequent native Reset returned 200 but destination observation timed out. A fourth author regression reproduced reload sending the acknowledged Reset again. It failed with two POSTs, then passed with one after a validated Reset reconciled its durable intent immediately after persisting the new session pointer. Later failures recover through GET on that destination. The final native continuation retains the first receipt and verifies an additional intentional Reset from its already-created session; it never resubmits the acknowledged first command. This fix was not independently re-reviewed. Two additional harness regressions verify duplicate GET detection through JSON-body completion and separate aborted requests from their replacements. The final functional suite has 327 tests in 43 files.

A fifth author fix disables Step/Play when the server has completed its final return. Two regressions observed RED then GREEN: PLAN_COMPLETE controls and exact server end-time comparison, including microseconds and UTC offsets. The end-time check also covers a completed old session whose controller reason becomes MANUAL_RESET after Reset. It uses observed server timestamps and does not advance local physics. This fix was not independently re-reviewed.

Explicit review boundaries:

- Native S0/S2 playback, two-tab convergence and responsive widths are author-run gates, not independently certified by this code review.
- Backend solver, scheduler and store correctness remain outside this frontend review. Unit tests cover the reserved tick branch; native evidence records the controller states actually observed.
- Phase 7 owns default backend cutover, mock import/artifact isolation, heavy-pack removal and full S0–S4 migration E2E. Existing mock presentation and bundle remain intentionally present.
- Touch/WebView, production GPS/SLA claims and Phase 3 publication reviewer sign-off are not covered.
- The existing recovery policy can restore the original session for an explicitly retried ambiguous intent; cross-tab pointer notifications never resubmit it. The pre-existing Phase 5 history-cap presentation limitation remains unchanged.

See [implementation and verification](../../member3-phase6.md) for final functional and native results.

Final acceptance review supplied by the project reviewer on 2026-10-08 for `6332be3c7ee31f24eee91a9fb78f2e3841e49961`: Blocker 0, Important 0, Minor 2; P6-01/P6-02/P6-03 PASS and Phase 6 DONE. The two wording findings were corrected in the follow-up: Admin now describes connected Accept, and recovery session binding uses ?Pending command? for all command kinds. The two affected suites passed 87 tests after these text changes; no authority or replay behavior changed. The existing Phase 5 history-cap limitation remains separately recorded. GitHub statuses/workflow runs were empty at that review; verification remains local/native, without a GitHub CI claim.
