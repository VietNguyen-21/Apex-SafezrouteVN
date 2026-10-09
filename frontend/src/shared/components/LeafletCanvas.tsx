import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { MapScene } from "./mapScene";

const ROUTE_COLORS = ["#16a34a", "#1f6feb", "#f59e0b"];

function latLng([longitude, latitude]: [number, number]): L.LatLngTuple {
  return [latitude, longitude];
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char);
}

export interface LeafletCanvasHandle {
  zoomIn(): void;
  zoomOut(): void;
  reset(): void;
}

interface LeafletCanvasProps {
  scene: MapScene;
  mapHandle: React.RefObject<LeafletCanvasHandle | null>;
  driver?: boolean;
  onTileUnavailable?(unavailable: boolean): void;
}

export function LeafletCanvas({ scene, mapHandle, driver = false, onTileUnavailable }: LeafletCanvasProps) {
  const elementRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const overlayRef = useRef<L.LayerGroup | null>(null);
  const boundsRef = useRef<L.LatLngBounds | null>(null);
  const lastFitKeyRef = useRef<string | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const [tileUnavailable, setTileUnavailable] = useState(false);
  const onTileUnavailableRef = useRef(onTileUnavailable);
  onTileUnavailableRef.current = onTileUnavailable;

  useEffect(() => {
    if (!elementRef.current) return;
    const map = L.map(elementRef.current, { zoomControl: false, attributionControl: true, preferCanvas: false });
    mapRef.current = map;
    map.setView([10.82, 106.72], 12);
    map.attributionControl.setPrefix(false);
    const tiles = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    });
    tileLayerRef.current = tiles;
    tiles.on("tileerror", () => {
      setTileUnavailable(true);
      onTileUnavailableRef.current?.(true);
    });
    tiles.on("tileload", () => { setTileUnavailable(false); onTileUnavailableRef.current?.(false); });
    const retryTiles = () => tiles.redraw();
    window.addEventListener("online", retryTiles);
    tiles.addTo(map);
    overlayRef.current = L.layerGroup().addTo(map);
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => map.invalidateSize()) : null;
    observer?.observe(elementRef.current);
    const timer = window.setTimeout(() => map.invalidateSize(), 0);
    return () => {
      window.clearTimeout(timer);
      observer?.disconnect();
      window.removeEventListener("online", retryTiles);
      map.remove();
      mapRef.current = null;
      overlayRef.current = null;
      boundsRef.current = null;
      lastFitKeyRef.current = null;
      tileLayerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const overlay = overlayRef.current;
    if (!map || !overlay) return;
    overlay.clearLayers();
    const positions: L.LatLngTuple[] = [];
    const colorByVehicle = new Map<string, string>();
    const colorFor = (id: string) => {
      if (scene.vehicleColors?.[id]) return scene.vehicleColors[id];
      if (!colorByVehicle.has(id)) colorByVehicle.set(id, ROUTE_COLORS[colorByVehicle.size % ROUTE_COLORS.length]);
      return colorByVehicle.get(id)!;
    };
    const renderRoutes = (segments: MapScene["accepted"], proposed: boolean) => {
      const groups = new Map<string, { vehicleId: string; completed: boolean; color?: string; lines: L.LatLngTuple[][] }>();
      for (const segment of segments) {
        const points = (segment.drawableCoordinates ?? segment.coordinates).map(latLng);
        positions.push(...points);
        const completed = !proposed && segment.completed;
        const key = JSON.stringify([segment.vehicleId, completed, segment.legId ?? null, segment.color ?? null]);
        const group = groups.get(key) ?? { vehicleId: segment.vehicleId, completed, color: segment.color, lines: [] };
        group.lines.push(points);
        groups.set(key, group);
      }
      for (const group of groups.values()) {
        // Nested polylines retain every EDGE independently: never join disconnected endpoints.
        const points = group.lines.length === 1 ? group.lines[0] : group.lines;
        L.polyline(points, proposed
          ? { color: group.color ?? colorFor(group.vehicleId), weight: 3.5, opacity: 0.75, dashArray: "7 6" }
          : { color: group.color ?? (driver ? "#2563eb" : colorFor(group.vehicleId)), weight: driver ? 4 : 4.5,
              opacity: group.completed ? 0.35 : 0.9, className: group.completed ? "completed" : "" }
        ).addTo(overlay);
      }
    };
    renderRoutes(scene.accepted, false);
    renderRoutes(scene.proposed, true);
    if (scene.rain) {
      const rings = scene.rain.coordinates.map((ring) => ring.map((point) => latLng([point[0], point[1]])));
      rings.forEach((ring) => positions.push(...ring));
      L.polygon(rings, { color: "#3b82f6", fillColor: "#60a5fa", fillOpacity: 0.23, weight: 2, dashArray: "5 4" }).addTo(overlay);
    }
    const markerGroups = new Map<string, typeof scene.markers>();
    const positionKey = (coordinates: [number, number]) => coordinates.join(",");
    const badgeWidth = (kind: string) => kind === "vehicle" ? 34 : 24;
    for (const marker of scene.markers) {
      const key = positionKey(marker.coordinates);
      const group = markerGroups.get(key) ?? [];
      group.push(marker);
      markerGroups.set(key, group);
    }
    for (const marker of scene.markers) {
      const coordinate = latLng(marker.coordinates);
      positions.push(coordinate);
      const label = escapeHtml(marker.label);
      const color = marker.unavailable ? "#e5252a" : marker.kind === "depot" ? "#1f6feb" : marker.kind === "vehicle" ? (driver && !scene.vehicleColors?.[marker.id] ? "#1d70f5" : colorFor(marker.id)) : marker.urgent ? "#ef4444" : "#e5252a";
      // Separate coincident badges in screen pixels; geographic positions stay exact.
      const group = markerGroups.get(positionKey(marker.coordinates))!;
      const gap = 8;
      const index = group.indexOf(marker);
      const width = badgeWidth(marker.kind);
      const totalWidth = group.reduce((total, item) => total + badgeWidth(item.kind), 0) + gap * (group.length - 1);
      const precedingWidth = group.slice(0, index).reduce((total, item) => total + badgeWidth(item.kind) + gap, 0);
      const offsetX = -totalWidth / 2 + precedingWidth + width / 2;
      const icon = L.divIcon({
        className: "saferoute-map-marker",
        html: `<span class="saferoute-marker saferoute-marker--${marker.kind}" style="background:${color}">${escapeHtml(marker.kind === "order" ? marker.id.replace(/^O0*/, "") : marker.kind === "depot" ? "⌂" : marker.id)}</span>`,
        iconSize: marker.kind === "vehicle" ? [34, 22] : [24, 24],
        iconAnchor: [width / 2 - offsetX, marker.kind === "vehicle" ? 11 : 12]
      });
      L.marker(coordinate, { icon, title: marker.label }).bindTooltip(label).addTo(overlay);
    }
    if (positions.length) {
      const bounds = L.latLngBounds(positions);
      boundsRef.current = bounds;
      const fitKey = `${driver}:${bounds.toBBoxString()}`;
      if (fitKey !== lastFitKeyRef.current) {
        map.fitBounds(bounds, { padding: driver ? [28, 28] : [48, 48], maxZoom: driver ? 15 : 14, animate: false });
        lastFitKeyRef.current = fitKey;
      }
    }
  }, [scene, driver]);

  mapHandle.current = {
    zoomIn: () => mapRef.current?.zoomIn(),
    zoomOut: () => mapRef.current?.zoomOut(),
    reset: () => { if (mapRef.current && boundsRef.current) mapRef.current.fitBounds(boundsRef.current, { padding: [32, 32], maxZoom: driver ? 15 : 14 }); }
  };

  return <>
    {/* Keep className stable: Leaflet adds its own classes to this element. */}
    <div ref={elementRef} className={`saferoute-leaflet ${driver ? "saferoute-leaflet--driver" : ""}`} style={tileUnavailable ? { background: "#dce5ed" } : undefined} aria-label={driver ? "Driver route map" : "Dispatch route map"} />
    {tileUnavailable && <p className={driver ? "drv-tile-warning" : "tile-warning"} role="status">Map tiles unavailable. Route and stops remain visible.{" "}<button type="button" onClick={() => tileLayerRef.current?.redraw()}>Retry map tiles</button></p>}
    {[...scene.accepted, ...scene.proposed].some((segment) => segment.geometrySource !== "MEMBER2_SUPPLIED") &&
      <p className={`route-geometry-notice ${driver ? "route-geometry-notice--driver" : ""}`} role="note">
        Schematic demo routes — do not follow roads.
      </p>}
  </>;
}
