import { expect, it } from 'vitest';
import { enabledSelector, installFetchProbe } from './phase6-evidence.mjs';
it('does not treat a missing action as enabled during initial loading', () => {
  document.body.innerHTML = '<p>Loading…</p>';
  expect(enabledSelector('[aria-label="Select BALANCED"]')).toBe(false);
  document.body.innerHTML = '<button aria-label="Select BALANCED" disabled>Select</button>';
  expect(enabledSelector('[aria-label="Select BALANCED"]')).toBe(false);
  document.querySelector<HTMLButtonElement>('button')!.disabled = false;
  expect(enabledSelector('[aria-label="Select BALANCED"]')).toBe(true);
});
it('detects duplicate GETs while the first real response body is still unread', async () => {
  const original = window.fetch, base = 'http://127.0.0.1:8004', path = '/api/sessions/owned/state';
  window.fetch = async () => new Response('{}');
  try {
    installFetchProbe(base);
    const first = await window.fetch(base + path), second = await window.fetch(base + path);
    expect(Reflect.get(window, '__phase6FetchProbe').maxima[path]).toBe(2);
    await first.json(); await second.json();
  } finally { window.fetch = original; }
});
it('measures aborted GETs separately when their replacements begin', async () => {
  const original = window.fetch, base = 'http://127.0.0.1:8004', path = '/api/sessions/owned/state';
  window.fetch = async () => new Response('{}');
  try {
    installFetchProbe(base);
    const controller = new AbortController(), first = await window.fetch(base + path, { signal: controller.signal });
    controller.abort();
    const second = await window.fetch(base + path);
    const probe = Reflect.get(window, '__phase6FetchProbe');
    expect(probe.maxima[path]).toBe(1); expect(probe.reads[0].aborted_at_ms).toEqual(expect.any(Number));
    await first.json(); await second.json();
  } finally { window.fetch = original; }
});
