// ==UserScript==
// @name         Linux.do Assistant
// @namespace    https://linux.do/
// @version      5.3.0
// @description  Linux.do 仪表盘 - 信任级别进度 & 积分查看 & CDK社区分数 (支持全等级)
// @author       Sauterne@Linux.do
// @match        https://linux.do/*
// @match        https://cdk.linux.do/*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// @grant        GM_info
// @connect      connect.linux.do
// @connect      credit.linux.do
// @connect      cdk.linux.do
// @connect      linux.do
// @connect      raw.githubusercontent.com
// @run-at       document-idle
// @license      MIT
// @updateURL    https://raw.githubusercontent.com/dongshuyan/Linuxdo-Assistant/main/Linuxdo-Assistant.user.js
// @downloadURL  https://raw.githubusercontent.com/dongshuyan/Linuxdo-Assistant/main/Linuxdo-Assistant.user.js
// ==/UserScript==

(function () {
    'use strict';

    // 配置
    const CONFIG = {
        API: {
            TRUST: 'https://connect.linux.do',
            CREDIT_INFO: 'https://credit.linux.do/api/v1/oauth/user-info',
            CREDIT_STATS: 'https://credit.linux.do/api/v1/dashboard/stats/daily?days=7',
            LINK_TRUST: 'https://connect.linux.do/',
            LINK_CREDIT: 'https://credit.linux.do/home',
            LEADERBOARD: 'https://linux.do/leaderboard/1.json',
            LEADERBOARD_DAILY: 'https://linux.do/leaderboard/1.json?period=daily',
            LINK_LEADERBOARD: 'https://linux.do/leaderboard/1',
            CDK_INFO: 'https://cdk.linux.do/api/v1/oauth/user-info',
            LINK_CDK: 'https://cdk.linux.do/dashboard',
            LINK_LOGIN: 'https://linux.do/login',
            // 新增：用于获取用户信息和summary的API
            USER_INFO: (username) => `https://linux.do/u/${username}.json`,
            USER_SUMMARY: (username) => `https://linux.do/u/${username}/summary.json`
        },
        // 0-1级用户升级要求（硬编码）
        LEVEL_REQUIREMENTS: {
            0: { // 0级升1级
                topics_entered: { name: '浏览的话题', target: 5 },
                posts_read_count: { name: '已读帖子', target: 30 },
                time_read: { name: '阅读时间', target: 600, unit: 'seconds' } // 10分钟
            },
            1: { // 1级升2级
                days_visited: { name: '访问天数', target: 15 },
                likes_given: { name: '送出赞', target: 1 },
                likes_received: { name: '获赞', target: 1 },
                post_count: { name: '帖子数量', target: 3 },
                topics_entered: { name: '浏览的话题', target: 20 },
                posts_read_count: { name: '已读帖子', target: 100 },
                time_read: { name: '阅读时间', target: 3600, unit: 'seconds' } // 60分钟
            }
        },
        CACHE_SCHEMA_VERSION: 2,
        // 保持 v4 键名以维持配置
        KEYS: {
            POS: 'lda_v4_pos',
            THEME: 'lda_v4_theme',
            EXPAND: 'lda_v4_expand',
            HEIGHT: 'lda_v4_height',
            LANG: 'lda_v4_lang',
            CACHE_TRUST: 'lda_v4_cache_trust',
            CACHE_TRUST_DATA: 'lda_v5_cache_trust_data',
            CACHE_CREDIT_DATA: 'lda_v5_cache_credit_data',
            TAB_ORDER: 'lda_v5_tab_order',
            CACHE_CDK: 'lda_v5_cache_cdk',
            REFRESH_INTERVAL: 'lda_v5_refresh_interval',
            OPACITY: 'lda_v5_opacity',
            CACHE_META: 'lda_v5_cache_meta',
            CACHE_SCHEMA: 'lda_v5_cache_schema',
            USER_SIG: 'lda_v5_user_sig',
            LAST_SKIP_UPDATE: 'lda_v5_last_skip_update',
            LAST_AUTO_CHECK: 'lda_v5_last_auto_check',
            GAIN_ANIM: 'lda_v5_gain_anim',
            LAST_GAIN: 'lda_v5_last_gain',
            USE_CLASSIC_ICON: 'lda_v5_use_classic_icon',
            ICON_CACHE: 'lda_v5_icon_cache',
            ICON_SIZE: 'lda_v5_icon_size'
        }
    };

    // 小秘书图标尺寸配置
    const SECRETARY_ICON_SIZES = {
        sm: 58,   // 小
        md: 88,   // 中
        lg: 128   // 大
    };

    // 小秘书图片配置 (512x512 高清版)
    const SECRETARY_ICONS = {
        normal: 'https://raw.githubusercontent.com/dongshuyan/Linuxdo-Assistant/main/pics/l1-m.png',
        hover: 'https://raw.githubusercontent.com/dongshuyan/Linuxdo-Assistant/main/pics/l2-m.png',
        version: '2' // 用于缓存版本控制，更新图片时递增此值
    };
    const AUTO_REFRESH_MS = 30 * 60 * 1000; // 半小时定时刷新

    // 多语言
    const I18N = {
        zh: {
            title: "Linux.do 仪表盘",
            tab_trust: "信任级别",
            tab_credit: "积分详情",
            tab_cdk: "CDK分数",
            tab_setting: "偏好设置",
            loading: "数据加载中...",
            connect_err: "连接失败或未登录",
            trust_not_login: "尚未登录社区",
            trust_login_tip: "登录后可查看信任级别与进度",
            trust_go_login: "前往登录",
            level: "当前级别",
            status_ok: "已达标",
            status_fail: "未达标",
            status_fallback: "降级显示",
            celebrate_title: "🎊 全部达标！",
            celebrate_subtitle: "所有要求均已满足",
            celebrate_msg_upgrade: "享受信任级别 {level} 的所有权限吧！",
            celebrate_msg_lv3: "享受信任级别 3 的所有权限吧！",
            btn_details: "详情",
            btn_collapse: "收起",
            credit_keep_cache_tip: "授权校验异常，已继续显示缓存数据",
            balance: "当前余额",
            daily_limit: "今日剩余额度",
            estimated_gain: "预估明日涨分",
            gain_tip: "仅供参考",
            current_score: "当前分",
            base_value: "基准值",
            set_gain_anim: "涨分动画提示",
            set_classic_icon: "经典图标",
            set_icon_size: "图标大小",
            icon_size_sm: "小",
            icon_size_md: "中",
            icon_size_lg: "大",
            recent: "近7日收支",
            no_rec: "暂无记录",
            income: "收入",
            expense: "支出",
            set_auto: "自动展开面板",
            set_lang: "界面语言",
            set_size: "面板高度",
            set_opacity: "透明度",
            set_refresh: "自动刷新频率",
            size_sm: "标准",
            size_lg: "加高",
            size_auto: "自适应",
            refresh_30: "30 分钟",
            refresh_60: "1 小时",
            refresh_120: "2 小时",
            refresh_off: "关闭",
            refresh_tip: "仅在面板展开时定时刷新",
            theme_tip: "点击切换：亮色 / 深色 / 跟随系统",
            link_tip: "前往网页版",
            refresh_tip_btn: "刷新数据",
            refresh_done: "刷新完毕",
            check_update: "检查更新",
            checking: "检查中...",
            new_version: "发现新版本",
            latest: "已是最新",
            update_err: "检查失败",
            rank: "总排名",
            rank_today: "今日",
            score: "积分",
            credit_not_auth: "尚未登录 Credit",
            credit_auth_tip: "需先完成授权才能查看积分数据",
            credit_go_auth: "前往登录",
            credit_refresh: "刷新",
            set_tab_order: "标签顺序",
            tab_order_tip: "拖拽调整顺序",
            tab_order_save: "保存顺序",
            tab_order_saved: "已保存",
            cdk_score: "CDK分数",
            cdk_trust_level: "信任等级",
            cdk_username: "用户名",
            cdk_nickname: "昵称",
            cdk_not_auth: "尚未登录 CDK",
            cdk_auth_tip: "需先完成授权才能查看社区分数",
            cdk_go_auth: "前往登录",
            cdk_refresh: "刷新",
            cdk_score_desc: "基于徽章计算的社区信誉分",
            support_title: "支持作者",
            support_desc: "您的支持是持续开发的动力",
            support_thanks: "感谢您的支持 ❤️",
            slow_tip: "请求有点慢，稍等我处理一下…",
            clear_cache: "清除缓存",
            clear_cache_tip: "清除跨标签页缓存与账号关联数据",
            clear_cache_done: "缓存已清空",
            // V3新增：友好错误提示
            network_error_title: "暂时无法获取数据",
            network_error_tip: "可能是网络波动或运行环境问题，请稍后重试",
            network_error_retry: "点击刷新",
            trust_fallback_title: "Connect 数据暂不可用",
            trust_fallback_tip: "未获取到 Connect 完整数据，请稍后刷新再试（当前暂用 Summary 数据展示）",
            trust_data_source: "数据来源",
            // extra hints
            connect_open: "打开 Connect",
            credit_open: "打开 Credit",
            cdk_open: "打开 CDK"
        },
        en: {
            title: "Linux.do HUD",
            tab_trust: "Trust Level",
            tab_credit: "Credits",
            tab_cdk: "CDK Score",
            tab_setting: "Settings",
            loading: "Loading...",
            connect_err: "Connection Error / Not Logged In",
            trust_not_login: "Not logged in",
            trust_login_tip: "Login to view trust level and progress",
            trust_go_login: "Go to Login",
            level: "Level",
            status_ok: "Qualified",
            status_fail: "Unqualified",
            status_fallback: "Fallback",
            celebrate_title: "🎊 All requirements met!",
            celebrate_subtitle: "You have met every requirement",
            celebrate_msg_upgrade: "Enjoy all the privileges of Trust Level {level}!",
            celebrate_msg_lv3: "Enjoy all the privileges of Trust Level 3!",
            btn_details: "Details",
            btn_collapse: "Collapse",
            credit_keep_cache_tip: "Authorization check failed; showing cached data.",
            balance: "Balance",
            daily_limit: "Daily Limit",
            estimated_gain: "Est. Tomorrow",
            gain_tip: "For reference",
            current_score: "Current",
            base_value: "Base",
            set_gain_anim: "Gain Animation",
            set_classic_icon: "Classic Icon",
            set_icon_size: "Icon Size",
            icon_size_sm: "S",
            icon_size_md: "M",
            icon_size_lg: "L",
            recent: "Recent Activity",
            no_rec: "No activity",
            income: "Income",
            expense: "Expense",
            set_auto: "Auto Expand",
            set_lang: "Language",
            set_size: "Panel Height",
            set_opacity: "Opacity",
            set_refresh: "Auto Refresh",
            size_sm: "Small",
            size_lg: "Tall",
            size_auto: "Auto",
            refresh_30: "30 min",
            refresh_60: "1 hour",
            refresh_120: "2 hours",
            refresh_off: "Off",
            refresh_tip: "Refresh periodically only when panel is open",
            theme_tip: "Toggle: Light / Dark / Auto",
            link_tip: "Open Website",
            refresh_tip_btn: "Refresh",
            refresh_done: "Refreshed",
            check_update: "Check Update",
            checking: "Checking...",
            new_version: "New Version",
            latest: "Up to date",
            update_err: "Check failed",
            rank: "Rank",
            rank_today: "Today",
            score: "Score",
            credit_not_auth: "Credit Not Logged In",
            credit_auth_tip: "Please authorize to view credit data",
            credit_go_auth: "Go to Login",
            credit_refresh: "Refresh",
            set_tab_order: "Tab Order",
            tab_order_tip: "Drag to reorder",
            tab_order_save: "Save Order",
            tab_order_saved: "Saved",
            cdk_score: "CDK Score",
            cdk_trust_level: "Trust Level",
            cdk_username: "Username",
            cdk_nickname: "Nickname",
            cdk_not_auth: "CDK Not Logged In",
            cdk_auth_tip: "Please authorize to view CDK score",
            cdk_go_auth: "Go to Login",
            cdk_refresh: "Refresh",
            cdk_score_desc: "Community reputation based on badges",
            support_title: "Support",
            support_desc: "Your support keeps development going",
            support_thanks: "Thank you for your support ❤️",
            slow_tip: "It's a bit slow, please hold on…",
            clear_cache: "Clear cache",
            clear_cache_tip: "Remove cross-tab cache and user binding",
            clear_cache_done: "Cache cleared",
            // V3 new: friendly error messages
            network_error_title: "Unable to load data",
            network_error_tip: "Network or environment issue, please try again later",
            network_error_retry: "Refresh",
            trust_fallback_title: "Connect unavailable",
            trust_fallback_tip: "Unable to fetch full Connect data. Please refresh later (showing Summary for now).",
            trust_data_source: "Data source",
            connect_open: "Open Connect",
            credit_open: "Open Credit",
            cdk_open: "Open CDK"
        }
    };

    // 工具函数
    class Utils {
        static async request(url, options = {}) {
            const { retries = 3, timeout = 8000, withCredentials = false, ...validOptions } = options;
            const attempts = Math.max(1, retries);
            let lastErr;
            for (let i = 0; i < attempts; i++) {
                try {
                    const res = await new Promise((resolve, reject) => {
                        const reqConfig = {
                            method: 'GET',
                            url,
                            headers: { 'Cache-Control': 'no-cache' },
                            anonymous: false, // 确保跨域请求发送 cookie
                            timeout,
                            ...validOptions,
                            onload: r => (r.status >= 200 && r.status < 300) ? resolve(r.responseText) : reject(r),
                            onerror: e => reject(e),
                            ontimeout: () => reject(new Error('timeout'))
                        };
                        // Firefox + Tampermonkey 需要显式设置 withCredentials 以确保跨域 cookie 发送
                        if (withCredentials) {
                            reqConfig.withCredentials = true;
                        }
                        GM_xmlhttpRequest(reqConfig);
                    });
                    return res;
                } catch (e) {
                    if (e?.status === 401 || e?.status === 403) throw e;
                    lastErr = e;
                    if (i === attempts - 1) throw lastErr;
                }
            }
            throw lastErr;
        }
        static get(k, d) { return GM_getValue(k, d); }
        static set(k, v) { GM_setValue(k, v); }
        static html(strings, ...values) { return strings.reduce((r, s, i) => r + s + (values[i] || ''), ''); }
        static el(s, p = document) { return p.querySelector(s); }
        static els(s, p = document) { return p.querySelectorAll(s); }

        // 获取当前登录用户名（保留旧逻辑，作为兜底）
        static getCurrentUsername() {
            // 方法1: 从 Discourse 全局对象获取
            try {
                const currentUser = window.Discourse?.User?.current?.() ||
                    window.Discourse?.currentUser ||
                    window.User?.current?.();
                if (currentUser?.username) return currentUser.username;
            } catch (e) { }

            // 方法2: 从页面 meta 标签或 preload 数据获取
            try {
                const preloadData = document.getElementById('data-preloaded');
                if (preloadData) {
                    const data = JSON.parse(preloadData.dataset.preloaded);
                    if (data?.currentUser) {
                        const cu = JSON.parse(data.currentUser);
                        if (cu?.username) return cu.username;
                    }
                }
            } catch (e) { }

            // 方法3: 从导航栏用户头像链接获取
            try {
                const avatarLink = document.querySelector('#current-user a[href*="/u/"]');
                if (avatarLink) {
                    const match = avatarLink.href.match(/\/u\/([^\/]+)/);
                    if (match) return match[1];
                }
            } catch (e) { }

            // 方法4: 从 localStorage 获取（Discourse 常用存储）
            try {
                const stored = localStorage.getItem('discourse_current_user');
                if (stored) {
                    const parsed = JSON.parse(stored);
                    if (parsed?.username) return parsed.username;
                }
            } catch (e) { }

            return null;
        }

        // ✅ 新增：权威 session 登录判定（同源）
        static async fetchSessionUser() {
            try {
                const r = await fetch('/session/current.json', { credentials: 'include' });
                if (!r.ok) return null;
                const data = await r.json();
                return data?.current_user || null;
            } catch (_) {
                return null;
            }
        }
        // v4-inspired: DOM-based login & username detection (used for cache/user-switch and as fallback)
        // Return: true (logged-in) / false (guest) / null (unknown)
        static getLoginStateByDOM() {
            try {
                const header = document.querySelector('.d-header') || document;
                const hasUser = !!header.querySelector('.header-dropdown-toggle.current-user, a.current-user, .current-user');
                if (hasUser) return true;

                const els = Array.from(header.querySelectorAll('a[href], button, .btn'));
                const hasLogin = els.some(el => {
                    const href = (el.getAttribute('href') || '').toLowerCase();
                    const text = (el.textContent || '').trim().toLowerCase();
                    // 只在 header 范围内检测“登录/注册”入口（借鉴 v4：无登录/注册按钮通常意味着已登录）
                    return href.includes('/login') || href.includes('/session')
                        || href.includes('/signup') || href.includes('/register')
                        || /登录|注册|log\s*in|sign\s*in|sign\s*up|register/.test(text);
                });

                if (hasLogin) return false;
                return null;
            } catch (_) {
                return null;
            }
        }

        // 尝试多种方式获取当前用户名（参考 v4 的 getCurrentUsername）
        static getCurrentUsernameFromDOM() {
            try {
                // 方法1：用户菜单头像 alt
                const userMenuButton = document.querySelector('.header-dropdown-toggle.current-user');
                if (userMenuButton) {
                    const img = userMenuButton.querySelector('img');
                    const alt = (img?.alt || '').trim();
                    if (alt) return alt.replace(/^@/, '');
                }

                // 方法2：用户头像 title
                const userAvatar = document.querySelector('.current-user img[title]');
                if (userAvatar && userAvatar.title) return userAvatar.title.trim().replace(/^@/, '');

                // 方法3：当前用户链接
                const currentUserLink = document.querySelector('a.current-user, .header-dropdown-toggle.current-user a');
                if (currentUserLink) {
                    const href = currentUserLink.getAttribute('href');
                    if (href && href.includes('/u/')) {
                        const username = href.split('/u/')[1].split('/')[0];
                        if (username) return username.trim().replace(/^@/, '');
                    }
                }

                // 方法4：遍历页面用户链接（排除 topic 列表 / 帖子流）
                const userLinks = document.querySelectorAll('a[href*="/u/"]');
                for (const link of userLinks) {
                    if (link.closest('.topic-list') || link.closest('.post-stream')) continue;
                    const href = link.getAttribute('href');
                    if (href && href.includes('/u/')) {
                        const username = href.split('/u/')[1].split('/')[0];
                        if (username) return username.trim().replace(/^@/, '');
                    }
                }

                // 方法5：URL 在用户页
                if (window.location.pathname.includes('/u/')) {
                    const username = window.location.pathname.split('/u/')[1].split('/')[0];
                    if (username) return username.trim().replace(/^@/, '');
                }

                // 方法6：localStorage（Discourse 当前用户）
                try {
                    const discourseData = localStorage.getItem('discourse_current_user');
                    if (discourseData) {
                        const userData = JSON.parse(discourseData);
                        if (userData?.username) return String(userData.username).trim().replace(/^@/, '');
                    }
                } catch (_) { /* ignore */ }

                return null;
            } catch (_) {
                return null;
            }
        }

        // 从 connect.linux.do 的欢迎语中解析"用户名 + 当前等级"（参考 v4 逻辑）
        static async fetchConnectWelcome() {
            const html = await Utils.request(CONFIG.API.TRUST, { timeout: 15000, retries: 2, withCredentials: true });
            const doc = new DOMParser().parseFromString(html, 'text/html');
            const bodyText = doc.body?.textContent || '';
            const loginHint = doc.querySelector('a[href*="/login"], form[action*="/login"], form[action*="/session"]');
            if (loginHint || /登录|login|sign\s*in/i.test(bodyText)) {
                const err = new Error('NeedLogin');
                err.code = 'NeedLogin';
                throw err;
            }

            const h1 = doc.querySelector('h1');
            const h1Text = (h1?.textContent || '').trim();

            let username = null;
            let level = null;

            // 例如: "你好，一剑万生 (YY_WD) 2级用户"
            let m = h1Text.match(/你好，\s*([^\(\s]*)\s*\(?([^)]*)\)?\s*(\d+)\s*级用户/i);
            if (m) {
                username = (m[2] || m[1] || '').trim();
                level = (m[3] || '').trim();
            }

            // 英文兜底（不严格）
            if (!level) {
                const m2 = h1Text.match(/trust\s*level\s*(\d+)/i) || h1Text.match(/(\d+)\s*(?:level|lvl)/i);
                if (m2) level = (m2[1] || '').trim();
            }

            if (username) username = username.replace(/^@/, '');
            const trustLevel = level !== null && level !== '' && !Number.isNaN(Number(level)) ? Number(level) : null;

            if (!username && trustLevel === null) return null;
            return { username, trustLevel };
        }


        // 获取用户信息（含信任等级）- 使用同源请求更稳定
        static async fetchUserInfo(username) {
            if (!username) return null;
            try {
                const r = await fetch(CONFIG.API.USER_INFO(username), { credentials: 'include' });
                if (!r.ok) return null;
                const data = await r.json();
                return data?.user || null;
            } catch (e) {
                return null;
            }
        }

        // 获取用户 summary 数据
        static async fetchUserSummary(username) {
            if (!username) return null;
            try {
                const r = await fetch(CONFIG.API.USER_SUMMARY(username), { credentials: 'include' });
                if (!r.ok) return null;
                const data = await r.json();
                return data?.user_summary || null;
            } catch (e) {
                return null;
            }
        }

        // 格式化阅读时间（秒 -> 可读格式）
        static formatReadTime(seconds) {
            const s = Number(seconds) || 0;
            if (s < 60) return `${s}秒`;
            const minutes = Math.floor(s / 60);
            if (minutes < 60) return `${minutes}分钟`;
            const hours = Math.floor(minutes / 60);
            const remainMins = minutes % 60;
            return remainMins > 0 ? `${hours}小时${remainMins}分` : `${hours}小时`;
        }

        // 获取论坛排名数据
        static async fetchForumStats() {
            const baseUrl = window.location.origin;
            const fetchJson = async (url) => {
                let lastErr = null;
                for (let i = 0; i < 3; i++) {
                    const controller = new AbortController();
                    const timer = setTimeout(() => controller.abort(), 10000);
                    try {
                        const r = await fetch(url, { signal: controller.signal });
                        clearTimeout(timer);
                        if (!r.ok) throw new Error(`http ${r.status}`);
                        return await r.json();
                    } catch (e) {
                        clearTimeout(timer);
                        lastErr = e;
                        if (i === 2) return null;
                    }
                }
                return null;
            };
            try {
                const [daily, global] = await Promise.all([
                    fetchJson(CONFIG.API.LEADERBOARD_DAILY),
                    fetchJson(CONFIG.API.LEADERBOARD)
                ]);
                // 尝试从 leaderboard 获取积分
                let score = global?.personal?.total_score || global?.personal?.score || null;
                // 如果没有积分，尝试从用户 API 获取
                if (!score && global?.personal?.user?.username) {
                    const username = global.personal.user.username;
                    const userInfo = await fetchJson(`${baseUrl}/u/${username}.json`);
                    score = userInfo?.user?.gamification_score || null;
                }
                return {
                    dailyRank: daily?.personal?.position || null,
                    globalRank: global?.personal?.position || null,
                    score: score
                };
            } catch (e) {
                return { dailyRank: null, globalRank: null, score: null };
            }
        }
    }

    // --- CDK Bridge (Tampermonkey 兼容兜底) ---
    const CDK_BRIDGE_ORIGIN = 'https://cdk.linux.do';
    const CDK_CACHE_TTL = 5 * 60 * 1000;
    const isCDKPage = location.hostname === 'cdk.linux.do';

    // 在 CDK 域内只做数据桥接，不渲染面板
    const initCDKBridgePage = () => {
        const cacheAndNotify = async () => {
            try {
                const res = await fetch(CONFIG.API.CDK_INFO, { credentials: 'include' });
                if (!res.ok) return;
                const json = await res.json();
                if (!json?.data) return;
                Utils.set(CONFIG.KEYS.CACHE_CDK, { data: json.data, ts: Date.now() });
                try {
                    window.parent?.postMessage({ type: 'lda-cdk-data', payload: { data: json.data } }, '*');
                } catch (_) { }
            } catch (_) { }
        };

        // 初始化立即拉取一次
        cacheAndNotify();

        // 接收来自 linux.do 的请求再拉取一次
        window.addEventListener('message', (e) => {
            if (e.data?.type === 'lda-cdk-request') cacheAndNotify();
        });
    };

    if (isCDKPage) {
        initCDKBridgePage();
        return;
    }

    // 样式
    const Styles = `
        :root {
            --lda-bg: rgba(255, 255, 255, 0.94);
            --lda-fg: #0f172a;
            --lda-dim: #64748b;
            --lda-border: 1px solid rgba(0,0,0,0.08);
            --lda-shadow: 0 12px 30px -4px rgba(0, 0, 0, 0.12);
            --lda-accent: #3b82f6;
            --lda-ball-ring: rgba(0,0,0,0.08);
            --lda-rad: 12px;
            --lda-z: 99999;
            --lda-opacity: 1;
            --lda-ball-size: 40px;
            --lda-ball-radius: 14px;
            --lda-red: #ef4444;
            --lda-green: #22c55e;
            --lda-neutral: rgba(125,125,125,0.25);
            --lda-font: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        }
        .lda-dark {
            --lda-bg: rgba(15, 23, 42, 0.94);
            --lda-fg: #f1f5f9;
            --lda-dim: #94a3b8;
            --lda-border: 1px solid rgba(255,255,255,0.08);
            --lda-shadow: 0 12px 30px -4px rgba(0, 0, 0, 0.6);
            --lda-accent: #38bdf8;
            --lda-ball-ring: rgba(255,255,255,0.15);
            --lda-neutral: rgba(255,255,255,0.18);
        }

        #lda-root { position: fixed; z-index: var(--lda-z); font-family: var(--lda-font); font-size: 14px; user-select: none; color: var(--lda-fg); min-width: var(--lda-ball-size); min-height: var(--lda-ball-size); opacity: var(--lda-opacity); transition: opacity 0.2s ease; }

        /* 悬浮球 */
        .lda-ball {
            position: relative;
            width: var(--lda-ball-size); height: var(--lda-ball-size);
            background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
            border-radius: var(--lda-ball-radius);
            box-shadow: 0 8px 22px rgba(59, 130, 246, 0.35), 0 0 0 1px var(--lda-ball-ring);
            border: none;
            cursor: grab;
            display: flex; align-items: center; justify-content: center; color: #fff;
            transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.2s;
            overflow: hidden;
        }
        .lda-ball::after {
            content: "";
            position: absolute;
            inset: 2px;
            border-radius: inherit;
            background: radial-gradient(circle at 30% 30%, rgba(255,255,255,0.25), transparent 55%);
            pointer-events: none;
            opacity: 0.9;
        }
        .lda-ball:hover { transform: scale(1.08) rotate(6deg); box-shadow: 0 10px 26px rgba(59, 130, 246, 0.45); }
        .lda-ball.dragging { cursor: grabbing; transform: scale(1.12); box-shadow: 0 12px 28px rgba(59, 130, 246, 0.55); }
        .lda-ball svg { width: 20px; height: 20px; fill: currentColor; pointer-events: none; position: relative; z-index: 1; }

        /* 小秘书图标模式 - 尺寸由JS动态设置 */
        .lda-ball.lda-ball-secretary {
            background: transparent;
            box-shadow: none;
            border-radius: 50%;
        }
        .lda-ball.lda-ball-secretary::after { display: none; }
        .lda-ball.lda-ball-secretary:hover {
            transform: scale(1.08);
            box-shadow: none;
        }
        .lda-ball.lda-ball-secretary.dragging {
            transform: scale(1.12);
            box-shadow: none;
        }
        .lda-ball-img {
            width: 100%; height: 100%;
            object-fit: contain;
            pointer-events: none;
            position: absolute;
            top: 0; left: 0;
            transition: opacity 0.2s ease;
            border-radius: 50%;
        }
        .lda-ball-img-normal { opacity: 1; }
        .lda-ball-img-hover { opacity: 0; }
        .lda-ball.lda-ball-secretary:hover .lda-ball-img-normal { opacity: 0; }
        .lda-ball.lda-ball-secretary:hover .lda-ball-img-hover { opacity: 1; }

        /* 经典图标模式（保持原样） */
        .lda-ball.lda-ball-classic {
            background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
            box-shadow: 0 8px 22px rgba(59, 130, 246, 0.35), 0 0 0 1px var(--lda-ball-ring);
            width: var(--lda-ball-size); height: var(--lda-ball-size);
        }
        .lda-ball.lda-ball-classic::after {
            content: "";
            position: absolute;
            inset: 2px;
            border-radius: inherit;
            background: radial-gradient(circle at 30% 30%, rgba(255,255,255,0.25), transparent 55%);
            pointer-events: none;
            opacity: 0.9;
        }
        .lda-ball.lda-ball-classic:hover {
            transform: scale(1.08) rotate(6deg);
            box-shadow: 0 10px 26px rgba(59, 130, 246, 0.45);
        }
        .lda-ball.lda-ball-classic.dragging {
            transform: scale(1.12);
            box-shadow: 0 12px 28px rgba(59, 130, 246, 0.55);
        }

        /* 面板 */
        .lda-panel {
            position: absolute; top: 0; right: 0;
            width: clamp(300px, calc(100vw - 24px), 370px); background: var(--lda-bg); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
            border: var(--lda-border); border-radius: var(--lda-rad); box-shadow: var(--lda-shadow);
            display: none; flex-direction: column; overflow: hidden; margin-top: 0;
            transform-origin: top right; animation: lda-in 0.25s cubic-bezier(0.2, 0.8, 0.2, 1);
        }
        #lda-root.lda-side-right .lda-panel { left: 0; right: auto; transform-origin: top left; }
        #lda-root.lda-side-left .lda-panel { right: 0; left: auto; transform-origin: top right; }
        @keyframes lda-in { from { opacity: 0; transform: scale(0.92) translateY(-10px); } to { opacity: 1; transform: scale(1) translateY(0); } }

        /* 头部 */
        .lda-head {
            padding: 12px 16px; display: flex; justify-content: space-between; align-items: center;
            border-bottom: var(--lda-border); background: rgba(125,125,125,0.03); cursor: move;
        }
        .lda-title { font-weight: 700; font-size: 13px; color: var(--lda-accent); letter-spacing: -0.3px; }
        .lda-actions { display: flex; gap: 8px; }
        .lda-icon-btn {
            width: 24px; height: 24px; border-radius: 6px; display: flex; align-items: center; justify-content: center;
            cursor: pointer; opacity: 0.6; transition: 0.2s; color: var(--lda-fg);
        }
        .lda-icon-btn:hover { background: rgba(125,125,125,0.1); opacity: 1; }

        /* 导航 */
        .lda-tabs { display: flex; padding: 6px 16px 0; border-bottom: var(--lda-border); gap: 16px; }
        .lda-tab {
            padding: 8px 0; font-size: 12px; cursor: pointer; color: var(--lda-dim);
            border-bottom: 2px solid transparent; transition: 0.2s; font-weight: 500;
        }
        .lda-tab:hover { color: var(--lda-fg); }
        .lda-tab.active { border-bottom-color: var(--lda-accent); color: var(--lda-accent); font-weight: 600; }

        /* 内容区 */
        .lda-body { position: relative; transition: height 0.3s cubic-bezier(0.4, 0, 0.2, 1); }
        .lda-page { display: none; padding: 16px; animation: lda-fade 0.2s; }
        .lda-page.active { display: block; }
        @keyframes lda-fade { from { opacity: 0; transform: translateX(6px); } to { opacity: 1; transform: translateX(0); } }

        /* 高度控制 */
        .h-sm .lda-body { height: 320px; overflow-y: auto; }
        .h-lg .lda-body { height: 520px; overflow-y: auto; }
        .h-auto .lda-body { height: auto; max-height: 80vh; min-height: 200px; overflow-y: auto; }
        .lda-body::-webkit-scrollbar { width: 4px; }

        /* 移动端响应式适配 */
        @media (max-width: 420px) {
            .h-auto .lda-body { max-height: 65vh; }
        }
        .lda-body::-webkit-scrollbar-thumb { background: rgba(125,125,125,0.2); border-radius: 2px; }

        /* 卡片通用 */
        .lda-card {
            background: rgba(125,125,125,0.03); border-radius: 10px; padding: 14px; margin-bottom: 12px;
            border: var(--lda-border); position: relative;
        }

        /* 头部信息栏 & 动作按钮组 */
        .lda-info-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px; min-height: 28px; }
        .lda-lvl-group { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; padding-right: 60px; /* 留出右侧按钮空间 */ }
        .lda-big-lvl { font-size: 20px; font-weight: 800; color: var(--lda-accent); line-height: 1; }
        .lda-badge {
            padding: 3px 8px; border-radius: 6px; font-size: 11px; font-weight: 600;
            background: rgba(125,125,125,0.1); display: inline-block;
        }
        .lda-badge.ok { background: rgba(34, 197, 94, 0.1); color: var(--lda-green); }
        .lda-badge.no { background: rgba(239, 68, 68, 0.1); color: var(--lda-red); }
        .lda-badge.neutral { background: rgba(125,125,125,0.10); color: var(--lda-dim); }

        /* 排名统计栏 */
        .lda-stats-bar {
            display: flex; gap: 10px; margin-top: 10px; padding: 8px 10px;
            background: rgba(125,125,125,0.05); border-radius: 8px; white-space: nowrap;
        }
        .lda-stats-bar a { text-decoration: none; color: inherit; }
        .lda-stat-item { display: flex; align-items: center; gap: 3px; font-size: 11px; color: var(--lda-dim); }
        .lda-stat-item .num { font-weight: 700; font-size: 13px; }
        .lda-stat-item .num.rank { color: #e74c3c; }
        .lda-stat-item .num.today { color: #f39c12; }
        .lda-stat-item .num.score { color: #27ae60; }

        /* 动作组容器 */
        .lda-actions-group {
            position: absolute; top: 12px; right: 12px;
            display: flex; gap: 6px;
        }

        /* 统一的动作按钮样式 */
        .lda-act-btn {
            width: 28px; height: 28px; border-radius: 50%;
            display: flex; align-items: center; justify-content: center;
            cursor: pointer; background: var(--lda-bg); box-shadow: 0 2px 6px rgba(0,0,0,0.06);
            color: var(--lda-dim); transition: 0.2s; border: var(--lda-border);
            text-decoration: none; /* 针对 a 标签 */
        }
        .lda-act-btn:hover { color: var(--lda-accent); background: #fff; }
        .lda-dark .lda-act-btn:hover { background: rgba(255,255,255,0.1); }

        /* 刷新按钮旋转逻辑 */
        .lda-act-btn.loading svg { animation: lda-spin 0.8s linear infinite; }

        /* 信任列表条目 */
        .lda-item { margin-bottom: 10px; }
        .lda-item-top { display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 4px; }
        .lda-i-name { color: var(--lda-dim); }
        .lda-i-val { font-family: 'SF Mono', monospace; font-weight: 600; display: flex; align-items: center; }
        .lda-progress { height: 5px; background: rgba(125,125,125,0.1); border-radius: 3px; overflow: hidden; }
        .lda-fill { height: 100%; border-radius: 3px; transition: width 0.5s ease-out; }

        /* 涨跌 Diff */
        .lda-diff {
            font-size: 10px; padding: 1px 4px; border-radius: 4px; font-weight: 700; margin-left: 6px;
            display: inline-flex; align-items: center; height: 16px;
        }
        .lda-diff.up { color: var(--lda-red); background: rgba(239, 68, 68, 0.1); }
        .lda-diff.down { color: var(--lda-green); background: rgba(34, 197, 94, 0.1); }

        /* 积分 */
        .lda-credit-hero { text-align: center; padding: 20px 0; }
        /* 积分 - 左右结构（仅 Credit 页面） */
        .lda-credit-hero.lda-split { display: flex; align-items: center; justify-content: center; padding: 16px 0; gap: 12px; text-align: center; }
        .lda-credit-side { text-align: center; flex: 1; min-width: 0; }
        .lda-credit-num { font-size: 24px; font-weight: 700; color: var(--lda-fg); font-family: monospace; letter-spacing: -1px; }
        .lda-credit-label { font-size: 10px; text-transform: uppercase; color: var(--lda-dim); margin-top: 2px; letter-spacing: 0.5px; }
        .lda-credit-sub { font-size: 11px; color: var(--lda-dim); margin-top: 4px; }
        .lda-credit-sub span { font-weight: 600; color: var(--lda-fg); }
        .lda-credit-plus { font-size: 20px; font-weight: 300; color: var(--lda-dim); padding: 0 4px; flex-shrink: 0; }
        .lda-credit-gain { color: var(--lda-green); }
        .lda-credit-gain-tip { font-size: 9px; color: var(--lda-dim); opacity: 0.7; margin-top: 2px; }

        /* 自定义 tooltip（立即显示） */
        .lda-gain-tooltip-wrap { position: relative; cursor: help; }
        .lda-gain-tooltip {
            position: absolute; bottom: 100%; left: 50%; transform: translateX(-50%);
            background: rgba(0,0,0,0.85); color: #fff; padding: 6px 10px; border-radius: 6px;
            font-size: 11px; white-space: pre; line-height: 1.5; z-index: 100;
            opacity: 0; visibility: hidden; transition: opacity 0.15s, visibility 0.15s;
            pointer-events: none; margin-bottom: 6px; text-align: left;
        }
        .dark .lda-gain-tooltip { background: rgba(255,255,255,0.92); color: #000; }
        .lda-gain-tooltip-wrap:hover .lda-gain-tooltip { opacity: 1; visibility: visible; }

        /* 涨分动画 */
        @keyframes lda-gain-pop {
            0% { transform: scale(0.5) translateY(0); opacity: 0; }
            15% { transform: scale(1.3) translateY(-5px); opacity: 1; }
            30% { transform: scale(1) translateY(-8px); opacity: 1; }
            100% { transform: scale(0.6) translateY(-20px); opacity: 0; }
        }
        .lda-gain-anim {
            position: absolute; font-size: 18px; font-weight: 700; color: var(--lda-green);
            pointer-events: none; z-index: 10002; font-family: monospace;
            animation: lda-gain-pop 1.5s ease-out forwards;
            text-shadow: 0 1px 3px rgba(0,0,0,0.2);
        }

        .lda-row-rec { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px dashed rgba(125,125,125,0.2); font-size: 12px; }

        /* Credit 授权提示卡片 */
        .lda-auth-card { text-align: center; padding: 30px 20px; }
        .lda-auth-icon { color: var(--lda-dim); opacity: 0.5; margin-bottom: 12px; }
        .lda-auth-title { font-size: 15px; font-weight: 600; color: var(--lda-fg); margin-bottom: 6px; }
        .lda-auth-tip { font-size: 12px; color: var(--lda-dim); margin-bottom: 16px; }
        .lda-auth-btns { display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; }
        .lda-auth-btn {
            display: inline-block; padding: 10px 20px; background: var(--lda-accent); color: #fff;
            border-radius: 8px; font-size: 13px; font-weight: 600; text-decoration: none;
            transition: all 0.2s; box-shadow: 0 2px 8px rgba(59, 130, 246, 0.3); border: none; cursor: pointer;
        }
        .lda-auth-btn:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4); }
        .lda-auth-btn.secondary { background: rgba(125,125,125,0.15); color: var(--lda-fg); box-shadow: none; }
        .lda-auth-btn.secondary:hover { background: rgba(125,125,125,0.25); transform: none; }
        .lda-row-rec:last-child { border: none; }
        .lda-amt { font-weight: 600; font-family: monospace; }

        /* 设置 */
        .lda-opt { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; padding-bottom: 14px; border-bottom: var(--lda-border); }
        .lda-opt:last-child { border: none; margin: 0; padding: 0; }
        .lda-opt-label { font-size: 13px; font-weight: 500; }
        .lda-opt-right { display: flex; flex-direction: column; gap: 8px; align-items: flex-end; }
        .lda-opt-sub { font-size: 12px; color: var(--lda-dim); }

        .lda-switch { position: relative; width: 36px; height: 20px; display: inline-block; }
        .lda-switch input { opacity: 0; width: 0; height: 0; }
        .lda-slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: #cbd5e1; transition: .3s; border-radius: 20px; }
        .lda-slider:before { position: absolute; content: ""; height: 16px; width: 16px; left: 2px; bottom: 2px; background-color: white; transition: .3s; border-radius: 50%; box-shadow: 0 1px 2px rgba(0,0,0,0.2); }
        input:checked + .lda-slider { background-color: var(--lda-accent); }
        input:checked + .lda-slider:before { transform: translateX(16px); }

        .lda-seg { display: flex; background: rgba(125,125,125,0.08); padding: 3px; border-radius: 8px; }
        .lda-seg-item { padding: 4px 10px; font-size: 11px; cursor: pointer; border-radius: 6px; color: var(--lda-dim); font-weight: 500; transition: 0.2s; }
        .lda-seg-item.active { background: var(--lda-bg); color: var(--lda-fg); box-shadow: 0 2px 5px rgba(0,0,0,0.05); font-weight: 600; }

        .lda-opacity-row { display: flex; align-items: center; gap: 8px; }
        .lda-range {
            -webkit-appearance: none;
            appearance: none;
            width: 140px;
            height: 6px;
            border-radius: 999px;
            background: linear-gradient(90deg, rgba(59,130,246,0.15), rgba(59,130,246,0.35));
            outline: none;
            cursor: pointer;
        }
        .lda-range::-webkit-slider-thumb {
            -webkit-appearance: none;
            appearance: none;
            width: 16px;
            height: 16px;
            border-radius: 50%;
            background: var(--lda-accent);
            box-shadow: 0 2px 6px rgba(0,0,0,0.2);
            border: 1px solid rgba(255,255,255,0.6);
        }
        .lda-range::-moz-range-thumb {
            width: 16px;
            height: 16px;
            border-radius: 50%;
            background: var(--lda-accent);
            box-shadow: 0 2px 6px rgba(0,0,0,0.2);
            border: 1px solid rgba(255,255,255,0.6);
        }

        .lda-spin { animation: lda-spin 0.8s linear infinite; }
        @keyframes lda-spin { 100% { transform: rotate(360deg); } }

        /* 云朵脉冲动画（检查更新） */
        .lda-cloud-pulse { animation: lda-cloud-pulse 0.6s ease-in-out infinite; }
        @keyframes lda-cloud-pulse {
            0%, 100% { opacity: 0.5; transform: scale(1); }
            50% { opacity: 1; transform: scale(1.2); }
        }

        /* 拖拽排序 */
        .lda-sortable { display: flex; flex-direction: column; gap: 6px; margin-bottom: 10px; }
        .lda-sort-item {
            display: flex; align-items: center; gap: 10px; padding: 10px 12px;
            background: var(--lda-bg); border: var(--lda-border); border-radius: 8px;
            cursor: grab; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; transition: all 0.2s;
        }
        .lda-sort-item:hover { background: rgba(125,125,125,0.08); }
        .lda-sort-item.dragging { opacity: 0.5; cursor: grabbing; transform: scale(1.02); box-shadow: 0 4px 12px rgba(0,0,0,0.15); }
        .lda-sort-item.drag-over { border-color: var(--lda-accent); background: rgba(59, 130, 246, 0.08); }
        .lda-sort-handle { color: var(--lda-dim); display: flex; align-items: center; }
        .lda-sort-label { flex: 1; font-size: 13px; font-weight: 500; }
        .lda-sort-num { width: 20px; height: 20px; border-radius: 50%; background: var(--lda-accent); color: #fff; font-size: 11px; font-weight: 700; display: flex; align-items: center; justify-content: center; }
        .lda-sort-btn {
            margin-top: 8px; padding: 8px 16px; background: var(--lda-accent); color: #fff;
            border: none; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer;
            transition: all 0.2s; width: 100%;
        }
        .lda-sort-btn:hover { opacity: 0.9; }
        .lda-sort-btn.saved { background: var(--lda-green); }

        /* 支持作者区域 */
        .lda-support {
            background: linear-gradient(135deg, rgba(239, 68, 68, 0.08), rgba(249, 115, 22, 0.06), rgba(59, 130, 246, 0.08));
            border-radius: 10px; padding: 10px 12px; margin-bottom: 10px;
            border: 1px solid rgba(239, 68, 68, 0.15);
        }
        .lda-support-header {
            display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;
        }
        .lda-support-title {
            font-size: 13px; font-weight: 600; color: var(--lda-fg);
            display: flex; align-items: center; gap: 6px;
        }
        .lda-support-heart {
            display: inline-block; animation: lda-heartbeat 1.2s ease-in-out infinite;
            filter: drop-shadow(0 0 3px rgba(239, 68, 68, 0.4));
        }
        @keyframes lda-heartbeat {
            0%, 100% { transform: scale(1); }
            14% { transform: scale(1.15); }
            28% { transform: scale(1); }
            42% { transform: scale(1.1); }
            70% { transform: scale(1); }
        }
        .lda-support-desc { font-size: 10px; color: var(--lda-dim); }
        .lda-support-grid {
            display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px;
        }
        .lda-support-card {
            display: flex; flex-direction: column; align-items: center; padding: 8px 6px;
            background: var(--lda-bg); border: 1px solid var(--lda-border); border-radius: 8px;
            cursor: pointer; transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
            text-decoration: none !important; position: relative; overflow: hidden;
        }
        .lda-support-card::before {
            content: ''; position: absolute; top: 0; left: 0; right: 0; height: 2px;
            background: var(--card-accent, var(--lda-accent)); transition: height 0.25s;
        }
        .lda-support-card:hover {
            border-color: var(--card-accent, var(--lda-accent));
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(0,0,0,0.1);
        }
        .lda-support-card:hover::before { height: 3px; }
        .lda-support-card.tier-1 { --card-accent: #10b981; }
        .lda-support-card.tier-2 { --card-accent: #3b82f6; }
        .lda-support-card.tier-3 { --card-accent: #f59e0b; }
        .lda-support-card.tier-4 { --card-accent: #ef4444; }
        .lda-support-icon { font-size: 16px; margin-bottom: 2px; }
        .lda-support-amount {
            font-size: 12px; font-weight: 700; color: var(--card-accent, var(--lda-accent));
        }
        .lda-support-unit { font-size: 9px; color: var(--lda-dim); margin-top: 1px; }
        /* 慢速提示 */
        .lda-slow-tip {
            display: none;
            margin-top: 12px;
            padding: 10px 12px;
            background: rgba(59,130,246,0.08);
            border: 1px dashed rgba(59,130,246,0.4);
            color: var(--lda-dim);
            font-size: 12px;
            border-radius: 8px;
        }

        /* V3新增：降级提示横幅 */
        .lda-fallback-banner {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 10px 12px;
            margin-bottom: 12px;
            background: rgba(251, 191, 36, 0.1);
            border: 1px solid rgba(251, 191, 36, 0.25);
            border-radius: 8px;
            font-size: 11px;
            color: var(--lda-dim);
        }
        .lda-dark .lda-fallback-banner {
            background: rgba(251, 191, 36, 0.08);
            border-color: rgba(251, 191, 36, 0.2);
        }
        .lda-fallback-banner svg {
            flex-shrink: 0;
            width: 16px;
            height: 16px;
            color: #f59e0b;
        }
        .lda-fallback-text {
            flex: 1;
            line-height: 1.4;
        }

        /* V3新增：数据来源标签 */
        .lda-source-tag {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            padding: 2px 8px;
            background: rgba(125,125,125,0.08);
            border-radius: 4px;
            font-size: 10px;
            color: var(--lda-dim);
            margin-left: 8px;
        }
    
        /* === Celebration (all requirements met) === */
        @keyframes lda-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .lda-celebration-wrap { display: flex; flex-direction: column; gap: 12px; }
        .lda-celebration-achievement {
            display: flex; flex-direction: column; align-items: center; text-align: center;
            padding: 16px 12px;
            border: var(--lda-border);
            border-radius: var(--lda-rad);
            background: linear-gradient(135deg, rgba(59,130,246,0.12), rgba(34,197,94,0.10));
            position: relative;
            overflow: hidden;
        }
        .lda-celebration-icon {
            position: relative;
            width: 56px; height: 56px;
            border-radius: 18px;
            display: flex; align-items: center; justify-content: center;
            background: var(--lda-accent);
            box-shadow: 0 12px 30px -10px rgba(0,0,0,0.25);
        }
        .lda-celebration-ring {
            position: absolute;
            inset: -10px;
            border-radius: 999px;
            border: 2px solid rgba(255,255,255,0.35);
            animation: lda-spin 2.2s linear infinite;
        }
        .lda-celebration-ring-outer {
            position: absolute;
            inset: -18px;
            border-radius: 999px;
            border: 2px solid rgba(255,255,255,0.18);
            animation: lda-spin 3.8s linear infinite reverse;
        }
        .lda-celebration-title { font-weight: 900; font-size: 16px; margin-top: 10px; color: var(--lda-fg); }
        .lda-celebration-subtitle { font-size: 12px; color: var(--lda-dim); margin-top: 4px; }
        .lda-celebration-message { font-size: 12px; color: var(--lda-fg); margin-top: 10px; line-height: 1.5; }
        .lda-celebration-actions { display: flex; justify-content: center; }
        .lda-celebration-actions button { min-width: 88px; }
        .lda-celebration-details { display: none; flex-direction: column; gap: 10px; }
        .lda-celebration-scroll { max-height: 300px; overflow-y: auto; padding-right: 6px; }

    `;

    // 主程序
    class App {
        constructor() {
            this.state = {
                lang: Utils.get(CONFIG.KEYS.LANG, 'zh'),
                theme: Utils.get(CONFIG.KEYS.THEME, 'auto'),
                height: Utils.get(CONFIG.KEYS.HEIGHT, 'auto'), // Default: Auto
                expand: Utils.get(CONFIG.KEYS.EXPAND, true),   // Default: True
                trustCache: Utils.get(CONFIG.KEYS.CACHE_TRUST, {}),
                tabOrder: Utils.get(CONFIG.KEYS.TAB_ORDER, ['trust', 'credit', 'cdk']), // 标签顺序
                refreshInterval: Utils.get(CONFIG.KEYS.REFRESH_INTERVAL, 30), // 分钟，0 为关闭
                opacity: Utils.get(CONFIG.KEYS.OPACITY, 1),
                gainAnim: Utils.get(CONFIG.KEYS.GAIN_ANIM, true), // 涨分动画，默认开启
                useClassicIcon: Utils.get(CONFIG.KEYS.USE_CLASSIC_ICON, false), // 使用经典地球图标，默认关闭
                iconSize: Utils.get(CONFIG.KEYS.ICON_SIZE, 'sm') // 小秘书图标尺寸，默认小
            };
            this.iconCache = Utils.get(CONFIG.KEYS.ICON_CACHE, null); // 小秘书图标缓存
            this.cdkCache = Utils.get(CONFIG.KEYS.CACHE_CDK, null);
            this.trustData = Utils.get(CONFIG.KEYS.CACHE_TRUST_DATA, null);
            this.creditData = Utils.get(CONFIG.KEYS.CACHE_CREDIT_DATA, null);
            this.lastFetch = Utils.get(CONFIG.KEYS.CACHE_META, { trust: 0, credit: 0, cdk: 0 });
            this.userSig = Utils.get(CONFIG.KEYS.USER_SIG, null);
            this.lastSkipUpdate = Utils.get(CONFIG.KEYS.LAST_SKIP_UPDATE, 0);
            this.lastAutoCheck = Utils.get(CONFIG.KEYS.LAST_AUTO_CHECK, 0);
            this.focusFlags = { trust: false, credit: false, cdk: false };
            this.autoRefreshTimer = null;
            this.userWatchTimer = null; // 账号切换/退出检测计时器
            this.cdkBridgeInit = false;
            this.cdkBridgeFrame = null;
            this.cdkWaiters = [];
            this.onCDKMessage = this.onCDKMessage.bind(this);
            this.activePage = 'trust';
            this.pendingStatus = {
                trust: { count: 0, since: null, timer: null, slowShown: false },
                credit: { count: 0, since: null, timer: null, slowShown: false },
                cdk: { count: 0, since: null, timer: null, slowShown: false }
            };
            // 新增：追踪各页面的刷新状态（用于按钮旋转动画）
            this.refreshingPages = { trust: false, credit: false, cdk: false };
            this.refreshStartTime = { trust: 0, credit: 0, cdk: 0 };
            this.refreshStopPending = { trust: false, credit: false, cdk: false }; // 是否正在等待延迟停止
            this.dom = {};

            // 存储/缓存格式校验（避免旧版本残留导致错误状态）
            this.ensureStorageSchema();
            this.validateLoadedCache();
        }

        async init(forceOpen = false) {
            if (this.autoRefreshTimer) {
                clearInterval(this.autoRefreshTimer);
                this.autoRefreshTimer = null;
            }
            GM_addStyle(Styles);
            this.renderLayout();
            this.updateBallIcon(); // 初始化悬浮球图标
            this.loadSecretaryIcons().then(() => this.updateBallIcon()); // 异步加载并缓存图标
            this.bindGlobalEvents();
            this.startUserWatcher();
            this.applyTheme();
            this.applyHeight();
            this.applyOpacity();
            this.restorePos();
            this.updatePanelSide();
            this.renderFromCacheAll();
            this.prewarmAll();
            this.startAutoRefreshTimer();
            this.maybeAutoCheckUpdate();

            if (this.state.expand || forceOpen) {
                this.togglePanel(true);
            }
        }

        t(key) { return I18N[this.state.lang][key] || key; }

        renderLayout() {
            const root = document.createElement('div');
            root.id = 'lda-root';
            root.className = 'lda-side-left';
            // 定义所有标签的映射
            const tabMap = {
                trust: { key: 'trust', label: this.t('tab_trust') },
                credit: { key: 'credit', label: this.t('tab_credit') },
                cdk: { key: 'cdk', label: this.t('tab_cdk') }
            };
            // 根据 tabOrder 获取排序后的标签
            const orderedTabs = this.state.tabOrder.map(key => tabMap[key]);
            root.innerHTML = Utils.html`
                <div class="lda-ball" title="${this.t('title')}"></div>
                <div class="lda-panel">
                    <div class="lda-head">
                        <div class="lda-title">Linux.do 小秘书</div>
                        <div class="lda-actions">
                            <div class="lda-icon-btn" id="lda-btn-update" title="${this.t('check_update')}"><svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z"/></svg></div>
                            <div class="lda-icon-btn" id="lda-btn-theme" title="${this.t('theme_tip')}"></div>
                            <div class="lda-icon-btn" id="lda-btn-close"><svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg></div>
                        </div>
                    </div>
                    <div class="lda-tabs">
                        <div class="lda-tab active" data-target="${orderedTabs[0].key}">${orderedTabs[0].label}</div>
                        <div class="lda-tab" data-target="${orderedTabs[1].key}">${orderedTabs[1].label}</div>
                        <div class="lda-tab" data-target="${orderedTabs[2].key}">${orderedTabs[2].label}</div>
                        <div class="lda-tab" data-target="setting">${this.t('tab_setting')}</div>
                    </div>
                    <div class="lda-body">
                        <div id="page-${orderedTabs[0].key}" class="lda-page active">
                            <div id="content-${orderedTabs[0].key}"></div>
                            <div class="lda-slow-tip" data-page="${orderedTabs[0].key}"></div>
                        </div>
                        <div id="page-${orderedTabs[1].key}" class="lda-page">
                            <div id="content-${orderedTabs[1].key}"></div>
                            <div class="lda-slow-tip" data-page="${orderedTabs[1].key}"></div>
                        </div>
                        <div id="page-${orderedTabs[2].key}" class="lda-page">
                            <div id="content-${orderedTabs[2].key}"></div>
                            <div class="lda-slow-tip" data-page="${orderedTabs[2].key}"></div>
                        </div>
                        <div id="page-setting" class="lda-page">
                            <div id="content-setting"></div>
                        </div>
                    </div>
                </div>
            `;
            document.body.appendChild(root);

            this.dom = {
                root,
                ball: Utils.el('.lda-ball', root),
                panel: Utils.el('.lda-panel', root),
                trustPage: Utils.el('#page-trust', root),
                creditPage: Utils.el('#page-credit', root),
                cdkPage: Utils.el('#page-cdk', root),
                settingPage: Utils.el('#page-setting', root),
                trust: Utils.el('#content-trust', root),
                credit: Utils.el('#content-credit', root),
                cdk: Utils.el('#content-cdk', root),
                setting: Utils.el('#content-setting', root),
                slowTips: Utils.els('.lda-slow-tip', root),
                themeBtn: Utils.el('#lda-btn-theme', root),
                tabs: Utils.els('.lda-tab', root),
                head: Utils.el('.lda-head', root)
            };

            this.renderSettings();
            this.updateThemeIcon();
        }

        renderSettings() {
            const { lang, height, expand, tabOrder, refreshInterval, opacity, gainAnim, useClassicIcon, iconSize } = this.state;
            const r = (val, cur) => val === cur ? 'active' : '';
            const opacityVal = Math.max(0.5, Math.min(1, Number(opacity) || 1));
            const opacityPercent = Math.round(opacityVal * 100);

            // 标签名称映射
            const tabNames = {
                trust: this.t('tab_trust'),
                credit: this.t('tab_credit'),
                cdk: this.t('tab_cdk')
            };

            // 生成排序项 HTML
            const sortItemsHtml = tabOrder.map((key, idx) => `
                <div class="lda-sort-item" draggable="true" data-key="${key}">
                    <div class="lda-sort-handle">
                        <svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M11 18c0 1.1-.9 2-2 2s-2-.9-2-2 .9-2 2-2 2 .9 2 2zm-2-8c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0-6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm6 4c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/></svg>
                    </div>
                    <span class="lda-sort-num">${idx + 1}</span>
                    <span class="lda-sort-label">${tabNames[key]}</span>
                </div>
            `).join('');

            // 支持选项配置
            const supportTiers = [
                { id: 1, amount: 2, icon: '☕', url: 'https://credit.linux.do/paying/online?token=01fdff1ae667a2625d225191717e3281c600218c2152340a4fcd56d7c4423579' },
                { id: 2, amount: 5, icon: '🍵', url: 'https://credit.linux.do/paying/online?token=1f2ceff6ef0bad81cb09c45e03d5bad3c3f71085f6541f56a3de5f20f9c70800' },
                { id: 3, amount: 10, icon: '🍰', url: 'https://credit.linux.do/paying/online?token=cbb30b6eb01e4de09ba1cdba487d4d19a1c6639095d089acd41682f6e9639bc2' },
                { id: 4, amount: 20, icon: '🎂', url: 'https://credit.linux.do/paying/online?token=10fc4d4c07d8073894b1c9654da43da004df5d33a0251dd44ede2199b104373d' }
            ];
            const supportCardsHtml = supportTiers.map(t => `
                <a href="${t.url}" target="_blank" class="lda-support-card tier-${t.id}" rel="noopener">
                    <span class="lda-support-icon">${t.icon}</span>
                    <span class="lda-support-amount">${t.amount}</span>
                    <span class="lda-support-unit">LDC</span>
                </a>
            `).join('');

            // ✅ 隐藏“清除缓存”功能入口：不再渲染按钮（保留内部逻辑以备将来启用）
            this.dom.setting.innerHTML = Utils.html`
                <div class="lda-card">
                    <div class="lda-opt" style="flex-wrap:wrap;">
                        <div style="display:flex;align-items:center;gap:8px;">
                            <label class="lda-switch"><input type="checkbox" id="inp-expand" ${expand ? 'checked' : ''}><span class="lda-slider"></span></label>
                            <div class="lda-opt-label" style="font-size:12px">${this.t('set_auto')}</div>
                        </div>
                        <div style="display:flex;align-items:center;gap:8px;">
                            <label class="lda-switch"><input type="checkbox" id="inp-gain-anim" ${gainAnim ? 'checked' : ''}><span class="lda-slider"></span></label>
                            <div class="lda-opt-label" style="font-size:12px">${this.t('set_gain_anim')}</div>
                        </div>
                        <div style="display:flex;align-items:center;gap:8px;">
                            <label class="lda-switch"><input type="checkbox" id="inp-classic-icon" ${useClassicIcon ? 'checked' : ''}><span class="lda-slider"></span></label>
                            <div class="lda-opt-label" style="font-size:12px">${this.t('set_classic_icon')}</div>
                        </div>
                    </div>
                    <div class="lda-opt" id="lda-icon-size-opt" style="${useClassicIcon ? 'display:none;' : ''}">
                        <div class="lda-opt-label">${this.t('set_icon_size')}</div>
                        <div class="lda-seg" id="grp-icon-size">
                            <div class="lda-seg-item ${r('sm', iconSize)}" data-v="sm">${this.t('icon_size_sm')}</div>
                            <div class="lda-seg-item ${r('md', iconSize)}" data-v="md">${this.t('icon_size_md')}</div>
                            <div class="lda-seg-item ${r('lg', iconSize)}" data-v="lg">${this.t('icon_size_lg')}</div>
                        </div>
                    </div>
                    <div class="lda-opt">
                        <div class="lda-seg" id="grp-lang">
                            <div class="lda-seg-item ${r('zh', lang)}" data-v="zh">中文</div>
                            <div class="lda-seg-item ${r('en', lang)}" data-v="en">EN</div>
                        </div>
                    </div>
                    <div class="lda-opt">
                        <div class="lda-opt-label">${this.t('set_size')}</div>
                        <div class="lda-opt-right">
                            <div class="lda-seg" id="grp-size">
                                <div class="lda-seg-item ${r('sm', height)}" data-v="sm">${this.t('size_sm')}</div>
                                <div class="lda-seg-item ${r('lg', height)}" data-v="lg">${this.t('size_lg')}</div>
                                <div class="lda-seg-item ${r('auto', height)}" data-v="auto">${this.t('size_auto')}</div>
                            </div>
                            <div class="lda-opacity-row">
                                <span class="lda-opt-sub">${this.t('set_opacity')}</span>
                                <input type="range" min="0.5" max="1" step="0.05" value="${opacityVal}" id="inp-opacity" class="lda-range">
                                <span id="val-opacity">${opacityPercent}%</span>
                            </div>
                        </div>
                    </div>
                    <div class="lda-opt">
                        <div>
                            <div class="lda-opt-label">${this.t('set_refresh')}</div>
                            <div style="font-size:11px;color:var(--lda-dim);margin-top:4px;">${this.t('refresh_tip')}</div>
                        </div>
                        <div class="lda-seg" id="grp-refresh">
                            <div class="lda-seg-item ${r(30, refreshInterval)}" data-v="30">${this.t('refresh_30')}</div>
                            <div class="lda-seg-item ${r(60, refreshInterval)}" data-v="60">${this.t('refresh_60')}</div>
                            <div class="lda-seg-item ${r(120, refreshInterval)}" data-v="120">${this.t('refresh_120')}</div>
                            <div class="lda-seg-item ${r(0, refreshInterval)}" data-v="0">${this.t('refresh_off')}</div>
                        </div>
                    </div>
                    <div class="lda-opt" style="flex-direction:column; align-items:stretch;">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                            <div class="lda-opt-label">${this.t('set_tab_order')}</div>
                            <span style="font-size:10px; color:var(--lda-dim)">${this.t('tab_order_tip')}</span>
                        </div>
                        <div class="lda-sortable" id="sortable-tabs">
                            ${sortItemsHtml}
                        </div>
                        <button class="lda-sort-btn" id="btn-save-order">${this.t('tab_order_save')}</button>
                    </div>
                </div>
                <div class="lda-support">
                    <div class="lda-support-header">
                        <div class="lda-support-title">
                            <span class="lda-support-heart">💖</span>
                            ${this.t('support_title')}
                        </div>
                        <div class="lda-support-desc">${this.t('support_desc')}</div>
                    </div>
                    <div class="lda-support-grid">
                        ${supportCardsHtml}
                    </div>
                </div>
                <div style="text-align:center; margin-top:8px;">
                    <div style="font-size:10px; color:var(--lda-dim); opacity:0.6;">
                        v${GM_info.script.version} &bull; By Sauterne@Linux.do
                    </div>
                </div>
            `;

            this.initSortable();
        }

        initSortable() {
            const container = Utils.el('#sortable-tabs', this.dom.setting);
            const saveBtn = Utils.el('#btn-save-order', this.dom.setting);
            let draggedItem = null;

            // 更新序号显示
            const updateNumbers = () => {
                const items = container.querySelectorAll('.lda-sort-item');
                items.forEach((item, idx) => {
                    item.querySelector('.lda-sort-num').textContent = idx + 1;
                });
            };

            // ===== 桌面端：原有 HTML5 Drag and Drop（保持不变）=====
            // 拖拽开始
            container.addEventListener('dragstart', (e) => {
                if (e.target.classList.contains('lda-sort-item')) {
                    draggedItem = e.target;
                    e.target.classList.add('dragging');
                    e.dataTransfer.effectAllowed = 'move';
                }
            });

            // 拖拽结束
            container.addEventListener('dragend', (e) => {
                if (e.target.classList.contains('lda-sort-item')) {
                    e.target.classList.remove('dragging');
                    container.querySelectorAll('.lda-sort-item').forEach(item => {
                        item.classList.remove('drag-over');
                    });
                    draggedItem = null;
                    updateNumbers();
                }
            });

            // 拖拽经过
            container.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                const target = e.target.closest('.lda-sort-item');
                if (target && target !== draggedItem) {
                    container.querySelectorAll('.lda-sort-item').forEach(item => {
                        item.classList.remove('drag-over');
                    });
                    target.classList.add('drag-over');
                }
            });

            // 放置
            container.addEventListener('drop', (e) => {
                e.preventDefault();
                const target = e.target.closest('.lda-sort-item');
                if (target && target !== draggedItem && draggedItem) {
                    const items = [...container.querySelectorAll('.lda-sort-item')];
                    const draggedIdx = items.indexOf(draggedItem);
                    const targetIdx = items.indexOf(target);

                    if (draggedIdx < targetIdx) {
                        target.after(draggedItem);
                    } else {
                        target.before(draggedItem);
                    }
                    updateNumbers();
                }
            });

            // ===== 移动端：触摸长按拖拽 =====
            let touchDragItem = null;
            let longPressTimer = null;
            let touchStartY = 0;
            let isTouchDragging = false;
            const LONG_PRESS_DELAY = 400; // 长按触发时间（毫秒）

            // 触摸开始
            container.addEventListener('touchstart', (e) => {
                const item = e.target.closest('.lda-sort-item');
                if (!item) return;

                touchStartY = e.touches[0].clientY;
                touchDragItem = item;

                // 启动长按计时器
                longPressTimer = setTimeout(() => {
                    if (touchDragItem) {
                        isTouchDragging = true;
                        touchDragItem.classList.add('dragging');
                        // 阻止页面滚动
                        container.style.touchAction = 'none';
                        // 触觉反馈（如果浏览器支持）
                        if (navigator.vibrate) navigator.vibrate(30);
                    }
                }, LONG_PRESS_DELAY);
            }, { passive: true });

            // 触摸移动
            container.addEventListener('touchmove', (e) => {
                // 如果还没进入拖拽模式，检查是否是滚动操作
                if (!isTouchDragging) {
                    const moveY = Math.abs(e.touches[0].clientY - touchStartY);
                    // 如果移动超过10px，认为是滚动，取消长按
                    if (moveY > 10) {
                        clearTimeout(longPressTimer);
                        longPressTimer = null;
                        touchDragItem = null;
                    }
                    return;
                }

                // 拖拽模式下
                e.preventDefault();
                const touch = e.touches[0];
                const target = document.elementFromPoint(touch.clientX, touch.clientY);
                const targetItem = target?.closest('.lda-sort-item');

                // 清除所有 drag-over 样式
                container.querySelectorAll('.lda-sort-item').forEach(item => {
                    item.classList.remove('drag-over');
                });

                // 高亮目标位置
                if (targetItem && targetItem !== touchDragItem) {
                    targetItem.classList.add('drag-over');
                }
            }, { passive: false });

            // 触摸结束
            container.addEventListener('touchend', (e) => {
                clearTimeout(longPressTimer);
                longPressTimer = null;

                if (isTouchDragging && touchDragItem) {
                    // 找到最后高亮的目标
                    const targetItem = container.querySelector('.lda-sort-item.drag-over');
                    if (targetItem && targetItem !== touchDragItem) {
                        const items = [...container.querySelectorAll('.lda-sort-item')];
                        const draggedIdx = items.indexOf(touchDragItem);
                        const targetIdx = items.indexOf(targetItem);

                        if (draggedIdx < targetIdx) {
                            targetItem.after(touchDragItem);
                        } else {
                            targetItem.before(touchDragItem);
                        }
                        updateNumbers();
                    }

                    // 清理状态
                    touchDragItem.classList.remove('dragging');
                    container.querySelectorAll('.lda-sort-item').forEach(item => {
                        item.classList.remove('drag-over');
                    });
                    container.style.touchAction = '';
                }

                touchDragItem = null;
                isTouchDragging = false;
            }, { passive: true });

            // 触摸取消
            container.addEventListener('touchcancel', () => {
                clearTimeout(longPressTimer);
                longPressTimer = null;

                if (touchDragItem) {
                    touchDragItem.classList.remove('dragging');
                }
                container.querySelectorAll('.lda-sort-item').forEach(item => {
                    item.classList.remove('drag-over');
                });
                container.style.touchAction = '';

                touchDragItem = null;
                isTouchDragging = false;
            }, { passive: true });

            // 保存按钮
            saveBtn.onclick = (e) => {
                e.stopPropagation();
                const wasOpen = this.dom.panel.style.display === 'flex';
                const items = container.querySelectorAll('.lda-sort-item');
                const newOrder = [...items].map(item => item.dataset.key);
                this.state.tabOrder = newOrder;
                Utils.set(CONFIG.KEYS.TAB_ORDER, newOrder);

                // 显示保存成功
                saveBtn.textContent = this.t('tab_order_saved');
                saveBtn.classList.add('saved');
                setTimeout(() => {
                    saveBtn.textContent = this.t('tab_order_save');
                    saveBtn.classList.remove('saved');
                }, 1500);

                // 重新渲染应用新顺序
                this.dom.root.remove();
                this.init(wasOpen);
            };
        }

        bindGlobalEvents() {
            Utils.el('#lda-btn-close').onclick = () => this.togglePanel(false);
            Utils.el('#lda-btn-update').onclick = (e) => { e.stopPropagation(); this.checkUpdate({ isAuto: false, force: true }); };

            // 点击页面其他地方收起面板
            document.addEventListener('click', (e) => {
                if (!this.dom.root.contains(e.target) && this.dom.panel.style.display === 'flex') {
                    this.togglePanel(false);
                }
            });

            this.dom.tabs.forEach(t => t.onclick = () => {
                this.dom.tabs.forEach(x => x.classList.remove('active'));
                Utils.els('.lda-page', this.dom.root).forEach(x => x.classList.remove('active'));
                t.classList.add('active');
                Utils.el(`#page-${t.dataset.target}`, this.dom.root).classList.add('active');
                this.activePage = t.dataset.target;
                this.refreshSlowTipForPage(this.activePage);
            });

            this.dom.setting.onclick = (e) => {
                e.stopPropagation();
                const wasOpen = this.dom.panel.style.display === 'flex';
                const langNode = e.target.closest('#grp-lang .lda-seg-item');
                if (langNode && langNode.dataset.v !== this.state.lang) {
                    this.state.lang = langNode.dataset.v;
                    Utils.set(CONFIG.KEYS.LANG, this.state.lang);
                    this.dom.root.remove();
                    this.init(wasOpen);
                    return;
                }
                const sizeNode = e.target.closest('#grp-size .lda-seg-item');
                if (sizeNode) {
                    this.state.height = sizeNode.dataset.v;
                    Utils.set(CONFIG.KEYS.HEIGHT, this.state.height);
                    this.applyHeight();
                    this.renderSettings();
                }
                const refreshNode = e.target.closest('#grp-refresh .lda-seg-item');
                if (refreshNode) {
                    this.state.refreshInterval = Number(refreshNode.dataset.v);
                    Utils.set(CONFIG.KEYS.REFRESH_INTERVAL, this.state.refreshInterval);
                    this.renderSettings();
                    this.startAutoRefreshTimer();
                }
                if (e.target.id === 'inp-expand') {
                    this.state.expand = e.target.checked;
                    Utils.set(CONFIG.KEYS.EXPAND, e.target.checked);
                }
                if (e.target.id === 'inp-gain-anim') {
                    this.state.gainAnim = e.target.checked;
                    Utils.set(CONFIG.KEYS.GAIN_ANIM, e.target.checked);
                }
                if (e.target.id === 'inp-classic-icon') {
                    this.state.useClassicIcon = e.target.checked;
                    Utils.set(CONFIG.KEYS.USE_CLASSIC_ICON, e.target.checked);
                    this.updateBallIcon();
                    // 切换图标尺寸选项的显示/隐藏
                    const iconSizeOpt = Utils.el('#lda-icon-size-opt', this.dom.setting);
                    if (iconSizeOpt) {
                        iconSizeOpt.style.display = e.target.checked ? 'none' : '';
                    }
                    // 如果切换到小秘书模式且没有缓存，重新加载图标
                    if (!e.target.checked && !this.iconCache) {
                        this.loadSecretaryIcons().then(() => this.updateBallIcon());
                    }
                }
                const iconSizeNode = e.target.closest('#grp-icon-size .lda-seg-item');
                if (iconSizeNode) {
                    this.state.iconSize = iconSizeNode.dataset.v;
                    Utils.set(CONFIG.KEYS.ICON_SIZE, this.state.iconSize);
                    this.updateBallIcon();
                    this.renderSettings();
                }
                if (wasOpen) this.togglePanel(true);
            };

            this.dom.setting.addEventListener('input', (e) => {
                if (e.target.id === 'inp-opacity') {
                    e.stopPropagation();
                    const val = Math.max(0.5, Math.min(1, Number(e.target.value) || 1));
                    this.state.opacity = val;
                    Utils.set(CONFIG.KEYS.OPACITY, val);
                    this.applyOpacity();
                    const display = Utils.el('#val-opacity', this.dom.setting);
                    if (display) display.textContent = `${Math.round(val * 100)}%`;
                }
            });

            this.dom.themeBtn.onclick = (e) => {
                e.stopPropagation();
                const wasOpen = this.dom.panel.style.display === 'flex';
                const modes = ['auto', 'light', 'dark'];
                this.state.theme = modes[(modes.indexOf(this.state.theme) + 1) % 3];
                Utils.set(CONFIG.KEYS.THEME, this.state.theme);
                this.applyTheme();
                this.updateThemeIcon();
                if (wasOpen) this.togglePanel(true);
            };

            // 窗口获得焦点时自动刷新（用户授权后回来）
            window.addEventListener('focus', () => this.refreshOnFocusIfNeeded());

            window.addEventListener('resize', () => {
                this.updatePanelSide();
            });

            this.initDrag();
        }

        renderFromCacheAll() {
            if (this.trustData) this.renderTrust(this.trustData);
            if (this.creditData) this.renderCredit(this.creditData);
            if (this.cdkCache?.data) this.renderCDKContent(this.cdkCache.data);
        }

        prewarmAll() {
            // 只在没有缓存数据时才后台刷新，避免重复请求
            if (!this.trustData) this.refreshTrust({ background: true, force: false });
            if (!this.creditData) this.refreshCredit({ background: true, force: false });
            if (!this.cdkCache?.data) this.refreshCDK({ background: true, force: false });
        }

        isPageActive(page) {
            return this.dom.panel?.style.display === 'flex' && this.activePage === page;
        }

        beginWait(page, onlyWhenActive = true) {
            const ps = this.pendingStatus[page];
            ps.count += 1;
            if (!ps.since) ps.since = Date.now();
            const shouldTimer = !onlyWhenActive || this.isPageActive(page);
            if (!ps.timer && shouldTimer) {
                const wait = Math.max(0, 5000 - (Date.now() - ps.since));
                ps.timer = setTimeout(() => this.showSlowTip(page), wait);
            }
            return () => this.finishWait(page, onlyWhenActive);
        }

        finishWait(page, onlyWhenActive = true) {
            const ps = this.pendingStatus[page];
            ps.count = Math.max(0, ps.count - 1);
            if (ps.count === 0) {
                this.clearSlowTip(page);
                ps.since = null;
            }
            if (ps.count > 0 && (!ps.timer) && (!onlyWhenActive || this.isPageActive(page))) {
                const wait = Math.max(0, 5000 - (Date.now() - ps.since));
                ps.timer = setTimeout(() => this.showSlowTip(page), wait);
            }
        }

        showSlowTip(page) {
            const ps = this.pendingStatus[page];
            if (ps.timer) {
                clearTimeout(ps.timer);
                ps.timer = null;
            }
            if (!this.isPageActive(page)) return;
            const el = Utils.el(`.lda-slow-tip[data-page="${page}"]`, this.dom.root);
            if (el) {
                el.textContent = this.t('slow_tip');
                el.style.display = 'block';
            }
            ps.slowShown = true;
        }

        clearSlowTip(page) {
            const ps = this.pendingStatus[page];
            if (ps.timer) {
                clearTimeout(ps.timer);
                ps.timer = null;
            }
            const el = Utils.el(`.lda-slow-tip[data-page="${page}"]`, this.dom.root);
            if (el) el.style.display = 'none';
            ps.slowShown = false;
        }

        refreshSlowTipForPage(page) {
            const ps = this.pendingStatus[page];
            if (ps.count > 0) {
                const wait = Math.max(0, 5000 - (Date.now() - (ps.since || Date.now())));
                if (ps.timer) clearTimeout(ps.timer);
                ps.timer = setTimeout(() => this.showSlowTip(page), wait);
            } else {
                this.clearSlowTip(page);
            }
        }

        makeUserSig(info) {
            if (!info) return null;
            if (info.username) return `uname:${info.username}`;
            if (info.user?.username) return `uname:${info.user.username}`;
            if (info.user_id || info.id) return `uid:${info.user_id || info.id}`;
            return null;
        }

        ensureUserSig(sig) {
            if (!sig) {
                // 退出登录或无法识别用户：清空与账号相关的缓存，避免“旧账号数据残留”
                if (this.userSig) {
                    this.trustData = null;
                    this.creditData = null;
                    this.cdkCache = null;
                    this.state.trustCache = {};
                    this.lastFetch = { trust: 0, credit: 0, cdk: 0 };
                    Utils.set(CONFIG.KEYS.CACHE_TRUST, {});
                    Utils.set(CONFIG.KEYS.CACHE_TRUST_DATA, null);
                    Utils.set(CONFIG.KEYS.CACHE_CREDIT_DATA, null);
                    Utils.set(CONFIG.KEYS.CACHE_CDK, null);
                    Utils.set(CONFIG.KEYS.CACHE_META, this.lastFetch);
                }
                this.userSig = null;
                Utils.set(CONFIG.KEYS.USER_SIG, null);
                return;
            }
            if (this.userSig && this.userSig !== sig) {
                // 账号切换：清空与账号相关的缓存（参考 v4 策略）
                this.trustData = null;
                this.creditData = null;
                this.cdkCache = null;
                this.state.trustCache = {};
                this.lastFetch = { trust: 0, credit: 0, cdk: 0 };
                Utils.set(CONFIG.KEYS.CACHE_TRUST, {});
                Utils.set(CONFIG.KEYS.CACHE_TRUST_DATA, null);
                Utils.set(CONFIG.KEYS.CACHE_CREDIT_DATA, null);
                Utils.set(CONFIG.KEYS.CACHE_CDK, null);
                Utils.set(CONFIG.KEYS.CACHE_META, this.lastFetch);
            }
            this.userSig = sig;
            Utils.set(CONFIG.KEYS.USER_SIG, sig);
        }


        ensureStorageSchema() {
            const ver = Utils.get(CONFIG.KEYS.CACHE_SCHEMA, 0);
            if (ver !== CONFIG.CACHE_SCHEMA_VERSION) {
                // 缓存结构变更/旧版本残留：仅清空“数据缓存”，保留用户设置（主题、位置等）
                this.trustData = null;
                this.creditData = null;
                this.cdkCache = null;
                this.state.trustCache = {};
                this.lastFetch = { trust: 0, credit: 0, cdk: 0 };
                Utils.set(CONFIG.KEYS.CACHE_TRUST, {});
                Utils.set(CONFIG.KEYS.CACHE_TRUST_DATA, null);
                Utils.set(CONFIG.KEYS.CACHE_CREDIT_DATA, null);
                Utils.set(CONFIG.KEYS.CACHE_CDK, null);
                Utils.set(CONFIG.KEYS.CACHE_META, this.lastFetch);
                Utils.set(CONFIG.KEYS.CACHE_SCHEMA, CONFIG.CACHE_SCHEMA_VERSION);
            }
        }

        validateLoadedCache() {
            // lastFetch 兜底
            if (!this.lastFetch || typeof this.lastFetch !== 'object') {
                this.lastFetch = { trust: 0, credit: 0, cdk: 0 };
            } else {
                ['trust', 'credit', 'cdk'].forEach(k => {
                    if (!Number.isFinite(this.lastFetch[k])) this.lastFetch[k] = 0;
                });
            }

            // trustData 结构校验
            const basic = this.trustData?.basic;
            const trustOk = !!(basic && basic.level !== undefined && Array.isArray(basic.items));
            if (!trustOk) {
                this.trustData = null;
                this.lastFetch.trust = 0;
                Utils.set(CONFIG.KEYS.CACHE_TRUST_DATA, null);
            }

            // creditData 结构校验（避免旧缓存导致“尚未登录/需授权”误判）
            const info = this.creditData?.info;
            const creditOk = !!(info && info.available_balance !== undefined && info.remain_quota !== undefined);
            if (!creditOk) {
                this.creditData = null;
                this.lastFetch.credit = 0;
                Utils.set(CONFIG.KEYS.CACHE_CREDIT_DATA, null);
            }

            // cdkCache 结构校验（兼容旧缓存直接存 data 的情况）
            const cdkOk = !!(this.cdkCache && typeof this.cdkCache === 'object' && this.cdkCache.data && Number.isFinite(this.cdkCache.ts));
            if (!cdkOk) {
                if (this.cdkCache && typeof this.cdkCache === 'object' && !('data' in this.cdkCache) && !('ts' in this.cdkCache)) {
                    this.cdkCache = { ts: 0, data: this.cdkCache };
                    Utils.set(CONFIG.KEYS.CACHE_CDK, this.cdkCache);
                } else {
                    this.cdkCache = null;
                    this.lastFetch.cdk = 0;
                    Utils.set(CONFIG.KEYS.CACHE_CDK, null);
                }
            }

            Utils.set(CONFIG.KEYS.CACHE_META, this.lastFetch);
        }

        // ===== 小秘书图标缓存管理 =====
        hasValidIconCache() {
            return !!(this.iconCache && this.iconCache.version === SECRETARY_ICONS.version && this.iconCache.normal && this.iconCache.hover);
        }

        async loadSecretaryIcons() {
            // 如果使用经典图标，不需要加载
            if (this.state.useClassicIcon) return false;

            // 检查缓存是否有效
            if (this.hasValidIconCache()) {
                return true; // 缓存有效
            }

            // 需要重新下载并缓存
            try {
                const [normalBase64, hoverBase64] = await Promise.all([
                    this.fetchImageAsBase64(SECRETARY_ICONS.normal),
                    this.fetchImageAsBase64(SECRETARY_ICONS.hover)
                ]);

                if (normalBase64 && hoverBase64) {
                    this.iconCache = {
                        version: SECRETARY_ICONS.version,
                        normal: normalBase64,
                        hover: hoverBase64
                    };
                    Utils.set(CONFIG.KEYS.ICON_CACHE, this.iconCache);
                    return true; // 下载成功
                }
            } catch (err) {
                console.warn('[LDA] 小秘书图标加载失败', err);
            }
            return false; // 下载失败
        }

        fetchImageAsBase64(url) {
            return new Promise((resolve) => {
                GM_xmlhttpRequest({
                    method: 'GET',
                    url: url,
                    responseType: 'blob',
                    onload: (response) => {
                        if (response.status === 200 && response.response) {
                            const reader = new FileReader();
                            reader.onloadend = () => resolve(reader.result);
                            reader.onerror = () => resolve(null);
                            reader.readAsDataURL(response.response);
                        } else {
                            resolve(null);
                        }
                    },
                    onerror: () => resolve(null),
                    ontimeout: () => resolve(null)
                });
            });
        }

        getSecretaryIconUrl(type) {
            // type: 'normal' | 'hover'
            if (this.iconCache && this.iconCache[type]) {
                return this.iconCache[type];
            }
            return type === 'normal' ? SECRETARY_ICONS.normal : SECRETARY_ICONS.hover;
        }

        updateBallIcon() {
            const ball = this.dom.ball;
            if (!ball) return;

            // 用户选择经典图标，或者没有有效缓存时，显示经典图标
            if (this.state.useClassicIcon || !this.hasValidIconCache()) {
                // 经典地球图标
                ball.innerHTML = `<svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>`;
                ball.classList.remove('lda-ball-secretary');
                ball.classList.add('lda-ball-classic');
                ball.style.width = '';
                ball.style.height = '';
            } else {
                // 小秘书图标（有有效缓存）
                const normalUrl = this.getSecretaryIconUrl('normal');
                const hoverUrl = this.getSecretaryIconUrl('hover');
                ball.innerHTML = `<img class="lda-ball-img lda-ball-img-normal" src="${normalUrl}" alt=""><img class="lda-ball-img lda-ball-img-hover" src="${hoverUrl}" alt="">`;
                ball.classList.remove('lda-ball-classic');
                ball.classList.add('lda-ball-secretary');
                // 设置尺寸
                const size = SECRETARY_ICON_SIZES[this.state.iconSize] || SECRETARY_ICON_SIZES.sm;
                ball.style.width = `${size}px`;
                ball.style.height = `${size}px`;
            }
        }


        startUserWatcher() {
            // 事件驱动 + 保底轮询：检测账号切换/退出，用于缓存失效与 UI 更新
            if (this.userWatchTimer) return;
            if (location.host !== 'linux.do') return;

            const tick = () => {
                const username = Utils.getCurrentUsernameFromDOM() || Utils.getCurrentUsername();
                const loginState = Utils.getLoginStateByDOM();

                if (username) {
                    const sig = this.makeUserSig({ username });
                    if (sig && this.userSig !== sig) {
                        this.ensureUserSig(sig);
                        // 账号切换后：立刻刷新缓存与 UI（面板开着时体验更好）
                        this.renderFromCacheAll();
                        this.prewarmAll();
                    }
                } else if (loginState === false) {
                    // 已明确退出登录
                    if (this.userSig) {
                        this.ensureUserSig(null);
                        this.renderFromCacheAll();
                    }
                }
            };

            // 启动时执行一次
            tick();

            // 事件驱动：窗口获得焦点时检查
            window.addEventListener('focus', tick);

            // 事件驱动：标签页切换回来时检查
            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'visible') tick();
            });

            // 事件驱动：其他标签页修改存储时检查（跨标签页登录/退出）
            window.addEventListener('storage', (e) => {
                if (e.key && (e.key.includes('session') || e.key.includes('user') || e.key.includes('login'))) {
                    tick();
                }
            });

            // 保底轮询：60秒一次，防止极端情况漏检
            this.userWatchTimer = setInterval(tick, 60000);
        }

        isExpired(type) {
            const minutes = Number.isFinite(this.state.refreshInterval) ? this.state.refreshInterval : 30;
            if (minutes <= 0) return false;
            const interval = minutes * 60 * 1000;
            return (Date.now() - (this.lastFetch[type] || 0)) > interval;
        }

        markFetch(type) {
            this.lastFetch[type] = Date.now();
            Utils.set(CONFIG.KEYS.CACHE_META, this.lastFetch);
        }

        maybeAutoCheckUpdate() {
            const now = Date.now();
            const ONE_HOUR = 60 * 60 * 1000;
            if (now - (this.lastSkipUpdate || 0) < ONE_HOUR) return;
            this.checkUpdate({ isAuto: true });
        }

        // ✅ 新：通用友好状态卡片（用于网络错误/环境问题等）
        renderStateCard(wrap, page, {
            title,
            tip,
            levelText = null,
            leftUrl = null,
            leftText = null,
            onRetry = null
        }) {
            this.focusFlags[page] = true;

            const lvlHtml = levelText !== null && levelText !== undefined
                ? `<div style="display:flex;justify-content:center;gap:8px;align-items:center;margin-bottom:10px;">
                        <span class="lda-big-lvl" style="font-size:18px;line-height:1;">Lv.${String(levelText)}</span>
                   </div>`
                : '';

            const leftBtnHtml = leftUrl
                ? `<a href="${leftUrl}" target="_blank" rel="noopener"
                        class="lda-auth-btn secondary" id="btn-go-${page}">
                        ${leftText || this.t('link_tip')} →
                   </a>`
                : '';

            wrap.innerHTML = `
                <div class="lda-card lda-auth-card">
                    <div class="lda-auth-icon">
                        <svg viewBox="0 0 24 24" width="48" height="48">
                            <path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
                        </svg>
                    </div>
                    ${lvlHtml}
                    <div class="lda-auth-title">${title}</div>
                    <div class="lda-auth-tip">${tip}</div>
                    <div class="lda-auth-btns">
                        ${leftBtnHtml}
                        <button class="lda-auth-btn" id="btn-retry-${page}">${this.t('network_error_retry')}</button>
                    </div>
                </div>
            `;

            const retryBtn = Utils.el(`#btn-retry-${page}`, wrap);
            if (retryBtn) retryBtn.onclick = (e) => {
                e.stopPropagation();
                onRetry?.();
            };

            const goBtn = Utils.el(`#btn-go-${page}`, wrap);
            if (goBtn) goBtn.onclick = () => {
                // 用户跳转出去再回来时刷新当页
                this.focusFlags[page] = true;
            };
        }

        // ===== 新增：刷新按钮状态管理 =====
        setRefreshBtnLoading(page, on) {
            const btnMap = { trust: '#btn-re-trust', credit: '#btn-re-credit', cdk: '#btn-re-cdk' };
            const selector = btnMap[page];
            if (!selector) return;
            const wrap = this.dom[page];
            if (!wrap) return;
            const btn = Utils.el(selector, wrap);
            if (btn) {
                btn.classList.toggle('loading', on);
            }
        }

        stopRefreshWithMinDuration(page, minDuration = 1000) {
            if (!this.refreshingPages[page] && !this.refreshStopPending[page]) return;
            if (this.refreshStopPending[page]) return;

            const elapsed = Date.now() - (this.refreshStartTime[page] || 0);
            const remaining = Math.max(0, minDuration - elapsed);

            const doStop = () => {
                this.refreshingPages[page] = false;
                this.refreshStopPending[page] = false;
                this.setRefreshBtnLoading(page, false);
            };

            if (remaining > 0) {
                this.refreshStopPending[page] = true;
                setTimeout(doStop, remaining);
            } else {
                doStop();
            }
        }

        // ===== 涨分动画 =====
        checkGainAndAnimate(oldGain, newGain) {
            // 首次加载或无有效数据时不触发
            if (oldGain === null || newGain === null) return;
            // 设置关闭时不触发
            if (!this.state.gainAnim) return;

            const diff = newGain - oldGain;
            // 最小触发阈值：1
            if (diff < 1) return;

            this.showGainAnimation(diff);
        }

        showGainAnimation(diff) {
            // 移除旧动画
            const oldAnim = document.querySelector('.lda-gain-anim');
            if (oldAnim) oldAnim.remove();

            const anim = document.createElement('div');
            anim.className = 'lda-gain-anim';
            anim.textContent = `+${diff.toFixed(1)}`;

            const panelVisible = this.dom.panel?.style.display === 'flex';

            if (panelVisible) {
                // 窗口模式：在窗口内顶部居中显示
                const creditHero = Utils.el('#lda-credit-hero', this.dom.credit);
                if (creditHero) {
                    anim.style.position = 'absolute';
                    anim.style.top = '50%';
                    anim.style.left = '50%';
                    anim.style.transform = 'translate(-50%, -50%) scale(0.5)';
                    creditHero.parentElement.appendChild(anim);
                } else {
                    // fallback: 面板顶部
                    anim.style.position = 'absolute';
                    anim.style.top = '10px';
                    anim.style.left = '50%';
                    anim.style.transform = 'translateX(-50%) scale(0.5)';
                    this.dom.panel.appendChild(anim);
                }
            } else {
                // 悬浮球模式：根据位置在左上/右上角显示
                const ball = this.dom.ball;
                if (!ball) return;

                const ballRect = ball.getBoundingClientRect();
                const isRightHalf = ballRect.left > window.innerWidth / 2;

                anim.style.position = 'fixed';
                anim.style.top = `${ballRect.top - 10}px`;

                if (isRightHalf) {
                    // 悬浮球在右半边，动画显示在悬浮球左侧
                    anim.style.right = `${window.innerWidth - ballRect.left + 8}px`;
                    anim.style.left = 'auto';
                } else {
                    // 悬浮球在左半边，动画显示在悬浮球右侧
                    anim.style.left = `${ballRect.right + 8}px`;
                    anim.style.right = 'auto';
                }

                document.body.appendChild(anim);
            }

            // 动画结束后移除
            setTimeout(() => anim.remove(), 1500);
        }

        // ===== 信任等级：Summary 快照（用于 lv2+ Connect 失败 fallback，以及 lv0-1 失败时的补救展示）=====
        async fetchSummaryTrustSnapshot(username, levelNum) {
            const summary = await Utils.fetchUserSummary(username);
            if (!summary) throw new Error('SummaryError');

            const fields = [
                { key: 'days_visited', nameZh: '访问天数', nameEn: 'Days visited' },
                { key: 'topics_entered', nameZh: '浏览的话题', nameEn: 'Topics entered' },
                { key: 'posts_read_count', nameZh: '已读帖子', nameEn: 'Posts read' },
                { key: 'likes_given', nameZh: '送出赞', nameEn: 'Likes given' },
                { key: 'likes_received', nameZh: '获赞', nameEn: 'Likes received' },
                { key: 'time_read', nameZh: '阅读时间', nameEn: 'Time read', unit: 'seconds' }
            ];

            const req = CONFIG.LEVEL_REQUIREMENTS[levelNum] || null;

            const items = [];
            let allPassed = true;
            const newCache = {};

            for (const f of fields) {
                const displayName = this.state.lang === 'zh' ? f.nameZh : f.nameEn;
                let currentRaw = summary[f.key] || 0;
                let currentDisplay = String(currentRaw);

                if (f.unit === 'seconds') currentDisplay = Utils.formatReadTime(currentRaw);

                let target = null;
                let targetDisplay = '-';
                if (req?.[f.key]?.target !== undefined) {
                    target = req[f.key].target;
                    targetDisplay = (req[f.key].unit === 'seconds')
                        ? Utils.formatReadTime(target)
                        : String(target);
                }

                let isGood = null;
                let pct = 0;

                if (target !== null) {
                    isGood = currentRaw >= target;
                    pct = target > 0 ? Math.min((currentRaw / target) * 100, 100) : (isGood ? 100 : 0);
                    if (!isGood) allPassed = false;
                } else {
                    // 无目标时：中性展示
                    isGood = null;
                    pct = 0;
                }

                const oldVal = this.state.trustCache[displayName];
                let diff = 0;
                if (typeof oldVal === 'number' && oldVal !== currentRaw) diff = currentRaw - oldVal;

                newCache[displayName] = currentRaw;

                items.push({
                    name: displayName,
                    current: currentDisplay,
                    target: targetDisplay,
                    isGood,
                    pct,
                    diff
                });
            }

            // 仍然缓存当前值用于 diff（即使是 fallback）
            this.state.trustCache = newCache;
            Utils.set(CONFIG.KEYS.CACHE_TRUST, newCache);

            return {
                level: String(levelNum ?? '?'),
                isPass: targetAny(req) ? allPassed : null,
                items,
                source: 'summary'
            };

            function targetAny(r) {
                if (!r) return false;
                return Object.values(r).some(x => x?.target !== undefined);
            }
        }

        // ===== 0-1级用户数据获取（使用 summary.json + 硬编码要求）=====
        async fetchLowLevelTrustData(username, currentLevel) {
            const summary = await Utils.fetchUserSummary(username);
            if (!summary) throw new Error("ParseError");

            const requirements = CONFIG.LEVEL_REQUIREMENTS[currentLevel];
            if (!requirements) throw new Error("ParseError");

            const items = [];
            const newCache = {};
            let allPassed = true;

            for (const [key, req] of Object.entries(requirements)) {
                let current = summary[key] || 0;
                let target = req.target;
                let currentDisplay = String(current);

                // 处理时间格式
                if (req.unit === 'seconds') {
                    currentDisplay = Utils.formatReadTime(current);
                }

                const isGood = current >= target;
                if (!isGood) allPassed = false;

                const oldVal = this.state.trustCache[req.name];
                let diff = 0;
                if (typeof oldVal === 'number' && oldVal !== current) {
                    diff = current - oldVal;
                }

                newCache[req.name] = current;

                let pct = target > 0 ? Math.min((current / target) * 100, 100) : (isGood ? 100 : 0);

                let targetDisplay = req.unit === 'seconds' ? Utils.formatReadTime(target) : target;

                items.push({
                    name: req.name,
                    current: currentDisplay,
                    target: targetDisplay,
                    isGood,
                    pct,
                    diff
                });
            }

            this.state.trustCache = newCache;
            Utils.set(CONFIG.KEYS.CACHE_TRUST, newCache);

            return {
                level: String(currentLevel),
                isPass: allPassed,
                items,
                source: 'summary'
            };
        }

        // ===== 2级及以上用户数据获取（使用 connect.linux.do）=====
        async fetchHighLevelTrustData(knownLevel = null) {
            const html = await Utils.request(CONFIG.API.TRUST, { withCredentials: true });
            const doc = new DOMParser().parseFromString(html, 'text/html');
            const bodyText = doc.body?.textContent || '';
            const loginHint = doc.querySelector('a[href*="/login"], form[action*="/login"], form[action*="/session"]');
            const levelNode = Array.from(doc.querySelectorAll('h1, h2, h3')).find(x => /信任|trust/i.test(x.textContent));

            if (!levelNode) {
                const possibleTable = doc.querySelector('table');
                if (loginHint || /登录|login|sign\s*in/i.test(bodyText)) throw new Error("NeedLogin");
                if (!possibleTable) throw new Error("ParseError");
            }

            const level = knownLevel !== null ? String(knownLevel) : levelNode.textContent.replace(/\D/g, '');
            const rows = Array.from(levelNode.parentElement.parentElement.querySelectorAll('tr')).slice(1);
            if (rows.length === 0) this.focusFlags.trust = true;

            const items = [];
            const newCache = {};
            const seenNames = {};
            let allPassed = true;

            rows.forEach(tr => {
                const tds = tr.querySelectorAll('td');
                if (tds.length < 3) return;

                let name = tds[0].textContent.trim().split('（')[0];
                const current = parseFloat(tds[1].textContent.replace(/,/g, ''));
                const target = parseFloat(tds[2].textContent.replace(/,/g, ''));
                const isGood = tds[1].classList.contains('text-green-500');

                if (!isGood) allPassed = false;

                if (seenNames[name]) {
                    name = name + ' (All)';
                }
                seenNames[name] = true;

                const oldVal = this.state.trustCache[name];
                let diff = 0;
                if (typeof oldVal === 'number' && oldVal !== current) {
                    diff = current - oldVal;
                }

                newCache[name] = current;

                let pct = 0;
                if (target > 0) pct = Math.min((current / target) * 100, 100);
                else if (isGood) pct = 100;

                items.push({ name, current: tds[1].textContent.trim(), target, isGood, pct, diff });
            });

            this.state.trustCache = newCache;
            Utils.set(CONFIG.KEYS.CACHE_TRUST, newCache);

            // 只有当存在数据行且所有项目都达标时，isPass 才为 true
            const isPass = items.length > 0 && allPassed;

            return { level, isPass, items, source: 'connect' };
        }

        // 生成降级提示横幅HTML
        getFallbackBannerHtml() {
            return `
                <div class="lda-fallback-banner">
                    <svg viewBox="0 0 24 24"><path fill="currentColor" d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/></svg>
                    <div class="lda-fallback-text">
                        <strong>${this.t('trust_fallback_title')}</strong><br>
                        ${this.t('trust_fallback_tip')}
                    </div>
                </div>
            `;
        }

        // 生成数据来源标签HTML
        getSourceTagHtml(source) {
            const sourceText = source === 'connect' ? 'Connect' : 'Summary';
            return `<span class="lda-source-tag">${this.t('trust_data_source')}: ${sourceText}</span>`;
        }

        // ===================== 信任级别刷新（按你要求的状态机重构） =====================
        async refreshTrust(arg = true) {
            const base = { background: false, force: undefined, manual: false };
            const opts = typeof arg === 'object' ? { ...base, ...arg } : { ...base, manual: !!arg, force: arg === false ? false : undefined };
            const manual = opts.manual;
            const forceFetch = opts.force ?? !opts.background;
            const wrap = this.dom.trust;
            const endWait = this.beginWait('trust');

            // 旋转
            this.refreshingPages.trust = true;
            this.refreshStartTime.trust = Date.now();
            this.setRefreshBtnLoading('trust', true);

            if (!wrap.innerHTML || wrap.innerHTML.trim() === '') {
                wrap.innerHTML = `<div style="text-align:center;padding:30px;color:var(--lda-dim)">${this.t('loading')}</div>`;
            }

            try {
                if (this.trustData && !forceFetch && !this.isExpired('trust')) {
                    this.renderTrust(this.trustData);
                    this.stopRefreshWithMinDuration('trust');
                    endWait();
                    return;
                }
                if (this.trustData) this.renderTrust(this.trustData);

                // ✅ 1) 登录态 / 用户名 / 当前等级 获取（多策略兜底：session → connect → DOM）
                const sessionUser = await Utils.fetchSessionUser();

                let username = sessionUser?.username
                    || Utils.getCurrentUsername()
                    || Utils.getCurrentUsernameFromDOM();

                let userTrustLevel = Number.isFinite(sessionUser?.trust_level) ? sessionUser.trust_level : null;

                // 兜底：从 connect.linux.do 欢迎语解析（参考 v4）
                if (!username || userTrustLevel === null) {
                    try {
                        const cw = await Utils.fetchConnectWelcome();
                        if (!username && cw?.username) username = cw.username;
                        if (userTrustLevel === null && cw?.trustLevel !== null && cw?.trustLevel !== undefined) userTrustLevel = cw.trustLevel;
                    } catch (_) {
                        // ignore（NeedLogin / parse error 将在下面处理）
                    }
                }

                // ✅ 未能拿到用户名：更谨慎的登录判断（session 不可用时，使用 DOM 是否存在“登录/注册”入口作为辅助）
                if (!username) {
                    const domState = Utils.getLoginStateByDOM();
                    if (domState === false) {
                        this.focusFlags.trust = true;
                        wrap.innerHTML = `
          <div class="lda-card lda-auth-card">
            <div class="lda-auth-top">
              <div class="lda-auth-icon">
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 1 3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4Z" fill="currentColor" opacity=".15"/>
                  <path d="M12 2.2 20 5.8v5.2c0 4.95-3.33 9.58-8 10.86C7.33 20.58 4 15.95 4 11V5.8l8-3.6Z" stroke="currentColor" stroke-width="1.2"/>
                  <path d="M9.4 12.4 11 14l3.6-3.8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </div>
              <div>
                <div style="font-weight:800">${this.t('trust')}</div>
                <div style="font-size:12px;color:var(--lda-dim);margin-top:2px;line-height:1.5">${this.t('trust_login_tip')}</div>
              </div>
            </div>
            <div class="lda-auth-actions">
              <button class="lda-auth-btn primary" id="btn-go-login">${this.t('trust_go_login')}</button>
              <button class="lda-auth-btn secondary" id="btn-retry-trust">${this.t('refresh')}</button>
            </div>
          </div>`;
                        const btn = Utils.el('#btn-go-login', wrap);
                        if (btn) btn.onclick = () => location.href = '/login';
                        const retry = Utils.el('#btn-retry-trust', wrap);
                        if (retry) retry.onclick = (e) => { e.stopPropagation(); this.refreshTrust(true); };
                        this.stopRefreshWithMinDuration('trust');
                        endWait();
                        return;
                    }

                    // DOM 无法确认：仍给出“刷新/前往登录”的入口
                    this.focusFlags.trust = true;
                    wrap.innerHTML = `
          <div class="lda-card lda-auth-card">
            <div class="lda-auth-top">
              <div class="lda-auth-icon">
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 1 3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4Z" fill="currentColor" opacity=".15"/>
                  <path d="M12 2.2 20 5.8v5.2c0 4.95-3.33 9.58-8 10.86C7.33 20.58 4 15.95 4 11V5.8l8-3.6Z" stroke="currentColor" stroke-width="1.2"/>
                  <path d="M9.4 12.4 11 14l3.6-3.8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </div>
              <div>
                <div style="font-weight:800">${this.t('trust')}</div>
                <div style="font-size:12px;color:var(--lda-dim);margin-top:2px;line-height:1.5">
                  ${this.t('trust_login_tip')}
                </div>
              </div>
            </div>
            <div class="lda-auth-actions">
              <button class="lda-auth-btn primary" id="btn-go-login">${this.t('trust_go_login')}</button>
              <button class="lda-auth-btn secondary" id="btn-retry-trust">${this.t('refresh')}</button>
            </div>
          </div>`;
                    const btn = Utils.el('#btn-go-login', wrap);
                    if (btn) btn.onclick = () => location.href = '/login';
                    const retry = Utils.el('#btn-retry-trust', wrap);
                    if (retry) retry.onclick = (e) => { e.stopPropagation(); this.refreshTrust(true); };
                    this.stopRefreshWithMinDuration('trust');
                    endWait();
                    return;
                }

                // ✅ 2) 已登录：拿 username + trust_level
                if (userTrustLevel === null && username) {
                    const ui = await Utils.fetchUserInfo(username);
                    userTrustLevel = ui?.trust_level ?? null;
                }
                const levelText = userTrustLevel ?? '?';
                if (username) this.ensureUserSig(this.makeUserSig({ username }));

                // 并行获取排名数据（失败不阻断）
                const statsPromise = Utils.fetchForumStats().catch(() => null);

                // ✅ 3) 状态机：
                //  - lv0-1：summary 成功 => 正常；失败 => 友好错误 UI（显示具体等级）
                //  - lv2+：connect 成功 => 正常；connect失败但summary成功 => fallback（提示+左connect右刷新）；都失败 => 友好错误 UI（左connect右刷新）
                let basic = null;

                if (userTrustLevel !== null && userTrustLevel <= 1) {
                    try {
                        basic = await this.fetchLowLevelTrustData(username, userTrustLevel);
                        basic.ui = 'normal';
                    } catch (_) {
                        this.renderStateCard(wrap, 'trust', {
                            title: this.t('network_error_title'),
                            tip: this.t('network_error_tip'),
                            levelText,
                            leftUrl: null,
                            onRetry: () => this.refreshTrust({ manual: true, force: true })
                        });
                        this.stopRefreshWithMinDuration('trust');
                        endWait();
                        return;
                    }
                } else {
                    // lv2+ 先 connect
                    try {
                        basic = await this.fetchHighLevelTrustData(userTrustLevel);
                        basic.ui = 'normal';
                    } catch (e) {
                        basic = null;
                    }

                    // connect 失败 => summary fallback
                    if (!basic) {
                        try {
                            const snap = await this.fetchSummaryTrustSnapshot(username, userTrustLevel ?? 2);
                            basic = {
                                ...snap,
                                ui: 'fallback',
                                // 对齐字段
                                isPass: snap.isPass
                            };
                        } catch (_) {
                            // connect + summary 都失败 => 友好错误 UI
                            this.renderStateCard(wrap, 'trust', {
                                title: this.t('network_error_title'),
                                tip: this.t('network_error_tip'),
                                levelText,
                                leftUrl: CONFIG.API.LINK_TRUST,
                                leftText: this.t('connect_open'),
                                onRetry: () => this.refreshTrust({ manual: true, force: true })
                            });
                            this.stopRefreshWithMinDuration('trust');
                            endWait();
                            return;
                        }
                    }
                }

                // ✅ 4) 合并 stats
                const forumStats = await statsPromise;
                const statsData = forumStats ? {
                    dailyRank: forumStats.dailyRank || null,
                    globalRank: forumStats.globalRank || null,
                    score: forumStats.score || null
                } : null;

                // ✅ 5) 渲染并缓存
                this.trustData = { basic, stats: statsData };
                this.renderTrust(this.trustData);
                Utils.set(CONFIG.KEYS.CACHE_TRUST_DATA, this.trustData);
                this.markFetch('trust');
                if (manual) this.showToast(this.t('refresh_done'), 'success', 1500);

            } catch (e) {
                // 最外层兜底：当作网络/环境错误，但尽量给 connect + refresh
                this.renderStateCard(wrap, 'trust', {
                    title: this.t('network_error_title'),
                    tip: this.t('network_error_tip'),
                    levelText: '?',
                    leftUrl: CONFIG.API.LINK_TRUST,
                    leftText: this.t('connect_open'),
                    onRetry: () => this.refreshTrust({ manual: true, force: true })
                });
            } finally {
                this.stopRefreshWithMinDuration('trust');
                endWait();
            }
        }

        renderTrust(data) {
            const wrap = this.dom.trust;
            if (!data?.basic) {
                wrap.innerHTML = `<div style="text-align:center;padding:30px;color:var(--lda-dim)">${this.t('loading')}</div>`;
                return;
            }
            const { level, isPass, items, source, ui } = data.basic;
            const stats = data.stats || {};
            const isFallback = ui === 'fallback';
            const showConnectLink = true;

            let statsHtml = '';
            if (stats.globalRank || stats.dailyRank || stats.score) {
                statsHtml = `<a href="${CONFIG.API.LINK_LEADERBOARD}" target="_blank" class="lda-stats-bar" id="btn-go-leaderboard">`;
                if (stats.dailyRank) statsHtml += `<span class="lda-stat-item">${this.t('rank_today')}: <span class="num today">${stats.dailyRank}</span></span>`;
                if (stats.globalRank) statsHtml += `<span class="lda-stat-item">${this.t('rank')}: <span class="num rank">${stats.globalRank}</span></span>`;
                if (stats.score) statsHtml += `<span class="lda-stat-item">${this.t('score')}: <span class="num score">${Number(stats.score).toLocaleString()}</span></span>`;
                statsHtml += `</a>`;
            }

            // 顶部动作区：正常用图标；fallback 用底部大按钮（但保留图标刷新更顺手）
            let actionsHtml = `
                <div class="lda-actions-group">
                    ${showConnectLink ? `
                    <a href="${CONFIG.API.LINK_TRUST}" target="_blank" class="lda-act-btn" title="${this.t('link_tip')}" id="btn-go-connect-icon">
                        <svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M19 19H5V5h7V3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z"/></svg>
                    </a>` : ''}
                    <div class="lda-act-btn" id="btn-re-trust" title="${this.t('refresh_tip_btn')}">
                        <svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M17.65,6.35C16.2,4.9 14.21,4 12,4A8,8 0 0,0 4,12A8,8 0 0,0 12,20C15.73,20 18.84,17.45 19.73,14H17.65C16.83,16.33 14.61,18 12,18A6,6 0 0,1 6,12A6,6 0 0,1 12,6C13.66,6 15.14,6.69 16.22,7.78L13,11H20V4L17.65,6.35Z"/></svg>
                    </div>
                </div>
            `;

            let listHtml = '';
            (items || []).forEach(it => {
                let diffHtml = '';
                if (it.diff) {
                    if (it.diff > 0) diffHtml = `<span class="lda-diff up">▲${it.diff}</span>`;
                    else if (it.diff < 0) diffHtml = `<span class="lda-diff down">▼${Math.abs(it.diff)}</span>`;
                }

                // isGood: true/false/null
                let valColor = 'var(--lda-fg)';
                let fillColor = 'var(--lda-neutral)';
                let pct = Number(it.pct) || 0;

                if (it.isGood === true) { valColor = 'var(--lda-green)'; fillColor = 'var(--lda-green)'; }
                else if (it.isGood === false) { valColor = 'var(--lda-red)'; fillColor = 'var(--lda-red)'; }
                else { // null => neutral
                    valColor = 'var(--lda-fg)';
                    fillColor = 'var(--lda-neutral)';
                    pct = 100; // 中性条显示为满，但颜色更淡（表示仅展示统计，无“达标”含义）
                }

                listHtml += Utils.html`
                    <div class="lda-item">
                        <div class="lda-item-top">
                            <span class="lda-i-name">${it.name}</span>
                            <span class="lda-i-val" style="color:${valColor}">
                                ${it.current} ${diffHtml}
                                <span style="color:var(--lda-dim);font-weight:400;margin-left:4px">/ ${it.target ?? '-'}</span>
                            </span>
                        </div>
                        <div class="lda-progress"><div class="lda-fill" style="width:${pct}%; background:${fillColor}"></div></div>
                    </div>
                `;
            });


            const isCelebration = (isPass === true) && !isFallback && (items || []).length > 0;

            let bodyHtml = listHtml;
            if (isCelebration) {
                const lvlNum = Number(level);
                const target = (Number.isFinite(lvlNum) ? String(lvlNum >= 3 ? 3 : (lvlNum + 1)) : '3');
                const msg = (Number.isFinite(lvlNum) && lvlNum >= 3)
                    ? this.t('celebrate_msg_lv3')
                    : this.t('celebrate_msg_upgrade').replace('{level}', target);

                bodyHtml = Utils.html`
                    <div class="lda-celebration-wrap">
                        <div class="lda-celebration-achievement">
                            <div class="lda-celebration-icon">
                                <div class="lda-celebration-ring"></div>
                                <div class="lda-celebration-ring-outer"></div>
                                <svg viewBox="0 0 24 24" width="24" height="24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M7 4h10v2h2a1 1 0 0 1 1 1v2a5 5 0 0 1-5 5h-1.1A5.002 5.002 0 0 1 13 16.9V19h3v2H8v-2h3v-2.1A5.002 5.002 0 0 1 10.1 14H9A5 5 0 0 1 4 9V7a1 1 0 0 1 1-1h2V4Zm12 3h-2v5h1a3 3 0 0 0 3-3V7ZM7 7H5v2a3 3 0 0 0 3 3h1V7Zm2-3v8a3 3 0 0 0 3 3 3 3 0 0 0 3-3V4H9Z" fill="white"/>
                                </svg>
                            </div>
                            <div class="lda-celebration-title">${this.t('celebrate_title')}</div>
                            <div class="lda-celebration-subtitle">${this.t('celebrate_subtitle')}</div>
                            <div class="lda-celebration-message">${msg}</div>
                        </div>

                        <div class="lda-celebration-details">
                            <div class="lda-celebration-scroll">
                                ${bodyHtml}
                            </div>
                        </div>

                        <div class="lda-celebration-actions">
                            <button class="lda-auth-btn secondary" id="btn-trust-toggle-details">${this.t('btn_details')}</button>
                        </div>
                    </div>
                `;
            }

            const bannerHtml = isFallback ? this.getFallbackBannerHtml() : '';
            const sourceTag = this.getSourceTagHtml(source || 'connect');

            const badgeHtml = isFallback
                ? `<span class="lda-badge neutral">${this.t('status_fallback')}</span>`
                : `<span class="lda-badge ${(isPass === true) ? 'ok' : 'no'}">${(isPass === true) ? this.t('status_ok') : this.t('status_fail')}</span>`;

            const fallbackBtns = isFallback ? `
                <div class="lda-auth-btns" style="margin-top:14px;">
                    <a href="${CONFIG.API.LINK_TRUST}" target="_blank" rel="noopener"
                        class="lda-auth-btn secondary" id="btn-go-connect">${this.t('connect_open')} →</a>
                    <button class="lda-auth-btn" id="btn-retry-trust">${this.t('network_error_retry')}</button>
                </div>
            ` : '';

            wrap.innerHTML = Utils.html`
                <div class="lda-card">
                    ${actionsHtml}
                    <div class="lda-info-header">
                        <div class="lda-lvl-group">
                            <span class="lda-big-lvl">Lv.${level}</span>
                            ${badgeHtml}
                            ${sourceTag}
                        </div>
                    </div>
                    ${bannerHtml}
                    ${statsHtml}
                    ${bodyHtml}
                    ${fallbackBtns}
                </div>
            `;

            // 绑定按钮
            const goIcon = Utils.el('#btn-go-connect-icon', wrap);
            if (goIcon) goIcon.onclick = () => { this.focusFlags.trust = true; };

            Utils.el('#btn-re-trust', wrap).onclick = (e) => {
                e.stopPropagation();
                this.refreshTrust({ manual: true, force: true });
            };

            const goBtn = Utils.el('#btn-go-connect', wrap);
            if (goBtn) goBtn.onclick = () => { this.focusFlags.trust = true; };

            const retry = Utils.el('#btn-retry-trust', wrap);
            if (retry) retry.onclick = (e) => {
                e.stopPropagation();
                this.refreshTrust({ manual: true, force: true });
            };

            const toggle = Utils.el('#btn-trust-toggle-details', wrap);
            if (toggle) {
                toggle.onclick = (e) => {
                    e.stopPropagation();
                    const ach = Utils.el('.lda-celebration-achievement', wrap);
                    const det = Utils.el('.lda-celebration-details', wrap);
                    if (!ach || !det) return;

                    const detHidden = getComputedStyle(det).display === 'none';
                    if (detHidden) {
                        ach.style.display = 'none';
                        det.style.display = 'flex';
                        toggle.textContent = this.t('btn_collapse');
                    } else {
                        det.style.display = 'none';
                        ach.style.display = 'flex';
                        toggle.textContent = this.t('btn_details');
                    }
                };
            }


            // 如果正在刷新或等待延迟停止，保持按钮旋转状态
            if (this.refreshingPages.trust || this.refreshStopPending.trust) {
                this.setRefreshBtnLoading('trust', true);
            }
        }

        // ===================== 积分刷新：按你要求的状态机 =====================
        async refreshCredit(arg = true) {
            const base = { background: false, force: undefined, manual: false, autoRetry: true };
            const opts = typeof arg === 'object' ? { ...base, ...arg } : { ...base, manual: !!arg, force: arg === false ? false : undefined };
            const manual = opts.manual;
            const forceFetch = opts.force ?? !opts.background;
            const wrap = this.dom.credit;
            const endWait = this.beginWait('credit');

            this.refreshingPages.credit = true;
            this.refreshStartTime.credit = Date.now();
            this.setRefreshBtnLoading('credit', true);

            if (!wrap.innerHTML || wrap.innerHTML.trim() === '') {
                wrap.innerHTML = `<div style="text-align:center;padding:30px;color:var(--lda-dim)">${this.t('loading')}</div>`;
            }

            try {
                if (this.creditData && !forceFetch && !this.isExpired('credit')) {
                    this.renderCredit(this.creditData);
                    this.stopRefreshWithMinDuration('credit');
                    endWait();
                    return;
                }
                if (this.creditData) this.renderCredit(this.creditData);

                const infoPromise = Utils.request(CONFIG.API.CREDIT_INFO, { withCredentials: true });
                const statPromise = Utils.request(CONFIG.API.CREDIT_STATS, { withCredentials: true });

                let info = null;
                let stats = [];
                let gamificationScore = null;

                await Promise.all([
                    infoPromise.then(r => {
                        info = JSON.parse(r).data;
                        const sig = this.makeUserSig(info);
                        if (sig) this.ensureUserSig(sig);
                    }),
                    statPromise.then(r => {
                        stats = JSON.parse(r).data || [];
                    })
                ]);

                // 获取 gamification_score（用于计算预估涨分）
                if (info?.username) {
                    try {
                        const userRes = await Utils.request(CONFIG.API.USER_INFO(info.username), { withCredentials: true });
                        const userData = JSON.parse(userRes);
                        gamificationScore = userData?.user?.gamification_score ?? null;
                    } catch (_) { /* 忽略错误，保持 null */ }
                }

                const oldGain = this.creditData?.estimatedGain ?? null;
                // 基准值：community-balance 或 community_balance
                const communityBalance = parseFloat(info['community-balance'] ?? info.community_balance ?? 0);
                const newGain = (gamificationScore !== null && communityBalance > 0)
                    ? gamificationScore - communityBalance
                    : null;

                this.creditData = { info, stats, gamificationScore, communityBalance, estimatedGain: newGain };
                this.renderCredit(this.creditData);
                Utils.set(CONFIG.KEYS.CACHE_CREDIT_DATA, this.creditData);

                // 检测涨分变化并触发动画
                this.checkGainAndAnimate(oldGain, newGain);
                this.markFetch('credit');
                this.stopRefreshWithMinDuration('credit');
                if (manual) this.showToast(this.t('refresh_done'), 'success', 1500);
                endWait();
            } catch (e) {
                const isLogin = e?.status === 401 || e?.status === 403 || /unauthorized|not\s*login/i.test(e?.responseText || '');

                if (isLogin) {
                    // 如果已有可用缓存数据：不要强行覆盖成“未登录/需授权”，避免偶发 401 造成闪烁
                    const hasUsableCache = !!(this.creditData?.info && this.creditData.info.available_balance !== undefined);
                    if (hasUsableCache) {
                        this.focusFlags.credit = true;
                        this.showToast(this.t('credit_keep_cache_tip'));
                        try { this.renderCredit(this.creditData); } catch (_) { /* ignore */ }
                        this.stopRefreshWithMinDuration('credit');
                        endWait();
                        return;
                    }

                    this.stopRefreshWithMinDuration('credit');
                    this.focusFlags.credit = true;
                    wrap.innerHTML = `
                        <div class="lda-card lda-auth-card">
                            <div class="lda-auth-icon">
                                <svg viewBox="0 0 24 24" width="48" height="48"><path fill="currentColor" d="M12,1L3,5V11C3,16.55 6.84,21.74 12,23C17.16,21.74 21,16.55 21,11V5L12,1M12,5A3,3 0 0,1 15,8A3,3 0 0,1 12,11A3,3 0 0,1 9,8A3,3 0 0,1 12,5M17.13,17C15.92,18.85 14.11,20.24 12,20.92C9.89,20.24 8.08,18.85 6.87,17C6.53,16.5 6.24,16 6,15.47C6,13.82 8.71,12.47 12,12.47C15.29,12.47 18,13.79 18,15.47C17.76,16 17.47,16.5 17.13,17Z"/></svg>
                            </div>
                            <div class="lda-auth-title">${this.t('credit_not_auth')}</div>
                            <div class="lda-auth-tip">${this.t('credit_auth_tip')}</div>
                            <div class="lda-auth-btns">
                                <a href="${CONFIG.API.LINK_CREDIT}" target="_blank" class="lda-auth-btn" id="btn-go-credit">${this.t('credit_go_auth')} →</a>
                                <button id="btn-credit-refresh" class="lda-auth-btn secondary">${this.t('credit_refresh')}</button>
                            </div>
                        </div>
                    `;
                    Utils.el('#btn-credit-refresh', wrap).onclick = (ev) => { ev.stopPropagation(); this.refreshCredit({ manual: true, force: true }); };
                    const go = Utils.el('#btn-go-credit', wrap);
                    if (go) go.onclick = () => { this.focusFlags.credit = true; };
                    endWait();
                    return;
                }

                // ✅ 其他失败：友好网络错误 UI（左Credit右刷新）
                this.renderStateCard(wrap, 'credit', {
                    title: this.t('network_error_title'),
                    tip: this.t('network_error_tip'),
                    leftUrl: CONFIG.API.LINK_CREDIT,
                    leftText: this.t('credit_open'),
                    onRetry: () => this.refreshCredit({ manual: true, force: true })
                });

                this.stopRefreshWithMinDuration('credit');
                endWait();
            }
        }

        renderCredit(data) {
            const wrap = this.dom.credit;
            const info = data?.info;
            if (!info) {
                wrap.innerHTML = `<div style="text-align:center;padding:30px;color:var(--lda-dim)">${this.t('loading')}</div>`;
                return;
            }
            const stats = data.stats || [];
            const estimatedGain = data.estimatedGain;
            const gamificationScore = data.gamificationScore;
            const communityBalance = data.communityBalance;
            const hasGain = estimatedGain !== null && estimatedGain !== undefined;

            let listHtml = '';
            if (stats.length === 0) {
                listHtml = `<div style="text-align:center;padding:12px;color:var(--lda-dim);font-size:12px">${this.t('no_rec')}</div>`;
            } else {
                [...stats].reverse().forEach(x => {
                    const date = x.date.slice(5).replace('-', '/');
                    const inc = parseFloat(x.income);
                    const exp = parseFloat(x.expense);
                    if (inc > 0) listHtml += `<div class="lda-row-rec"><span>${date} ${this.t('income')}</span><span class="lda-amt" style="color:var(--lda-red)">+${inc}</span></div>`;
                    if (exp > 0) listHtml += `<div class="lda-row-rec"><span>${date} ${this.t('expense')}</span><span class="lda-amt" style="color:var(--lda-green)">-${exp}</span></div>`;
                });
            }

            // 预估涨分显示 + 自定义 tooltip（立即显示）
            const gainTooltipText = hasGain && gamificationScore !== null
                ? `${this.t('gain_tip')}\n${this.t('current_score')}: ${gamificationScore.toFixed(2)}\n${this.t('base_value')}: ${communityBalance?.toFixed(2) ?? '--'}`
                : this.t('gain_tip');
            const gainDisplay = hasGain
                ? `<div class="lda-credit-num lda-credit-gain">${estimatedGain >= 0 ? '+' : ''}${estimatedGain.toFixed(2)}</div>`
                : `<div class="lda-credit-num" style="color:var(--lda-dim)">--</div>`;

            wrap.innerHTML = Utils.html`
                <div class="lda-card" style="position:relative;">
                    <div class="lda-actions-group">
                        <a href="${CONFIG.API.LINK_CREDIT}" target="_blank" class="lda-act-btn" title="${this.t('link_tip')}" id="btn-go-credit-icon">
                            <svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M19 19H5V5h7V3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z"/></svg>
                        </a>
                        <div class="lda-act-btn" id="btn-re-credit" title="${this.t('refresh_tip_btn')}">
                            <svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M17.65,6.35C16.2,4.9 14.21,4 12,4A8,8 0 0,0 4,12A8,8 0 0,0 12,20C15.73,20 18.84,17.45 19.73,14H17.65C16.83,16.33 14.61,18 12,18A6,6 0 0,1 6,12A6,6 0 0,1 12,6C13.66,6 15.14,6.69 16.22,7.78L13,11H20V4L17.65,6.35Z"/></svg>
                        </div>
                    </div>
                    <div class="lda-credit-hero lda-split" id="lda-credit-hero" style="margin-top:8px;">
                        <div class="lda-credit-side">
                            <div class="lda-credit-num">${info.available_balance}</div>
                            <div class="lda-credit-label">${this.t('balance')}</div>
                            <div class="lda-credit-sub">${this.t('daily_limit')}: <span>${info.remain_quota}</span></div>
                        </div>
                        <div class="lda-credit-plus">+</div>
                        <div class="lda-credit-side lda-gain-tooltip-wrap">
                            <div class="lda-gain-tooltip">${gainTooltipText}</div>
                            ${gainDisplay}
                            <div class="lda-credit-label">${this.t('estimated_gain')}</div>
                            <div class="lda-credit-gain-tip">${this.t('gain_tip')}</div>
                        </div>
                    </div>
                </div>
                <div class="lda-card">
                    <div style="font-size:11px;font-weight:700;color:var(--lda-dim);margin-bottom:10px;">${this.t('recent')}</div>
                    ${listHtml}
                </div>
            `;
            Utils.el('#btn-re-credit', wrap).onclick = (e) => { e.stopPropagation(); this.refreshCredit({ manual: true, force: true }); };

            const goIcon = Utils.el('#btn-go-credit-icon', wrap);
            if (goIcon) goIcon.onclick = () => { this.focusFlags.credit = true; };

            if (this.refreshingPages.credit || this.refreshStopPending.credit) {
                this.setRefreshBtnLoading('credit', true);
            }
        }

        // ===================== CDK 刷新：按你要求的状态机 =====================
        async refreshCDK(arg = true) {
            const base = { background: false, force: undefined, manual: false };
            const opts = typeof arg === 'object' ? { ...base, ...arg } : { ...base, manual: !!arg, force: arg === false ? false : undefined };
            const manual = opts.manual;
            const wrap = this.dom.cdk;
            const endWait = this.beginWait('cdk');

            this.refreshingPages.cdk = true;
            this.refreshStartTime.cdk = Date.now();
            this.setRefreshBtnLoading('cdk', true);

            if (!wrap.innerHTML || wrap.innerHTML.trim() === '') {
                wrap.innerHTML = `<div style="text-align:center;padding:30px;color:var(--lda-dim)">${this.t('loading')}</div>`;
            }

            // 先展示新鲜缓存
            if (this.isCDKCacheFresh()) {
                this.renderCDKContent(this.cdkCache.data);
                if (!opts.force && !this.isExpired('cdk')) {
                    this.stopRefreshWithMinDuration('cdk');
                    endWait();
                    return;
                }
            }

            let directErr = null;
            let bridgeErr = null;

            // direct
            try {
                const info = await this.fetchCDKDirect();
                this.cacheCDKData(info);
                const sig = this.makeUserSig({ username: info.username, user_id: info.id });
                if (sig) this.ensureUserSig(sig);
                this.renderCDKContent(info);
                this.stopRefreshWithMinDuration('cdk');
                this.markFetch('cdk');
                if (manual) this.showToast(this.t('refresh_done'), 'success', 1500);
                endWait();
                return;
            } catch (e) {
                directErr = e;
            }

            // bridge
            try {
                const info = await this.fetchCDKViaBridge();
                this.cacheCDKData(info);
                const sig = this.makeUserSig({ username: info.username, user_id: info.id });
                if (sig) this.ensureUserSig(sig);
                this.renderCDKContent(info);
                this.stopRefreshWithMinDuration('cdk');
                this.markFetch('cdk');
                if (manual) this.showToast(this.t('refresh_done'), 'success', 1500);
                endWait();
                return;
            } catch (e) {
                bridgeErr = e;
            }

            this.stopRefreshWithMinDuration('cdk');

            // 如果已有缓存，就保持缓存，不覆盖为错误/未登录
            if (this.isCDKCacheFresh()) {
                endWait();
                return;
            }

            const isAuthLike = (err) => {
                if (!err) return false;
                if (err?.status === 401 || err?.status === 403) return true;
                const msg = String(err?.message || '');
                return /unauthorized|401|403|forbidden/i.test(msg);
            };

            // ✅ 状态机：未登录/未授权 vs 其他失败
            if (isAuthLike(directErr)) {
                this.renderCDKAuth();
                endWait();
                return;
            }

            // ✅ 其他失败：友好网络错误 UI（左CDK右刷新）
            this.renderStateCard(wrap, 'cdk', {
                title: this.t('network_error_title'),
                tip: this.t('network_error_tip'),
                leftUrl: CONFIG.API.LINK_CDK,
                leftText: this.t('cdk_open'),
                onRetry: () => this.refreshCDK({ manual: true, force: true })
            });

            endWait();
        }

        refreshOnFocusIfNeeded() {
            if (this.dom.panel.style.display !== 'flex') return;
            const flags = this.focusFlags;
            if (flags.trust) {
                flags.trust = false;
                this.refreshTrust({ force: true });
            }
            if (flags.credit) {
                flags.credit = false;
                this.refreshCredit({ force: true });
            }
            if (flags.cdk) {
                flags.cdk = false;
                this.refreshCDK({ force: true });
            }
        }

        startAutoRefreshTimer() {
            if (this.autoRefreshTimer) {
                clearInterval(this.autoRefreshTimer);
                this.autoRefreshTimer = null;
            }
            const minutesRaw = Number(this.state.refreshInterval);
            const minutes = Number.isFinite(minutesRaw) ? minutesRaw : 30;
            if (minutes <= 0) return;
            const interval = minutes * 60 * 1000;
            this.autoRefreshTimer = setInterval(() => {
                // 只要面板开着，就可后台刷新（原逻辑：beginWait 会控制提示）
                this.refreshTrust({ background: true, force: false });
                this.refreshCredit({ background: true, force: false });
                this.refreshCDK({ background: true, force: false });
            }, interval || AUTO_REFRESH_MS);
        }

        async fetchCDKDirect() {
            const infoRes = await Utils.request(CONFIG.API.CDK_INFO, { withCredentials: true });
            const parsed = JSON.parse(infoRes);
            if (!parsed?.data) throw new Error('no data');
            return parsed.data;
        }

        ensureCDKBridge() {
            if (this.cdkBridgeInit) return;
            this.cdkBridgeInit = true;
            window.addEventListener('message', this.onCDKMessage);
            const iframe = document.createElement('iframe');
            iframe.id = 'lda-cdk-bridge';
            iframe.src = CONFIG.API.LINK_CDK;
            iframe.style.cssText = 'width:0;height:0;opacity:0;position:absolute;border:0;pointer-events:none;';
            document.body.appendChild(iframe);
            this.cdkBridgeFrame = iframe;
        }

        fetchCDKViaBridge() {
            return new Promise((resolve, reject) => {
                this.ensureCDKBridge();
                const timer = setTimeout(() => {
                    this.cdkWaiters = this.cdkWaiters.filter(fn => fn !== done);
                    reject(new Error('cdk bridge timeout'));
                }, 5000);
                const done = (data) => {
                    clearTimeout(timer);
                    resolve(data);
                };
                this.cdkWaiters.push(done);
                try {
                    this.cdkBridgeFrame?.contentWindow?.postMessage({ type: 'lda-cdk-request' }, CDK_BRIDGE_ORIGIN);
                } catch (_) { }
            });
        }

        onCDKMessage(event) {
            if (event.origin !== CDK_BRIDGE_ORIGIN) return;
            const payload = event.data?.payload || event.data;
            if (!payload?.data) return;
            this.cacheCDKData(payload.data);
            const waiters = [...this.cdkWaiters];
            this.cdkWaiters = [];
            waiters.forEach(fn => fn(payload.data));
        }

        cacheCDKData(data) {
            this.cdkCache = { data, ts: Date.now() };
            Utils.set(CONFIG.KEYS.CACHE_CDK, this.cdkCache);
        }

        isCDKCacheFresh() {
            return this.cdkCache && (Date.now() - (this.cdkCache.ts || 0) < CDK_CACHE_TTL);
        }

        renderCDKContent(info) {
            const wrap = this.dom.cdk;
            const trustLevelNames = {
                0: { zh: '新用户', en: 'New User' },
                1: { zh: '基本用户', en: 'Basic User' },
                2: { zh: '成员', en: 'Member' },
                3: { zh: '活跃用户', en: 'Regular' },
                4: { zh: '领导者', en: 'Leader' }
            };
            const trustName = trustLevelNames[info.trust_level]?.[this.state.lang] || `Lv.${info.trust_level}`;

            wrap.innerHTML = Utils.html`
                <div class="lda-card">
                    <div class="lda-actions-group">
                        <a href="${CONFIG.API.LINK_CDK}" target="_blank" class="lda-act-btn" title="${this.t('link_tip')}" id="btn-go-cdk-icon">
                            <svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M19 19H5V5h7V3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z"/></svg>
                        </a>
                        <div class="lda-act-btn" id="btn-re-cdk" title="${this.t('refresh_tip_btn')}">
                            <svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M17.65,6.35C16.2,4.9 14.21,4 12,4A8,8 0 0,0 4,12A8,8 0 0,0 12,20C15.73,20 18.84,17.45 19.73,14H17.65C16.83,16.33 14.61,18 12,18A6,6 0 0,1 6,12A6,6 0 0,1 12,6C13.66,6 15.14,6.69 16.22,7.78L13,11H20V4L17.65,6.35Z"/></svg>
                        </div>
                    </div>
                    <div class="lda-credit-hero">
                        <div class="lda-credit-num" style="color:var(--lda-accent)">${info.score}</div>
                        <div class="lda-credit-label">${this.t('cdk_score')}</div>
                        <div style="margin-top:4px;font-size:11px;color:var(--lda-dim)">${this.t('cdk_score_desc')}</div>
                    </div>
                </div>
                <div class="lda-card">
                    <div style="font-size:11px;font-weight:700;color:var(--lda-dim);margin-bottom:10px;">用户信息</div>
                    <div class="lda-row-rec">
                        <span>${this.t('cdk_username')}</span>
                        <span class="lda-amt" style="color:var(--lda-fg)">${info.username}</span>
                    </div>
                    <div class="lda-row-rec">
                        <span>${this.t('cdk_nickname')}</span>
                        <span class="lda-amt" style="color:var(--lda-fg)">${info.nickname || '-'}</span>
                    </div>
                    <div class="lda-row-rec">
                        <span>${this.t('cdk_trust_level')}</span>
                        <span class="lda-amt" style="color:var(--lda-accent)">${trustName}</span>
                    </div>
                </div>
            `;
            Utils.el('#btn-re-cdk', wrap).onclick = (e) => { e.stopPropagation(); this.refreshCDK({ manual: true, force: true }); };

            const goIcon = Utils.el('#btn-go-cdk-icon', wrap);
            if (goIcon) goIcon.onclick = () => { this.focusFlags.cdk = true; };

            if (this.refreshingPages.cdk || this.refreshStopPending.cdk) {
                this.setRefreshBtnLoading('cdk', true);
            }
        }

        renderCDKAuth() {
            this.focusFlags.cdk = true;
            const wrap = this.dom.cdk;
            wrap.innerHTML = `
                <div class="lda-card lda-auth-card">
                    <div class="lda-auth-icon">
                        <svg viewBox="0 0 24 24" width="48" height="48"><path fill="currentColor" d="M12,1L3,5V11C3,16.55 6.84,21.74 12,23C17.16,21.74 21,16.55 21,11V5L12,1M12,5A3,3 0 0,1 15,8A3,3 0 0,1 12,11A3,3 0 0,1 9,8A3,3 0 0,1 12,5M17.13,17C15.92,18.85 14.11,20.24 12,20.92C9.89,20.24 8.08,18.85 6.87,17C6.53,16.5 6.24,16 6,15.47C6,13.82 8.71,12.47 12,12.47C15.29,12.47 18,13.79 18,15.47C17.76,16 17.47,16.5 17.13,17Z"/></svg>
                    </div>
                    <div class="lda-auth-title">${this.t('cdk_not_auth')}</div>
                    <div class="lda-auth-tip">${this.t('cdk_auth_tip')}</div>
                    <div class="lda-auth-btns">
                        <a href="${CONFIG.API.LINK_CDK}" target="_blank" class="lda-auth-btn" id="btn-go-cdk">${this.t('cdk_go_auth')} →</a>
                        <button id="btn-cdk-refresh" class="lda-auth-btn secondary">${this.t('cdk_refresh')}</button>
                    </div>
                </div>
            `;
            Utils.el('#btn-cdk-refresh', wrap).onclick = (e) => { e.stopPropagation(); this.refreshCDK({ manual: true, force: true }); };
            const go = Utils.el('#btn-go-cdk', wrap);
            if (go) go.onclick = () => { this.focusFlags.cdk = true; };
        }

        togglePanel(show) {
            this.dom.ball.style.display = show ? 'none' : 'flex';
            this.dom.panel.style.display = show ? 'flex' : 'none';
            if (show) {
                this.renderFromCacheAll();
                const needTrust = !this.trustData || this.isExpired('trust');
                const needCredit = !this.creditData || this.isExpired('credit');
                const needCDK = !this.cdkCache || this.isExpired('cdk');
                if (!this.dom.panel.dataset.loaded || needTrust || needCredit || needCDK) {
                    this.refreshTrust({ force: needTrust });
                    this.refreshCredit({ force: needCredit });
                    this.refreshCDK({ force: needCDK });
                    this.dom.panel.dataset.loaded = '1';
                }
                this.refreshSlowTipForPage(this.activePage);
            }
            if (show) this.updatePanelSide();
        }

        updatePanelSide() {
            const rect = this.dom.root.getBoundingClientRect();
            const rootWidth = rect.width || (this.dom.ball?.getBoundingClientRect().width) || 40;
            const panelWidth = this.dom.panel.getBoundingClientRect().width || 340;
            const spaceLeft = rect.left;
            const spaceRight = window.innerWidth - rect.right;

            let side = 'left';
            if (spaceRight >= panelWidth + 12) side = 'right';
            else if (spaceLeft >= panelWidth + 12) side = 'left';
            else side = spaceRight >= spaceLeft ? 'right' : 'left';

            this.dom.root.classList.toggle('lda-side-right', side === 'right');
            this.dom.root.classList.toggle('lda-side-left', side === 'left');

            const clampedLeft = Math.min(Math.max(rect.left, 0), Math.max(0, window.innerWidth - rootWidth));
            const clampedTop = Math.min(Math.max(rect.top, 0), Math.max(0, window.innerHeight - 50));
            this.dom.root.style.right = Math.max(0, window.innerWidth - clampedLeft - rootWidth) + 'px';
            this.dom.root.style.top = clampedTop + 'px';
        }

        applyTheme() {
            const { theme } = this.state;
            let isDark = (theme === 'dark');
            if (theme === 'auto') isDark = window.matchMedia('(prefers-color-scheme: dark)').matches || document.documentElement.className.includes('dark');
            this.dom.root.classList.toggle('lda-dark', isDark);
        }

        updateThemeIcon() {
            const icons = {
                light: '<svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zM2 13h2c.55 0 1-.45 1-1s-.45-1-1-1H2c-.55 0-1 .45-1 1s.45 1 1 1zm18 0h2c.55 0 1-.45 1-1s-.45-1-1-1h-2c-.55 0-1 .45-1 1s.45 1 1 1zM11 2v2c0 .55.45 1 1 1s1-.45 1-1V2c0-.55-.45-1-1-1s-1 .45-1 1zm0 18v2c0 .55.45 1 1 1s1-.45 1-1v-2c0-.55-.45-1-1-1s-1 .45-1 1zM5.99 4.58a.996.996 0 00-1.41 0 .996.996 0 000 1.41l1.06 1.06c.39.39 1.03.39 1.41 0s.39-1.03 0-1.41L5.99 4.58zm12.37 12.37a.996.996 0 00-1.41 0 .996.996 0 000 1.41l1.06 1.06c.39.39 1.03.39 1.41 0s.39-1.03 0-1.41l-1.06-1.06zm1.06-10.96a.996.996 0 000-1.41.996.996 0 00-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06zM7.05 18.36c.39-.39.39-1.03 0-1.41a.996.996 0 00-1.41 0l-1.06 1.06c-.39.39-.39 1.03 0 1.41s1.03.39 1.41 0l1.06-1.06z"/></svg>',
                dark: '<svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9 9-4.03 9-9c0-.46-.04-.92-.1-1.36-.98 1.37-2.58 2.26-4.4 2.26-2.98 0-5.4-2.42-5.4-5.4 0-1.81.89-3.42 2.26-4.4-.44-.06-.9-.1-1.36-.1z"/></svg>',
                auto: '<svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M20 18c1.1 0 1.99-.9 1.99-2L22 6c0-1.1-.9-2-2-2H4c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2H0v2h24v-2h-4zM4 6h16v10H4V6z"/></svg>'
            };
            this.dom.themeBtn.innerHTML = icons[this.state.theme];
        }

        applyHeight() {
            this.dom.panel.className = `lda-panel h-${this.state.height}`;
        }

        applyOpacity() {
            const val = Math.max(0.5, Math.min(1, Number(this.state.opacity) || 1));
            this.state.opacity = val;
            if (this.dom.root) this.dom.root.style.setProperty('--lda-opacity', val);
        }

        initDrag() {
            let isDrag = false, hasDragged = false, startX, startY, startR, startT;

            const onMove = (e) => {
                if (!isDrag) return;
                const dx = e.clientX - startX;
                const dy = e.clientY - startY;
                if (Math.abs(dx) > 5 || Math.abs(dy) > 5) hasDragged = true;
                requestAnimationFrame(() => {
                    this.dom.root.style.right = Math.max(0, startR - dx) + 'px';
                    this.dom.root.style.top = Math.max(0, Math.min(startT + dy, window.innerHeight - 50)) + 'px';
                });
            };

            const onUp = () => {
                if (isDrag) {
                    isDrag = false;
                    this.dom.ball.classList.remove('dragging');
                    document.removeEventListener('mousemove', onMove);
                    document.removeEventListener('mouseup', onUp);
                    const r = this.dom.root.getBoundingClientRect();
                    Utils.set(CONFIG.KEYS.POS, { r: window.innerWidth - r.right, t: r.top });
                    this.updatePanelSide();
                }
            };

            const startDrag = (e, target) => {
                if (e.button !== 0) return;
                if (target === this.dom.head && e.target.closest('.lda-icon-btn')) return;
                isDrag = true;
                hasDragged = false;
                startX = e.clientX;
                startY = e.clientY;
                const rect = this.dom.root.getBoundingClientRect();
                startR = window.innerWidth - rect.right;
                startT = rect.top;
                if (target === this.dom.ball) this.dom.ball.classList.add('dragging');
                document.addEventListener('mousemove', onMove);
                document.addEventListener('mouseup', onUp);
                e.preventDefault();
            };

            this.dom.ball.onmousedown = (e) => startDrag(e, this.dom.ball);

            this.dom.ball.onclick = (e) => {
                if (hasDragged) {
                    hasDragged = false;
                    e.stopPropagation();
                    return;
                }
                this.togglePanel(true);
            };

            this.dom.head.onmousedown = (e) => startDrag(e, this.dom.head);

            // 移动端触摸事件支持
            let isTouchDrag = false, hasTouchDragged = false, touchStartX, touchStartY, touchStartR, touchStartT;

            const onTouchMove = (e) => {
                if (!isTouchDrag) return;
                const touch = e.touches[0];
                const dx = touch.clientX - touchStartX;
                const dy = touch.clientY - touchStartY;
                if (Math.abs(dx) > 5 || Math.abs(dy) > 5) hasTouchDragged = true;
                if (hasTouchDragged) e.preventDefault();
                requestAnimationFrame(() => {
                    this.dom.root.style.right = Math.max(0, touchStartR - dx) + 'px';
                    this.dom.root.style.top = Math.max(0, Math.min(touchStartT + dy, window.innerHeight - 50)) + 'px';
                });
            };

            const onTouchEnd = () => {
                if (isTouchDrag) {
                    isTouchDrag = false;
                    this.dom.ball.classList.remove('dragging');
                    document.removeEventListener('touchmove', onTouchMove);
                    document.removeEventListener('touchend', onTouchEnd);
                    document.removeEventListener('touchcancel', onTouchEnd);
                    const r = this.dom.root.getBoundingClientRect();
                    Utils.set(CONFIG.KEYS.POS, { r: window.innerWidth - r.right, t: r.top });
                    this.updatePanelSide();
                    // 处理触摸点击
                    if (!hasTouchDragged) {
                        this.togglePanel(true);
                    }
                    hasTouchDragged = false;
                }
            };

            const startTouchDrag = (e, target) => {
                if (target === this.dom.head && e.target.closest('.lda-icon-btn')) return;
                const touch = e.touches[0];
                isTouchDrag = true;
                hasTouchDragged = false;
                touchStartX = touch.clientX;
                touchStartY = touch.clientY;
                const rect = this.dom.root.getBoundingClientRect();
                touchStartR = window.innerWidth - rect.right;
                touchStartT = rect.top;
                if (target === this.dom.ball) this.dom.ball.classList.add('dragging');
                document.addEventListener('touchmove', onTouchMove, { passive: false });
                document.addEventListener('touchend', onTouchEnd);
                document.addEventListener('touchcancel', onTouchEnd);
            };

            this.dom.ball.ontouchstart = (e) => startTouchDrag(e, this.dom.ball);
            this.dom.head.ontouchstart = (e) => startTouchDrag(e, this.dom.head);
        }

        restorePos() {
            const p = Utils.get(CONFIG.KEYS.POS, { r: 20, t: 100 });
            this.dom.root.style.right = p.r + 'px';
            this.dom.root.style.top = p.t + 'px';
        }

        async checkUpdate(options = {}) {
            const { isAuto = false, force = false } = options;
            const btn = Utils.el('#lda-btn-update', this.dom.root);
            const updateUrl = 'https://raw.githubusercontent.com/dongshuyan/Linuxdo-Assistant/main/Linuxdo-Assistant.user.js';
            const now = Date.now();
            const ONE_HOUR = 60 * 60 * 1000;

            if (isAuto && !force) {
                if (now - (this.lastSkipUpdate || 0) < ONE_HOUR) return;
            }

            if (btn?.classList.contains('lda-cloud-pulse')) return;
            btn?.classList.add('lda-cloud-pulse');

            // 显示检查提示（1秒后淡出）
            if (!isAuto) {
                this.showToast(this.t('checking'), 'info', 1000);
            }

            try {
                const res = await Utils.request(updateUrl);
                const match = res.match(/@version\s+([\d.]+)/);
                if (!match) throw new Error('Parse error');

                const remote = match[1];
                const current = GM_info.script.version;

                if (this.compareVersion(remote, current) > 0) {
                    this.showUpdatePrompt(remote, updateUrl);
                } else if (!isAuto) {
                    this.showToast(`✓ ${this.t('latest')} (v${current})`, 'success');
                }
            } catch (e) {
                if (!isAuto) this.showToast(this.t('update_err'), 'error');
            }

            btn?.classList.remove('lda-cloud-pulse');
            Utils.set(CONFIG.KEYS.LAST_AUTO_CHECK, now);
            this.lastAutoCheck = now;
        }

        showToast(msg, type = 'info', duration = 2500) {
            const host = this.dom?.panel || document.body;
            const toast = document.createElement('div');
            toast.style.cssText = `
                position: absolute; bottom: 14px; left: 50%; transform: translateX(-50%);
                padding: 10px 16px; border-radius: 8px; font-size: 13px; z-index: 1000000;
                background: ${type === 'success' ? 'var(--lda-green)' : type === 'error' ? 'var(--lda-red)' : 'var(--lda-accent)'};
                color: #fff; box-shadow: 0 4px 12px rgba(0,0,0,0.2); pointer-events:none;
                animation: lda-fade 0.2s; white-space: nowrap;
                transition: opacity 0.3s ease;
            `;
            toast.textContent = msg;
            host.appendChild(toast);
            setTimeout(() => {
                toast.style.opacity = '0';
                setTimeout(() => toast.remove(), 300);
            }, duration);
        }

        showUpdatePrompt(version, url) {
            const host = this.dom?.panel || document.body;
            const existing = Utils.el('#lda-update-mask', host);
            if (existing) existing.remove();
            const mask = document.createElement('div');
            mask.id = 'lda-update-mask';
            mask.style.cssText = `
                position:absolute; inset:0; background:rgba(0,0,0,0.12); z-index:1000001;
                display:flex; align-items:center; justify-content:center;
            `;
            const box = document.createElement('div');
            box.style.cssText = `
                background:var(--lda-bg); color:var(--lda-fg); border:1px solid var(--lda-border);
                border-radius:12px; padding:16px 18px; min-width:260px; box-shadow:0 10px 30px rgba(0,0,0,0.25);
            `;
            box.innerHTML = `
                <div style="font-size:14px;font-weight:700;margin-bottom:8px;color:var(--lda-accent);">发现新版本 v${version}</div>
                <div style="font-size:12px;color:var(--lda-dim);margin-bottom:14px;">是否更新到最新版本？</div>
                <div style="display:flex; gap:8px; justify-content:flex-end;">
                    <button id="lda-update-skip" style="padding:8px 12px; border:1px solid var(--lda-border); background:var(--lda-bg); border-radius:8px; cursor:pointer;">暂不更新</button>
                    <button id="lda-update-go" style="padding:8px 12px; border:none; background:var(--lda-accent); color:#fff; border-radius:8px; cursor:pointer;">立即更新</button>
                </div>
            `;
            mask.appendChild(box);
            host.appendChild(mask);
            const dispose = () => mask.remove();
            box.querySelector('#lda-update-go').onclick = (e) => {
                e.stopPropagation();
                try { window.open(url, '_blank'); } catch (_) { }
                dispose();
            };
            box.querySelector('#lda-update-skip').onclick = (e) => {
                e.stopPropagation();
                const now = Date.now();
                this.lastSkipUpdate = now;
                Utils.set(CONFIG.KEYS.LAST_SKIP_UPDATE, now);
                dispose();
            };
            mask.onclick = dispose;
            box.onclick = (e) => e.stopPropagation();
        }

        compareVersion(v1, v2) {
            const a = v1.split('.').map(Number);
            const b = v2.split('.').map(Number);
            for (let i = 0; i < Math.max(a.length, b.length); i++) {
                const n1 = a[i] || 0, n2 = b[i] || 0;
                if (n1 > n2) return 1;
                if (n1 < n2) return -1;
            }
            return 0;
        }
    }

    new App().init();
})();