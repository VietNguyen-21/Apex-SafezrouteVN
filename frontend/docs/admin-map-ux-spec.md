# Admin route visibility and operational leg colors

**Phase:** 1.5, presentation-only update from the user's ADMIN MAP UX UPDATE prompt.

## Required behavior

- Every Admin mount starts with all vehicle routes OFF, including an already accepted plan hydrated from localStorage. Depot, all vehicle/order markers and applicable rain remain visible.
- Independent accessible `Show V1 route` / `Show V2 route` switches live in the existing Decision Intelligence panel's unused space. ON/OFF text communicates state. No new dashboard columns or cards.
- Toggles belong to React view state, never DispatchSnapshot or localStorage. Optimize, Select and Accept do not enable routes. Loading/resetting a new demo session resets switches OFF.
- A selected proposal bound to the current session/version is the sole preview route source. Otherwise use the active accepted plan. Never overlay these sources together. Proposal lines remain dashed and accepted lines solid.
- Operational legs follow supplied segment `fromStopId`/`toStopId` and ordered stops, not one color per EDGE. Preserve every independent supplied polyline and all coordinates. Never route, snap, interpolate or link stop coordinates.
- V1 uses deterministic blue/cyan shades; V2 leg 1 uses green `#16a34a` and leg 2 dark green `#14532d` for a clear brightness difference. Per-leg colors stay stable after completion or rerender. A compact text legend gives vehicle, original leg number and target order/depot.
- Admin hides completed accepted segments. Remaining supplied geometry starts at the last operational stop when execution advances; no line is fabricated from the vehicle marker to a road edge. Driver still shows its accepted route with completed history dimmed.
- Admin excludes return-to-depot forecast segments from both accepted/proposed maps and the legend (user correction, 2026-10-05). Preserve the original plan geometry, actions and forecast metrics for audit; this is display filtering. P1.5-20 extends the same palette/filter to Driver, retaining its dimmed completed history; see [current specification](phase-1.5-design-spec.md).
- Keep current typography, spacing, cards and map styling. Add only compact scoped styles for switches/legend. Check Admin at 1280/1440 px and retain Driver viewport behavior.

## Test seams

1. Pure Admin presentation adapter: source validity/precedence, all four switch combinations, markers/rain, full coordinates, immutable snapshots, operational legs, color stability and completion.
2. Leaflet renderer: batch by leg/color without joining disconnected edges; accepted/proposed styling and Driver completion unchanged.
3. Admin observable behavior: switches OFF initially, no snapshot/storage mutations, no implicit enabling by Optimize/Select/Accept, keyboard access and reset/remount.
4. Browser evidence: both desktop widths, all scenarios/Driver regression, tile fallback, leg geometry, zoom performance.
