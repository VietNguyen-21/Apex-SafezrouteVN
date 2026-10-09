import { Member3Error } from "./errors";
import { parseComparisonReceipt, parseComparisonView, parseJobView } from "./jobViewAdapter";
import { parseJobForecast } from "./forecastViewAdapter";
import { parseAcceptanceView, parseAcceptanceAudit } from "./acceptance";
import { parsePendingEvents } from "./events";
import { parseReplayAudit, parseReplayMutation } from "./replay";
import { parsePlayback, parsePlaybackControl, parseReplayReset, validSpeed } from "./playback";
import type { StartPlaybackRequest, PlaybackSpeedRequest } from "./types";
import type { ReplayStepRequest, ApplyEventRequest } from "./types";
import type { AcceptPlanRequest, M3Session } from "./types";
import type { CompareProfilesRequest, M3ComparisonCancellation } from "./types";
import type { M3Capabilities, M3Catalog, M3Envelope, M3ExecutionView, M3LoadedSession, M3LocationsView, M3OrdersView, M3Ready, M3VehiclesView } from "./types";

export const M3_TOKEN_KEY = "saferoute.member3.bearer";
export interface Member3ClientOptions { baseUrl?: string; token?: () => string | null; fetch?: typeof fetch }

function browserToken(): string | null {
  try { return typeof window === "undefined" ? null : window.sessionStorage.getItem(M3_TOKEN_KEY); }
  catch { return null; }
}

