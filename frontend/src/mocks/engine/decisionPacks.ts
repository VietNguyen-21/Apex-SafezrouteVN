import type { DecisionState, ImmutablePlanContent, PlanProfile, ProposedAlternative, RouteSegment, VehiclePlan } from "../../shared/types/dispatch";

const profileMetrics: Record<PlanProfile, ImmutablePlanContent["metrics"]> = {
  FASTEST: { distanceKm: 22.8, durationMinutes: 79, exposureScore: 71, onTimeRate: 94, fuelCostVnd: 390000 },
  BALANCED: { distanceKm: 24.1, durationMinutes: 86, exposureScore: 43, onTimeRate: 97, fuelCostVnd: 412000 },
  SAFER: { distanceKm: 27.4, durationMinutes: 101, exposureScore: 16, onTimeRate: 95, fuelCostVnd: 428000 }
};

type Coordinate = [number, number];
type AssignmentTemplate = Record<PlanProfile, Record<string, readonly string[]>>;

const preparedAssignments: AssignmentTemplate = {
  FASTEST: { V1: ["O001", "O003", "O005", "O007", "O009"], V2: ["O002", "O004", "O006", "O008"] },
  BALANCED: { V1: ["O002", "O004", "O006", "O008"], V2: ["O001", "O003", "O005", "O007", "O009"] },
  SAFER: { V1: ["O003", "O005", "O007"], V2: ["O001", "O002", "O004", "O006", "O008", "O009"] }
};

const preparedLegGeometry: Record<PlanProfile, Record<string, readonly Coordinate[][]>> = {
  FASTEST: {
    V1: [[[106.7162, 10.8023], [106.704, 10.807], [106.7208, 10.8157]], [[106.7208, 10.8157], [106.705, 10.812], [106.6885, 10.8056]], [[106.6885, 10.8056], [106.71, 10.82], [106.744, 10.835]], [[106.744, 10.835], [106.75, 10.842], [106.7363, 10.8502]]],
    V2: [[[106.7162, 10.8023], [106.742, 10.82], [106.787, 10.836]], [[106.787, 10.836], [106.77, 10.829], [106.75, 10.82]], [[106.75, 10.82], [106.735, 10.815], [106.72, 10.81]], [[106.72, 10.81], [106.71, 10.805], [106.70, 10.8]]]
  },
  BALANCED: {
    V1: [[[106.7162, 10.8023], [106.75, 10.82], [106.787, 10.836]], [[106.787, 10.836], [106.77, 10.828], [106.755, 10.819]], [[106.755, 10.819], [106.744, 10.812], [106.735, 10.806]], [[106.735, 10.806], [106.725, 10.802], [106.716, 10.8]]],
    V2: [[[106.7162, 10.8023], [106.705, 10.807], [106.7208, 10.8157]], [[106.7208, 10.8157], [106.704, 10.813], [106.6885, 10.8056]], [[106.6885, 10.8056], [106.732, 10.83], [106.744, 10.842]], [[106.744, 10.842], [106.742, 10.847], [106.7363, 10.8502]]]
  },
  SAFER: {
    V1: [[[106.7162, 10.8023], [106.702, 10.804], [106.6885, 10.8056]], [[106.6885, 10.8056], [106.70, 10.815], [106.713, 10.824]], [[106.713, 10.824], [106.725, 10.832], [106.738, 10.84]], [[106.738, 10.84], [106.742, 10.846], [106.7363, 10.8502]]],
    V2: [[[106.7162, 10.8023], [106.718, 10.81], [106.7208, 10.8157]], [[106.7208, 10.8157], [106.75, 10.824], [106.787, 10.836]], [[106.787, 10.836], [106.765, 10.83], [106.748, 10.82]], [[106.748, 10.82], [106.733, 10.816], [106.72, 10.811]]]
  }
};

