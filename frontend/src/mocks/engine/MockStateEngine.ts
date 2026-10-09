import { moveVehicles } from "./demoMotion";
import { identifyImportedScenario } from "../importScenario";
import { buildOfflineRoadAlternatives } from "./offlineRoadPlans";
import { diverseRoadPacks, offlineRoadPacks } from "./offlineRoadPackCatalog";
import { getFixtureScenario } from "../fixtureCatalog";
import type { DispatchSnapshot, DecisionEvent, DecisionState } from "../../shared/types/dispatch";
import type { FixtureEvent, ScenarioId } from "../../shared/types/scenario";
import { buildPreparedAlternatives } from "./decisionPacks";

import { DispatchError } from "../../shared/dispatchErrors";
export { DispatchError, type DispatchErrorCode } from "../../shared/dispatchErrors";

function clone<T>(value: T): T {
  return structuredClone(value);
}

function createSessionId(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  return `session-${uuid ?? Math.random().toString(36).slice(2)}`;
}

function addMinutes(isoTime: string, minutes: number): string {
  const milliseconds = new Date(isoTime).getTime() + minutes * 60_000;
  if (!Number.isFinite(milliseconds)) throw new Error("Invalid demo clock time");
  return new Date(milliseconds + 7 * 60 * 60_000).toISOString().replace(/Z$/, "+07:00");
}

function isAtOrAfter(left: string, right: string): boolean {
  return new Date(left).getTime() >= new Date(right).getTime();
}

function eventLabel(event: FixtureEvent): string {
  const labels: Record<FixtureEvent["type"], string> = {
    URGENT_ORDER: "Đơn hàng khẩn",
    VEHICLE_UNAVAILABLE: "Xe không khả dụng",
    LOCAL_RAIN_WHAT_IF: "Mưa cục bộ"
  };
  return labels[event.type];
}

export class MockStateEngine {
  private snapshot: DispatchSnapshot;

  constructor(initialSnapshot?: DispatchSnapshot) {
    this.snapshot = initialSnapshot ? clone(initialSnapshot) : this.createScenarioSnapshot("S0");
    this.snapshot.demo.roundEventId ??= this.snapshot.decisionState.events.find((event) => event.status !== "READY_TO_TRIGGER")?.id ?? null;
  }

  getSnapshot(): DispatchSnapshot {
    const snapshot = clone(this.snapshot);
    snapshot.demo.availableEvents = snapshot.decisionState.events.map((event) => this.toSummary(event));
    return snapshot;
  }

  loadScenario(id: ScenarioId): DispatchSnapshot {
    this.snapshot = this.createScenarioSnapshot(id);
    return this.getSnapshot();
  }

  resetDemoSession(): DispatchSnapshot {
    return this.loadScenario("S0");
  }

  optimize(): DispatchSnapshot {
    return this.transaction(() => {
      if (Object.values(this.snapshot.executionState.progressByPlanId).some(plans => Object.values(plans).some(p => (p.travelMinutes ?? 0) > 0))) {
        throw new DispatchError("MOTION_REPLAN_UNSUPPORTED", "Moving-world routing requires a new runtime export.");
      }
      if (this.snapshot.executionState.playback) this.snapshot.executionState.playback.playing = false;
      this.advanceActionClock();
      this.snapshot.planState.proposedAlternatives = buildOfflineRoadAlternatives(this.snapshot.decisionState, diverseRoadPacks)
        ?? buildOfflineRoadAlternatives(this.snapshot.decisionState, offlineRoadPacks)
        ?? buildPreparedAlternatives(this.snapshot.decisionState);
      this.snapshot.planState.selectedAlternativeId = null;
      return this.getSnapshot();
    });
  }

  selectAlternative(planId: string): DispatchSnapshot {
    return this.transaction(() => {
      if (!this.snapshot.planState.proposedAlternatives.some((proposal) => proposal.id === planId)) {
        throw new DispatchError("EVENT_NOT_READY", "Không tìm thấy phương án cần chọn.");
      }
      this.snapshot.planState.selectedAlternativeId = planId;
      return this.getSnapshot();
    });
  }

