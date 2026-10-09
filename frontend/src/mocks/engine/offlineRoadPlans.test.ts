import { describe, expect, it } from "vitest";
import { getFixtureScenario } from "../fixtureCatalog";
import { MockStateEngine } from "./MockStateEngine";
import { buildOfflineRoadAlternatives, type OfflineRoadBundle } from "./offlineRoadPlans";

function bundle(): OfflineRoadBundle {
  return {
    schemaVersion: "m4-offline-road-packs/1", buildSha256: "80694f511dc735d0b6a1a0a830edd7f6267df395e87dad0ccf180914b49d5a41",
    executionMode: "SIMULATED_REPLAY", packs: [{ scenarioId: "S0", phase: "INITIAL", fixtureSha256: "fixture-test", certified: true,
      initialState: structuredClone(getFixtureScenario("S0").initialState), sourceTime: "2026-09-27T21:00:00+07:00",
      alternatives: ["FASTEST", "BALANCED", "SAFER"].map((profile) => ({
        schema_version: "task02-m2-runtime-witness/2", scenario_id: "S0", profile, status: "PARTIAL",
        source_hashes: {}, served_orders: ["O001"], unserved_orders: [{order_id: "O002", reason: "NOT_SERVED_BY_FOUND_WITNESS"}, {order_id: "O003", reason: "NOT_SERVED_BY_FOUND_WITNESS"}], metric_scope: "PLANNED_SUFFIX_ONLY",
        metrics: { total_distance_m: 800, total_travel_time_s: 180, total_cost_vnd: 2000, total_exposure: 0.2, total_soft_lateness_s: 0 },
        vehicle_routes: [{ vehicle_id: "V1", order_sequence: ["O001"], actions: [
          { kind: "PICKUP", order_id: "O001", node_id: 366428309, start_us: 0, end_us: 0 },
          { kind: "EDGE", edge_id: "e1", geometry: [[106.7, 10.8], [106.701, 10.801], [106.702, 10.803]], distance_m: 300, exposure: 0.1, start_us: 0, end_us: 60000000 },
          { kind: "EDGE", edge_id: "e2", geometry: [[106.702, 10.803], [106.704, 10.804]], distance_m: 200, exposure: 0.05, start_us: 60000000, end_us: 90000000 },
          { kind: "SERVICE", order_id: "O001", node_id: 1852879355, start_us: 90000000, end_us: 100000000 },
          { kind: "EDGE", edge_id: "return", geometry: [[106.704, 10.804], [106.705, 10.802], [106.7, 10.8]], distance_m: 300, exposure: 0.05, start_us: 100000000, end_us: 190000000 }
        ] }]
      }))
    }]
  };
}

