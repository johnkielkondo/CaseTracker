import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from '../api/server.mjs';
import { setTimeout as delay } from 'node:timers/promises';
import { once } from 'node:events';
import net from 'node:net';

async function freePort() {
  const socket = net.createServer();
  await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  return port;
}
async function startWeb(apiBaseUrl) {
  const port = await freePort();
  const origin = `http://127.0.0.1:${port}`;
  const processHandle = spawn('dotnet', ['bin/Release/net10.0/CaseTracker.dll'], {
    env: { ...process.env, ASPNETCORE_URLS: origin, ApiBaseUrl: apiBaseUrl, ASPNETCORE_ENVIRONMENT: 'Production' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let output = '';
  processHandle.stdout.on('data', chunk => output += chunk);
  processHandle.stderr.on('data', chunk => output += chunk);
  try {
    for (let attempt = 0; attempt < 100; attempt++) {
      if (processHandle.exitCode !== null) throw new Error(output);
      try { if ((await fetch(origin + '/health')).ok) return { processHandle, origin }; } catch {}
      await delay(100);
    }
    throw new Error('Web host did not start: ' + output);
  } catch (error) { processHandle.kill(); throw error; }
}
async function stopWeb(web) {
  const exited = once(web.processHandle, 'exit');
  web.processHandle.kill();
  await exited;
}
const api = createServer({ instanceId: 'i-api-test', privateIp: '127.0.0.1', availabilityZone: 'test-zone' });
await new Promise(resolve => api.listen(0, '127.0.0.1', resolve));
const apiOrigin = `http://127.0.0.1:${api.address().port}`;
let web;
try {
  web = await startWeb(apiOrigin);
  const site = await fetch(web.origin + '/');
  assert.equal(site.status, 200);
  assert.match(await site.text(), /<html/i);
  assert.equal((await fetch(web.origin + '/lab-index.html')).status, 200);
  const health = await fetch(web.origin + '/api/health?check=forwarding');
  assert.equal(health.status, 200);
  assert.equal(health.headers.get('cache-control'), 'no-store');
  assert.equal((await health.json()).instanceId, 'i-api-test');
  const info = await (await fetch(web.origin + '/api/info')).json();
  assert.equal(info.instanceId, 'i-api-test');
  assert.equal((await fetch(web.origin + '/api/missing')).status, 404);
  const method = await fetch(web.origin + '/api/health', { method: 'POST', body: 'payload' });
  assert.equal(method.status, 405);
  assert.equal(method.headers.get('allow'), 'GET');
  await new Promise(resolve => api.close(resolve));
  assert.equal((await fetch(web.origin + '/api/health')).status, 502);
  assert.equal((await fetch(web.origin + '/')).status, 200);
  await stopWeb(web);
  web = await startWeb('');
  assert.equal((await fetch(web.origin + '/api/health')).status, 503);
  assert.equal((await fetch(web.origin + '/')).status, 200);
  console.log('PASS: static site, dashboard, API forwarding, response headers/status/methods, API outage, missing API configuration.');
} finally {
  if (web) await stopWeb(web);
  if (api.listening) await new Promise(resolve => api.close(resolve));
}
