import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { shouldRefreshAccessToken } from '../apps/web/src/app/core/auth-token-expiry.ts';

const nginxConfig = await readFile(
  new URL('../docker/nginx/default.conf', import.meta.url),
  'utf8',
);
const apiBootstrap = await readFile(
  new URL('../apps/api/src/main.ts', import.meta.url),
  'utf8',
);

assert.match(
  nginxConfig,
  /location \/api\/\s*\{[\s\S]*?client_max_body_size\s+25m;/,
  'Nginx must accept Bible imports up to the application limit',
);
assert.match(
  apiBootstrap,
  /useBodyParser\('json', \{ limit: '25mb' \}\)/,
  'Nest must accept the same 25 MB JSON payload limit',
);

const now = Date.parse('2026-09-16T12:00:00.000Z');
assert.equal(
  shouldRefreshAccessToken('2026-09-16T12:00:29.999Z', now),
  true,
  'an access token inside the refresh window must be refreshed proactively',
);
assert.equal(
  shouldRefreshAccessToken('2026-09-16T12:00:30.001Z', now),
  false,
  'a valid access token outside the refresh window must be reused',
);
assert.equal(
  shouldRefreshAccessToken('invalid-date', now),
  true,
  'an invalid expiry must never be trusted',
);

console.log(JSON.stringify({ ok: true, checks: 5 }));
