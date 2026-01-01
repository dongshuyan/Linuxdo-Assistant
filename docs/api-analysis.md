# Linuxdo-Assistant API 调用与限流分析

本文档详细说明 `Linuxdo-Assistant.user.js` 脚本中调用的所有 LinuxDO 相关接口及其多层限流保护机制。

---

## 一、接口列表概览

| 接口 | URL | 限流分组 | 说明 |
|------|-----|---------|------|
| Session API | `/session/current.json` | `session` | 获取当前登录用户 |
| User Info API | `/u/${username}.json` | `user` | 获取用户详细信息 |
| User Summary API | `/u/${username}/summary.json` | `user` | 获取用户统计摘要 |
| Leaderboard API | `/leaderboard/1?period=daily` | `leaderboard` | 获取每日排行榜 |
| Connect API | `https://connect.linux.do` | `connect` | 获取信任等级详情 |
| Credit Info API | `https://credit.linux.do/api/v1/oauth/user-info` | `credit` | 获取积分账户信息 |
| Credit Stats API | `https://credit.linux.do/api/v1/dashboard/stats/daily?days=7` | `credit` | 获取积分统计 |
| CDK Info API | `https://cdk.linux.do/api/v1/oauth/user-info` | `cdk` | 获取CDK社区分数 |

### 请求频率汇总

> 用户可设置的最短刷新间隔为 **30 分钟**，以下频率基于此计算。

| 接口 | 正常使用频率 | 极端最高频率 | 关键限制机制 |
|------|-------------|-------------|-------------|
| `/session/current.json` | 1 次/30分钟 | **3 次/分钟** | 请求频率硬限制（跨标签页持久化）|
| `/u/*.json` | 0-2 次/30分钟 | **3 次/分钟** | 请求频率硬限制（跨标签页持久化）|
| `/u/*/summary.json` | 0-1 次/30分钟 | **3 次/分钟** | 请求频率硬限制（与上共享）|
| `/leaderboard/1` | 1 次/30分钟 | **3 次/分钟** | 请求频率硬限制 + 60秒硬冷却 |
| `connect.linux.do` | 1 次/30分钟 | **3 次/分钟** | 请求频率硬限制（跨标签页持久化）|
| `credit.linux.do/user-info` | 1 次/30分钟 | **3 次/分钟** | 请求频率硬限制（跨标签页持久化）|
| `credit.linux.do/stats` | 1 次/30分钟 | **3 次/分钟** | 与上述并行，共享限制 |
| `cdk.linux.do/user-info` | 1 次/30分钟 | **3 次/分钟** | 请求频率硬限制（跨标签页持久化）|

**所有接口统一硬限制**: 每分钟最多 3 次请求，不可绕过，跨标签页持久化存储。

**超过限制时**: 显示 Toast 提示"请求频率过高，请 Xs 后再试"。

---

## 二、全局限流机制

### 2.0 请求频率硬限制（最高优先级）

**代码位置**: Line 508-582

**这是最严格的限制，不可绕过**。

```javascript
// 请求频率限制配置（每分钟最多 3 次请求）
const REQUEST_LIMIT = {
    MAX_REQUESTS_PER_MINUTE: 3,
    WINDOW_MS: 60 * 1000  // 1 分钟窗口
};

// 检查指定分组是否超过请求频率限制
static isRequestLimitExceeded(group) {
    // 从持久化存储重新读取（确保跨标签页同步）
    // 清理过期时间戳
    // 返回是否超过限制
}

// 记录请求时间戳（在实际发送请求前调用）
static recordRequest(group) {
    // 清理过期时间戳并添加新的
    // 持久化存储
}
```

**关键特性**:
- **每分钟最多 3 次请求**：每个分组独立计数
- **跨标签页共享**：通过 `GM_setValue` 持久化存储到 `lda_v5_request_timestamps`
- **刷新/重启不解除**：时间戳持久化存储，页面刷新或浏览器重启后仍然有效
- **手动刷新也无法绕过**：这是最高优先级的检查，在所有其他检查之前执行
- **超过限制时提示**：显示 Toast "请求频率过高，请 Xs 后再试"

**存储结构**:
```javascript
// lda_v5_request_timestamps
{
    session: [timestamp1, timestamp2, ...],
    user: [timestamp1, timestamp2, ...],
    leaderboard: [timestamp1, timestamp2, ...],
    connect: [timestamp1, timestamp2, ...],
    credit: [timestamp1, timestamp2, ...],
    cdk: [timestamp1, timestamp2, ...]
}
```

### 2.1 分组限流锁 (Rate Limit Lock)

**代码位置**: Line 440-482

