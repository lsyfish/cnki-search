---
name: cnki-search
description: 通过 Chrome DevTools Protocol (CDP) 自动化访问中国知网 (CNKI)，执行文献检索、结果抓取、引用核查等操作。当用户需要搜索知网、抓取 CNKI 文献、核查参考文献、处理知网验证码，或需要编写/运行知网 CDP 脚本时，必须使用此 skill。触发词包括：知网、CNKI、文献检索、文献核查、知网爬虫、cnki_search、引用核查。
---

# CNKI 知网 CDP 自动化

通过 Chrome DevTools Protocol 控制已打开知网的 Chrome 浏览器，实现文献搜索、批量抓取和引用核查。

## 环境要求

- Chrome 以远程调试模式启动：`chrome.exe --remote-debugging-port=9222`
- 已在 Chrome 中打开并登录知网：`https://kns.cnki.net`
- Node.js 已安装，依赖：`ws`

**脚本位置**：所有脚本已打包在 `scripts/` 子目录（`c:\Users\啾啾\.claude\skills\cnki-search\scripts\`）。
初次使用前在该目录安装依赖：
```powershell
cd "C:\Users\啾啾\.claude\skills\cnki-search\scripts"
npm install ws
```

> 也可就地在 `d:\论文\` 中使用原始脚本，已安装 ws。

## 脚本清单与详细说明

### `cnki_advanced.js` — 主力多关键词搜索（推荐首选）

**用途**：执行多组预设关键词搜索，去重后输出 JSON。内置 CSSCI 过滤（URL 参数 `yk=CSSCI`）。

```
node cnki_advanced.js         # 无参数，使用脚本内 queries 数组
```

**内置搜索词组**（可修改脚本中的 `queries` 数组）：
```js
const queries = [
  { kw: '生活德育', label: '核心检索' },
  { kw: '道德教育 生活化', label: '道德教育生活化' },
  { kw: '鲁洁 德育', label: '鲁洁德育' },
  { kw: '高德胜 生活德育', label: '高德胜' },
];
```

**结果提取逻辑**（两套选择器）：
1. `#gridTable tbody tr` → 表格行，按列索引取 td[1]=标题 td[3]=作者 td[4]=来源 td[5]=日期 td[6]=被引
2. `.fz14` → 备用：仅抓标题链接

**去重策略**：标题前 20 字符为 key，重复则丢弃。
**输出**：`d:\论文\cnki_results.json`

---

### `cnki_search.js` — 基础搜索（支持命令行参数）

```
node cnki_search.js "检索词" [来源] [年份起] [年份止]
# 示例：
node cnki_search.js "生活德育" CSSCI 2010 2024
```

**特点**：
- 遇到验证码时会在控制台提示，需用户在 Chrome 手动完成后按回车
- 输出到控制台（不写文件），适合快速测试

---

### `cnki_search2.js` — 交互式搜索（验证码友好版，推荐线上使用）

```
node cnki_search2.js    # 无参数，内置 searches 数组
```

**内置搜索词**（可修改 `searches` 数组）：
```js
const searches = ['生活德育', '道德教育 生活化', '鲁洁 道德教育', '高德胜 德育', '品德 生活世界'];
```

**验证码处理**：检测到验证码时打印提示，用 `readline` 等待用户在 Chrome 手动完成后回车继续。

**三套结果提取选择器**（按优先级）：
1. `#gridTable tbody tr` — 新版知网
2. `a.fz14` — 抓标题链接，从 `closest('tr')` 推断其他字段
3. 返回 `__DEBUG__` 并把 HTML 写到 `cnki_debug.html` 供调试

**输出**：`d:\论文\cnki_results.json`（含 `keyword` 字段标注来源检索词）

---

### `cnki_cite_verify.js` — 批量引用核查（最重要的核查脚本）

```
node cnki_cite_verify.js
```

**工作方式**：
1. 读取脚本顶部的 `citations` 数组（硬编码的文献列表）
2. 对每条文献，截取标题前 30 字（去除 `：:·""「」【】` 等特殊字符）作为搜索词
3. 用 `korder=TI`（标题检索）在 CNKI 搜索，提取前 8 条结果
4. 匹配规则：标题前 10 字（去特殊字符）命中 + 年份吻合 → `CONFIRMED`

**状态码**：
| 状态 | 含义 |
|------|------|
| `CONFIRMED` | 明确找到匹配文献 |
| `UNVERIFIED` | 有搜索结果但未精确匹配，需人工检查 |
| `NOT_FOUND` | 知网返回"暂无数据" |
| `CAPTCHA` | 遇到真实验证码，需中断处理 |

