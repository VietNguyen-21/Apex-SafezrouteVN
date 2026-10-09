import { distinctOfflineProposals } from "./profileOutcomes";
import { DemoControls } from "./DemoControls";
import { useState, useEffect, useRef } from "react";
import React from "react";
import {
  Zap,
  RefreshCw,
  Check,
  Bell,
  ChevronDown,
  Map,
  Navigation,
  CloudRain,
  ShieldCheck,
  Clock,
  Scale,
  Activity,
  Truck,
} from "lucide-react";
import { DispatchMap } from "../shared/components/DispatchMap";
import { confirmedEvents } from "../integrations/member3/events";
import { adminVehicleColor, createAdminMapPresentation } from "./adminMapPresentation";
import { RouteVisibilityControls } from "./RouteVisibilityControls";
import type { ImmutablePlanContent, PlanProfile } from "../shared/types/dispatch";
import { useDispatch, useDispatchPresentation } from "../app/DispatchContext";
import { LABELS as L } from "./admin.labels";
import { terminalComparison, comparisonCanRank } from "../integrations/member3/jobViewAdapter";
import { sameBasis, proposalCurrency, canAcceptSelectedPlan } from "../integrations/member3/revision";
import { comparisonMetrics, executionMetrics, formatMetric } from "../integrations/member3/metricsAdapter";

const profiles: PlanProfile[] = ["FASTEST", "BALANCED", "SAFER"];

const isOffline = (plan?: ImmutablePlanContent) => plan?.provenance.source === "Member 2 offline runtime";
const exposureText = (plan: ImmutablePlanContent) => `${(plan.metrics.exposureScore / 100).toFixed(2)}${isOffline(plan) ? "" : "x"}`;

const PROFILE_DESC: Record<PlanProfile, string> = {
  FASTEST: "Minimize total travel time",
  BALANCED: "Best overall performance",
  SAFER: "Minimize weather & traffic risk",
};

const PROFILE_ICON: Record<PlanProfile, React.ReactElement> = {
  FASTEST: <Zap size={15} strokeWidth={2} style={{ color: "var(--color-primary)" }} />,
  BALANCED: <Scale size={15} strokeWidth={2} style={{ color: "var(--color-primary)" }} />,
  SAFER: <ShieldCheck size={15} strokeWidth={2} style={{ color: "var(--color-success)" }} />,
};

/* Vehicle accent colours (match map route colours) */
const vehicleColor = adminVehicleColor;

/* Simple iOS-style toggle switch */
function ToggleSwitch({
  checked,
  onTrigger,
  id,
  label,
  disabled,
  title,
}: {
  checked: boolean;
  onTrigger: () => void;
  id: string;
  label: string;
  disabled: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={title}
      id={id}
      className={`toggle-switch ${checked ? "toggle-on" : ""}`}
      disabled={disabled}
      onClick={onTrigger}
    />
  );
}

