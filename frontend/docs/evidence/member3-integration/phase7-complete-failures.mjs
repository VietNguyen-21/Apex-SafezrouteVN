// Complete real fault checks after an already recorded native scenario matrix.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import puppeteer from 'puppeteer-core';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { assertNativeScenarioMatrix, completeNativeReport } from './phase7-evidence.mjs';
import { runFailureMatrix } from './phase7-native-failures.mjs';
assert(process.env.M3_ACCESS_FILE && process.env.M3_PHASE7_CASE_RECEIPT, 'Set private access file and native case receipt');
const access = JSON.parse(await readFile(process.env.M3_ACCESS_FILE));
const token = access.credentials.find(c => c.actor_id === 'member4')?.token; assert(token);
const parent = await readFile(process.env.M3_PHASE7_CASE_RECEIPT);
const report = JSON.parse(parent);
assert.equal(report.status,'FAIL');assertNativeScenarioMatrix(report, report.stage);
if(report.stage==='post-cleanup'){
  const {auditBackendBuild}=await import('../../../scripts/audit-backend-build.mjs');
  const audit=await auditBackendBuild(fileURLToPath(new URL('../../../dist/',import.meta.url)));
  assert.equal(audit.graph_sha256,report.frontend_artifact.graph_sha256,'Preserved cases must use the unchanged audited build');
  const served=await fetch(report.frontend_url+'/build-graph.json');assert.equal(served.status,200);
  assert.equal(createHash('sha256').update(Buffer.from(await served.arrayBuffer())).digest('hex'),audit.graph_sha256);
}
report.failure_checks_continuation={parent_receipt_sha256:createHash('sha256').update(parent).digest('hex'),previous_failure:report.failure,scope:'Five completed native cases preserved unchanged; only interrupted failure checks rerun, no scenario load/physical command/comparison case resubmission'};
report.status='IN_PROGRESS';delete report.cleanup_authorized;delete report.failure;
const output = new URL(`phase7-${report.stage}-native.json`, import.meta.url);
let browser;
async function save(status) {
  report.status = status; report.recorded_at = new Date().toISOString();
  const bytes = JSON.stringify(report);
  for (const c of access.credentials) if (c.token) assert(!bytes.includes(c.token));
  await writeFile(output, bytes);
}
if(process.argv.includes('--finalize-recorded')){
  assert(report.failure_checks_continuation.previous_failure.includes('Matrix must PASS'),'Only the reporting-status interruption may finalize already recorded checks');
  report.failure_checks_continuation.scope='Reporting-status recovery only: all five scenarios and ten failure branches were already recorded PASS; strict complete-matrix validation runs again without any native command or failure-check resubmission';
  Object.assign(report,completeNativeReport(report,report.stage));await save('PASS');
}else try {
  report.failure_checks_started_at = new Date().toISOString();
  await save('IN_PROGRESS');
  browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: true, protocolTimeout: 660000, args: ['--no-sandbox', '--disable-gpu', '--no-first-run'] });
  await runFailureMatrix({ browser, report, base: report.base_url, front: report.frontend_url, token, access });
  Object.assign(report,completeNativeReport(report,report.stage));await save('PASS');
} catch (error) { report.failure = String(error); await save('FAIL'); throw error; }
finally { await browser?.close(); }
