import { describe, expect, it } from "vitest";
import { MockStateEngine } from "./MockStateEngine";
import { getFixtureScenario } from "../fixtureCatalog";

function ready() {
  const engine = new MockStateEngine();
  const proposal = engine.optimize().planState.proposedAlternatives[0];
  engine.selectAlternative(proposal.id);
  const snapshot = engine.acceptSelectedPlan();
  const plan = snapshot.planState.acceptedPlans[0].plan.vehiclePlans.find(p => p.orderedStops[0]?.kind === "DEPOT_PICKUP" && p.orderedStops.length > 1)!;
  engine.setPlayback(true, 60, 1000);
  for (const orderId of plan.orderedStops[0].orderIds) engine.pickupOrder({ vehicleId: plan.vehicleId, orderId });
  return { engine, plan };
}

describe("vehicle playback", () => {
  it("moves along the road, blocks early delivery, stops at arrival and keeps the accepted plan immutable", () => {
    const { engine, plan } = ready();
    const original = engine.getSnapshot();
    const orderId = plan.orderedStops[1].orderIds[0];
    expect(() => engine.deliverOrder({ vehicleId: plan.vehicleId, orderId })).toThrow("Wait until");
    const first = engine.tickPlayback(2000);
    expect(first.decisionState.vehicles.find(v => v.id === plan.vehicleId)?.currentPosition).not.toEqual(original.decisionState.vehicles.find(v => v.id === plan.vehicleId)?.currentPosition);
    expect(engine.tickPlayback(2000)).toEqual(first); // second tab cannot double the same elapsed interval
    const legMinutes = plan.routeSegments.filter(s => s.toStopId === plan.orderedStops[1].id).reduce((sum, s) => sum + s.durationMinutes, 0);
    for (let i = 3; i <= Math.ceil(legMinutes) + 3; i++) engine.tickPlayback(i * 1000);
    const arrived = engine.getSnapshot();
    const progress = arrived.executionState.progressByPlanId[arrived.executionState.activePlanId!][plan.vehicleId];
    expect(progress.arrived).toBe(true);
    expect(arrived.decisionState.orders.find(o => o.id === orderId)?.status).toBe("ONBOARD");
    expect(arrived.planState.acceptedPlans).toEqual(original.planState.acceptedPlans);
    const position = arrived.decisionState.vehicles.find(v => v.id === plan.vehicleId)?.currentPosition;
    expect(engine.tickPlayback(500000).decisionState.vehicles.find(v => v.id === plan.vehicleId)?.currentPosition).toEqual(position);
    expect(engine.deliverOrder({ vehicleId: plan.vehicleId, orderId }).decisionState.orders.find(o => o.id === orderId)?.status).toBe("DELIVERED");
  });

  it("pauses, restores progress and refuses unmatched moving-world optimization", () => {
    const { engine } = ready();
    engine.tickPlayback(2000);
    const paused = engine.setPlayback(false, 30, 2000);
    expect(engine.tickPlayback(3000)).toEqual(paused);
    const restored = new MockStateEngine(paused);
    expect(restored.getSnapshot()).toEqual(paused);
    expect(() => restored.optimize()).toThrow("Moving-world");
  });

  it("freezes an unavailable vehicle without transferring onboard orders", () => {
    const { engine } = ready();
    engine.tickPlayback(2000);
    const broken = engine.triggerFixtureEvent("S3-E1");
    const vehicle = broken.decisionState.vehicles.find(v => v.availability === "UNAVAILABLE")!;
    const later = engine.tickPlayback(3000);
    expect(later.decisionState.vehicles.find(v => v.id === vehicle.id)).toEqual(vehicle);
    expect(later.decisionState.orders).toEqual(broken.decisionState.orders);
  });

  it("preserves S3 onboard custody when its vehicle fails", () => {
    const engine = new MockStateEngine();
    engine.loadScenario("S3");
    const proposal = engine.optimize().planState.proposedAlternatives[0];
    engine.selectAlternative(proposal.id);
    engine.acceptSelectedPlan();
    engine.setPlayback(true, 30, 1000);
    engine.tickPlayback(2000);
    const broken = engine.triggerFixtureEvent("S3-E1");
    const vehicle = broken.decisionState.vehicles.find(v => v.availability === "UNAVAILABLE")!;
    expect(vehicle.onboardOrderIds.length).toBeGreaterThan(0);
    const later = engine.tickPlayback(3000);
    expect(later.decisionState.vehicles.find(v => v.id === vehicle.id)).toEqual(vehicle);
    for (const id of vehicle.onboardOrderIds) {
      expect(later.decisionState.orders.find(o => o.id === id)).toMatchObject({ status: "ONBOARD", assignedVehicleId: vehicle.id });
    }
  });
});

describe("scenario import", () => {
  it("starts a fresh pinned scenario and rejects modified coordinates atomically", () => {
    const engine = new MockStateEngine();
    const before = engine.getSnapshot();
    const fixture = structuredClone(getFixtureScenario("S1"));
    const imported = engine.importScenario(fixture);
    expect(imported.decisionState.scenarioId).toBe("S1");
    expect(imported.decisionState.sessionId).not.toBe(before.decisionState.sessionId);
    fixture.initialState.orders[0].latitude += 0.01;
    expect(() => engine.importScenario(fixture)).toThrow("no matching offline routes");
    expect(engine.getSnapshot()).toEqual(imported);
    expect(() => engine.importScenario(null)).toThrow();
  });
});
