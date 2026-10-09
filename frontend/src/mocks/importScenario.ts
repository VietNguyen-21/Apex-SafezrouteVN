import { listFixtureScenarios } from "./fixtureCatalog";
import type { ScenarioId } from "../shared/types/scenario";

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  return JSON.stringify(value);
}

export function identifyImportedScenario(value: unknown): ScenarioId {
  const match = listFixtureScenarios().find(({ fixture }) => canonical(fixture) === canonical(value));
  if (!match) throw new Error("This scenario has no matching offline routes. Import an unchanged S0–S4 fixture, or recompute its routes before importing.");
  return match.id;
}
