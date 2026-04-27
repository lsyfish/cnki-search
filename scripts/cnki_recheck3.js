/**
 * 精确核查 [10][19][32]
 * 通过 CNKI 高级检索 URL（支持作者字段搜索）
 */
const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');

function getTabs() {
  return new Promise((res, rej) => http.get('http://localhost:9222/json', (r) => {
    let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d)));
  }).on('error', rej));
}

let msgId = 1;
const pending = {};

function sendCmd(ws, method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = msgId++;
    pending[id] = { resolve, reject };
    ws.send(JSON.stringify({ id, method, params }));
    setTimeout(() => { if (pending[id]) { delete pending[id]; reject(new Error('Timeout')); } }, 25000);
  });
}

function setupHandler(ws) {
  ws.on('message', data => {
    const msg = JSON.parse(data);
    if (msg.id && pending[msg.id]) { const { resolve } = pending[msg.id]; delete pending[msg.id]; resolve(msg.result); }
  });
}

async function evaluate(ws, expr) {
  const r = await sendCmd(ws, 'Runtime.evaluate', { expression: expr, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
  return r.result.value;
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function getPageInfo(ws) {
  // 等待内容加载
  for (let i = 0; i < 10; i++) {
    const state = await evaluate(ws, 'document.readyState');
    const hasFz14 = await evaluate(ws, '!!document.querySelector(".fz14")');
    const bodyLen = await evaluate(ws, 'document.body ? document.body.innerHTML.length : 0');
    if ((state === 'complete' && bodyLen > 5000) || hasFz14) break;
    await sleep(700);
  }
  
  // 用完全不含转义的方式提取数据
  const bodyText = await evaluate(ws, 'document.body ? document.body.innerText.substring(0, 2000) : ""');
  const hasFz14 = await evaluate(ws, '!!document.querySelector(".fz14")');
  
  if (!hasFz14) {
    return { bodyText, results: [] };
  }
  
  // 提取结果行
  const count = await evaluate(ws, 'document.querySelectorAll("#gridTable .fz14, .result-table-list .fz14").length');
  const results = [];
  for (let i = 0; i < Math.min(count, 12); i++) {
    const title = await evaluate(ws, `(function(){
      const els = document.querySelectorAll('#gridTable .fz14, .result-table-list .fz14');
      return els[${i}] ? els[${i}].textContent.trim() : '';
    })()`);
    const row = await evaluate(ws, `(function(){
      const el = document.querySelectorAll('#gridTable .fz14, .result-table-list .fz14')[${i}];
      if (!el) return '';
      const tr = el.closest('tr');
      if (!tr) return '';
      const cells = Array.from(tr.querySelectorAll('td'));
      let ti = -1;
      cells.forEach((td, j) => { if (td.contains(el)) ti = j; });
      return [
        cells[ti+1] ? cells[ti+1].textContent.trim() : '',
        cells[ti+2] ? cells[ti+2].textContent.trim() : '',
        cells[ti+3] ? cells[ti+3].textContent.trim().substring(0,4) : ''
      ].join(' | ');
    })()`);
    results.push({ title, row });
  }
  return { bodyText, results };
}

async function search(ws, url, label) {
  console.log(`\n=== ${label} ===`);
  console.log('URL:', url);
  await sendCmd(ws, 'Page.navigate', { url });
  await sleep(4000);
  const info = await getPageInfo(ws);
  
  // 从 bodyText 中提取结果数
  const m = info.bodyText.match(/共找到\s*([\d,]+)\s*条结果/);
  const noData = info.bodyText.includes('暂无数据') || info.bodyText.includes('没有找到');
  console.log(`结果数: ${m ? m[1] : (noData ? '0' : '?（未匹配）')}`);
  if (info.results.length > 0) {
    info.results.forEach((r, i) => console.log(`  [${i+1}] ${r.title} | ${r.row}`));
  } else {
    console.log('  bodyText片段:', info.bodyText.substring(400, 800));
  }
  return info;
}

async function main() {
  const tabs = await getTabs();
  const tab = tabs.find(t => t.type === 'page');
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise(r => ws.on('open', r));
  setupHandler(ws);

  // [10] 鲁洁《生活·道德·道德教育》教育研究 2006(10)
  // 标题含顿点，CNKI 篇名搜索可能需要用半角点或去掉标点
  await search(ws,
    'https://kns.cnki.net/kns8s/defaultresult/index?dbcode=CJFD&kw=%E7%94%9F%E6%B4%BB+%E9%81%93%E5%BE%B7+%E9%81%93%E5%BE%B7%E6%95%99%E8%82%B2&korder=TI&yk=CSSCI',
    '[10]-A CSSCI 生活 道德 道德教育');
  await sleep(2500);

  await search(ws,
    'https://kns.cnki.net/kns8s/defaultresult/index?dbcode=CJFD&kw=%E7%94%9F%E6%B4%BB%E3%80%87%E9%81%93%E5%BE%B7%E3%80%87%E9%81%93%E5%BE%B7%E6%95%99%E8%82%B2&korder=TI',
    '[10]-B 含顿点原标题');
  await sleep(2500);

  // [19] 贾玉珍《高校生活德育探析》教育探索 2008(11):119-120
  // 搜索结果中已返回106条，我们需要找到2008年贾玉珍这篇，用kns8s高级检索
  await search(ws,
    'https://kns.cnki.net/kns8s/AdvSearch/index?dbcode=CJFD&searchType=baseQuery&searchKeywords=%5B%7B%22key%22%3A%22%E9%AB%98%E6%A0%A1%E7%94%9F%E6%B4%BB%E5%BE%B7%E8%82%B2%E6%8E%A2%E6%9E%90%22%2C%22dbField%22%3A%22TI%22%7D%5D',
    '[19]-C 高级检索篇名精确');
  await sleep(2500);

  // [19] 用精确搜索 - CNKI 高级检索支持 TI=精确 + AU=作者
  await search(ws,
    'https://kns.cnki.net/kns8s/defaultresult/index?dbcode=CJFD&kw=%E9%AB%98%E6%A0%A1%E7%94%9F%E6%B4%BB%E5%BE%B7%E8%82%B2%E6%8E%A2%E6%9E%90+%E8%B4%BE%E7%8E%89%E7%8F%8D&korder=TI',
    '[19]-D 篇名+作者联合');
  await sleep(2500);

  // [32] 庞玉兰《德育发展新理念：知性德育与生活德育的融通》教育实践与研究 2021(9)
  // 尝试更短的片段
  await search(ws,
    'https://kns.cnki.net/kns8s/defaultresult/index?dbcode=CJFD&kw=%E5%BA%9E%E7%8E%89%E5%85%B0+%E5%BE%B7%E8%82%B2&korder=AU',
    '[32]-C 作者字段搜庞玉兰德育');
  await sleep(2500);

  await search(ws,
    'https://kns.cnki.net/kns8s/defaultresult/index?dbcode=CJFD&kw=%E7%9F%A5%E6%80%A7%E5%BE%B7%E8%82%B2+%E7%94%9F%E6%B4%BB%E5%BE%B7%E8%82%B2+%E8%9E%8D%E9%80%9A&korder=TI',
    '[32]-D 知性德育 生活德育 融通');

  ws.close();
  console.log('\n完成');
}
main().catch(console.error);
