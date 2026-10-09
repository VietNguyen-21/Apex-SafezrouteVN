import { adminVehicleColor, type AdminMapPresentation } from "./adminMapPresentation";

interface Props {
  vehicleIds: string[];
  visibility: Record<string, boolean>;
  presentation: AdminMapPresentation;
  onToggle(vehicleId: string): void;
}

export function RouteVisibilityControls({ vehicleIds, visibility, presentation, onToggle }: Props) {
  return <section className="route-visibility" aria-label="Route visibility">
    <div className="route-visibility-controls">
    <div className="route-visibility-heading">
    <h3>Route visibility</h3>
    <p className="route-visibility-source">
      {presentation.source === "PROPOSED" ? "Proposed route · Preview only" :
        presentation.source === "ACCEPTED" ? presentation.completionAvailable === false ? "Accepted route · Completion unavailable" : "Accepted route · Remaining travel" : "No plan to display yet"}
    </p>
    </div>
    <div className="route-visibility-switches">
    {vehicleIds.map((id) => {
      const enabled = Boolean(visibility[id]);
      return <div key={id} className="route-visibility-vehicle">
        <div className="route-visibility-row">
          <span className="route-visibility-name"><i className="route-leg-swatch" style={{ background: adminVehicleColor(id) }} aria-hidden="true" />{id} Route</span>
          <span className="route-visibility-state">{enabled ? "ON" : "OFF"}</span>
          <button type="button" role="switch" aria-label={`Show ${id} route`} aria-checked={enabled}
            className={`toggle-switch ${enabled ? "toggle-on" : ""}`} onClick={() => onToggle(id)} />
        </div>
      </div>;
    })}
    </div>
    </div>
    <div className="route-visibility-legends" tabIndex={0} aria-label="Route leg legend">
    {vehicleIds.filter((id) => visibility[id]).map((id) => {
      const legs = presentation.legs.filter((leg) => leg.vehicleId === id);
      return <div key={id} className="route-visibility-vehicle">
        <span className="route-visibility-legend-name">{id}</span>
        {legs.length > 0 && <ol className="route-leg-legend" aria-label={`${id} route legs`}>
          {legs.map((leg) => <li key={leg.id}>
            <i className="route-leg-swatch" style={{ background: leg.color }} aria-hidden="true" />
            <span>Leg {leg.number} → {leg.targetLabel}</span>
          </li>)}
        </ol>}
        {!legs.length && <p className="route-visibility-empty">No remaining supplied route</p>}
      </div>;
    })}
    </div>
  </section>;
}