```javascript
// 分组限流锁：每组接口独立控制 429 冷却时间戳
static rateLimitUntil = {
    session: 0,      // /session/current.json
    user: 0,         // /u/*.json + /u/*/summary.json
    leaderboard: 0,  // /leaderboard/*.json
    connect: 0,      // connect.linux.do
    credit: 0,       // credit.linux.do
    cdk: 0           // cdk.linux.do
};
```

**关键特性**:
- **持久化存储**: 通过 `GM_setValue(CONFIG.KEYS.RATE_LIMIT, {...})` 保存到浏览器存储
- **跨标签页共享**: 所有打开的标签页读取同一份限流状态
- **刷新不解除**: 页面刷新后从存储恢复限流状态，直到冷却时间自然过期

### 2.2 限流检查函数

```javascript
// 检查是否在冷却期
static isRateLimited(group) {
    return Date.now() < (Utils.rateLimitUntil[group] || 0);
}

// 设置冷却时间（收到 429 后调用）
static setRateLimit(group, retryAfterSeconds) {
    const retryAfter = Math.max(10, retryAfterSeconds);
    Utils.rateLimitUntil[group] = Date.now() + (retryAfter * 1000);
    GM_setValue(CONFIG.KEYS.RATE_LIMIT, { ...Utils.rateLimitUntil });
}
```

---

## 三、各接口详细分析

---

### 3.1 Session API (`/session/current.json`)

#### 基本信息
- **URL**: `/session/current.json`
- **功能**: 获取当前登录用户的 username 和 trust_level
- **限流分组**: `session`
- **调用函数**: `Utils.fetchSessionUser()` (Line 601-616)

#### 限流层次（从宽松到严格）

| 层级 | 限制类型 | 作用域 | 持久化 |
|------|---------|--------|--------|
| 1 | 缓存有效期检查 | 跨标签页 | ✅ |
| 2 | 429 分组锁 | 跨标签页 | ✅ |

#### 代码实现

```javascript
static async fetchSessionUser() {
    // 🛡️ 第一道防线：分组限流检查
    if (Utils.isRateLimited('session')) return null;
    
    try {
        const r = await fetch('/session/current.json', { credentials: 'include' });
        
        // 🛡️ 429 处理：设置分组锁
        if (r.status === 429) {
            const retryAfter = parseInt(r.headers.get('Retry-After') || '60', 10);
            Utils.setRateLimit('session', retryAfter);
            return null;
        }
        // ...
    } catch (_) {
        return null;
    }
}
```

#### 调用场景分析

1. **面板初始化** (`refreshTrust`): 仅在信任标签页激活时调用一次
2. **手动刷新**: 用户点击刷新按钮时调用

#### 📊 请求频率分析

| 场景 | 频率 | 说明 |
|------|------|------|
| **正常使用** | 1 次/30分钟 | 定时刷新触发 `refreshTrust` 时调用 |
| **极端情况（手动刷新）** | **无硬限制** | 可连续请求，直到服务器返回 429 |

**极端情况定义**: 用户疯狂点击刷新按钮。

**频率限制机制**:
1. **定时刷新**: `isExpired('trust')` 缓存检查 + 5 秒全局冷却
2. **手动刷新**: 绕过上述限制，**仅受 429 分组锁约束**
3. 服务器返回 429 后设置分组锁（通常 60 秒冷却）

#### 🔒 不会反复请求的保证

1. **前置检查**: 每次调用前检查 `isRateLimited('session')`，冷却期内直接返回 null
2. **429 熔断**: 收到 429 后立即设置分组锁，后续所有调用被拦截
3. **无自动循环**: 此接口仅在用户操作或定时刷新时被调用，无自动重试循环
4. **失败静默**: 请求失败返回 null 而不是抛异常循环重试

---

### 3.2 User Info API (`/u/${username}.json`)

#### 基本信息
- **URL**: `/u/${username}.json`
- **功能**: 获取用户详细信息（trust_level、gamification_score、created_at）
- **限流分组**: `user`
- **调用函数**: `Utils.fetchUserInfo()` (Line 742-761)

#### 限流层次（从宽松到严格）

| 层级 | 限制类型 | 作用域 | 持久化 |
|------|---------|--------|--------|
| 1 | 缓存有效期检查 | 跨标签页 | ✅ |
| 2 | 前置空值检查 | 当前调用 | ❌ |
| 3 | 429 分组锁 | 跨标签页 | ✅ |

#### 代码实现

```javascript
static async fetchUserInfo(username) {
    // 🛡️ 空值检查
    if (!username) return null;
    
    // 🛡️ 分组限流检查
    if (Utils.isRateLimited('user')) return null;
    
    try {
        const r = await fetch(CONFIG.API.USER_INFO(username), { credentials: 'include' });
        
        // 🛡️ 429 处理
        if (r.status === 429) {
            const retryAfter = parseInt(r.headers.get('Retry-After') || '60', 10);
            Utils.setRateLimit('user', retryAfter);
            return null;
        }
        // ...
    } catch (_) {
        return null;
    }
}
```

