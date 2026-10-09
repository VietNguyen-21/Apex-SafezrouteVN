import { expect, it } from "vitest";
import { MockStateEngine } from "./MockStateEngine";
import { diverseRoadPacks } from "./offlineRoadPackCatalog";
import { buildOfflineRoadAlternatives } from "./offlineRoadPlans";

it("optimizes S0 into complete road tradeoffs and executes each supplied plan", () => {
  const proposals = new MockStateEngine().optimize().planState.proposedAlternatives;
  expect(proposals.map(p => p.content!.profile)).toEqual(["FASTEST", "BALANCED", "SAFER"]);
  const metrics = proposals.map(p => p.content!.metrics);
  expect(metrics[0].durationMinutes).toBeLessThan(metrics[1].durationMinutes);
  expect(metrics[1].durationMinutes).toBeLessThan(metrics[2].durationMinutes);
  expect(metrics[0].exposureScore).toBeGreaterThan(metrics[1].exposureScore);
  expect(metrics[1].exposureScore).toBeGreaterThan(metrics[2].exposureScore);
  for (let index = 0; index < 3; index++) {
    const engine = new MockStateEngine();
    const result = engine.optimize().planState.proposedAlternatives[index];
    expect(result.content!.unserved).toEqual([]);
    expect(result.content!.provenance.integrationMode).toBe("DIVERSE_OFFLINE");
    engine.selectAlternative(result.id);
    engine.acceptSelectedPlan();
    for (const vehicle of result.content!.vehiclePlans) {
      for (const stop of vehicle.orderedStops) {
        for (const orderId of stop.orderIds) {
          const input = { vehicleId: vehicle.vehicleId, orderId };
          if (stop.kind === "DEPOT_PICKUP") engine.pickupOrder(input);
          else engine.deliverOrder(input);
        }
      }
    }
    expect(engine.getSnapshot().decisionState.orders.every(o => o.status === "DELIVERED")).toBe(true);
  }
});

it("rejects copied routes even if metrics, profile names or vehicle labels differ", () => {
  const bundle = structuredClone(diverseRoadPacks);
  const pack = bundle.packs.find(p => p.scenarioId === "S0")!;
  pack.alternatives[1].vehicle_routes = structuredClone(pack.alternatives[0].vehicle_routes);
  pack.alternatives[1].metrics.total_travel_time_s += 100;
  expect(buildOfflineRoadAlternatives(new MockStateEngine().getSnapshot().decisionState, bundle)).toBeNull();
});

it("requires local raw validation and exact initial state for a diverse bundle", () => {
  const state = new MockStateEngine().getSnapshot().decisionState;
  const bundle = structuredClone(diverseRoadPacks);
  bundle.packs[0].validated = false;
  expect(buildOfflineRoadAlternatives(state, bundle)).toBeNull();
  state.vehicles[0].capacityKg += 1;
  expect(buildOfflineRoadAlternatives(state, diverseRoadPacks)).toBeNull();
});
