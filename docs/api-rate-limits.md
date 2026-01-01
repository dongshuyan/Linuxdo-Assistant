# Linuxdo-Assistant API 接口调用与频率限制分析

本文档详细分析了 Linuxdo-Assistant 脚本中调用的所有 linuxdo 网站相关接口，以及各层频率限制机制。

---

## 快速参考：各接口请求频率汇总

| 接口 | 正常使用频率 | 极端最高频率 | 关键限制机制 |
|------|-------------|-------------|-------------|
| `/session/current` | 1 次/60秒 | **3 次/分钟** | 请求频率硬限制（跨标签页持久化）|
| `/u/{username}.json` | 0-2 次/30分钟 | **3 次/分钟** | 请求频率硬限制（跨标签页持久化）|
| `/u/{username}/summary.json` | 0-1 次/30分钟 | **3 次/分钟** | 请求频率硬限制（与上共享 user 分组）|
| `/leaderboard/1.json` | 1 次/30分钟 | **1 次/60秒** | 60秒独立冷却 + 请求频率硬限制（跨标签页持久化）|
| `connect.linux.do` | 1 次/30分钟 | **3 次/分钟** | 请求频率硬限制（跨标签页持久化）|
| `credit.linux.do/user-info` | 1 次/30分钟 | **3 次/分钟** | 请求频率硬限制（跨标签页持久化）|
| `credit.linux.do/stats` | 1 次/30分钟 | **3 次/分钟** | 与上并行请求，共享 credit 分组限制 |
| `cdk.linux.do/user-info` | 1 次/30分钟 | **3 次/分钟** | 请求频率硬限制（跨标签页持久化）|

**所有接口统一硬限制**：每分钟最多 3 次请求（按分组独立计数），不可绕过，跨标签页持久化存储。

**超过限制时**：显示 Toast 提示"请求频率过高，请 Xs 后再试"，优先使用缓存数据。

---

## 一、调用的接口清单

### 1. linux.do 同源接口（通过 fetch 调用）

| 接口 | 调用函数 | 用途 | 分组标识 |
|------|---------|------|----------|
| `/session/current` | `Utils.fetchSessionUser()` | 获取当前用户Session信息（用户名、信任等级等） | `session` |
| `/u/{username}.json` | `Utils.fetchUserInfo(username)` | 获取用户基本信息（信任等级、注册时间、gamification_score等） | `user` |
| `/u/{username}/summary.json` | `Utils.fetchUserSummary(username)` | 获取用户Summary数据（访问天数、已读帖子等升级指标） | `user` |
| `/leaderboard/1.json?period=daily` | `Utils.fetchForumStats()` | 获取每日排行榜数据 | `leaderboard` |

### 2. 跨域接口（通过 GM_xmlhttpRequest 调用）

| 接口 | 调用函数 | 用途 | 分组标识 |
|------|---------|------|----------|
| `https://connect.linux.do` | `Utils.fetchConnectWelcome()`<br>`fetchHighLevelTrustData()` | 获取信任等级详细进度（2级及以上用户） | `connect` |
| `https://credit.linux.do/api/v1/oauth/user-info` | `refreshCredit()` | 获取Credit积分用户信息（余额、额度等） | `credit` |
| `https://credit.linux.do/api/v1/dashboard/stats/daily?days=7` | `refreshCredit()` | 获取近7天积分收支明细 | `credit` |
| `https://cdk.linux.do/api/v1/oauth/user-info` | `initCDKBridgePage()` | 获取CDK社区分数（通过iframe桥接） | `cdk` |

---

## 二、频率限制层级（从宽松到严格）

### 第1层：自动刷新间隔（Auto Refresh Interval）

**限制强度**：🟢 最宽松

**默认值**：30分钟

**适用场景**：后台自动刷新

**存储方式**：`GM_getValue` 持久化存储

**作用范围**：⚠️ **仅当前标签页** — 刷新间隔从页面加载时开始计时，不同标签页独立

**配置项**：`REFRESH_INTERVAL` (用户可在设置中调整，0 为关闭)

**实现代码**：
```javascript
// 默认30分钟定时刷新
const AUTO_REFRESH_MS = 30 * 60 * 1000;

startAutoRefreshTimer() {
    const minutes = this.state.refreshInterval || 30;
    const interval = minutes * 60 * 1000;
    this.autoRefreshTimer = setInterval(() => {
        this.refreshTrust({ background: true, force: false });
        this.refreshCredit({ background: true, force: false });
        this.refreshCDK({ background: true, force: false });
    }, interval || AUTO_REFRESH_MS);
}
```