  acceptSelectedPlan(): DispatchSnapshot {
    return this.transaction(() => {
    const selectedBeforeClockAdvance = this.snapshot.planState.proposedAlternatives.find((proposal) => proposal.id === this.snapshot.planState.selectedAlternativeId);
    this.advanceActionClock();
    const selectedId = this.snapshot.planState.selectedAlternativeId;
    const selected = this.snapshot.planState.proposedAlternatives.find((proposal) => proposal.id === selectedId);
    if (selectedBeforeClockAdvance && (!selected || selected.generatedForSessionId !== this.snapshot.decisionState.sessionId || selected.generatedForStateVersion !== this.snapshot.decisionState.version)) {
      throw new DispatchError("STALE_PROPOSAL", "Phương án được tạo cho trạng thái cũ. Hãy tối ưu lại.");
    }
    if (!selected) {
      throw new DispatchError("NO_SELECTED_ALTERNATIVE", "Hãy chọn một phương án trước khi điều phối.");
    }
    if (selected.generatedForSessionId !== this.snapshot.decisionState.sessionId || selected.generatedForStateVersion !== this.snapshot.decisionState.version) {
      throw new DispatchError("STALE_PROPOSAL", "Phương án được tạo cho trạng thái cũ. Hãy tối ưu lại.");
    }

    const activeId = this.snapshot.planState.activeAcceptedPlanId;
    if (activeId) {
      const active = this.snapshot.planState.acceptedPlans.find((record) => record.id === activeId);
      if (active) active.supersededAt = this.snapshot.demoClock.now;
    }
    const record = {
      id: `${this.snapshot.decisionState.sessionId}-accepted-${this.snapshot.planState.acceptedPlans.length + 1}`,
      plan: clone(selected.content!),
      acceptedAt: this.snapshot.demoClock.now
    };
    this.snapshot.planState.acceptedPlans.push(record);
    this.snapshot.planState.activeAcceptedPlanId = record.id;
    this.snapshot.planState.proposedAlternatives = [];
    this.snapshot.planState.selectedAlternativeId = null;
    this.snapshot.planState.operationalPlanAssessment = {
      planId: record.id,
      status: "ACTIVE",
      reasons: [],
      assessedAgainstSessionId: this.snapshot.decisionState.sessionId,
      assessedAgainstStateVersion: this.snapshot.decisionState.version
    };
    this.snapshot.executionState.activePlanId = record.id;
    this.snapshot.executionState.progressByPlanId[record.id] = Object.fromEntries(record.plan.vehiclePlans.map((vehiclePlan) => [vehiclePlan.vehicleId, {
      currentStopId: vehiclePlan.orderedStops[0]?.id ?? null,
      completedStopIds: [],
      completedSegmentIds: []
    }]));
    return this.getSnapshot();
    });
  }

  pickupOrder(input: { vehicleId: string; orderId: string }): DispatchSnapshot {
    return this.transaction(() => {
    const { record, vehiclePlan, progress } = this.currentVehiclePlan(input.vehicleId);
    const vehicle = this.snapshot.decisionState.vehicles.find((candidate) => candidate.id === input.vehicleId);
    const order = this.snapshot.decisionState.orders.find((candidate) => candidate.id === input.orderId);
    const currentStop = vehiclePlan.orderedStops.find((stop) => stop.id === progress.currentStopId);
    if (!vehicle || !order || !currentStop || currentStop.kind !== "DEPOT_PICKUP" || !currentStop.orderIds.includes(input.orderId)) {
      throw new DispatchError("INVALID_CURRENT_STOP", "Đơn hàng không ở điểm lấy hiện tại của xe.");
    }
    if (vehicle.availability === "UNAVAILABLE") {
      throw new DispatchError("VEHICLE_UNAVAILABLE", "Xe hiện không thể thực hiện thao tác này.");
    }
    if (order.status !== "WAITING") {
      throw new DispatchError("INVALID_ORDER_STATE", "Đơn hàng không còn chờ lấy.");
    }

    this.advanceActionClock();
    order.status = "ONBOARD";
    order.assignedVehicleId = vehicle.id;
    order.pickedUpAt = this.snapshot.demoClock.now;
    vehicle.onboardOrderIds = [...vehicle.onboardOrderIds, order.id];
    vehicle.currentLoadKg += order.demandKg;
    this.snapshot.decisionState.version += 1;
    const allPicked = currentStop.orderIds.every((orderId) => this.snapshot.decisionState.orders.find((candidate) => candidate.id === orderId)?.status === "ONBOARD");
    if (allPicked) this.advanceStop(record.id, vehiclePlan.vehicleId, vehiclePlan, progress);
    this.invalidateProposals();
    this.refreshAssessment();
    return this.getSnapshot();
    });
  }

