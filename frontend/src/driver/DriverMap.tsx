import { useRef } from "react";
import { CloudRain, Navigation, Plus, Minus } from "lucide-react";
import type { DispatchSnapshot } from "../shared/types/dispatch";
import { createMapScene, type MapScene } from "../shared/components/mapScene";
import { LeafletCanvas, type LeafletCanvasHandle } from "../shared/components/LeafletCanvas";
import { describeRouteLegs, describeSuppliedRouteLegs, vehicleRouteColor } from "../shared/components/routeLegPresentation";

interface DriverMapProps {
  snapshot: DispatchSnapshot;
  vehicleId?: string;
  activePlanId?: string | null;
  currentStopId?: string | null;
}

export function DriverMap({ snapshot, vehicleId = "V1" }: DriverMapProps) {
  const handle = useRef<LeafletCanvasHandle | null>(null);
  const base = createMapScene(snapshot, undefined, vehicleId);
  const active = snapshot.planState.acceptedPlans.find((p) => p.id === snapshot.planState.activeAcceptedPlanId);
  const vehicle = active?.plan.vehiclePlans.find((v) => v.vehicleId === vehicleId);
  const description = snapshot.backend ? describeSuppliedRouteLegs(base.accepted) : vehicle ? describeRouteLegs(vehicle) : undefined;
  const scene: MapScene = {
    ...base,
    vehicleColors: { [vehicleId]: vehicleRouteColor(vehicleId) },
    accepted: base.accepted.flatMap((segment) => {
      const leg = description?.bySegmentId.get(segment.id);
      return leg ? [{ ...segment, legId: leg.id, color: leg.color }] : [];
    })
  };
  return <section className="drv-map-card" aria-label="Driver route map">
    <LeafletCanvas scene={scene} mapHandle={handle} driver />
    {scene.rain && <div className="drv-weather-chip" role="status"><CloudRain size={13} strokeWidth={2} /><span>Simulated local rain</span></div>}
    <div className="drv-map-controls">
      <button type="button" className="drv-zoom-btn" onClick={() => handle.current?.zoomIn()} aria-label="Zoom in"><Plus size={16} strokeWidth={2.5} /></button>
      <button type="button" className="drv-zoom-btn" onClick={() => handle.current?.zoomOut()} aria-label="Zoom out"><Minus size={16} strokeWidth={2.5} /></button>
      <button type="button" className="drv-zoom-btn drv-recenter-btn" onClick={() => handle.current?.reset()} aria-label={`Center on ${vehicleId}`}><Navigation size={15} strokeWidth={2.2} /></button>
    </div>
    {scene.accepted.length > 0 && <div className="map-layer-label drv-accepted-route" aria-label="Accepted route" />}
    {scene.rain && <div className="map-layer-label" aria-label="Simulated rain area" />}
    {description && description.legs.length > 0 && <div className="drv-route-leg-legend" role="list" aria-label="Route legs">
      {description.legs.map((leg) => <span key={leg.id} role="listitem"><i style={{ background: leg.color }} />{leg.number} → {leg.targetLabel}</span>)}
    </div>}
  </section>;
}
