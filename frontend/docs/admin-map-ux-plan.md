# Admin map UX implementation plan

> **For agentic workers:** Execute inline using executing-plans and TDD. Update each checkbox after its evidence is available.

**Goal:** Reduce map clutter with local vehicle route switches and deterministic operational leg colors.

**Architecture:** A pure Admin presentation adapter chooses one valid route source, filters visibility/completion and adds display metadata to MapScene. AdminPage owns session-local switches. Shared Leaflet batches by leg/color; Driver continues using its existing scene. No DispatchApi or domain state changes.

**Tech Stack:** React, TypeScript, Vite, Leaflet, Vitest, React Testing Library.

**Spec:** [admin-map-ux-spec.md](admin-map-ux-spec.md)

## Constraints / review focus

- Preserve immutable M2 geometry, assignments, metrics, physical execution and Accept semantics.
- Newly mounted Admin must hide routes even with persisted accepted plans.
- Invalid session/version proposals cannot displace accepted routes.
- Several EDGE actions share one operational leg; disconnected polylines must not be joined.
- Completed-leg removal must not renumber/recolor remaining legs.
- Return forecast geometry remains in source plans but is excluded from Admin display and legend.

## Tasks

- [x] U01 — `src/admin/adminMapPresentation.ts` + tests: RED missing module then 11 tests GREEN; source selection, visibility, full geometry, stable colors and completed-leg filtering verified.
- [x] U02 — Shared `mapScene.ts`/`LeafletCanvas.tsx` + tests: RED 2 layers instead of 3 then GREEN; separate color/leg batches retain disconnected polylines and original Driver metadata behavior.
- [x] U03 — `RouteVisibilityControls.tsx`, AdminPage/DispatchMap and scoped CSS: RED missing switches then GREEN; independent OFF/ON, snapshot/storage isolation, no auto-enable, source precedence, keyboard, remount/new-session tests pass.
- [x] U04 — Browser evidence: all switch combinations and unchanged localStorage at 1280/1440; desktop/mobile screenshots, S0/S2/S3/S4 roads and tile failure passed. S0/S2 CPU 4× zoom p95 16.8 ms, zero long tasks; group counts now reflect leg colors, not EDGE actions.
- [x] U05 — Full suite 114/114 pass; typecheck/lint/build exit 0. Fresh read-only review found no material findings. Spec/README/tasks updated; Member 3/native event tasks remain open.

## Rulings and final evidence — 2026-10-05

- This checkout has no Git repository; implementation stays in the user-authorized workspace. No branch merge, commit or publish step applies.
- Compact side-by-side switches fit the existing panel. Only the legend scrolls; switches stay visible. Browser assertions ran RED for hidden switches, then RED for clipped legend, and GREEN after scoped layout fixes. The legend is keyboard focusable.
- User correction: Admin hides return-to-depot forecasts and uses dark green `#14532d` for V2 leg 2. TDD return-filter tests ran RED then GREEN; dark-green assertion ran RED then GREEN. Original source geometry and Driver behavior remain intact. Full suite still 114/114 pass; build exit 0. Refreshed desktop/mobile/fallback checks pass; S0 Admin now renders 3 leg groups, S2/S3/S4 8 groups.
- [UI combinations/layout evidence](evidence/admin-map-ux-results.json), [screenshots](evidence/), [offline scenarios](evidence/offline-route-results.json), [zoom measurement](evidence/map-zoom-results.json).
- Existing large JS bundle warning remains (about 3.55 MB / 877 kB gzip). Headless checks do not close manual WebView/touch/focus acceptance.