function createSegments(vehicleId: string, stops: VehiclePlan["orderedStops"], profile: PlanProfile): RouteSegment[] {
  const legs = preparedLegGeometry[profile][vehicleId] ?? [];
  return stops.slice(1).map((stop, index) => ({
    id: `${vehicleId}-${profile}-segment-${index + 1}`,
    fromStopId: stops[index].id,
    toStopId: stop.id,
    geometry: { type: "LineString", coordinates: [...(legs[index] ?? legs.at(-1) ?? [])] },
    distanceKm: Number((profileMetrics[profile].distanceKm / Math.max(1, stops.length - 1)).toFixed(1)),
    durationMinutes: Math.ceil(profileMetrics[profile].durationMinutes / Math.max(1, stops.length - 1)),
    geometrySource: "SCHEMATIC_DEMO",
    relativeExposure: profileMetrics[profile].exposureScore
  }));
}

function createVehiclePlans(state: DecisionState, profile: PlanProfile): VehiclePlan[] {
  return state.vehicles.map((vehicle) => {
    const templateIds = preparedAssignments[profile][vehicle.id] ?? [];
    const onboardIds = state.orders.filter((order) => order.status === "ONBOARD" && order.assignedVehicleId === vehicle.id).map((order) => order.id);
    const assignedIds = [...new Set([...onboardIds, ...templateIds])];
    const orderIds = assignedIds.filter((id) => {
      const order = state.orders.find((candidate) => candidate.id === id);
      return Boolean(order && order.status !== "DELIVERED" &&
        (order.status === "ONBOARD" ? order.assignedVehicleId === vehicle.id : vehicle.availability === "AVAILABLE"));
    });
    const orders = orderIds.map((id) => state.orders.find((order) => order.id === id)).filter((order): order is NonNullable<typeof order> => Boolean(order));
    const pickupOrderIds = orders.filter((order) => order.status === "WAITING").map((order) => order.id);
    const stops = [
      ...(pickupOrderIds.length > 0 ? [{
        id: `${vehicle.id}-depot`, kind: "DEPOT_PICKUP" as const, orderIds: pickupOrderIds, label: "Kho hàng", location: { latitude: 10.8022693, longitude: 106.7161639 }
      }] : []),
      ...orders.map((order) => ({
        id: `${vehicle.id}-${order.id}`, kind: "DELIVERY" as const, orderIds: [order.id], label: order.id, location: { latitude: order.latitude, longitude: order.longitude }
      }))
    ];
    // Prepared geometry describes the template assignment only. A custody override
    // changes the stop chain; leave geometry absent instead of inventing a new route.
    const templateMatches = orderIds.every((id) => templateIds.includes(id)) &&
      templateIds.filter((id) => state.orders.some((order) => order.id === id && order.status !== "DELIVERED")).every((id) => orderIds.includes(id));
    return { vehicleId: vehicle.id, orderedStops: stops, routeSegments: templateMatches ? createSegments(vehicle.id, stops, profile) : [] };
  });
}

export function buildPreparedAlternatives(state: DecisionState): ProposedAlternative[] {
  const profiles: PlanProfile[] = ["FASTEST", "BALANCED", "SAFER"];
  return profiles.map((profile) => ({
    id: `${state.sessionId}-${state.scenarioId}-${state.version}-${profile}`,
    generatedForSessionId: state.sessionId,
    generatedForStateVersion: state.version,
    content: {
      profile,
      vehiclePlans: createVehiclePlans(state, profile),
      metrics: profileMetrics[profile],
      unserved: state.orders.filter((order) => order.status !== "DELIVERED").flatMap((order) => {
        const plannedVehicle = state.vehicles.find((vehicle) =>
          order.status === "ONBOARD" ? vehicle.id === order.assignedVehicleId : preparedAssignments[profile][vehicle.id]?.includes(order.id));
        if (!plannedVehicle) return [{ orderId: order.id, reason: "Không có prepared decision pack cho đơn này" }];
        if (plannedVehicle.availability === "UNAVAILABLE") return [{ orderId: order.id, reason: order.status === "ONBOARD" ? "Xe đang chở hàng không khả dụng" : "Xe được phân công không khả dụng" }];
        return [];
      }),
      provenance: { source: "Dữ liệu demo", scenarioId: state.scenarioId, stateVersion: state.version }
    }
  }));
}