#### 调用场景分析

1. **信任标签刷新**: 获取 trust_level 作为 session API 的备选
2. **Credit 标签刷新**: 获取 gamification_score 用于计算预估涨分

#### 📊 请求频率分析

| 场景 | 频率 | 说明 |
|------|------|------|
| **正常使用** | 0-2 次/30分钟 | Trust 刷新时 1 次（兜底），Credit 刷新时可能 1 次 |
| **极端情况（手动刷新）** | **无硬限制** | 可连续请求，直到服务器返回 429 |

**极端情况定义**: 用户疯狂点击刷新按钮。

**频率限制机制**:
1. **定时刷新**: 缓存检查 + 5 秒全局冷却
2. **手动刷新**: 绕过上述限制，**仅受 429 分组锁约束**
3. 与 `/u/*/summary.json` 共享 `user` 分组锁

#### 🔒 不会反复请求的保证

1. **前置检查**: `isRateLimited('user')` 拦截冷却期请求
2. **与 Summary 共享锁**: user 组一旦触发 429，两个接口同时被锁定
3. **调用时机受控**: 仅在标签页激活或定时刷新时调用
4. **gamification_score 获取失败不阻断**: Credit 标签中获取失败仅设为 null，不重试

---

### 3.3 User Summary API (`/u/${username}/summary.json`)

#### 基本信息
- **URL**: `/u/${username}/summary.json`
- **功能**: 获取用户统计摘要（posts_read_count、days_visited、likes_given 等）
- **限流分组**: `user` (与 User Info 共享)
- **调用函数**: `Utils.fetchUserSummary()` (Line 763-779)

#### 限流层次（从宽松到严格）

| 层级 | 限制类型 | 作用域 | 持久化 |
|------|---------|--------|--------|
| 1 | 缓存有效期检查 | 跨标签页 | ✅ |
| 2 | 前置空值检查 | 当前调用 | ❌ |
| 3 | 429 分组锁 (共享 `user`) | 跨标签页 | ✅ |

#### 代码实现

```javascript
static async fetchUserSummary(username) {
    if (!username) return null;
    
    // 🛡️ 与 fetchUserInfo 共享 user 分组
    if (Utils.isRateLimited('user')) return null;
    
    try {
        const r = await fetch(CONFIG.API.USER_SUMMARY(username), { credentials: 'include' });
        
        if (r.status === 429) {
            const retryAfter = parseInt(r.headers.get('Retry-After') || '60', 10);
            Utils.setRateLimit('user', retryAfter);
            return null;
        }
        // ...
    } catch (_) {
        return null;
    }
}
```

#### 调用场景分析

1. **0-1级用户**: 使用 summary 数据展示升级进度 (`fetchLowLevelTrustData`)
2. **2级+用户 fallback**: Connect API 失败时作为备选数据源 (`fetchSummaryTrustSnapshot`)

#### 📊 请求频率分析

| 场景 | 频率 | 说明 |
|------|------|------|
| **正常使用（0-1级用户）** | 1 次/30分钟 | 直接使用 summary 展示升级进度 |
| **正常使用（2级+用户）** | 0 次/30分钟 | 仅当 Connect API 失败时作为 fallback |
| **极端情况（手动刷新）** | **无硬限制** | 可连续请求，直到服务器返回 429 |

**极端情况定义**: 用户疯狂点击刷新按钮。

**频率限制机制**:
1. **定时刷新**: 缓存检查 + 5 秒全局冷却
2. **手动刷新**: 绕过上述限制，**仅受 429 分组锁约束**
3. 与 `/u/*.json` 共享 `user` 分组锁，任一触发 429 两者同时被锁

#### 🔒 不会反复请求的保证

1. **共享分组锁**: 与 `/u/*.json` 共用 `user` 分组，任一触发 429 则两者都被锁定
2. **fallback 机制非循环**: 作为 Connect 失败的一次性兜底，不会反复尝试
3. **错误静默处理**: 抛出 `Error('SummaryError')` 由上层捕获，不触发重试

---

### 3.4 Leaderboard API (`/leaderboard/1?period=daily`)

#### 基本信息
- **URL**: `/leaderboard/1?period=daily`
- **功能**: 获取每日排行榜（排名、积分）
- **限流分组**: `leaderboard`
- **调用函数**: `Utils.fetchForumStats()` (Line 795-865)

#### 限流层次（从宽松到严格）

