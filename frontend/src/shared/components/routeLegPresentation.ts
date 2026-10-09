import type { VehiclePlan } from "../types/dispatch";
import type { MapSegment } from "./mapScene";

const PALETTES: Record<string, readonly string[]> = {
  V1: ["#2563eb", "#06b6d4", "#4f46e5", "#0284c7", "#38bdf8", "#1e40af"],
  V2: ["#16a34a", "#14532d", "#65a30d", "#22c55e", "#14b8a6", "#15803d"]
};
const FALLBACK_PALETTE = ["#475569", "#94a3b8", "#64748b", "#334155"];

export function vehicleRouteColor(vehicleId: string): string {
  return (PALETTES[vehicleId] ?? FALLBACK_PALETTE)[0];
}
export function vehicleLegColor(vehicleId: string, number: number): string {
  const palette = PALETTES[vehicleId] ?? FALLBACK_PALETTE;
  return palette[(number - 1) % palette.length];
}

export interface RouteLeg {
  id: string;
  vehicleId: string;
  number: number;
  targetLabel: string;
  color: string;
}

/** Decorates supplied EDGE actions before display filters; never mutates source geometry. */
export function describeSuppliedRouteLegs(segments: readonly MapSegment[]): { legs: RouteLeg[]; bySegmentId: Map<string, RouteLeg> } {
  const groups = new Map<string, RouteLeg>(), bySegmentId = new Map<string, RouteLeg>();
  const countByVehicle = new Map<string, number>();
  for (const segment of segments) {
    const id = segment.legId ?? segment.id;
    let leg = groups.get(id);
    if (!leg) {
      const next = (countByVehicle.get(segment.vehicleId) ?? 0) + 1;
      const ordinal = /:leg:([1-9]\d*)$/.exec(id)?.[1];
      const number = ordinal && Number.isSafeInteger(Number(ordinal)) ? Number(ordinal) : next;
      countByVehicle.set(segment.vehicleId, number);
      leg = { id, vehicleId: segment.vehicleId, number, color: vehicleLegColor(segment.vehicleId, number),
        targetLabel: segment.returnToDepot ? "Mandatory return continuation" : "Planned service" };
      groups.set(id, leg);
    }
    bySegmentId.set(segment.id, leg);
  }
  return { legs: [...groups.values()], bySegmentId };
}

/** Assign colors to supplied stop-to-stop legs before filtering progress.
 * No coordinates are generated or modified. Return forecasts stay in the plan.
 */
export function describeRouteLegs(vehicle: VehiclePlan): { legs: RouteLeg[]; bySegmentId: Map<string, RouteLeg> } {
  const groups = new Map<string, RouteLeg>();
  const bySegmentId = new Map<string, RouteLeg>();
  for (const segment of vehicle.routeSegments) {
    if (segment.toStopId.endsWith("return-depot")) continue;
    const key = JSON.stringify([segment.fromStopId, segment.toStopId]);
    let leg = groups.get(key);
    if (!leg) {
      const target = vehicle.orderedStops.find((s) => s.id === segment.toStopId);
      const number = groups.size + 1;
      leg = {
        id: `${vehicle.vehicleId}:${key}`,
        vehicleId: vehicle.vehicleId,
        number,
        targetLabel: target?.kind === "DELIVERY" ? target.orderIds.join(", ") : target?.kind === "DEPOT_PICKUP" ? "Depot pickup" : segment.toStopId,
        color: vehicleLegColor(vehicle.vehicleId, number)
      };
      groups.set(key, leg);
    }
    bySegmentId.set(segment.id, leg);
  }
  return { legs: [...groups.values()], bySegmentId };
}
