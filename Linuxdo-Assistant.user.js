// ==UserScript==
// @name         Linux.do Assistant
// @namespace    https://linux.do/
// @version      1.4.0
// @description  Linux.do 仪表盘 - 信任级别进度 & 积分查看 & CDK社区分数
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
            LINK_CDK: 'https://cdk.linux.do/dashboard'
        },
        // 保持 v4 键名以维持配置
        KEYS: {
            POS: 'lda_v4_pos',
            THEME: 'lda_v4_theme',
            EXPAND: 'lda_v4_expand',
            HEIGHT: 'lda_v4_height',
            LANG: 'lda_v4_lang',
            CACHE_TRUST: 'lda_v4_cache_trust',
            TAB_ORDER: 'lda_v5_tab_order',
            CACHE_CDK: 'lda_v5_cache_cdk'
        }
    };

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
            level: "当前级别",
            status_ok: "已达标",
            status_fail: "未达标",
            balance: "当前余额",
            daily_limit: "今日剩余额度",
            recent: "近7日收支",
            no_rec: "暂无记录",
            income: "收入",
            expense: "支出",
            set_auto: "自动展开面板",
            set_lang: "界面语言",
            set_size: "面板高度",
            size_sm: "标准",
            size_lg: "加高",
            size_auto: "自适应",
            theme_tip: "点击切换：亮色 / 深色 / 跟随系统",
            link_tip: "前往网页版",
            refresh_tip: "刷新数据",
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
            cdk_score_desc: "基于徽章计算的社区信誉分"
        },
        en: {
            title: "Linux.do HUD",
            tab_trust: "Trust Level",
            tab_credit: "Credits",
            tab_cdk: "CDK Score",
            tab_setting: "Settings",
            loading: "Loading...",
            connect_err: "Connection Error / Not Logged In",
            level: "Level",
            status_ok: "Qualified",
            status_fail: "Unqualified",
            balance: "Balance",
            daily_limit: "Daily Limit",
            recent: "Recent Activity",
            no_rec: "No activity",
            income: "Income",
            expense: "Expense",
            set_auto: "Auto Expand",
            set_lang: "Language",
            set_size: "Panel Height",
            size_sm: "Small",
            size_lg: "Tall",
            size_auto: "Auto",
            theme_tip: "Toggle: Light / Dark / Auto",
            link_tip: "Open Website",
            refresh_tip: "Refresh",
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
            cdk_score_desc: "Community reputation based on badges"
        }
    };

    // 工具函数
    class Utils {
        static async request(url, options = {}) {
            const { withCredentials, ...validOptions } = options;
            return new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: 'GET', url,
                    headers: { 'Cache-Control': 'no-cache' },
                    anonymous: false, // 确保跨域请求发送 cookie
                    ...validOptions,
                    onload: r => (r.status >= 200 && r.status < 300) ? resolve(r.responseText) : reject(r),
                    onerror: e => reject(e)
                });
            });
        }
        static get(k, d) { return GM_getValue(k, d); }
        static set(k, v) { GM_setValue(k, v); }
        static html(strings, ...values) { return strings.reduce((r, s, i) => r + s + (values[i] || ''), ''); }
        static el(s, p = document) { return p.querySelector(s); }
        static els(s, p = document) { return p.querySelectorAll(s); }
        
        // 获取论坛排名数据
        static async fetchForumStats() {
            const baseUrl = window.location.origin;
            const fetchJson = (url) => fetch(url).then(r => r.json()).catch(() => null);
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
                const json = await res.json();
                if (!json?.data) return;
                Utils.set(CONFIG.KEYS.CACHE_CDK, { data: json.data, ts: Date.now() });
                try {
                    window.parent?.postMessage({ type: 'lda-cdk-data', payload: { data: json.data } }, '*');
                } catch (_) {}
            } catch (_) {}
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
            --lda-rad: 12px;
            --lda-z: 99999;
            --lda-red: #ef4444;
            --lda-green: #22c55e;
            --lda-font: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        }
        .lda-dark {
            --lda-bg: rgba(15, 23, 42, 0.94);
            --lda-fg: #f1f5f9;
            --lda-dim: #94a3b8;
            --lda-border: 1px solid rgba(255,255,255,0.08);
            --lda-shadow: 0 12px 30px -4px rgba(0, 0, 0, 0.6);
            --lda-accent: #38bdf8;
        }

        #lda-root { position: fixed; z-index: var(--lda-z); font-family: var(--lda-font); font-size: 14px; user-select: none; color: var(--lda-fg); }
        
        /* 悬浮球 */
        .lda-ball {
            width: 44px; height: 44px; background: var(--lda-accent); border-radius: 50%;
            box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4); cursor: grab;
            display: flex; align-items: center; justify-content: center; color: #fff;
            transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.2s;
        }
        .lda-ball:hover { transform: scale(1.1) rotate(10deg); box-shadow: 0 6px 20px rgba(59, 130, 246, 0.6); }
        .lda-ball.dragging { cursor: grabbing; transform: scale(1.15); box-shadow: 0 8px 25px rgba(59, 130, 246, 0.7); }
        .lda-ball svg { width: 24px; height: 24px; fill: currentColor; pointer-events: none; }

        /* 面板 */
        .lda-panel {
            width: 340px; background: var(--lda-bg); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
            border: var(--lda-border); border-radius: var(--lda-rad); box-shadow: var(--lda-shadow);
            display: none; flex-direction: column; overflow: hidden; margin-top: 14px;
            transform-origin: top right; animation: lda-in 0.25s cubic-bezier(0.2, 0.8, 0.2, 1);
        }
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
        .lda-credit-num { font-size: 28px; font-weight: 700; color: var(--lda-fg); font-family: monospace; letter-spacing: -1px; }
        .lda-credit-label { font-size: 11px; text-transform: uppercase; color: var(--lda-dim); margin-top: 4px; letter-spacing: 1px; }
        
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
        
        .lda-switch { position: relative; width: 36px; height: 20px; display: inline-block; }
        .lda-switch input { opacity: 0; width: 0; height: 0; }
        .lda-slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: #cbd5e1; transition: .3s; border-radius: 20px; }
        .lda-slider:before { position: absolute; content: ""; height: 16px; width: 16px; left: 2px; bottom: 2px; background-color: white; transition: .3s; border-radius: 50%; box-shadow: 0 1px 2px rgba(0,0,0,0.2); }
        input:checked + .lda-slider { background-color: var(--lda-accent); }
        input:checked + .lda-slider:before { transform: translateX(16px); }

        .lda-seg { display: flex; background: rgba(125,125,125,0.08); padding: 3px; border-radius: 8px; }
        .lda-seg-item { padding: 4px 10px; font-size: 11px; cursor: pointer; border-radius: 6px; color: var(--lda-dim); font-weight: 500; transition: 0.2s; }
        .lda-seg-item.active { background: var(--lda-bg); color: var(--lda-fg); box-shadow: 0 2px 5px rgba(0,0,0,0.05); font-weight: 600; }

        .lda-spin { animation: lda-spin 0.8s linear infinite; }
        @keyframes lda-spin { 100% { transform: rotate(360deg); } }

        /* 拖拽排序 */
        .lda-sortable { display: flex; flex-direction: column; gap: 6px; margin-bottom: 10px; }
        .lda-sort-item {
            display: flex; align-items: center; gap: 10px; padding: 10px 12px;
            background: var(--lda-bg); border: var(--lda-border); border-radius: 8px;
            cursor: grab; user-select: none; transition: all 0.2s;
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
                tabOrder: Utils.get(CONFIG.KEYS.TAB_ORDER, ['trust', 'credit', 'cdk']) // 标签顺序
            };
            this.cdkCache = Utils.get(CONFIG.KEYS.CACHE_CDK, null);
            this.cdkBridgeInit = false;
            this.cdkBridgeFrame = null;
            this.cdkWaiters = [];
            this.onCDKMessage = this.onCDKMessage.bind(this);
            this.dom = {};
        }

        async init() {
            GM_addStyle(Styles);
            this.renderLayout();
            this.bindGlobalEvents();
            this.applyTheme();
            this.applyHeight();
            this.restorePos();
            
            if (this.state.expand) {
                this.togglePanel(true);
            }
        }

        t(key) { return I18N[this.state.lang][key] || key; }

        renderLayout() {
            const root = document.createElement('div');
            root.id = 'lda-root';
            // 定义所有标签的映射
            const tabMap = {
                trust: { key: 'trust', label: this.t('tab_trust') },
                credit: { key: 'credit', label: this.t('tab_credit') },
                cdk: { key: 'cdk', label: this.t('tab_cdk') }
            };
            // 根据 tabOrder 获取排序后的标签
            const orderedTabs = this.state.tabOrder.map(key => tabMap[key]);
            root.innerHTML = Utils.html`
                <div class="lda-ball" title="${this.t('title')}">
                    <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>
                </div>
                <div class="lda-panel">
                    <div class="lda-head">
                        <div class="lda-title">Linux.do Assistant</div>
                        <div class="lda-actions">
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
                        <div id="page-${orderedTabs[0].key}" class="lda-page active"></div>
                        <div id="page-${orderedTabs[1].key}" class="lda-page"></div>
                        <div id="page-${orderedTabs[2].key}" class="lda-page"></div>
                        <div id="page-setting" class="lda-page"></div>
                    </div>
                </div>
            `;
            document.body.appendChild(root);

            this.dom = {
                root,
                ball: Utils.el('.lda-ball', root),
                panel: Utils.el('.lda-panel', root),
                trust: Utils.el('#page-trust', root),
                credit: Utils.el('#page-credit', root),
                cdk: Utils.el('#page-cdk', root),
                setting: Utils.el('#page-setting', root),
                themeBtn: Utils.el('#lda-btn-theme', root),
                tabs: Utils.els('.lda-tab', root),
                head: Utils.el('.lda-head', root)
            };

            this.renderSettings();
            this.updateThemeIcon();
        }

        renderSettings() {
            const { lang, height, expand, tabOrder } = this.state;
            const r = (val, cur) => val === cur ? 'active' : '';
            
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
            
            this.dom.setting.innerHTML = Utils.html`
                <div class="lda-card">
                    <div class="lda-opt">
                        <div class="lda-opt-label">${this.t('set_auto')}</div>
                        <label class="lda-switch"><input type="checkbox" id="inp-expand" ${expand?'checked':''}><span class="lda-slider"></span></label>
                    </div>
                    <div class="lda-opt">
                        <div class="lda-opt-label">${this.t('set_lang')}</div>
                        <div class="lda-seg" id="grp-lang">
                            <div class="lda-seg-item ${r('zh', lang)}" data-v="zh">中文</div>
                            <div class="lda-seg-item ${r('en', lang)}" data-v="en">EN</div>
                        </div>
                    </div>
                    <div class="lda-opt">
                        <div class="lda-opt-label">${this.t('set_size')}</div>
                        <div class="lda-seg" id="grp-size">
                            <div class="lda-seg-item ${r('sm', height)}" data-v="sm">${this.t('size_sm')}</div>
                            <div class="lda-seg-item ${r('lg', height)}" data-v="lg">${this.t('size_lg')}</div>
                            <div class="lda-seg-item ${r('auto', height)}" data-v="auto">${this.t('size_auto')}</div>
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
                <div style="text-align:center; margin-top:16px;">
                    <div style="font-size:10px; color:var(--lda-dim); opacity:0.6; margin-bottom:8px;">
                        v${GM_info.script.version} &bull; By Sauterne@Linux.do
                    </div>
                    <button id="btn-check-update" style="
                        padding: 6px 14px; font-size: 11px; cursor: pointer;
                        background: var(--lda-accent); color: #fff; border: none; border-radius: 6px;
                        transition: opacity 0.2s;
                    ">${this.t('check_update')}</button>
                    <div id="update-status" style="font-size:11px; margin-top:6px; min-height:16px;"></div>
                </div>
            `;
            
            Utils.el('#btn-check-update', this.dom.setting).onclick = () => this.checkUpdate();
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
            
            // 保存按钮
            saveBtn.onclick = () => {
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
                this.init();
            };
        }

        bindGlobalEvents() {
            // 悬浮球点击在 initDrag 中处理（区分拖动和点击）
            Utils.el('#lda-btn-close').onclick = () => this.togglePanel(false);
            
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
            });

            this.dom.setting.onclick = (e) => {
                const langNode = e.target.closest('#grp-lang .lda-seg-item');
                if (langNode && langNode.dataset.v !== this.state.lang) {
                    this.state.lang = langNode.dataset.v;
                    Utils.set(CONFIG.KEYS.LANG, this.state.lang);
                    this.dom.root.remove();
                    this.init(); 
                }
                const sizeNode = e.target.closest('#grp-size .lda-seg-item');
                if (sizeNode) {
                    this.state.height = sizeNode.dataset.v;
                    Utils.set(CONFIG.KEYS.HEIGHT, this.state.height);
                    this.applyHeight();
                    this.renderSettings();
                }
                if(e.target.id === 'inp-expand') {
                    this.state.expand = e.target.checked;
                    Utils.set(CONFIG.KEYS.EXPAND, e.target.checked);
                }
            };

            this.dom.themeBtn.onclick = () => {
                const modes = ['auto', 'light', 'dark'];
                this.state.theme = modes[(modes.indexOf(this.state.theme) + 1) % 3];
                Utils.set(CONFIG.KEYS.THEME, this.state.theme);
                this.applyTheme();
                this.updateThemeIcon();
            };

            // 窗口获得焦点时自动刷新 Credit 和 CDK（用户授权后回来）
            window.addEventListener('focus', () => {
                if (this.dom.panel.style.display === 'flex') {
                    this.refreshCredit();
                    this.refreshCDK();
                }
            });

            this.initDrag();
        }

        async refreshTrust() {
            const wrap = this.dom.trust;
            // 查找刷新按钮是否已存在，用于显示 Loading
            const existingBtn = Utils.el('#btn-re-trust', wrap);
            if(existingBtn) existingBtn.classList.add('loading');
            else wrap.innerHTML = `<div style="text-align:center;padding:30px;color:var(--lda-dim)">${this.t('loading')}</div>`;

            try {
                // 同时获取信任级别和排名数据
                const [html, forumStats] = await Promise.all([
                    Utils.request(CONFIG.API.TRUST),
                    Utils.fetchForumStats()
                ]);
                
                const doc = new DOMParser().parseFromString(html, 'text/html');
                const levelNode = Array.from(doc.querySelectorAll('h2')).find(x => x.textContent.includes('信任级别'));
                if (!levelNode) throw new Error("Need Login");

                const level = levelNode.textContent.replace(/\D/g, '');
                const isPass = levelNode.parentElement.querySelector('.text-green-500') !== null;
                const rows = Array.from(levelNode.parentElement.parentElement.querySelectorAll('tr')).slice(1);
                
                let listHtml = '';
                const newCache = {}; 
                const seenNames = {}; 

                rows.forEach(tr => {
                    const tds = tr.querySelectorAll('td');
                    if (tds.length < 3) return;
                    
                    let name = tds[0].textContent.trim().split('（')[0];
                    const current = parseFloat(tds[1].textContent.replace(/,/g, '')); 
                    const target = parseFloat(tds[2].textContent.replace(/,/g, ''));
                    const isGood = tds[1].classList.contains('text-green-500');
                    
                    if (seenNames[name]) {
                        name = name + ' (All)';
                    }
                    seenNames[name] = true;

                    // --- Diff Logic ---
                    const oldVal = this.state.trustCache[name];
                    let diffHtml = '';
                    
                    if (typeof oldVal === 'number' && oldVal !== current) {
                        const delta = current - oldVal;
                        if (delta > 0) diffHtml = `<span class="lda-diff up">▲${delta}</span>`;
                        else if (delta < 0) diffHtml = `<span class="lda-diff down">▼${Math.abs(delta)}</span>`;
                    }

                    newCache[name] = current;
                    
                    let pct = 0;
                    if (target > 0) pct = Math.min((current/target)*100, 100);
                    else if (isGood) pct = 100;

                    listHtml += Utils.html`
                        <div class="lda-item">
                            <div class="lda-item-top">
                                <span class="lda-i-name">${name}</span>
                                <span class="lda-i-val" style="color:${isGood?'var(--lda-green)':'var(--lda-red)'}">
                                    ${tds[1].textContent.trim()} ${diffHtml} <span style="color:var(--lda-dim);font-weight:400;margin-left:4px">/ ${target||'-'}</span>
                                </span>
                            </div>
                            <div class="lda-progress"><div class="lda-fill" style="width:${pct}%; background:${isGood?'var(--lda-green)':'var(--lda-red)'}"></div></div>
                        </div>
                    `;
                });

                this.state.trustCache = newCache;
                Utils.set(CONFIG.KEYS.CACHE_TRUST, newCache);

                // 构建排名统计栏
                let statsHtml = '';
                if (forumStats.globalRank || forumStats.dailyRank || forumStats.score) {
                    statsHtml = `<a href="${CONFIG.API.LINK_LEADERBOARD}" target="_blank" class="lda-stats-bar">`;
                    if (forumStats.dailyRank) statsHtml += `<span class="lda-stat-item">${this.t('rank_today')}: <span class="num today">${forumStats.dailyRank}</span></span>`;
                    if (forumStats.globalRank) statsHtml += `<span class="lda-stat-item">${this.t('rank')}: <span class="num rank">${forumStats.globalRank}</span></span>`;
                    if (forumStats.score) statsHtml += `<span class="lda-stat-item">${this.t('score')}: <span class="num score">${forumStats.score.toLocaleString()}</span></span>`;
                    statsHtml += `</a>`;
                }

                wrap.innerHTML = Utils.html`
                    <div class="lda-card">
                        <div class="lda-actions-group">
                            <a href="${CONFIG.API.LINK_TRUST}" target="_blank" class="lda-act-btn" title="${this.t('link_tip')}">
                                <svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M19 19H5V5h7V3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z"/></svg>
                            </a>
                            <div class="lda-act-btn" id="btn-re-trust" title="${this.t('refresh_tip')}">
                                <svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M17.65,6.35C16.2,4.9 14.21,4 12,4A8,8 0 0,0 4,12A8,8 0 0,0 12,20C15.73,20 18.84,17.45 19.73,14H17.65C16.83,16.33 14.61,18 12,18A6,6 0 0,1 6,12A6,6 0 0,1 12,6C13.66,6 15.14,6.69 16.22,7.78L13,11H20V4L17.65,6.35Z"/></svg>
                            </div>
                        </div>
                        <div class="lda-info-header">
                            <div class="lda-lvl-group">
                                <span class="lda-big-lvl">Lv.${level}</span>
                                <span class="lda-badge ${isPass?'ok':'no'}">${isPass ? this.t('status_ok') : this.t('status_fail')}</span>
                            </div>
                        </div>
                        ${statsHtml}
                        ${listHtml}
                    </div>
                `;
                Utils.el('#btn-re-trust', wrap).onclick = () => this.refreshTrust();

            } catch (e) {
                wrap.innerHTML = `<div class="lda-card" style="text-align:center;color:var(--lda-red)">${this.t('connect_err')}<br><button id="retry-trust" style="margin-top:8px;padding:4px 12px;">Retry</button></div>`;
                Utils.el('#retry-trust', wrap).onclick = () => this.refreshTrust();
            }
        }

        async refreshCredit() {
            const wrap = this.dom.credit;
            const existingBtn = Utils.el('#btn-re-credit', wrap);
            if(existingBtn) existingBtn.classList.add('loading');
            else wrap.innerHTML = `<div style="text-align:center;padding:30px;color:var(--lda-dim)">${this.t('loading')}</div>`;

            try {
                const [infoRes, statRes] = await Promise.all([
                    Utils.request(CONFIG.API.CREDIT_INFO, { withCredentials: true }),
                    Utils.request(CONFIG.API.CREDIT_STATS, { withCredentials: true })
                ]);
                const info = JSON.parse(infoRes).data;
                const stats = JSON.parse(statRes).data || [];
                let listHtml = '';
                if(stats.length === 0) listHtml = `<div style="text-align:center;padding:12px;color:var(--lda-dim);font-size:12px">${this.t('no_rec')}</div>`;
                else {
                    [...stats].reverse().forEach(x => {
                        const date = x.date.slice(5).replace('-','/');
                        const inc = parseFloat(x.income);
                        const exp = parseFloat(x.expense);
                        if(inc > 0) listHtml += `<div class="lda-row-rec"><span>${date} ${this.t('income')}</span><span class="lda-amt" style="color:var(--lda-red)">+${inc}</span></div>`;
                        if(exp > 0) listHtml += `<div class="lda-row-rec"><span>${date} ${this.t('expense')}</span><span class="lda-amt" style="color:var(--lda-green)">-${exp}</span></div>`;
                    });
                }
                wrap.innerHTML = Utils.html`
                    <div class="lda-card">
                        <div class="lda-actions-group">
                            <a href="${CONFIG.API.LINK_CREDIT}" target="_blank" class="lda-act-btn" title="${this.t('link_tip')}">
                                <svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M19 19H5V5h7V3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z"/></svg>
                            </a>
                            <div class="lda-act-btn" id="btn-re-credit" title="${this.t('refresh_tip')}">
                                <svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M17.65,6.35C16.2,4.9 14.21,4 12,4A8,8 0 0,0 4,12A8,8 0 0,0 12,20C15.73,20 18.84,17.45 19.73,14H17.65C16.83,16.33 14.61,18 12,18A6,6 0 0,1 6,12A6,6 0 0,1 12,6C13.66,6 15.14,6.69 16.22,7.78L13,11H20V4L17.65,6.35Z"/></svg>
                            </div>
                        </div>
                        <div class="lda-credit-hero">
                            <div class="lda-credit-num">${info.available_balance}</div>
                            <div class="lda-credit-label">${this.t('balance')}</div>
                            <div style="margin-top:6px;font-size:12px;color:var(--lda-dim)">${this.t('daily_limit')}: <span style="font-weight:600;color:var(--lda-fg)">${info.remain_quota}</span></div>
                        </div>
                    </div>
                    <div class="lda-card">
                        <div style="font-size:11px;font-weight:700;color:var(--lda-dim);margin-bottom:10px;">${this.t('recent')}</div>
                        ${listHtml}
                    </div>
                `;
                Utils.el('#btn-re-credit', wrap).onclick = () => this.refreshCredit();
            } catch(e) {
                wrap.innerHTML = `
                    <div class="lda-card lda-auth-card">
                        <div class="lda-auth-icon">
                            <svg viewBox="0 0 24 24" width="48" height="48"><path fill="currentColor" d="M12,1L3,5V11C3,16.55 6.84,21.74 12,23C17.16,21.74 21,16.55 21,11V5L12,1M12,5A3,3 0 0,1 15,8A3,3 0 0,1 12,11A3,3 0 0,1 9,8A3,3 0 0,1 12,5M17.13,17C15.92,18.85 14.11,20.24 12,20.92C9.89,20.24 8.08,18.85 6.87,17C6.53,16.5 6.24,16 6,15.47C6,13.82 8.71,12.47 12,12.47C15.29,12.47 18,13.79 18,15.47C17.76,16 17.47,16.5 17.13,17Z"/></svg>
                        </div>
                        <div class="lda-auth-title">${this.t('credit_not_auth')}</div>
                        <div class="lda-auth-tip">${this.t('credit_auth_tip')}</div>
                        <div class="lda-auth-btns">
                            <a href="${CONFIG.API.LINK_CREDIT}" target="_blank" class="lda-auth-btn">${this.t('credit_go_auth')} →</a>
                            <button id="btn-credit-refresh" class="lda-auth-btn secondary">${this.t('credit_refresh')}</button>
                        </div>
                    </div>
                `;
                Utils.el('#btn-credit-refresh', wrap).onclick = () => this.refreshCredit();
            }
        }

        async refreshCDK() {
            const wrap = this.dom.cdk;
            const existingBtn = Utils.el('#btn-re-cdk', wrap);
            const setLoading = (on) => {
                const btn = Utils.el('#btn-re-cdk', wrap);
                if (btn) btn.classList.toggle('loading', on);
            };

            if (existingBtn) setLoading(true);
            else wrap.innerHTML = `<div style="text-align:center;padding:30px;color:var(--lda-dim)">${this.t('loading')}</div>`;

            // 如果有新鲜缓存，先展示，避免空白
            if (this.isCDKCacheFresh()) {
                this.renderCDKContent(this.cdkCache.data);
            }

            // 主请求（GM），Tampermonkey 可能失败
            try {
                const info = await this.fetchCDKDirect();
                this.cacheCDKData(info);
                this.renderCDKContent(info);
                setLoading(false);
                return;
            } catch (_) {}

            // 兜底：通过隐形 iframe 在首方域取数（解决 GM 不带 cookie）
            try {
                const info = await this.fetchCDKViaBridge();
                this.cacheCDKData(info);
                this.renderCDKContent(info);
                setLoading(false);
                return;
            } catch (_) {
                setLoading(false);
                // 如果已经展示了缓存，就不覆盖为未授权提示
                if (this.isCDKCacheFresh()) return;
                this.renderCDKAuth();
            }
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
                } catch (_) {}
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
                        <a href="${CONFIG.API.LINK_CDK}" target="_blank" class="lda-act-btn" title="${this.t('link_tip')}">
                            <svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M19 19H5V5h7V3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z"/></svg>
                        </a>
                        <div class="lda-act-btn" id="btn-re-cdk" title="${this.t('refresh_tip')}">
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
            Utils.el('#btn-re-cdk', wrap).onclick = () => this.refreshCDK();
        }

        renderCDKAuth() {
            const wrap = this.dom.cdk;
            wrap.innerHTML = `
                <div class="lda-card lda-auth-card">
                    <div class="lda-auth-icon">
                        <svg viewBox="0 0 24 24" width="48" height="48"><path fill="currentColor" d="M12,1L3,5V11C3,16.55 6.84,21.74 12,23C17.16,21.74 21,16.55 21,11V5L12,1M12,5A3,3 0 0,1 15,8A3,3 0 0,1 12,11A3,3 0 0,1 9,8A3,3 0 0,1 12,5M17.13,17C15.92,18.85 14.11,20.24 12,20.92C9.89,20.24 8.08,18.85 6.87,17C6.53,16.5 6.24,16 6,15.47C6,13.82 8.71,12.47 12,12.47C15.29,12.47 18,13.79 18,15.47C17.76,16 17.47,16.5 17.13,17Z"/></svg>
                    </div>
                    <div class="lda-auth-title">${this.t('cdk_not_auth')}</div>
                    <div class="lda-auth-tip">${this.t('cdk_auth_tip')}</div>
                    <div class="lda-auth-btns">
                        <a href="${CONFIG.API.LINK_CDK}" target="_blank" class="lda-auth-btn">${this.t('cdk_go_auth')} →</a>
                        <button id="btn-cdk-refresh" class="lda-auth-btn secondary">${this.t('cdk_refresh')}</button>
                    </div>
                </div>
            `;
            Utils.el('#btn-cdk-refresh', wrap).onclick = () => this.refreshCDK();
        }

        togglePanel(show) {
            this.dom.ball.style.display = show ? 'none' : 'flex';
            this.dom.panel.style.display = show ? 'flex' : 'none';
            if (show && !this.dom.panel.dataset.loaded) {
                this.refreshTrust();
                this.refreshCredit();
                this.refreshCDK();
                this.dom.panel.dataset.loaded = '1';
            }
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

        initDrag() {
            let isDrag = false, hasDragged = false, startX, startY, startR, startT;
            
            const onMove = (e) => {
                if (!isDrag) return;
                const dx = e.clientX - startX;
                const dy = e.clientY - startY;
                // 移动超过 5px 才算拖动
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
                }
            };
            
            const startDrag = (e, target) => {
                if (e.button !== 0) return; // 只响应左键
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
            
            // 悬浮球拖动
            this.dom.ball.onmousedown = (e) => startDrag(e, this.dom.ball);
            
            // 悬浮球点击（区分拖动和点击）
            this.dom.ball.onclick = (e) => {
                if (hasDragged) {
                    hasDragged = false;
                    e.stopPropagation();
                    return;
                }
                this.togglePanel(true);
            };
            
            // 面板头部拖动
            this.dom.head.onmousedown = (e) => startDrag(e, this.dom.head);
        }

        restorePos() {
            const p = Utils.get(CONFIG.KEYS.POS, { r: 20, t: 100 });
            this.dom.root.style.right = p.r + 'px';
            this.dom.root.style.top = p.t + 'px';
        }

        async checkUpdate() {
            const btn = Utils.el('#btn-check-update', this.dom.setting);
            const status = Utils.el('#update-status', this.dom.setting);
            const updateUrl = 'https://raw.githubusercontent.com/dongshuyan/Linuxdo-Assistant/main/Linuxdo-Assistant.user.js';
            
            btn.disabled = true;
            btn.style.opacity = '0.6';
            status.innerHTML = `<span style="color:var(--lda-dim)">${this.t('checking')}</span>`;
            
            try {
                const res = await Utils.request(updateUrl);
                const match = res.match(/@version\s+([\d.]+)/);
                if (!match) throw new Error('Parse error');
                
                const remote = match[1];
                const current = GM_info.script.version;
                
                if (this.compareVersion(remote, current) > 0) {
                    status.innerHTML = `<span style="color:var(--lda-accent)">${this.t('new_version')} v${remote}</span>
                        <a href="${updateUrl}" target="_blank" style="color:var(--lda-accent);margin-left:6px;text-decoration:underline;">更新</a>`;
                } else {
                    status.innerHTML = `<span style="color:var(--lda-green)">✓ ${this.t('latest')}</span>`;
                    setTimeout(() => { status.innerHTML = ''; }, 3000);
                }
            } catch (e) {
                status.innerHTML = `<span style="color:var(--lda-red)">${this.t('update_err')}</span>`;
                setTimeout(() => { status.innerHTML = ''; }, 3000);
            }
            
            btn.disabled = false;
            btn.style.opacity = '1';
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