describe("offline road plan binding and projection", () => {
  it("binds a locally validated event pack to the complete manual world and keeps exact road geometry", () => {
    const engine = new MockStateEngine();
    const state = engine.triggerFixtureEvent("S2-E1").decisionState;
    const data = bundle();
    const { sessionId: _session, version: _version, ...worldBinding } = structuredClone(state);
    data.packs[0] = { ...data.packs[0], phase: "MANUAL_EVENT", validationScope: "LOCAL_MANUAL_ANCHOR_RAW_FEASIBILITY_NOT_SDK_SESSION", worldBinding };
    for (const alternative of data.packs[0].alternatives) alternative.unserved_orders.push({ order_id: "O009", reason: "NOT_SERVED_BY_FOUND_WITNESS" });
    const result = buildOfflineRoadAlternatives(state, data);
    expect(result).not.toBeNull();
    expect(result![0].content!.vehiclePlans[0].routeSegments[0].geometry.coordinates).toEqual([[106.7, 10.8], [106.701, 10.801], [106.702, 10.803]]);
    expect(result![0].content!.provenance.integrationMode).toBe("LOCAL_MANUAL_ANCHOR");
    expect(result![0].generatedForSessionId).toBe(state.sessionId);
    for (const mismatch of ["custody", "position", "context", "event", "payload", "validation"] as const) {
      const changed = structuredClone(state);
      const candidate = structuredClone(data);
      if (mismatch === "custody") changed.orders[0].status = "ONBOARD";
      if (mismatch === "position") changed.vehicles[0].currentPosition.latitude += 0.01;
      if (mismatch === "context") changed.context.rain = { polygon: { type: "Polygon", coordinates: [] }, endsAt: "2026-09-27T22:15:00+07:00" };
      if (mismatch === "event") changed.events[0].status = "EXPIRED";
      if (mismatch === "payload") changed.events[0].fixtureEvent.timestamp = "2026-09-27T21:20:00+07:00";
      if (mismatch === "validation") candidate.packs[0].validationScope = "UNVERIFIED";
      expect(buildOfflineRoadAlternatives(changed, candidate)).toBeNull();
    }
  });
  it("completes incoming road edges at delivery, without completing the return forecast", () => {
    const snapshot = new MockStateEngine().getSnapshot();
    snapshot.planState.proposedAlternatives = buildOfflineRoadAlternatives(snapshot.decisionState, bundle())!;
    const engine = new MockStateEngine(snapshot);
    engine.selectAlternative(snapshot.planState.proposedAlternatives[0].id);
    const accepted = engine.acceptSelectedPlan();
    const picked = engine.pickupOrder({ vehicleId: "V1", orderId: "O001" });
    expect(picked.executionState.progressByPlanId[accepted.planState.activeAcceptedPlanId!].V1.completedSegmentIds).toHaveLength(0);
    const delivered = engine.deliverOrder({ vehicleId: "V1", orderId: "O001" });
    expect(delivered.executionState.progressByPlanId[accepted.planState.activeAcceptedPlanId!].V1.completedSegmentIds).toHaveLength(2);
    const route = accepted.planState.acceptedPlans[0].plan.vehiclePlans[0];
    expect(delivered.executionState.progressByPlanId[accepted.planState.activeAcceptedPlanId!].V1.completedSegmentIds).not.toContain(route.routeSegments[2].id);
  });
  it("preserves every supplied EDGE point, action order and return geometry", () => {
    const state = new MockStateEngine().getSnapshot().decisionState;
    const plans = buildOfflineRoadAlternatives(state, bundle());
    expect(plans).not.toBeNull();
    const v1 = plans![0].content!.vehiclePlans.find((v) => v.vehicleId === "V1")!;
    expect(v1.orderedStops.map((s) => [s.kind, s.orderIds])).toEqual([["DEPOT_PICKUP", ["O001"]], ["DELIVERY", ["O001"]]]);
    expect(v1.routeSegments.map((s) => s.geometry.coordinates)).toEqual([
      [[106.7, 10.8], [106.701, 10.801], [106.702, 10.803]],
      [[106.702, 10.803], [106.704, 10.804]],
      [[106.704, 10.804], [106.705, 10.802], [106.7, 10.8]]
    ]);
    expect(v1.routeSegments.every((s) => s.geometrySource === "MEMBER2_SUPPLIED")).toBe(true);
    expect(v1.suppliedActions).toHaveLength(5);
    expect(plans![0].content!.metrics).toEqual({ distanceKm: 0.8, durationMinutes: 3, fuelCostVnd: 2000, exposureScore: 20, onTimeRate: null });
    expect(plans![0].generatedForSessionId).toBe(state.sessionId);
  });

  it.each(["custody", "availability", "position", "event", "order"])("refuses an initial pack after %s changes", (change) => {
    const state = new MockStateEngine().getSnapshot().decisionState;
    if (change === "custody") { state.orders[0].status = "ONBOARD"; state.orders[0].assignedVehicleId = "V1"; }
    if (change === "availability") state.vehicles[0].availability = "UNAVAILABLE";
    if (change === "position") state.vehicles[0].currentPosition.latitude += 0.01;
    if (change === "event") state.events[0].status = "TRIGGERED";
    if (change === "order") state.orders[0].demandKg += 1;
    expect(buildOfflineRoadAlternatives(state, bundle())).toBeNull();
  });

  it("rejects incomplete profile sets and foreign scenario packs", () => {
    const state = new MockStateEngine().getSnapshot().decisionState;
    const incomplete = bundle(); incomplete.packs[0].alternatives.pop();
    expect(buildOfflineRoadAlternatives(state, incomplete)).toBeNull();
    const foreign = bundle(); foreign.packs[0].scenarioId = "S2";
    expect(buildOfflineRoadAlternatives(state, foreign)).toBeNull();
  });

  it("fails closed for uncertified packs, invalid geometry or mismatched order coverage", () => {
    const state = new MockStateEngine().getSnapshot().decisionState;
    const uncertified = bundle(); uncertified.packs[0].certified = false;
    expect(buildOfflineRoadAlternatives(state, uncertified)).toBeNull();
    const invalid = bundle(); invalid.packs[0].alternatives[0].vehicle_routes[0].actions[1].geometry = [[106.7, 10.8]];
    expect(buildOfflineRoadAlternatives(state, invalid)).toBeNull();
    const coverage = bundle(); coverage.packs[0].alternatives[0].unserved_orders.pop();
    expect(buildOfflineRoadAlternatives(state, coverage)).toBeNull();
  });
});