| 层级 | 限制类型 | 作用域 | 持久化 |
|------|---------|--------|--------|
| 1 | **用户设置开关** (`showDailyRank`) | 跨标签页 | ✅ |
| 2 | **60秒独立冷却** | 跨标签页 | ✅ |
| 3 | 429 分组锁 | 跨标签页 | ✅ |
| 4 | 指数退避重试（最多2次） | 当前请求 | ❌ |

#### 代码实现

```javascript
static async fetchForumStats() {
    // 🛡️ 第一道：60秒独立冷却（跨标签页持久化）
    if (Date.now() - Utils.lastLeaderboardFetch < 60000) {
        return { dailyRank: null, score: null };
    }
    
    // 🛡️ 第二道：分组限流检查
    if (Utils.isRateLimited('leaderboard')) {
        return { dailyRank: null, score: null };
    }
    
    // 🛡️ 更新时间戳（持久化存储）
    Utils.lastLeaderboardFetch = Date.now();
    GM_setValue(CONFIG.KEYS.LEADERBOARD_LAST_FETCH, Utils.lastLeaderboardFetch);
    
    // 实际请求（最多重试2次）
    const fetchLeaderboard = async (url) => {
        if (Utils.isRateLimited('leaderboard')) return null;  // 再次检查
        
        for (let i = 0; i < 2; i++) {
            try {
                const r = await fetch(url, { /* headers */ });
                
                if (r.status === 429) {
                    Utils.setRateLimit('leaderboard', retryAfter);
                    return null;  // 429 不重试
                }
                // ...
            } catch (e) {
                if (i === 1 || Utils.isRateLimited('leaderboard')) return null;
                await new Promise(r => setTimeout(r, 1000 * Math.pow(2, i)));
            }
        }
    };
    // ...
}
```

#### 调用场景分析

1. **信任标签刷新**: 在 `refreshTrust` 内部调用（Line 4733），用于显示每日排名和积分
2. **定时自动刷新**: 跟随 `refreshTrust` 的定时器，根据用户设置的刷新间隔（30/60/120分钟）

#### 📊 请求频率分析

| 场景 | 频率 | 说明 |
|------|------|------|
| **正常使用（开关关闭）** | 0 次/30分钟 | `showDailyRank=false` 时完全不发请求 |
| **正常使用（开关开启）** | 1 次/30分钟 | 跟随 `refreshTrust` 定时刷新，最短间隔 30 分钟 |
| **极端情况** | 最高 1 次/60秒 | 被 60秒硬冷却限制，无论多少标签页 |

**极端情况如何触发**:
用户手动点击刷新按钮时，调用 `refreshTrust({ manual: true, force: true })`：
1. `force: true` 会**绕过**缓存检查 `isExpired('trust')`
2. 直接执行到 `fetchForumStats()`
3. 但 `fetchForumStats` 内部的 **60 秒独立冷却**会拦截频繁请求

**频率限制机制**（四层递进）:
1. **第一层 - 用户设置**: `showDailyRank=false` 时，`fetchForumStats` 不被调用
2. **第二层 - 缓存有效期**: 定时刷新时受 `isExpired('trust')` 控制（30/60/120分钟）
3. **第三层 - 60秒硬冷却**: `Date.now() - lastLeaderboardFetch < 60000` 检查，**跨标签页持久化**
   - 这是**手动刷新时的核心限制**，即使绕过缓存检查也无法绕过
4. **第四层 - 429 分组锁**: 服务器返回 429 时设置分组锁，由 `Retry-After` 决定冷却时间

**正常使用为什么是 1次/30分钟**:
定时刷新触发 `refreshTrust({ background: true, force: false })`，会被 `isExpired('trust')` 缓存检查拦截。

**极端情况为什么最高是 1次/60秒**:
```javascript
// Line 797-798: 60秒硬冷却检查
if (Date.now() - Utils.lastLeaderboardFetch < 60000) {
    return { dailyRank: null, score: null };  // 冷却期内直接返回空值
}
// Line 805-808: 更新时间戳并持久化
Utils.lastLeaderboardFetch = Date.now();
GM_setValue(CONFIG.KEYS.LEADERBOARD_LAST_FETCH, Utils.lastLeaderboardFetch);
```
- 时间戳通过 `GM_setValue` 持久化，所有标签页读取同一份数据
- 即使用户疯狂点击刷新按钮（绕过缓存检查），60秒内任何调用都被拦截
- 这是**专门为手动刷新设计的保护机制**

#### 🔒 不会反复请求的保证

1. **用户可关闭**: `showDailyRank` 设置为 false 时完全跳过请求
2. **60秒硬冷却**: 无论成功失败，60秒内绝不发起新请求
3. **跨标签页共享**: 多标签页打开时共享冷却时间戳
4. **重试次数上限**: 最多重试2次，429 时立即停止
5. **失败返回空值**: 不抛异常，不触发上层重试逻辑