**验证码判断逻辑**（关键）：知网页面常驻一个离屏的 tencent-captcha 组件，必须同时满足「有尺寸 + 在视口内 + 可见」才判定为真实触发。

**输出**：`d:\论文\cnki_verify_results.json`

---

### `cnki_recheck.js` / `cnki_recheck2.js` / `cnki_recheck3.js` — 逐轮重查

针对 `cnki_cite_verify.js` 核查失败（UNVERIFIED/NOT_FOUND）的文献进行重查。各版本差异：
- `cnki_recheck.js`：处理含 `——`、`：` 等特殊符号导致报错的标题，将搜索词截短再查
- `cnki_recheck2.js`：第二轮，针对 `[10][19][32]` 等
- `cnki_recheck3.js`：第三轮

---

### `cnki_test_one.js` — 单条测试

```
node cnki_test_one.js
```
用于调试单条文献的搜索与匹配逻辑，快速验证脚本改动是否生效。

---

### `cnki_captcha_check.js` — 验证码状态检测

```
node cnki_captcha_check.js
```
检测多个验证码选择器：`.tc-slider-normal`、`.captcha`、`[class*="captcha"]`，并输出 URL、页面标题、各选择器命中情况。

---

### `cnki_captcha_vis.js` — 验证码 CSS 状态分析

检查 `[class*="tencent-captcha-dy__content"]` 元素的 `display`、`visibility`、`opacity`、`zIndex`、`position` 等样式属性，判断是否真正可见。

---

### `cnki_captcha_vis2.js` — 验证码视口 + iframe 分析

除 CSS 外，还检查：
- 元素是否在当前视口内（`getBoundingClientRect` 判断）
- 父元素链是否有 `display:none` 或 `overflow:hidden` 遮挡
- 页面中所有 iframe 的 `src`、`id`、`class`

---

### `cnki_diag.js` — 页面诊断

```
node cnki_diag.js
```
连接到第一个 page 类型标签页，输出当前 URL 和页面内容片段，快速确认 Chrome 连接是否正常。

## 标准 CDP 工具函数模板

所有脚本共享相同模式，新建脚本时直接复用：

```javascript
const http = require('http');
const WebSocket = require('ws');

function getTabList() {
  return new Promise((resolve, reject) => {
    http.get('http://localhost:9222/json', (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    }).on('error', reject);
  });
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

async function main() {
  const tabs = await getTabList();
  const tab = tabs.find(t => t.type === 'page');
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise(r => ws.on('open', r));
  setupHandler(ws);
  // ... 业务逻辑
  ws.close();
}
main().catch(console.error);
```

## 知网搜索 URL 规律

```
# 标题检索（korder=TI）
https://kns.cnki.net/kns8s/defaultresult/index?dbcode=CJFD&kw={URL编码关键词}&korder=TI

# 结果元素选择器
.fz14           → 文章标题链接
.author         → 作者
.source         → 期刊名
.year           → 年份（通常在 .date 内）
#gridTable      → 结果表格
.result-table-list → 结果列表容器
```

## 常见问题处理

### 验证码（腾讯滑动验证）
- 先运行 `cnki_captcha_check.js` 确认验证码存在
- 知网的验证码通常在 **iframe** 内，直接操作 main frame 无效
- 最可靠方案：使用 `cnki_search2.js`，脚本遇到验证码时暂停，用户手动在 Chrome 完成后按回车继续

### 特殊字符导致"请稍后重试"
- 标题含 `·`、`——`、`：` 等特殊字符时，搜索词需截短或去掉特殊符号
- 使用标题前几个关键字搜索，再从结果中人工确认

### 中文编码问题（Windows 终端乱码）
- 脚本中不用 `console.log` 输出中文，改用 `fs.writeFileSync` 写 JSON 文件
- 运行时加 `chcp 65001` 或在 PowerShell 中先执行 `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8`

### 页面加载等待
- `Page.navigate` 后加 `await sleep(3000~5000)` 等待渲染
- 用轮询检查目标选择器是否出现，不要用固定等待时间

## 典型工作流

1. **搜索并收集**：运行 `cnki_advanced.js` → 结果存 `cnki_results.json`
2. **核查引用**：修改 `cnki_cite_verify.js` 中的 `citations` 数组 → 运行 → 结果存 `cnki_verify_results.json`
3. **处理问题条目**：针对核查失败的文献，用 `cnki_recheck.js` 系列脚本单独处理
4. **调试页面问题**：用 `cnki_diag.js` 检查页面状态，`cnki_captcha_*.js` 检查验证码

## 输出文件

- `d:\论文\cnki_results.json` — 搜索结果（文献列表）
- `d:\论文\cnki_verify_results.json` — 引用核查结果
