"""Browser integration against Vite -> real API handler -> fake Supabase transport.
Run via with_server.py with ports 8080 (Vite) and 3000 (browser-api-server.mjs).
No real accounts, tokens, or live database writes are used.
"""
from playwright.sync_api import sync_playwright, expect

AUTH_STUB = r"""
window.supabase = { createClient() {
  const user = () => ({ id: localStorage.getItem('test-user') === 'b' ? '22222222-2222-4222-8222-222222222222' : '11111111-1111-4111-8111-111111111111', email: 'test@example.invalid' });
  const session = () => ({ user: user(), access_token: window.expireNextToken ? 'invalid' : localStorage.getItem('test-user') === 'b' ? 'token-b' : 'token-a' });
  return { auth: {
    async getSession() { return { data: {session: session()}, error: null }; },
    async refreshSession() { window.expireNextToken = false; return {data:{session:session()}, error:null}; },
    async signOut() { return {error:null}; }
  }, from() { throw new Error('Direct Supabase database access must not be used'); } };
} };
"""

with sync_playwright() as p:
    browser = p.chromium.launch(channel='chrome', headless=True)
    page = browser.new_page(viewport={'width':1440,'height':1000}, reduced_motion='reduce')
    errors = []
    database_requests = []
    requests = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('request', lambda request: requests.append((request.method, request.url)) if '/api/' in request.url else None)
    page.route('https://unpkg.com/**', lambda route: route.fulfill(content_type='application/javascript',body=AUTH_STUB))
    page.route('**.supabase.co/rest/**', lambda route: (database_requests.append(route.request.url), route.abort()))
    page.add_init_script("""
      if (!localStorage.getItem('test-seeded')) {
        localStorage.setItem('activeSubjects_11111111-1111-4111-8111-111111111111', JSON.stringify(['Criminal Law I']));
        localStorage.setItem('archivedSubjects_11111111-1111-4111-8111-111111111111', JSON.stringify(['Previous semester']));
        localStorage.setItem('digest_tracker_theme','blue');
        localStorage.setItem('test-seeded','yes');
      }
    """)
    page.goto('http://127.0.0.1:8080/',wait_until='networkidle')
    expect(page.locator('#app-screen')).to_be_visible()
    expect(page.locator('#table-body')).to_contain_text('G.R. 123')
    expect(page.locator('#archived-list')).to_contain_text('Previous semester')
    page.locator('#input-gr').fill('G.R. 987654')
    page.locator('#input-case').fill('API migration test')
    page.locator('#input-topic').fill('Test doctrine')
    page.get_by_role('button',name='Add Case', exact=True).click()
    row = page.locator('#table-body tr').filter(has_text='G.R. 987654')
    expect(row).to_contain_text('API migration test')
    row.get_by_role('combobox').select_option('DONE')
    expect(page.locator('#toast')).to_have_text('Case status updated.')
    expect(row.get_by_role('combobox')).to_have_value('DONE')
    row.get_by_role('button',name='Edit G.R. 987654', exact=True).click()
    page.locator('#edit-case').fill('Updated through API')
    page.locator('#confirm-edit-btn').click()
    expect(row).to_contain_text('Updated through API')
    page.get_by_role('button',name='Add subject', exact=True).click()
    page.locator('#new-subject-input').fill('API Subject')
    page.locator('#add-subject-modal').get_by_role('button',name='Add Subject',exact=True).click()
    expect(page.locator('#current-subject-title')).to_have_text('API Subject')
    expect(page.locator('#table-body')).to_contain_text('Your next case starts here')
    page.get_by_role('button',name='Archive API Subject',exact=True).click()
    page.locator('#archive-subject-modal').get_by_role('button',name='Archive',exact=True).click()
    expect(page.locator('#archived-list')).to_contain_text('API Subject')
    page.locator('#archived-list').get_by_role('button',name='API Subject',exact=True).click()
    expect(page.locator('#subject-list')).to_contain_text('API Subject')
    with page.expect_response(lambda response: '/api/preferences' in response.url and response.request.method == 'PUT') as theme_response:
        page.locator('#theme-switcher').select_option('emerald')
    assert theme_response.value.status == 200
    page.reload(wait_until='networkidle')
    expect(page.locator('#theme-switcher')).to_have_value('emerald')
    expect(page.locator('#subject-list')).to_contain_text('API Subject')
    expect(page.locator('#table-body')).to_contain_text('Updated through API')
    # A token rejection must refresh and retry once, without losing the signed-in workspace.
    page.evaluate('window.expireNextToken = true')
    page.locator('#subject-list').get_by_role('button',name='API Subject',exact=True).click()
    expect(page.locator('#table-body')).to_contain_text('Your next case starts here')
    page.locator('#subject-list').get_by_role('button',name='Criminal Law I',exact=True).click()
    expect(page.locator('#table-body')).to_contain_text('Updated through API')
    row = page.locator('#table-body tr').filter(has_text='G.R. 987654')
    row.get_by_role('button',name='Delete G.R. 987654',exact=True).click()
    page.locator('#confirm-delete-btn').click()
    expect(page.locator('#table-body')).not_to_contain_text('G.R. 987654')
    # Another account must receive its own workspace and records.
    page.evaluate("localStorage.setItem('test-user','b')")
    page.reload(wait_until='networkidle')
    expect(page.locator('#subject-list')).to_contain_text('Constitutional Law I')
    expect(page.locator('#subject-list')).not_to_contain_text('API Subject')
    page.locator('#subject-list').get_by_role('button',name='Criminal Law I',exact=True).click()
    expect(page.locator('#table-body')).to_contain_text('G.R. 123')
    assert not database_requests, database_requests
    assert not errors, errors
    assert any(method == 'POST' and '/api/cases' in url for method,url in requests)
    assert any(method == 'PATCH' and '/api/cases/' in url for method,url in requests)
    assert any(method == 'DELETE' and '/api/cases/' in url for method,url in requests)
    print('PASS: browser case CRUD/status, subject import/add/archive/restore, theme persistence, token refresh, account separation, API routing; zero direct database requests or page errors.')
    browser.close()