---

### 第2层：全局冷却（Global Cooldown）

**限制强度**：🟡 宽松

**冷却时间**：5秒

**适用场景**：非手动刷新时，防止短时间内重复请求

**存储方式**：内存变量 `lastRefreshAttempt`

**作用范围**：⚠️ **仅当前标签页** — 存储在内存中，刷新页面后重置

**可绕过条件**：手动点击刷新按钮（`manual: true`）

**实现代码**：
```javascript
// 全局冷却：距离上次请求至少 5 秒（手动刷新除外）
const now = Date.now();
if (!manual && now - this.lastRefreshAttempt.trust < 5000) {
    return;
}
this.lastRefreshAttempt.trust = now;
```

---

### 第3层：排行榜独立冷却（Leaderboard Cooldown）

**限制强度**：🟠 中等

**冷却时间**：60秒

**适用接口**：仅 `/leaderboard/1.json`

**存储方式**：`GM_getValue/GM_setValue` 持久化存储

**作用范围**：✅ **所有标签页共享** — 持久化存储，刷新页面不能解除

**存储键名**：`lda_v5_leaderboard_last_fetch`

**实现代码**：
```javascript
// 60 秒独立冷却：排行榜数据更新频率低，限制请求频率
if (Date.now() - Utils.lastLeaderboardFetch < 60000) {
    return { dailyRank: null, score: null };
}
// 更新排行榜请求时间（持久化存储，跨标签页共享）
Utils.lastLeaderboardFetch = Date.now();
GM_setValue(CONFIG.KEYS.LEADERBOARD_LAST_FETCH, Utils.lastLeaderboardFetch);
```

---

### 第4层：请求频率硬限制（Request Rate Limit）

**限制强度**：🔴 严格

**限制规则**：每分钟最多 3 次请求（按分组独立计数）

**滑动窗口**：1分钟（60秒）

**适用分组**：`session`, `user`, `leaderboard`, `connect`, `credit`, `cdk`

**存储方式**：`GM_getValue/GM_setValue` 持久化存储

**作用范围**：✅ **所有标签页共享** — 持久化存储，刷新页面不能解除

**存储键名**：`lda_v5_request_timestamps`

**实现代码**：
```javascript
// 请求频率限制配置（每分钟最多 3 次请求）
const REQUEST_LIMIT = {
    MAX_REQUESTS_PER_MINUTE: 3,
    WINDOW_MS: 60 * 1000  // 1 分钟窗口
};

// 检查指定分组是否超过请求频率限制
static canMakeRequest(group) {
    const now = Date.now();
    const windowMs = REQUEST_LIMIT.WINDOW_MS;
    const maxRequests = REQUEST_LIMIT.MAX_REQUESTS_PER_MINUTE;
    
    // 从持久化存储重新读取（确保跨标签页同步）
    const saved = GM_getValue(CONFIG.KEYS.REQUEST_TIMESTAMPS, null);
    const timestamps = saved[group].filter(ts => now - ts < windowMs);
    
    return timestamps.length < maxRequests;
}
```

---

### 第5层：429 限流锁（Rate Limit Lock）

**限制强度**：🔴 最严格（服务端强制）

**冷却时间**：根据服务器返回的 `Retry-After` 头，默认 60 秒，最小 10 秒

**触发条件**：服务器返回 HTTP 429 状态码

**适用分组**：`session`, `user`, `leaderboard`, `connect`, `credit`, `cdk`

**存储方式**：`GM_getValue/GM_setValue` 持久化存储

**作用范围**：✅ **所有标签页共享** — 持久化存储，刷新页面不能解除

**存储键名**：`lda_v5_rate_limit`

**实现代码**：
```javascript
// 429 处理：设置分组锁
if (r.status === 429) {
    const retryAfter = parseInt(r.headers.get('Retry-After') || '60', 10);
    Utils.setRateLimit(group, retryAfter);
    return null;
}

// 设置限流锁
static setRateLimit(group, retryAfterSeconds) {
    const retryAfter = Math.max(10, retryAfterSeconds);
    Utils.rateLimitUntil[group] = Date.now() + (retryAfter * 1000);
    // 持久化到存储，支持跨页面/刷新保持限流状态
    GM_setValue(CONFIG.KEYS.RATE_LIMIT, { ...Utils.rateLimitUntil });
}
```

