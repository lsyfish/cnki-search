/**
 * CNKI Search — 支持手动解验证码版本
 * 遇到验证码时暂停，等用户在 Chrome 中手动完成后按回车继续
 */

const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const readline = require('readline');
const { spawn } = require('child_process');

const OUTPUT_FILE = 'd:\\论文\\cnki_results.json';

function getTabList() {
  return new Promise((resolve, reject) => {
    http.get('http://localhost:9222/json', (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(JSON.parse(data)));
    }).on('error', reject);
  });
}

function connectToTab(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
  });
}

let msgId = 1;
const pending = {};

function sendCmd(ws, method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = msgId++;
    pending[id] = { resolve, reject };
    ws.send(JSON.stringify({ id, method, params }));
    setTimeout(() => { if (pending[id]) { delete pending[id]; reject(new Error(`Timeout: ${method}`)); }}, 30000);
  });
}

function setupHandler(ws) {
  ws.on('message', data => {
    const msg = JSON.parse(data);
    if (msg.id && pending[msg.id]) {
      const { resolve, reject } = pending[msg.id];
      delete pending[msg.id];
      msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
    }
  });
}

async function eval_(ws, expr) {
  const r = await sendCmd(ws, 'Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: false, timeout: 15000 });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
  return r.result.value;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function ensureChrome() {
  try {
    await getTabList();
    return;
  } catch (e) {}
  console.log('Chrome not detected, launching...');
  const paths = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ];
  const chromePath = paths.find(p => { try { require('fs').accessSync(p); return true; } catch { return false; } });
  if (!chromePath) throw new Error('Chrome not found. Please launch manually with --remote-debugging-port=9222');
  spawn(chromePath, [
    '--remote-debugging-port=9222',
    '--user-data-dir=C:\\Temp\\chrome-debug-profile',
  ], { detached: true, stdio: 'ignore' }).unref();
  for (let i = 0; i < 15; i++) {
    await sleep(1000);
    try { await getTabList(); console.log('Chrome ready'); return; } catch {}
  }
  throw new Error('Chrome did not start in time');
}

function waitForEnter(prompt) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(prompt, () => { rl.close(); resolve(); }));
}

async function waitForPageReady(ws, timeout = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const state = await eval_(ws, 'document.readyState');
    if (state === 'complete') return;
    await sleep(800);
  }
}

async function hasCaptcha(ws) {
  return await eval_(ws, `(function() {
    const el = document.querySelector('[class*="tencent-captcha-dy__content"]');
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    const inViewport = rect.width > 0 && rect.height > 0
      && rect.top >= 0 && rect.left >= 0
      && rect.bottom <= window.innerHeight && rect.right <= window.innerWidth;
    if (!inViewport) return false;
    const s = window.getComputedStyle(el);
    return s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0';
  })()
  // legacy fallback
  || !!(document.querySelector('.tc-slider-normal') ||
       document.querySelector('#tcaptcha_iframe') ||
       document.querySelector('[class*="slider"]') ||
       (document.body.textContent || '').includes('完成验证'))
  `);
}

async function extractResults(ws) {
  return await eval_(ws, `
    JSON.stringify((function() {
      // 方案1：新版 CNKI 表格
      let rows = document.querySelectorAll('#gridTable tbody tr');
      if (rows.length > 0) {
        return Array.from(rows).slice(0, 50).map(row => {
          const tds = row.querySelectorAll('td');
          const titleEl = row.querySelector('a.fz14') || row.querySelector('.title a') || row.querySelector('a[onclick]');
          const srcEl = row.querySelector('.source') || tds[4];
          const dateEl = row.querySelector('.date') || tds[5];
          const citedEl = tds[6];
          return {
            title: titleEl ? titleEl.textContent.trim() : '',
            author: tds[3] ? tds[3].textContent.trim() : '',
            source: srcEl ? srcEl.textContent.trim() : '',
            date: dateEl ? dateEl.textContent.trim() : '',
            cited: citedEl ? citedEl.textContent.trim() : ''
          };
        }).filter(r => r.title.length > 2);
      }
      
      // 方案2：搜集所有 .fz14 标题链接
      const links = document.querySelectorAll('a.fz14');
      if (links.length > 0) {
        return Array.from(links).map(el => {
          const row = el.closest('tr') || el.closest('.result-item');
          const tds = row ? row.querySelectorAll('td') : [];
          return {
            title: el.textContent.trim(),
            author: tds[3] ? tds[3].textContent.trim() : '',
            source: tds[4] ? tds[4].textContent.trim() : '',
            date: tds[5] ? tds[5].textContent.trim() : '',
            cited: tds[6] ? tds[6].textContent.trim() : ''
          };
        });
      }
      
      // 方案3：返回原始 HTML 调试
      return [{ title: '__DEBUG__', html: document.body.innerHTML.substring(0, 3000), url: location.href }];
    })())
  `);
}

async function main() {
  await ensureChrome();
  const tabs = await getTabList();
  const cnkiTab = tabs.find(t => t.url && t.url.includes('cnki') && t.type === 'page');
  if (!cnkiTab) { console.error('No CNKI tab — please open https://kns.cnki.net in Chrome'); process.exit(1); }

  const ws = await connectToTab(cnkiTab.webSocketDebuggerUrl);
  setupHandler(ws);

  const searches = [
    '生活德育',
    '道德教育 生活化',
    '鲁洁 道德教育',
    '高德胜 德育',
    '品德 生活世界',
  ];

  const all = [];

  for (const kw of searches) {
    process.stdout.write(`\n[搜索] ${kw} ... `);
    const url = `https://kns.cnki.net/kns8s/defaultresult/index?dbcode=CJFD&kw=${encodeURIComponent(kw)}&korder=RT`;
    await sendCmd(ws, 'Page.navigate', { url });
    await sleep(3000);
    await waitForPageReady(ws);

    if (await hasCaptcha(ws)) {
      console.log('\n⚠️  发现验证码！请在 Chrome 窗口中手动滑动完成验证，然后回到这里按回车继续...');
      await waitForEnter('完成验证后按回车 > ');
      await sleep(2000);
      await waitForPageReady(ws);
    }

    const raw = await extractResults(ws);
    try {
      const items = JSON.parse(raw || '[]');
      if (items[0] && items[0].title === '__DEBUG__') {
        fs.writeFileSync('d:\\论文\\cnki_debug.html', items[0].html || '', 'utf8');
        console.log(`DEBUG: URL=${items[0].url}, HTML saved to cnki_debug.html`);
      } else {
        items.forEach(i => { i.keyword = kw; all.push(i); });
        console.log(`找到 ${items.length} 条`);
      }
    } catch (e) {
      console.log(`解析失败: ${e.message}`);
    }

    await sleep(1200);
  }

  // 去重
  const seen = new Set();
  const unique = all.filter(r => {
    if (!r.title || r.title.length < 3) return false;
    const k = r.title.slice(0, 15);
    if (seen.has(k)) return false;
    seen.add(k); return true;
  });

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(unique, null, 2), 'utf8');
  console.log(`\n✅ 共 ${unique.length} 条结果，已保存到 cnki_results.json`);
  ws.close();
}

main().catch(e => { console.error(e.message); process.exit(1); });
