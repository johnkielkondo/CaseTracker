import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../api/server.mjs';
import { fixture } from './fixtures/supabase.mjs';

const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';
const BASE_CASE = { subject: 'Criminal Law I', gr: 'G.R. 123', caseName: 'Sample', topic: '-', type: 'Solo', status: '-' };
async function withApi(run, configured = true) {
  const f = fixture();
  const server = createServer({ instanceId: 'i-api-test' }, { config: configured ? { url: 'https://example.supabase.co', key: 'sb_publishable_test' } : {}, fetchImpl: f.fetchImpl });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = 'http://127.0.0.1:' + server.address().port;
  async function request(path, { token = 'token-a', method = 'GET', body, raw, headers = {} } = {}) {
    const response = await fetch(origin + '/api' + path, {
      method, headers: { ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(body !== undefined || raw !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers },
      body: raw !== undefined ? raw : body !== undefined ? JSON.stringify(body) : undefined
    });
    return { status: response.status, headers: response.headers, body: await response.json() };
  }
  try { await run({ ...f, request }); }
  finally { await new Promise(resolve => server.close(resolve)); }
}

test('diagnostics remain available without database configuration; business endpoints fail closed', () => withApi(async ({ request }) => {
  assert.equal((await request('/health', { token: null })).status, 200);
  assert.equal((await request('/health')).body.caseManagementConfigured, false);
  assert.equal((await request('/workspace')).status, 503);
  assert.equal((await request('/stress')).status, 404);
}, false));

test('unauthenticated, invalid, and forged tokens cannot reach the database', () => withApi(async ({ request, calls }) => {
  for (const token of [null, 'invalid', 'eyJhbGciOiJub25lIn0.eyJzdWIiOiJhZG1pbiJ9.']) {
    assert.equal((await request('/cases?subject=Criminal+Law+I', { token })).status, 401);
  }
  assert.equal(calls.filter(call => call.path.startsWith('/rest/')).length, 0);
}));

test('case CRUD derives ownership from verified identity and never reads or changes another user', () => withApi(async ({ request, cases }) => {
  const listed = await request('/cases?subject=Criminal+Law+I');
  assert.equal(listed.status, 200);
  assert.deepEqual(listed.body.data.map(row => row.id), ['1']);
  assert.equal(listed.body.nextOffset, null);
  for (const method of ['PATCH', 'DELETE']) {
    const response = await request('/cases/2', { method, ...(method === 'PATCH' ? { body: { status: 'DONE' } } : {}) });
    assert.equal(response.status, 404);
  }
  assert.equal(cases.find(row => row.id === '2').status, '-');
  assert.equal((await request('/cases', { method: 'POST', body: { ...BASE_CASE, user_id: USER_B } })).status, 400);
  const created = await request('/cases', { method: 'POST', body: BASE_CASE });
  assert.equal(created.status, 201);
  assert.equal(created.body.data.user_id, USER_A);
  assert.match(created.body.data.link, /^https:\/\/www\.google\.com\/search\?q=/);
  const id = created.body.data.id;
  assert.equal((await request('/cases/' + id, { method: 'PATCH', body: { status: 'DONE', topic: 'New doctrine' } })).body.data.status, 'DONE');
  const edit = await request('/cases/' + id, { method: 'PATCH', body: { gr: 'G.R. 999', caseName: 'Updated' } });
  assert.match(decodeURIComponent(edit.body.data.link), /G\.R\. 999 Updated/);
  assert.equal((await request('/cases/' + id, { method: 'DELETE' })).status, 200);
  assert.equal((await request('/cases/' + id, { method: 'DELETE' })).status, 404);
  const userB = await request('/cases?subject=Criminal+Law+I', { token: 'token-b' });
  assert.deepEqual(userB.body.data.map(row => row.id), ['2']);
}));

test('validation rejects mass assignment, invalid values, malformed/oversize JSON, and incorrect methods', () => withApi(async ({ request }) => {
  for (const body of [{ ...BASE_CASE, gr: '' }, { ...BASE_CASE, type: 'Admin' }, { ...BASE_CASE, status: 'INVALID' }, { ...BASE_CASE, status: null }, { ...BASE_CASE, link: 'javascript:alert(1)' }, { ...BASE_CASE, subject: 'x'.repeat(161) }, []]) {
    assert.equal((await request('/cases', { method: 'POST', body })).status, 400);
  }
  assert.equal((await request('/cases/1', { method: 'PATCH', body: { user_id: USER_B } })).status, 400);
  assert.equal((await request('/cases/1', { method: 'PATCH', body: {} })).status, 400);
  assert.equal((await request('/cases', { method: 'POST', raw: '{' })).status, 400);
  assert.equal((await request('/cases', { method: 'POST', raw: 'x'.repeat(33000) })).status, 413);
  assert.equal((await request('/cases', { method: 'POST', raw: '{}', headers: { 'Content-Type':'text/plain' } })).status, 415);
  assert.equal((await request('/cases')).status, 400);
  assert.equal((await request('/cases?subject=Criminal+Law+I&offset=-1')).status, 400);
  const method = await request('/cases/1', { method: 'GET' });
  assert.equal(method.status, 405);
  assert.equal(method.headers.get('allow'), 'PATCH, DELETE');
}));

test('case pagination does not truncate lists over 200 records', () => withApi(async ({ request, cases }) => {
  for (let i = 0; i < 205; i++) cases.push({ ...BASE_CASE, id: String(100+i), user_id: USER_A });
  const first = await request('/cases?subject=Criminal+Law+I');
  assert.equal(first.body.data.length, 200);
  assert.equal(first.body.nextOffset, 200);
  const second = await request('/cases?subject=Criminal+Law+I&offset=200');
  assert.equal(second.body.data.length, 6);
  assert.equal(second.body.nextOffset, null);
}));

test('workspace import recovers old case subjects, preserves archives, and never overwrites existing cloud data', () => withApi(async ({ request, cases }) => {
  cases.push({ ...BASE_CASE, id:'3', subject:'Taxation', user_id:USER_A });
  assert.equal((await request('/workspace')).body.data, null);
  const imported = await request('/workspace', { method:'POST', body:{ activeSubjects:['Criminal Law I'], archivedSubjects:['Old subject'], theme:'dark', customColor:'#112233' } });
  assert.equal(imported.status, 200);
  assert.deepEqual(imported.body.data.activeSubjects, ['Criminal Law I', 'Taxation']);
  assert.deepEqual(imported.body.data.archivedSubjects, ['Old subject']);
  assert.equal(imported.body.data.theme, 'dark');
  const repeated = await request('/workspace', { method:'POST', body:{ activeSubjects:['Wrong'], archivedSubjects:[], theme:'blue', customColor:'#ffffff' } });
  assert.deepEqual(repeated.body, imported.body);
  assert.equal((await request('/workspace', { token:'token-b' })).body.data, null);
}));

test('workspace updates use optimistic concurrency and isolate accounts', () => withApi(async ({ request }) => {
  await request('/workspace', { method:'POST', body:{} });
  const subjects = await request('/subjects', { method:'PUT', body:{ activeSubjects:['New subject'], archivedSubjects:['Old subject'], version:0 } });
  assert.equal(subjects.body.data.version, 1);
  const stale = await request('/preferences', { method:'PUT', body:{ theme:'dark', customColor:'#123456', version:0 } });
  assert.equal(stale.status, 409);
  const prefs = await request('/preferences', { method:'PUT', body:{ theme:'dark', customColor:'#ABCDEF', version:1 } });
  assert.equal(prefs.body.data.customColor, '#abcdef');
  assert.deepEqual(prefs.body.data.activeSubjects, ['New subject']);
  assert.equal((await request('/subjects', { method:'PUT', token:'token-b', body:{ activeSubjects:[], archivedSubjects:[], version:2 } })).status, 409);
  for (const body of [{ activeSubjects:['Duplicate'], archivedSubjects:['Duplicate'], version:2 }, { activeSubjects:[], archivedSubjects:[], version:-1 }]) {
    assert.equal((await request('/subjects', { method:'PUT', body })).status, 400);
  }
  assert.equal((await request('/preferences', { method:'PUT', body:{ theme:'unknown', customColor:'#ffffff', version:2 } })).status, 400);
}));

test('dependency failures return safe errors and keep public health operational', () => withApi(async ({ request, state }) => {
  state.offline = true;
  assert.equal((await request('/workspace')).status, 503);
  assert.equal((await request('/health')).status, 200);
  state.offline = false; state.failDatabase = true;
  const failed = await request('/workspace');
  assert.equal(failed.status, 503);
  assert.doesNotMatch(JSON.stringify(failed.body), /secret internal database detail/);
}));

test('service-role and non-HTTPS configuration is rejected', () => {
  for (const config of [{ url:'https://example.supabase.co', key:'sb_secret_test' }, { url:'http://example.supabase.co', key:'sb_publishable_test' }]) {
    assert.throws(() => createServer({}, { config }), /Configure SUPABASE_URL/);
  }
});