  deliverOrder(input: { vehicleId: string; orderId: string }): DispatchSnapshot {
    return this.transaction(() => {
    const { record, vehiclePlan, progress } = this.currentVehiclePlan(input.vehicleId);
    const vehicle = this.snapshot.decisionState.vehicles.find((candidate) => candidate.id === input.vehicleId);
    const order = this.snapshot.decisionState.orders.find((candidate) => candidate.id === input.orderId);
    const currentStop = vehiclePlan.orderedStops.find((stop) => stop.id === progress.currentStopId);
    if (!vehicle || !order || !currentStop || currentStop.kind !== "DELIVERY" || !currentStop.orderIds.includes(input.orderId)) {
      throw new DispatchError("INVALID_CURRENT_STOP", "Đơn hàng không ở điểm giao hiện tại của xe.");
    }
    if (vehicle.availability === "UNAVAILABLE") {
      throw new DispatchError("VEHICLE_UNAVAILABLE", "Xe hiện không thể thực hiện thao tác này.");
    }
    if (order.status !== "ONBOARD" || order.assignedVehicleId !== vehicle.id) {
      throw new DispatchError("INVALID_ORDER_STATE", "Đơn hàng không ở trên xe này.");
    }

    if (this.snapshot.executionState.playback?.enabled && !progress.arrived) {
      throw new DispatchError("VEHICLE_NOT_ARRIVED", "Wait until the vehicle reaches this stop.");
    }
    this.advanceActionClock();
    order.status = "DELIVERED";
    order.deliveredAt = this.snapshot.demoClock.now;
    vehicle.onboardOrderIds = vehicle.onboardOrderIds.filter((orderId) => orderId !== order.id);
    vehicle.currentLoadKg = Math.max(0, vehicle.currentLoadKg - order.demandKg);
    this.snapshot.decisionState.version += 1;
    this.advanceStop(record.id, vehiclePlan.vehicleId, vehiclePlan, progress);
    this.invalidateProposals();
    this.refreshAssessment();
    return this.getSnapshot();
    });
  }

  triggerFixtureEvent(eventId: string): DispatchSnapshot {
    return this.transaction(() => {
    if ((this.snapshot.demo.roundEventId && this.snapshot.demo.roundEventId !== eventId) || this.snapshot.decisionState.events.some((candidate) => candidate.status !== "READY_TO_TRIGGER")) {
      throw new DispatchError("EVENT_ALREADY_TRIGGERED", "Mỗi lượt demo chỉ kích hoạt một sự kiện.");
    }
    const event = this.snapshot.decisionState.events.find((candidate) => candidate.id === eventId);
    if (!event || event.status !== "READY_TO_TRIGGER") {
      throw new DispatchError("EVENT_NOT_READY", "Sự kiện chưa sẵn sàng để kích hoạt.");
    }
    this.snapshot.demoClock.now = this.advanceToEvent(this.snapshot.demoClock.now, event.fixtureEvent.timestamp);
    if (event.fixtureEvent.endTime && isAtOrAfter(this.snapshot.demoClock.now, event.fixtureEvent.endTime)) {
      throw new DispatchError("EVENT_WINDOW_EXPIRED", "Khoảng thời gian của sự kiện đã kết thúc.");
    }
    this.applyEvent(event);
    event.status = "TRIGGERED";
    this.snapshot.demo.roundEventId = event.id;
    this.snapshot.decisionState.version += 1;
    this.expireTimedEvents();
    this.invalidateProposals();
    this.markActivePlanStale(event.type);
    return this.getSnapshot();
    });
  }

