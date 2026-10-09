# Phase 1.5 Member 2 Alignment Implementation Plan

> **For agentic workers:** Use test-driven development and execute tasks in order. Do not mark a task complete without its verification result.

**Goal:** Align the existing mock frontend with Member 2 public contracts and correct known mock/map behavior while preserving the current UI.

**Architecture:** Keep `DispatchApi` as the UI boundary. Add pure Member 2 contract adapters under `src/integrations/member2`; keep mock state ownership in `MockDispatchApi`. A shared Leaflet canvas consumes already supplied geometry from either side. Member 3 transport remains Phase 2.

**Tech Stack:** TypeScript, React, Vite, Vitest, React Testing Library, Leaflet.

**Spec:** [phase-1.5-design-spec.md](phase-1.5-design-spec.md)

## Constraints

- Frontend changes stay in `frontend/`. User subsequently authorized downloading M1 cached context and an isolated `m2_runtime/` release/environment/export tool. Existing Member 1/2 source and extracted runtime production closure remain unmodified.
- Phase 1 UI stays English and visually stable; mock mode remains default.
- No route, exposure, ETA or assignment algorithm in frontend; no invented Member 3 endpoints.
- Every behavior change starts with a failing test and ends with relevant tests green.

## Review focus

1. Null metric scopes remain distinct from real zero values.
2. S3 onboard cargo never moves to another vehicle in any profile.
3. WGS84 coordinate order and invalid geometry handling remain exact.
4. Switching demo vehicle changes only the view, not physical state.
5. OSM tile failure does not hide route, markers or rain overlay.
6. Every supplied geometry point and EDGE action order survives projection/rendering; no route is reconstructed from stops. Mock lines are explicitly schematic until matching road payloads are wired.

## Tasks

- [x] **P1.5-01 — Contract intake:** Checked all listed local files, versions, units, limitations and missing `common.py` detail; Member 2 Node checks passed.
- [x] **P1.5-02 — Public types and decision adapter:** Exact profile order, public alternative shape and opaque metrics/unit metadata tested.
- [x] **P1.5-03 — Execution-view adapter:** S2/S3/S4, schema/mode, nullable metric scopes, custody, vehicles and EDGE geometry tested.
- [x] **P1.5-04 — Profile alignment:** DecisionResult and execution-view semantics documented; mock cards remain independent.
- [x] **P1.5-05 — Leaflet map:** Route layers, dynamic viewport, tile fallback, marker/rain layers tested; Admin/Driver card styling retained.
- [x] **P1.5-06 — S3 custody:** All profiles preserve ONBOARD owner and avoid fabricated route geometry after custody override.
- [x] **P1.5-07 — Demo clock:** `+07:00` retained through Optimize, Accept, Pickup, Delivered and event.
- [x] **P1.5-08 — Driver selector:** V1 default, V2 view, no world mutation; Settings-only development control.
- [x] **P1.5-09 — Simulation wording:** Demo/simulated labels and exposure proxy semantics tested.
- [x] **P1.5-10 — Regression/docs:** Frontend tests/typecheck/lint/build, Member 2 reference checks and headless Chrome viewport/tile-failure review passed; real WebView/touch/focus remains P1-12.
- [x] **P1.5-11 — Geometry integrity and schematic labels:** Full S2/S3/S4 EDGE polyline/order assertions, decision alternative projection, independent accepted/proposed Leaflet rendering, missing geometry rejection and Admin/Driver schematic notice. 77 tests pass; typecheck/lint/build pass; headless viewport checks retain zero overflow.
- [x] **P1.5-12 — Initial-world road payload:** Download pinned context and isolated runtime, compute all twelve S0/S2/S3/S4 profiles and consume certified matching INITIAL packs through the mock engine. Verify all geometry/actions against raw jobs, retain source metrics and provenance, reject changed-world matching. See [offline implementation plan](offline-member2-route-plan.md) and [runtime commands](../../m2_runtime/README.md).
- [ ] **BLOCKED P1.5-13 — Generic native event/current-world roads:** Requires matching physical replay or Member 3 execution contract. P1.5-18 adds five explicitly bound manual-event forecasts; arbitrary changed execution worlds remain schematic. HTTP integration remains Phase 2.
- [x] **P1.5-14 — Coincident vehicle markers:** Pixel badge offsets retain exact geographic coordinates; tests and browser evidence recorded in tasks.md.
- [x] **P1.5-15 — Zoom performance:** Batch independent EDGE polylines into style groups, retain all points; controlled measurements recorded in tasks.md.
- [x] **P1.5-16 — Admin route visibility/leg colors:** Local OFF/ON switches, single valid source, stable per-leg colors, completed travel filtering and scrollable legend. TDD and browser checks passed; see [bounded implementation plan](admin-map-ux-plan.md) and [task evidence](tasks.md).
- [x] **P1.5-17 — Admin route display refinement:** Hide return-to-depot forecasts and legend entries; V2 leg 2 dark green. TDD, 114 tests, build and refreshed browser checks pass; source plans/Driver unchanged.
- [x] **P1.5-18 — Local manual-event roads/capacity:** Remove requested right acceptance block; compute fifteen raw-validated M2 forecasts for five exact worlds, add bounded subset candidates and capacity/custody regressions, wire whole-world packs and preserve static source-clock distinction. 122 frontend / 14 Python tests, checks and browser evidence pass. See [local event plan](local-event-road-plan.md).
- [ ] **BLOCKED P1.5-19 — S0 rain roads:** M2 rain source requires pinned S4 root; need an explicit extension supporting S0's three-order root. Never transplant S4's eight-order world.
- [x] **P1.5-20 — Urgent ON/OFF + Driver legs:** TDD engine cancellation/custody/round-lock, API hydration/subscriptions and Admin observable toggle. Fresh S0 starts OFF; saved rounds remain persisted. Extract shared read-only leg description, reuse it for Driver accepted geometry/marker/legend, dim completed legs and filter depot return only in display. Browser checks cover repeated ON/OFF, tab updates, 360/390/430 widths, remaining color stability and initial S0/S2/S3/S4 geometry. Evidence/counts in [tasks](tasks.md).
