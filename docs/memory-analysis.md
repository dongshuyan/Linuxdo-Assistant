# Linux.do Assistant 内存占用分析报告

本文档详细分析 `Linuxdo-Assistant.user.js` 脚本中所有可能产生内存占用的位置，包括存储内容、占用量估算、清除机制等。

---

## 目录

1. [全局常量和配置对象](#1-全局常量和配置对象)
2. [Utils 类静态属性](#2-utils-类静态属性)
3. [App 类实例数据](#3-app-类实例数据)
4. [定时器](#4-定时器setintervalsettimeout)
5. [事件监听器](#5-事件监听器)
6. [SieveModule 筛选工具](#6-sievemodule-筛选工具)
7. [iframe 隐藏元素](#7-iframe-隐藏元素)
8. [GM_xmlhttpRequest 请求](#8-gm_xmlhttprequest-请求)
9. [GM_getValue 持久化数据](#9-gm_getvaluegm_setvalue-持久化数据)
10. [极限情况分析](#10-极限情况分析)

---

## 1. 全局常量和配置对象

### 1.1 CONFIG 对象
- **位置**: 第 46-123 行
- **存储内容**: 
  - API 地址配置（9个URL字符串）
  - 升级要求配置（0级和1级的7个指标）
  - 缓存键名（约30个字符串常量）
- **示例数据**:
  ```javascript
  CONFIG = {
      API: {
          TRUST: 'https://connect.linux.do',
          CREDIT_INFO: 'https://credit.linux.do/api/v1/oauth/user-info',
          // ... 共9个URL
      },
      LEVEL_REQUIREMENTS: {
          0: { topics_entered: { name: '浏览的话题', target: 5 }, ... },
          1: { days_visited: { name: '访问天数', target: 15 }, ... }
      },
      KEYS: { POS: 'lda_v4_pos', THEME: 'lda_v4_theme', ... }  // 约30个
  }
  ```
- **预估内存**: 3-5KB
- **刷新是否清除**: ✅ 是（页面刷新重新加载脚本）
- **是否主动清除**: ❌ 否，脚本运行期间始终存在

### 1.2 I18N 多语言对象
- **位置**: 第 141-437 行
- **存储内容**: 中文和英文两套翻译，约150个键值对
- **示例数据**:
  ```javascript
  I18N = {
      zh: {
          title: "Linux.do 仪表盘",
          tab_trust: "信任级别",
          support_desc: ["小秘书可以来一杯咖啡吗～☕", ...],  // 14条随机语录
          // ... 共约75个键
      },
      en: { ... }  // 同样结构的英文翻译
  }
  ```
- **预估内存**: 15-20KB
- **刷新是否清除**: ✅ 是
- **是否主动清除**: ❌ 否

### 1.3 SIEVE_CONFIG 筛选配置
- **位置**: 第 1609-1652 行
- **存储内容**:
  - 等级配置（4个等级，含正则检测函数）
  - 分类配置（16个分类，含ID和名称）
  - 标签配置（31个标签字符串）
- **示例数据**:
  ```javascript
  SIEVE_CONFIG = {
      LEVELS: [
          { key: 'public', label: '公开(Lv0)', check: (cls) => !/lv\d+/i.test(cls) },
          { key: 'lv1', label: 'Lv1', check: (cls) => /lv1/i.test(cls) },
          // ...
      ],
      CATEGORIES: [
          { id: '4', name: '开发调优' },
          { id: '98', name: '国产替代' },
          // ... 共16个
      ],
      TAGS: ["无标签", "纯水", "快问快答", "人工智能", ...]  // 31个
  }
  ```
- **预估内存**: 5KB
- **刷新是否清除**: ✅ 是
- **是否主动清除**: ❌ 否

---

## 2. Utils 类静态属性

### 2.1 rateLimitUntil 限流锁
- **位置**: 第 444-466 行
- **存储内容**: 6个API分组的冷却截止时间戳
- **示例数据**:
  ```javascript
  Utils.rateLimitUntil = {
      session: 0,       // /session/current.json
      user: 0,          // /u/*.json
      leaderboard: 0,   // /leaderboard/*.json
      connect: 1704067200000,  // 遇到429后设置，如：2024-01-01 00:00:00
      credit: 0,
      cdk: 0
  }
  ```
- **预估内存**: 200B
- **刷新是否清除**: ✅ 是（但会从 GM_getValue 恢复未过期的锁）
- **是否主动清除**: ❌ 否，但时间戳过期后会自动失效

### 2.2 lastLeaderboardFetch 排行榜冷却
- **位置**: 第 493-498 行
- **存储内容**: 上次请求排行榜的时间戳
- **示例数据**: `Utils.lastLeaderboardFetch = 1704067200000`
- **预估内存**: 8B
- **刷新是否清除**: ✅ 是（但会从 GM_getValue 恢复）
- **是否主动清除**: ❌ 否

---

## 3. App 类实例数据

### 3.1 this.state 用户设置
- **位置**: 第 2906-2923 行
- **存储内容**: 用户的所有偏好设置
- **示例数据**:
  ```javascript
  this.state = {
      lang: 'zh',                    // 语言
      theme: 'auto',                 // 主题：auto/light/dark
      height: 'auto',                // 面板高度：sm/lg/auto
      expand: false,                 // 自动展开面板
      tabOrder: ['trust', 'credit', 'cdk'],  // 标签顺序
      refreshInterval: 30,           // 自动刷新间隔（分钟）
      opacity: 1,                    // 透明度
      gainAnim: true,                // 涨分动画
      useClassicIcon: false,         // 经典图标
      iconSize: 'sm',                // 图标大小：sm/md/lg
      displayMode: 'float',          // 显示模式：float/header
      sieveEnabled: true,            // 筛选工具开关
      fontSize: 100,                 // 字体大小百分比
      settingSubTab: 'func',         // 设置页子标签
      showDailyRank: false           // 显示每日排名
  }
  ```
- **预估内存**: 500B
- **刷新是否清除**: ✅ 是（但会从 GM_getValue 恢复）
- **是否主动清除**: ❌ 否

### 3.2 this.trustData 信任数据缓存
- **位置**: 第 2926 行
- **存储内容**: 信任级别页面的所有数据
- **示例数据**:
  ```javascript
  this.trustData = {
      basic: {
          level: "2",
          isPass: false,
          source: "connect",  // 或 "summary"
          ui: "normal",       // 或 "fallback"
          items: [
              { name: "浏览的话题", current: "156", target: 200, isGood: false, pct: 78, diff: 5 },
              { name: "已读帖子", current: "1234", target: 2000, isGood: false, pct: 61.7, diff: 23 },
              { name: "送出赞", current: "89", target: 100, isGood: false, pct: 89, diff: 0 },
              // ... 可能有7-10个指标
          ]
      },
      stats: {
          dailyRank: 42,
          score: 12345,
          memberDays: 180
      }
  }
  ```
- **预估内存**: 5-15KB（取决于 items 数量和字符串长度）
- **刷新是否清除**: ✅ 是
- **是否主动清除**: ⚠️ 账号切换时清空（ensureUserSig），或手动清除缓存

### 3.3 this.creditData 积分数据缓存
- **位置**: 第 2927 行
- **存储内容**: 积分页面的所有数据
- **示例数据**:
  ```javascript
  this.creditData = {
      info: {
          available_balance: "125.50",
          remain_quota: "50.00",
          username: "Sauterne",
          "community-balance": "100.00"
      },
      stats: [
          { date: "2024-01-01", income: "5.00", expense: "0.00" },
          { date: "2024-01-02", income: "3.50", expense: "1.00" },
          // ... 最近7天记录
      ],
      gamificationScore: 135.75,
      communityBalance: 100.00,
      estimatedGain: 35.75
  }
  ```
- **预估内存**: 2-5KB
- **刷新是否清除**: ✅ 是
- **是否主动清除**: ⚠️ 账号切换时清空，或手动清除缓存

### 3.4 this.cdkCache CDK数据缓存
- **位置**: 第 2925 行
- **存储内容**: CDK 分数页面的数据
- **示例数据**:
  ```javascript
  this.cdkCache = {
      data: {
          id: 12345,
          username: "Sauterne",
          nickname: "小秘书",
          trust_level: 2,
          score: 850
      },
      ts: 1704067200000  // 缓存时间戳
  }
  ```
- **预估内存**: 1-2KB
- **刷新是否清除**: ✅ 是
- **是否主动清除**: ⚠️ 账号切换时清空，或手动清除缓存

### 3.5 this.iconCache 图标Base64缓存 ⚠️ 重点
- **位置**: 第 2924 行
- **存储内容**: 两张小秘书图标的 Base64 编码
- **示例数据**:
  ```javascript
  this.iconCache = {
      version: "2",
      normal: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAgAAAAIACAY...（约50KB）",
      hover: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAgAAAAIACAY...（约50KB）"
  }
  ```
- **预估内存**: 100-200KB（两张 512x512 PNG 图片的 Base64 编码）
- **刷新是否清除**: ✅ 是
- **是否主动清除**: ❌ 否，持久化到 GM_setValue，脚本启动时加载

### 3.6 this.dom DOM元素引用
- **位置**: 第 3087-3104 行
- **存储内容**: 面板中所有需要操作的 DOM 元素引用
- **示例数据**:
  ```javascript
  this.dom = {
      root: HTMLDivElement,      // #lda-root
      ball: HTMLDivElement,      // .lda-ball
      panel: HTMLDivElement,     // .lda-panel
      trustPage: HTMLDivElement, // #page-trust
      creditPage: HTMLDivElement,
      cdkPage: HTMLDivElement,
      settingPage: HTMLDivElement,
      trust: HTMLDivElement,     // #content-trust
      credit: HTMLDivElement,
      cdk: HTMLDivElement,
      setting: HTMLDivElement,
      slowTips: NodeList,        // .lda-slow-tip 集合
      themeBtn: HTMLDivElement,
      tabs: NodeList,            // .lda-tab 集合
      head: HTMLDivElement,
      headerBtn: HTMLSpanElement | null
  }
  ```
- **预估内存**: 2-3KB（仅引用，不含 DOM 元素本身）
- **刷新是否清除**: ✅ 是
- **是否主动清除**: ❌ 否

### 3.7 this.pendingStatus 等待状态
- **位置**: 第 2941-2944 行
- **存储内容**: 三个页面的请求等待状态
- **示例数据**:
  ```javascript
  this.pendingStatus = {
      trust: { count: 1, since: 1704067200000, timer: TimeoutID, slowShown: false },
      credit: { count: 0, since: null, timer: null, slowShown: false },
      cdk: { count: 0, since: null, timer: null, slowShown: false }
  }
  ```
- **预估内存**: 300B
- **刷新是否清除**: ✅ 是
- **是否主动清除**: ⚠️ 请求完成后 count 归零，timer 清除

### 3.8 其他状态追踪
- **位置**: 第 2946-2952 行
- **存储内容**:
  ```javascript
  this.refreshingPages = { trust: false, credit: false, cdk: false };  // 刷新中状态
  this.refreshStartTime = { trust: 0, credit: 0, cdk: 0 };             // 刷新开始时间
  this.refreshStopPending = { trust: false, credit: false, cdk: false }; // 延迟停止
  this.lastRefreshAttempt = { trust: 0, credit: 0, cdk: 0 };           // 上次请求时间
  this.cdkWaiters = [];  // CDK bridge 回调队列
  this.focusFlags = { trust: false, credit: false, cdk: false };       // 焦点刷新标志
  ```
- **预估内存**: 500B
- **刷新是否清除**: ✅ 是
- **是否主动清除**: ⚠️ 操作完成后重置

---

## 4. 定时器（setInterval/setTimeout）

### 4.1 autoRefreshTimer 自动刷新
- **位置**: 第 5388-5403 行
- **功能**: 根据用户设置（30/60/120分钟）定时刷新所有数据
- **创建时机**: init() 调用 startAutoRefreshTimer()
- **示例代码**:
  ```javascript
  this.autoRefreshTimer = setInterval(() => {
      this.refreshTrust({ background: true, force: false });
      this.refreshCredit({ background: true, force: false });
      this.refreshCDK({ background: true, force: false });
  }, interval);  // 30/60/120分钟
  ```
- **内存影响**: 
  - 定时器本身: ~100B
  - 闭包引用 this (App实例): 阻止 App 实例被 GC
- **刷新是否清除**: ✅ 是
- **是否主动清除**: ❌ 否，脚本运行期间持续存在

### 4.2 userWatchTimer 用户监控
- **位置**: 第 4147 行
- **功能**: 每60秒检测一次账号切换/退出
- **示例代码**:
  ```javascript
  this.userWatchTimer = setInterval(tickCore, 60000);
  ```
- **内存影响**: ~100B + 闭包引用
- **刷新是否清除**: ✅ 是
- **是否主动清除**: ❌ 否

### 4.3 _tickDebounceTimer 防抖
- **位置**: 第 4121-4126 行
- **功能**: 500ms 防抖，避免频繁检测用户切换
- **示例代码**:
  ```javascript
  this._tickDebounceTimer = setTimeout(() => {
      this._tickDebounceTimer = null;
      tickCore();
  }, 500);
  ```
- **内存影响**: ~100B
- **刷新是否清除**: ✅ 是
- **是否主动清除**: ⚠️ 500ms 后自动执行并清除

### 4.4 pendingStatus[].timer 慢速提示
- **位置**: 第 3831-3839 行
- **功能**: 请求超过5秒后显示"请求有点慢"提示
- **内存影响**: ~100B × 3个页面 = ~300B
- **刷新是否清除**: ✅ 是
- **是否主动清除**: ⚠️ 请求完成后清除

### 4.5 涨分动画清除定时器
- **位置**: 第 4358 行
- **功能**: 1.5秒后移除涨分动画元素
- **示例代码**: `setTimeout(() => anim.remove(), 1500);`
- **内存影响**: ~100B
- **刷新是否清除**: ✅ 是
- **是否主动清除**: ⚠️ 1.5秒后自动执行

### 4.6 Toast 消失定时器
- **位置**: 第 5862-5865 行
- **功能**: Toast 显示一段时间后淡出并移除
- **内存影响**: ~100B
- **刷新是否清除**: ✅ 是
- **是否主动清除**: ⚠️ duration 后自动执行

---

## 5. 事件监听器

### 5.1 全局事件（通过 _globalEventsBound 防止重复）
- **位置**: 第 3666-3688 行
- **包含**:
  | 事件 | 目标 | 功能 |
  |------|------|------|
  | `click` | document | 点击面板外部关闭面板 |
  | `focus` | window | 窗口焦点变化时刷新数据 |
  | `resize` | window | 窗口大小变化时更新面板方向 |

- **防重复机制**:
  ```javascript
  if (!this._globalEventsBound) {
      this._globalEventsBound = true;
      document.addEventListener('click', ...);
      window.addEventListener('focus', ...);
      window.addEventListener('resize', ...);
  }
  ```

### 5.2 用户监控事件
- **位置**: 第 4131-4147 行
- **包含**:
  | 事件 | 目标 | 功能 |
  |------|------|------|
  | `focus` | window | 检测用户切换 |
  | `visibilitychange` | document | 标签页切回时检测 |
  | `storage` | window | 跨标签页存储变化检测 |

### 5.3 CDK 消息事件
- **位置**: 第 5415 行
- **功能**: 接收 CDK iframe 发送的数据
- **示例代码**:
  ```javascript
  window.addEventListener('message', this.onCDKMessage);
  ```

### 5.4 拖拽事件（动态绑定/解绑）
- **位置**: 第 3690-3691, 3664-3665 行
- **功能**: 拖拽悬浮球时绑定，松开时解绑
- **示例代码**:
  ```javascript
  // 拖拽开始时绑定
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
  
  // 松开时解绑
  document.removeEventListener('mousemove', onMove);
  document.removeEventListener('mouseup', onUp);
  ```

### 5.5 内存影响
- 每个事件监听器: ~200B
- 闭包引用 App 实例: 阻止 GC
- **刷新是否清除**: ✅ 是
- **是否主动清除**: ❌ 否（除拖拽事件外）

---

## 6. SieveModule 筛选工具

### 6.1 MutationObserver ⚠️ 重点
- **位置**: 第 2846-2872 行
- **功能**: 监听 DOM 变化以检测 URL 变化（Discourse SPA）
- **示例代码**:
  ```javascript
  this.observer = new MutationObserver(() => {
      // 防抖：200ms 内多次变化只执行一次
      if (this._urlWatcherTimer) clearTimeout(this._urlWatcherTimer);
      this._urlWatcherTimer = setTimeout(() => {
          // 检测 URL 变化
          if (url !== this.lastUrl) {
              this.lastUrl = url;
              this.onUrlChange();
          }
      }, 200);
  });
  this.observer.observe(document, { subtree: true, childList: true });
  ```
- **内存影响**: 
  - Observer 本身: ~1KB
  - 每次 DOM 变化的回调闭包: 通过防抖控制
- **已优化**: v5.14.0 添加 200ms 防抖，避免 Discourse 频繁 DOM 变化导致内存持续增长
- **刷新是否清除**: ✅ 是
- **是否主动清除**: ⚠️ destroy() 时调用 observer.disconnect()

### 6.2 checkInterval 筛选循环
- **位置**: 第 2772-2773 行
- **功能**: 每1.5秒执行一次筛选检查
- **示例代码**:
  ```javascript
  this.checkInterval = setInterval(() => this.forceLoadLoop(), 1500);
  ```
- **内存影响**: ~100B + 闭包
- **刷新是否清除**: ✅ 是
- **是否主动清除**: ⚠️ destroy() 时 clearInterval

### 6.3 筛选状态数据
- **位置**: 第 1923-1928 行
- **存储内容**:
  ```javascript
  this.activeLevels = ['public', 'lv1', 'lv2', 'lv3'];  // 激活的等级
  this.activeCats = ['4', '98', '14', ...];             // 激活的分类ID
  this.tagStates = {                                     // 标签状态：0=中性, 1=包含, 2=排除
      "纯水": 2,        // 排除
      "人工智能": 1,    // 包含
      // ...
  };
  this.presets = {
      "只看技术": { levels: ['lv2', 'lv3'], cats: ['4'], tags: { "纯水": 2 } },
      "排除水帖": { levels: [...], cats: [...], tags: { "纯水": 2, "树洞": 2 } }
  };
  this.presetOrder = ["只看技术", "排除水帖"];
  ```
- **预估内存**: 2-10KB（取决于预设数量）
- **刷新是否清除**: ✅ 是（但会从 GM_getValue 恢复）
- **是否主动清除**: ❌ 否

### 6.4 DOM 行高度缓存
- **位置**: 第 2598 行
- **功能**: 缓存每个帖子行的高度，用于计算 spacer
- **存储位置**: `row.dataset.ldaHeight`
- **示例**: `<tr data-lda-height="55">...</tr>`
- **预估内存**: ~100B × 帖子数量（首页通常20-50条）
- **刷新是否清除**: ✅ 是
- **是否主动清除**: ⚠️ removeSpacer() 时清除

### 6.5 变化检测优化
- **位置**: 第 1937-1939 行
- **功能**: 减少不必要的 DOM 操作
- **示例代码**:
  ```javascript
  this._lastRowCount = 0;    // 上次帖子数量
  this._filterDirty = true;  // 筛选条件是否变化
  ```
- **预估内存**: ~50B
- **刷新是否清除**: ✅ 是
- **是否主动清除**: ⚠️ 自动重置

---

## 7. iframe 隐藏元素

### 7.1 CDK Bridge iframe ⚠️ 重点
- **位置**: 第 5417-5421 行
- **功能**: 用于跨域获取 CDK 分数（当直接请求失败时的兜底方案）
- **创建时机**: 首次请求 CDK 数据且直接请求失败时
- **示例代码**:
  ```javascript
  const iframe = document.createElement('iframe');
  iframe.id = 'lda-cdk-bridge';
  iframe.src = 'https://cdk.linux.do/dashboard';
  iframe.style.cssText = 'width:0;height:0;opacity:0;position:absolute;border:0;pointer-events:none;';
  document.body.appendChild(iframe);
  this.cdkBridgeFrame = iframe;
  ```
- **内存影响**: 
  - iframe 本身: ~100B
  - **加载的页面内容**: 500KB - 2MB ⚠️
    - cdk.linux.do 页面的完整 HTML
    - 页面的 CSS 样式
    - 页面的 JavaScript
    - 页面的 DOM 树
- **刷新是否清除**: ✅ 是
- **是否主动清除**: ❌ 否，创建后一直存在

---

## 8. GM_xmlhttpRequest 请求

### 8.1 请求 Promise 闭包
- **位置**: 第 500-544 行
- **功能**: 发送跨域请求
- **内存影响**:
  ```javascript
  // 每次请求创建一个 Promise
  const res = await new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
          url,
          onload: r => resolve(r.responseText),  // 闭包
          onerror: e => reject(e),               // 闭包
          ontimeout: () => reject(new Error('timeout'))  // 闭包
      });
  });
  ```
- **预估内存**: 1-5KB/请求
- **刷新是否清除**: ✅ 是
- **是否主动清除**: ⚠️ 请求完成后被 GC

### 8.2 响应数据
- **示例响应大小**:
  | API | 响应大小 |
  |-----|----------|
  | `/session/current.json` | ~2KB |
  | `/u/username.json` | ~10-20KB |
  | `/u/username/summary.json` | ~5KB |
  | `/leaderboard/1.json` | ~20KB |
  | connect.linux.do | ~30-50KB (HTML) |
  | credit.linux.do/api/* | ~2KB |
  | cdk.linux.do/api/* | ~1KB |
- **刷新是否清除**: ✅ 是
- **是否主动清除**: ⚠️ 解析后原始字符串被 GC

### 8.3 图片下载 Blob
- **位置**: 第 4036-4055 行
- **功能**: 下载小秘书图标并转为 Base64
- **示例代码**:
  ```javascript
  GM_xmlhttpRequest({
      url: SECRETARY_ICONS.normal,  // PNG 图片
      responseType: 'blob',
      onload: (response) => {
          const reader = new FileReader();
          reader.readAsDataURL(response.response);  // Blob 转 Base64
      }
  });
  ```
- **预估内存**: ~50KB × 2张图片 = ~100KB（临时）
- **刷新是否清除**: ✅ 是
- **是否主动清除**: ⚠️ 转换完成后 Blob 被 GC

---

## 9. GM_getValue/GM_setValue 持久化数据

### 9.1 存储键值列表

| 键名 | 存储内容 | 预估大小 |
|------|----------|----------|
| `lda_v4_pos` | `{ r: 20, t: 100 }` 悬浮球位置 | ~30B |
| `lda_v4_theme` | `"auto"` 主题 | ~10B |
| `lda_v4_expand` | `false` 自动展开 | ~5B |
| `lda_v4_height` | `"auto"` 面板高度 | ~10B |
| `lda_v4_lang` | `"zh"` 语言 | ~5B |
| `lda_v5_cache_trust_data` | 完整的 trustData 对象 | ~5-15KB |
| `lda_v5_cache_credit_data` | 完整的 creditData 对象 | ~2-5KB |
| `lda_v5_cache_cdk` | CDK 缓存 `{ data, ts }` | ~1-2KB |
| `lda_v5_icon_cache` | **图标 Base64** | **~100-200KB** ⚠️ |
| `lda_v5_sieve_presets` | 筛选预设 | ~2-10KB |
| `lda_v5_sieve_levels` | 激活等级数组 | ~50B |
| `lda_v5_sieve_cats` | 激活分类数组 | ~200B |
| `lda_v5_sieve_tags` | 标签状态对象 | ~500B |
| `lda_v5_rate_limit` | 限流时间戳对象 | ~200B |
| `lda_v5_tab_order` | 标签顺序 | ~30B |
| `lda_v5_refresh_interval` | 刷新间隔 | ~5B |
| `lda_v5_opacity` | 透明度 | ~5B |
| `lda_v5_user_sig` | 用户标识 | ~30B |
| `lda_v5_font_size` | 字体大小 | ~5B |
| `lda_v5_display_mode` | 显示模式 | ~10B |
| 其他... | ... | ... |

### 9.2 总持久化数据量
- **正常情况**: ~120-240KB
- **主要贡献**: icon_cache (100-200KB)

---

## 10. 极限情况分析

### 10.1 极限情况定义

以下条件同时满足时，内存占用达到最大：

1. **启用小秘书图标**（非经典模式）→ iconCache 加载 ~150KB
2. **CDK Bridge iframe 已创建**（首次 CDK 请求失败触发）→ ~1-2MB
3. **启用筛选工具**且在首页 → SieveModule 运行
4. **首页帖子数量达到最大**（滚动加载至底部，~200条）→ 行高度缓存 ~20KB
5. **保存了大量筛选预设**（假设10个复杂预设）→ ~10KB
6. **所有数据缓存都已填充** → trustData + creditData + cdkCache ~20KB
7. **面板展开状态** → DOM 元素全部渲染
8. **多个定时器同时运行** → autoRefresh + userWatch + sieveCheck

### 10.2 极限内存占用计算

| 类别 | 极限占用 |
|------|----------|
| 静态配置（CONFIG, I18N, SIEVE_CONFIG） | 25KB |
| iconCache (Base64 图标) | 200KB |
| 数据缓存 (trust + credit + cdk) | 25KB |
| DOM 引用 + DOM 元素 | 50KB |
| **CDK Bridge iframe** | **1.5MB** ⚠️ |
| SieveModule 状态 + Observer | 5KB |
| 筛选预设 (10个) | 10KB |
| 行高度缓存 (200条帖子) | 20KB |
| 定时器闭包 | 2KB |
| 事件监听器闭包 | 2KB |
| 进行中的网络请求 (假设3个并行) | 100KB |
| **总计** | **约 1.9MB - 2.0MB** |

### 10.3 典型场景内存占用

| 场景 | 预估内存 | 说明 |
|------|----------|------|
| **最小（新安装，未使用）** | ~200KB | 静态配置 + 初始化 |
| **正常使用** | ~400-600KB | 包含图标缓存 + 数据缓存 |
| **完整功能使用** | ~700KB-1MB | 包含筛选工具 + 预设 |
| **极限情况** | **~2MB** | 包含 CDK iframe |

### 10.4 CDK iframe 的特殊说明

CDK Bridge iframe 是内存占用最大的单项，但它有以下特点：

1. **触发条件苛刻**：只有当直接 GM_xmlhttpRequest 请求 cdk.linux.do 失败时才会创建
2. **通常不触发**：大多数情况下直接请求成功
3. **一次创建**：创建后不会重复创建
4. **用途**：跨域 Cookie 兼容性兜底方案

### 10.5 如何降低内存占用

如果用户关注内存占用，可以：

1. **使用经典图标模式** → 节省 ~150KB
2. **关闭筛选工具** → 节省 ~20-50KB
3. **不保存预设** → 节省 ~10KB
4. **关闭自动刷新** → 减少定时器闭包
5. **定期刷新页面** → 释放所有内存

