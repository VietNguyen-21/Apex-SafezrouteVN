export function enabledSelector(selector) { const element = document.querySelector(selector); return Boolean(element && !element.disabled); }
// Read-only instrumentation: preserve the real fetch, request, response and errors.
// Chrome may report requestfailed after a replacement request starts; measure
// uncancelled fetches at the AbortSignal boundary separately from transport events.
export function installFetchProbe(base) {
  const fetch = window.fetch.bind(window), active = new Map();
  const probe = window.__phase6FetchProbe = { maxima: {}, reads: [] };
  window.fetch = async (input, options) => {
    const url = new URL(typeof input === 'string' ? input : input.url, location.href);
    if (url.origin !== new URL(base).origin || (options?.method ?? 'GET') !== 'GET') return fetch(input, options);
    const row = { path: url.pathname, started_at_ms: performance.now() }, key = row.path;
    probe.reads.push(row);
    let counted = !options?.signal?.aborted;
    if (counted) { active.set(key, (active.get(key) ?? 0) + 1); probe.maxima[key] = Math.max(probe.maxima[key] ?? 0, active.get(key)); }
    const release = () => { if (counted) { active.set(key, active.get(key) - 1); counted = false; } };
    const abort = () => { row.aborted_at_ms = performance.now(); release(); };
    options?.signal?.addEventListener('abort', abort, { once: true });
    const finish = () => { row.settled_at_ms = performance.now(); release(); options?.signal?.removeEventListener('abort', abort); };
    try {
      const response = await fetch(input, options), json = response.json.bind(response);
      // Keep tracking through the client's real JSON body read, not just headers.
      response.json = async () => { try { return await json(); } finally { finish(); } };
      return response;
    } catch (error) { finish(); throw error; }
  };
}
