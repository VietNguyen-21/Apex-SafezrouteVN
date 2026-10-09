import type { ProposedAlternative, PlanProfile } from "../shared/types/dispatch";

/** Hide repeated road choices from older offline packs; keep BALANCED when tied. */
export function distinctOfflineProposals(proposals: ProposedAlternative[]): ProposedAlternative[] {
  const kept: ProposedAlternative[] = [];
  const roads = (p: ProposedAlternative) => new Set(p.content?.vehiclePlans.flatMap(v =>
    v.suppliedActions?.flatMap(a => a.kind === "EDGE" && a.edge_id ? [a.edge_id] : []) ?? []) ?? []);
  const priority = (p: ProposedAlternative) => p.content?.profile === "BALANCED" ? 0 : p.content?.profile === "FASTEST" ? 1 : 2;
  for (const proposal of [...proposals].sort((a, b) => priority(a) - priority(b))) {
    const a = roads(proposal);
    const duplicate = a.size > 0 && kept.some(other => {
      const b = roads(other);
      const union = new Set([...a, ...b]);
      // Same threshold as the offline generator. Metrics/vehicle labels alone
      // must never make the same road set look like a new alternative.
      return b.size > 0 && [...union].filter(edge => a.has(edge) !== b.has(edge)).length / union.size < 0.01;
    });
    if (!duplicate) kept.push(proposal);
  }
  return proposals.filter(p => kept.includes(p));
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}

/** Compare actual offline results, not profile-specific IDs or rounded card labels. */
export function groupOfflineOutcomes(proposals: ProposedAlternative[]): PlanProfile[][] {
  const groups = new Map<string, PlanProfile[]>();
  for (const proposal of proposals) {
    const plan = proposal.content;
    if (!plan || proposal.origin?.kind === "MEMBER3") continue;
    const key = canonical({
      metrics: plan.metrics,
      unserved: [...plan.unserved].sort((a, b) => a.orderId.localeCompare(b.orderId)),
      vehicles: [...plan.vehiclePlans].sort((a, b) => a.vehicleId.localeCompare(b.vehicleId)).map(vehicle => ({
        vehicleId: vehicle.vehicleId,
        stops: vehicle.orderedStops.map(stop => ({ kind: stop.kind, orderIds: stop.orderIds, location: stop.location })),
        actions: vehicle.suppliedActions,
        segments: vehicle.routeSegments.map(segment => ({
          geometry: segment.geometry, distanceKm: segment.distanceKm,
          durationMinutes: segment.durationMinutes, relativeExposure: segment.relativeExposure
        }))
      }))
    });
    const group = groups.get(key) ?? [];
    group.push(plan.profile);
    groups.set(key, group);
  }
  return [...groups.values()];
}