export function AdminPage() {
  const { api, snapshot, pending, error, invoke } = useDispatch();
  const { getCustomerInfo, getDriverInfo } = useDispatchPresentation();
  const [costWeight, setCostWeight] = useState(30);
  const [punctualityWeight, setPunctualityWeight] = useState(40);
  const [safetyWeight, setSafetyWeight] = useState(30);
  const [routeView, setRouteView] = useState<{ sessionId: string | null; visibility: Record<string, boolean> }>({ sessionId: null, visibility: {} });

  /* Per-vehicle capacity state */
  const [capacities, setCapacities] = useState<Record<string, number>>({});
  /* Draft (string) values for each input while typing */
  const [capDrafts, setCapDrafts] = useState<Record<string, string>>({});
  /* Set to true if draft is invalid (NaN / out of range) */
  const [capInvalid, setCapInvalid] = useState<Record<string, boolean>>({});

  function handleCapChange(vid: string, raw: string) {
    setCapDrafts((prev) => ({ ...prev, [vid]: raw }));
    const n = parseInt(raw, 10);
    if (!raw || isNaN(n) || n < 1 || n > 200) {
      setCapInvalid((prev) => ({ ...prev, [vid]: true }));
    } else {
      setCapInvalid((prev) => ({ ...prev, [vid]: false }));
      setCapacities((prev) => ({ ...prev, [vid]: n }));
    }
  }

  /* Priority selector for Order Entry form */
  const [orderPriority, setOrderPriority] = useState<'Normal' | 'Urgent'>('Normal');

  if (!snapshot) return <main className="page-loading" role={error ? "alert" : undefined}>{error ?? "Loading dispatch workspace…"}{error && <button type="button" disabled={pending} onClick={() => void invoke(() => api.getSnapshot())}>Retry connection</button>}</main>;
  const backend = snapshot.backend;
  const comparison = backend?.comparison;
  const comparisonRunning = Boolean(comparison && !terminalComparison(comparison));
  const optimizeDisabled = pending || Boolean(backend && (backend.stale || !backend.capabilities?.optimize || comparisonRunning));
  const phaseControlsDisabled = pending || Boolean(backend);

  const selected = snapshot.planState.proposedAlternatives.find(
    (plan) => plan.id === snapshot.planState.selectedAlternativeId
  );
  const selectedPlan = selected?.content;
  const acceptDisabled = pending || !canAcceptSelectedPlan(snapshot);
  const active = snapshot.planState.acceptedPlans.find(
    (plan) => plan.id === snapshot.planState.activeAcceptedPlanId
  );
  const hasAcceptedPlan = backend ? Boolean(snapshot.planState.acceptedExecution) : Boolean(active);
  const assessment = snapshot.planState.operationalPlanAssessment;
  const routeVisibility = routeView.sessionId === snapshot.decisionState.sessionId ? routeView.visibility : {};
  const adminMap = createAdminMapPresentation(snapshot, selected, Object.keys(routeVisibility).filter((id) => routeVisibility[id]));
  const mapPlan = adminMap.source === "PROPOSED" ? selected?.content : adminMap.source === "ACCEPTED" ? active?.plan : undefined;
  const toggleVehicleRoute = (id: string) => setRouteView((current) => {
    const visibility = current.sessionId === snapshot.decisionState.sessionId ? current.visibility : {};
    return { sessionId: snapshot.decisionState.sessionId, visibility: { ...visibility, [id]: !visibility[id] } };
  });

  const availableVehiclesCount = snapshot.decisionState.vehicles.filter(
    (v) => v.availability === "AVAILABLE"
  ).length;
  const totalVehiclesCount = snapshot.decisionState.vehicles.length;
  const currentCapacities = snapshot.decisionState.vehicles.map((vehicle) => capacities[vehicle.id] ?? vehicle.capacityKg);
  const totalCapacity = currentCapacities.reduce((sum, capacity) => sum + capacity, 0);
  const totalOrdersCount = snapshot.decisionState.orders.length;
  const optimizedOrdersCount = backend
    ? hasAcceptedPlan ? backend.executionView.delivered_prefix.length + backend.executionView.planned_served_suffix.length : 0
    : active ? totalOrdersCount - active.plan.unserved.length : 0;
  const hasProposals = snapshot.planState.proposedAlternatives.length > 0;
  const comparisonProposals = backend ? snapshot.planState.proposedAlternatives : distinctOfflineProposals(snapshot.planState.proposedAlternatives);
  const roundEventId = snapshot.demo.roundEventId ?? snapshot.demo.availableEvents.find((event) => event.status !== "READY_TO_TRIGGER")?.id;
  const eventRoundUsed = Boolean(roundEventId);
  const eventByType = (type: "URGENT_ORDER" | "VEHICLE_UNAVAILABLE" | "LOCAL_RAIN_WHAT_IF") =>
    snapshot.demo.availableEvents.find((event) => event.type === type);
  const urgentEvent = eventByType("URGENT_ORDER");
  const urgentOn = urgentEvent?.status === "TRIGGERED";
  const urgentOrderId = snapshot.decisionState.events.find((event) => event.type === "URGENT_ORDER")?.fixtureEvent.orderPayload?.id;
  const urgentOrder = snapshot.decisionState.orders.find((order) => order.id === urgentOrderId);
  const urgentLocked = urgentOn && urgentOrder?.status !== "WAITING";
  const triggerEvent = (type: "URGENT_ORDER" | "VEHICLE_UNAVAILABLE" | "LOCAL_RAIN_WHAT_IF") => {
    const event = eventByType(type);
    if (event?.status === "READY_TO_TRIGGER" && !eventRoundUsed) {
      void invoke(() => api.triggerFixtureEvent(event.id));
    }
  };

  /* KPI deltas */
  const activeETA = active?.plan.metrics.durationMinutes;
  const selectedETA = selectedPlan?.metrics.durationMinutes;
  const etaDelta = activeETA != null && selectedETA != null ? selectedETA - activeETA : null;

  const activeOnTime = active?.plan.metrics.onTimeRate;
  const selectedOnTime = selectedPlan?.metrics.onTimeRate;
  const onTimeDelta = activeOnTime != null && selectedOnTime != null ? selectedOnTime - activeOnTime : null;

  const activeFuel = active?.plan.metrics.fuelCostVnd ?? null;
  const selectedFuel = selectedPlan?.metrics.fuelCostVnd ?? null;
  const mixedCostScopes = Boolean(active && selectedPlan && isOffline(active.plan) !== isOffline(selectedPlan));
  const fuelDelta = !mixedCostScopes && activeFuel != null && selectedFuel != null ? selectedFuel - activeFuel : null;

  const activeRisk = active ? (active.plan.metrics.exposureScore / 100).toFixed(2) : null;
  const selectedRisk = selectedPlan ? (selectedPlan.metrics.exposureScore / 100).toFixed(2) : null;
  const riskDelta =
    active && selectedPlan && isOffline(active.plan) === isOffline(selectedPlan)
      ? (selectedPlan.metrics.exposureScore - active.plan.metrics.exposureScore) / 100
      : null;

  return (
    <main className="admin-page" data-session-id={snapshot.decisionState.sessionId} data-dispatch-source={snapshot.backend?.source ?? "MOCK"} data-execution-mode={snapshot.backend?.executionMode} data-comparison-id={comparison?.comparison_id} data-comparison-status={comparison?.status} data-basis={snapshot.backend ? JSON.stringify(snapshot.backend.basis) : undefined} data-current-time={snapshot.backend?.executionView.current_time} data-active-job-id={snapshot.backend?.executionView.active_job_id ?? undefined} data-stale={snapshot.backend?.stale ? "true" : "false"}>
      <h1 className="sr-only">SafeRoute VN Dispatcher Workspace (Điều phối)</h1>

      {/* ── Top Navigation Bar ── */}
      <header className="app-header">
        <div className="brand-group">
          <div className="brand-icon" aria-hidden="true">
            {/* Compass / NavPin logo */}
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="white" strokeWidth="1.5" />
              <path
                d="M12 2v2M12 20v2M2 12h2M20 12h2"
                stroke="rgba(255,255,255,0.5)"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
              <path
                d="M12 7l2.5 5-5 2L12 7z"
                fill="#60a5fa"
                stroke="white"
                strokeWidth="0.8"
                strokeLinejoin="round"
              />
              <path
                d="M12 17l-2.5-5 5-2L12 17z"
                fill="rgba(255,255,255,0.25)"
                stroke="rgba(255,255,255,0.4)"
                strokeWidth="0.8"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <div className="brand-text">
            <strong>{L.brandName}</strong>
            <small>{L.brandSlogan}</small>
          </div>
        </div>

        <div className="header-meta">
          <div className="dispatch-status-badge">
            <span className="live-dot pulse" />
            <span className="status-title">
              {hasAcceptedPlan ? L.statusAfterOptimize : L.statusBeforeOptimize}
            </span>
          </div>

          <div className="clock-display" title={snapshot.backend ? `${snapshot.backend.executionMode} · M3 session ${snapshot.decisionState.sessionId}` : "Demo time"}>
            <Clock size={13} strokeWidth={2} />
            <span>Demo time: {snapshot.demoClock.now}</span>
          </div>

          <button className="icon-badge-btn" aria-label={L.notificationsLabel} title={L.notificationsLabel}>
            <Bell size={15} strokeWidth={2} />
          </button>

          <div className="admin-user-pill">
            <span className="avatar">AD</span>
            <div className="admin-name">
              <b>{L.adminName}</b>
              <small>{L.adminRole}</small>
            </div>
            <ChevronDown size={12} strokeWidth={2} className="dropdown-arrow" />
          </div>
        </div>
      </header>

      {/* ── Banners ── */}
      {(assessment?.status === "NEEDS_REOPTIMIZATION" || backend?.needsReoptimization) && (
        <div className="stale-banner" role="status">
          <span className="banner-icon">⚠</span>
          <span>Current plan needs re-optimization due to order, weather or vehicle changes.</span>
        </div>
      )}
      {error && (
        <div className="error-banner" role="alert">
          <span className="banner-icon">✕</span>
          <span>{error}</span>
        </div>
      )}

      {/* ── Main 3-Column × 2-Row Workspace ── */}
      <div className="admin-layout">

        {/* ════════════════════════════════════════
            LEFT SIDEBAR
        ════════════════════════════════════════ */}
        <aside className="admin-sidebar">
          {/* Scrollable content area */}
          <div className="sidebar-scroll">

          {/* ① Order Entry */}
          <section className="panel card-order-entry">
            <div className="panel-title">
              <div className="title-with-badge">
                <span className="section-number">①</span>
                <h2>{L.orderEntry}</h2>
              </div>
              <button
                className="add-order-btn"
                disabled
                title="Pending Member 3 API"
                style={{ fontSize: "11px", opacity: 0.75, cursor: "not-allowed", padding: "4px 8px" }}
              >
                + Add Order (Pending Member 3 API)
              </button>
            </div>

            {/* 4-row form matching mockup */}
            <div className="order-entry-form">
              {/* Row 1: Order ID | Pickup Location */}
              <div className="form-row-2">
                <label>
                  <span>{L.orderIdLabel}</span>
                  <input type="text" readOnly value="ORD-0152" className="mock-input" />
                </label>
                <label>
                  <span>{L.pickupLocationLabel}</span>
                  <div className="mock-select">
                    <input
                      type="text"
                      readOnly
                      value="Kho SafeRoute, Thủ Đức"
                      className="mock-input"
                      title="Kho SafeRoute, Thủ Đức"
                    />
                    <ChevronDown size={11} className="select-chevron" />
                  </div>
                </label>
              </div>
              {/* Row 2: Delivery Location (plain text, no chevron) | Ready Time */}
              <div className="form-row-2">
                <label>
                  <span>{L.deliveryLocationLabel}</span>
                  <input
                    type="text"
                    readOnly
                    value="245 Điện Biên Phủ, Bình Thạnh"
                    className="mock-input"
                    placeholder="Enter delivery address"
                    title="245 Điện Biên Phủ, P.15, Q. Bình Thạnh, TP.HCM"
                    style={{ textOverflow: 'ellipsis' }}
                  />
                </label>
                <label>
                  <span>{L.readyTimeLabel}</span>
                  <input type="text" readOnly value="14:00" className="mock-input" />
                </label>
              </div>
              {/* Row 3: Delivery Time Window | Weight | Priority (dropdown with chevron) */}
              <div className="form-row-3">
                <label>
                  <span className="label-nowrap">{L.deliveryTimeWindowLabel}</span>
                  <input type="text" readOnly value="16:00–18:00" className="mock-input" />
                </label>
                <label>
                  <span>{L.weightLabel}</span>
                  <div className="mock-weight">
                    <input type="text" readOnly value="24" className="mock-input" />
                    <span className="weight-unit">kg</span>
                  </div>
                </label>
                <label>
                  <span>{L.priorityLabel}</span>
                  <div className="mock-select">
                    <select
                      className="mock-input"
                      value={orderPriority}
                      onChange={(e) => setOrderPriority(e.target.value as 'Normal' | 'Urgent')}
                      style={{ cursor: 'pointer', paddingRight: '20px' }}
                    >
                      <option value="Normal">Normal</option>
                      <option value="Urgent">Urgent</option>
                    </select>
                    <ChevronDown size={11} className="select-chevron" />
                  </div>
                </label>
              </div>
              {/* Row 4: Primary | Notes */}
              <div className="form-row-2">
                <label>
                  <span>{L.primaryLabel}</span>
                  <input type="text" readOnly value="Normal" className="mock-input" />
                </label>
                <label>
                  <span>{L.notesLabel}</span>
                  <input
                    type="text"
                    readOnly
                    value="Liên hệ điện thoại"
                    className="mock-input"
                    placeholder="Notes (optional)"
                  />
                </label>
              </div>
            </div>

            {/* Current Queue */}
            <div className="current-queue-header">
              <h3>{L.currentQueue(snapshot.decisionState.orders.length)}</h3>
            </div>
            <div className="order-queue">
              {snapshot.decisionState.orders.map((order) => {
                const info = getCustomerInfo(order.id);
                // If Priority dropdown is Urgent, mark newly added order (ORD-0152) as urgent-styled
                const isUrgent = order.priority >= 3 || (orderPriority === 'Urgent' && order.id === 'ORD-0152');
                const parts = info.address.split(",");
                const area = parts[1]?.trim() || parts[0]?.trim() || "Thủ Đức";
                return (
                  <div key={order.id} className={`order-row ${isUrgent ? "row-urgent" : ""}`}>
                    <span className="order-id-badge">{order.id}</span>
                    <span className="customer-name" title={info.name + " — " + info.address}>
                      {info.name} — {area}
                    </span>
                    <span className="order-time">{info.timeWindow}</span>
                    <span className={isUrgent ? "priority-badge urgent" : "priority-badge normal"}>
                      {isUrgent ? L.priorityUrgent : L.priorityNormal}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>

          {/* ② Fleet / Preferences */}
          <section className="panel card-fleet">
            <div className="panel-title">
              <div className="title-with-badge">
                <span className="section-number">②</span>
                <h2>{L.fleetPreferences}</h2>
              </div>
              <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                <span className="demo-data-badge">{snapshot.backend ? "Simulated replay" : "Demo data"}</span>
                <span className="status-chip">
                  {L.availableChip(availableVehiclesCount, totalVehiclesCount)}
                </span>
              </div>
            </div>

            {/* Row 1: Drivers/Vehicles + Vehicle Type */}
            <div className="fleet-dropdowns">
              <label className="fleet-field">
                <span className="fleet-label">{L.driversVehicles}</span>
                <select className="fleet-select">
                  <option>{availableVehiclesCount} / {totalVehiclesCount}</option>
                </select>
              </label>
              <label className="fleet-field">
                <span className="fleet-label">{L.vehicleType}</span>
                <select className="fleet-select">
                  <option>{L.vehicleTypeValue}</option>
                </select>
              </label>
            </div>

            {/* Row 2: Capacity per vehicle */}
            <div className="capacity-row">
              <span className="capacity-row-label">Capacity per vehicle</span>
              <div className="capacity-inputs-grid">
                {snapshot.decisionState.vehicles.map((v) => {
                  const color = vehicleColor(v.id);
                  const invalid = !!capInvalid[v.id];
                  return (
                    <div key={v.id} className="capacity-input-cell">
                      <div className="capacity-cell-label">
                        <span className="cap-dot" style={{ background: color }} />
                        <span className="cap-vid">{v.id}</span>
                      </div>
                      <div className={`capacity-input-wrap${invalid ? ' invalid' : ''}`}>
                        <input
                          type="number"
                          min={1}
                          max={200}
                          value={capDrafts[v.id] ?? String(v.capacityKg)}
                          aria-label={`Capacity ${v.id}`}
                          onChange={(e) => handleCapChange(v.id, e.target.value)}
                        />
                        <span className="capacity-kg-suffix">kg</span>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="capacity-total">Total capacity: {totalCapacity} kg</div>
              {/* Warning chip: total order weight > total capacity OR single order > all caps */}
              {(() => {
                const totalOrderWeight = snapshot.decisionState.orders.reduce((sum, o) => sum + o.demandKg, 0);
                const minCap = Math.min(...currentCapacities);
                const heaviestOrder = Math.max(...snapshot.decisionState.orders.map(o => o.demandKg), 0);
                if (totalOrderWeight > totalCapacity) {
                  return <div className="capacity-warning-chip">⚠ Total orders ({totalOrderWeight} kg) exceed fleet capacity ({totalCapacity} kg)</div>;
                }
                if (heaviestOrder > 0 && heaviestOrder > minCap) {
                  return <div className="capacity-warning-chip">⚠ Order ({heaviestOrder} kg) exceeds smallest vehicle capacity ({minCap} kg)</div>;
                }
                return null;
              })()}
            </div>

            <div className="preference-sliders">
              <label className="slider-group">
                <div className="slider-header">
                  <span>{L.costImportance}</span>
                  <b>{costWeight}%</b>
                </div>
                <input
                  aria-label="Cost weight"
                  type="range" min="0" max="100"
                  value={costWeight}
                  className="slider-input slider-cost"
                  style={{ '--pct': `${costWeight}%` } as React.CSSProperties}
                  onChange={(e) => setCostWeight(Number(e.target.value))}
                />
              </label>
              <label className="slider-group">
                <div className="slider-header">
                  <span>{L.punctualityImportance}</span>
                  <b>{punctualityWeight}%</b>
                </div>
                <input
                  aria-label="Punctuality weight"
                  type="range" min="0" max="100"
                  value={punctualityWeight}
                  className="slider-input slider-success"
                  style={{ '--pct': `${punctualityWeight}%` } as React.CSSProperties}
                  onChange={(e) => setPunctualityWeight(Number(e.target.value))}
                />
              </label>
              <label className="slider-group">
                <div className="slider-header">
                  <span>{L.safetyImportance}</span>
                  <b>{safetyWeight}%</b>
                </div>
                <input
                  aria-label="Safety weight"
                  type="range" min="0" max="100"
                  value={safetyWeight}
                  className="slider-input slider-success"
                  style={{ '--pct': `${safetyWeight}%` } as React.CSSProperties}
                  onChange={(e) => setSafetyWeight(Number(e.target.value))}
                />
              </label>
            </div>
          </section>

            {/* ③ Context & Events */}
            <section className="panel card-context">
              <div className="panel-title">
                <div className="title-with-badge">
                  <span className="section-number">③</span>
                  <h2>{L.contextEvents}</h2>
                </div>
                <span className="live-pill">
                  <span className="live-dot pulse" />
                  Demo time
                </span>
              </div>

              {/* Decision Epoch row with Demo time */}
              <div className="epoch-row">
                <div className="epoch-left">
                  <Clock size={12} strokeWidth={2} className="epoch-icon" />
                  <span className="epoch-label">Demo time:</span>
                </div>
                <span className="epoch-value live-value">{snapshot.demoClock.now}</span>
                <div className="epoch-controls" style={{ display: "flex", gap: "4px", marginLeft: "auto" }}>
                  <button
                    type="button"
                    className="epoch-advance-btn"
                    title="Advance clock by 10 minutes"
                    disabled={phaseControlsDisabled}
                    onClick={() => void invoke(() => api.advanceDemoClock(10))}
                  >
                    +10m
                  </button>
                  <button
                    type="button"
                    className="epoch-advance-btn"
                    title="Advance clock by 30 minutes"
                    disabled={phaseControlsDisabled}
                    onClick={() => void invoke(() => api.advanceDemoClock(30))}
                  >
                    +30m
                  </button>
                </div>
              </div>

              {/* Event Toggles — clean, no scenario code shown */}
              <div className="event-toggles">
                {backend ? <>
                  {confirmedEvents(backend.pendingEvents, backend.replayHistory).length === 0 && <p>No pending events. History includes the last 100 receipts.</p>}
                  {confirmedEvents(backend.pendingEvents, backend.replayHistory).map(event => <div className="toggle-row" key={event.event_id}>
                    <span className="toggle-label">{event.event_type === "URGENT_ORDER" ? L.urgentOrder : event.event_type === "VEHICLE_UNAVAILABLE" ? L.driverUnavailable : L.localRain}
                      {!event.applied && !event.apply_allowed && <small style={{ display: "block" }}>{event.timestamp}</small>}
                    </span>
                    <button className="epoch-advance-btn" type="button" aria-label={`Apply ${event.event_type}`} data-event-id={event.event_id}
                      disabled={pending || backend.stale || backend.mutationPending || !backend.capabilities?.applyEvent || event.applied || !event.apply_allowed}
                      onClick={() => void invoke(() => api.triggerFixtureEvent(event.event_id))}>
                      {event.applied ? "Applied" : event.apply_allowed ? "Apply" : "Not due"}
                    </button>
                  </div>)}
                </> : <>
                <div className="toggle-row">
                  <span className="toggle-label">{L.urgentOrder}</span>
                  <ToggleSwitch
                    id="toggle-urgent"
                    label={L.urgentOrder}
                    checked={urgentOn}
                    disabled={phaseControlsDisabled || !urgentEvent || (eventRoundUsed && roundEventId !== urgentEvent.id) || urgentLocked}
                    title={urgentLocked ? "The urgent order cannot be cancelled after pickup." : "Add or cancel the waiting urgent order"}
                    onTrigger={() => void invoke(() => api.setUrgentOrderEnabled(!urgentOn))}
                  />
                </div>
                <div className="toggle-row">
                  <span className="toggle-label">{L.driverUnavailable}</span>
                  <ToggleSwitch
                    id="toggle-driver"
                    label={L.driverUnavailable}
                    checked={eventByType("VEHICLE_UNAVAILABLE")?.status === "TRIGGERED"}
                    disabled={phaseControlsDisabled || eventRoundUsed || !eventByType("VEHICLE_UNAVAILABLE")}
                    onTrigger={() => triggerEvent("VEHICLE_UNAVAILABLE")}
                  />
                </div>
                <div className="toggle-row">
                  <span className="toggle-label">{L.localRain}</span>
                  <ToggleSwitch
                    id="toggle-rain"
                    label={L.localRain}
                    checked={eventByType("LOCAL_RAIN_WHAT_IF")?.status === "TRIGGERED"}
                    disabled={phaseControlsDisabled || eventRoundUsed || !eventByType("LOCAL_RAIN_WHAT_IF")}
                    onTrigger={() => triggerEvent("LOCAL_RAIN_WHAT_IF")}
                  />
                </div>
                </>}
              </div>

              {!backend && <DemoControls />}
              {/* Demo tools — collapsed by default */}
              <details className="scenario-collapsible">
                <summary className="scenario-summary">
                  <span>Demo tools</span>
                  <ChevronDown size={12} strokeWidth={2} />
                </summary>
                <div className="scenario-body">
                  <select
                    className="fleet-select"
                    disabled={pending}
                    value={snapshot.decisionState.scenarioId}
                    onChange={(ev) =>
                      void invoke(() =>
                        api.loadScenario(ev.target.value as "S0" | "S1" | "S2" | "S3" | "S4")
                      )
                    }
                  >
                    {(backend ? (backend.scenarios ?? []).map(s => [s.id, `${s.id} — ${s.orderCount} orders, ${s.vehicleCount} vehicles · ${s.initialTime}`]) : Object.entries(L.scenarios)).map(([key, label]) => (
                      <option key={key} value={key}>{label}</option>
                    ))}
                  </select>
                  <button
                    className="text-button reset-button"
                    disabled={phaseControlsDisabled}
                    onClick={() => void invoke(() => api.resetDemoSession())}
                  >
                    Reset demo to S0
                  </button>
                </div>
              </details>
            </section>
          </div>{/* end sidebar-scroll */}

          {/* ── Sticky Action Bar (horizontal) ── */}
          <div className="sidebar-cta sidebar-cta-row">
            {hasProposals ? (
              <>
                <button
                  className="cta-btn cta-reoptimize"
                  aria-label={L.reoptimize}
                  disabled={optimizeDisabled}
                  onClick={() => void invoke(() => api.optimize())}
                >
                  <RefreshCw size={14} strokeWidth={2} />
                  {L.reoptimize}
                </button>
                <button
                  className="cta-btn cta-accept"
                  aria-label={L.acceptSelectedPlan}
                  disabled={acceptDisabled}
                  onClick={() => void invoke(() => api.acceptSelectedPlan())}
                >
                  <Check size={14} strokeWidth={2} />
                  {L.acceptSelectedPlan}
                </button>
              </>
            ) : (
              <>
                <button
                  className="cta-btn cta-optimize"
                  aria-label={L.optimize}
                  disabled={optimizeDisabled}
                  onClick={() => void invoke(() => api.optimize())}
                >
                  <Zap size={14} strokeWidth={2} />
                  {L.optimize}
                </button>
                <button className="cta-btn cta-reoptimize" disabled>
                  <RefreshCw size={14} strokeWidth={2} />
                  {L.reoptimize}
                </button>
              </>
            )}
          </div>
        </aside>

        {/* ════════════════════════════════════════
            CENTER (row1+row2, col2)
        ════════════════════════════════════════ */}
        <section className="admin-center">
          {/* Center Header */}
          <div className="center-header">
            <div className="center-title-group">
              <Map size={20} strokeWidth={2} className="center-map-icon" />
              <div>
                <h2>{L.liveDispatchTitle}</h2>
                <p>{L.liveDispatchSubtitle}{mapPlan?.provenance.computedAt && (
                  <span aria-label="Source forecast time" title="Static offline forecast; separate from Demo time.">
                    {" · Source forecast: "}<time dateTime={mapPlan.provenance.computedAt}>{mapPlan.provenance.computedAt.replace("T", " ").replace(/(\+\d{2}:\d{2}|Z)$/, " $1")}</time>
                  </span>
                )}</p>
              </div>
            </div>
          </div>

          {/* 6 KPI Cards */}
          <div className="kpi-strip">
            {/* TOTAL ORDERS */}
            <div className="kpi-card">
              <span className="kpi-label">{L.kpiTotalOrders}</span>
              <div className="kpi-value-row">
                <strong>{totalOrdersCount}</strong>
                <span className={`kpi-badge ${optimizedOrdersCount ? "success" : "neutral"}`}>
                  {L.kpiOptimized(optimizedOrdersCount)}
                </span>
              </div>
            </div>

            {/* ACTIVE VEHICLES */}
            <div className="kpi-card">
              <span className="kpi-label">{L.kpiActiveVehicles}</span>
              <div className="kpi-value-row">
                <strong style={{ whiteSpace: "nowrap" }}>
                  {availableVehiclesCount}&nbsp;/&nbsp;{totalVehiclesCount}
                </strong>
                <span
                  className={`kpi-badge ${
                    availableVehiclesCount < totalVehiclesCount ? "warn" : "success"
                  }`}
                >
                  {availableVehiclesCount === totalVehiclesCount
                    ? L.kpiAllAvailable
                    : L.kpiVehicleIssue}
                </span>
              </div>
            </div>

            {/* EST. TOTAL TRAVEL TIME */}
            <div className="kpi-card">
              <span className="kpi-label">{isOffline(active?.plan) ? "Fleet travel time" : L.kpiEstTravelTime}</span>
              <div className="kpi-value-row">
                <strong>{activeETA != null ? `${activeETA} min` : "\u2014"}</strong>
                {etaDelta != null && (
                  <span className={`kpi-diff ${etaDelta <= 0 ? "positive" : "negative"}`}>
                    {etaDelta <= 0 ? "" : "+"}
                    {etaDelta.toFixed(1)} min
                  </span>
                )}
              </div>
            </div>

            {/* ON-TIME DELIVERY RATE */}
            <div className="kpi-card">
              <span className="kpi-label">{L.kpiOnTimeRate}</span>
              <div className="kpi-value-row">
                <strong>{activeOnTime != null ? `${activeOnTime}%` : "\u2014"}</strong>
                {onTimeDelta != null && (
                  <span className={`kpi-diff ${onTimeDelta >= 0 ? "positive" : "negative"}`}>
                    {onTimeDelta >= 0 ? "+" : ""}
                    {onTimeDelta}%
                  </span>
                )}
              </div>
            </div>

            {/* FUEL COST (EST.) */}
            <div className="kpi-card">
              <span className="kpi-label">{isOffline(active?.plan) ? "Route cost (est.)" : L.kpiFuelCost}</span>
              <div className="kpi-value-row">
                <strong style={{ fontSize: "16px" }}>
                  {activeFuel != null ? `${activeFuel.toLocaleString("en-US", { maximumFractionDigits: 0 })} VND` : "\u2014"}
                </strong>
                {fuelDelta != null && (
                  <span className={`kpi-diff ${fuelDelta <= 0 ? "positive" : "negative"}`}>
                    {fuelDelta <= 0 ? "" : "+"}
                    {Math.round(Math.abs(fuelDelta) / 1000)}K
                  </span>
                )}
              </div>
            </div>

            {/* RELATIVE SAFETY EXPOSURE */}
            <div className="kpi-card">
              <span className="kpi-label">{isOffline(active?.plan) ? "Exposure proxy" : L.kpiSafetyExposure}</span>
              <div className="kpi-value-row">
                <strong style={{ fontSize: "20px" }}>
                  {activeRisk != null && active ? exposureText(active.plan) : "\u2014"}
                </strong>
                {riskDelta != null && (
                  <span className={`kpi-diff ${riskDelta <= 0 ? "positive" : "negative"}`}>
                    {riskDelta <= 0 ? "" : "+"}
                    {riskDelta.toFixed(2)}{isOffline(active?.plan) ? "" : "x"}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Map */}
          <DispatchMap snapshot={snapshot} proposed={selected} scene={adminMap.scene} />

          {/* Before / After Event Comparison */}
          <section className="panel comparison">
            <div className="panel-title">
              <div className="title-with-badge">
                <span className="section-number">④</span>
                <h2>{L.comparisonTitle}</h2>
              </div>
              <span className="demo-data-badge">{snapshot.backend ? "Simulated replay" : L.comparisonDemoData}</span>
            </div>

            <div className="comparison-table-wrapper">
              <table className="comparison-table">
                <thead>
                  <tr>
                    <th>{L.colMetric}</th>
                    <th>{L.colBefore}</th>
                    <th>{L.colAfter}</th>
                    <th>{L.colChange}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>{isOffline(active?.plan) || isOffline(selected?.content) ? "Fleet travel time" : L.metricTravelTime}</td>
                    <td>{active ? `${active.plan.metrics.durationMinutes} min` : L.notSelected}</td>
                    <td className="after-col">
                      {selectedPlan ? `\u2192 ${selectedPlan.metrics.durationMinutes} min` : L.notSelected}
                    </td>
                    <td>
                      {selectedPlan && active ? (
                        <span className="diff-pill green">
                          {(selectedPlan.metrics.durationMinutes - active.plan.metrics.durationMinutes).toFixed(1)} min
                        </span>
                      ) : (
                        L.notSelected
                      )}
                    </td>
                  </tr>
                  <tr>
                    <td>{L.metricDistance}</td>
                    <td>{active ? `${active.plan.metrics.distanceKm.toFixed(1)} km` : L.notSelected}</td>
                    <td className="after-col">
                      {selectedPlan
                        ? `\u2192 ${selectedPlan.metrics.distanceKm.toFixed(1)} km`
                        : L.notSelected}
                    </td>
                    <td>
                      {selectedPlan && active ? (
                        <span className="diff-pill green">
                          {(selectedPlan.metrics.distanceKm - active.plan.metrics.distanceKm).toFixed(1)} km
                        </span>
                      ) : (
                        L.notSelected
                      )}
                    </td>
                  </tr>
                  <tr>
                    <td>{mixedCostScopes ? "Cost (different scopes)" : isOffline(active?.plan) || isOffline(selected?.content) ? "Route cost (est.)" : L.metricFuelCost}</td>
                    <td>
                      {active ? `${active.plan.metrics.fuelCostVnd.toLocaleString("en-US", { maximumFractionDigits: 0 })} VND` : L.notSelected}
                      {mixedCostScopes && (isOffline(active?.plan) ? " (route estimate)" : " (fuel estimate)")}
                    </td>
                    <td className="after-col">
                      {selectedPlan ? `\u2192 ${selectedPlan.metrics.fuelCostVnd.toLocaleString("en-US", { maximumFractionDigits: 0 })} VND` : L.notSelected}
                      {mixedCostScopes && (isOffline(selected?.content) ? " (route estimate)" : " (fuel estimate)")}
                    </td>
                    <td>
                      {fuelDelta != null ? (
                        <span className="diff-pill green">
                          {fuelDelta.toLocaleString("en-US", { maximumFractionDigits: 0 })} VND
                        </span>
                      ) : (
                        L.notSelected
                      )}
                    </td>
                  </tr>
                  <tr>
                    <td>{L.metricOnTimeRate}</td>
                    <td>{activeOnTime != null ? `${activeOnTime}%` : L.notSelected}</td>
                    <td className="after-col">
                      {selectedOnTime != null
                        ? `\u2192 ${selectedOnTime}%`
                        : L.notSelected}
                    </td>
                    <td>
                      {onTimeDelta != null ? (
                        <span className="diff-pill green">
                          {onTimeDelta}%
                        </span>
                      ) : (
                        L.notSelected
                      )}
                    </td>
                  </tr>
                  <tr>
                    <td>{L.metricRiskExposure}</td>
                    <td>{active ? exposureText(active.plan) : L.notSelected}</td>
                    <td className="after-col">
                      {selectedPlan
                        ? `\u2192 ${exposureText(selectedPlan)}`
                        : L.notSelected}
                    </td>
                    <td>
                      {riskDelta != null ? (
                        <span className="diff-pill green">
                          {riskDelta.toFixed(2)}{isOffline(active?.plan) ? "" : "x"}
                        </span>
                      ) : (
                        L.notSelected
                      )}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        </section>


        {/* ════════════════════════════════════════
            RIGHT COLUMN — Decision Intelligence + Driver/Vehicle Status
        ════════════════════════════════════════ */}
        <div className="admin-right">

          {/* ── Decision Intelligence ─────────────────────────── */}
          <section className="panel panel-di">

            {/* Header 44px */}
            <div className="di-header">
              <div className="di-header-left">
                <Activity size={18} strokeWidth={2} style={{ color: '#1F6FEB', flexShrink: 0 }} />
                <div>
                  <h2 className="di-title">{L.decisionIntelligence}</h2>
                  <p className="di-subtitle">3 optimization profiles; results may coincide</p>
                </div>
              </div>
              <span className={`di-status-badge ${(active || hasProposals) ? 'di-badge-optimized' : 'di-badge-idle'}`}>
                {backend ? comparison?.status ?? 'Not optimized' : (active || hasProposals) ? 'Optimized' : 'Not optimized'}
              </span>
            </div>

            {backend && <div className="di-hint-text" role="status">
              {comparison ? `Comparison ${comparison.status} · ${comparison.outcome?.comparison?.status ?? comparison.outcome?.reason ?? "Waiting for server verdict"} · ${sameBasis(comparison.input_basis, backend.basis) ? "CURRENT" : "STALE"}` : "Optimize runs three forecasts through Member 3."}
              <p>Select a certified current forecast to preview it. Accept activates the selected current plan.</p>
              <button type="button" className="text-button" disabled={pending} onClick={() => void invoke(() => api.getSnapshot())}>Refresh backend</button>
              {comparisonRunning && api.cancelComparison && <button type="button" className="text-button" disabled={pending || backend.stale} onClick={() => void invoke(() => api.cancelComparison!())}>Cancel comparison</button>}
              {comparison && <p title={comparison.comparison_id}>M3 · {comparison.comparison_id} · head {comparison.input_basis.head_version} / generation {comparison.input_basis.generation}{comparisonCanRank(comparison) ? " · Comparable forecasts" : " · No comparative ranking"}</p>}
              <div aria-label="Backend execution metrics">
                {Object.values(backend.metrics ?? executionMetrics(backend.executionView)).map(metrics => <p key={metrics.scope} data-metric-scope={metrics.scope}>
                  {metrics.scope} · Distance {formatMetric(metrics, metrics.scope === "OBSERVED_PREFIX_ONLY" ? "distance_m" : "total_distance_m", "km")} · Travel {formatMetric(metrics, metrics.scope === "OBSERVED_PREFIX_ONLY" ? "travel_time_us" : "total_travel_time_s", "min")} · Exposure {formatMetric(metrics, metrics.scope === "OBSERVED_PREFIX_ONLY" ? "relative_exposure_proxy" : "total_exposure")}
                </p>)}
                <p>MEMBER3_HTTP · SIMULATED_REPLAY · {backend.basis.session_id} · build {backend.basis.build_sha256} · head {backend.basis.head_version} / generation {backend.basis.generation}</p>
                {snapshot.planState.acceptedExecution && <p>Accepted {snapshot.planState.acceptedExecution.jobId} · {snapshot.planState.acceptedExecution.profile}</p>}
              </div>
            </div>}

            {!backend && hasProposals && <div className="di-hint-text" role="status" aria-label="Profile outcome comparison">
              <strong>{comparisonProposals.length} distinct {comparisonProposals.length === 1 ? "route" : "routes"} available.</strong>
              {comparisonProposals.length < 3 && <p>This scenario has fewer than three distinct routes. Repeated choices are unavailable.</p>}
            </div>}

            {/* 3 Alternative Cards */}
            <div className="alt-cards-grid">
              {profiles.map((profile) => {
                const proposal = comparisonProposals.find(
                  (item) => (item.origin?.kind === "MEMBER3" ? item.origin.profile : item.content?.profile) === profile
                );
                const isSelected = Boolean(proposal && selected && proposal.id === selected.id);
                const isBalanced = profile === "BALANCED";
                const hasData = Boolean(proposal);
                const onTimeVal = proposal?.content?.metrics.onTimeRate ?? null;
                const child = comparison?.jobs.find(row => row.profile === profile);
                const nativeMetrics = backend && !backend.stale ? proposal?.nativeForecast?.metrics ?? comparisonMetrics(comparison, profile, backend.basis) : null;

                return (
                  <article
                    key={profile}
                    className={`alt-card${isSelected ? " alt-card-selected selected" : ""}`}
                    onClick={() => !pending && !backend?.stale && proposal && proposalCurrency(proposal, snapshot) === "CURRENT" && void invoke(() => api.selectAlternative(proposal.id))}
                    style={{ cursor: proposal ? "pointer" : "default" }}
                  >
                    {/* Recommended badge (Stitch: blue, absolute above border) */}
                    {isBalanced && !backend && (
                      <em className={`recommended-badge${hasData ? "" : " dim"}`}>{L.recommendedTag}</em>
                    )}
                    {/* Check circle when selected */}
                    {isSelected && (
                      <span className="alt-check-icon"><Check size={10} strokeWidth={3} /></span>
                    )}

                    {/* Header: [Icon + Title]  |  [Description inline] */}
                    <div className="alt-card-header">
                      <div className="alt-title-group">
                        <span className="alt-icon-wrap">{PROFILE_ICON[profile]}</span>
                        <span className={`alt-title alt-title-${profile.toLowerCase()}`}>{profile}</span>
                      </div>
                      <span className="alt-desc">{PROFILE_DESC[profile]}</span>
                    </div>

                    {!backend && hasProposals && !proposal && <p className="di-hint-text">No distinct route available for this profile.</p>}
                    {backend && <div className="di-hint-text" data-job-id={child?.job_id ?? undefined} data-job-status={child?.view?.job_status}>
                      <p>{child?.view?.job_status ?? (child?.job_id ? "Awaiting job view" : comparison ? "Awaiting submission" : "Not submitted")} · {child?.view?.internal_status ?? "Business outcome unavailable"}</p>
                      <p>{child?.view?.plan_available ? "Certified witness" : "No certified witness"}{child?.view?.coverage_evaluated ? ` · ${child.view.served_orders.length} served / ${child.view.unserved_orders.length} unserved` : " · Coverage unavailable"}</p>
                      {child?.view?.diagnostics.map((d, i) => <p key={i}>{d.code}: {d.message}</p>)}
                      {child?.job_id && <p title={child.job_id} style={{ overflowWrap: "anywhere" }}>{child.job_id}</p>}
                    </div>}

                    {/* 2×2 Metrics grid (Stitch style) */}
                    {backend ? <>
                      <div className="alt-metrics-grid" data-metric-scope="FORECAST_ONLY">
                        <div className="alt-metric-item">Fleet travel: <strong className="alt-metric-val">{nativeMetrics ? formatMetric(nativeMetrics, "total_travel_time_s", "min") : "—"}</strong></div>
                        <div className="alt-metric-item">Route cost: <strong className="alt-metric-val">{nativeMetrics ? formatMetric(nativeMetrics, "total_cost_vnd") : "—"}</strong></div>
                        <div className="alt-metric-item">On-time rate: <strong className="alt-metric-val">—</strong></div>
                        <div className="alt-metric-item">Exposure proxy: <strong className="alt-metric-val">{nativeMetrics ? formatMetric(nativeMetrics, "total_exposure") : "—"}</strong></div>
                      </div>
                      <p className="di-hint-text">MEMBER3_HTTP · FORECAST_ONLY · {profile}{nativeMetrics ? ` · Distance ${formatMetric(nativeMetrics, "total_distance_m", "km")}` : " · Metrics unavailable"}</p>
                      <p className="di-hint-text">Fuel cost: —</p>
                    </> : <div className="alt-metrics-grid">
                      <div className="alt-metric-item">
                        {isOffline(proposal?.content) ? "Fleet travel:" : "ETA:"} <strong className="alt-metric-val">
                          {hasData ? `${proposal!.content!.metrics.durationMinutes} min` : "—"}
                        </strong>
                      </div>
                      <div className="alt-metric-item">
                        {isOffline(proposal?.content) ? "Route cost:" : "Fuel cost:"} <strong className="alt-metric-val">
                          {proposal ? `${Math.round(proposal.content!.metrics.fuelCostVnd / 1000)}K VND` : "—"}
                        </strong>
                      </div>
                      <div className="alt-metric-item">
                        On-time rate:{" "}
                        <strong className={`alt-metric-val${hasData && onTimeVal != null && onTimeVal >= 90 ? " m-success" : ""}`}>
                          {onTimeVal != null ? `${onTimeVal}%` : "—"}
                        </strong>
                      </div>
                      <div className="alt-metric-item">
                        Exposure proxy: <strong className="alt-metric-val">
                          {proposal ? exposureText(proposal.content!) : "—"}
                        </strong>
                      </div>
                    </div>}

                    {/* Select Alternative button */}
                    <button
                      type="button"
                      aria-label={`Select ${profile}`}
                      className={`alt-view-btn ${isSelected ? "alt-view-selected" : "alt-view-outline"}`}
                      disabled={!proposal || pending || Boolean(backend?.stale) || proposalCurrency(proposal, snapshot) === "STALE"}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (proposal) void invoke(() => api.selectAlternative(proposal.id));
                      }}
                    >
                      {isSelected ? "Selected" : "View Details"}
                    </button>
                  </article>
                );
              })}
            </div>


            {/* Selected plan summary */}
            <div className="plan-summary-block">
              <div className="plan-summary-header">
                <span className="plan-summary-label">SELECTED PLAN SUMMARY</span>
                {selected && (
                  <span className="plan-summary-plan-name">{selected.origin?.kind === "MEMBER3" ? selected.origin.profile : selectedPlan?.profile}</span>
                )}
              </div>
              {selected?.nativeForecast && <p className="di-hint-text">Preview {selected.id} · FORECAST_ONLY · MEMBER3_HTTP · {selected.origin?.kind === "MEMBER3" ? selected.origin.profile : ""}</p>}
              {selected?.nativeForecast?.jobView.unserved_orders.map(item => <p key={item.order_id} className="di-hint-text">{item.order_id}: {item.reason}</p>)}
              {!backend && snapshot.decisionState.vehicles.map((v) => {
                const vPlan = selectedPlan?.vehiclePlans.find((vp) => vp.vehicleId === v.id);
                const stops = vPlan
                  ? vPlan.orderedStops.filter((s) => s.kind !== "DEPOT_PICKUP").length
                  : 0;
                const distKm = vPlan
                  ? vPlan.routeSegments.reduce((acc, s) => acc + s.distanceKm, 0)
                  : 0;
                const loadKg = snapshot.decisionState.orders
                  .filter((o) => vPlan?.orderedStops.some((s) => s.orderIds?.includes(o.id)))
                  .reduce((sum, o) => sum + o.demandKg, 0);
                const cap = capacities[v.id] ?? v.capacityKg;
                return (
                  <div key={v.id} className="plan-summary-row">
                    <span className="plan-summary-dot" style={{ background: vehicleColor(v.id) }} />
                    <span className="plan-summary-vid">{v.id}</span>
                    <span className="plan-summary-detail">
                      {selected
                        ? `${stops} stop${stops !== 1 ? "s" : ""} · ${distKm.toFixed(1)} km · ${loadKg.toFixed(1)}/${cap} kg`
                        : "—"}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Accept / hint / accepted state */}
            {hasProposals ? (
              <button
                className="accept-fullwidth"
                aria-label="Accept selected plan"
                disabled={acceptDisabled}
                onClick={() => void invoke(() => api.acceptSelectedPlan())}
              >
                <Check size={16} strokeWidth={2.5} />
                <span>{L.acceptSelectedPlan}</span>
              </button>
            ) : !hasAcceptedPlan ? (
              <p className="di-hint-text">Click Optimize to generate plans</p>
            ) : null}

            <RouteVisibilityControls vehicleIds={snapshot.decisionState.vehicles.map((v) => v.id)}
              visibility={routeVisibility} presentation={adminMap} onToggle={toggleVehicleRoute} />

          </section>{/* end panel-di */}

          {/* ── Driver / Vehicle Status ─────────────────────── */}
          <section className="panel panel-fleet-status">

            {/* Header 40px */}
            <div className="di-header" style={{ marginBottom: 0, minHeight: 40 }}>
              <div className="di-header-left">
                <Truck size={18} strokeWidth={2} style={{ color: '#1F6FEB', flexShrink: 0 }} />
                <h2 className="di-title">{L.driverVehicleStatus}</h2>
              </div>
              <span className="live-pill">
                <span className="live-dot pulse" />
                {L.liveStatus}
              </span>
            </div>

            {/* Fleet div-table */}
            <div className="fleet-table">
              <div className="fleet-thead">
                <div className="fleet-th">#</div>
                <div className="fleet-th">VEHICLE</div>
                <div className="fleet-th">DRIVER</div>
                <div className="fleet-th">CURRENT STOP</div>
                <div className="fleet-th">ETA</div>
                <div className="fleet-th">STATUS</div>
              </div>
              <div className="fleet-tbody">
                {snapshot.decisionState.vehicles.map((vehicle, idx) => {
                  const driver = getDriverInfo(vehicle.id);
                  const isAvailable = vehicle.availability === "AVAILABLE";
                  /* Use accepted plan first, then selected proposal, then no plan */
                  const displayVehiclePlans =
                    active?.plan.vehiclePlans ??
                    selectedPlan?.vehiclePlans ??
                    [];
                  const myVPlan = displayVehiclePlans.find((vp) => vp.vehicleId === vehicle.id);
                  const myStops = myVPlan
                    ? myVPlan.orderedStops.filter((s) => s.kind !== "DEPOT_PICKUP")
                    : [];
                  const isEnRoute = isAvailable && myStops.length > 0;
                  const isDelayed = false;
                  const currentStop = myStops[0];
                  const stopLabel = isEnRoute
                    ? `Stop 1/${myStops.length}`
                    : isAvailable
                    ? "Depot"
                    : "Unavailable";
                  const stopOrder = currentStop?.orderIds?.[0] ?? null;
                  const color = vehicleColor(vehicle.id);
                  const cap = capacities[vehicle.id] ?? vehicle.capacityKg;
                  const load = vehicle.currentLoadKg;
                  const loadPct = Math.min(100, (load / cap) * 100);
                  const overload = load > cap;
                  const statusClass = !isAvailable
                    ? "unavailable"
                    : isDelayed
                    ? "delayed"
                    : isEnRoute
                    ? "en-route"
                    : "idle";

                  return (
                    <div
                      key={vehicle.id}
                      className={`fleet-row${isDelayed ? " row-delayed" : ""}${!isAvailable ? " row-unavailable" : ""}`}
                    >
                      {/* # */}
                      <div className="fleet-td">
                        <span className="vehicle-row-num">{idx + 1}</span>
                      </div>
                      {/* VEHICLE */}
                      <div className="fleet-td">
                        <div className="veh-cell">
                          <span style={{ width: 10, height: 10, borderRadius: "50%", background: color, flexShrink: 0, display: "inline-block" }} />
                          <span style={{ fontSize: 14, fontWeight: 700, color: "#0F172A" }}>{vehicle.id}</span>
                        </div>
                      </div>
                      {/* DRIVER */}
                      <div className="fleet-td">
                        <div className="driver-cell">
                          <span className="driver-avatar" style={{ background: color }}>{driver.avatar}</span>
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <span className="driver-name" title={driver.name}>{driver.name}</span>
                            <span className="driver-load" style={overload ? { color: "#E5252A", fontWeight: 700 } : {}}>
                              {load.toFixed(1)} / {cap} kg
                            </span>
                            <div className="load-bar-track">
                              <div
                                className="load-bar-fill"
                                style={{ width: `${loadPct}%`, background: overload ? "#E5252A" : color }}
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                      {/* CURRENT STOP */}
                      <div className="fleet-td">
                        <div className="stop-cell">
                          <span className="stop-main">{stopLabel}</span>
                          {stopOrder && <span className="stop-order">{stopOrder}</span>}
                        </div>
                      </div>
                      {/* ETA */}
                      <div className="fleet-td">
                        <span className="eta-cell">{isEnRoute && !isOffline(active?.plan ?? selected?.content) ? "14:35" : "—"}</span>
                      </div>
                      {/* STATUS */}
                      <div className="fleet-td">
                        <span className={`status-pill ${statusClass}`}>
                          {!isAvailable
                            ? L.statusUnavailable
                            : isDelayed
                            ? L.statusDelayed
                            : isEnRoute
                            ? L.statusEnRoute
                            : L.statusIdle}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Fleet footer: legend + summary */}
            {(() => {
              const total = snapshot.decisionState.vehicles.length;
              const displayVehiclePlans =
                active?.plan.vehiclePlans ??
                selectedPlan?.vehiclePlans ??
                [];
              const enRouteCount = snapshot.decisionState.vehicles.filter(
                (v) =>
                  v.availability === "AVAILABLE" &&
                  displayVehiclePlans.some(
                    (vp) =>
                      vp.vehicleId === v.id &&
                      vp.orderedStops.some((s) => s.kind !== "DEPOT_PICKUP")
                  )
              ).length;
              const idleCount =
                total -
                enRouteCount -
                snapshot.decisionState.vehicles.filter(
                  (v) => v.availability === "UNAVAILABLE"
                ).length;
              return (
                <div className="fleet-footer">
                  <div className="fleet-legend">
                    {snapshot.decisionState.vehicles.map((v) => (
                      <div key={v.id} className="fleet-legend-item">
                        <span className="fleet-legend-dot" style={{ background: vehicleColor(v.id) }} />
                        <span>{v.id}</span>
                      </div>
                    ))}
                  </div>
                  <span className="fleet-summary-text">
                    {total} vehicles · {enRouteCount} en route · {idleCount} idle
                  </span>
                </div>
              );
            })()}

          </section>{/* end panel-fleet-status */}

        </div>{/* end admin-right */}

      </div>
    </main>
  );
}
