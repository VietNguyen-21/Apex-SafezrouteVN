import { createRef } from "react";
import { MemoryRouter } from "react-router-dom";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import L from "leaflet";
import { App } from "../src/app/App";
import { MockDispatchApi } from "../src/services/api/MockDispatchApi";
import { Member3Error } from "../src/integrations/member3/errors";
import { LeafletCanvas, type LeafletCanvasHandle } from "../src/shared/components/LeafletCanvas";

// Regression coverage for restored connection and tile recovery.
it("offers retry after an initial connection failure", async () => {
  const api = new MockDispatchApi({ storage: { getItem: () => null, setItem: () => {}, removeItem: () => {} } });
  vi.spyOn(api, "getSnapshot").mockRejectedValue(new Member3Error("NETWORK_ERROR", "Backend temporarily offline"));
  try {
    render(<MemoryRouter initialEntries={["/admin"]}><App api={api} /></MemoryRouter>);
    expect(await screen.findByRole("alert")).toHaveTextContent("Backend temporarily offline");
    expect(screen.getByRole("button", { name: "Retry connection" })).toBeEnabled();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Retry connection" })); });
    expect(api.getSnapshot).toHaveBeenCalledTimes(2);
  } finally { api.dispose(); }
});

it("retains tiles and recovers after transient tile failure", () => {
  const original = L.tileLayer;
  let tiles: L.TileLayer | undefined;
  const spy = vi.spyOn(L, "tileLayer").mockImplementation((...args) => { tiles = original(...args); return tiles; });
  try {
    render(<LeafletCanvas scene={{ accepted: [], proposed: [], markers: [], rain: null }} mapHandle={createRef<LeafletCanvasHandle>()} />);
    const map = screen.getByLabelText("Dispatch route map");
    const layer = tiles!.getContainer()!;
    expect(map.contains(layer)).toBe(true);
    act(() => { tiles!.fire("tileerror"); });
    expect(map.contains(layer)).toBe(true);
    expect(screen.getByRole("button", { name: "Retry map tiles" })).toBeEnabled();
    act(() => { tiles!.fire("tileload"); window.dispatchEvent(new Event("online")); });
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByRole("button", { name: /retry/i })).toBeNull();
  } finally { spy.mockRestore(); }
});
