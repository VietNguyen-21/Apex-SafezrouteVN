import rawBundle from "../data/member2-road-packs.json";
import rawEventBundle from "../data/member2-event-road-packs.json";
import rawDiverseBundle from "../data/member2-diverse-road-packs.json";
import type { OfflineRoadBundle } from "./offlineRoadPlans";

// Generated and independently certified offline assets; no solver/runtime import in the browser.
const initial = rawBundle as unknown as OfflineRoadBundle;
const events = rawEventBundle as unknown as OfflineRoadBundle;
// Separate policy/provenance: raw route validation does not assert SDK certification.
export const diverseRoadPacks = rawDiverseBundle as unknown as OfflineRoadBundle;
export const offlineRoadPacks: OfflineRoadBundle = {
  ...initial,
  packs: [...initial.packs, ...(events.schemaVersion === initial.schemaVersion &&
    events.buildSha256 === initial.buildSha256 && events.executionMode === initial.executionMode ? events.packs : [])]
};
