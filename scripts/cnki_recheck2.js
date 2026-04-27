/**
 * 再次核查 [10][19][32]
 */
const http = require('http');
const WebSocket = require('ws');

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
  return r.result.value;
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function search(ws, query, label) {
  const url = `https://kns.cnki.net/kns8s/defaultresult/index?dbcode=CJFD&kw=${encodeURIComponent(query)}&korder=TI`;
  console.log(`\n${label}  搜: "${query}"`);
  await sendCmd(ws, 'Page.navigate', { url });
  await sleep(3500);
  for (let i = 0; i < 8; i++) {
    const ok = await evaluate(ws, `!!document.querySelector('.fz14') || document.body.innerText.includes('抱歉，暂无数据')`);
    if (ok) break;
    await sleep(600);
  }
  const raw = await evaluate(ws, `JSON.stringify((function(){
    try {
    const rows=[];
    document.querySelectorAll('#gridTable .fz14, .result-table-list .fz14').forEach(el=>{
      const row=el.closest('tr'); if(!row) return;
      const cells=Array.from(row.querySelectorAll('td'));
      let ti=-1; cells.forEach((td,i)=>{if(td.contains(el))ti=i;});
      rows.push({title:el.textContent.trim(),author:cells[ti+1]?cells[ti+1].textContent.trim():'',journal:cells[ti+2]?cells[ti+2].textContent.trim():'',year:cells[ti+3]?cells[ti+3].textContent.trim().substring(0,4):''});
    });
    const cnt=document.body.innerText.match(/\u5171\u627e\u5230\s*([\d,\uff0c]+)\s*\u6761\u7ed3\u679c/);
    return {n:cnt?cnt[1]:(document.body.innerText.includes('\u6682\u65e0\u6570\u636e')?'0':'?'),rows:rows.slice(0,10)};
    } catch(e) { return {n:'ERR:'+e.message, rows:[]}; }
  })()`);
  const d = JSON.parse(raw || '{"n":"null","rows":[]}');
  console.log(`  共 ${d.n} 条`);
  d.rows.forEach((r,i) => console.log(`  [${i+1}] ${r.title} | ${r.author} | ${r.journal} | ${r.year}`));
  return d;
}

async function main() {
  const tabs = await getTabs();
  const tab = tabs.find(t => t.type === 'page');
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise(r => ws.on('open', r));
  setupHandler(ws);

  // [10] 去掉中文顿点再搜
  await search(ws, '生活道德道德教育', '[10]-A 去顿点');
  await sleep(2500);
  await search(ws, '鲁洁 道德 教育研究 2006', '[10]-B 作者+期刊');
  await sleep(2500);

  // [19] 精确标题
  await search(ws, '高校生活德育探析 贾玉珍', '[19]-A 加作者');
  await sleep(2500);

  // [32] 搜作者名+关键词
  await search(ws, '庞玉兰 知性德育', '[32]-A 作者+关键词');
  await sleep(2500);
  await search(ws, '庞玉兰 德育', '[32]-B 宽搜作者');

  ws.close();
  console.log('\n完成');
}
main().catch(console.error);
