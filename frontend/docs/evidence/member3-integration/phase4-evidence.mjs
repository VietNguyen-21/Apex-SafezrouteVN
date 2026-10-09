import { createHash } from 'node:crypto';

export function summarizeResponse(response) {
  const { envelope, ...metadata } = response;
  const data = envelope?.data ?? {};
  const fields = ['schema_version', 'session_id', 'job_id', 'basis', 'input_basis', 'job_status', 'business_status',
    'validation_status', 'plan_available', 'coverage_evaluated', 'receipt'];
  return { ...metadata, envelope_json_stringify_sha256: createHash('sha256').update(JSON.stringify(envelope)).digest('hex'),
    envelope_summary: { ...Object.fromEntries(fields.filter(key => key in data).map(key => [key, data[key]])),
      diagnostics: envelope?.diagnostics ?? [] } };
}