  setUrgentOrderEnabled(enabled: boolean): DispatchSnapshot {
    return this.transaction(() => {
      const event = this.snapshot.decisionState.events.find((candidate) => candidate.type === "URGENT_ORDER");
      if (!event) throw new DispatchError("EVENT_NOT_READY", "No urgent event is available in this scenario.");
      if (enabled) {
        return event.status === "TRIGGERED" ? this.getSnapshot() : this.triggerFixtureEvent(event.id);
      }
      if (event.status === "READY_TO_TRIGGER") return this.getSnapshot();
      const orderId = event.fixtureEvent.orderPayload?.id;
      const order = this.snapshot.decisionState.orders.find((candidate) => candidate.id === orderId);
      if (!order || order.status !== "WAITING") {
        throw new DispatchError("URGENT_ORDER_NOT_CANCELLABLE", "The urgent order cannot be cancelled after pickup.");
      }
      this.advanceActionClock();
      this.snapshot.decisionState.orders = this.snapshot.decisionState.orders.filter((candidate) => candidate.id !== orderId);
      event.status = "READY_TO_TRIGGER";
      this.snapshot.decisionState.version += 1;
      this.invalidateProposals();
      this.markActivePlanStale("URGENT_ORDER_CANCELLED");
      return this.getSnapshot();
    });
  }

  advanceDemoClock(minutes: number): DispatchSnapshot {
    return this.transaction(() => {
    if (!Number.isFinite(minutes) || minutes < 0) {
      throw new RangeError("Số phút phải là số không âm.");
    }
    this.snapshot.demoClock.now = addMinutes(this.snapshot.demoClock.now, minutes);
    this.expireTimedEvents();
    return this.getSnapshot();
    });
  }

  importScenario(value: unknown): DispatchSnapshot {
    let id: ScenarioId;
    try { id = identifyImportedScenario(value); }
    catch { throw new DispatchError("INVALID_SCENARIO_IMPORT", "This scenario has no matching offline routes."); }
    return this.loadScenario(id);
  }

  exportScenario(): unknown { return clone(getFixtureScenario(this.snapshot.decisionState.scenarioId)); }

  setPlayback(playing: boolean, speed: number, now = Date.now()): DispatchSnapshot {
    if (![1, 10, 30, 60].includes(speed)) throw new Error("Invalid playback speed");
    if (!this.snapshot.planState.activeAcceptedPlanId) throw new DispatchError("NO_ACTIVE_PLAN", "Accept a plan first.");
    this.snapshot.executionState.playback = { enabled: true, playing, speed, lastTick: now };
    moveVehicles(this.snapshot, 0);
    return this.getSnapshot();
  }

  tickPlayback(now = Date.now()): DispatchSnapshot {
    const playback = this.snapshot.executionState.playback;
    if (!playback?.playing || now <= playback.lastTick) return this.getSnapshot();
    const minutes = Math.min(1000, now - playback.lastTick) * playback.speed / 60_000;
    playback.lastTick = now;
    this.snapshot.demoClock.now = addMinutes(this.snapshot.demoClock.now, minutes);
    moveVehicles(this.snapshot, minutes);
    const activeId = this.snapshot.executionState.activePlanId;
    const progress = activeId ? this.snapshot.executionState.progressByPlanId[activeId] : {};
    if (!this.snapshot.decisionState.vehicles.some(v => v.availability === "AVAILABLE" && progress?.[v.id]?.currentStopId)) playback.playing = false;
    this.snapshot.decisionState.version += 1;
    this.invalidateProposals();
    this.expireTimedEvents();
    return this.getSnapshot();
  }

