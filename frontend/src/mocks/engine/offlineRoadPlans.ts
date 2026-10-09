import type { DecisionState, PlanProfile, ProposedAlternative, SuppliedRouteAction, VehiclePlan } from "../../shared/types/dispatch";
import type { ScenarioFixture } from "../../shared/types/scenario";

const APPROVED_BUILD = "80694f511dc735d0b6a1a0a830edd7f6267df395e87dad0ccf180914b49d5a41";
const PROFILES: PlanProfile[] = ["FASTEST", "BALANCED", "SAFER"];

interface OfflineWitness {
  schema_version: string;
  scenario_id: string;
  profile: string;
  status: string;
  source_hashes: Record<string, string>;
  served_orders: string[];
  unserved_orders: { order_id: string; reason: string }[];
  metric_scope: string;
  metrics: { total_distance_m: number; total_travel_time_s: number; total_cost_vnd: number; total_exposure: number; total_soft_lateness_s: number };
  vehicle_routes: { vehicle_id: string; order_sequence: string[]; actions: SuppliedRouteAction[] }[];
}

/** Local, generated asset contract; it is not a Member 3 API or a raw M2 wire envelope. */
export interface OfflineRoadBundle {
  schemaVersion: string;
  buildSha256: string;
  executionMode: string;
  policyVersion?: string;
  packs: { scenarioId: string; phase: string; certified?: boolean; validated?: boolean; fixtureSha256: string;
    worldBinding?: Omit<DecisionState, "sessionId" | "version">; validationScope?: string; buildSha256?: string;
    initialState: ScenarioFixture["initialState"]; sourceTime: string; alternatives: OfflineWitness[] }[];
}

function equalFields(left: object, right: object): boolean {
  const canonical = (value: unknown): string => {
    if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
    if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
    return JSON.stringify(value) ?? "undefined";
  };
  return canonical(left) === canonical(right);
}

function projectVehicle(state: DecisionState, route: OfflineWitness["vehicle_routes"][number], profile: string): VehiclePlan {
  if (!state.vehicles.some((v) => v.id === route.vehicle_id)) throw new Error("Unknown route vehicle");
  const orderedStops: VehiclePlan["orderedStops"] = [];
  const stopAtAction = new Map<number, string>();
  let lastKind = "";
  for (const [index, action] of route.actions.entries()) {
    if (action.kind !== "PICKUP" && action.kind !== "SERVICE") { if (action.kind === "EDGE") lastKind = "EDGE"; continue; }
    const order = state.orders.find((o) => o.id === action.order_id);
    if (!order) throw new Error("Unknown action order");
    const pickup = action.kind === "PICKUP";
    const depot = state.locations.find((l) => l.id === order.pickupLocationId);
    if (pickup && !depot) throw new Error("Unknown pickup depot");
    const previous = orderedStops.at(-1);
    if (pickup && lastKind === "PICKUP" && previous?.kind === "DEPOT_PICKUP") {
      previous.orderIds.push(order.id);
      stopAtAction.set(index, previous.id);
    } else {
      const stop = { id: `${route.vehicle_id}-${profile}-stop-${orderedStops.length + 1}`,
        kind: pickup ? "DEPOT_PICKUP" as const : "DELIVERY" as const,
        orderIds: [order.id], label: pickup ? "Depot pickup" : order.id,
        location: { longitude: pickup ? depot!.longitude : order.longitude, latitude: pickup ? depot!.latitude : order.latitude } };
      orderedStops.push(stop); stopAtAction.set(index, stop.id);
    }
    lastKind = action.kind;
  }
  const stopEntries = [...stopAtAction.entries()];
  const routeSegments = route.actions.flatMap((action, index) => {
    if (action.kind !== "EDGE") return [];
    const coordinates = action.geometry;
    if (!coordinates || coordinates.length < 2 || coordinates.some(([lng, lat]) => !Number.isFinite(lng) || !Number.isFinite(lat) || Math.abs(lng) > 180 || Math.abs(lat) > 90)) throw new Error("Invalid supplied geometry");
    const previous = stopEntries.filter(([i]) => i < index).at(-1)?.[1] ?? `${route.vehicle_id}-origin`;
    const next = stopEntries.find(([i]) => i > index)?.[1] ?? `${route.vehicle_id}-return-depot`;
    return [{ id: `${route.vehicle_id}-${profile}-edge-${index}`, fromStopId: previous, toStopId: next,
      geometry: { type: "LineString" as const, coordinates: structuredClone(coordinates) },
      geometrySource: "MEMBER2_SUPPLIED" as const,
      distanceKm: (action.distance_m ?? 0) / 1000,
      durationMinutes: (Number(action.end_us ?? 0) - Number(action.start_us ?? 0)) / 60_000_000,
      relativeExposure: action.exposure }];
  });
  return { vehicleId: route.vehicle_id, orderedStops, routeSegments, suppliedActions: structuredClone(route.actions) };
}

