/**
 * CNKI Citation Verification Script
 * 通过 Chrome DevTools Protocol 逐条核查参考文献
 * Usage: node cnki_cite_verify.js
 */

const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

const OUTPUT_FILE = path.join(__dirname, 'cnki_verify_results.json');

// ============================================================
// 待核查文献列表（生活德育文献综述 [1]-[32] 及 [34]）
// ============================================================
const citations = [
  { id: 1,  title: '生活德育简论', author: '高德胜', journal: '教育研究与实验', year: 2002, issue: '(3)', pages: '1-6' },
  { id: 2,  title: '论现代知性德育与生活的割裂', author: '高德胜', journal: '思想理论教育', year: 2003, issue: '(4)', pages: '10-14' },
  { id: 3,  title: '生活中的恶及其德育意义', author: '高德胜', journal: '思想理论教育', year: 2004, issue: '(11)', pages: '22-26' },
  { id: 4,  title: '回归生活的德育课程', author: '高德胜', journal: '课程·教材·教法', year: 2004, issue: '(11)', pages: '56-60' },
  { id: 5,  title: '生活德育论', author: '高德胜', journal: '[M] 人民出版社', year: 2005, issue: '', pages: '' },
  { id: 6,  title: '生活德育：境遇、主题与未来', author: '高德胜', journal: '教育研究与实验', year: 2012, issue: '(3)', pages: '1-7' },
  { id: 7,  title: '叙事伦理学与生活事件：解决德育教材困境的尝试', author: '高德胜', journal: '全球教育展望', year: 2017, issue: '(8)', pages: '3-14' },
  { id: 8,  title: '向教学生活要德育', author: '高德胜', journal: '上海教育科研', year: 2019, issue: '(6)', pages: '5-9' },
  { id: 9,  title: '边缘化外在化知识化——道德教育的现代综合症', author: '鲁洁', journal: '教育研究', year: 2005, issue: '(12)', pages: '13-18' },
  { id: 10, title: '生活·道德·道德教育', author: '鲁洁', journal: '教育研究', year: 2006, issue: '(10)', pages: '3-8' },
  { id: 11, title: '做成一个人——道德教育的根本指向', author: '鲁洁', journal: '教育研究', year: 2007, issue: '(11)', pages: '3-8' },
  { id: 12, title: '道德教育的根本作为：引导生活的建构', author: '鲁洁', journal: '教育研究', year: 2010, issue: '(6)', pages: '3-8' },
  { id: 13, title: '儿童道德生活建构新突破', author: '鲁洁; 余维武', journal: '中国教育学刊', year: 2015, issue: '(5)', pages: '1-6' },
  { id: 14, title: '让道德教育成为最具有魅力的教育', author: '鲁洁; 冯建军', journal: '苏州大学学报', year: 2020, issue: '(2)', pages: '1-10' },
  { id: 15, title: '生活德育探问', author: '刘超良', journal: '教育理论与实践', year: 2003, issue: '(24)', pages: '45-47' },
  { id: 16, title: '试探陶行知的生活德育思想', author: '刘超良', journal: '河北师范大学学报', year: 2004, issue: '(4)', pages: '30-35' },
  { id: 17, title: '生活德育模式之建构', author: '宋艳', journal: '探索', year: 2005, issue: '(2)', pages: '140-143' },
  { id: 18, title: '过有道德的生活，做有道德的人', author: '杜时忠', journal: '湖南师范大学教育科学学报', year: 2007, issue: '(2)', pages: '65-68' },
  { id: 19, title: '高校生活德育探析', author: '贾玉珍', journal: '教育探索', year: 2008, issue: '(11)', pages: '119-120' },
  { id: 20, title: '跟随鲁洁先生学习道德教育哲学', author: '朱小蔓', journal: '南京师大学报', year: 2010, issue: '(2)', pages: '73-79' },
  { id: 21, title: '关于"生活德育"的学理澄清与实践反观', author: '胡金木', journal: '全球教育展望', year: 2010, issue: '(11)', pages: '16-21' },
  { id: 22, title: '德育的知识化与德育的生活化：困境及其"精神性"问题', author: '钟晓琳; 朱小蔓', journal: '课程·教材·教法', year: 2012, issue: '(5)', pages: '81-88' },
  { id: 23, title: '基于生活化的学校德育困境与突破', author: '王子荣', journal: '内蒙古师范大学学报', year: 2012, issue: '(10)', pages: '1-5' },
  { id: 24, title: '关于生活德育资源开发的思考', author: '程伟; 唐汉卫', journal: '当代教育科学', year: 2012, issue: '(10)', pages: '25-27' },
  { id: 25, title: '德育创新不能背离教育的历史逻辑和德育的基本原理', author: '冯文全', journal: '教育研究', year: 2011, issue: '(12)', pages: '39-44' },
  { id: 26, title: '生活德育论的理论隐忧与现实困境', author: '杨金华', journal: '高等教育研究', year: 2015, issue: '(8)', pages: '83-89' },
  { id: 27, title: '生活德育：理论成就与实践贡献', author: '俞晓婷; 高德胜', journal: '中国德育', year: 2015, issue: '(10)', pages: '14-18' },
  { id: 28, title: '鲁洁先生生活德育论所实现的三重超越', author: '檀传宝; 欧阳广敏', journal: '南京师大学报', year: 2021, issue: '(4)', pages: '5-13' },
  { id: 29, title: '论鲁洁先生教育人学思想的三维构成', author: '章乐; 高德胜', journal: '中国教育科学', year: 2022, issue: '(1)', pages: '3-14' },
  { id: 30, title: '实践人·生活世界·超越性德育：鲁洁道德教育哲学思想研究', author: '陈依林; 胡金木', journal: '中国教育科学', year: 2023, issue: '(2)', pages: '3-15' },
  { id: 31, title: '在生活世界中构筑儿童与自然的道德关系', author: '俞晓婷; 高德胜', journal: '中国教育学刊', year: 2023, issue: '(1)', pages: '90-96' },
  { id: 32, title: '德育发展新理念：知性德育与生活德育的融通', author: '庞玉兰', journal: '教育实践与研究', year: 2021, issue: '(9)', pages: '47-52' },
  { id: 34, title: '生活德育：走出学校德育困境的一条有效途径', author: '易高峰', journal: '乐山师范学院学报', year: 2005, issue: '(1)', pages: '84-87' },
];

