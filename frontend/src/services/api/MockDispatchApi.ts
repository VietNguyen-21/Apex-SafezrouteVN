import type { DispatchSnapshot } from "../../shared/types/dispatch";
import type { ScenarioId } from "../../shared/types/scenario";
import { DispatchError, isDispatchSnapshot, MockStateEngine } from "../../mocks/engine/MockStateEngine";
import type { DispatchApi } from "./DispatchApi";

import { getCustomerInfo, getDriverInfo, DEPOT_PRESENTATION } from "../../mocks/presentation";

export const MOCK_STORAGE_KEY = "saferoute.phase1.dispatch.v1";

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

interface StorageEventTarget {
  addEventListener(type: "storage", listener: (event: StorageEvent) => void): void;
  removeEventListener(type: "storage", listener: (event: StorageEvent) => void): void;
}

interface PersistedSnapshot {
  schemaVersion: 1;
  snapshot: DispatchSnapshot;
}

function browserStorage(): StorageLike | undefined {
  return typeof window === "undefined" ? undefined : window.localStorage;
}

function parsePersisted(value: string | null): DispatchSnapshot | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<PersistedSnapshot>;
    return parsed.schemaVersion === 1 && isDispatchSnapshot(parsed.snapshot) ? parsed.snapshot : null;
  } catch {
    return null;
  }
}

export class MockDispatchApi implements DispatchApi {
  readonly presentation = { demo: true, getCustomerInfo, getDriverInfo, depot: DEPOT_PRESENTATION };
  private engine: MockStateEngine;
  private readonly listeners = new Set<(snapshot: DispatchSnapshot) => void>();
  private readonly storage?: StorageLike;
  private readonly eventTarget?: StorageEventTarget;

  constructor(options: { storage?: StorageLike; eventTarget?: StorageEventTarget } = {}) {
    this.storage = options.storage ?? browserStorage();
    this.eventTarget = options.eventTarget ?? (typeof window === "undefined" ? undefined : window);
    this.engine = new MockStateEngine(parsePersisted(this.storage?.getItem(MOCK_STORAGE_KEY) ?? null) ?? undefined);
    this.eventTarget?.addEventListener("storage", this.onStorage);
  }

  async getSnapshot(): Promise<DispatchSnapshot> {
    return this.engine.getSnapshot();
  }

  subscribe(listener: (snapshot: DispatchSnapshot) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async importScenario(value: unknown) { return this.mutate(() => this.engine.importScenario(value)); }
  exportScenario() { return this.engine.exportScenario(); }
  async setPlayback(playing: boolean, speed: number) { return this.mutate(() => this.engine.setPlayback(playing, speed)); }
  async tickPlayback() { return this.mutate(() => this.engine.tickPlayback()); }
  async loadScenario(id: ScenarioId) { return this.mutate(() => this.engine.loadScenario(id)); }
  async optimize() { return this.mutate(() => this.engine.optimize()); }
  async selectAlternative(planId: string) { return this.mutate(() => this.engine.selectAlternative(planId)); }
  async acceptSelectedPlan() {
    const local = this.engine.getSnapshot();
    const persisted = parsePersisted(this.storage?.getItem(MOCK_STORAGE_KEY) ?? null);
    if (local.planState.selectedAlternativeId && persisted && (
      persisted.decisionState.sessionId !== local.decisionState.sessionId ||
      persisted.decisionState.version !== local.decisionState.version ||
      persisted.planState.selectedAlternativeId !== local.planState.selectedAlternativeId
    )) {
      this.engine = new MockStateEngine(persisted);
      this.notify(this.engine.getSnapshot());
      throw new DispatchError("STALE_PROPOSAL", "Phương án được tạo cho trạng thái cũ. Hãy tối ưu lại.");
    }
    return this.mutate(() => this.engine.acceptSelectedPlan());
  }
  async triggerFixtureEvent(eventId: string) { return this.mutate(() => this.engine.triggerFixtureEvent(eventId)); }
  async setUrgentOrderEnabled(enabled: boolean) { return this.mutate(() => this.engine.setUrgentOrderEnabled(enabled)); }
  async pickupOrder(input: { vehicleId: string; orderId: string }) { return this.mutate(() => this.engine.pickupOrder(input)); }
  async deliverOrder(input: { vehicleId: string; orderId: string }) { return this.mutate(() => this.engine.deliverOrder(input)); }
  async advanceDemoClock(minutes: number) { return this.mutate(() => this.engine.advanceDemoClock(minutes)); }
  async resetDemoSession() { return this.mutate(() => this.engine.resetDemoSession()); }

  dispose(): void {
    this.eventTarget?.removeEventListener("storage", this.onStorage);
    this.listeners.clear();
  }

  private mutate(operation: () => DispatchSnapshot): Promise<DispatchSnapshot> {
    const commit = () => {
      this.hydrateLatest();
      const snapshot = operation();
      this.persist(snapshot);
      this.notify(snapshot);
      return snapshot;
    };
    if (typeof navigator !== "undefined" && navigator.locks) return navigator.locks.request(MOCK_STORAGE_KEY, commit);
    return Promise.resolve(commit());
  }

  private hydrateLatest(): void {
    const persisted = parsePersisted(this.storage?.getItem(MOCK_STORAGE_KEY) ?? null);
    if (persisted) this.engine = new MockStateEngine(persisted);
  }

  private persist(snapshot: DispatchSnapshot): void {
    this.storage?.setItem(MOCK_STORAGE_KEY, JSON.stringify({ schemaVersion: 1, snapshot } satisfies PersistedSnapshot));
  }

  private notify(snapshot: DispatchSnapshot): void {
    this.listeners.forEach((listener) => listener(snapshot));
  }

  private onStorage = (event: StorageEvent): void => {
    if (event.key !== MOCK_STORAGE_KEY) return;
    const persisted = parsePersisted(event.newValue);
    if (!persisted) return;
    this.engine = new MockStateEngine(persisted);
    this.notify(this.engine.getSnapshot());
  };
}