/** Only talks to the configured M3 origin; never redirects bearer credentials or falls back to fixtures. */
export class Member3Client {
  readonly baseUrl: string;
  private readonly token: () => string | null;
  private readonly fetcher: typeof fetch;
  constructor(options: Member3ClientOptions = {}) {
    const url = new URL(options.baseUrl ?? "http://127.0.0.1:8000");
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
      throw new Member3Error("INVALID_CONFIG", "M3 base URL must be an HTTP(S) server URL without credentials.");
    }
    this.baseUrl = url.href.replace(/\/$/, "");
    this.token = options.token ?? browserToken;
    this.fetcher = options.fetch ?? globalThis.fetch.bind(globalThis);
  }

  ready() { return this.request<M3Ready>("/ready", false); }
  capabilities() { return this.request<M3Capabilities>("/api/runtime/capabilities"); }
  scenarios() { return this.request<M3Catalog>("/api/scenarios"); }
  session(id: string) { return this.request<M3Session>(`/api/sessions/${encodeURIComponent(id)}`); }
  async events(sid: string, signal?: AbortSignal) {
    return parsePendingEvents(await this.request(`/api/sessions/${encodeURIComponent(sid)}/events`, true, undefined, signal), sid);
  }
  async replayHistory(sid: string, signal?: AbortSignal) {
    return parseReplayAudit(await this.request(`/api/sessions/${encodeURIComponent(sid)}/replay/history`, true, undefined, signal), sid);
  }
  async step(sid: string, body: ReplayStepRequest) {
    const view = parseReplayMutation(await this.request(`/api/sessions/${encodeURIComponent(sid)}/replay/step`, true, body), sid, "advance");
    if (view.receipt.input_basis.head_version !== body.expected_revision.head_version || view.receipt.input_basis.generation !== body.expected_revision.generation) throw new Member3Error("INVALID_RESPONSE", "Replay receipt differs from requested revision.");
    return view;
  }
  async playback(sid: string, signal?: AbortSignal) {
    return parsePlayback(await this.request(`/api/sessions/${encodeURIComponent(sid)}/replay/playback`, true, undefined, signal), sid);
  }
  async startPlayback(sid: string, body: StartPlaybackRequest) {
    if (!validSpeed(body.speed)) throw new Member3Error("INVALID_SPEED", "Playback speed must be 1, 2, 4 or 8.");
    return parsePlaybackControl(await this.request(`/api/sessions/${encodeURIComponent(sid)}/replay/start`, true, body), sid, "start", body.request_id);
  }
  async setPlaybackSpeed(sid: string, body: PlaybackSpeedRequest) {
    if (!validSpeed(body.speed)) throw new Member3Error("INVALID_SPEED", "Playback speed must be 1, 2, 4 or 8.");
    return parsePlaybackControl(await this.request(`/api/sessions/${encodeURIComponent(sid)}/replay/speed`, true, body), sid, "speed", body.request_id);
  }
  async pausePlayback(sid: string, requestId: string) {
    return parsePlaybackControl(await this.request(`/api/sessions/${encodeURIComponent(sid)}/replay/playback/pause`, true, { request_id: requestId }), sid, "pause", requestId);
  }
  async resetReplay(sid: string, requestId: string) {
    return parseReplayReset(await this.request(`/api/sessions/${encodeURIComponent(sid)}/replay/reset`, true, { request_id: requestId }), sid);
  }
  async applyEvent(sid: string, eid: string, body: ApplyEventRequest) {
    const view = parseReplayMutation(await this.request(`/api/sessions/${encodeURIComponent(sid)}/events/${encodeURIComponent(eid)}/apply`, true, body), sid, "apply_event", eid);
    if (view.receipt.input_basis.head_version !== body.expected_revision.head_version || view.receipt.input_basis.generation !== body.expected_revision.generation) throw new Member3Error("INVALID_RESPONSE", "Event receipt differs from requested revision.");
    return view;
  }
  loadScenario(id: string, requestId: string) {
    return this.request<M3LoadedSession>(`/api/scenarios/${encodeURIComponent(id)}/load`, true, { request_id: requestId });
  }
  state(id: string, signal?: AbortSignal) { return this.request<M3ExecutionView>(`/api/sessions/${encodeURIComponent(id)}/state`, true, undefined, signal); }
  orders(id: string, signal?: AbortSignal) { return this.request<M3OrdersView>(`/api/sessions/${encodeURIComponent(id)}/orders`, true, undefined, signal); }
  vehicles(id: string, signal?: AbortSignal) { return this.request<M3VehiclesView>(`/api/sessions/${encodeURIComponent(id)}/vehicles`, true, undefined, signal); }
  locations(id: string, signal?: AbortSignal) { return this.request<M3LocationsView>(`/api/sessions/${encodeURIComponent(id)}/locations`, true, undefined, signal); }
  async compareProfiles(sid: string, body: CompareProfilesRequest, signal?: AbortSignal) {
    return parseComparisonReceipt(await this.request(`/api/sessions/${encodeURIComponent(sid)}/profiles/compare`, true, body, signal));
  }
  async comparison(sid: string, cid: string, signal?: AbortSignal) {
    const view = parseComparisonView(await this.request(`/api/sessions/${encodeURIComponent(sid)}/profiles/comparisons/${encodeURIComponent(cid)}`, true, undefined, signal));
    if (view.session_id !== sid || view.comparison_id !== cid) throw new Member3Error("INVALID_RESPONSE", "Comparison identity differs from requested resource.");
    return view;
  }
  async job(sid: string, jid: string, signal?: AbortSignal) {
    const view = parseJobView(await this.request(`/api/sessions/${encodeURIComponent(sid)}/jobs/${encodeURIComponent(jid)}`, true, undefined, signal));
    if (view.input_basis.session_id !== sid || view.job_id !== jid) throw new Member3Error("INVALID_RESPONSE", "Job identity differs from requested resource.");
    return view;
  }
  async jobForecast(sid: string, jid: string, signal?: AbortSignal) {
    const view = parseJobForecast(await this.request(`/api/sessions/${encodeURIComponent(sid)}/jobs/${encodeURIComponent(jid)}/forecast`, true, undefined, signal));
    if (view.session_id !== sid || view.job_id !== jid) throw new Member3Error("INVALID_RESPONSE", "Forecast identity differs from requested resource.");
    return view;
  }
  async cancelComparison(sid: string, cid: string, requestId: string): Promise<M3ComparisonCancellation> {
    const receipt = await this.request<M3ComparisonCancellation>(`/api/sessions/${encodeURIComponent(sid)}/profiles/comparisons/${encodeURIComponent(cid)}/cancel`, true, { request_id: requestId });
    if (receipt.schema_version !== "saferoute-m3-profile-cancellation/1" || receipt.session_id !== sid || receipt.comparison_id !== cid ||
        !["CANCEL_REQUESTED", "COMPLETED_IMMUTABLE"].includes(receipt.status) || receipt.affects_existing_jobs !== false) throw new Member3Error("INVALID_RESPONSE", "Invalid comparison cancellation receipt.");
    return receipt;
  }

  async accept(sid: string, jid: string, body: AcceptPlanRequest) {
    return parseAcceptanceView(await this.request(`/api/sessions/${encodeURIComponent(sid)}/jobs/${encodeURIComponent(jid)}/accept`, true, body), sid, jid);
  }
  async acceptances(sid: string, signal?: AbortSignal) {
    return parseAcceptanceAudit(await this.request(`/api/sessions/${encodeURIComponent(sid)}/acceptances`, true, undefined, signal), sid);
  }
  private async request<T>(path: string, authenticated = true, body?: { request_id: string }, signal?: AbortSignal): Promise<T> {
    const token = authenticated ? this.token()?.trim() : null;
    if (authenticated && !token) throw new Member3Error("AUTH_REQUIRED", "M3 bearer token required. Configure the token for this browser session.");
    const headers: Record<string, string> = { Accept: "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body) headers["Content-Type"] = "application/json";
    let response: Response;
    try {
      response = await this.fetcher(`${this.baseUrl}${path}`, {
        method: body ? "POST" : "GET", headers, body: body ? JSON.stringify(body) : undefined,
        cache: "no-store", redirect: "error", credentials: "omit", signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(125000)]) : AbortSignal.timeout(125000)
      });
    } catch {
      if (signal?.aborted) throw new DOMException("M3 read aborted", "AbortError");
      throw new Member3Error("NETWORK_ERROR", "Cannot reach M3. Check backend readiness, base URL and CORS.");
    }
    let value: M3Envelope<T>;
    try {
      value = await response.json();
      if (!value || value.schema_version !== "saferoute-m3-http-response/1" || typeof value.request_id !== "string" ||
          !["OK", "ERROR"].includes(value.status) || !Array.isArray(value.diagnostics) ||
          value.diagnostics.some((item) => !item || typeof item.code !== "string" || typeof item.message !== "string")) throw new Error();
    } catch {
      throw new Member3Error("INVALID_RESPONSE", "M3 returned an invalid HTTP response envelope.", response.status);
    }
    if (!response.ok || value.status !== "OK") {
      const first = value.diagnostics[0];
      throw new Member3Error(first?.code ?? "HTTP_ERROR", first?.message ?? "M3 request failed.", response.status, value.request_id, value.diagnostics);
    }
    if (value.data === null || typeof value.data !== "object" || Array.isArray(value.data)) {
      throw new Member3Error("INVALID_RESPONSE", "M3 response data is missing.", response.status, value.request_id);
    }
    return value.data;
  }
}