// ============================================================
// CDP 工具函数
// ============================================================
function getTabList() {
  return new Promise((resolve, reject) => {
    http.get('http://localhost:9222/json', (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { reject(e); } });
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

async function evaluate(ws, expr) {
  const r = await sendCommand(ws, 'Runtime.evaluate', {
    expression: expr, returnByValue: true, awaitPromise: false, timeout: 30000
  });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
  return r.result.value;
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ============================================================
// 主逻辑
// ============================================================
async function verifyOne(ws, cite) {
  // CNKI 精确标题检索：使用高级检索精确匹配题名
  const titleQuery = cite.title.replace(/[：:·""「」【】]/g, ' ').trim().substring(0, 30);
  const url = `https://kns.cnki.net/kns8s/defaultresult/index?dbcode=CJFD&kw=${encodeURIComponent(titleQuery)}&korder=TI`;
  
  console.log(`[${cite.id}] 检索: ${titleQuery}`);
  
  await sendCommand(ws, 'Page.navigate', { url });
  await sleep(2500);
  
  // 等待页面加载
  for (let i = 0; i < 8; i++) {
    const state = await evaluate(ws, 'document.readyState');
    if (state === 'complete') break;
    await sleep(800);
  }

  // 检查验证码（需要在视口内才算真实触发，排除 CNKI 常驻离屏的 tencent-captcha widget）
  const hasCaptcha = await evaluate(ws, `(function() {
    const el = document.querySelector('[class*="tencent-captcha-dy__content"]');
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    // 必须同时：有尺寸 + 在视口内 + 可见
    const inViewport = rect.width > 0 && rect.height > 0
      && rect.top >= 0 && rect.left >= 0
      && rect.bottom <= window.innerHeight && rect.right <= window.innerWidth;
    if (!inViewport) return false;
    const style = window.getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
  })()`);
  if (hasCaptcha) {
    return { ...cite, status: 'CAPTCHA', matches: [], note: '需要验证码' };
  }

  // 等待结果表格完全渲染（知网异步加载）
  for (let i = 0; i < 10; i++) {
    const hasFz14 = await evaluate(ws, `!!document.querySelector('.fz14')`);
    if (hasFz14) break;
    await sleep(600);
  }

  // 提取搜索结果（基于实际 DOM 结构）
  const rawJson = await evaluate(ws, `
    JSON.stringify((function() {
      const results = [];
      
      // 知网搜索结果：.fz14 为标题链接，位于 td 内，周边 td 依次是序号、选择、标题、作者、刊名、时间、被引
      const titleLinks = document.querySelectorAll('#gridTable .fz14, .result-table-list .fz14');
      titleLinks.forEach(titleEl => {
        const row = titleEl.closest('tr');
        if (!row) return;
        const cells = Array.from(row.querySelectorAll('td'));
        // 找到包含标题的 td 的索引
        let titleIdx = -1;
        cells.forEach((td, i) => { if (td.contains(titleEl)) titleIdx = i; });
        results.push({
          title: titleEl.textContent.trim(),
          author: cells[titleIdx + 1] ? cells[titleIdx + 1].textContent.trim() : '',
          journal: cells[titleIdx + 2] ? cells[titleIdx + 2].textContent.trim() : '',
          year: cells[titleIdx + 3] ? cells[titleIdx + 3].textContent.trim().substring(0, 4) : '',
        });
      });
      
      // 获取总计数
      const countText = document.body.innerText.match(/共找到\\s*([\\d,，]+)\\s*条结果/);
      const totalCount = countText ? countText[1] : '?';
      
      if (results.length === 0) {
        return [{ title: 'NO_RESULTS', totalCount, bodySnippet: document.body.innerText.substring(0, 200) }];
      }
      
      results.totalCount = totalCount;
      return results.slice(0, 8);
    })())
  `);

  let matches = [];
  try {
    matches = JSON.parse(rawJson || '[]');
  } catch(e) {
    matches = [{ error: e.message }];
  }

  // 匹配判断：检查所有结果（前8条）
  const noResults = matches[0]?.title === 'NO_RESULTS';

  let matchedResult = null;
  if (!noResults) {
    // 检查任意一条结果是否标题含前10字 + 年份匹配
    matchedResult = matches.find(r => {
      const titleKey = cite.title.replace(/[：:·""「」【】\s]/g, '').substring(0, 10);
      const rTitle = (r.title || '').replace(/[：:·""「」【】\s]/g, '');
      const titleOK = rTitle.includes(titleKey);
      const yearOK = !r.year || r.year === String(cite.year);
      return titleOK && yearOK;
    });
  }

  let status;
  if (noResults) status = 'NOT_FOUND';
  else if (matchedResult) status = 'CONFIRMED';
  else status = 'UNVERIFIED'; // 有结果但未精确匹配，需人工检查

  return {
    id: cite.id,
    cited: { title: cite.title, author: cite.author, journal: cite.journal, year: cite.year, issue: cite.issue, pages: cite.pages },
    matchedResult: matchedResult || null,
    status,
    allResults: matches
  };
}

async function main() {
  const tabs = await getTabList();
  
  // 找到或创建 CNKI 标签页
  let cnkiTab = tabs.find(t => t.url && t.url.includes('cnki.net') && t.type === 'page');
  
  if (!cnkiTab) {
    // 创建新标签页并导航到 CNKI
    const newTab = tabs.find(t => t.type === 'page');
    if (!newTab) { console.error('No page tabs found'); process.exit(1); }
    cnkiTab = newTab;
    console.log('Opening CNKI in existing tab...');
  }
  
  const ws = await connectToTab(cnkiTab.webSocketDebuggerUrl);
  setupHandler(ws);
  
  // 先导航到知网首页确认已登录
  await sendCommand(ws, 'Page.navigate', { url: 'https://kns.cnki.net/kns8s/defaultresult/index' });
  await sleep(3000);
  
  const results = [];
  
  for (const cite of citations) {
    try {
      const result = await verifyOne(ws, cite);
      results.push(result);
      process.stdout.write(`  → ${result.status}\n`);
      
      // 遇到验证码则暂停
      if (result.status === 'CAPTCHA') {
        console.log('\n⚠️  遇到验证码，已停止。请手动在 Chrome 中通过验证后按回车继续...');
        await new Promise(resolve => process.stdin.once('data', resolve));
      }
      
      await sleep(2500); // 降低频率，减少触发验证码
    } catch(e) {
      results.push({ id: cite.id, status: 'ERROR', error: e.message });
      process.stdout.write(`  → ERROR: ${e.message}\n`);
    }
  }
  
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(results, null, 2), 'utf8');
  console.log(`\n✅ 核查完成！结果保存到: ${OUTPUT_FILE}`);
  console.log(`   总计: ${results.length} 条`);
  console.log(`   已确认: ${results.filter(r => r.status === 'CONFIRMED').length} 条`);
  console.log(`   未找到: ${results.filter(r => r.status === 'NOT_FOUND').length} 条`);
  console.log(`   需验证: ${results.filter(r => r.status === 'UNVERIFIED').length} 条`);
  
  ws.close();
}

main().catch(e => { console.error('Fatal error:', e); process.exit(1); });