  private createScenarioSnapshot(id: ScenarioId): DispatchSnapshot {
    const fixture = getFixtureScenario(id);
    const sourceIds: ScenarioId[] = id === "S0" ? ["S2", "S3", "S4"] : [id];
    const events = sourceIds.flatMap((sourceId) => getFixtureScenario(sourceId).events.map((fixtureEvent) => ({
      id: fixtureEvent.eventId,
      sourceScenarioId: sourceId,
      type: fixtureEvent.type,
      status: "READY_TO_TRIGGER" as const,
      fixtureEvent: clone(fixtureEvent)
    })));
    const decisionState: DecisionState = {
      sessionId: createSessionId(),
      version: fixture.initialState.stateVersion,
      scenarioId: id,
      orders: clone(fixture.initialState.orders),
      vehicles: clone(fixture.initialState.vehicles),
      locations: clone(fixture.initialState.locations),
      context: { rain: null },
      events
    };

    return {
      decisionState,
      planState: {
        acceptedPlans: [],
        activeAcceptedPlanId: null,
        proposedAlternatives: [],
        selectedAlternativeId: null,
        operationalPlanAssessment: null
      },
      executionState: { activePlanId: null, progressByPlanId: {} },
      demoClock: { now: fixture.initialState.currentTime, label: "Thời gian demo" },
      demo: { availableEvents: events.map((event) => this.toSummary(event)), roundEventId: null }
    };
  }

  private applyEvent(event: DecisionEvent): void {
    const payload = event.fixtureEvent;
    if (payload.type === "URGENT_ORDER" && payload.orderPayload) {
      this.snapshot.decisionState.orders.push(clone(payload.orderPayload));
      return;
    }
    if (payload.type === "VEHICLE_UNAVAILABLE" && payload.vehicleId) {
      const vehicle = this.snapshot.decisionState.vehicles.find((candidate) => candidate.id === payload.vehicleId);
      if (vehicle) vehicle.availability = "UNAVAILABLE";
      return;
    }
    if (payload.type === "LOCAL_RAIN_WHAT_IF" && payload.polygon && payload.endTime) {
      this.snapshot.decisionState.context.rain = { polygon: clone(payload.polygon), endsAt: payload.endTime };
    }
  }

  private advanceToEvent(currentTime: string, eventTime: string): string {
    const oneMinuteLater = addMinutes(currentTime, 1);
    return isAtOrAfter(oneMinuteLater, eventTime) ? oneMinuteLater : eventTime;
  }

  private expireTimedEvents(): void {
    const rainEvent = this.snapshot.decisionState.events.find((event) => event.type === "LOCAL_RAIN_WHAT_IF" && event.status === "TRIGGERED");
    if (rainEvent?.fixtureEvent.endTime && isAtOrAfter(this.snapshot.demoClock.now, rainEvent.fixtureEvent.endTime)) {
      rainEvent.status = "EXPIRED";
      this.snapshot.decisionState.context.rain = null;
      this.snapshot.decisionState.version += 1;
      this.invalidateProposals();
      this.markActivePlanStale("WEATHER_CONTEXT_CHANGED");
    }
  }

  private toSummary(event: DecisionEvent) {
    return {
      id: event.id,
      sourceScenarioId: event.sourceScenarioId,
      type: event.type,
      label: eventLabel(event.fixtureEvent),
      status: event.status
    };
  }

  private advanceActionClock(): void {
    this.snapshot.demoClock.now = addMinutes(this.snapshot.demoClock.now, 1);
    this.expireTimedEvents();
  }

  private transaction<T>(operation: () => T): T {
    const before = this.snapshot;
    this.snapshot = clone(before);
    try {
      return operation();
    } catch (error) {
      this.snapshot = before;
      throw error;
    }
  }

  private invalidateProposals(): void {
    this.snapshot.planState.proposedAlternatives = [];
    this.snapshot.planState.selectedAlternativeId = null;
  }

  private markActivePlanStale(reason: string): void {
    const planId = this.snapshot.planState.activeAcceptedPlanId;
    if (!planId) return;
    this.snapshot.planState.operationalPlanAssessment = {
      planId,
      status: "NEEDS_REOPTIMIZATION",
      reasons: [reason],
      assessedAgainstSessionId: this.snapshot.decisionState.sessionId,
      assessedAgainstStateVersion: this.snapshot.decisionState.version
    };
  }