export function buildOfflineRoadAlternatives(state: DecisionState, bundle: OfflineRoadBundle): ProposedAlternative[] | null {
  const diverse = bundle.schemaVersion === "m4-diverse-road-packs/1" && bundle.policyVersion === "saferoute-diverse-offline-profiles/1" && /^[a-f0-9]{64}$/.test(bundle.buildSha256);
  const legacy = bundle.schemaVersion === "m4-offline-road-packs/1" && bundle.buildSha256 === APPROVED_BUILD;
  if ((!diverse && !legacy) || bundle.executionMode !== "SIMULATED_REPLAY") return null;
  const worldBinding = { scenarioId: state.scenarioId, orders: state.orders, vehicles: state.vehicles,
    locations: state.locations, context: state.context, events: state.events };
  const pack = bundle.packs.find((p) => p.scenarioId === state.scenarioId &&
    (diverse ? p.validated && p.validationScope === "RAW_VALIDATED_DIVERSE_OFFLINE" && p.phase === "INITIAL" : p.certified) && (
    p.phase === "MANUAL_EVENT" && p.validationScope === "LOCAL_MANUAL_ANCHOR_RAW_FEASIBILITY_NOT_SDK_SESSION" &&
      p.worldBinding && equalFields(worldBinding, p.worldBinding) ||
    p.phase === "INITIAL" && state.events.every((e) => e.status === "READY_TO_TRIGGER") && !state.context.rain &&
      equalFields(state.orders, p.initialState.orders) && equalFields(state.vehicles, p.initialState.vehicles) && equalFields(state.locations, p.initialState.locations)));
  if (!pack || pack.alternatives.length !== 3 || !PROFILES.every((p, i) => pack.alternatives[i].profile === p)) return null;
  // A diversity export must contain actual different roads, not changed labels/metrics.
  if (diverse) {
    const roads = pack.alternatives.map(a => new Set(a.vehicle_routes.flatMap(r => r.actions.flatMap(action => action.kind === "EDGE" && action.edge_id ? [action.edge_id] : []))));
    if (roads.some((a, i) => roads.slice(i + 1).some(b => {
      const union = new Set([...a, ...b]);
      return [...union].filter(edge => a.has(edge) !== b.has(edge)).length / Math.max(1, union.size) < 0.01;
    }))) return null;
  }
  try {
    return pack.alternatives.map((witness, index) => {
      if (witness.schema_version !== "task02-m2-runtime-witness/2" || witness.scenario_id !== state.scenarioId || !["FEASIBLE", "PARTIAL"].includes(witness.status) || Object.values(witness.metrics).some((v) => !Number.isFinite(v) || v < 0)) throw new Error("Invalid offline witness");
      const coverage = [...witness.served_orders, ...witness.unserved_orders.map((o) => o.order_id)];
      if (new Set(coverage).size !== state.orders.length || coverage.length !== state.orders.length || state.orders.some((o) => !coverage.includes(o.id))) throw new Error("Incomplete order coverage");
      const profile = PROFILES[index];
      const routed = witness.vehicle_routes.map((route) => projectVehicle(state, route, profile));
      return {
        id: `${state.sessionId}-${state.scenarioId}-${state.version}-${profile}`,
        generatedForSessionId: state.sessionId, generatedForStateVersion: state.version,
        content: { profile,
          vehiclePlans: state.vehicles.map((vehicle) => routed.find((v) => v.vehicleId === vehicle.id) ?? { vehicleId: vehicle.id, orderedStops: [], routeSegments: [], suppliedActions: [] }),
          metrics: { distanceKm: witness.metrics.total_distance_m / 1000, durationMinutes: Math.round(witness.metrics.total_travel_time_s / 6) / 10,
            fuelCostVnd: witness.metrics.total_cost_vnd, exposureScore: witness.metrics.total_exposure * 100, onTimeRate: null },
          unserved: witness.unserved_orders.map((o) => ({ orderId: o.order_id, reason: o.reason })),
          provenance: { source: "Member 2 offline runtime" as const, scenarioId: state.scenarioId, stateVersion: state.version,
            ...(pack.phase === "MANUAL_EVENT" ? { integrationMode: "LOCAL_MANUAL_ANCHOR" as const } : {}),
            ...(diverse ? { integrationMode: "DIVERSE_OFFLINE" as const } : {}),
            computedAt: pack.sourceTime, buildSha256: pack.buildSha256 ?? bundle.buildSha256 }
        }
      };
    });
  } catch { return null; }
}
