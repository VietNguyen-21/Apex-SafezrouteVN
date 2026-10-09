# Phase 7 whole-change review

Reviewed range: `a8b20afb67a90bb346901d548cb9ff35dfbad116..176884e3400d86827c73bb9afec86f3774cb69c0`.
Fresh independent reviewer: gpt-6-astra. Read-only; no nested reviewer or repeat review.

**Critical 0 · Important 0 · Minor 0. Standards PASS. Spec PASS. Ready to merge: Yes.**

The reviewer independently reran all 342 tests in 46 files and all nine Node audit tests, audited the actual backend build, validated both native matrices and checked their SHA bindings. The actual graph SHA is `6f76d82561cc80b43bc73bf715cf421205246d68090fcd1ce6280b59d3504a90`; artifact counts are 1,932 modules, two chunks, four assets and 650,818 bytes. Raw fault evidence supports real auth/schema/binding rejection, stale CAS, identical retry bodies, browser transport failure, native SDK contention, cancellation and delayed old-session responses. Post-cleanup was a fresh run with no continuation; pre-cleanup continuation boundaries are disclosed. No code fixes were required.

## Declined-to-judge scope and executor rulings

Every scope the reviewer set aside was regraded by user effect. These remain explicit limitations of the approved technical gate, with unchanged history retention classified as a deferred Minor. None is silently certified.

- Keep manual touch/WebView pending; desktop Chromium layout evidence does not certify device interaction. Cost if wrong: Device-specific touch/WebView defects may remain; manual verification is still required.
- Keep separate Phase 3/Leader deployment/publication approval pending; Phase 7 is a technical frontend gate. Cost if wrong: Deployment/publication must still obtain that independent approval.
- Do not claim recovery or a root cause for historical STORE_INVALID; original authority is preserved and test authorities are isolated. Cost if wrong: The original authority may still need runtime diagnosis before reuse.
- Keep unchanged Phase 5 history-cap 101-entry behavior as a deferred Minor outside this cutover. Cost if wrong: Retention beyond the intended cap remains possible.
- Limit acceptance to SIMULATED_REPLAY; do not infer GPS, real delivery, calibrated exposure, general solver feasibility/optimality or native SLA. Cost if wrong: Real-world behavior and these guarantees remain unverified.
- Accept disclosed remaining Vite bundle warning within the isolation scope; broader performance optimization has no release SLA here. Cost if wrong: Load-time performance on target devices remains unmeasured.
- Keep production identity/login provisioning outside this frontend cutover; require private runtime credentials and show IDs/placeholders for missing metadata. Cost if wrong: Production login and identity provisioning still need their own implementation/validation.

## All execution rulings, in order

- Ruling: P3-01 public contract dependency uses user-authorized 0.9.0 r2 locked contract/native technical PASS; separate Phase3/Leader publication sign-off remains pending and is not inferred from Phase6 acceptance. Cost if wrong: final release approval still requires that reviewer, without blocking technical Phase7 development.
- Ruling: use isolated authority/metadata for pre/post test gates per M3 operations runbook, reusing verified locked r2 SDK/native env and same source-bound G0 receipt. Original history/auth/config preserved; no reset/delete/reseal, bounds unchanged. New API8005/Vite5175 READY allchecks immediately. Cost if wrong: isolated gate receipts do not certify recovery of the original installation authority; that remains a separate operational scope. Historical diagnostic run S0 PASS/S1 interrupted intentionally, owned API/worker stop requested. Fresh matrix keeps normal Admin foreground/polling during compute, removing quiet-solve limitation; original historical interrupted evidence retained and never cleanup authorization.
- Ruling: Driver V1 with no accepted native EDGE must remain route-free; require route retention only where its public trajectory supplies EDGE. Admin still requires actual routes. Cost if wrong: a native route absence could be mistaken for valid PARTIAL; guard binds the assertion to raw accepted trajectory. Added no-route guard RED1/GREEN11 and exact read-only committed-case continuation RED1/GREEN12; no physical command resubmission. Future audit RED7/8 and lightweight mock migrations prepared in ignored scratch; product/default/packs untouched.
- Ruling: S4 real forecasts contain only return-to-depot EDGE, which existing Admin deliberately filters. Require zero Admin paths for return-only trajectories; retain Driver V1 EDGE. Cost if wrong: a filtered route could mask missing geometry, so assertions derive from exact public trajectory/service order. Added guards RED2/GREEN16, native continuation validates exact applied world/completed comparison before first remaining Accept/expiry; no command resubmission. Fresh full343/44 and typecheck exit0. P7-01 still pending fault matrix; product/default/packs untouched.
- Final: Ruling: Keep manual touch/WebView pending; desktop Chromium layout evidence does not certify device interaction. Cost if wrong: Device-specific touch/WebView defects may remain; manual verification is still required.
- Final: Ruling: Keep separate Phase 3/Leader deployment/publication approval pending; Phase 7 is a technical frontend gate. Cost if wrong: Deployment/publication must still obtain that independent approval.
- Final: Ruling: Do not claim recovery or a root cause for historical STORE_INVALID; original authority is preserved and test authorities are isolated. Cost if wrong: The original authority may still need runtime diagnosis before reuse.
- Final: Ruling: Keep unchanged Phase 5 history-cap 101-entry behavior as a deferred Minor outside this cutover. Cost if wrong: Retention beyond the intended cap remains possible.
- Final: Ruling: Limit acceptance to SIMULATED_REPLAY; do not infer GPS, real delivery, calibrated exposure, general solver feasibility/optimality or native SLA. Cost if wrong: Real-world behavior and these guarantees remain unverified.
- Final: Ruling: Accept disclosed remaining Vite bundle warning within the isolation scope; broader performance optimization has no release SLA here. Cost if wrong: Load-time performance on target devices remains unmeasured.
- Final: Ruling: Keep production identity/login provisioning outside this frontend cutover; require private runtime credentials and show IDs/placeholders for missing metadata. Cost if wrong: Production login and identity provisioning still need their own implementation/validation.

- Final: Ruling: Merge upstream 5c71e27 README-only deletion without rewriting reviewed commits; preserve the collaborator change and retain exact reviewed frontend code/artifact. Cost if wrong: the removed root guide may need a coordinated restoration; Phase 7 runtime behavior is unchanged.

- Final: Ruling: Preserve the installation workspace root README, whose pre-existing content differs from the publication baseline; sync Phase 7 frontend/docs only and retain the upstream README in the Git checkout. Cost if wrong: installation and publication root guides remain different and need explicit coordination to reconcile.

## Upstream integration

The first push was rejected because upstream main had `5c71e27b5ef6d67815b7fb25b5f0d920d079ab3b`, which only removed root README content. Merge `0fb430377ef21b8eb62d93e7d8ce3fb953671297` preserves that change and both reviewed Phase 7 commits. A direct diff confirms identical frontend source, tests, scripts and build configuration to the reviewed candidate; the actual artifact audit still has the exact accepted graph SHA. No native re-run or repeat review is claimed or required for this documentation-only integration.

## Deferred minors

- Previously recorded Phase 5 history-cap 101-entry behavior is unchanged and remains deferred.
- No new Phase 7 Minor was found.

Proof: [final verification](phase7-final-verification.json), [pre-cleanup native](phase7-pre-cleanup-native.json), [post-cleanup native](phase7-post-cleanup-native.json), [handoff](../../member3-phase7.md).
