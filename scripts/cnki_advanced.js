/**
 * CNKI Advanced Search Script — CSSCI 过滤版
 * 直接输出 JSON 文件，避免终端编码问题
 */

const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const KEYWORDS = process.argv[2] || '生活德育';
const OUTPUT_FILE = path.join(__dirname, 'cnki_results.json');

process.stdout.write('');
process.env.NODE_ICU_DATA = '';

function getTabList() {
  return new Promise((resolve, reject) => {
    http.get('http://localhost:9222/json', (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
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

function sendCommand(ws, method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = msgId++;
    pending[id] = { resolve, reject };
    ws.send(JSON.stringify({ id, method, params }));
    setTimeout(() => {
      if (pending[id]) { delete pending[id]; reject(new Error(`Timeout: ${method}`)); }
    }, 30000);
  });
}

function setupHandler(ws) {
  ws.on('message', (data) => {
    const msg = JSON.parse(data);
    if (msg.id && pending[msg.id]) {
      const { resolve, reject } = pending[msg.id];
      delete pending[msg.id];
      if (msg.error) reject(new Error(msg.error.message));
      else resolve(msg.result);
    }
  });
}

async function evaluate(ws, expr, awaitPromise = false) {
  const r = await sendCommand(ws, 'Runtime.evaluate', {
    expression: expr, returnByValue: true, awaitPromise, timeout: 30000
  });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
  return r.result.value;
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function ensureChrome() {
  try {
    await getTabList();
    return; // 已在运行
  } catch (e) {}
  console.log('Chrome not detected, launching...');
  const paths = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ];
  const chromePath = paths.find(p => { try { fs.accessSync(p); return true; } catch { return false; } });
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

async function main() {
  await ensureChrome();
  const tabs = await getTabList();
  const cnkiTab = tabs.find(t => t.url && t.url.includes('cnki.net') && t.type === 'page');
  if (!cnkiTab) { console.error('No CNKI tab found — please open https://kns.cnki.net in Chrome'); process.exit(1); }

  const ws = await connectToTab(cnkiTab.webSocketDebuggerUrl);
  setupHandler(ws);

  const allResults = [];
  
  // 搜索策略：多个查询
  const queries = [
    { kw: '生活德育', label: '核心检索：生活德育' },
    { kw: '道德教育 生活化', label: '道德教育生活化' },
    { kw: '生活德育 课程改革', label: '生活德育与课程' },
    { kw: '鲁洁 德育', label: '鲁洁德育论文' },
    { kw: '高德胜 生活德育', label: '高德胜生活德育' },
  ];

  for (const q of queries) {
    console.log(`Searching: ${q.label}`);
    
    // CNKI 高级检索 URL（CSSCI 过滤）
    // dbcode=CJFD 中文期刊, source=CSSCI
    const url = `https://kns.cnki.net/kns8s/defaultresult/index?dbcode=CJFD&kw=${encodeURIComponent(q.kw)}&korder=RT&yk=CSSCI`;
    
    await sendCommand(ws, 'Page.navigate', { url });
    await sleep(3000);
    
    // 等待结果加载
    let loaded = false;
    for (let i = 0; i < 10; i++) {
      const state = await evaluate(ws, 'document.readyState');
      if (state === 'complete') { loaded = true; break; }
      await sleep(1000);
    }
    
    // 检查验证码（必须在视口内且可见才算真实触发，排除知网常驻离屏组件）
    const captcha = await evaluate(ws, `(function() {
      const el = document.querySelector('[class*="tencent-captcha-dy__content"]');
      if (!el) return false;
      const rect = el.getBoundingClientRect();
      const inViewport = rect.width > 0 && rect.height > 0
        && rect.top >= 0 && rect.left >= 0
        && rect.bottom <= window.innerHeight && rect.right <= window.innerWidth;
      if (!inViewport) return false;
      const s = window.getComputedStyle(el);
      return s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0';
    })()`);
    if (captcha) {
      console.log('CAPTCHA detected - writing partial results and stopping');
      break;
    }
    
    // 提取结果（尝试多种选择器）
    const items = await evaluate(ws, `
      JSON.stringify((function() {
        // 新版知网格式
        const rows = document.querySelectorAll('#gridTable tbody tr');
        if (rows.length > 0) {
          return Array.from(rows).map(row => {
            const tds = row.querySelectorAll('td');
            const titleEl = row.querySelector('.fz14, .title, a[onclick*="detail"]');
            return {
              title: titleEl ? titleEl.textContent.trim() : (tds[1] ? tds[1].textContent.trim() : ''),
              author: tds[3] ? tds[3].textContent.trim() : '',
              source: tds[4] ? tds[4].textContent.trim() : '',
              date: tds[5] ? tds[5].textContent.trim() : '',
              cited: tds[6] ? tds[6].textContent.trim() : '',
              url: titleEl ? titleEl.href : ''
            };
          }).filter(r => r.title.length > 2);
        }
        
        // 备用：抓取所有 .fz14 链接
        const links = document.querySelectorAll('.fz14');
        if (links.length > 0) {
          return Array.from(links).map(el => ({
            title: el.textContent.trim(),
            author: '', source: '', date: '', cited: '', url: el.href || ''
          }));
        }
        
        return [{ 
          title: 'PAGE_INFO', 
          rawHtml: document.body.innerHTML.substring(0, 5000),
          url: location.href
        }];
      })())
    `);
    
    try {
      const parsed = JSON.parse(items || '[]');
      parsed.forEach(item => {
        item.query = q.label;
        allResults.push(item);
      });
      console.log(`  Found ${parsed.length} items`);
    } catch (e) {
      console.log(`  Parse error: ${e.message}`);
    }
    
    await sleep(1500);
  }
  
  // 去重（基于标题）
  const seen = new Set();
  const unique = allResults.filter(r => {
    if (!r.title || r.title === 'PAGE_INFO') return false;
    const key = r.title.substring(0, 20);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(unique, null, 2), 'utf8');
  console.log(`\nTotal unique results: ${unique.length}`);
  console.log(`Results saved to: ${OUTPUT_FILE}`);
  
  ws.close();
}

main().catch(e => { console.error(e); process.exit(1); });
