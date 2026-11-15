import assert from 'node:assert/strict';
const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';
const BASE_CASE = { subject: 'Criminal Law I', gr: 'G.R. 123', caseName: 'Sample', topic: '-', type: 'Solo', status: '-' };
const copy = value => JSON.parse(JSON.stringify(value));
export function fixture() {
  const cases = [{ ...BASE_CASE, id: '1', user_id: USER_A, created_at: '2026-11-12' }, { ...BASE_CASE, id: '2', user_id: USER_B, created_at: '2026-11-12' }];
  const workspaces = new Map();
  const calls = [];
  const state = { offline: false, failDatabase: false };
  async function fetchImpl(address, init) {
    if (state.offline) throw new Error('offline');
    const url = new URL(address);
    assert.equal(url.origin, 'https://example.supabase.co');
    assert.equal(init.headers.apikey, 'sb_publishable_test');
    const token = init.headers.Authorization.slice(7);
    const owner = token === 'token-a' ? USER_A : token === 'token-b' ? USER_B : null;
    calls.push({ path: url.pathname, query: url.searchParams, init, owner });
    const respond = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
    if (url.pathname === '/auth/v1/user') return owner ? respond({ id: owner }) : respond({ error: 'invalid' }, 401);
    assert.ok(owner, 'database calls must have an authenticated token');
    if (state.failDatabase) return respond({ message: 'secret internal database detail' }, 500);
    const method = init.method || 'GET';
    if (method !== 'POST') assert.equal(url.searchParams.get('user_id'), 'eq.' + owner, 'explicit owner filter is mandatory');
    const body = init.body ? JSON.parse(init.body) : null;
    if (body && method === 'POST') assert.equal(body.user_id, owner, 'server must set the inserted owner');
    if (url.pathname === '/rest/v1/user_workspaces') {
      if (method === 'POST') {
        assert.match(init.headers.Prefer, /ignore-duplicates/);
        if (!workspaces.has(owner)) workspaces.set(owner, { ...body, revision: 0 });
        return respond([]);
      }
      const row = workspaces.get(owner);
      if (method === 'PATCH') {
        if (!row || 'eq.' + row.revision !== url.searchParams.get('revision')) return respond([]);
        Object.assign(row, body); return respond([row]);
      }
      return respond(row ? [row] : []);
    }
    assert.equal(url.pathname, '/rest/v1/case_digests');
    if (method === 'POST') {
      const row = { ...body, id: String(cases.length + 1), created_at: '2026-11-13' };
      cases.push(row); return respond([row], 201);
    }
    let rows = cases.filter(row => row.user_id === owner);
    if (url.searchParams.has('id')) rows = rows.filter(row => 'eq.' + row.id === url.searchParams.get('id'));
    if (url.searchParams.has('subject')) rows = rows.filter(row => 'eq.' + row.subject === url.searchParams.get('subject'));
    if (method === 'PATCH') for (const row of rows) Object.assign(row, body);
    if (method === 'DELETE') for (const row of rows) cases.splice(cases.indexOf(row), 1);
    const offset = Number(url.searchParams.get('offset') || 0);
    const limit = Number(url.searchParams.get('limit') || 1000);
    return respond(copy(rows.slice(offset, offset + limit)));
  }
  return { cases, workspaces, calls, state, fetchImpl };
}
