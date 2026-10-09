import { expect, it } from "vitest";
import { MockStateEngine } from "../mocks/engine/MockStateEngine";
import { distinctOfflineProposals, groupOfflineOutcomes } from "./profileOutcomes";

it("keeps the three recomputed S0 outcomes without modifying routes, metrics or profiles", () => {
  const proposals = new MockStateEngine().optimize().planState.proposedAlternatives;
  const before = structuredClone(proposals);
  expect(groupOfflineOutcomes(proposals)).toEqual([["FASTEST"], ["BALANCED"], ["SAFER"]]);
  expect(distinctOfflineProposals(proposals)).toHaveLength(3);
  expect(proposals).toEqual(before);
});

it("preserves three genuinely different S2 results and the two S1 results", () => {
  const engine = new MockStateEngine();
  engine.loadScenario("S2");
  expect(groupOfflineOutcomes(engine.optimize().planState.proposedAlternatives)).toHaveLength(3);
  engine.loadScenario("S1");
  expect(groupOfflineOutcomes(engine.optimize().planState.proposedAlternatives)).toEqual([["FASTEST"], ["BALANCED", "SAFER"]]);
});

it("does not classify rounded equal metrics or different geometry as identical results", () => {
  const proposals = new MockStateEngine().optimize().planState.proposedAlternatives;
  proposals[1].content!.metrics.fuelCostVnd += 0.01;
  proposals[2].content!.vehiclePlans.find(v => v.routeSegments.length)!.routeSegments[0].geometry.coordinates[0][0] += 0.00001;
  expect(groupOfflineOutcomes(proposals)).toHaveLength(3);
});

it("suppresses duplicate legacy roads even when their displayed metrics or vehicle IDs differ", () => {
  const proposals = new MockStateEngine().optimize().planState.proposedAlternatives;
  proposals[0].content!.vehiclePlans = structuredClone(proposals[1].content!.vehiclePlans);
  proposals[0].content!.vehiclePlans.reverse();
  proposals[0].content!.metrics.durationMinutes += 10;
  expect(distinctOfflineProposals(proposals).map(p => p.content!.profile)).toEqual(["BALANCED", "SAFER"]);
});
