import type { DispatchSnapshot } from "../../shared/types/dispatch";

// Interpolate each supplied road edge by its travel time, then its polyline length.
export function moveVehicles(snapshot: DispatchSnapshot, minutes: number): void {
  const record = snapshot.planState.acceptedPlans.find(p => p.id === snapshot.planState.activeAcceptedPlanId);
  if (!record) return;
  for (const plan of record.plan.vehiclePlans) {
    const vehicle = snapshot.decisionState.vehicles.find(v => v.id === plan.vehicleId);
    const progress = snapshot.executionState.progressByPlanId[record.id]?.[plan.vehicleId];
    const stop = plan.orderedStops.find(s => s.id === progress?.currentStopId);
    if (!vehicle || !progress || !stop || vehicle.availability === "UNAVAILABLE" || progress.arrived) continue;
    // A depot pickup is a manual action before departure.
    if (stop.kind === "DEPOT_PICKUP") { progress.arrived = true; continue; }
    const segments = plan.routeSegments.filter(s => s.toStopId === stop.id);
    if (!segments.length) continue;
    const total = segments.reduce((sum, s) => sum + Math.max(0, s.durationMinutes), 0);
    progress.travelMinutes = Math.min(total, (progress.travelMinutes ?? 0) + minutes);
    let remaining = progress.travelMinutes;
    for (const segment of segments) {
      const duration = Math.max(0, segment.durationMinutes);
      const points = segment.geometry.coordinates;
      if (!points.length) continue;
      const fraction = duration === 0 ? 1 : Math.min(1, remaining / duration);
      const lengths = points.slice(1).map((p, i) => Math.hypot(
        (p[0] - points[i][0]) * Math.cos(p[1] * Math.PI / 180), p[1] - points[i][1]));
      let distance = lengths.reduce((a, b) => a + b, 0) * fraction;
      let position = points[points.length - 1];
      for (let i = 0; i < lengths.length; i++) {
        if (distance <= lengths[i] && lengths[i] > 0) {
          const t = distance / lengths[i];
          position = [points[i][0] + t * (points[i + 1][0] - points[i][0]), points[i][1] + t * (points[i + 1][1] - points[i][1])];
          break;
        }
        distance -= lengths[i];
      }
      vehicle.currentPosition.longitude = position[0];
      vehicle.currentPosition.latitude = position[1];
      vehicle.positionTimestamp = snapshot.demoClock.now;
      if (fraction < 1) break;
      if (!progress.completedSegmentIds.includes(segment.id)) progress.completedSegmentIds.push(segment.id);
      remaining -= duration;
    }
    progress.arrived = progress.travelMinutes >= total;
  }
}