---

### 3.5 Connect API (`https://connect.linux.do`)

#### 基本信息
- **URL**: `https://connect.linux.do`
- **功能**: 获取2级及以上用户的信任等级详细进度
- **限流分组**: `connect`
- **调用函数**: `fetchConnectWelcome()` (Line 702-740), `fetchHighLevelTrustData()` (Line 4501-4509)

#### 限流层次（从宽松到严格）

| 层级 | 限制类型 | 作用域 | 持久化 |
|------|---------|--------|--------|
| 1 | **缓存有效期检查** (`CACHE_TRUST_DATA`) | 跨标签页 | ✅ |
| 2 | 429 分组锁 | 跨标签页 | ✅ |
| 3 | 指数退避重试（最多3次） | 当前请求 | ❌ |

#### 代码实现

```javascript
// Utils.request 通用请求函数
static async request(url, options = {}) {
    const { retries = 3, timeout = 8000, ... } = options;
    
    for (let i = 0; i < retries; i++) {
        try {
            // GM_xmlhttpRequest 发起跨域请求
        } catch (e) {
            // 🛡️ 429 熔断
            if (e?.status === 429) {
                const group = Utils.getRateLimitGroup(url);  // 'connect'
                if (group) Utils.setRateLimit(group, retryAfter);
                throw e;  // 不重试
            }
            
            if (i === retries - 1) throw lastErr;
            await new Promise(r => setTimeout(r, 1000 * Math.pow(2, i)));
        }
    }
}
```

#### 调用场景分析

1. **2级+用户信任标签**: 主要数据源
2. **用户名获取兜底**: session 失败时尝试从 Connect 页面解析

#### 📊 请求频率分析

| 场景 | 频率 | 说明 |
|------|------|------|
| **正常使用（0-1级用户）** | 0 次/30分钟 | 低等级用户直接使用 summary API |
| **正常使用（2级+用户）** | 1 次/30分钟 | 由用户设置的刷新间隔控制 |
| **极端情况（手动刷新）** | **无硬限制** | 可连续请求，直到服务器返回 429 |

**极端情况定义**: 2级+用户疯狂点击刷新按钮。

**频率限制机制**:
1. **定时刷新**: `isExpired('trust')` 缓存检查 + 5 秒全局冷却
2. **手动刷新**: 绕过上述限制，**仅受 429 分组锁约束**
3. 0-1级用户不调用此接口（代码分支判断 `userTrustLevel <= 1`）

**为什么正常使用是 1次/30分钟**:
```javascript
// Line 4616-4620
if (this.trustData && !forceFetch && !this.isExpired('trust')) {
    this.renderTrust(this.trustData);
    this.stopRefreshWithMinDuration('trust');
    endWait();
    return;  // 缓存有效，直接返回
}
```
`isExpired('trust')` 检查 `lastFetch['trust']` 是否超过用户设置的刷新间隔。

#### 🔒 不会反复请求的保证

1. **缓存优先**: 缓存未过期时直接使用缓存数据
2. **仅限2级+用户**: 0-1级用户使用 summary API，不调用 Connect
3. **429 立即停止**: 收到 429 后设置分组锁并抛出异常，不继续重试
4. **fallback 单向**: Connect 失败后降级到 summary，不会反向重试

---

### 3.6 Credit Info API (`https://credit.linux.do/api/v1/oauth/user-info`)

#### 基本信息
- **URL**: `https://credit.linux.do/api/v1/oauth/user-info`
- **功能**: 获取积分账户余额、每日额度
- **限流分组**: `credit`
- **调用函数**: `refreshCredit()` (Line 5068)

#### 限流层次（从宽松到严格）

| 层级 | 限制类型 | 作用域 | 持久化 |
|------|---------|--------|--------|
| 1 | **缓存有效期检查** (`CACHE_CREDIT_DATA`) | 跨标签页 | ✅ |
| 2 | 429 分组锁 | 跨标签页 | ✅ |
| 3 | 指数退避重试（最多3次） | 当前请求 | ❌ |

#### 代码实现

```javascript
async refreshCredit(opts = {}) {
    // 🛡️ 缓存检查
    if (this.creditData && !forceFetch && !this.isExpired('credit')) {
        this.renderCredit(this.creditData);
        return;
    }
    
    // 并行请求 info 和 stats（共享 credit 分组锁）
    const infoPromise = Utils.request(CONFIG.API.CREDIT_INFO, { withCredentials: true });
    const statPromise = Utils.request(CONFIG.API.CREDIT_STATS, { withCredentials: true });
    
    // Utils.request 内部处理 429
}
```

#### 调用场景分析

1. **Credit 标签激活**: 显示积分信息
2. **定时自动刷新**: 根据用户设置的刷新间隔

