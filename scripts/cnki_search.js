/**
 * CNKI CDP Search Script
 * 通过 Chrome DevTools Protocol 直接搜索知网
 * Usage: node cnki_search.js "检索词" [来源类别] [开始年份] [结束年份]
 */

const http = require('http');
const WebSocket = require('ws');

const KEYWORDS = process.argv[2] || '生活德育';
const SOURCE = process.argv[3] || 'CSSCI';
const YEAR_START = process.argv[4] || '2003';
const YEAR_END = process.argv[5] || '2024';

// 获取 Chrome 标签页列表
function getTabList() {
  return new Promise((resolve, reject) => {
    http.get('http://localhost:9222/json', (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    }).on('error', reject);
  });
}

// 连接到指定标签页
function connectToTab(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
  });
}

// 发送 CDP 命令并等待结果
let msgId = 1;
const pendingCallbacks = {};

function sendCommand(ws, method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = msgId++;
    pendingCallbacks[id] = { resolve, reject };
    ws.send(JSON.stringify({ id, method, params }));
    setTimeout(() => {
      if (pendingCallbacks[id]) {
        delete pendingCallbacks[id];
        reject(new Error(`Timeout: ${method}`));
      }
    }, 30000);
  });
}

function setupMessageHandler(ws) {
  ws.on('message', (data) => {
    const msg = JSON.parse(data);
    if (msg.id && pendingCallbacks[msg.id]) {
      const { resolve, reject } = pendingCallbacks[msg.id];
      delete pendingCallbacks[msg.id];
      if (msg.error) reject(new Error(msg.error.message));
      else resolve(msg.result);
    }
  });
}

// 执行 JavaScript 并返回结果
async function evaluate(ws, expression, awaitPromise = false) {
  const result = await sendCommand(ws, 'Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise,
    timeout: 30000
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text || 'JS execution error');
  }
  return result.result.value;
}

// 等待页面加载
async function waitForLoad(ws, timeout = 15000) {
  return new Promise((resolve) => {
    const checkInterval = setInterval(async () => {
      try {
        const readyState = await evaluate(ws, 'document.readyState');
        if (readyState === 'complete') {
          clearInterval(checkInterval);
          resolve();
        }
      } catch (e) {}
    }, 500);
    setTimeout(() => { clearInterval(checkInterval); resolve(); }, timeout);
  });
}

async function main() {
  try {
    // 获取 CNKI 标签页
    const tabs = await getTabList();
    const cnkiTab = tabs.find(t => t.url && t.url.includes('cnki.net') && t.type === 'page');
    
    if (!cnkiTab) {
      console.error('❌ 未找到知网标签页，请确保 Chrome 中已打开 cnki.net');
      process.exit(1);
    }
    
    console.log(`📌 连接到标签页: ${cnkiTab.title}`);
    const ws = await connectToTab(cnkiTab.webSocketDebuggerUrl);
    setupMessageHandler(ws);
    
    // 构建 CNKI 高级检索 URL
    // CNKI 的检索 URL 格式
    const searchUrl = `https://kns.cnki.net/kns8s/defaultresult/index?dbcode=CJFD&kw=${encodeURIComponent(KEYWORDS)}&korder=RT`;
    
    console.log(`🔍 导航到检索页面...`);
    await sendCommand(ws, 'Page.navigate', { url: searchUrl });
    await new Promise(r => setTimeout(r, 3000));
    await waitForLoad(ws);
    
    // 检查是否有验证码
    const hasCaptcha = await evaluate(ws, `document.querySelector('.tc-slider-normal') !== null`);
    if (hasCaptcha) {
      console.log('⚠️  检测到验证码，请手动完成验证码后按回车继续...');
      await new Promise(r => process.stdin.once('data', r));
    }
    
    // 等待搜索结果加载
    await new Promise(r => setTimeout(r, 2000));
    
    // 提取搜索结果
    const results = await evaluate(ws, `
      (function() {
        const items = document.querySelectorAll('.result-table-list tbody tr, .result_table tbody tr, #gridTable tbody tr');
        if (items.length === 0) {
          // 尝试新版知网格式
          const newItems = document.querySelectorAll('.fz14');
          return JSON.stringify({
            count: newItems.length,
            pageTitle: document.title,
            pageUrl: location.href,
            items: Array.from(newItems).slice(0, 5).map(el => el.textContent.trim())
          });
        }
        return JSON.stringify({
          count: items.length,
          pageTitle: document.title,
          pageUrl: location.href,
          items: Array.from(items).slice(0, 20).map(row => {
            const cells = row.querySelectorAll('td');
            return {
              title: cells[1] ? cells[1].textContent.trim() : '',
              author: cells[3] ? cells[3].textContent.trim() : '',
              source: cells[4] ? cells[4].textContent.trim() : '',
              date: cells[5] ? cells[5].textContent.trim() : '',
              cited: cells[6] ? cells[6].textContent.trim() : ''
            };
          }).filter(r => r.title)
        });
      })()
    `);
    
    if (results) {
      const parsed = JSON.parse(results);
      console.log(`\n✅ 页面: ${parsed.pageTitle}`);
      console.log(`📊 找到条目: ${parsed.count}`);
      if (parsed.items && parsed.items.length > 0) {
        console.log('\n=== 搜索结果 ===');
        parsed.items.forEach((item, i) => {
          if (typeof item === 'string') {
            console.log(`${i+1}. ${item}`);
          } else {
            console.log(`\n[${i+1}] ${item.title}`);
            console.log(`    作者: ${item.author} | 来源: ${item.source} | 年份: ${item.date} | 被引: ${item.cited}`);
          }
        });
      }
    }
    
    // 获取页面 HTML 片段用于调试
    const pageSnippet = await evaluate(ws, `document.body.innerHTML.substring(0, 2000)`);
    console.log('\n=== 页面片段（调试用）===');
    console.log(pageSnippet);
    
    ws.close();
  } catch (err) {
    console.error('❌ 错误:', err.message);
    process.exit(1);
  }
}

main();
