"""Milestone 3 frontend E2E (milestone 3 web spec, AC-8 to AC-18 and AC-20).

Prerequisites: local Postgres, `npm run db:seed` (dev@example.com), `npm run dev` (3000 + 5173).
Run: python3 test/e2e/m3_web.py [--shots DIR]
"""
import json, os, subprocess, sys, time
from playwright.sync_api import sync_playwright, expect

BASE = os.environ.get('E2E_BASE', 'http://localhost:5173')
MCP = os.environ.get('E2E_MCP', 'http://localhost:3000/mcp')
EMAIL, PASSWORD = 'dev@example.com', 'devpass123'
SHOTS = sys.argv[sys.argv.index('--shots') + 1] if '--shots' in sys.argv else None
TS = str(int(time.time()))
A, B = f'wiki/e2e-{TS}-a.md', f'wiki/e2e-{TS}-b.md'
TITLE_A, TITLE_B = f'E2E A {TS}', f'E2E B {TS}'

def env_token():
    for line in open('.env'):
        if line.startswith('DEV_MCP_TOKEN='):
            return line.strip().split('=', 1)[1]
    raise SystemExit('.env is missing DEV_MCP_TOKEN')

def mcp(token, name, args):
    body = json.dumps({'jsonrpc': '2.0', 'id': 1, 'method': 'tools/call', 'params': {'name': name, 'arguments': args}})
    r = subprocess.run(['curl', '-s', '-o', '/dev/null', '-w', '%{http_code}', '-X', 'POST', MCP, '-H', 'Content-Type: application/json',
                        '-H', 'Accept: application/json, text/event-stream', '-H', f'Authorization: Bearer {token}', '-d', body], capture_output=True, text=True)
    return int(r.stdout.strip())

results = []
def ac(n, ok, note=''):
    results.append((n, ok, note)); print(('✔' if ok else '✖'), n, note)

def shot(page, name):
    if SHOTS: page.screenshot(path=os.path.join(SHOTS, f'{name}.png'), full_page=False)

def login(page):
    page.goto(BASE + '/login')
    page.fill('#email', EMAIL); page.fill('#password', PASSWORD)
    page.click('button:has-text("登入")')
    page.wait_for_selector('[data-testid=sidebar]', state='attached')
    page.wait_for_selector('text=wiki／知識頁', state='attached')

def new_note(page, layer, rel, body):
    page.click('button:has-text("＋ 新增")')
    page.select_option('#nf-layer', layer)
    page.fill('#nf-path', rel); page.fill('#nf-body', body)
    page.click('button:has-text("建立筆記")')
    page.wait_for_url(f'**/n/{layer}/{rel}.md')
    page.wait_for_selector('article h1')