#### 📊 请求频率分析

| 场景 | 频率 | 说明 |
|------|------|------|
| **正常使用** | 1 次/30分钟 | 与 Credit Stats 并行，由用户设置的刷新间隔控制 |
| **极端情况（手动刷新）** | **无硬限制** | 可连续请求，直到服务器返回 429 |

**极端情况定义**: 用户疯狂点击 Credit 标签的刷新按钮。

**频率限制机制**:
1. **定时刷新**: `isExpired('credit')` 缓存检查 + 5 秒全局冷却
2. **手动刷新**: 绕过上述限制，**仅受 429 分组锁约束**
3. 认证错误（401/403）不触发重试，显示授权界面或缓存数据

**为什么正常使用是 1次/30分钟**:
```javascript
// Line 5058-5062
if (this.creditData && !forceFetch && !this.isExpired('credit')) {
    this.renderCredit(this.creditData);
    this.stopRefreshWithMinDuration('credit');
    endWait();
    return;  // 缓存有效，直接返回
}
```

#### 🔒 不会反复请求的保证

1. **缓存优先**: 未过期缓存直接渲染，不发请求
2. **认证错误不循环**: 401/403 时显示授权界面，不重试
3. **有缓存时降级**: 认证失败但有缓存时显示缓存 + 提示，不刷新
4. **并行请求共享锁**: info 和 stats 同属 credit 分组，一个触发 429 则两个都被锁

---

### 3.7 Credit Stats API (`https://credit.linux.do/api/v1/dashboard/stats/daily?days=7`)

#### 基本信息
- **URL**: `https://credit.linux.do/api/v1/dashboard/stats/daily?days=7`
- **功能**: 获取最近7天积分变化统计
- **限流分组**: `credit` (与 Credit Info 共享)
- **调用函数**: `refreshCredit()` (Line 5069)

#### 限流层次

与 Credit Info API 完全相同，同一次 `refreshCredit()` 调用中并行发起，共享所有限流机制。

#### 📊 请求频率分析

与 Credit Info API 完全相同：

| 场景 | 频率 | 说明 |
|------|------|------|
| **正常使用** | 1 次/30分钟 | 与 Credit Info 并行发起 |
| **极端情况（手动刷新）** | **无硬限制** | 两者共享 429 分组锁 |

**频率限制机制**:
- 与 Credit Info 在同一次 `refreshCredit()` 调用中通过 `Promise.all` 并行发起
- **手动刷新**时绕过缓存检查，仅受 429 分组锁约束
- 不会单独重试

#### 🔒 不会反复请求的保证

与 Credit Info API 相同，且：
- **并行发起**: 与 info 同时请求，不会因为一个成功一个失败而单独重试

---

### 3.8 CDK Info API (`https://cdk.linux.do/api/v1/oauth/user-info`)

#### 基本信息
- **URL**: `https://cdk.linux.do/api/v1/oauth/user-info`
- **功能**: 获取 CDK 社区分数
- **限流分组**: `cdk`
- **调用函数**: `initCDKBridgePage()` (Line 879), `fetchCDKDirect()` (Line 5406)

#### 限流层次（从宽松到严格）

| 层级 | 限制类型 | 作用域 | 持久化 |
|------|---------|--------|--------|
| 1 | **缓存有效期检查** (`CACHE_CDK`, TTL 5分钟) | 跨标签页 | ✅ |
| 2 | iframe Bridge 超时 (5秒) | 当前请求 | ❌ |
| 3 | 429 分组锁 | 跨标签页 | ✅ |
| 4 | 指数退避重试 | 当前请求 | ❌ |

#### 代码实现

```javascript
// 直接请求方式
async fetchCDKDirect() {
    // Utils.request 内部有 429 处理
    const infoRes = await Utils.request(CONFIG.API.CDK_INFO, { withCredentials: true });
    // ...
}

// iframe Bridge 方式（兜底）
fetchCDKViaBridge() {
    return new Promise((resolve, reject) => {
        this.ensureCDKBridge();
        
        const timer = setTimeout(() => {
            reject(new Error('cdk bridge timeout'));
        }, 5000);  // 5秒超时
        
        // ...
    });
}

// CDK 页面内的桥接逻辑
const initCDKBridgePage = () => {
    const cacheAndNotify = async () => {
        // 🛡️ 分组限流检查
        if (Utils.isRateLimited('cdk')) return;
        
        const res = await fetch(CONFIG.API.CDK_INFO, { credentials: 'include' });
        
        if (res.status === 429) {
            Utils.setRateLimit('cdk', retryAfter);
            return;
        }
        // ...
    };
};
```

#### 调用场景分析

1. **CDK 标签激活**: 尝试直接请求，失败后使用 iframe 桥接
2. **CDK 页面被 iframe 嵌入**: 作为桥接数据源

