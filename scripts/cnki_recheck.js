/**
 * 重新核查 4 条问题文献：[9][10][19][32]
 * - [9]  搜索词含破折号导致 CNKI 返回"请稍后重试"
 * - [10] 搜索词去掉"·"后太宽泛
 * - [19] 前8条结果未命中
 * - [32] 搜索词含冒号导致 CNKI 返回"请稍后重试"
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
    setTimeout(() => { if (pending[id]) { delete pending[id]; reject(new Error('Timeout: ' + method)); } }, 25000);
  });
}

function setupHandler(ws) {
  ws.on('message', data => {
    const msg = JSON.parse(data);
    if (msg.id && pending[msg.id]) {
      const { resolve } = pending[msg.id];
      delete pending[msg.id];
      resolve(msg.result);
    }
  });
}

async function evaluate(ws, expr) {
  const r = await sendCmd(ws, 'Runtime.evaluate', { expression: expr, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
  return r.result.value;
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function searchAndExtract(ws, query, label) {
  const url = `https://kns.cnki.net/kns8s/defaultresult/index?dbcode=CJFD&kw=${encodeURIComponent(query)}&korder=TI`;
  console.log(`\n${label}`);
  console.log(`  搜索: "${query}"`);
  
  await sendCmd(ws, 'Page.navigate', { url });
  await sleep(3500);

  // 等待 .fz14 或无结果提示
  for (let i = 0; i < 8; i++) {
    const hasFz14 = await evaluate(ws, `!!document.querySelector('.fz14')`);
    const hasNoData = await evaluate(ws, `document.body.innerText.includes('抱歉，暂无数据')`);
    if (hasFz14 || hasNoData) break;
    await sleep(600);
  }

  const rawJson = await evaluate(ws, `
    JSON.stringify((function() {
      const results = [];
      const titleLinks = document.querySelectorAll('#gridTable .fz14, .result-table-list .fz14');
      titleLinks.forEach(titleEl => {
        const row = titleEl.closest('tr');
        if (!row) return;
        const cells = Array.from(row.querySelectorAll('td'));
        let titleIdx = -1;
        cells.forEach((td, i) => { if (td.contains(titleEl)) titleIdx = i; });
        results.push({
          title: titleEl.textContent.trim(),
          author: cells[titleIdx + 1] ? cells[titleIdx + 1].textContent.trim() : '',
          journal: cells[titleIdx + 2] ? cells[titleIdx + 2].textContent.trim() : '',
          year: cells[titleIdx + 3] ? cells[titleIdx + 3].textContent.trim().substring(0, 4) : '',
        });
      });
      const countText = document.body.innerText.match(/共找到\\s*([\\d,，]+)\\s*条结果/);
      const noData = document.body.innerText.includes('抱歉，暂无数据');
      return { totalCount: countText ? countText[1] : (noData ? '0' : '?'), results: results.slice(0, 10) };
    })())
  `);
  
  const data = JSON.parse(rawJson);
  console.log(`  共找到: ${data.totalCount} 条`);
  if (data.results.length > 0) {
    data.results.forEach((r, i) => {
      console.log(`  [${i+1}] ${r.title}`);
      console.log(`       ${r.author} | ${r.journal} | ${r.year}`);
    });
  } else {
    console.log('  → 无结果');
  }
  return data;
}

async function main() {
  const tabs = await getTabs();
  const tab = tabs.find(t => t.type === 'page');
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise(r => ws.on('open', r));
  setupHandler(ws);

  // [9] 鲁洁 边缘化外在化知识化——道德教育的现代综合症 教育研究 2005(12)
  // 原搜索词含破折号，改用去掉破折号的标题
  await searchAndExtract(ws, '边缘化外在化知识化 道德教育的现代综合症', '[9] 鲁洁 2005');
  await sleep(2500);

  // [9] 再试：用鲁洁+道德教育现代综合症
  await searchAndExtract(ws, '道德教育的现代综合症', '[9] 备用搜索');
  await sleep(2500);

  // [10] 鲁洁 生活·道德·道德教育 教育研究 2006(10)
  await searchAndExtract(ws, '生活·道德·道德教育', '[10] 鲁洁 2006（含中文点）');
  await sleep(2500);

  // [19] 贾玉珍 高校生活德育探析 教育探索 2008(11)
  await searchAndExtract(ws, '高校生活德育探析', '[19] 贾玉珍 2008');
  await sleep(2500);

  // [32] 庞玉兰 德育发展新理念：知性德育与生活德育的融通 教育实践与研究 2021(9)
  // 原搜索词含冒号，改用更短关键词
  await searchAndExtract(ws, '知性德育与生活德育的融通', '[32] 庞玉兰 2021（精简词）');
  await sleep(2500);

  // [32] 备用：用德育发展新理念
  await searchAndExtract(ws, '德育发展新理念 知性德育', '[32] 备用搜索');

  ws.close();
  console.log('\n✅ 重新核查完成');
}

main().catch(console.error);