---

## 三、频率限制汇总表

| 层级 | 限制名称 | 限制时间 | 适用范围 | 存储方式 | 能否绕过 |
|------|---------|---------|----------|---------|---------|
| 1 | 自动刷新间隔 | 默认30分钟 | 后台刷新 | 内存 + GM存储 | 手动刷新可绕过 |
| 2 | 全局冷却 | 5秒 | 非手动刷新 | 内存（仅当前标签页） | 手动刷新可绕过 |
| 3 | 排行榜独立冷却 | 60秒 | leaderboard接口 | GM持久化存储（跨标签页） | 不可绕过 |
| 4 | 请求频率硬限制 | 每分钟3次/分组 | 所有接口 | GM持久化存储（跨标签页） | 不可绕过 |
| 5 | 429限流锁 | 服务器指定（默认60s） | 触发429的分组 | GM持久化存储（跨标签页） | 等待冷却结束 |

---

## 四、各接口请求频率分析

### 1. `/session/current` (session 分组)

#### 正常情况

| 触发场景 | 频率 | 说明 |
|---------|------|------|
| 页面初始化 | 1次/页面加载 | `prewarmAll()` 调用 `refreshTrust()` |
| 自动刷新 | 1次/30分钟 | `startAutoRefreshTimer()` 定时触发 |
| 用户监控 | 1次/60秒 | `userWatchTimer` 轮询检测账号切换 |
| 页面可见性变化 | 1次/事件 | `visibilitychange` 事件触发检查 |

**正常频率**：约 1-2 次/分钟（用户监控轮询 + 页面可见性变化）

#### 极端情况

| 触发场景 | 最高频率 | 限制因素 |
|---------|---------|---------|
| 手动快速点击刷新 | 3次/分钟 | 第4层硬限制 |
| 多标签页同时操作 | 3次/分钟（共享） | 第4层硬限制（跨标签页） |

**极端最高频率**：3次/分钟（被第4层硬限制约束）

---

### 2. `/u/{username}.json` 和 `/u/{username}/summary.json` (user 分组)

#### 正常情况

| 触发场景 | 频率 | 说明 |
|---------|------|------|
| 页面初始化（Trust页） | 1-2次/页面加载 | 获取用户信息和Summary |
| 页面初始化（Credit页） | 0-1次/页面加载 | 获取gamification_score |
| 自动刷新 | 1-2次/30分钟 | Trust和Credit刷新时调用 |

**正常频率**：约 1-2 次/30分钟

#### 极端情况

| 触发场景 | 最高频率 | 限制因素 |
|---------|---------|---------|
| 手动快速点击刷新 | 3次/分钟 | 第4层硬限制 |
| 0-1级用户（需要Summary） | 频率略高 | 每次刷新需调用Summary |

**极端最高频率**：3次/分钟（被第4层硬限制约束）

---

### 3. `/leaderboard/1.json` (leaderboard 分组)

#### 正常情况

| 触发场景 | 频率 | 说明 |
|---------|------|------|
| 页面初始化 | 1次/页面加载 | 仅当开启"显示每日排名"设置时 |
| 自动刷新 | 1次/30分钟 | 受第3层60秒独立冷却限制 |

**正常频率**：约 1次/30分钟（如果开启每日排名显示）

#### 极端情况

| 触发场景 | 最高频率 | 限制因素 |
|---------|---------|---------|
| 快速刷新 + 多标签页 | 1次/60秒 | 第3层独立冷却（跨标签页共享） |

**极端最高频率**：1次/60秒（被第3层独立冷却严格限制）

---

### 4. `https://connect.linux.do` (connect 分组)

#### 正常情况

| 触发场景 | 频率 | 说明 |
|---------|------|------|
| 页面初始化（2级+用户） | 1次/页面加载 | 获取信任等级详细进度 |
| 自动刷新（2级+用户） | 1次/30分钟 | Trust页刷新时调用 |
| 用户名/等级获取失败兜底 | 0-1次/刷新 | 作为获取用户信息的兜底方案 |

**正常频率**：约 1次/30分钟（仅2级及以上用户）

#### 极端情况