#### 📊 请求频率分析

| 场景 | 频率 | 说明 |
|------|------|------|
| **正常使用** | 1 次/30分钟 | 由用户设置的刷新间隔控制 |
| **极端情况（手动刷新）** | **无硬限制** | 可连续请求，直到服务器返回 429 |

**极端情况定义**: 用户疯狂点击 CDK 标签的刷新按钮。

**频率限制机制**:
1. **定时刷新**: `isCDKCacheFresh()` + `isExpired('cdk')` 缓存检查 + 5 秒全局冷却
2. **手动刷新**: 绕过上述限制，**仅受 429 分组锁约束**
3. Direct 和 Bridge **串行执行**，Direct 失败后尝试 Bridge
4. Bridge 方式有 5 秒超时
5. iframe 内的 CDK 页面同样检查 `isRateLimited('cdk')`

**为什么正常使用是 1次/30分钟**:
```javascript
// Line 5291-5296
if (this.isCDKCacheFresh()) {
    this.renderCDKContent(this.cdkCache.data);
    if (!opts.force && !this.isExpired('cdk')) {
        this.stopRefreshWithMinDuration('cdk');
        endWait();
        return;  // 缓存有效，直接返回
    }
}
```
即使点击刷新，`isExpired('cdk')` 检查会拦截缓存有效期内的请求。

#### 🔒 不会反复请求的保证

1. **缓存优先**: 5分钟内缓存有效直接使用
2. **两种方式串行**: 先尝试 direct，失败后尝试 bridge，不同时进行
3. **Bridge 超时控制**: 5秒超时避免无限等待
4. **iframe 页面也有限流**: CDK 域内的桥接页面同样检查分组锁
5. **防多实例**: `if (window.self !== window.top) return;` 防止 iframe 中运行主逻辑

---

## 四、自动刷新机制

### 4.1 定时刷新

**代码位置**: `startAutoRefreshTimer()` (Line 5388-5403)

```javascript
startAutoRefreshTimer() {
    if (this.autoRefreshTimer) {
        clearInterval(this.autoRefreshTimer);
    }
    
    const minutes = this.state.refreshInterval;  // 用户设置：30/60/120/0(关闭)
    if (minutes <= 0) return;  // 关闭时不启动
    
    const interval = minutes * 60 * 1000;
    this.autoRefreshTimer = setInterval(() => {
        this.refreshTrust({ background: true, force: false });
        this.refreshCredit({ background: true, force: false });
        this.refreshCDK({ background: true, force: false });
    }, interval);
}
```

**保护措施**:
1. 用户可设置 30/60/120 分钟或完全关闭
2. `background: true` 静默刷新，不强制覆盖缓存
3. `force: false` 尊重缓存有效期检查

### 4.2 iframe 防重复

**代码位置**: Line 910-913

```javascript
// 防止在 iframe 中运行主逻辑，避免多实例化导致并发请求
if (window.self !== window.top) {
    return;
}
```

---

## 五、请求频率汇总表

### 5.1 正常使用频率

假设用户设置刷新间隔为 30 分钟（默认值）：

| 接口 | 正常频率 | 触发条件 |
|------|---------|---------|
| `/session/current.json` | 每 30 分钟 1 次 | Trust 标签定时刷新 |
| `/u/*.json` | 每 30 分钟 0-2 次 | Trust 兜底 + Credit 获取分数 |
| `/u/*/summary.json` | 每 30 分钟 0-1 次 | 0-1级用户或 Connect 失败 |
| `/leaderboard/1` | 1 次/30分钟 | 开启排名显示时，跟随 Trust 刷新 |
| `connect.linux.do` | 每 30 分钟 1 次 | 2级+用户 Trust 刷新 |
| `credit.linux.do/user-info` | 每 30 分钟 1 次 | Credit 标签刷新 |
| `credit.linux.do/stats` | 每 30 分钟 1 次 | 与上述并行 |
| `cdk.linux.do/user-info` | 每 30 分钟 1 次 | CDK 标签刷新 |

### 5.2 极端情况频率

> **重要**：所有接口都有请求频率硬限制，每分钟最多 3 次，不可绕过。

| 接口 | 极端情况 | 最高频率 | 限制机制 |
|------|---------|---------|---------|
| `/session/current.json` | 疯狂点击刷新 | **3 次/分钟** | 请求频率硬限制（跨标签页持久化）|
| `/u/*.json` | 疯狂点击刷新 | **3 次/分钟** | 请求频率硬限制（跨标签页持久化）|
| `/u/*/summary.json` | 疯狂点击刷新 | **3 次/分钟** | 请求频率硬限制（与上共享）|
| `/leaderboard/1` | 疯狂点击刷新 | **3 次/分钟** | 请求频率硬限制 + 60秒硬冷却 |
| `connect.linux.do` | 疯狂点击刷新 | **3 次/分钟** | 请求频率硬限制（跨标签页持久化）|
| `credit.linux.do/*` | 疯狂点击刷新 | **3 次/分钟** | 请求频率硬限制（跨标签页持久化）|
| `cdk.linux.do/*` | 疯狂点击刷新 | **3 次/分钟** | 请求频率硬限制（跨标签页持久化）|

