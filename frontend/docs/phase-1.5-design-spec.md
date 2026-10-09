# Phase 1.5 — Member 2 contract alignment

**Status:** Contract adapters and matching initial-world Member 2 road packs implemented on 2026-10-05. S0/S2/S3/S4 each have three offline-computed, certified FEASIBLE profiles. Changed worlds still use schematic mock proposals when no matching pack exists. Headless Chrome viewport/fallback review passed; real WebView/touch/focus acceptance remains in P1-12. Phase 2 HTTP integration waits for Member 3.

## Scope and boundaries

- Keep the current English Admin and Driver visual hierarchy, cards and controls. Add a small demo vehicle selector inside Driver Settings and Admin route visibility controls in the existing Decision Intelligence panel. Admin V1 uses blue/cyan; V2 leg 1 green and leg 2 dark green for distinct vehicle/leg identity.
- Keep `DispatchApi` and `MockDispatchApi`. Components never import Member 2 Python/runtime code or read the sample JSON at runtime.
- Add a read-only `integrations/member2` boundary for public `DecisionResult` and `task02-m2-execution-view/2` data. Examples under `shared/examples` are test fixtures, not a production data source.
- The Member 2 view alone cannot construct a complete `DispatchSnapshot`: it does not supply all frontend presentation/order details or Member 3 transport lifecycle. Adapters return typed decision/operational view models and geometry. `BackendDispatchApi` later composes them with Member 3 responses.

## Decision and execution contracts

- A `DecisionResult` has exactly FASTEST, BALANCED and SAFER alternatives in that order. Each public alternative carries vehicle assignments, stop sequence, route geometry, metrics and explanation facts. The initial minimal handoff omitted `optimization/models/common.py`; the isolated released runtime now contains its own production closure. The public DecisionResult adapter continues preserving opaque metrics rather than substituting a different witness schema.
- An execution view must declare `task02-m2-execution-view/2`, `SIMULATED_REPLAY` and `real_world_observation=false`. Preserve `current_time` with `+07:00`, vehicle custody, availability, position, load and remaining range.
- Keep `observed_metrics`, `planned_suffix_metrics` and `projected_whole_metrics` as separate nullable scopes. Null means absent; a numeric zero is a measured or calculated zero. Use the units given by the contract. Delivered prefix, planned served suffix and unserved remain separate sets.
- Only `EDGE` actions with valid WGS84 `[longitude, latitude]` geometry become GeoJSON LineStrings. Other actions remain operational actions. No route calculation, stop linking or risk calculation occurs in the frontend.
- Exposure is a relative proxy. Position and clock are simulated, not real GPS or wall clock.

## Offline initial-world packs

- The public RuntimeClient runs outside the frontend in `m2_runtime/`. Approved build digest, exact dependency lock, M1 source hashes and certified completed jobs are verified before export. The frontend never imports Python or opens SQLite.
- `m4-offline-road-packs/1` is a local generated asset, not a Member 3 API. A pack requires exact scenario and initial orders/custody/vehicles/locations, all event statuses READY_TO_TRIGGER and no rain. Session/version bind the new proposal normally. Changes to physical/world state invalidate initial-pack matching; historical accepted plans remain immutable.
- Match INITIAL packs or separately validated MANUAL_EVENT packs. The latter bind the complete orders/custody/vehicles/positions/locations/context/event payload and statuses; session/version still bind each new proposal. Native replay samples cannot replace a manual world. Direct S2/S3/S4 loads still leave events ready to trigger.
- Retain ordered PICKUP/SERVICE actions as mock operational stops, group depot pickups and preserve all ordered EDGE geometry, including the return forecast. Supplied actions remain available for audit. Manual Pickup/Delivered is not native runtime playback: delivery marks incoming edges completed; there is no physical return action to complete a return forecast.
- Witness metrics are PLANNED_SUFFIX_ONLY. `total_distance_m` becomes km, `total_travel_time_s` becomes fleet travel minutes, `total_cost_vnd` becomes route cost, and `total_exposure` stays a raw exposure proxy. `fuelCostVnd` is a legacy internal storage alias for cost; source-aware labels distinguish it from schematic fuel estimates. No on-time percentage is supplied, so display a dash. Never subtract route cost from schematic fuel cost or raw exposure from schematic relative exposure.
- Source forecast time is visible separately from the deterministic demo clock. Optimize/Accept still advance the mock clock; offline assets are not recomputed at those later times. S0's three profiles happen to have identical results; do not invent distinctions.

## Mock corrections and map

- Every mock alternative preserves the owner of every ONBOARD order, including direct S3 and post-event S3. An unavailable owner's work stays with that owner and is reported as unserved/recovery-needed; no generated route is invented when an assignment changes beyond the prepared geometry.
- Mock clock advances deterministically and retains `+07:00` across Optimize, Accept, Pickup, Delivered and timed events.
- Driver defaults to V1. A Settings-only selector can view V2 without changing DecisionState. Production vehicle identity will come from Member 3 authentication later.
- Admin and Driver maps render supplied GeoJSON geometry through Leaflet inside existing card shells. Fit bounds from supplied features and markers, keep OSM tiles, rain overlay and a neutral tile-failure fallback. Admin uses one source: a valid selected proposal, otherwise the active accepted plan. Driver remains accepted-only with completed history dimmed.
- Admin routes default OFF on mount/refresh, including hydrated plans; depot, vehicles and orders remain visible. Independent view-only switches never write snapshot/storage and never auto-enable on Optimize/Select/Accept. New sessions reset them OFF. Admin hides completed accepted travel and uses stable operational leg colors with a numbered target legend. Compact switches remain fixed while the legend scrolls separately. See [Admin map UX spec](admin-map-ux-spec.md).
- Admin hides return-to-depot forecast geometry and its legend entry. Driver now applies the same display filtering and leg palette (P1.5-20). Original plan actions, geometry and metrics remain unchanged.
- Coincident markers (for example S0 DEPOT/V1/V2) retain exact geographic coordinates. Offset only their badge anchors in screen pixels so every vehicle remains visible; isolated badges keep their original appearance and anchor.
- Batch supplied EDGE polylines into SVG layers by vehicle, accepted/proposed state, completion style and shared leg/color. Each EDGE stays an independent nested polyline; keep every coordinate and do not connect disconnected endpoints. Plan content, segment IDs and physical progress remain unchanged. Rendered SVG path counts measure style groups, not the number of supplied EDGE actions.