| 触发场景 | 最高频率 | 限制因素 |
|---------|---------|---------|
| 手动快速点击刷新 | 3次/分钟 | 第4层硬限制 |

**极端最高频率**：3次/分钟（被第4层硬限制约束）

---

### 5. `https://credit.linux.do/api/v1/*` (credit 分组)

#### 正常情况

| 触发场景 | 频率 | 说明 |
|---------|------|------|
| 页面初始化 | 2次/页面加载 | 同时请求 user-info 和 stats |
| 自动刷新 | 2次/30分钟 | Credit页刷新时并行调用 |

**正常频率**：约 2次/30分钟（user-info + stats 并行请求算2次）

#### 极端情况

| 触发场景 | 最高频率 | 限制因素 |
|---------|---------|---------|
| 手动快速点击刷新 | 3次/分钟 | 第4层硬限制 |

**极端最高频率**：3次/分钟（被第4层硬限制约束）

⚠️ **注意**：credit 分组的两个接口（user-info 和 stats）共享同一个分组限制，单次刷新会消耗2次配额。

---

### 6. `https://cdk.linux.do/api/v1/oauth/user-info` (cdk 分组)

#### 正常情况

| 触发场景 | 频率 | 说明 |
|---------|------|------|
| 页面初始化 | 1次/页面加载 | 通过iframe桥接页面调用 |
| 自动刷新 | 1次/30分钟 | CDK页刷新时调用 |

**正常频率**：约 1次/30分钟

#### 极端情况

| 触发场景 | 最高频率 | 限制因素 |
|---------|---------|---------|
| 手动快速点击刷新 | 3次/分钟 | 第4层硬限制 |

**极端最高频率**：3次/分钟（被第4层硬限制约束）

---

## 五、请求触发时机总结

### 自动触发

| 触发点 | 调用接口 | 频率 |
|-------|---------|------|
| `prewarmAll()` 页面初始化 | 所有接口（无缓存时） | 1次/页面加载 |
| `startAutoRefreshTimer()` 定时器 | 所有接口 | 默认30分钟/次 |
| `userWatchTimer` 用户监控 | session | 60秒/次 |
| `visibilitychange` 页面切回 | session（检测） | 按需 |
| `focus` 窗口获得焦点 | session（检测） | 按需 |
| `storage` 事件 | session（检测） | 按需 |

### 用户触发

| 触发点 | 调用接口 | 限制 |
|-------|---------|------|
| 点击刷新按钮 | 对应页面接口 | 第4层硬限制（3次/分钟） |
| 从其他页面返回 | 对应页面接口 | focusFlags 触发刷新 |
| 切换标签页 | 对应页面接口 | 仅首次切换 |

---

## 六、特殊机制说明

### 1. 分组预检查（Multi-Group Rate Limit Check）

在 `refreshTrust` 中，会预先检查多个分组的限制状态：
```javascript
const rateCheck = Utils.checkMultiGroupRateLimit(['session', 'user', 'connect']);
if (rateCheck.limited && this.trustData) {
    // 如果有缓存数据，直接显示缓存
    this.renderTrust(this.trustData);
    this.showToast(`请求频率过高（${rateCheck.waitTime}s）`, 'warning', 3000);
    return;
}
```

### 2. 指数退避重试

网络请求失败时采用指数退避策略：
```javascript
// 重试前等待，避免短时间内发送大量请求（指数退避：1s, 2s, 4s...）
await new Promise(r => setTimeout(r, 1000 * Math.pow(2, i)));
```

### 3. 缓存优先策略

当频率限制触发时，脚本会优先使用缓存数据：
- 有缓存：显示缓存数据 + Toast 提示
- 无缓存：显示友好错误界面

### 4. 跨标签页同步

以下状态通过 `GM_setValue/GM_getValue` 实现跨标签页同步：
- 请求时间戳（硬限制）
- 429 限流锁
- 排行榜冷却时间

---

## 七、最佳实践建议

1. **避免频繁手动刷新**：每个分组每分钟最多3次请求，超出会被限制
2. **关闭不需要的功能**：如不需要每日排名，可在设置中关闭以减少 leaderboard 请求
3. **调整自动刷新间隔**：默认30分钟，可根据需要调大或设为0关闭
4. **多标签页注意事项**：限制是跨标签页共享的，多标签页不会增加请求配额

---

*文档版本：v1.0*  
*对应脚本版本：v5.15.0*  
*更新日期：2026-01-02*