with sync_playwright() as p:
  browser = p.chromium.launch()
  try:
      ctx = browser.new_context(viewport={'width': 1280, 'height': 800}, locale='zh-TW', permissions=['clipboard-read', 'clipboard-write'])
      page = ctx.new_page()
      page.on('dialog', lambda d: d.accept())
      token = env_token()

      # AC-8
      page.goto(BASE + '/'); page.wait_for_selector('[data-testid=landing]'); shot(page, '00-landing'); page.click('[data-testid=landing-login]'); page.wait_for_url('**/login'); shot(page, '01-login')
      login(page)
      ok8 = all(page.locator(f'text={t}').count() > 0 for t in ['raw／原始來源', 'wiki／知識頁', 'schema／規則層'])
      ac('AC-8 login redirect and three layers', ok8); shot(page, '02-home')

      # AC-9: create A (with an existing link and a missing-page link)
      new_note(page, 'wiki', f'e2e-{TS}-a', f'# {TITLE_A}\n\n連到 [[{TITLE_B}]] 與 [[wiki/llm-wiki-pattern]]。')
      missing = page.locator(f'[data-missing-link="{TITLE_B}"]')
      ok_missing = missing.count() == 1 and '尚未建立' in (missing.get_attribute('title') or '')
      page.click('a.wl:has-text("wiki/llm-wiki-pattern")')
      page.wait_for_url('**/n/wiki/llm-wiki-pattern.md')
      ok_jump = page.locator('article h1').inner_text() != ''
      ac('AC-9 wiki-link navigation and missing-page hint', ok_missing and ok_jump); shot(page, '03-note')

      # AC-10: edit and save; raw has no edit
      page.goto(f'{BASE}/n/{A}'); page.wait_for_selector('article h1')
      page.click('button:has-text("編輯")')
      page.fill('textarea[aria-label="Markdown 內容"]', f'# {TITLE_A}\n\n第二版內容 {TS}。')
      shot(page, '04-editor')
      page.click('button:has-text("儲存")')
      page.wait_for_selector(f'text=第二版內容 {TS}')
      page.wait_for_selector('[data-testid=version-2]')
      v2 = page.locator('[data-testid=version-2]')
      v2text = v2.inner_text()
      ok10 = v2.count() == 1 and EMAIL in v2text
      page.goto(f'{BASE}/n/raw/sources/karpathy-llm-wiki.md'); page.wait_for_selector('article h1')
      ok_raw = page.locator('article button:has-text("編輯")').count() == 0 and page.locator('text=唯讀來源').count() > 0
      ac('AC-10 edit/save with versions, raw read-only', ok10 and ok_raw, f'v2={ok10} raw={ok_raw} v2text={v2text[:60]!r}')

      # AC-11: concurrent MCP update -> 409 -> load latest
      page.goto(f'{BASE}/n/{A}'); page.wait_for_selector('article h1')
      page.click('button:has-text("編輯")')
      page.fill('textarea[aria-label="Markdown 內容"]', f'# {TITLE_A}\n\n網頁端第三版。')
      assert mcp(token, 'update_note', {'path': A, 'content': f'# {TITLE_A}\n\nMCP 搶先寫入 {TS}。', 'if_version': 2}) == 200
      page.click('button:has-text("儲存")')
      page.wait_for_selector('text=他人已更新此頁')
      shot(page, '05-conflict')
      page.click('button:has-text("保留我的修改並載入最新版本號")')
      page.wait_for_selector('text=你的修改仍在編輯器裡')
      kept = page.locator('textarea[aria-label="Markdown 內容"]').input_value()   # the draft was not discarded
      page.click('button:has-text("取消")')                                        # discard own changes -> see the other side's latest content
      page.wait_for_selector(f'text=MCP 搶先寫入 {TS}')
      ac('AC-11 409 conflict notice, keep draft, load latest', '網頁端第三版' in kept, f'kept={kept[-20:]!r}')
      for b in page.locator('[role=status] button[aria-label="關閉"]').all(): b.click()   # dismiss sticky toasts

      # AC-12: create B linking back to A -> B appears in A's backlinks; A's missing-page link becomes clickable
      new_note(page, 'wiki', f'e2e-{TS}-b', f'# {TITLE_B}\n\n回連 [[{TITLE_A}]]。')
      page.click(f'a.wl:has-text("{TITLE_A}")'); page.wait_for_url(f'**/n/{A}')
      page.wait_for_selector(f'[data-testid=rail] >> text={TITLE_B}')
      ac('AC-12 backlink appears after creation', page.locator(f'[data-missing-link="{TITLE_B}"]').count() == 0)

      # AC-13: search
      page.fill('input[aria-label="搜尋"]', TITLE_B); page.press('input[aria-label="搜尋"]', 'Enter')
      page.wait_for_selector('text=筆結果')
      page.click(f'button:has-text("{TITLE_B}")'); page.wait_for_url(f'**/n/{B}')
      ac('AC-13 search and open', True)

      # AC-14: version view and rollback (A is at v3, roll back to v1)
      page.goto(f'{BASE}/n/{A}'); page.wait_for_selector('[data-testid=version-1]')
      page.click('[data-testid=version-1] button:has-text("檢視")')
      page.wait_for_selector('text=這是 v1 的歷史版本')
      ok_hist = page.locator(f'[data-missing-link], a.wl:has-text("{TITLE_B}")').count() >= 1  # v1 content contains [[B]]
      page.click('button:has-text("復原到此版本")')
      page.wait_for_selector('[data-testid=version-4]')
      ok_rb = page.locator('text=v4').count() > 0 and page.locator(f'a.wl:has-text("{TITLE_B}")').count() == 1
      ac('AC-14 version view and rollback', ok_hist and ok_rb); shot(page, '06-versions')

      # AC-20: graph
      tree_count = page.evaluate("fetch('/api/notes/tree').then(r=>r.json()).then(d=>d.notes.length)")
      page.click('button[role=tab]:has-text("圖譜")'); page.wait_for_selector('[data-testid=graph]')
      page.wait_for_timeout(800)
      node_count = int(page.locator('[data-testid=graph]').get_attribute('data-node-count'))
      page.wait_for_selector('[data-testid=graph-timeline]')
      page.locator('[data-testid=graph-timeline] input[type=range]').evaluate("el => { const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; s.call(el, el.min); el.dispatchEvent(new Event('input', {bubbles:true})); }")
      page.wait_for_timeout(400)
      early = int(page.locator('[data-testid=graph]').get_attribute('data-node-count'))
      page.click('[data-testid=graph-timeline] button:has-text("回到現在")'); page.wait_for_timeout(400)
      assert early < node_count, f'timeline at earliest should show fewer than {node_count} nodes, got {early}'
      page.click('[data-testid=zoom-in]'); page.click('[data-testid=zoom-in]'); page.wait_for_timeout(100)
      scale_in = page.evaluate("document.querySelector('canvas').__view.scale")
      page.click('[data-testid=zoom-reset]'); page.wait_for_timeout(100)
      scale_reset = page.evaluate("document.querySelector('canvas').__view.scale")
      # drag empty space to pan
      box = page.locator('canvas').bounding_box(); page.mouse.move(box['x'] + 5, box['y'] + 5); page.mouse.down(); page.mouse.move(box['x'] + 65, box['y'] + 45, steps=5); page.mouse.up(); page.wait_for_timeout(100)
      pan = page.evaluate("(()=>{const v=document.querySelector('canvas').__view;return [v.ox,v.oy]})()")
      page.click('[data-testid=zoom-reset]'); page.wait_for_timeout(300)
      shot(page, '07-graph')
      # graph filter: hide the raw layer -> fewer nodes; clear filter -> restored
      total_nodes = int(page.locator('[data-testid=graph]').get_attribute('data-node-count'))
      page.click('[data-testid=graph-filter-toggle]'); page.wait_for_selector('[data-testid=graph-filters]')
      page.uncheck('[data-testid=graph-filters] input[type=checkbox] >> nth=0'); page.wait_for_timeout(300)
      fewer = int(page.locator('[data-testid=graph]').get_attribute('data-node-count'))
      page.fill('[data-testid=graph-search]', TITLE_A); page.wait_for_timeout(300)
      one = int(page.locator('[data-testid=graph]').get_attribute('data-node-count'))
      page.click('[data-testid=graph-filter-clear]'); page.wait_for_timeout(300)
      back = int(page.locator('[data-testid=graph]').get_attribute('data-node-count'))
      ac('GRAPH filters: layer, search, clear', fewer < total_nodes and one == 1 and back == total_nodes, f'{total_nodes}→{fewer}→{one}→{back}')
      shot(page, '07b-graph-filters'); page.click('[data-testid=graph-filter-toggle]')
      # nodes keep jittering in the physics simulation, so read coordinates and dispatch pointer events in the same evaluate to avoid drift
      page.evaluate(f"""(()=>{{const c=document.querySelector('canvas');const n=c.__nodes.find(n=>n.path==={json.dumps(A)});const v=c.__view;const r=c.getBoundingClientRect();
        const x=r.left+n.x*v.scale+v.ox, y=r.top+n.y*v.scale+v.oy;
        for (const type of ['pointerdown','pointerup']) c.dispatchEvent(new PointerEvent(type, {{bubbles:true, clientX:x, clientY:y, pointerId:1, pointerType:'mouse', isPrimary:true, button:0}}));}})()""")
      page.wait_for_url(f'**/n/{A}')
      ok_zoom = abs(scale_in - 1.5625) < 1e-6 and scale_reset == 1 and abs(pan[0] - 60) < 2 and abs(pan[1] - 40) < 2
      ac('AC-20 graph node count, click opens page, zoom and pan', node_count == tree_count and ok_zoom, f'nodes={node_count} tree={tree_count} zoom={scale_in} pan={pan}')

      # AC-15: delete B
      page.goto(f'{BASE}/n/{B}'); page.wait_for_selector('article h1')
      page.click('button:has-text("刪除")'); page.click('[data-testid=confirm-ok]')
      page.wait_for_url(BASE + '/')
      gone = page.locator(f'[data-testid=sidebar] >> text={TITLE_B}').count() == 0
      page.goto(f'{BASE}/n/{B}'); page.wait_for_selector('text=找不到筆記')
      ac('AC-15 delete', gone)

      # AC-16: settings page tokens
      page.goto(BASE + '/settings'); page.wait_for_selector('text=MCP token')
      page.wait_for_selector('[data-testid=usage] >> text=筆記數')
      page.wait_for_selector('[data-testid=template-picker] >> text=研究者')   # milestone 5: templates can be applied from settings
      page.wait_for_selector('[data-testid=ai-settings] >> text=AI 供應商')   # Q9: AI provider settings section
      page.wait_for_selector('[data-testid=app-version]:has-text("WikiBrain v")')
      assert page.locator('[data-testid=export-link]').get_attribute('href') == '/api/export'
      zip_status = page.evaluate("fetch('/api/export').then(r => r.status)")
      assert zip_status == 200, f'export status {zip_status}'
      page.fill('#label', 'cursor'); page.click('button:has-text("產生新 token")')
      fresh = page.locator('[data-testid=fresh-token]').inner_text().strip()
      page.click('button:has-text("複製"):near([data-testid=fresh-token])')
      clip = page.evaluate('navigator.clipboard.readText()')
      before = mcp(fresh, 'list_folder', {})
      shot(page, '08-settings')
      ac('ZOTERO settings section present', page.locator('[data-testid=zotero-settings] >> text=Zotero').count() >= 1 and page.locator('[data-testid=oauth-intro]').count() == 1)
      row = page.locator('tr', has_text='cursor').first
      row.locator('button:has-text("撤銷")').click(); page.click('[data-testid=confirm-ok]')
      page.wait_for_selector('text=已撤銷')
      after = mcp(fresh, 'list_folder', {})
      ac('AC-16 token create/copy/revoke', fresh.startswith('wb_live_') and clip == fresh and before == 200 and after == 401, f'before={before} after={after}')

      # AC-17: connect Cursor
      page.goto(BASE + '/settings'); page.wait_for_selector('text=連接 agent')
      page.click('button:has-text("連接 Cursor")')
      page.click('button:has-text("產生 token")')
      page.wait_for_selector('button:has-text("重發 token")')  # only appears after the token is created
      snippet = page.locator('[data-testid=mcp-json]').inner_text()
      page.click('[role=dialog] button:has-text("複製")')   # the settings page behind also has a copy button; restrict to the dialog
      clip2 = page.evaluate('navigator.clipboard.readText()')
      shot(page, '09-connect')
      norm = lambda x: ''.join(x.split())
      if norm(clip2) != norm(snippet):
          open(os.path.join(SHOTS or '.', 'ac17-clip.txt'), 'w').write(clip2); open(os.path.join(SHOTS or '.', 'ac17-snip.txt'), 'w').write(snippet)
      ac('AC-17 mcp.json snippet and copy', '/mcp' in snippet and norm(clip2) == norm(snippet), f'len clip={len(clip2)} snip={len(snippet)}')

      page.click('[role=dialog] button:has-text("完成")')
      # i18n: switch settings to English -> UI, <html lang> and /api/me all change; switch back to zh-TW
      page.goto(BASE + '/settings'); page.wait_for_selector('[data-testid=lang-select]')
      page.select_option('[data-testid=lang-select]', 'en'); page.wait_for_selector('text=Interface language')
      en_ok = page.evaluate("document.documentElement.lang") == 'en' and page.evaluate("fetch('/api/me').then(r=>r.json()).then(m=>m.workspace.lang)") == 'en'
      page.goto(BASE + '/'); page.wait_for_selector('[data-testid=sidebar]', state='attached')
      en_home = page.locator('[data-testid=sidebar]').inner_text()
      page.goto(BASE + '/help/guide'); page.wait_for_selector('[data-testid=help] >> h2:has-text("operations")')
      shot(page, '17-english')
      page.goto(BASE + '/settings'); page.wait_for_selector('[data-testid=lang-select]')
      page.select_option('[data-testid=lang-select]', 'zh-TW'); page.wait_for_selector('text=介面語言')
      ac('I18N interface language switch', en_ok and 'Expand all' in en_home, f'en={en_ok} sidebar={en_home[:40]!r}')


      # OAuth: DCR registers a client -> /authorize -> consent page -> approve -> redirect to redirect_uri with code
      import urllib.request
      reg_body = json.dumps({'client_name': f'E2E Client {TS}', 'redirect_uris': [f'{BASE}/e2e-oauth-callback'], 'token_endpoint_auth_method': 'none'}).encode()
      reg = json.loads(urllib.request.urlopen(urllib.request.Request(f'{BASE}/register', data=reg_body, headers={'content-type': 'application/json'})).read())
      page.goto(f"{BASE}/authorize?response_type=code&client_id={reg['client_id']}&redirect_uri={BASE}/e2e-oauth-callback&code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM&code_challenge_method=S256&state=e2e")
      page.wait_for_selector('[data-testid=oauth-consent] >> text=E2E Client')
      shot(page, '20-oauth-consent')
      page.click('[data-testid=oauth-approve]'); page.wait_for_url('**/e2e-oauth-callback?code=*')
      cb = page.url
      ac('OAUTH consent page -> authorization code returned to client', 'code=wbac_' in cb and 'state=e2e' in cb, cb[:80])

      # source import: raw layer "Import" -> paste text -> new source page opens
      page.goto(BASE + '/'); page.wait_for_selector('[data-testid=sidebar] >> text=匯入')
      page.click('[data-testid=sidebar] >> button:has-text("匯入")')
      page.wait_for_selector('[role=dialog] button[role=tab][aria-selected="true"]:has-text("貼網址")')  # the import entry preselects the URL tab
      page.click('[role=dialog] button[role=tab]:has-text("貼上文字")')
      page.fill('#im-title', f'E2E 匯入 {TS}'); page.fill('#im-text', '訪談重點：受訪者偏好 Markdown。')
      page.click('[role=dialog] button:has-text("匯入")')
      page.wait_for_url('**/n/raw/sources/**')
      page.wait_for_selector('text=唯讀來源')
      ok_import = page.locator('article h1').inner_text().strip() == f'E2E 匯入 {TS}'
      page.wait_for_selector('[data-testid=pending-banner]')                      # Karpathy: a new source shows as pending ingest
      ok_pending = page.locator('[data-testid=sidebar] [data-testid=pending-tag]').count() >= 1
      (page.locator('[data-testid=pending-more]').click() if page.locator('[data-testid=pending-more]').count() else None); page.click('[data-testid=pending-banner] button:has-text("複製提示詞給 Cursor")')
      ok_prompt = 'get_instructions' in page.evaluate('navigator.clipboard.readText()')
      shot(page, '15-pending-source')
      # discuss before ingest -> chat panel carries the prompt, green bar has "ingest from discussion" (not actually sent, to avoid spending)
      page.click('[data-testid=discuss-ingest]'); page.wait_for_selector('[data-testid=chat-ingest-bar]')
      draft_val = page.locator('[data-testid=chat-input]').input_value()
      ac('DISCUSS discuss before ingest: draft carries source path, no ingest button before discussion', 'raw/sources/' in draft_val and page.locator('[data-testid=chat-ingest]').count() == 0)
      shot(page, '15b-discuss-bar'); page.click('[data-testid=chat-panel] >> button:has-text("×")')
      ac('IMPORT pasted text into raw/sources + pending marker and prompt', ok_import and ok_pending and ok_prompt, page.url)

      # table view (Bases-style): switch tab, rows and filters visible, timeline play button exists
      page.goto(BASE + '/'); page.wait_for_selector('[data-testid=tab-table]'); page.click('[data-testid=tab-table]')
      page.wait_for_selector('[data-testid=table-view] tbody tr')
      page.fill('[data-testid=table-view] input[aria-label="篩選 標題"]', 'LLM Wiki'); page.wait_for_timeout(200)
      rows = page.locator('[data-testid=table-view] tbody tr').count()
      page.click('button[role=tab]:has-text("圖譜")'); page.wait_for_selector('[data-testid=timeline-play]')
      ac('TABLE table filter and timeline play button', rows >= 1, f'rows={rows}')

      # milestone 4: forgot-password page is reachable
      page.goto(BASE + '/forgot'); page.wait_for_selector('text=寄送重設連結')
      page.goto(BASE + '/reset-password'); page.wait_for_selector('text=連結無效')
      page.goto(BASE + '/help'); page.wait_for_selector('[data-testid=help-cards]')
      assert page.locator('[data-testid=help-video]').count() == 1 and page.locator('[data-testid=help] img').count() >= 4
      page.click('[data-testid=help-cards] >> text=使用指南'); page.wait_for_selector('[data-testid=help] >> h2:has-text("三個操作")'); assert page.locator('[data-testid=help] img').count() >= 4
      assert page.evaluate("fetch('/help/zh-TW/tour.webm',{method:'HEAD'}).then(r=>r.status)") == 200
      ac('M4 usage/export/forgot-password pages', True)

      import tempfile
      # bibliography import (academic item 1): + Add -> upload .bib -> two pages in raw/sources, .bib export downloadable from settings
      bib_path = os.path.join(tempfile.gettempdir(), f'e2e-{TS}.bib')
      open(bib_path, 'w').write(f'@article{{e2e{TS}a,\n  title={{E2E Bib A {TS}}}, author={{Doe, John}}, journal={{J. E2E}}, year={{2024}}\n}}\n@book{{e2e{TS}b,\n  title={{E2E Bib B {TS}}}, author={{Roe, Jane}}, publisher={{E2E Press}}, year={{2023}}\n}}\n')
      page.goto(BASE + '/'); page.wait_for_selector('[data-testid=sidebar] >> text=匯入'); page.click('[data-testid=sidebar] >> button:has-text("匯入")')
      page.click('[role=dialog] button[role=tab]:has-text("上傳檔案")'); page.set_input_files('#im-file', bib_path)
      page.click('[role=dialog] button:has-text("匯入")'); page.wait_for_url(f'**/n/raw/sources/e2e{TS}a.md'); page.wait_for_selector('text=已匯入 2 筆書目')
      page.wait_for_selector(f'[data-testid=sidebar] >> text=E2E Bib B {TS}')   # the tree reloads after the toast; don't count before it lands
      bib_ok = page.locator(f'[data-testid=sidebar] >> text=E2E Bib B {TS}').count() == 1
      bib_txt = page.evaluate("fetch('/api/export/bibtex').then(r => r.text())")
      ac('BIB upload .bib: two pages in raw/sources and exportable', bib_ok and f'@book{{e2e{TS}b,' in bib_txt and f'author = {{Jane Roe}}' in bib_txt, f'sidebar={bib_ok}')
      shot(page, '18-bib-import')

      # academic item 2: [@key] in a wiki page -> rendered as (author, year) linking to the source page, references footer, backlink on the source page
      new_note(page, 'wiki', f'e2e-{TS}-cite', f'# E2E Cite {TS}\n\n有實證 [@e2e{TS}a; @e2e{TS}b, p. 3]，缺的 [@nobody{TS}]。')
      page.wait_for_selector('[data-testid=references]')
      cite_txt = page.locator('article').inner_text()
      cite_ok = f'(Doe, 2024; Roe, 2023, p. 3)' in cite_txt and page.locator(f'[data-missing-cite=nobody{TS}]').count() == 1 and page.locator('[data-testid=references] li').count() == 3
      page.click(f'article a.wl:has-text("Doe, 2024")'); page.wait_for_url(f'**/n/raw/sources/e2e{TS}a.md')
      page.wait_for_selector(f'[data-testid=rail] >> text=E2E Cite {TS}')
      ac('CITE [@key] rendering, references, backlinks', cite_ok, f'refs={page.locator("[data-testid=references] li").count()}')
      shot(page, '19-cite')

      # image attachments: editor "Insert image" -> upload to /api/assets -> image renders after save
      import base64
      png = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==')
      img_path = os.path.join(tempfile.gettempdir(), f'e2e-{TS}.png'); open(img_path, 'wb').write(png)
      page.goto(f'{BASE}/n/{A}'); page.wait_for_selector('article h1'); page.click('button:has-text("編輯")')
      page.set_input_files('input[type=file][accept^="image/png"]', img_path)
      page.wait_for_function("document.querySelector('textarea[aria-label=\"Markdown 內容\"]').value.includes('/api/assets/')")
      page.click('button:has-text("儲存")'); page.wait_for_selector('article img')
      loaded = page.evaluate("(async () => { const i = document.querySelector('article img'); await i.decode(); return i.naturalWidth; })()") == 1
      ac('IMAGE attachment: insert, save, display', loaded); shot(page, '16-image-asset')

      # AC-18: mobile
      m = browser.new_context(viewport={'width': 390, 'height': 844}, locale='zh-TW', is_mobile=True, has_touch=True)
      mp = m.new_page(); mp.on('dialog', lambda d: d.accept())
      mp.goto(BASE + '/login'); mp.wait_for_selector('a:has-text("忘記密碼")')   # the login page is only visible when logged out
      login(mp)
      hidden = not mp.locator('[data-testid=sidebar]').is_visible()
      mp.click('button[aria-label="開啟目錄"]')
      mp.wait_for_selector('[data-testid=sidebar]', state='visible')
      shot(mp, '10-mobile-sidebar')
      mp.click(f'[data-testid=sidebar] >> text={TITLE_A}')
      mp.wait_for_url(f'**/n/{A}'); mp.wait_for_selector(f'main h1:has-text("{TITLE_A}")')   # URL changes before React commits the route; wait for the page itself
      mp.fill('input[aria-label="搜尋"]', TITLE_A); mp.press('input[aria-label="搜尋"]', 'Enter'); mp.wait_for_selector('text=筆結果')
      shot(mp, '10b-mobile-search')
      mp.click(f'main button:has-text("{TITLE_A}")'); mp.wait_for_url(f'**/n/{A}')
      mp.click('button:has-text("編輯")')
      mp.fill('textarea[aria-label="Markdown 內容"]', f'# {TITLE_A}\n\n手機編輯 {TS}。')
      mp.click('button:has-text("儲存")'); mp.wait_for_selector(f'text=手機編輯 {TS}')
      shot(mp, '11-mobile-note')
      ac('AC-18 mobile drawer, read, search, edit', hidden)

      # cleanup: delete A (B already deleted)
      page.goto(f'{BASE}/n/{A}'); page.wait_for_selector('article h1'); page.click('button:has-text("刪除")'); page.click('[data-testid=confirm-ok]'); page.wait_for_url(BASE + '/')
      browser.close()

  except Exception as e:
    if SHOTS:
      try: page.screenshot(path=os.path.join(SHOTS, 'failure.png'))
      except Exception: pass
    print('FAIL at', page.url, '| versions:', page.locator('[data-testid^=version-]').count(), '| rail:', page.locator('[data-testid=rail]').count())
    raise

failed = [r for r in results if not r[1]]
print(f'\n{len(results) - len(failed)} passed / {len(failed)} failed')
sys.exit(1 if failed else 0)