## Route geometry integrity and final demo gate

- The default mock engine selects a matching validated offline road pack. It falls back to sparse prepared geometry from `decisionPacks.ts` when no pack matches. Leaflet renders coordinates literally; OSM tiles do not provide routing. Both maps identify schematic lines as **Schematic demo routes — do not follow roads.** The label appears for any schematic segment, including a mixed schematic/supplied scene, and is absent when all segments are Member 2 supplied geometry.
- `executionForecastSegments` projects only accepted trajectory `EDGE` actions, preserving every supplied `[longitude, latitude]` point and action order. `decisionAlternativeSegments` projects each alternative's complete `route_geometry`. Accepted and proposed lines remain independent; absent geometry is rejected rather than reconstructed from stops.
- No shortest-path calculation, Directions/OSRM request, road snapping, interpolation or fabricated road route is permitted in the frontend. A two-point road edge may be valid if that is the authoritative source geometry; point count alone does not prove a road route.
- Local S2/S3/S4 execution-view samples remain contract/replay tests. Initial road packs come from certified SDK computes. MANUAL_EVENT packs use the unmodified worker plus a local bounded subset candidate policy and independent raw-source validation; they are not SDK-session-certified replay. Geometry, assignment, actions and metrics travel together. S0 urgent/unavailable and direct S2/S3/S4 triggered worlds are covered before manual execution; S0 rain and arbitrary changed execution worlds remain open. Member 3 transport remains Phase 2.

## Local manual event forecasts

- Export exact frontend worlds outside the browser; preserve pinned M1 initial roots and pass the manual world as a physical anchor. Do not fabricate native replay or transfer initial onboard custody.
- Split WAITING orders into feasible candidate subsets. Capacity is checked per action by M2; pickup before owned deliveries uses residual capacity, while delivery then depot reload may free capacity. Delivered orders never enter the suffix. Group pickup stops only after the selected assignment/actions are returned.
- Keep valid partial forecasts and their unserved diagnostics. Never relabel bounded-search failure as infeasibility or increase capacity to force a witness.
- Whole-world matching rejects changed custody, vehicle position/availability, event payload/status or rain context. Static sourceTime stays separate from demo clock; repeated Optimize is deterministic. Expiry invalidates a rain pack through changed context/event status.
- Removing the right acceptance/provenance block is a presentation change. Actual Accept controls, source forecast label elsewhere, assessment and immutable accepted content remain.
- See [local integration plan and rulings](local-event-road-plan.md) and [runtime commands](../../m2_runtime/README.md).

## Acceptance

### Urgent ON/OFF and shared Driver legs — P1.5-20

- A fresh or explicitly reset session loads S0 initialState: three fixture orders, Urgent OFF. Mounting/refreshing hydrates the saved round; it never resets accepted history automatically or triggers an event.
- `DispatchApi.setUrgentOrderEnabled(boolean)` delegates to the mock engine. ON applies the fixture urgent payload once. OFF removes only that payload's order if it is still WAITING. Reject ONBOARD/DELIVERED cancellation atomically; retain cargo, owner and physical progress. Admin keeps ON disabled with a cancellation explanation after pickup.
- A real toggle advances the deterministic demo clock by one minute (initial ON also honors the fixture event timestamp), increments DecisionState.version, clears proposals/selection and assesses the active accepted plan as NEEDS_REOPTIMIZATION. Accepted content/history and execution remain intact. The next plan reaches Driver only after Select/Accept. Repeating the same value is a state/clock no-op.
- `demo.roundEventId` records the round's selected event even when Urgent returns to READY_TO_TRIGGER/OFF. The same urgent event can be re-enabled; a different event requires Reset or Load Scenario. This is simulator bookkeeping outside DecisionState and road-pack binding. Legacy snapshots infer the lock from their triggered/expired event. Persist/hydrate/subscribe it through the existing adapter without storage write loops.
- Driver renders only active accepted geometry. Admin and Driver use the same read-only leg description and palette, built before completion filtering: V1 blue/cyan, V2 green `#16a34a` then dark green `#14532d`. Driver dims completed legs to opacity 0.35; remaining colors do not change. Its compact legend lists the same numbered targets. Return forecasts are hidden from display, preserved in immutable source plans. No routing, interpolation, geometry changes or per-EDGE DOM expansion.
- The cancellation command is a mock demo policy. Mapping it to Member 3 requires the real cancellation/execution contract in Phase 2; no endpoint is assumed.


Phase 1 mock lifecycle remains green. Contract tests compare every point of all S2/S3/S4 EDGE actions against raw artifacts and verify independent alternative geometry and missing-geometry rejection. Renderer tests compare full accepted/proposed polylines after the Leaflet coordinate conversion. Offline tests cover pack binding, full actions/geometry, coverage, metric absence and execution progress. Export verification compares all 13,232 EDGE actions with the twelve raw certified SDK results. Viewport/tile-failure evidence and current check counts live in [tasks](tasks.md). Native event/current-world road integration and manual WebView review remain open.
