# cnki-search — CNKI 知网 CDP 自动化工具包

<div align="center">

![Node.js](https://img.shields.io/badge/Node.js-%E2%89%A516-brightgreen?logo=node.js)
![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)
![Platform](https://img.shields.io/badge/Platform-Chrome%20CDP-4285F4?logo=googlechrome)
![CNKI](https://img.shields.io/badge/%E7%9F%A5%E7%BD%91-CNKI-E8002D)
![Copilot Skill](https://img.shields.io/badge/GitHub%20Copilot-Skill-8957E5?logo=github)

**通过 Chrome DevTools Protocol 驱动知网，无需 API Key，仅需一个已登录的 Chrome 窗口。**  
**Drive CNKI via Chrome DevTools Protocol — no API key required, just an open Chrome window.**

```
Chrome (--remote-debugging-port=9222)
        │
        ▼  WebSocket CDP
  cnki_*.js 脚本
        │
   ┌────┴────────────────┐
   │  搜索 / 核查 / 诊断  │
   └────┬────────────────┘
        │
   cnki_results.json
   cnki_verify_results.json
```

</div>

[English](#english) | [中文](#中文)

---

## 中文

### 简介

通过 **Chrome DevTools Protocol (CDP)** 控制已登录知网的 Chrome 浏览器，实现：
- 按关键词批量检索 CNKI 文献（支持 CSSCI 过滤）
- 将检索结果导出为 JSON
- 对参考文献列表进行自动化核查（精确匹配 + 状态标注）
- 诊断验证码状态，并在遇到腾讯滑动验证时暂停等待人工处理

> 本项目同时包含 **GitHub Copilot Skill**（`SKILL.md`），可在 VS Code 中直接调用。

### 快速开始

#### 1. 启动 Chrome（远程调试模式）
```powershell
# Windows
Start-Process "chrome.exe" "--remote-debugging-port=9222"
```

#### 2. 在 Chrome 中打开并登录知网
访问 `https://kns.cnki.net` 并完成机构/个人账号登录。

#### 3. 安装依赖
```bash
cd scripts
npm install
```

#### 4. 运行脚本
```bash
# 按多组关键词搜索，输出 cnki_results.json
node scripts/cnki_advanced.js

# 按关键词搜索（支持参数）
node scripts/cnki_search.js "生活德育" CSSCI 2010 2024

# 交互式搜索（遇验证码暂停等待手动操作）
node scripts/cnki_search2.js

# 批量引用核查，输出 cnki_verify_results.json
node scripts/cnki_cite_verify.js
```

### 脚本说明

| 脚本 | 用途 |
|------|------|
| `cnki_advanced.js` | 多关键词搜索，CSSCI 过滤，结果去重 |
| `cnki_search.js` | 基础搜索，支持 `关键词 来源 年起 年止` 参数 |
| `cnki_search2.js` | 验证码友好版，遇验证码时暂停 |
| `cnki_cite_verify.js` | 批量引用核查（`CONFIRMED / UNVERIFIED / NOT_FOUND / CAPTCHA`） |
| `cnki_recheck.js/2/3` | 逐轮重查核查失败条目 |
| `cnki_test_one.js` | 单条文献调试 |
| `cnki_captcha_check.js` | 检测页面是否有腾讯滑动验证码 |
| `cnki_captcha_vis.js` | 验证码 CSS 样式分析 |
| `cnki_captcha_vis2.js` | 验证码视口 + iframe 结构分析 |
| `cnki_diag.js` | 诊断 Chrome 连接与页面状态 |

### 输出文件

| 文件 | 内容 |
|------|------|
| `cnki_results.json` | 检索结果（标题/作者/来源/年份/被引/检索词） |
| `cnki_verify_results.json` | 引用核查结果（状态码 + 匹配文献详情） |

### 引用核查状态码

| 状态 | 含义 |
|------|------|
| `CONFIRMED` | 在知网精确找到匹配文献 |
| `UNVERIFIED` | 有搜索结果但未精确匹配，需人工复查 |
| `NOT_FOUND` | 知网无此条文献 |
| `CAPTCHA` | 触发验证码，需手动处理后重跑 |

### 注意事项

- 脚本通过 `localhost:9222` 连接 Chrome，Chrome 必须以 `--remote-debugging-port=9222` 启动
- 知网页面存在常驻离屏的腾讯验证码组件，脚本已处理"假触发"问题
- 含 `·`、`——`、`：` 的文献标题在搜索时会截短/去特殊字符
- Windows 终端中文乱码：运行前执行 `chcp 65001` 或使用 PowerShell

---

## English

### Introduction

Automate [CNKI (China National Knowledge Infrastructure)](https://kns.cnki.net) via **Chrome DevTools Protocol (CDP)** to:
- Search for academic papers by keyword (with CSSCI journal filter)
- Export search results as JSON
- Batch-verify a reference list against CNKI (with match status labels)
- Detect CAPTCHA state and pause for manual resolution

> Includes a **GitHub Copilot Skill** (`SKILL.md`) for direct use in VS Code.

### Quick Start

#### 1. Launch Chrome in remote debugging mode
```bash
# Windows
"C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222

# macOS
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222
```

#### 2. Open and log in to CNKI
Navigate to `https://kns.cnki.net` in Chrome and log in.

#### 3. Install dependencies
```bash
cd scripts
npm install
```

#### 4. Run
```bash
# Multi-keyword search → cnki_results.json
node scripts/cnki_advanced.js

# Parameterized search
node scripts/cnki_search.js "moral education" CSSCI 2010 2024

# Interactive search (pauses on CAPTCHA)
node scripts/cnki_search2.js

# Batch citation verification → cnki_verify_results.json
node scripts/cnki_cite_verify.js
```

### Script Overview

| Script | Purpose |
|--------|---------|
| `cnki_advanced.js` | Multi-keyword search with CSSCI filter and deduplication |
| `cnki_search.js` | Basic search with CLI args: `keyword source yearFrom yearTo` |
| `cnki_search2.js` | CAPTCHA-friendly version; pauses for manual CAPTCHA solve |
| `cnki_cite_verify.js` | Batch citation check (`CONFIRMED / UNVERIFIED / NOT_FOUND / CAPTCHA`) |
| `cnki_recheck.js/2/3` | Re-check failed citations across multiple rounds |
| `cnki_test_one.js` | Single-citation debug |
| `cnki_captcha_check.js` | Detect Tencent sliding CAPTCHA presence |
| `cnki_captcha_vis.js` | Analyze CAPTCHA element CSS visibility |
| `cnki_captcha_vis2.js` | Analyze CAPTCHA viewport position + iframe structure |
| `cnki_diag.js` | Diagnose Chrome connection and page state |

### Requirements

- Node.js ≥ 16
- Chrome with `--remote-debugging-port=9222`
- `ws` npm package (`npm install` in `scripts/`)
- Active CNKI login session in Chrome

### License

MIT

---

## Copilot Skill Usage

Copy the `SKILL.md` file (or the whole `cnki-search/` folder) into your  
`~/.claude/skills/` directory. GitHub Copilot will then automatically load  
this skill whenever you mention CNKI, 知网, 文献检索, or citation verification.
