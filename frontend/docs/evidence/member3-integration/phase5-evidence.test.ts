import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { acceptanceVisible, expiryOracle } from './phase5-evidence.mjs';

describe('Phase 5 native evidence guards', () => {
  const bytes = Buffer.from(JSON.stringify({ scenarioId: 'S4', events: [{ eventId: 'S4-E1', endTime: '2026-09-27T22:15:00+07:00' }] }));
  const session = { fixture_sha256: createHash('sha256').update(bytes).digest('hex') };
  it('rejects another fixture with the same event ID and a different expiry', () => {
    const changed = Buffer.from(bytes.toString().replace('22:15', '23:15'));
    expect(() => expiryOracle(changed, session, 'S4-E1')).toThrow();
    expect(expiryOracle(bytes, session, 'S4-E1').end_time).toBe('2026-09-27T22:15:00+07:00');
  });
  it('rejects a correctly hashed fixture belonging to another scenario', () => {
    const changed = Buffer.from(bytes.toString().replace('scenarioId":"S4', 'scenarioId":"S2'));
    expect(() => expiryOracle(changed, { fixture_sha256: createHash('sha256').update(changed).digest('hex') }, 'S4-E1')).toThrow();
  });
  it('does not treat a disabled pending Accept as a completed acceptance', () => {
    document.body.innerHTML = '<button aria-label="Accept selected plan" disabled>Accept</button><button disabled>Refresh backend</button>';
    expect(acceptanceVisible('balanced-1')).toBe(false);
    document.body.innerHTML = '<p>Accepted another-job</p><button aria-label="Accept selected plan" disabled>Accept</button><button>Refresh backend</button>';
    expect(acceptanceVisible('balanced-1')).toBe(false);
    document.body.innerHTML = '<p>Accepted balanced-1</p><button aria-label="Accept selected plan" disabled>Accept</button><button>Refresh backend</button>';
    expect(acceptanceVisible('balanced-1')).toBe(true);
  });
});
