# Public forecast contract — Phase 3

The missing pre-Accept projection in the received M3 **0.8.0** was confirmed locally. The user authorized implementing the supplemental SDK and HTTP read on 2026-10-07. The resulting development extension is **M3 0.9.0**, with a new sealed runtime build; the received releases and historical receipts remain unchanged.

`GET /api/sessions/{session_id}/jobs/{job_id}/forecast` returns `task02-m2-job-forecast/1` inside the existing HTTP envelope. See the [exact contract and error matrix](../../docs/M3_FORECAST_API_HANDOFF_20261007.md), [generated OpenAPI](../../docs/M3_OPENAPI_20261007.json) and [release setup](../../docs/M3_FORECAST_EXTENSION_RELEASE_20261007.md).

The read is owner-scoped and binds certified geometry to the persisted job/session/profile/full nine-field input basis/build. No-witness jobs return null trajectory and metrics. PARTIAL and RETURN_ONLY retain native semantics. Directed source EDGE coordinates, order, microseconds and exact fractions are preserved. Historical reads retain their basis; frontend preview requires equality with the current world. Selecting a preview is a local UI preference, and never Accepts a job.

Native read-only proof is in `evidence/member3-integration/phase3-forecast-http-native.json`; explicit Accept/replay scope proof is separate in `phase3-forecast-scopes-http-native.json`. The browser map/reload/Driver gate is recorded separately. No private store, offline road geometry or stop-to-stop approximation enters the frontend forecast path.

Public rain polygons remain unavailable. Accepted action completion also remains unavailable without an authoritative decision epoch or progress mapping: source `start_us`/`end_us` are relative offsets. Supplied accepted geometry is visible, but completed actions are not inferred from ISO observation timestamps. Operational frontend Accept/Event/Replay controls remain later-phase work.

## Publication repair ? release revision 2

The r1 publication was rejected because its baseline public handoff lock did not match the shipped SDK. Functional browser receipts remain historical evidence for build c333372; they are not r2 acceptance. The replacement uses SDK task02-m2-runtime-sdk/2 and a generated handoff lock /2 covering job_forecast, forecast schema/units and verifier bytes. It includes the unchanged frozen crosswalk in the production closure. Both sealing and packaging invoke the shipped verify_lock() after inventory verification. Frozen external API v1 is unchanged; baseline-to-v2 compatibility requires explicit migration.

Current release and byte pins: [release guide](../../docs/M3_FORECAST_EXTENSION_RELEASE_20261007.md). Fresh native G0/HTTP and release-verification receipts for r2 are separate from the earlier browser run. Reviewer sign-off on Phase 3 remains pending; the earlier DONE statement describes functional gates and is superseded for publication by this repair.