  private refreshAssessment(): void {
    const current = this.snapshot.planState.operationalPlanAssessment;
    if (!current) return;
    this.snapshot.planState.operationalPlanAssessment = {
      ...current,
      assessedAgainstSessionId: this.snapshot.decisionState.sessionId,
      assessedAgainstStateVersion: this.snapshot.decisionState.version
    };
  }

  private currentVehiclePlan(vehicleId: string) {
    const planId = this.snapshot.planState.activeAcceptedPlanId;
    const record = this.snapshot.planState.acceptedPlans.find((candidate) => candidate.id === planId);
    const vehiclePlan = record?.plan.vehiclePlans.find((candidate) => candidate.vehicleId === vehicleId);
    const progress = planId ? this.snapshot.executionState.progressByPlanId[planId]?.[vehicleId] : undefined;
    if (!record || !vehiclePlan || !progress) {
      throw new DispatchError("NO_ACTIVE_PLAN", "Chưa có kế hoạch được điều phối cho xe này.");
    }
    return { record, vehiclePlan, progress };
  }

  private advanceStop(planId: string, vehicleId: string, vehiclePlan: import("../../shared/types/dispatch").VehiclePlan, progress: import("../../shared/types/dispatch").ExecutionState["progressByPlanId"][string][string]): void {
    const currentIndex = vehiclePlan.orderedStops.findIndex((stop) => stop.id === progress.currentStopId);
    if (currentIndex < 0) return;
    progress.completedStopIds = [...progress.completedStopIds, vehiclePlan.orderedStops[currentIndex].id];
    const segments = vehiclePlan.routeSegments.filter((candidate) => this.snapshot.executionState.playback?.enabled || candidate.geometrySource === "MEMBER2_SUPPLIED"
      ? candidate.toStopId === progress.currentStopId
      : candidate.fromStopId === progress.currentStopId);
    progress.completedSegmentIds = [...new Set([...progress.completedSegmentIds, ...segments.map((segment) => segment.id)])];
    progress.currentStopId = vehiclePlan.orderedStops[currentIndex + 1]?.id ?? null;
    progress.travelMinutes = 0;
    progress.arrived = vehiclePlan.orderedStops[currentIndex + 1]?.kind === "DEPOT_PICKUP";
    this.snapshot.executionState.progressByPlanId[planId][vehicleId] = progress;
  }
}

export function isDispatchSnapshot(value: unknown): value is DispatchSnapshot {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<DispatchSnapshot>;
  const decision = candidate.decisionState;
  const plan = candidate.planState;
  const execution = candidate.executionState;
  const hasFuelMetric = (content: { metrics?: { fuelCostVnd?: unknown } } | undefined) =>
    typeof content?.metrics?.fuelCostVnd === "number" && Number.isFinite(content.metrics.fuelCostVnd);
  return Boolean(
    decision &&
    typeof decision.sessionId === "string" &&
    typeof decision.version === "number" &&
    typeof decision.scenarioId === "string" &&
    Array.isArray(decision.orders) &&
    Array.isArray(decision.vehicles) &&
    Array.isArray(decision.locations) &&
    Array.isArray(decision.events) &&
    decision.events.every((event) => event && typeof event.id === "string" && typeof event.status === "string" && event.fixtureEvent) &&
    decision.context && typeof decision.context === "object" &&
    plan &&
    Array.isArray(plan.acceptedPlans) &&
    plan.acceptedPlans.every((record) => record && hasFuelMetric(record.plan)) &&
    Array.isArray(plan.proposedAlternatives) &&
    plan.proposedAlternatives.every((proposal) => proposal && hasFuelMetric(proposal.content)) &&
    (plan.activeAcceptedPlanId === null || typeof plan.activeAcceptedPlanId === "string") &&
    execution &&
    typeof execution.progressByPlanId === "object" &&
    candidate.demoClock &&
    typeof candidate.demoClock.now === "string" &&
    candidate.demo && typeof candidate.demo === "object" &&
    (candidate.demo.roundEventId == null || (typeof candidate.demo.roundEventId === "string" && decision.events.some((event) => event.id === candidate.demo?.roundEventId)))
  );
}