**所有接口统一硬限制**：每分钟最多 3 次请求，超过限制时显示 Toast 提示。

### 5.3 关键限制机制图示

```
┌─────────────────────────────────────────────────────────────────┐
│                        用户发起请求                               │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  第1层：用户设置检查                                              │
│  - showDailyRank=false → Leaderboard 不请求                      │
│  - refreshInterval=0 → 定时刷新关闭                               │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  第2层：缓存有效期检查 isExpired(type)                            │
│  - lastFetch[type] + refreshInterval > now → 使用缓存            │
│  - 持久化存储，跨标签页共享                                        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  第3层：独立冷却检查（仅 Leaderboard）                            │
│  - lastLeaderboardFetch + 60s > now → 跳过请求                   │
│  - 持久化存储，跨标签页共享                                        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│  第4层：429 分组锁检查 isRateLimited(group)                       │
│  - rateLimitUntil[group] > now → 跳过请求                        │
│  - 持久化存储，跨标签页共享，刷新不解除                              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      实际发送 HTTP 请求                           │
└─────────────────────────────────────────────────────────────────┘
                              │
                    ┌─────────┴─────────┐
                    ▼                   ▼
              收到 2xx             收到 429
                    │                   │
                    ▼                   ▼
            更新缓存数据         设置分组锁 + 持久化
            markFetch(type)     setRateLimit(group, retryAfter)
```

---

## 六、为什么不会对服务器造成压力

### 6.1 多层防护体系

```
用户请求
    │
    ▼
┌─────────────────────────────────────┐
│ 第1层：用户设置开关                    │ ← 可完全禁用某些请求
└─────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────┐
│ 第2层：缓存有效期检查                  │ ← 未过期直接使用缓存
└─────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────┐
│ 第3层：独立冷却时间（Leaderboard 60s） │ ← 硬性间隔限制
└─────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────┐
│ 第4层：429 分组锁检查                  │ ← 跨标签页持久化
└─────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────┐
│ 实际发起 HTTP 请求                     │
└─────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────┐
│ 收到 429 → 设置分组锁 → 持久化存储      │
└─────────────────────────────────────┘
```

### 6.2 关键保证

| 保证项 | 实现方式 |
|--------|---------|
| 不会循环重试 | 429 时立即停止，错误返回 null 而非抛异常 |
| 不会并发冲突 | 分组锁跨标签页共享，防止多标签页同时请求 |
| 刷新不解除限流 | GM_setValue 持久化存储，页面刷新后恢复 |
| 不会无限等待 | 所有请求有超时控制（8-15秒） |
| 用户可控 | 排行榜可关闭、刷新间隔可调整或关闭 |
| 失败降级 | 多数据源策略，一个失败尝试另一个，不循环 |

### 6.3 极端情况测试

| 场景 | 脚本行为 |
|------|---------|
| 快速多次点击刷新 | 缓存检查 + 分组锁拦截，实际只发一次请求 |
| 打开10个标签页 | 共享分组锁，10个页面总共只发必要请求 |
| 服务器返回 429 | 设置冷却锁，所有后续调用直接返回 null |
| 网络持续失败 | 指数退避重试最多3次后停止，返回缓存/空值 |
| 页面疯狂刷新 | GM_setValue 持久化限流状态，刷新不重置 |

---

## 七、存储键说明

| 键名 | 用途 | 跨标签页 |
|------|------|---------|
| `lda_v5_request_timestamps` | **请求频率硬限制时间戳（最高优先级）** | ✅ |
| `lda_v5_rate_limit` | 分组限流锁状态（429 响应后设置）| ✅ |
| `lda_v5_leaderboard_last_fetch` | 排行榜上次请求时间戳（60秒冷却）| ✅ |
| `lda_v5_cache_trust_data` | 信任等级数据缓存 | ✅ |
| `lda_v5_cache_credit_data` | 积分数据缓存 | ✅ |
| `lda_v5_cache_cdk` | CDK 数据缓存 | ✅ |
| `lda_v5_cache_meta` | 各标签页上次获取时间 | ✅ |
| `lda_v5_refresh_interval` | 自动刷新间隔设置 | ✅ |
| `lda_v5_show_daily_rank` | 是否显示排名开关 | ✅ |

