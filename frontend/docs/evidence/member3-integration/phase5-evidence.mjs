import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

export function expiryOracle(bytes, session, eventId) {
  const fixture = JSON.parse(bytes);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), session.fixture_sha256, 'Expiry oracle must be the server-owned pinned fixture');
  assert.equal(fixture.scenarioId, 'S4');
  const rain = fixture.events.find(e => e.eventId === eventId); assert(rain && rain.endTime);
  return { source: 'scenarios/fixtures/thu-duc-binh-thanh-v1/S4.json (test harness only)',
    sha256: createHash('sha256').update(bytes).digest('hex'), event_id: rain.eventId, end_time: rain.endTime };
}

// Serialized by Puppeteer into the browser context.
export function acceptanceVisible(jobId) {
  return document.body.textContent.includes(`Accepted ${jobId}`) &&
    [...document.querySelectorAll('button')].some(b => b.textContent === 'Refresh backend' && !b.disabled);
}

export function requireCurrentBasis(actual, expected) {
  assert.deepEqual(actual, expected, 'Native forecast must bind the complete current basis');
}
