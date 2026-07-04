// ==UserScript==
// @name         Linux.do Assistant
// @namespace    https://linux.do/
// @version      6.5.2
// @description  Linux.do 仪表盘 - 信任级别进度 & 积分查看 & CDK社区分数 & 主页筛选工具 (支持全等级)
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

/**
 * 更新日志 v6.5.2
 * - 修复主页筛选工具「加载更多」在新版 Discourse（2026.x / Ember 6.10）上失效：
 *   新版 window.Discourse 本身即 owner（.lookup 直接可用），发现页 TopicList 在 route.currentModel.list
 *   （controller.model 为 null）。SieveModule 新增 getTopicList() 据此获取，兼容旧版；已在 linux.do 实测确认。
 * - 「加载更多」改为每次点击只加载一页（30 条），一次点击=一次请求，由用户决定是否继续，避免连续翻页触发频率限制。
 * - 新增行级 MutationObserver：新帖子行插入时在浏览器绘制前同步筛选，消除「加载时闪一下又变回」。
 * - 到底判断改用模型 canLoadMore / more_topics_url；新增滚动兜底（不依赖内部接口）。
 *
 * 更新日志 v6.5.1
 * - 默认关闭「显示每日排名」，降低 Leaderboard 接口请求频率
 * - 开启「显示每日排名」前弹出提示，提醒可能导致频繁请求
 * - 默认自动刷新频率由 30 分钟调整为 2 小时
 *
 * 历史更新：
 * v6.5.0 - 信任级别：适配 connect.linux.do 改版后的新排版；与增强版一致仅用 GM_xmlhttpRequest 直连 connect，不请求 session，避免 429；直连未返回数据时仅提示打开 Connect 后重试；文案与请求频率优化
 * v6.4.0 - 优化：自定义图标分辨率提升至512x512，与小秘书图标一致，高DPI屏幕更清晰
 * v6.3.0 - 新增：支持用户自定义上传图标（可分别设置默认图和悬停图）
 * v6.2.0 - 修复：GM_xmlhttpRequest 请求主站时添加 CSRF Token
 * v6.1.0 - 修复：float 模式下悬浮球位置超出屏幕导致不可见的问题
 * v6.0.0 - 重大更新
 * v5.16.0 - 调整：「显示每日排名」设置默认改为开启
 * v5.15.0 - 新增 API 接口调用与频率限制分析文档，README 增加完整功能说明
 * v5.14.0 - 修复内存泄漏问题，MutationObserver 添加防抖机制，筛选工具添加变化检测
 * v5.13.0 - 长按悬浮球/顶栏按钮快速返回帖子1楼、自动展开面板默认关闭
 * v5.12.0 - 修复筛选工具无限刷新、新增加载更多按钮
 * v5.10.0 - 修复请求过于频繁问题、防止iframe多实例、增加防抖和冷却机制
 * v5.8.0 - 优化：设置页拆分为"功能"和"外观"双标签页 + 字体大小调节
 * v5.7.0 - 新增：主页筛选工具 - 按等级/分类/标签筛选帖子，支持预设保存和拖拽排序
 * v5.6.0 - 优化：设置页"支持作者"改为"支持小秘书"，文案改为随机语录
 * v5.5.0 - 修复 Firefox 数据获取 + 顶栏按钮模式 + 注册天数显示
 * v5.4.0 - 修复悬浮球展开面板后位置偏移问题
 * v5.3.0 - 修复 Firefox + Tampermonkey 跨域 cookie 问题（withCredentials）
 */

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
            ICON_SIZE: 'lda_v5_icon_size',
            USE_CUSTOM_ICON: 'lda_v5_use_custom_icon',
            CUSTOM_ICON: 'lda_v5_custom_icon',
            DISPLAY_MODE: 'lda_v5_display_mode',
            // 筛选工具相关
            SIEVE_ENABLED: 'lda_v5_sieve_enabled',
            SIEVE_LEVELS: 'lda_v5_sieve_levels',
            SIEVE_CATS: 'lda_v5_sieve_cats',
            SIEVE_TAGS: 'lda_v5_sieve_tags',
            SIEVE_PRESETS: 'lda_v5_sieve_presets',
            SIEVE_PRESET_ORDER: 'lda_v5_sieve_preset_order',
            // 限流锁持久化
            RATE_LIMIT: 'lda_v5_rate_limit',
            // 排行榜上次请求时间戳（跨标签页共享）
            LEADERBOARD_LAST_FETCH: 'lda_v5_leaderboard_last_fetch',
            // 字体大小
            FONT_SIZE: 'lda_v5_font_size',
            SETTING_SUB_TAB: 'lda_v5_setting_sub_tab',
            // 是否显示每日排名（控制 Leaderboard 请求）
            SHOW_DAILY_RANK: 'lda_v5_show_daily_rank',
            // 请求频率限制（硬限制，每分钟最多 N 次，跨标签页持久化）
            REQUEST_TIMESTAMPS: 'lda_v5_request_timestamps'
        }
    };

    // 请求频率限制配置（每分钟最多 3 次/组；信任页已改为直连 connect 不占限频，429 主要因当时误用 session 导致）
    const REQUEST_LIMIT = {
        MAX_REQUESTS_PER_MINUTE: 3,
        WINDOW_MS: 60 * 1000  // 1 分钟窗口
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
    const AUTO_REFRESH_MS = 2 * 60 * 60 * 1000; // 2 小时定时刷新

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
            status_fail: "未达升级标准",
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
            set_custom_icon: "自定义图标",
            custom_icon_upload: "上传默认图",
            custom_icon_upload_hover: "上传悬停图",
            custom_icon_change: "更换",
            custom_icon_delete: "删除",
            custom_icon_delete_hover: "删除悬停图",
            custom_icon_tip: "建议使用透明背景PNG，可选上传悬停时显示的图片",
            set_icon_size: "图标大小",
            icon_size_sm: "小",
            icon_size_md: "中",
            icon_size_lg: "大",
            set_display_mode: "显示模式",
            display_mode_float: "悬浮球",
            display_mode_header: "顶栏按钮",
            set_show_header_btn: "显示顶栏按钮",
            set_show_float_icon: "显示悬浮图标",
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
            refresh_no_data: "未获取到数据",
            rate_limit_exceeded: "请求频率过高，请稍后再试",
            check_update: "检查更新",
            checking: "检查中...",
            new_version: "发现新版本",
            latest: "已是最新",
            update_err: "检查失败",
            rank_today: "今日排名",
            score: "今日积分",
            set_show_daily_rank: "显示每日排名",
            member_days: "注册天数",
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
            support_title: "支持小秘书",
            support_desc: [
                "小秘书可以来一杯咖啡吗～☕",
                "人家也想吃小蛋糕嘛～🍰",
                "主人～打赏一下小秘书呗～",
                "小秘书今天也很努力工作了哦！",
                "给小秘书买杯奶茶好不好嘛～🧋",
                "小秘书的服务还满意吗？(｡･ω･｡)",
                "哼！不打赏的话人家要生气了！",
                "主人最好了～会支持小秘书的对吧？",
                "小秘书好饿...想吃蛋糕...🎂",
                "打赏的话，小秘书会更加努力的！",
                "诶嘿嘿～主人要请客吗？(≧▽≦)",
                "小秘书的电费要靠主人啦～⚡",
                "支持一下嘛～小秘书会记住你的！💕",
                "人家每天都在认真工作呢...(눈_눈)"
            ],
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
            cdk_open: "打开 CDK",
            // 筛选工具
            set_sieve: "主页筛选工具",
            sieve_level: "等级",
            sieve_category: "分类",
            sieve_tag: "标签",
            sieve_preset: "预设",
            sieve_all: "全选",
            sieve_reset: "重置",
            sieve_save_preset: "保存",
            sieve_preset_name: "预设名称",
            sieve_preset_placeholder: "输入预设名称",
            sieve_preset_save_success: "预设已保存",
            sieve_preset_delete_confirm: "确定删除预设？",
            sieve_status_loading: "加载中...",
            sieve_status_filtering: "筛选中...",
            sieve_status_done: "筛选完毕",
            sieve_status_end: "已到底部",
            sieve_no_preset: "暂无预设",
            sieve_tip: "仅在首页生效",
            // 设置页分类
            set_func: "功能",
            set_appearance: "外观",
            set_font_size: "字体大小",
            font_size_reset: "重置",
            // 返回1楼功能
            back_to_first: "返回1楼",
            back_to_first_tip: "长按悬浮球也可返回1楼"
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
            credit_keep_cache_tip: "Credit authorization expired, showing cached data temporarily.",
            balance: "Balance",
            daily_limit: "Daily Limit",
            estimated_gain: "Est. Tomorrow",
            gain_tip: "For reference",
            current_score: "Current",
            base_value: "Base",
            set_gain_anim: "Gain Animation",
            set_classic_icon: "Classic Icon",
            set_custom_icon: "Custom Icon",
            custom_icon_upload: "Upload Default",
            custom_icon_upload_hover: "Upload Hover",
            custom_icon_change: "Change",
            custom_icon_delete: "Delete",
            custom_icon_delete_hover: "Delete Hover",
            custom_icon_tip: "PNG with transparent background, optional hover image",
            set_icon_size: "Icon Size",
            icon_size_sm: "S",
            icon_size_md: "M",
            icon_size_lg: "L",
            set_display_mode: "Display Mode",
            display_mode_float: "Float",
            display_mode_header: "Header",
            set_show_header_btn: "Show Header Button",
            set_show_float_icon: "Show Float Icon",
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
            refresh_no_data: "No data available",
            rate_limit_exceeded: "Too many requests, please try again later",
            check_update: "Check Update",
            checking: "Checking...",
            new_version: "New Version",
            latest: "Up to date",
            update_err: "Check failed",
            rank_today: "Today",
            score: "Today Score",
            set_show_daily_rank: "Show Daily Rank",
            member_days: "Days",
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
            support_title: "Support Secretary",
            support_desc: [
                "Can I have a cup of coffee? ☕",
                "I'd love a little cake~ 🍰",
                "Please support your secretary~",
                "I worked really hard today!",
                "How about some bubble tea? 🧋",
                "Are you happy with my service? (｡･ω･｡)",
                "Hmph! I'll be upset if you don't tip!",
                "You'll support me, right master~?",
                "So hungry... want cake... 🎂",
                "I'll work even harder with your support!",
                "Ehehe~ Treating me today? (≧▽≦)",
                "My electricity bill depends on you~ ⚡",
                "Support me~ I'll remember you! 💕",
                "I work hard every day you know... (눈_눈)"
            ],
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
            cdk_open: "Open CDK",
            // Sieve Tool
            set_sieve: "Homepage Sieve",
            sieve_level: "Level",
            sieve_category: "Category",
            sieve_tag: "Tag",
            sieve_preset: "Preset",
            sieve_all: "All",
            sieve_reset: "Reset",
            sieve_save_preset: "Save",
            sieve_preset_name: "Preset Name",
            sieve_preset_placeholder: "Enter preset name",
            sieve_preset_save_success: "Preset saved",
            sieve_preset_delete_confirm: "Delete this preset?",
            sieve_status_loading: "Loading...",
            sieve_status_filtering: "Filtering...",
            sieve_status_done: "Done",
            sieve_status_end: "End of list",
            sieve_no_preset: "No presets",
            sieve_tip: "Homepage only",
            // Settings sub-tabs
            set_func: "Functions",
            set_appearance: "Appearance",
            set_font_size: "Font Size",
            font_size_reset: "Reset",
            // Back to first floor
            back_to_first: "Go to OP",
            back_to_first_tip: "Long press float icon to go to OP"
        }
    };

    // 工具函数
    class Utils {
        // 【分组限流锁】每组接口独立控制 429 冷却时间戳
        // 分组：session, user, leaderboard, connect, credit, cdk
        // 初始化时从存储中恢复限流状态，支持跨页面/刷新持久化
        static rateLimitUntil = (() => {
            const defaultVal = {
                session: 0,      // fetchSessionUser - /session/current
                user: 0,         // fetchUserInfo + fetchUserSummary - /u/*.json
                leaderboard: 0,  // fetchForumStats - /leaderboard/*.json
                connect: 0,      // connect.linux.do
                credit: 0,       // credit.linux.do
                cdk: 0           // cdk.linux.do
            };
            try {
                const saved = GM_getValue(CONFIG.KEYS.RATE_LIMIT, null);
                if (saved && typeof saved === 'object') {
                    const now = Date.now();
                    // 恢复尚未过期的限流锁
                    Object.keys(defaultVal).forEach(k => {
                        if (saved[k] && saved[k] > now) {
                            defaultVal[k] = saved[k];
                        }
                    });
                }
            } catch (_) { /* 忽略读取错误 */ }
            return defaultVal;
        })();

        // 检查指定分组是否在限流冷却期内
        static isRateLimited(group) {
            return Date.now() < (Utils.rateLimitUntil[group] || 0);
        }

        // 设置指定分组的限流冷却时间
        static setRateLimit(group, retryAfterSeconds) {
            const retryAfter = Math.max(10, retryAfterSeconds);
            Utils.rateLimitUntil[group] = Date.now() + (retryAfter * 1000);
            console.warn(`[LDA] 429 限流: ${group} 组冷却 ${retryAfter}s`);
            // 持久化到存储，支持跨页面/刷新保持限流状态
            try {
                GM_setValue(CONFIG.KEYS.RATE_LIMIT, { ...Utils.rateLimitUntil });
            } catch (_) { /* 忽略写入错误 */ }
        }

        // 根据 URL 判断所属分组（用于 Utils.request 跨域请求）
        static getRateLimitGroup(url) {
            if (url.includes('connect.linux.do')) return 'connect';
            if (url.includes('credit.linux.do')) return 'credit';
            if (url.includes('cdk.linux.do')) return 'cdk';
            return null; // 同源请求在各自函数中处理
        }

        // 【排行榜独立冷却】60 秒内最多请求一次（跨标签页共享，持久化存储）
        static lastLeaderboardFetch = (() => {
            try {
                const saved = GM_getValue(CONFIG.KEYS.LEADERBOARD_LAST_FETCH, 0);
                return typeof saved === 'number' ? saved : 0;
            } catch (_) { return 0; }
        })();

        // 全局 Toast 回调（由 App 实例设置）
        static showToastCallback = null;
        static setShowToastCallback(callback) {
            Utils.showToastCallback = callback;
        }
        static showGlobalToast(message, type = 'warning', duration = 3000) {
            if (Utils.showToastCallback) {
                Utils.showToastCallback(message, type, duration);
            }
        }

        // 【请求频率硬限制】每分钟最多 N 次请求（跨标签页持久化，手动刷新也无法绕过）
        // 存储结构: { group: [timestamp1, timestamp2, ...] }
        static requestTimestamps = (() => {
            const defaultVal = {
                session: [],
                user: [],
                leaderboard: [],
                connect: [],
                credit: [],
                cdk: []
            };
            try {
                const saved = GM_getValue(CONFIG.KEYS.REQUEST_TIMESTAMPS, null);
                if (saved && typeof saved === 'object') {
                    const now = Date.now();
                    const windowMs = REQUEST_LIMIT.WINDOW_MS;
                    // 恢复并清理过期的时间戳
                    Object.keys(defaultVal).forEach(k => {
                        if (Array.isArray(saved[k])) {
                            defaultVal[k] = saved[k].filter(ts => now - ts < windowMs);
                        }
                    });
                }
            } catch (_) { /* 忽略读取错误 */ }
            return defaultVal;
        })();

        // 检查指定分组是否超过请求频率限制（最高优先级，不可绕过）
        static isRequestLimitExceeded(group) {
            const now = Date.now();
            const windowMs = REQUEST_LIMIT.WINDOW_MS;
            const maxRequests = REQUEST_LIMIT.MAX_REQUESTS_PER_MINUTE;
            
            // 从持久化存储重新读取（确保跨标签页同步）
            try {
                const saved = GM_getValue(CONFIG.KEYS.REQUEST_TIMESTAMPS, null);
                if (saved && Array.isArray(saved[group])) {
                    Utils.requestTimestamps[group] = saved[group].filter(ts => now - ts < windowMs);
                }
            } catch (_) { /* 忽略读取错误 */ }
            
            // 清理过期时间戳
            Utils.requestTimestamps[group] = (Utils.requestTimestamps[group] || []).filter(ts => now - ts < windowMs);
            
            return Utils.requestTimestamps[group].length >= maxRequests;
        }

        // 记录请求时间戳（在实际发送请求前调用）
        static recordRequest(group) {
            const now = Date.now();
            const windowMs = REQUEST_LIMIT.WINDOW_MS;
            
            // 清理过期时间戳并添加新的
            Utils.requestTimestamps[group] = (Utils.requestTimestamps[group] || []).filter(ts => now - ts < windowMs);
            Utils.requestTimestamps[group].push(now);
            
            // 持久化存储
            try {
                GM_setValue(CONFIG.KEYS.REQUEST_TIMESTAMPS, { ...Utils.requestTimestamps });
            } catch (_) { /* 忽略写入错误 */ }
        }

        // 获取下次可请求的等待时间（秒）
        static getRequestWaitTime(group) {
            const now = Date.now();
            const windowMs = REQUEST_LIMIT.WINDOW_MS;
            const maxRequests = REQUEST_LIMIT.MAX_REQUESTS_PER_MINUTE;
            
            const timestamps = (Utils.requestTimestamps[group] || []).filter(ts => now - ts < windowMs);
            if (timestamps.length < maxRequests) return 0;
            
            // 找到最早的时间戳，计算还需等待多久
            const oldest = Math.min(...timestamps);
            return Math.ceil((oldest + windowMs - now) / 1000);
        }

        // 检查多个分组的频率限制，返回第一个超限的分组名和等待时间
        static checkMultiGroupRateLimit(groups) {
            for (const group of groups) {
                if (Utils.isRequestLimitExceeded(group)) {
                    return { limited: true, group, waitTime: Utils.getRequestWaitTime(group) };
                }
            }
            return { limited: false };
        }

        static async request(url, options = {}) {
            // 【最高优先级】请求频率硬限制检查（根据 URL 判断分组）
            const group = Utils.getRateLimitGroup(url);
            if (group && Utils.isRequestLimitExceeded(group)) {
                const waitTime = Utils.getRequestWaitTime(group);
                console.warn(`[LDA] ${group} 请求频率超限，请 ${waitTime}s 后再试`);
                // Toast 由上层 refresh 函数统一显示，避免重复
                const err = new Error(`请求频率超限，请 ${waitTime}s 后再试`);
                err.rateLimitExceeded = true;
                err.waitTime = waitTime;
                throw err;
            }
            
            const { retries = 3, timeout = 8000, withCredentials = false, headers = {}, ...validOptions } = options;
            const attempts = Math.max(1, retries);
            let lastErr;
            
            // 记录请求时间戳（在实际发送请求前）
            if (group) Utils.recordRequest(group);
            
            for (let i = 0; i < attempts; i++) {
                try {
                    const res = await new Promise((resolve, reject) => {
                        // 判断是否是主站 linux.do 请求（非子域名）
                        const isMainSite = url.includes('linux.do') && 
                            !url.includes('connect.linux.do') && 
                            !url.includes('credit.linux.do') && 
                            !url.includes('cdk.linux.do');
                        
                        // 主站请求需要添加 CSRF Token 和 Discourse headers
                        const requestHeaders = isMainSite
                            ? { ...Utils.getDiscourseHeaders(), 'Cache-Control': 'no-cache', ...headers }
                            : { 'Cache-Control': 'no-cache', ...headers };
                        
                        const reqConfig = {
                            method: 'GET',
                            url,
                            headers: requestHeaders,
                            anonymous: false, // 确保跨域请求发送 cookie
                            timeout,
                            ...validOptions,
                            onload: r => (r.status >= 200 && r.status < 300) ? resolve(r.responseText) : reject(r),
                            onerror: e => reject(e),
                            ontimeout: () => reject(new Error('timeout'))
                        };
                        // Firefox + Tampermonkey 需要显式设置 withCredentials 以确保跨域 cookie 发送
                        // 主站请求也需要 withCredentials 以携带 cookie
                        if (withCredentials || isMainSite) {
                            reqConfig.withCredentials = true;
                        }
                        GM_xmlhttpRequest(reqConfig);
                    });
                    return res;
                } catch (e) {
                    // 401/403 认证错误不重试，直接抛出
                    if (e?.status === 401 || e?.status === 403) throw e;
                    // 429 请求过多：设置对应分组的冷却锁，不再重试
                    if (e?.status === 429) {
                        const retryAfter = parseInt(e?.responseHeaders?.match(/retry-after:\s*(\d+)/i)?.[1] || '60', 10);
                        const group = Utils.getRateLimitGroup(url);
                        if (group) {
                            Utils.setRateLimit(group, retryAfter);
                        }
                        throw e; // 429 直接抛出，不再重试
                    }
                    lastErr = e;
                    if (i === attempts - 1) throw lastErr;
                    // 重试前等待，避免短时间内发送大量请求（指数退避：1s, 2s, 4s...）
                    await new Promise(r => setTimeout(r, 1000 * Math.pow(2, i)));
                }
            }
            throw lastErr;
        }

        // 检查跨域请求的分组限流（在发起请求前调用）
        static isRequestRateLimited(url) {
            const group = Utils.getRateLimitGroup(url);
            return group ? Utils.isRateLimited(group) : false;
        }
        static get(k, d) { return GM_getValue(k, d); }
        static set(k, v) { GM_setValue(k, v); }
        static html(strings, ...values) { return strings.reduce((r, s, i) => r + s + (values[i] || ''), ''); }
        static el(s, p = document) { return p.querySelector(s); }
        static els(s, p = document) { return p.querySelectorAll(s); }

        // 获取 CSRF Token（从页面 meta 标签）
        static getCsrfToken() {
            const meta = document.querySelector('meta[name="csrf-token"]');
            return meta?.getAttribute('content') || '';
        }

        // 获取主站请求的标准 headers（包含 CSRF Token）
        static getDiscourseHeaders() {
            return {
                'Accept': 'application/json',
                'X-Requested-With': 'XMLHttpRequest',
                'Discourse-Logged-In': 'true',
                'Discourse-Present': 'true',
                'X-CSRF-Token': Utils.getCsrfToken()
            };
        }

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
            // 【最高优先级】请求频率硬限制检查（每分钟最多3次，不可绕过）
            if (Utils.isRequestLimitExceeded('session')) {
                const waitTime = Utils.getRequestWaitTime('session');
                console.warn(`[LDA] session 请求频率超限，请 ${waitTime}s 后再试`);
                // Toast 由上层 refresh 函数统一显示，避免重复
                return null;
            }
            // session 分组限流检查：冷却期内返回 null（安全，不抛错）
            if (Utils.isRateLimited('session')) return null;
            // 记录请求时间戳
            Utils.recordRequest('session');
            try {
                const r = await fetch('/session/current', {
                    credentials: 'include',
                    headers: Utils.getDiscourseHeaders()
                });
                // 429 处理：设置 session 分组锁
                if (r.status === 429) {
                    const retryAfter = parseInt(r.headers.get('Retry-After') || '60', 10);
                    Utils.setRateLimit('session', retryAfter);
                    return null;
                }
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

        // 从 connect.linux.do 的欢迎语中解析"用户名 + 当前等级"（支持改版前后两种排版）
        static async fetchConnectWelcome() {
            // Firefox 需要 Referer 头才能正确发送跨域 cookie
            const html = await Utils.request(CONFIG.API.TRUST, { timeout: 15000, retries: 2, withCredentials: true, headers: { 'Referer': 'https://connect.linux.do/' } });
            const doc = new DOMParser().parseFromString(html, 'text/html');
            const bodyText = doc.body?.textContent || '';
            const loginHint = doc.querySelector('a[href*="/login"], form[action*="/login"], form[action*="/session"]');
            if (loginHint || /登录|login|sign\s*in/i.test(bodyText)) {
                const err = new Error('NeedLogin');
                err.code = 'NeedLogin';
                throw err;
            }

            let username = null;
            let level = null;

            // 改版后：div.card 内 p.card-subtitle 为 "@username · 过去 100 天内的数据"，h2.card-title 为 "信任级别 X 的要求"，badge 已达到/未达到
            const card = Array.from(doc.querySelectorAll('div.card')).find(div => {
                const h2 = div.querySelector('h2.card-title');
                return h2 && /信任级别/.test(h2.textContent) && /的要求/.test(h2.textContent);
            });
            if (card) {
                const sub = card.querySelector('p.card-subtitle');
                if (sub) {
                    const subText = sub.textContent.trim();
                    const atMatch = subText.match(/@([^\s·]+)/);
                    if (atMatch) username = atMatch[1].trim();
                }
                const h2 = card.querySelector('h2.card-title');
                const titleMatch = h2 && h2.textContent.match(/信任级别\s*(\d+)\s*的要求/);
                const targetLevel = titleMatch ? parseInt(titleMatch[1], 10) : null;
                const badge = card.querySelector('.card-header .badge');
                const isAchieved = badge && badge.classList.contains('badge-success');
                if (targetLevel != null) level = String(isAchieved ? targetLevel : targetLevel - 1);
            }

            // 改版后兜底：用户菜单 "信任级别 X"
            if ((!username || level === null) && bodyText) {
                const menuLevel = bodyText.match(/信任级别\s*(\d+)/);
                if (menuLevel) level = menuLevel[1].trim();
            }

            // 旧版：h1 例如 "你好，一剑万生 (YY_WD) 2级用户"
            if (!username || level === null) {
                const h1 = doc.querySelector('h1');
                const h1Text = (h1?.textContent || '').trim();
                const m = h1Text.match(/你好，\s*([^\(\s]*)\s*\(?([^)]*)\)?\s*(\d+)\s*级用户/i);
                if (m) {
                    if (!username) username = (m[2] || m[1] || '').trim();
                    if (level === null) level = (m[3] || '').trim();
                }
                if (level === null && h1Text) {
                    const m2 = h1Text.match(/trust\s*level\s*(\d+)/i) || h1Text.match(/(\d+)\s*(?:level|lvl)/i);
                    if (m2) level = (m2[1] || '').trim();
                }
            }

            if (username) username = username.replace(/^@/, '');
            const trustLevel = level !== null && level !== '' && !Number.isNaN(Number(level)) ? Number(level) : null;

            if (!username && trustLevel === null) return null;
            return { username, trustLevel };
        }


        // 获取用户信息（含信任等级）- 使用同源请求更稳定
        static async fetchUserInfo(username) {
            if (!username) return null;
            // 【最高优先级】请求频率硬限制检查（每分钟最多3次，不可绕过）
            if (Utils.isRequestLimitExceeded('user')) {
                const waitTime = Utils.getRequestWaitTime('user');
                console.warn(`[LDA] user 请求频率超限，请 ${waitTime}s 后再试`);
                // Toast 由上层 refresh 函数统一显示，避免重复
                return null;
            }
            // user 分组限流检查
            if (Utils.isRateLimited('user')) return null;
            // 记录请求时间戳
            Utils.recordRequest('user');
            try {
                const r = await fetch(CONFIG.API.USER_INFO(username), {
                    credentials: 'include',
                    headers: Utils.getDiscourseHeaders()
                });
                // 429 处理：设置 user 分组锁
                if (r.status === 429) {
                    const retryAfter = parseInt(r.headers.get('Retry-After') || '60', 10);
                    Utils.setRateLimit('user', retryAfter);
                    return null;
                }
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
            // 【最高优先级】请求频率硬限制检查（与 fetchUserInfo 共享，每分钟最多3次）
            if (Utils.isRequestLimitExceeded('user')) {
                const waitTime = Utils.getRequestWaitTime('user');
                console.warn(`[LDA] user 请求频率超限，请 ${waitTime}s 后再试`);
                // Toast 由上层 refresh 函数统一显示，避免重复
                return null;
            }
            // user 分组限流检查（与 fetchUserInfo 共享）
            if (Utils.isRateLimited('user')) return null;
            // 记录请求时间戳
            Utils.recordRequest('user');
            try {
                const r = await fetch(CONFIG.API.USER_SUMMARY(username), {
                    credentials: 'include',
                    headers: Utils.getDiscourseHeaders()
                });
                // 429 处理：设置 user 分组锁
                if (r.status === 429) {
                    const retryAfter = parseInt(r.headers.get('Retry-After') || '60', 10);
                    Utils.setRateLimit('user', retryAfter);
                    return null;
                }
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

        // 获取论坛排名数据（仅每日排名）
        static async fetchForumStats() {
            // 【最高优先级】请求频率硬限制检查（每分钟最多3次，不可绕过）
            if (Utils.isRequestLimitExceeded('leaderboard')) {
                const waitTime = Utils.getRequestWaitTime('leaderboard');
                console.warn(`[LDA] leaderboard 请求频率超限，请 ${waitTime}s 后再试`);
                // Toast 由上层 refresh 函数统一显示，避免重复
                return { dailyRank: null, score: null };
            }
            // 60 秒独立冷却：排行榜数据更新频率低，限制请求频率
            if (Date.now() - Utils.lastLeaderboardFetch < 60000) {
                return { dailyRank: null, score: null };
            }
            // leaderboard 分组限流检查
            if (Utils.isRateLimited('leaderboard')) {
                return { dailyRank: null, score: null };
            }
            // 记录请求时间戳
            Utils.recordRequest('leaderboard');
            // 更新排行榜请求时间（持久化存储，跨标签页共享）
            Utils.lastLeaderboardFetch = Date.now();
            try {
                GM_setValue(CONFIG.KEYS.LEADERBOARD_LAST_FETCH, Utils.lastLeaderboardFetch);
            } catch (_) { /* 忽略写入错误 */ }

            const baseUrl = window.location.origin;
            const fetchLeaderboard = async (url) => {
                // 再次检查 leaderboard 分组限流（防止并行请求漏网）
                if (Utils.isRateLimited('leaderboard')) return null;
                let lastErr = null;
                // 最多重试 2 次
                for (let i = 0; i < 2; i++) {
                    const controller = new AbortController();
                    const timer = setTimeout(() => controller.abort(), 10000);
                    try {
                        // 使用 Discourse 友好的请求方式，避免 429 限流
                        const r = await fetch(url, {
                            signal: controller.signal,
                            credentials: 'include',
                            headers: Utils.getDiscourseHeaders()
                        });
                        clearTimeout(timer);
                        // 4xx 熔断：客户端错误不重试
                        if (r.status >= 400 && r.status < 500) {
                            if (r.status === 429) {
                                const retryAfter = parseInt(r.headers.get('Retry-After') || '60', 10);
                                Utils.setRateLimit('leaderboard', retryAfter);
                            } else {
                                console.warn(`[LDA] fetchForumStats ${r.status}, 停止重试: ${url}`);
                            }
                            return null;
                        }
                        if (!r.ok) throw new Error(`http ${r.status}`);
                        return await r.json();
                    } catch (e) {
                        clearTimeout(timer);
                        lastErr = e;
                        if (i === 1 || Utils.isRateLimited('leaderboard')) return null;
                        // 重试前等待（指数退避：1s）
                        await new Promise(r => setTimeout(r, 1000 * Math.pow(2, i)));
                    }
                }
                return null;
            };
            try {
                // 只请求每日排行榜，使用不带 .json 后缀的 URL
                const daily = await fetchLeaderboard(`${baseUrl}/leaderboard/1?period=daily`);
                // 尝试从 leaderboard 获取积分
                let score = daily?.personal?.user?.total_score || daily?.personal?.total_score || null;
                return {
                    dailyRank: daily?.personal?.position || null,
                    score: score
                };
            } catch (e) {
                return { dailyRank: null, score: null };
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
            // 【最高优先级】请求频率硬限制检查（每分钟最多3次，不可绕过）
            if (Utils.isRequestLimitExceeded('cdk')) {
                const waitTime = Utils.getRequestWaitTime('cdk');
                console.warn(`[LDA] cdk 请求频率超限，请 ${waitTime}s 后再试`);
                // CDK Bridge 页面不显示 Toast（在 iframe 中运行）
                return;
            }
            // cdk 分组限流检查
            if (Utils.isRateLimited('cdk')) return;
            // 记录请求时间戳
            Utils.recordRequest('cdk');
            try {
                const res = await fetch(CONFIG.API.CDK_INFO, { credentials: 'include' });
                // 429 处理：设置 cdk 分组锁
                if (res.status === 429) {
                    const retryAfter = parseInt(res.headers.get('Retry-After') || '60', 10);
                    Utils.setRateLimit('cdk', retryAfter);
                    return;
                }
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

    // 防止在 iframe 中运行主逻辑，避免多实例化导致并发请求
    if (window.self !== window.top) {
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
            --lda-font-scale: 1;
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
            user-select: none;
            -webkit-user-select: none;
            -webkit-touch-callout: none;
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

        /* 顶栏按钮模式 */
        .lda-header-btn {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 6px 12px;
            margin-left: 8px;
            margin-right: 8px;
            border-radius: 6px;
            background: var(--primary-low, rgba(59, 130, 246, 0.1));
            color: var(--primary, #3b82f6);
            font-size: 12px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s ease;
            border: none;
            white-space: nowrap;
            user-select: none;
            -webkit-user-select: none;
            -webkit-touch-callout: none;
        }
        .lda-header-btn:hover {
            background: var(--primary-low-mid, rgba(59, 130, 246, 0.2));
            transform: translateY(-1px);
        }
        .lda-header-btn svg {
            width: 16px;
            height: 16px;
            fill: currentColor;
        }
        .lda-header-btn-img {
            width: 24px;
            height: 24px;
            border-radius: 50%;
            object-fit: contain;
            transition: opacity 0.2s ease;
        }
        .lda-header-btn-img-wrap {
            position: relative;
            width: 24px;
            height: 24px;
        }
        .lda-header-btn-img-wrap img {
            position: absolute;
            top: 0;
            left: 0;
        }
        .lda-header-btn-img-normal { opacity: 1; }
        .lda-header-btn-img-hover { opacity: 0; }
        .lda-header-btn:hover .lda-header-btn-img-normal { opacity: 0; }
        .lda-header-btn:hover .lda-header-btn-img-hover { opacity: 1; }

        /* 顶栏模式下的面板定位 */
        #lda-root.lda-header-mode {
            position: fixed;
            top: auto;
            right: 12px;
            z-index: var(--lda-z);
        }
        #lda-root.lda-header-mode .lda-panel {
            position: fixed;
            top: 60px;
            right: 12px;
            left: auto;
            transform-origin: top right;
        }
        #lda-root.lda-header-mode .lda-ball {
            display: none !important;
        }

        /* 面板 */
        .lda-panel {
            position: absolute; top: 0; right: 0;
            width: clamp(300px, calc(100vw - 24px), 370px); background: var(--lda-bg); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
            border: var(--lda-border); border-radius: var(--lda-rad); box-shadow: var(--lda-shadow);
            display: none; flex-direction: column; overflow: hidden; margin-top: 0;
            transform-origin: top right; animation: lda-in 0.25s cubic-bezier(0.2, 0.8, 0.2, 1);
            font-size: calc(14px * var(--lda-font-scale, 1));
        }
        .lda-panel * { font-size: inherit; }
        .lda-panel .lda-title { font-size: calc(13px * var(--lda-font-scale, 1)); }
        .lda-panel .lda-tab { font-size: calc(12px * var(--lda-font-scale, 1)); }
        .lda-panel .lda-credit-num { font-size: calc(24px * var(--lda-font-scale, 1)); }
        .lda-panel .lda-opt-label { font-size: calc(12px * var(--lda-font-scale, 1)); }
        .lda-panel .lda-seg-item { font-size: calc(11px * var(--lda-font-scale, 1)); }
        .lda-panel .lda-support-title { font-size: calc(13px * var(--lda-font-scale, 1)); }
        .lda-panel .lda-support-desc { font-size: calc(10px * var(--lda-font-scale, 1)); }
        .lda-panel .lda-support-amount { font-size: calc(12px * var(--lda-font-scale, 1)); }
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
        .lda-auth-actions { display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; margin-top: 12px; }
        .lda-auth-btn,
        a.lda-auth-btn,
        a.lda-auth-btn:link,
        a.lda-auth-btn:visited,
        a.lda-auth-btn:hover,
        a.lda-auth-btn:active,
        button.lda-auth-btn {
            display: inline-block; padding: 10px 20px; background: var(--lda-accent); color: #fff !important;
            border-radius: 8px; font-size: 13px; font-weight: 600; text-decoration: none !important;
            transition: all 0.2s; box-shadow: 0 2px 8px rgba(59, 130, 246, 0.3); border: none; cursor: pointer;
        }
        .lda-auth-btn:hover,
        a.lda-auth-btn:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4); }
        .lda-auth-btn.secondary,
        a.lda-auth-btn.secondary,
        a.lda-auth-btn.secondary:link,
        a.lda-auth-btn.secondary:visited,
        a.lda-auth-btn.secondary:hover,
        a.lda-auth-btn.secondary:active,
        button.lda-auth-btn.secondary { background: rgba(125,125,125,0.15); color: var(--lda-fg) !important; box-shadow: none; }
        .lda-auth-btn.secondary:hover,
        a.lda-auth-btn.secondary:hover { background: rgba(125,125,125,0.25); transform: none; }
        /* 授权按钮 loading 状态 */
        .lda-auth-btn.loading {
            position: relative;
            pointer-events: none;
            opacity: 0.7;
        }
        .lda-auth-btn.loading::after {
            content: '';
            position: absolute;
            width: 14px;
            height: 14px;
            top: 50%;
            left: 50%;
            margin-left: -7px;
            margin-top: -7px;
            border: 2px solid transparent;
            border-top-color: currentColor;
            border-radius: 50%;
            animation: lda-spin 0.8s linear infinite;
        }
        .lda-auth-btn.loading span { visibility: hidden; }
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

        /* 小按钮样式（用于自定义图标等） */
        .lda-btn-small {
            padding: 4px 10px;
            background: var(--lda-accent);
            color: #fff;
            border: none;
            border-radius: 4px;
            font-size: 11px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s;
        }
        .lda-btn-small:hover { opacity: 0.85; }
        .lda-btn-small.lda-btn-danger { background: #ef4444; }
        .lda-btn-small.lda-btn-danger:hover { background: #dc2626; }

        /* 支持小秘书区域 */
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

        /* 设置页子标签 */
        .lda-sub-tabs {
            display: flex; gap: 0; margin-bottom: 12px;
            border-radius: 8px; overflow: hidden;
            border: 1px solid var(--lda-border);
        }
        .lda-sub-tab {
            flex: 1; padding: 8px 12px; font-size: 12px; font-weight: 500;
            text-align: center; cursor: pointer; transition: all 0.2s;
            background: transparent; color: var(--lda-dim);
            border: none; outline: none;
        }
        .lda-sub-tab:first-child { border-right: 1px solid var(--lda-border); }
        .lda-sub-tab:hover { background: rgba(125,125,125,0.08); }
        .lda-sub-tab.active {
            background: var(--lda-accent); color: #fff;
        }
        .lda-sub-page { display: none; animation: lda-fade 0.2s; }
        .lda-sub-page.active { display: block; }

        /* 字体大小调节 */
        .lda-font-row {
            display: flex; align-items: center; gap: 10px;
        }
        .lda-font-slider {
            flex: 1; height: 4px; -webkit-appearance: none; appearance: none;
            background: rgba(125,125,125,0.2); border-radius: 2px; outline: none;
        }
        .lda-font-slider::-webkit-slider-thumb {
            -webkit-appearance: none; width: 16px; height: 16px;
            background: var(--lda-accent); border-radius: 50%; cursor: pointer;
            transition: transform 0.15s;
        }
        .lda-font-slider::-webkit-slider-thumb:hover { transform: scale(1.1); }
        .lda-font-slider::-moz-range-thumb {
            width: 16px; height: 16px; background: var(--lda-accent);
            border-radius: 50%; cursor: pointer; border: none;
        }
        .lda-font-val {
            min-width: 40px; text-align: center; font-size: 12px;
            font-weight: 600; color: var(--lda-fg);
        }
        .lda-font-reset {
            padding: 4px 8px; font-size: 11px; border-radius: 4px;
            border: 1px solid var(--lda-border); background: transparent;
            color: var(--lda-dim); cursor: pointer; transition: all 0.2s;
        }
        .lda-font-reset:hover {
            border-color: var(--lda-accent); color: var(--lda-accent);
        }

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

        /* 长按悬浮球/顶栏按钮时的提示效果 */
        .lda-ball.lda-long-pressing,
        .lda-header-btn.lda-long-pressing {
            animation: lda-long-press-pulse 0.5s ease-out;
        }
        @keyframes lda-long-press-pulse {
            0% { box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.6); }
            100% { box-shadow: 0 0 0 15px rgba(59, 130, 246, 0); }
        }

    `;

    // ========== 筛选工具模块 (SieveModule) ==========
    // 配置定义
    const SIEVE_CONFIG = {
        // 允许自动滚动的路径白名单
        AUTO_SCROLL_PATHS: ['/', '/latest', '/top', '/new'],
        TARGET_COUNT: 30,
        // 等级配置
        LEVELS: [
            { key: 'public', label: '公开(Lv0)', check: (cls) => !/lv\d+/i.test(cls) },
            { key: 'lv1', label: 'Lv1', check: (cls) => /lv1/i.test(cls) },
            { key: 'lv2', label: 'Lv2', check: (cls) => /lv2/i.test(cls) },
            { key: 'lv3', label: 'Lv3', check: (cls) => /lv3/i.test(cls) },
        ],
        // 分类配置
        CATEGORIES: [
            { id: '4', name: '开发调优' },
            { id: '98', name: '国产替代' },
            { id: '14', name: '资源荟萃' },
            { id: '42', name: '文档共建' },
            { id: '10', name: '跳蚤市场' },
            { id: '106', name: '积分乐园' },
            { id: '27', name: '非我莫属' },
            { id: '32', name: '读书成诗' },
            { id: '46', name: '扬帆起航' },
            { id: '34', name: '前沿快讯' },
            { id: '92', name: '网络记忆' },
            { id: '36', name: '福利羊毛' },
            { id: '11', name: '搞七捻三' },
            { id: '102', name: '社区孵化' },
            { id: '2', name: '运营反馈' },
            { id: '45', name: '深海幽域' }
        ],
        // 标签配置
        TAGS: [
            "无标签", "纯水", "快问快答", "人工智能", "软件开发",
            "夸克网盘", "病友", "ChatGPT", "树洞", "AFF",
            "OpenAI", "影视", "百度网盘", "VPS", "职场",
            "网络安全", "订阅节点", "抽奖", "Cursor", "游戏",
            "动漫", "作品集", "晒年味", "Gemini", "PT",
            "拼车", "求资源", "配置优化", "Claude", "NSFW",
            "圆圆满满"
        ],
        // 三态常量
        STATE: { NEUTRAL: 0, INCLUDE: 1, EXCLUDE: 2 }
    };

    // 筛选工具样式
    const SieveStyles = `
        /* 筛选面板容器 */
        #lda-sieve-panel {
            margin-bottom: 15px;
            padding: 12px 14px;
            background: var(--secondary, #fff);
            border: 1px solid var(--primary-low, #e0e0e0);
            border-radius: 10px;
            font-size: 13px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.04);
        }
        .lda-dark #lda-sieve-panel {
            background: rgba(30, 30, 35, 0.95);
            border-color: rgba(255,255,255,0.08);
        }

        /* 筛选行 */
        .lda-sieve-row {
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            gap: 6px;
            padding: 8px 0;
            border-bottom: 1px dashed var(--primary-low, #e0e0e0);
        }
        .lda-sieve-row:last-child {
            border-bottom: none;
            padding-bottom: 0;
        }
        .lda-sieve-row:first-child {
            padding-top: 0;
        }

        /* 行标题 */
        .lda-sieve-title {
            font-weight: 600;
            font-size: 12px;
            color: var(--primary, #333);
            min-width: 36px;
            user-select: none;
        }

        /* 快捷操作按钮 */
        .lda-sieve-action {
            padding: 3px 8px;
            font-size: 11px;
            border: 1px solid var(--primary-low, #ddd);
            border-radius: 4px;
            background: transparent;
            color: var(--primary-medium, #666);
            cursor: pointer;
            transition: all 0.15s;
            user-select: none;
        }
        .lda-sieve-action:hover {
            border-color: var(--tertiary, #3b82f6);
            color: var(--tertiary, #3b82f6);
        }

        /* 筛选标签按钮（通用） */
        .lda-sieve-btn {
            padding: 4px 10px;
            font-size: 12px;
            border: 1px solid var(--primary-low, #ddd);
            border-radius: 5px;
            background: transparent;
            color: var(--primary, #333);
            cursor: pointer;
            transition: all 0.15s;
            user-select: none;
            -webkit-user-select: none;
            -webkit-touch-callout: none;
            display: inline-flex;
            align-items: center;
            gap: 3px;
            white-space: nowrap;
        }
        .lda-sieve-btn:hover {
            border-color: var(--tertiary, #3b82f6);
        }
        .lda-sieve-btn.active {
            color: #22c55e;
            border-color: #22c55e;
            font-weight: 600;
        }
        .lda-sieve-btn.exclude {
            color: #ef4444;
            border-color: #ef4444;
            font-weight: 600;
        }
        .lda-sieve-btn svg {
            width: 10px;
            height: 10px;
            fill: currentColor;
        }

        /* 预设区域 */
        .lda-sieve-preset-row {
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            gap: 8px;
            padding-top: 8px;
            min-height: 36px;
        }

        /* 预设按钮组 */
        .lda-sieve-preset-group {
            display: inline-flex;
            align-items: stretch;
            border-radius: 5px;
            overflow: hidden;
            user-select: none;
            -webkit-user-select: none;
            -webkit-touch-callout: none;
            touch-action: none;
        }
        .lda-sieve-preset-group.dragging {
            opacity: 0.5;
            transform: scale(1.02);
        }
        .lda-sieve-preset-group.drag-over {
            box-shadow: 0 0 0 2px var(--tertiary, #3b82f6);
        }

        /* 预设名称按钮 */
        .lda-sieve-preset-name {
            padding: 4px 10px;
            font-size: 12px;
            line-height: 1.4;
            border: 1px solid var(--primary-low, #ddd);
            border-radius: 5px 0 0 5px;
            background: transparent;
            color: var(--primary, #333);
            cursor: pointer;
            transition: all 0.15s;
        }
        .lda-sieve-preset-name:hover {
            border-color: var(--tertiary, #3b82f6);
            color: var(--tertiary, #3b82f6);
        }

        /* 预设删除按钮 */
        .lda-sieve-preset-del {
            padding: 4px 6px;
            font-size: 12px;
            line-height: 1.4;
            border: 1px solid var(--primary-low, #ddd);
            border-left: none;
            border-radius: 0 5px 5px 0;
            background: transparent;
            color: #999;
            cursor: pointer;
            transition: all 0.15s;
        }
        .lda-sieve-preset-del:hover {
            border-color: #ef4444;
            color: #ef4444;
            background: rgba(239, 68, 68, 0.08);
        }

        /* 拖拽把手（移动端显示） */
        .lda-sieve-preset-handle {
            display: none;
            padding: 4px 4px;
            font-size: 12px;
            line-height: 1.4;
            border: 1px solid var(--primary-low, #ddd);
            border-right: none;
            border-radius: 5px 0 0 5px;
            background: transparent;
            color: #999;
            cursor: grab;
            touch-action: none;
        }
        @media (pointer: coarse) {
            .lda-sieve-preset-handle {
                display: flex;
                align-items: center;
            }
            .lda-sieve-preset-name {
                border-radius: 0;
            }
        }

        /* 保存预设输入框 */
        .lda-sieve-save-wrap {
            display: inline-flex;
            align-items: center;
            gap: 6px;
        }
        .lda-sieve-save-input {
            width: 72px;
            padding: 4px 8px;
            font-size: 12px;
            line-height: 1.4;
            border: 1px solid var(--primary-low, #ddd);
            border-radius: 5px;
            background: var(--secondary, #fff);
            color: var(--primary, #333);
            outline: none;
            box-sizing: border-box;
        }
        .lda-sieve-save-input:focus {
            border-color: var(--tertiary, #3b82f6);
        }
        .lda-sieve-save-btn {
            padding: 4px 10px;
            font-size: 12px;
            line-height: 1.4;
            border: 1px solid var(--tertiary, #3b82f6);
            border-radius: 5px;
            background: var(--tertiary, #3b82f6);
            color: #fff;
            cursor: pointer;
            transition: all 0.15s;
            white-space: nowrap;
            box-sizing: border-box;
        }
        .lda-sieve-save-btn:hover {
            opacity: 0.9;
        }

        /* 状态栏 */
        .lda-sieve-status {
            position: absolute;
            top: 12px;
            right: 14px;
            font-size: 11px;
            font-weight: 500;
            color: var(--primary-medium, #666);
            opacity: 0;
            transition: opacity 0.2s;
            pointer-events: none;
            white-space: nowrap;
        }
        .lda-sieve-status.visible {
            opacity: 1;
        }
        .lda-sieve-status.loading { color: #f59e0b; }
        .lda-sieve-status.done { color: #22c55e; }
        .lda-sieve-status.end { color: #ef4444; }

        /* 无预设提示 */
        .lda-sieve-no-preset {
            font-size: 11px;
            color: var(--primary-medium, #999);
            font-style: italic;
        }

        /* 筛选面板位置 */
        #lda-sieve-panel {
            position: relative;
        }
    `;

    // 筛选工具模块类
    class SieveModule {
        constructor(app) {
            this.app = app;
            this.panel = null;
            this.statusEl = null;
            this.checkInterval = null;
            this.observer = null;
            this.lastUrl = location.href;
            this.isDestroyed = false;
            
            // 筛选状态
            this.activeLevels = Utils.get(CONFIG.KEYS.SIEVE_LEVELS, SIEVE_CONFIG.LEVELS.map(l => l.key));
            this.activeCats = Utils.get(CONFIG.KEYS.SIEVE_CATS, SIEVE_CONFIG.CATEGORIES.map(c => c.id));
            this.tagStates = Utils.get(CONFIG.KEYS.SIEVE_TAGS, {});
            this.presets = Utils.get(CONFIG.KEYS.SIEVE_PRESETS, {});
            this.presetOrder = Utils.get(CONFIG.KEYS.SIEVE_PRESET_ORDER, Object.keys(this.presets));
            
            // 拖拽状态
            this.dragItem = null;
            this.dragStartY = 0;
            
            // 加载状态
            this.isLoadingMore = false;

            // 内存优化：防抖和变化检测
            this._urlWatcherTimer = null;    // MutationObserver 防抖计时器
            this._lastRowCount = 0;          // 上次帖子数量（变化检测用）
            this._filterDirty = true;        // 筛选条件是否变化（强制重新筛选）

            // 行级筛选观察器：新帖子行插入时在绘制前同步筛选，消除“闪一下”
            this.rowObserver = null;
            this._rowObserverTarget = null;  // 当前观察的 .topic-list-body 节点
            this._suppressRowObserver = false; // 自身修改 DOM 时暂停观察器，避免自触发
        }

        // 初始化
        init() {
            if (this.isDestroyed) return;
            
            // 注入样式（无论是否在首页，样式只注入一次）
            if (!document.getElementById('lda-sieve-styles')) {
                const style = document.createElement('style');
                style.id = 'lda-sieve-styles';
                style.textContent = SieveStyles;
                document.head.appendChild(style);
            }
            
            // 监听 URL 变化（无论是否在首页，这样从非首页跳转到首页时能正确响应）
            this.setupUrlWatcher();
            
            // 只在首页相关路径创建 UI 和启动筛选循环
            if (!this.isHomePage()) return;
            
            // 创建 UI
            this.createUI();
            
            // 启动筛选循环
            this.startFilterLoop();
        }

        // 销毁
        destroy() {
            this.isDestroyed = true;
            
            if (this.checkInterval) {
                clearInterval(this.checkInterval);
                this.checkInterval = null;
            }
            
            // 清理防抖计时器
            if (this._urlWatcherTimer) {
                clearTimeout(this._urlWatcherTimer);
                this._urlWatcherTimer = null;
            }
            
            if (this.observer) {
                this.observer.disconnect();
                this.observer = null;
            }

            // 清理行级观察器
            if (this.rowObserver) {
                this.rowObserver.disconnect();
                this.rowObserver = null;
                this._rowObserverTarget = null;
            }

            if (this.panel) {
                this.panel.remove();
                this.panel = null;
            }
            
            // 恢复所有隐藏的帖子
            const rows = document.querySelectorAll('.topic-list-body tr.topic-list-item');
            rows.forEach(row => row.style.display = '');
            
            // 移除 spacer 和缓存数据
            this.removeSpacer();
        }

        // 判断是否在首页
        isHomePage() {
            return SIEVE_CONFIG.AUTO_SCROLL_PATHS.includes(window.location.pathname);
        }

        // 创建 UI
        createUI() {
            if (this.panel || document.getElementById('lda-sieve-panel')) return;
            
            const target = document.querySelector('.list-controls') || document.querySelector('.topic-list');
            if (!target) return;

            this.panel = document.createElement('div');
            this.panel.id = 'lda-sieve-panel';
            this.panel.innerHTML = this.renderPanelHTML();
            
            target.parentNode.insertBefore(this.panel, target);
            
            this.statusEl = this.panel.querySelector('.lda-sieve-status');
            
            // 绑定事件
            this.bindEvents();
        }

        // 渲染面板 HTML
        renderPanelHTML() {
            const { LEVELS, CATEGORIES, TAGS, STATE } = SIEVE_CONFIG;
            const checkSvg = `<svg viewBox="0 0 448 512"><path d="M438.6 105.4c12.5 12.5 12.5 32.8 0 45.3l-256 256c-12.5 12.5-32.8 12.5-45.3 0l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0L160 338.7 393.4 105.4c12.5-12.5 32.8-12.5 45.3 0z"/></svg>`;
            const banSvg = `<svg viewBox="0 0 512 512"><path d="M256 512A256 256 0 1 0 256 0a256 256 0 1 0 0 512zM175 175c9.4-9.4 24.6-9.4 33.9 0l47 47 47-47c9.4-9.4 24.6-9.4 33.9 0s9.4 24.6 0 33.9l-47 47 47 47c9.4 9.4 9.4 24.6 0 33.9s-24.6 9.4-33.9 0l-47-47-47 47c-9.4 9.4-24.6 9.4-33.9 0s-9.4-24.6 0-33.9l47-47-47-47c-9.4-9.4-9.4-24.6 0-33.9z"/></svg>`;
            const dragSvg = `<svg viewBox="0 0 24 24" width="12" height="12"><path fill="currentColor" d="M11 18c0 1.1-.9 2-2 2s-2-.9-2-2 .9-2 2-2 2 .9 2 2zm-2-8c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0-6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm6 4c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/></svg>`;

            // 等级按钮
            const levelBtns = LEVELS.map(l => {
                const isActive = this.activeLevels.includes(l.key);
                return `<span class="lda-sieve-btn${isActive ? ' active' : ''}" data-type="level" data-key="${l.key}">${isActive ? checkSvg : ''}${l.label}</span>`;
            }).join('');

            // 分类按钮
            const catBtns = CATEGORIES.map(c => {
                const isActive = this.activeCats.includes(c.id);
                return `<span class="lda-sieve-btn${isActive ? ' active' : ''}" data-type="cat" data-key="${c.id}">${isActive ? checkSvg : ''}${c.name}</span>`;
            }).join('');

            // 标签按钮
            const tagBtns = TAGS.map(t => {
                const state = this.tagStates[t] || STATE.NEUTRAL;
                let cls = '';
                let icon = '';
                if (state === STATE.INCLUDE) { cls = ' active'; icon = checkSvg; }
                else if (state === STATE.EXCLUDE) { cls = ' exclude'; icon = banSvg; }
                return `<span class="lda-sieve-btn${cls}" data-type="tag" data-key="${t}">${icon}${t}</span>`;
            }).join('');

            // 预设按钮
            const presetBtns = this.renderPresetBtns(dragSvg);

            return `
                <div class="lda-sieve-status"></div>
                <div class="lda-sieve-row">
                    <span class="lda-sieve-title">等级</span>
                    <span class="lda-sieve-action" data-action="toggle-level">全选</span>
                    ${levelBtns}
                </div>
                <div class="lda-sieve-row">
                    <span class="lda-sieve-title">分类</span>
                    <span class="lda-sieve-action" data-action="toggle-cat">全选</span>
                    ${catBtns}
                </div>
                <div class="lda-sieve-row">
                    <span class="lda-sieve-title">标签</span>
                    <span class="lda-sieve-action" data-action="reset-tag">重置</span>
                    ${tagBtns}
                </div>
                <div class="lda-sieve-row lda-sieve-preset-row" id="lda-sieve-preset-container">
                    <span class="lda-sieve-title">预设</span>
                    ${presetBtns}
                    <span class="lda-sieve-save-wrap">
                        <input type="text" class="lda-sieve-save-input" placeholder="名称" maxlength="10">
                        <span class="lda-sieve-save-btn">保存</span>
                    </span>
                </div>
            `;
        }

        // 渲染预设按钮
        renderPresetBtns(dragSvg) {
            const names = this.presetOrder.filter(n => this.presets[n]);
            if (names.length === 0) {
                return `<span class="lda-sieve-no-preset">暂无预设，输入名称后点击保存</span>`;
            }
            return names.map(name => `
                <span class="lda-sieve-preset-group" data-preset="${name}">
                    <span class="lda-sieve-preset-handle">${dragSvg}</span>
                    <span class="lda-sieve-preset-name">${name}</span>
                    <span class="lda-sieve-preset-del">×</span>
                </span>
            `).join('');
        }

        // 刷新预设区域
        refreshPresets() {
            const container = this.panel?.querySelector('#lda-sieve-preset-container');
            if (!container) return;
            
            const dragSvg = `<svg viewBox="0 0 24 24" width="12" height="12"><path fill="currentColor" d="M11 18c0 1.1-.9 2-2 2s-2-.9-2-2 .9-2 2-2 2 .9 2 2zm-2-8c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0-6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm6 4c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/></svg>`;
            
            // 保留标题和保存框
            const title = container.querySelector('.lda-sieve-title');
            const saveWrap = container.querySelector('.lda-sieve-save-wrap');
            
            // 移除旧的预设按钮
            container.querySelectorAll('.lda-sieve-preset-group, .lda-sieve-no-preset').forEach(el => el.remove());
            
            // 插入新的预设按钮
            const presetHtml = this.renderPresetBtns(dragSvg);
            title.insertAdjacentHTML('afterend', presetHtml);
            
            // 重新绑定拖拽事件
            this.bindPresetDragEvents();
        }

        // 绑定事件
        bindEvents() {
            if (!this.panel) return;

            // 事件委托
            this.panel.addEventListener('click', (e) => {
                const target = e.target.closest('[data-action], [data-type], .lda-sieve-preset-name, .lda-sieve-preset-del, .lda-sieve-save-btn');
                if (!target) return;

                // 快捷操作
                if (target.dataset.action) {
                    this.handleAction(target.dataset.action);
                    return;
                }

                // 筛选按钮
                if (target.dataset.type) {
                    this.handleFilterBtn(target);
                    return;
                }

                // 预设名称 - 加载预设
                if (target.classList.contains('lda-sieve-preset-name')) {
                    const name = target.closest('.lda-sieve-preset-group')?.dataset.preset;
                    if (name) this.loadPreset(name);
                    return;
                }

                // 预设删除
                if (target.classList.contains('lda-sieve-preset-del')) {
                    const name = target.closest('.lda-sieve-preset-group')?.dataset.preset;
                    if (name && confirm(`确定删除预设 "${name}"？`)) {
                        this.deletePreset(name);
                    }
                    return;
                }

                // 保存预设
                if (target.classList.contains('lda-sieve-save-btn')) {
                    const input = this.panel.querySelector('.lda-sieve-save-input');
                    const name = input?.value.trim();
                    if (name) {
                        this.savePreset(name);
                        input.value = '';
                    }
                    return;
                }
            });

            // 回车保存预设
            const input = this.panel.querySelector('.lda-sieve-save-input');
            if (input) {
                input.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        const name = input.value.trim();
                        if (name) {
                            this.savePreset(name);
                            input.value = '';
                        }
                    }
                });
            }

            // 绑定预设拖拽事件
            this.bindPresetDragEvents();
        }

        // 绑定预设拖拽事件（PC + 移动端）
        bindPresetDragEvents() {
            const container = this.panel?.querySelector('#lda-sieve-preset-container');
            if (!container) return;

            const groups = container.querySelectorAll('.lda-sieve-preset-group');
            
            groups.forEach(group => {
                // PC 拖拽
                group.setAttribute('draggable', 'true');
                
                group.addEventListener('dragstart', (e) => {
                    this.dragItem = group;
                    group.classList.add('dragging');
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', group.dataset.preset);
                });

                group.addEventListener('dragend', () => {
                    this.dragItem = null;
                    group.classList.remove('dragging');
                    groups.forEach(g => g.classList.remove('drag-over'));
                    this.savePresetOrder();
                });

                group.addEventListener('dragover', (e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    if (this.dragItem && this.dragItem !== group) {
                        group.classList.add('drag-over');
                    }
                });

                group.addEventListener('dragleave', () => {
                    group.classList.remove('drag-over');
                });

                group.addEventListener('drop', (e) => {
                    e.preventDefault();
                    group.classList.remove('drag-over');
                    if (this.dragItem && this.dragItem !== group) {
                        this.reorderPresets(this.dragItem.dataset.preset, group.dataset.preset);
                    }
                });

                // 移动端拖拽 - 通过拖拽把手触发
                const handle = group.querySelector('.lda-sieve-preset-handle');
                if (handle) {
                    handle.addEventListener('touchstart', (e) => {
                        e.preventDefault();
                        this.dragItem = group;
                        this.dragStartY = e.touches[0].clientY;
                        group.classList.add('dragging');
                    }, { passive: false });
                }
            });

            // 移动端触摸移动和结束
            container.addEventListener('touchmove', (e) => {
                if (!this.dragItem) return;
                e.preventDefault();
                
                const touch = e.touches[0];
                const elementUnder = document.elementFromPoint(touch.clientX, touch.clientY);
                const targetGroup = elementUnder?.closest('.lda-sieve-preset-group');
                
                groups.forEach(g => g.classList.remove('drag-over'));
                if (targetGroup && targetGroup !== this.dragItem) {
                    targetGroup.classList.add('drag-over');
                }
            }, { passive: false });

            container.addEventListener('touchend', () => {
                if (!this.dragItem) return;
                
                const dragOverGroup = container.querySelector('.lda-sieve-preset-group.drag-over');
                if (dragOverGroup) {
                    this.reorderPresets(this.dragItem.dataset.preset, dragOverGroup.dataset.preset);
                }
                
                groups.forEach(g => {
                    g.classList.remove('dragging');
                    g.classList.remove('drag-over');
                });
                this.dragItem = null;
                this.savePresetOrder();
            });
        }

        // 重新排序预设
        reorderPresets(fromName, toName) {
            const fromIdx = this.presetOrder.indexOf(fromName);
            const toIdx = this.presetOrder.indexOf(toName);
            if (fromIdx === -1 || toIdx === -1) return;
            
            // 移动元素
            this.presetOrder.splice(fromIdx, 1);
            this.presetOrder.splice(toIdx, 0, fromName);
            
            // 刷新 UI
            this.refreshPresets();
        }

        // 保存预设顺序
        savePresetOrder() {
            Utils.set(CONFIG.KEYS.SIEVE_PRESET_ORDER, this.presetOrder);
        }

        // 处理快捷操作
        handleAction(action) {
            const { LEVELS, CATEGORIES, TAGS } = SIEVE_CONFIG;
            
            if (action === 'toggle-level') {
                const allKeys = LEVELS.map(l => l.key);
                this.activeLevels = [...allKeys];
                Utils.set(CONFIG.KEYS.SIEVE_LEVELS, this.activeLevels);
            } else if (action === 'toggle-cat') {
                const allIds = CATEGORIES.map(c => c.id);
                this.activeCats = [...allIds];
                Utils.set(CONFIG.KEYS.SIEVE_CATS, this.activeCats);
            } else if (action === 'reset-tag') {
                this.tagStates = {};
                Utils.set(CONFIG.KEYS.SIEVE_TAGS, this.tagStates);
            }
            
            this._filterDirty = true; // 标记筛选条件已变化
            this.updateAllBtns();
            this.filterTopics();
        }

        // 处理筛选按钮点击
        handleFilterBtn(btn) {
            const { type, key } = btn.dataset;
            const { STATE } = SIEVE_CONFIG;
            const checkSvg = `<svg viewBox="0 0 448 512"><path d="M438.6 105.4c12.5 12.5 12.5 32.8 0 45.3l-256 256c-12.5 12.5-32.8 12.5-45.3 0l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0L160 338.7 393.4 105.4c12.5-12.5 32.8-12.5 45.3 0z"/></svg>`;
            const banSvg = `<svg viewBox="0 0 512 512"><path d="M256 512A256 256 0 1 0 256 0a256 256 0 1 0 0 512zM175 175c9.4-9.4 24.6-9.4 33.9 0l47 47 47-47c9.4-9.4 24.6-9.4 33.9 0s9.4 24.6 0 33.9l-47 47 47 47c9.4 9.4 9.4 24.6 0 33.9s-24.6 9.4-33.9 0l-47-47-47 47c-9.4 9.4-24.6 9.4-33.9 0s-9.4-24.6 0-33.9l47-47-47-47c-9.4-9.4-9.4-24.6 0-33.9z"/></svg>`;

            if (type === 'level') {
                const idx = this.activeLevels.indexOf(key);
                if (idx >= 0) {
                    this.activeLevels.splice(idx, 1);
                    btn.classList.remove('active');
                    btn.innerHTML = SIEVE_CONFIG.LEVELS.find(l => l.key === key)?.label || key;
                } else {
                    this.activeLevels.push(key);
                    btn.classList.add('active');
                    btn.innerHTML = checkSvg + (SIEVE_CONFIG.LEVELS.find(l => l.key === key)?.label || key);
                }
                Utils.set(CONFIG.KEYS.SIEVE_LEVELS, this.activeLevels);
            } else if (type === 'cat') {
                const idx = this.activeCats.indexOf(key);
                if (idx >= 0) {
                    this.activeCats.splice(idx, 1);
                    btn.classList.remove('active');
                    btn.innerHTML = SIEVE_CONFIG.CATEGORIES.find(c => c.id === key)?.name || key;
                } else {
                    this.activeCats.push(key);
                    btn.classList.add('active');
                    btn.innerHTML = checkSvg + (SIEVE_CONFIG.CATEGORIES.find(c => c.id === key)?.name || key);
                }
                Utils.set(CONFIG.KEYS.SIEVE_CATS, this.activeCats);
            } else if (type === 'tag') {
                // 三态循环：中性 -> 包含 -> 排除 -> 中性
                let state = this.tagStates[key] || STATE.NEUTRAL;
                state = (state + 1) % 3;
                
                if (state === STATE.NEUTRAL) {
                    delete this.tagStates[key];
                    btn.classList.remove('active', 'exclude');
                    btn.innerHTML = key;
                } else if (state === STATE.INCLUDE) {
                    this.tagStates[key] = state;
                    btn.classList.add('active');
                    btn.classList.remove('exclude');
                    btn.innerHTML = checkSvg + key;
                } else {
                    this.tagStates[key] = state;
                    btn.classList.remove('active');
                    btn.classList.add('exclude');
                    btn.innerHTML = banSvg + key;
                }
                Utils.set(CONFIG.KEYS.SIEVE_TAGS, this.tagStates);
            }
            
            this._filterDirty = true; // 标记筛选条件已变化
            this.filterTopics();
        }

        // 更新所有按钮状态
        updateAllBtns() {
            if (!this.panel) return;
            
            const { LEVELS, CATEGORIES, TAGS, STATE } = SIEVE_CONFIG;
            const checkSvg = `<svg viewBox="0 0 448 512"><path d="M438.6 105.4c12.5 12.5 12.5 32.8 0 45.3l-256 256c-12.5 12.5-32.8 12.5-45.3 0l-128-128c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0L160 338.7 393.4 105.4c12.5-12.5 32.8-12.5 45.3 0z"/></svg>`;
            const banSvg = `<svg viewBox="0 0 512 512"><path d="M256 512A256 256 0 1 0 256 0a256 256 0 1 0 0 512zM175 175c9.4-9.4 24.6-9.4 33.9 0l47 47 47-47c9.4-9.4 24.6-9.4 33.9 0s9.4 24.6 0 33.9l-47 47 47 47c9.4 9.4 9.4 24.6 0 33.9s-24.6 9.4-33.9 0l-47-47-47 47c-9.4 9.4-24.6 9.4-33.9 0s-9.4-24.6 0-33.9l47-47-47-47c-9.4-9.4-9.4-24.6 0-33.9z"/></svg>`;

            // 更新等级按钮
            this.panel.querySelectorAll('[data-type="level"]').forEach(btn => {
                const key = btn.dataset.key;
                const isActive = this.activeLevels.includes(key);
                btn.className = 'lda-sieve-btn' + (isActive ? ' active' : '');
                btn.innerHTML = (isActive ? checkSvg : '') + (LEVELS.find(l => l.key === key)?.label || key);
            });

            // 更新分类按钮
            this.panel.querySelectorAll('[data-type="cat"]').forEach(btn => {
                const key = btn.dataset.key;
                const isActive = this.activeCats.includes(key);
                btn.className = 'lda-sieve-btn' + (isActive ? ' active' : '');
                btn.innerHTML = (isActive ? checkSvg : '') + (CATEGORIES.find(c => c.id === key)?.name || key);
            });

            // 更新标签按钮
            this.panel.querySelectorAll('[data-type="tag"]').forEach(btn => {
                const key = btn.dataset.key;
                const state = this.tagStates[key] || STATE.NEUTRAL;
                let cls = 'lda-sieve-btn';
                let icon = '';
                if (state === STATE.INCLUDE) { cls += ' active'; icon = checkSvg; }
                else if (state === STATE.EXCLUDE) { cls += ' exclude'; icon = banSvg; }
                btn.className = cls;
                btn.innerHTML = icon + key;
            });
        }

        // 保存预设
        savePreset(name) {
            this.presets[name] = {
                levels: [...this.activeLevels],
                cats: [...this.activeCats],
                tags: { ...this.tagStates }
            };
            
            // 添加到顺序列表（如果是新的）
            if (!this.presetOrder.includes(name)) {
                this.presetOrder.push(name);
            }
            
            Utils.set(CONFIG.KEYS.SIEVE_PRESETS, this.presets);
            Utils.set(CONFIG.KEYS.SIEVE_PRESET_ORDER, this.presetOrder);
            
            this.refreshPresets();
        }

        // 加载预设
        loadPreset(name) {
            const preset = this.presets[name];
            if (!preset) return;
            
            this.activeLevels = [...(preset.levels || [])];
            this.activeCats = [...(preset.cats || [])];
            this.tagStates = { ...(preset.tags || {}) };
            
            Utils.set(CONFIG.KEYS.SIEVE_LEVELS, this.activeLevels);
            Utils.set(CONFIG.KEYS.SIEVE_CATS, this.activeCats);
            Utils.set(CONFIG.KEYS.SIEVE_TAGS, this.tagStates);
            
            this._filterDirty = true; // 标记筛选条件已变化
            this.updateAllBtns();
            this.filterTopics();
        }

        // 删除预设
        deletePreset(name) {
            delete this.presets[name];
            const idx = this.presetOrder.indexOf(name);
            if (idx >= 0) this.presetOrder.splice(idx, 1);
            
            Utils.set(CONFIG.KEYS.SIEVE_PRESETS, this.presets);
            Utils.set(CONFIG.KEYS.SIEVE_PRESET_ORDER, this.presetOrder);
            
            this.refreshPresets();
        }

        // 筛选帖子
        filterTopics() {
            const rows = document.querySelectorAll('.topic-list-body tr.topic-list-item');
            if (!rows.length) return 0;

            // 本方法会修改 spacer/加载行的 DOM，暂停行级观察器避免自触发
            this._suppressRowObserver = true;

            const { LEVELS, CATEGORIES, STATE } = SIEVE_CONFIG;
            let visibleCount = 0;
            let hiddenHeight = 0; // 记录被隐藏行的总高度

            const hasLevelMarkers = Array.from(rows).some(row => /\blv\d+\b/i.test(row.className));
            const isAllLevels = !hasLevelMarkers || !this.activeLevels.length || this.activeLevels.length === LEVELS.length;
            const isAllCats = !this.activeCats.length || this.activeCats.length === CATEGORIES.length;

            // 收集包含和排除的标签
            const includeTags = [];
            const excludeTags = [];
            SIEVE_CONFIG.TAGS.forEach(tag => {
                const s = this.tagStates[tag] || STATE.NEUTRAL;
                if (s === STATE.INCLUDE) includeTags.push(tag);
                if (s === STATE.EXCLUDE) excludeTags.push(tag);
            });

            rows.forEach(row => {
                const classListRaw = row.className;
                const classListArray = Array.from(row.classList);

                // 1. 等级匹配
                let levelMatch = isAllLevels;
                if (!levelMatch) {
                    for (let filter of LEVELS) {
                        if (this.activeLevels.includes(filter.key) && filter.check(classListRaw)) {
                            levelMatch = true;
                            break;
                        }
                    }
                }

                // 2. 分类匹配
                let categoryMatch = isAllCats;
                if (levelMatch && !categoryMatch) {
                    const categoryBadge = row.querySelector('.badge-category__wrapper span[data-category-id]');
                    if (categoryBadge) {
                        const cid = categoryBadge.getAttribute('data-category-id');
                        const pid = categoryBadge.getAttribute('data-parent-category-id');
                        if (this.activeCats.includes(cid) || (pid && this.activeCats.includes(pid))) {
                            categoryMatch = true;
                        }
                    } else {
                        categoryMatch = true;
                    }
                }

                // 3. 标签匹配
                let tagMatch = true;
                if (levelMatch && categoryMatch) {
                    const rowTags = classListArray
                        .filter(cls => cls.startsWith('tag-'))
                        .map(cls => {
                            let rawTag = cls.substring(4);
                            try { return decodeURIComponent(rawTag); } catch (e) { return rawTag; }
                        });
                    row.querySelectorAll('.discourse-tag').forEach(tagEl => {
                        const tagText = tagEl.textContent?.trim();
                        if (tagText && !rowTags.includes(tagText)) rowTags.push(tagText);
                    });

                    const hasNoTags = rowTags.length === 0;

                    if (excludeTags.length > 0) {
                        if (hasNoTags) {
                            if (excludeTags.includes("无标签")) tagMatch = false;
                        } else {
                            if (rowTags.some(t => excludeTags.includes(t))) tagMatch = false;
                        }
                    }

                    if (tagMatch && includeTags.length > 0) {
                        let hit = false;
                        if (hasNoTags) {
                            if (includeTags.includes("无标签")) hit = true;
                        } else {
                            if (rowTags.some(t => includeTags.includes(t))) hit = true;
                        }
                        if (!hit) tagMatch = false;
                    }
                }

                const shouldShow = levelMatch && categoryMatch && tagMatch;
                const isCurrentlyHidden = row.style.display === 'none';
                
                if (shouldShow) {
                    row.style.display = '';
                    visibleCount++;
                } else {
                    // 在隐藏之前测量高度（如果当前是显示状态）
                    if (!isCurrentlyHidden) {
                        hiddenHeight += row.offsetHeight;
                    }
                    row.style.display = 'none';
                }
            });

            // 更新 spacer 高度以补偿被隐藏的内容
            this.updateSpacer(hiddenHeight);

            // 恢复观察器（下一个微任务里 spacer 变更记录到达时已可安全忽略）
            this._suppressRowObserver = false;

            return visibleCount;
        }

        // 更新/创建 spacer 元素来补偿隐藏内容的高度
        updateSpacer() {
            const listBody = document.querySelector('.topic-list-body');
            if (!listBody) return;

            let spacer = document.getElementById('lda-sieve-spacer');
            let loadMoreRow = document.getElementById('lda-sieve-loadmore');
            const rows = listBody.querySelectorAll('tr.topic-list-item');
            let totalHiddenHeight = 0;

            rows.forEach(row => {
                if (row.style.display === 'none') {
                    totalHiddenHeight += parseInt(row.dataset.ldaHeight || '55', 10);
                } else {
                    row.dataset.ldaHeight = row.offsetHeight || 55;
                }
            });

            const { LEVELS, CATEGORIES, TAGS } = SIEVE_CONFIG;
            const hasLevelMarkers = Array.from(rows).some(row => /\blv\d+\b/i.test(row.className));
            const isAllLevels = !hasLevelMarkers || !this.activeLevels.length || this.activeLevels.length === LEVELS.length;
            const isAllCats = !this.activeCats.length || this.activeCats.length === CATEGORIES.length;
            const isAllTagsNeutral = TAGS.every(t => !this.tagStates[t]);
            const hasFilter = !(isAllLevels && isAllCats && isAllTagsNeutral);

            if (hasFilter && !this.isFooterReached()) {
                if (!loadMoreRow) {
                    loadMoreRow = document.createElement('tr');
                    loadMoreRow.id = 'lda-sieve-loadmore';
                    loadMoreRow.innerHTML = `
                        <td colspan="99" style="padding:15px 0;text-align:center;border:none;">
                            <button id="lda-sieve-loadmore-btn" style="
                                padding:8px 24px;
                                font-size:13px;
                                font-weight:500;
                                border:1px solid var(--tertiary, #3b82f6);
                                border-radius:6px;
                                background:transparent;
                                color:var(--tertiary, #3b82f6);
                                cursor:pointer;
                                transition:all 0.2s;
                            ">加载更多</button>
                            <span id="lda-sieve-loadmore-hint" style="
                                margin-left:10px;
                                font-size:12px;
                                color:var(--primary-medium, #999);
                            "></span>
                        </td>
                    `;
                    const btn = loadMoreRow.querySelector('#lda-sieve-loadmore-btn');
                    btn.addEventListener('click', () => this.handleLoadMore());
                    btn.addEventListener('mouseenter', () => {
                        btn.style.background = 'var(--tertiary, #3b82f6)';
                        btn.style.color = '#fff';
                    });
                    btn.addEventListener('mouseleave', () => {
                        btn.style.background = 'transparent';
                        btn.style.color = 'var(--tertiary, #3b82f6)';
                    });
                }
            } else {
                loadMoreRow?.remove();
                loadMoreRow = null;
            }

            if (totalHiddenHeight > 0) {
                if (!spacer) {
                    spacer = document.createElement('tr');
                    spacer.id = 'lda-sieve-spacer';
                    spacer.innerHTML = '<td colspan="99" style="padding:0;border:none;"></td>';
                    spacer.style.cssText = 'display:table-row;pointer-events:none;visibility:hidden;';
                    listBody.appendChild(spacer);
                }
                spacer.querySelector('td').style.height = totalHiddenHeight + 'px';
            } else {
                spacer?.remove();
                spacer = null;
            }

            const anchor = spacer || null;
            if (loadMoreRow && loadMoreRow.nextSibling !== anchor) {
                listBody.insertBefore(loadMoreRow, anchor);
            }
        }
        // 获取当前发现页的 TopicList 模型实例
        // 现代 Discourse（glimmer 版）：controller:discovery/list 的 model 是 { list, category, tag, ... } 包装对象，
        // 真正带 loadMore()/canLoadMore 的 TopicList 在 model.list 上。
        getTopicList() {
            // Discourse 2026.x：window.Discourse 本身就是 owner（ApplicationInstance），直接带 .lookup()
            // 旧版：容器在 window.Discourse.__container__ / _applicationInstance。两者都兼容。
            const d = window.Discourse;
            const owner = (d && typeof d.lookup === 'function')
                ? d
                : (d?.__container__ || d?._applicationInstance || null);
            const lookup = owner?.lookup?.bind(owner);
            if (!lookup) return null;

            const candidates = [];
            // model 可能是 { list, filterType } 包装对象，也可能本身就是 TopicList
            const pushModel = (m) => { if (m) candidates.push(m.list, m); };
            const pushCtrl = (c) => { if (c) { pushModel(c.model); candidates.push(c.topicList); } };

            // 当前路由名
            let routeName = null;
            try {
                const router = lookup('router:main') || lookup('service:router');
                routeName = router?.currentRouteName;
            } catch (_) { }

            // 1) 首选路由的 currentModel —— linux.do 实测：controller.model 为 null，
            //    真正的 TopicList 在 route.currentModel.list（route.currentModel = { list, filterType }）
            const routeKeys = [];
            if (routeName) routeKeys.push('route:' + routeName);
            routeKeys.push(
                'route:discovery.latest', 'route:discovery.new', 'route:discovery.top',
                'route:discovery.hot', 'route:discovery.unread',
                'route:discovery.category', 'route:discovery.categoryNone'
            );
            for (const key of routeKeys) {
                try { pushModel(lookup(key)?.currentModel); } catch (_) { }
            }

            // 2) 兜底：controller.model（部分版本/主题仍走这里）
            for (const key of ['controller:discovery/list', 'controller:discovery.list']) {
                try { pushCtrl(lookup(key)); } catch (_) { }
            }
            if (routeName) { try { pushCtrl(lookup('controller:' + routeName)); } catch (_) { } }

            for (const target of candidates) {
                if (target && typeof target.loadMore === 'function') return target;
            }
            return null;
        }

        // 是否存在有效筛选（等级/分类/标签任一非全选）
        hasActiveFilter() {
            const { LEVELS, CATEGORIES, TAGS } = SIEVE_CONFIG;
            const rows = document.querySelectorAll('.topic-list-body tr.topic-list-item');
            const hasLevelMarkers = Array.from(rows).some(row => /\blv\d+\b/i.test(row.className));
            const isAllLevels = !hasLevelMarkers || !this.activeLevels.length || this.activeLevels.length === LEVELS.length;
            const isAllCats = !this.activeCats.length || this.activeCats.length === CATEGORIES.length;
            const isAllTagsNeutral = TAGS.every(t => !this.tagStates[t]);
            return !(isAllLevels && isAllCats && isAllTagsNeutral);
        }

        // 触发一次“加载下一页”。优先直接驱动 TopicList 模型，失败再点击原生按钮兜底。
        async loadMoreWithDiscourse() {
            const list = this.getTopicList();
            if (list && typeof list.loadMore === 'function') {
                try {
                    // canLoadMore 为 false 表示已无更多内容
                    if (list.canLoadMore === false) return false;
                    await list.loadMore();
                    return true;
                } catch (_) { /* 落到 DOM 兜底 */ }
            }

            // 兜底1：站点主题若渲染了可见的“加载更多”按钮则点击它
            const visibleBtn = Array.from(document.querySelectorAll('button, .btn'))
                .find(el => el.id !== 'lda-sieve-loadmore-btn'
                    && el.offsetParent !== null
                    && /加载更多|load more/i.test(el.textContent || ''));
            if (visibleBtn) {
                visibleBtn.click();
                return true;
            }

            // 兜底2：滚到底触发原生无限滚动的 sentinel（不依赖任何内部接口，6.5.1 做法）
            return await this.triggerNativeByScroll();
        }

        // 通过滚动让原生 .load-more-sentinel 进入视口，触发 Discourse 原生续载
        async triggerNativeByScroll() {
            const sentinel = document.querySelector('.load-more-sentinel')
                || document.querySelector('footer.topic-list-bottom')
                || document.getElementById('topic-list-bottom');
            if (!sentinel) return false;

            // 临时把 spacer 收成 0，让 sentinel 能真正进入视口
            const spacerTd = document.getElementById('lda-sieve-spacer')?.querySelector('td');
            const savedHeight = spacerTd?.style.height;
            if (spacerTd) spacerTd.style.height = '0';

            const scrollPos = window.scrollY;
            try {
                sentinel.scrollIntoView({ block: 'end' });
            } catch (_) {
                window.scrollTo(0, document.body.scrollHeight);
            }

            // 等待加载 spinner 结束（或 5s 超时）
            await new Promise(resolve => {
                const start = Date.now();
                const check = () => {
                    if (!this.isLoading() || Date.now() - start > 5000) { resolve(); return; }
                    setTimeout(check, 200);
                };
                setTimeout(check, 500);
            });

            // 恢复滚动位置与 spacer 高度（后续 filterTopics 会重新精确计算）
            window.scrollTo(0, scrollPos);
            if (spacerTd && savedHeight != null) spacerTd.style.height = savedHeight;
            return true;
        }

        // 手动加载更多帖子
        async handleLoadMore() {
            if (this.isLoadingMore) return;
            this.isLoadingMore = true;

            const btn = document.getElementById('lda-sieve-loadmore-btn');
            const hint = document.getElementById('lda-sieve-loadmore-hint');

            try {
                const beforeCount = this.filterTopics();
                let afterCount = beforeCount;
                let reachedEnd = false;
                let changed = false;

                if (btn) {
                    btn.textContent = '加载中...';
                    btn.style.opacity = '0.6';
                    btn.style.pointerEvents = 'none';
                }
                if (hint) hint.textContent = '';

                // 每次点击只加载「一页」（Discourse 默认 30 条）：一次点击 = 一次请求，
                // 由用户自行决定是否继续点，避免连续翻页疯狂请求触发站点风控/封号。
                if (this.isFooterReached()) {
                    reachedEnd = true;
                } else {
                    const beforeSignature = this.getTopicListSignature();
                    const used = await this.loadMoreWithDiscourse();
                    if (used) {
                        changed = await this.waitForTopicListChange(beforeSignature, 6000);
                        reachedEnd = this.isFooterReached();
                        this._filterDirty = true;
                        afterCount = this.filterTopics();
                    }
                }

                this._filterDirty = true;
                afterCount = this.filterTopics();
                const diff = afterCount - beforeCount;

                if (hint) {
                    if (reachedEnd || this.isFooterReached()) {
                        hint.textContent = '✓ 已加载全部内容';
                        hint.style.color = '#22c55e';
                    } else if (diff > 0) {
                        hint.textContent = `✓ 新增 ${diff} 条符合条件的帖子`;
                        hint.style.color = '#22c55e';
                    } else if (changed) {
                        hint.textContent = '本页无符合项，可再点「加载更多」继续找';
                        hint.style.color = '#f59e0b';
                    } else {
                        hint.textContent = '未检测到新内容，请稍后再试';
                        hint.style.color = '#f59e0b';
                    }

                    setTimeout(() => {
                        if (hint) hint.textContent = '';
                    }, 5000);
                }
            } finally {
                if (btn) {
                    btn.textContent = '加载更多';
                    btn.style.opacity = '1';
                    btn.style.pointerEvents = '';
                }
                this.isLoadingMore = false;
            }
        }
        getTopicListSignature() {
            return Array.from(document.querySelectorAll('.topic-list-body tr.topic-list-item'))
                .map(row => row.dataset.topicId || row.querySelector('a.title, a.raw-topic-link')?.href || row.textContent.trim().slice(0, 80))
                .join('|');
        }

        waitForTopicListChange(beforeSignature, timeout = 8000) {
            return new Promise(resolve => {
                const startTime = Date.now();
                let sawLoading = false;
                const check = () => {
                    const changed = this.getTopicListSignature() !== beforeSignature;
                    if (changed) {
                        resolve(true);
                        return;
                    }
                    if (this.isLoading()) sawLoading = true;
                    if (this.isFooterReached() || Date.now() - startTime > timeout) {
                        resolve(false);
                        return;
                    }
                    if (sawLoading && !this.isLoading() && Date.now() - startTime > 800) {
                        resolve(false);
                        return;
                    }
                    setTimeout(check, 200);
                };
                setTimeout(check, 300);
            });
        }

        // 移除 spacer 和加载按钮（销毁时调用）
        removeSpacer() {
            const spacer = document.getElementById('lda-sieve-spacer');
            if (spacer) spacer.remove();
            
            const loadMoreRow = document.getElementById('lda-sieve-loadmore');
            if (loadMoreRow) loadMoreRow.remove();
            
            // 清除缓存的高度数据
            const rows = document.querySelectorAll('.topic-list-body tr.topic-list-item');
            rows.forEach(row => delete row.dataset.ldaHeight);
        }

        clearFilterEffects() {
            document.querySelectorAll('.topic-list-body tr.topic-list-item').forEach(row => {
                row.style.display = '';
                row.style.visibility = '';
                delete row.dataset.ldaTempShown;
                delete row.dataset.ldaHeight;
            });
            this.removeSpacer();
            this._lastRowCount = 0;
            this._filterDirty = true;
        }
        // 确保行级观察器已挂在当前 .topic-list-body 上
        // 新帖子行插入时，在浏览器绘制前同步筛掉不匹配行，彻底消除“加载时闪一下”
        ensureRowObserver() {
            const body = document.querySelector('.topic-list-body');
            if (!body) return;
            // 已挂在同一节点上则无需重挂（列表整体重渲染会换掉 body，需要重挂）
            if (this.rowObserver && this._rowObserverTarget === body) return;

            if (this.rowObserver) this.rowObserver.disconnect();
            this._rowObserverTarget = body;
            this.rowObserver = new MutationObserver((mutations) => {
                if (this.isDestroyed || this._suppressRowObserver || !this.isHomePage()) return;

                let addedRow = false;
                for (const m of mutations) {
                    for (const node of m.addedNodes) {
                        if (node.nodeType === 1 && node.classList && node.classList.contains('topic-list-item')) {
                            addedRow = true;
                            break;
                        }
                    }
                    if (addedRow) break;
                }
                // 只有新增了真实帖子行、且当前有筛选时才处理；否则放手让原生列表自然工作
                if (!addedRow || !this.hasActiveFilter()) return;

                this._filterDirty = true;
                this.filterTopics(); // 同步执行：MutationObserver 回调在绘制前运行，故不会闪
            });
            this.rowObserver.observe(body, { childList: true });
        }

        // 启动筛选循环
        startFilterLoop() {
            if (this.checkInterval) clearInterval(this.checkInterval);
            this.checkInterval = setInterval(() => this.forceLoadLoop(), 1500);
        }

        // 筛选循环（只执行筛选，不自动滚动加载）
        forceLoadLoop() {
            if (this.isDestroyed || this.isLoadingMore) return;
            
            // 检查是否在首页
            if (!this.isHomePage()) {
                this.updateStatus('');
                return;
            }

            // 确保行级观察器挂在最新的列表容器上（列表重渲染会换掉容器）
            this.ensureRowObserver();

            // 内存优化：变化检测，只在帖子数量变化或筛选条件变化时执行完整筛选
            const rows = document.querySelectorAll('.topic-list-body tr.topic-list-item');
            const currentRowCount = rows.length;
            const hasChange = this._filterDirty || currentRowCount !== this._lastRowCount;
            
            if (!hasChange) {
                // 无变化，跳过筛选，只更新状态
                return;
            }
            
            // 更新计数器
            this._lastRowCount = currentRowCount;
            this._filterDirty = false;

            const currentCount = this.filterTopics();
            const { LEVELS, CATEGORIES, TAGS } = SIEVE_CONFIG;
            
            const hasLevelMarkers = Array.from(rows).some(row => /\blv\d+\b/i.test(row.className));
            const isAllLevels = !hasLevelMarkers || !this.activeLevels.length || this.activeLevels.length === LEVELS.length;
            const isAllCats = !this.activeCats.length || this.activeCats.length === CATEGORIES.length;
            const isAllTagsNeutral = TAGS.every(t => !this.tagStates[t]);

            // 如果所有筛选都是全选状态，隐藏状态
            if (isAllLevels && isAllCats && isAllTagsNeutral) {
                this.updateStatus('');
                return;
            }

            // 只显示筛选状态，不再自动滚动加载
            if (this.isFooterReached()) {
                this.updateStatus(`已加载全部 (${currentCount} 条)`, 'end');
            } else if (this.isLoading()) {
                this.updateStatus(`加载中... (${currentCount} 条)`, 'loading');
            } else {
                this.updateStatus(`筛选中 (${currentCount} 条)`, 'done');
            }
        }

        // 判断是否到达底部
        isFooterReached() {
            // 优先用模型状态判断：more_topics_url 为空即无更多内容（权威、与语言无关）
            const list = this.getTopicList();
            if (list) {
                if (typeof list.canLoadMore === 'boolean') return !list.canLoadMore;
                if ('more_topics_url' in list) return !list.more_topics_url;
            }
            // 兜底：扫描底部提示文案
            const endTextRe = /没有更多|已到底|no more|end of list|that's all/i;
            const footerMessage = document.querySelector('.footer-message');
            const bottom = document.getElementById('topic-list-bottom');
            return [footerMessage, bottom].some(el => endTextRe.test((el?.textContent || '').trim()));
        }

        // 判断是否正在加载
        isLoading() {
            const spinner = document.querySelector('.spinner');
            return spinner && spinner.offsetParent !== null;
        }

        // 更新状态显示
        updateStatus(text, type = '') {
            if (!this.statusEl) return;
            this.statusEl.textContent = text;
            this.statusEl.className = 'lda-sieve-status' + (text ? ' visible' : '') + (type ? ` ${type}` : '');
        }

        // 监听 URL 变化
        setupUrlWatcher() {
            if (this.observer) this.observer.disconnect();
            
            // 内存优化：使用防抖机制，避免频繁触发
            // Discourse 论坛 DOM 变化极其频繁，不加防抖会导致内存持续增长
            this.observer = new MutationObserver(() => {
                // 防抖：200ms 内多次变化只执行一次
                if (this._urlWatcherTimer) clearTimeout(this._urlWatcherTimer);
                this._urlWatcherTimer = setTimeout(() => {
                    this._urlWatcherTimer = null;
                    if (this.isDestroyed) return;
                    
                    const url = location.href;
                    if (url !== this.lastUrl) {
                        this.lastUrl = url;
                        this.onUrlChange();
                    }
                    // 如果面板被移除，重新创建
                    if (!document.getElementById('lda-sieve-panel') && this.isHomePage()) {
                        this.panel = null;
                        this.createUI();
                    }
                }, 200);
            });
            
            this.observer.observe(document, { subtree: true, childList: true });
        }

        // URL 变化时重新初始化
        onUrlChange() {
            if (this.isDestroyed) return;
            
            if (this.isHomePage()) {
                // 创建 UI（如果还没有的话）
                if (!this.panel) {
                    this.createUI();
                } else {
                    // 如果面板存在但被隐藏，显示它
                    this.panel.style.display = '';
                }
                // 确保筛选循环在运行（从非首页跳转到首页时可能没有启动）
                if (!this.checkInterval) {
                    this.startFilterLoop();
                }
                // URL 变化时重置计数器，强制重新筛选
                this._lastRowCount = 0;
                this._filterDirty = true;
                this.filterTopics();
            } else {
                // 非首页时恢复筛选器改过的列表，避免污染分类页等 Discourse 原生列表
                this.clearFilterEffects();
                if (this.panel) {
                    this.panel.style.display = 'none';
                }
            }
        }
    }

    // 主程序
    class App {
        constructor() {
            this.state = {
                lang: Utils.get(CONFIG.KEYS.LANG, 'zh'),
                theme: Utils.get(CONFIG.KEYS.THEME, 'auto'),
                height: Utils.get(CONFIG.KEYS.HEIGHT, 'auto'), // Default: Auto
                expand: Utils.get(CONFIG.KEYS.EXPAND, false),  // Default: False
                trustCache: Utils.get(CONFIG.KEYS.CACHE_TRUST, {}),
                tabOrder: Utils.get(CONFIG.KEYS.TAB_ORDER, ['trust', 'credit', 'cdk']), // 标签顺序
                refreshInterval: Utils.get(CONFIG.KEYS.REFRESH_INTERVAL, 120), // 分钟，0 为关闭；默认 2 小时
                opacity: Utils.get(CONFIG.KEYS.OPACITY, 1),
                gainAnim: Utils.get(CONFIG.KEYS.GAIN_ANIM, true), // 涨分动画，默认开启
                useClassicIcon: Utils.get(CONFIG.KEYS.USE_CLASSIC_ICON, false), // 使用经典地球图标，默认关闭
                useCustomIcon: Utils.get(CONFIG.KEYS.USE_CUSTOM_ICON, false), // 使用自定义图标，默认关闭
                iconSize: Utils.get(CONFIG.KEYS.ICON_SIZE, 'sm'), // 小秘书图标尺寸，默认小
                displayMode: Utils.get(CONFIG.KEYS.DISPLAY_MODE, 'header'), // 显示模式：float（悬浮球）/ header（顶栏按钮），默认顶栏按钮
                sieveEnabled: Utils.get(CONFIG.KEYS.SIEVE_ENABLED, true), // 主页筛选工具开关，默认开启
                fontSize: Utils.get(CONFIG.KEYS.FONT_SIZE, 100), // 字体大小百分比，默认100%
                settingSubTab: Utils.get(CONFIG.KEYS.SETTING_SUB_TAB, 'func'), // 设置页子标签：func / appearance
                showDailyRank: Utils.get(CONFIG.KEYS.SHOW_DAILY_RANK, false) // 显示每日排名，默认关闭
            };
            this.iconCache = Utils.get(CONFIG.KEYS.ICON_CACHE, null); // 小秘书图标缓存
            // 用户自定义图标 {normal: base64, hover?: base64}，兼容旧版单字符串格式
            const savedCustomIcon = Utils.get(CONFIG.KEYS.CUSTOM_ICON, null);
            if (typeof savedCustomIcon === 'string') {
                // 旧格式迁移：单字符串 -> {normal: string}
                this.customIcon = { normal: savedCustomIcon };
                Utils.set(CONFIG.KEYS.CUSTOM_ICON, this.customIcon);
            } else {
                this.customIcon = savedCustomIcon; // {normal, hover} 或 null
            }
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
            this.lastRefreshAttempt = { trust: 0, credit: 0, cdk: 0 }; // 上次请求尝试时间（用于全局冷却）
            this.dom = {};
            this.sieveModule = null; // 筛选工具模块实例
            this._tickDebounceTimer = null; // tick 防抖计时器
            this._globalEventsBound = false; // 防止事件监听器重复绑定

            // 存储/缓存格式校验（避免旧版本残留导致错误状态）
            this.ensureStorageSchema();
            this.validateLoadedCache();
        }

        async init(forceOpen = false) {
            // 设置全局 Toast 回调
            Utils.setShowToastCallback((msg, type, duration) => this.showToast(msg, type, duration));
            
            if (this.autoRefreshTimer) {
                clearInterval(this.autoRefreshTimer);
                this.autoRefreshTimer = null;
            }
            GM_addStyle(Styles);
            this.renderLayout();
            const isHeaderMode = this.state.displayMode === 'header';
            if (!isHeaderMode) {
                this.updateBallIcon(); // 初始化悬浮球图标
                this.loadSecretaryIcons().then(() => this.updateBallIcon()); // 异步加载并缓存图标
            }
            this.bindGlobalEvents();
            this.startUserWatcher();
            this.applyTheme();
            this.applyHeight();
            this.applyOpacity();
            this.applyFontSize();
            // 顶栏模式不需要恢复位置和计算面板方向
            if (!isHeaderMode) {
                this.restorePos();
                this.updatePanelSide();
            }
            this.renderFromCacheAll();
            this.prewarmAll();
            this.startAutoRefreshTimer();
            this.maybeAutoCheckUpdate();
            
            // 初始化筛选工具（如果启用且在首页）
            this.initSieveIfNeeded();

            if (this.state.expand || forceOpen) {
                this.togglePanel(true);
            }
        }

        t(key) { return I18N[this.state.lang][key] || key; }

        // 随机获取小秘书撒娇文案
        getRandomSupportDesc() {
            const descs = I18N[this.state.lang].support_desc;
            if (Array.isArray(descs) && descs.length > 0) {
                return descs[Math.floor(Math.random() * descs.length)];
            }
            return descs || '';
        }

        // ========== 返回1楼功能 ==========
        // 检测是否在帖子楼层页面（非1楼）
        // URL格式：/t/topic-slug/帖子ID/楼层号，其中楼层号 > 1 时才需要跳转
        isTopicFloorPage() {
            const path = window.location.pathname;
            // 匹配 /t/xxx/帖子ID/楼层号 格式（4段路径）
            const match = path.match(/^\/t\/[^\/]+\/\d+\/(\d+)$/);
            if (match) {
                const floor = parseInt(match[1], 10);
                return floor > 1;
            }
            return false;
        }

        // 获取1楼的URL
        getFirstFloorUrl() {
            const path = window.location.pathname;
            // 移除末尾的楼层号（只处理 /t/xxx/帖子ID/楼层号 格式）
            const firstFloorPath = path.replace(/^(\/t\/[^\/]+\/\d+)\/\d+$/, '$1');
            return window.location.origin + firstFloorPath;
        }

        // 跳转到1楼
        navigateToFirstFloor() {
            if (!this.isTopicFloorPage()) return false;
            const url = this.getFirstFloorUrl();
            window.location.href = url;
            return true;
        }

        renderLayout() {
            const isHeaderMode = this.state.displayMode === 'header';
            const root = document.createElement('div');
            root.id = 'lda-root';
            root.className = isHeaderMode ? 'lda-header-mode' : 'lda-side-left';
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
                head: Utils.el('.lda-head', root),
                headerBtn: null
            };

            // 顶栏按钮模式：在 header-buttons 中创建按钮
            if (isHeaderMode) {
                this.createHeaderButton();
            }

            this.renderSettings();
            this.updateThemeIcon();
        }

        // 创建顶栏按钮
        createHeaderButton() {
            // 移除已存在的顶栏按钮
            const existingBtn = document.getElementById('lda-header-btn');
            if (existingBtn) existingBtn.remove();

            const headerButtons = document.querySelector('.header-buttons');
            if (!headerButtons) {
                // 如果找不到 header-buttons，延迟重试
                setTimeout(() => this.createHeaderButton(), 500);
                return;
            }

            const btn = document.createElement('span');
            btn.id = 'lda-header-btn';
            btn.className = 'lda-header-btn';
            btn.title = this.t('title');

            // 根据图标设置决定显示内容（优先级：自定义图标 > 小秘书图标 > 经典图标）
            if (this.state.useCustomIcon && this.customIcon?.normal) {
                // 用户自定义图标（hover图可选，没有则用normal图）
                const normalUrl = this.customIcon.normal;
                const hoverUrl = this.customIcon.hover || this.customIcon.normal;
                btn.innerHTML = `<span class="lda-header-btn-img-wrap"><img class="lda-header-btn-img lda-header-btn-img-normal" src="${normalUrl}" alt=""><img class="lda-header-btn-img lda-header-btn-img-hover" src="${hoverUrl}" alt=""></span>小秘书`;
            } else if (this.state.useClassicIcon) {
                btn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>小秘书`;
            } else {
                // 使用小秘书图标（带 hover 效果）
                const normalUrl = this.iconCache?.normal || SECRETARY_ICONS.normal;
                const hoverUrl = this.iconCache?.hover || SECRETARY_ICONS.hover;
                btn.innerHTML = `<span class="lda-header-btn-img-wrap"><img class="lda-header-btn-img lda-header-btn-img-normal" src="${normalUrl}" alt=""><img class="lda-header-btn-img lda-header-btn-img-hover" src="${hoverUrl}" alt=""></span>小秘书`;
            }

            // 长按返回1楼相关变量
            let longPressTimer = null;
            let longPressTriggered = false;
            const LONG_PRESS_DURATION = 500;

            const cancelLongPress = () => {
                if (longPressTimer) {
                    clearTimeout(longPressTimer);
                    longPressTimer = null;
                }
                btn.classList.remove('lda-long-pressing');
            };

            const triggerLongPress = () => {
                longPressTriggered = true;
                cancelLongPress();
                btn.classList.add('lda-long-pressing');
                if (this.navigateToFirstFloor()) {
                    this.showToast(this.t('back_to_first'), 'success', 1500);
                }
            };

            // 鼠标事件
            btn.onmousedown = (e) => {
                if (e.button !== 0) return;
                longPressTriggered = false;
                if (this.isTopicFloorPage()) {
                    longPressTimer = setTimeout(triggerLongPress, LONG_PRESS_DURATION);
                }
            };

            btn.onmouseup = () => cancelLongPress();
            btn.onmouseleave = () => cancelLongPress();

            btn.onclick = (e) => {
                e.stopPropagation();
                if (longPressTriggered) {
                    longPressTriggered = false;
                    return;
                }
                this.togglePanel(this.dom.panel.style.display !== 'flex');
            };

            // 触摸事件
            let touchLongPressTimer = null;
            let touchLongPressTriggered = false;

            const cancelTouchLongPress = () => {
                if (touchLongPressTimer) {
                    clearTimeout(touchLongPressTimer);
                    touchLongPressTimer = null;
                }
                btn.classList.remove('lda-long-pressing');
            };

            const triggerTouchLongPress = () => {
                touchLongPressTriggered = true;
                cancelTouchLongPress();
                btn.classList.add('lda-long-pressing');
                if (navigator.vibrate) navigator.vibrate(50);
                if (this.navigateToFirstFloor()) {
                    this.showToast(this.t('back_to_first'), 'success', 1500);
                }
            };

            btn.ontouchstart = (e) => {
                touchLongPressTriggered = false;
                if (this.isTopicFloorPage()) {
                    touchLongPressTimer = setTimeout(triggerTouchLongPress, LONG_PRESS_DURATION);
                }
            };

            btn.ontouchend = () => {
                cancelTouchLongPress();
                if (!touchLongPressTriggered) {
                    // 正常点击，触发展开/收起面板（延迟一点以避免与长按冲突）
                }
                touchLongPressTriggered = false;
            };

            btn.ontouchcancel = () => cancelTouchLongPress();

            headerButtons.insertBefore(btn, headerButtons.firstChild);
            this.dom.headerBtn = btn;
        }

        renderSettings() {
            const { lang, height, expand, tabOrder, refreshInterval, opacity, gainAnim, useClassicIcon, useCustomIcon, iconSize, displayMode, sieveEnabled, fontSize, settingSubTab, showDailyRank } = this.state;
            const r = (val, cur) => val === cur ? 'active' : '';
            const opacityVal = Math.max(0.5, Math.min(1, Number(opacity) || 1));
            const opacityPercent = Math.round(opacityVal * 100);
            const fontSizeVal = Math.max(70, Math.min(130, Number(fontSize) || 100));

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

            // 子标签状态
            const subTabFunc = settingSubTab === 'func' ? 'active' : '';
            const subTabAppearance = settingSubTab === 'appearance' ? 'active' : '';

            this.dom.setting.innerHTML = Utils.html`
                <div class="lda-sub-tabs">
                    <div class="lda-sub-tab ${subTabFunc}" data-subtab="func">${this.t('set_func')}</div>
                    <div class="lda-sub-tab ${subTabAppearance}" data-subtab="appearance">${this.t('set_appearance')}</div>
                </div>
                <div class="lda-sub-page ${subTabFunc}" id="sub-page-func">
                    <div class="lda-card">
                        <div class="lda-opt" style="flex-wrap:wrap;gap:12px 20px;">
                            <div style="display:flex;align-items:center;gap:6px;">
                                <label class="lda-switch"><input type="checkbox" id="inp-expand" ${expand ? 'checked' : ''}><span class="lda-slider"></span></label>
                                <span style="font-size:12px">${this.t('set_auto')}</span>
                            </div>
                            <div style="display:flex;align-items:center;gap:6px;">
                                <label class="lda-switch"><input type="checkbox" id="inp-gain-anim" ${gainAnim ? 'checked' : ''}><span class="lda-slider"></span></label>
                                <span style="font-size:12px">${this.t('set_gain_anim')}</span>
                            </div>
                            <div style="display:flex;align-items:center;gap:6px;">
                                <label class="lda-switch"><input type="checkbox" id="inp-sieve-enabled" ${sieveEnabled ? 'checked' : ''}><span class="lda-slider"></span></label>
                                <span style="font-size:12px">${this.t('set_sieve')}</span>
                                <span style="font-size:9px;color:var(--lda-dim);opacity:0.7;">${this.t('sieve_tip')}</span>
                            </div>
                            <div style="display:flex;align-items:center;gap:6px;">
                                <label class="lda-switch"><input type="checkbox" id="inp-show-daily-rank" ${showDailyRank ? 'checked' : ''}><span class="lda-slider"></span></label>
                                <span style="font-size:12px">${this.t('set_show_daily_rank')}</span>
                            </div>
                        </div>
                        <div class="lda-opt">
                            <div>
                                <div class="lda-opt-label">${this.t('set_refresh')}</div>
                                <div style="font-size:10px;color:var(--lda-dim);margin-top:2px;">${this.t('refresh_tip')}</div>
                            </div>
                            <div class="lda-seg" id="grp-refresh">
                                <div class="lda-seg-item ${r(30, refreshInterval)}" data-v="30">${this.t('refresh_30')}</div>
                                <div class="lda-seg-item ${r(60, refreshInterval)}" data-v="60">${this.t('refresh_60')}</div>
                                <div class="lda-seg-item ${r(120, refreshInterval)}" data-v="120">${this.t('refresh_120')}</div>
                                <div class="lda-seg-item ${r(0, refreshInterval)}" data-v="0">${this.t('refresh_off')}</div>
                            </div>
                        </div>
                        <div class="lda-opt" style="flex-direction:column; align-items:stretch;">
                            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                                <div class="lda-opt-label">${this.t('set_tab_order')}</div>
                                <span style="font-size:10px; color:var(--lda-dim)">${this.t('tab_order_tip')}</span>
                            </div>
                            <div class="lda-sortable" id="sortable-tabs">
                                ${sortItemsHtml}
                            </div>
                            <button class="lda-sort-btn" id="btn-save-order">${this.t('tab_order_save')}</button>
                        </div>
                    </div>
                </div>
                <div class="lda-sub-page ${subTabAppearance}" id="sub-page-appearance">
                    <div class="lda-card">
                        <div class="lda-opt" style="flex-wrap:wrap;gap:12px 20px;">
                            <div style="display:flex;align-items:center;gap:6px;">
                                <label class="lda-switch"><input type="checkbox" id="inp-classic-icon" ${useClassicIcon ? 'checked' : ''} ${useCustomIcon ? 'disabled' : ''}><span class="lda-slider"></span></label>
                                <span style="font-size:12px">${this.t('set_classic_icon')}</span>
                            </div>
                            <div style="display:flex;align-items:center;gap:6px;">
                                <label class="lda-switch"><input type="checkbox" id="inp-header-mode" ${displayMode === 'header' ? 'checked' : ''}><span class="lda-slider"></span></label>
                                <span style="font-size:12px">${displayMode === 'header' ? this.t('set_show_float_icon') : this.t('set_show_header_btn')}</span>
                            </div>
                        </div>
                        <div class="lda-opt lda-custom-icon-opt" style="flex-wrap:wrap;gap:8px;align-items:flex-start;">
                            <span style="font-size:12px;color:var(--lda-dim);width:100%;">${this.t('set_custom_icon')}</span>
                            <div id="lda-custom-icon-area" style="display:flex;flex-wrap:wrap;align-items:center;gap:8px;">
                                ${this.customIcon?.normal ? `
                                    <div style="display:flex;align-items:center;gap:4px;">
                                        <img src="${this.customIcon.normal}" style="width:32px;height:32px;border-radius:50%;object-fit:contain;border:1px solid var(--lda-border-color);background:var(--lda-bg);" title="默认图">
                                        <button class="lda-btn-small" id="btn-change-custom-icon">${this.t('custom_icon_change')}</button>
                                        <button class="lda-btn-small lda-btn-danger" id="btn-delete-custom-icon">${this.t('custom_icon_delete')}</button>
                                    </div>
                                    ${this.customIcon?.hover ? `
                                        <div style="display:flex;align-items:center;gap:4px;">
                                            <img src="${this.customIcon.hover}" style="width:32px;height:32px;border-radius:50%;object-fit:contain;border:1px solid var(--lda-border-color);background:var(--lda-bg);" title="悬停图">
                                            <button class="lda-btn-small" id="btn-change-custom-icon-hover">${this.t('custom_icon_change')}</button>
                                            <button class="lda-btn-small lda-btn-danger" id="btn-delete-custom-icon-hover">${this.t('custom_icon_delete_hover')}</button>
                                        </div>
                                    ` : `
                                        <button class="lda-btn-small" id="btn-upload-custom-icon-hover">${this.t('custom_icon_upload_hover')}</button>
                                    `}
                                ` : `
                                    <button class="lda-btn-small" id="btn-upload-custom-icon">${this.t('custom_icon_upload')}</button>
                                `}
                                <input type="file" id="inp-custom-icon-file" accept="image/png,image/jpeg,image/gif,image/webp" style="display:none;" data-icon-type="normal">
                            </div>
                            <span style="font-size:10px;color:var(--lda-dim);width:100%;">${this.t('custom_icon_tip')}</span>
                        </div>
                        <div class="lda-opt" style="flex-wrap:wrap;gap:10px;">
                            <div id="lda-icon-size-opt" style="display:flex;align-items:center;gap:8px;${useClassicIcon && !useCustomIcon ? 'display:none;' : ''}">
                                <span style="font-size:12px;color:var(--lda-dim);">${this.t('set_icon_size')}</span>
                                <div class="lda-seg" id="grp-icon-size">
                                    <div class="lda-seg-item ${r('sm', iconSize)}" data-v="sm">${this.t('icon_size_sm')}</div>
                                    <div class="lda-seg-item ${r('md', iconSize)}" data-v="md">${this.t('icon_size_md')}</div>
                                    <div class="lda-seg-item ${r('lg', iconSize)}" data-v="lg">${this.t('icon_size_lg')}</div>
                                </div>
                            </div>
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
                            <span style="font-size:12px;white-space:nowrap;">${this.t('set_font_size')}</span>
                            <div class="lda-font-row" style="flex:1;">
                                <input type="range" min="70" max="130" step="5" value="${fontSizeVal}" id="inp-font-size" class="lda-font-slider">
                                <div style="display:flex;flex-direction:column;align-items:center;gap:2px;">
                                    <span id="val-font-size" class="lda-font-val">${fontSizeVal}%</span>
                                    <button id="btn-font-reset" class="lda-font-reset">${this.t('font_size_reset')}</button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="lda-support">
                    <div class="lda-support-header">
                        <div class="lda-support-title">
                            <span class="lda-support-heart">💖</span>
                            ${this.t('support_title')}
                        </div>
                        <div class="lda-support-desc">${this.getRandomSupportDesc()}</div>
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
            this.bindSettingSubTabs();
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

        bindSettingSubTabs() {
            const subTabs = Utils.els('.lda-sub-tab', this.dom.setting);
            const subPages = Utils.els('.lda-sub-page', this.dom.setting);

            subTabs.forEach(tab => {
                tab.onclick = (e) => {
                    e.stopPropagation();
                    const target = tab.dataset.subtab;
                    if (target === this.state.settingSubTab) return;

                    // 更新状态
                    this.state.settingSubTab = target;
                    Utils.set(CONFIG.KEYS.SETTING_SUB_TAB, target);

                    // 更新 UI
                    subTabs.forEach(t => t.classList.remove('active'));
                    subPages.forEach(p => p.classList.remove('active'));
                    tab.classList.add('active');
                    const page = Utils.el(`#sub-page-${target}`, this.dom.setting);
                    if (page) page.classList.add('active');

                    // 如果切换到功能设置，重新绑定排序事件（因为可能已经失效）
                    if (target === 'func') {
                        this.initSortable();
                    }
                };
            });

            // 字体大小调节
            const fontSlider = Utils.el('#inp-font-size', this.dom.setting);
            const fontVal = Utils.el('#val-font-size', this.dom.setting);
            const fontResetBtn = Utils.el('#btn-font-reset', this.dom.setting);

            if (fontSlider) {
                fontSlider.oninput = (e) => {
                    e.stopPropagation();
                    const val = Math.max(70, Math.min(130, Number(e.target.value) || 100));
                    this.state.fontSize = val;
                    Utils.set(CONFIG.KEYS.FONT_SIZE, val);
                    if (fontVal) fontVal.textContent = `${val}%`;
                    this.applyFontSize();
                };
            }

            if (fontResetBtn) {
                fontResetBtn.onclick = (e) => {
                    e.stopPropagation();
                    this.state.fontSize = 100;
                    Utils.set(CONFIG.KEYS.FONT_SIZE, 100);
                    if (fontSlider) fontSlider.value = 100;
                    if (fontVal) fontVal.textContent = '100%';
                    this.applyFontSize();
                };
            }
        }

        applyFontSize() {
            const size = this.state.fontSize || 100;
            const root = this.dom.root;
            if (root) {
                // 使用 CSS 变量控制全局字体缩放
                root.style.setProperty('--lda-font-scale', size / 100);
            }
        }

        bindGlobalEvents() {
            Utils.el('#lda-btn-close').onclick = () => this.togglePanel(false);
            Utils.el('#lda-btn-update').onclick = (e) => { e.stopPropagation(); this.checkUpdate({ isAuto: false, force: true }); };

            // 防止 window/document 级事件监听器重复绑定（init 可能被多次调用）
            if (!this._globalEventsBound) {
                this._globalEventsBound = true;

                // 点击页面其他地方收起面板
                document.addEventListener('click', (e) => {
                    // 检查 dom.root 是否仍在文档中
                    if (this.dom.root && document.contains(this.dom.root) &&
                        !this.dom.root.contains(e.target) && this.dom.panel.style.display === 'flex') {
                        this.togglePanel(false);
                    }
                });

                // 窗口获得焦点时自动刷新（用户授权后回来）
                window.addEventListener('focus', () => this.refreshOnFocusIfNeeded());

                window.addEventListener('resize', () => {
                    // 顶栏模式不需要更新面板方向
                    if (this.state.displayMode !== 'header') {
                        this.updatePanelSide();
                    }
                });
            }

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
                    this.updateHeaderButtonIcon();
                    // 切换图标尺寸选项的显示/隐藏（自定义图标优先级高于经典图标）
                    const iconSizeOpt = Utils.el('#lda-icon-size-opt', this.dom.setting);
                    if (iconSizeOpt) {
                        iconSizeOpt.style.display = (e.target.checked && !this.state.useCustomIcon) ? 'none' : 'flex';
                    }
                    // 如果切换到小秘书模式且没有缓存，重新加载图标
                    if (!e.target.checked && !this.iconCache && !this.state.useCustomIcon) {
                        this.loadSecretaryIcons().then(() => this.updateBallIcon());
                    }
                }
                // 筛选工具开关
                if (e.target.id === 'inp-sieve-enabled') {
                    this.state.sieveEnabled = e.target.checked;
                    Utils.set(CONFIG.KEYS.SIEVE_ENABLED, e.target.checked);
                    // 切换筛选功能
                    if (e.target.checked) {
                        this.initSieveIfNeeded();
                    } else {
                        this.destroySieve();
                    }
                }
                // 显示每日排名开关
                if (e.target.id === 'inp-show-daily-rank') {
                    const newVal = e.target.checked;
                    // 从关闭切换为开启时给出风险提示
                    if (newVal && !this.state.showDailyRank) {
                        const ok = window.confirm('显示每日排名可能会导致频繁的请求，请谨慎选择');
                        if (!ok) {
                            e.target.checked = false;
                            return;
                        }
                    }
                    this.state.showDailyRank = newVal;
                    Utils.set(CONFIG.KEYS.SHOW_DAILY_RANK, newVal);
                }
                // 自定义图标：上传默认图按钮
                if (e.target.id === 'btn-upload-custom-icon' || e.target.id === 'btn-change-custom-icon') {
                    const fileInput = Utils.el('#inp-custom-icon-file', this.dom.setting);
                    if (fileInput) {
                        fileInput.dataset.iconType = 'normal';
                        fileInput.click();
                    }
                }
                // 自定义图标：上传hover图按钮
                if (e.target.id === 'btn-upload-custom-icon-hover' || e.target.id === 'btn-change-custom-icon-hover') {
                    const fileInput = Utils.el('#inp-custom-icon-file', this.dom.setting);
                    if (fileInput) {
                        fileInput.dataset.iconType = 'hover';
                        fileInput.click();
                    }
                }
                // 自定义图标：删除默认图按钮（删除整个自定义图标）
                if (e.target.id === 'btn-delete-custom-icon') {
                    this.customIcon = null;
                    this.state.useCustomIcon = false;
                    Utils.set(CONFIG.KEYS.CUSTOM_ICON, null);
                    Utils.set(CONFIG.KEYS.USE_CUSTOM_ICON, false);
                    this.updateBallIcon();
                    this.updateHeaderButtonIcon();
                    this.renderSettings();
                }
                // 自定义图标：删除hover图按钮（只删除hover，保留normal）
                if (e.target.id === 'btn-delete-custom-icon-hover') {
                    if (this.customIcon) {
                        delete this.customIcon.hover;
                        Utils.set(CONFIG.KEYS.CUSTOM_ICON, this.customIcon);
                        this.updateBallIcon();
                        this.updateHeaderButtonIcon();
                        this.renderSettings();
                    }
                }
                const iconSizeNode = e.target.closest('#grp-icon-size .lda-seg-item');
                if (iconSizeNode) {
                    this.state.iconSize = iconSizeNode.dataset.v;
                    Utils.set(CONFIG.KEYS.ICON_SIZE, this.state.iconSize);
                    this.updateBallIcon();
                    this.renderSettings();
                }
                if (e.target.id === 'inp-header-mode') {
                    const newMode = e.target.checked ? 'header' : 'float';
                    if (newMode !== this.state.displayMode) {
                        this.state.displayMode = newMode;
                        Utils.set(CONFIG.KEYS.DISPLAY_MODE, newMode);
                        // 移除旧的顶栏按钮（如果存在）
                        const oldHeaderBtn = document.getElementById('lda-header-btn');
                        if (oldHeaderBtn) oldHeaderBtn.remove();
                        // 重新初始化以应用新的显示模式
                        this.dom.root.remove();
                        this.init(wasOpen);
                        return;
                    }
                }
                if (wasOpen) this.togglePanel(true);
            };

            // 自定义图标文件选择事件（使用事件委托，避免renderSettings后事件丢失）
            this.dom.setting.addEventListener('change', (e) => {
                if (e.target.id === 'inp-custom-icon-file') {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    // 检查文件类型
                    if (!file.type.match(/^image\/(png|jpeg|gif|webp)$/)) {
                        this.showToast('仅支持 PNG/JPG/GIF/WEBP 格式', 'error');
                        return;
                    }
                    // 获取图标类型（normal 或 hover）
                    const iconType = e.target.dataset.iconType || 'normal';
                    // 读取并压缩图片
                    this.processCustomIcon(file, iconType);
                    // 清空 input 以便重复选择同一文件
                    e.target.value = '';
                }
            });

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

            // 注意：window/document 级别的事件监听器已在上方 _globalEventsBound 检查块中绑定，避免重复

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
            if (!ps) return () => {};
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
            if (!ps) return;
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
            if (!ps) return; // 如 activePage 为 'setting' 时无对应 pendingStatus
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

            // 优先级：自定义图标 > 小秘书图标 > 经典图标
            if (this.state.useCustomIcon && this.customIcon?.normal) {
                // 用户自定义图标（hover图可选，没有则用normal图）
                const normalUrl = this.customIcon.normal;
                const hoverUrl = this.customIcon.hover || this.customIcon.normal;
                ball.innerHTML = `<img class="lda-ball-img lda-ball-img-normal" src="${normalUrl}" alt=""><img class="lda-ball-img lda-ball-img-hover" src="${hoverUrl}" alt="">`;
                ball.classList.remove('lda-ball-classic');
                ball.classList.add('lda-ball-secretary');
                // 设置尺寸
                const size = SECRETARY_ICON_SIZES[this.state.iconSize] || SECRETARY_ICON_SIZES.sm;
                ball.style.width = `${size}px`;
                ball.style.height = `${size}px`;
            } else if (this.state.useClassicIcon || !this.hasValidIconCache()) {
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

        // 处理用户上传的自定义图标
        // iconType: 'normal' | 'hover'
        processCustomIcon(file, iconType = 'normal') {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    // 缩放到 512x512（与 GitHub 小秘书图标一致，保证高清）
                    const canvas = document.createElement('canvas');
                    const size = 512;
                    canvas.width = size;
                    canvas.height = size;
                    const ctx = canvas.getContext('2d');
                    
                    // 设置高质量缩放算法
                    ctx.imageSmoothingEnabled = true;
                    ctx.imageSmoothingQuality = 'high';
                    
                    // 计算缩放和裁剪（居中裁剪为正方形）
                    const srcSize = Math.min(img.width, img.height);
                    const srcX = (img.width - srcSize) / 2;
                    const srcY = (img.height - srcSize) / 2;
                    
                    // 清空画布（透明背景）
                    ctx.clearRect(0, 0, size, size);
                    ctx.drawImage(img, srcX, srcY, srcSize, srcSize, 0, 0, size, size);
                    
                    // 转为 base64（PNG 保持透明度）
                    const base64 = canvas.toDataURL('image/png');
                    
                    // 保存到对应字段
                    if (!this.customIcon) {
                        this.customIcon = {};
                    }
                    this.customIcon[iconType] = base64;
                    this.state.useCustomIcon = true;
                    Utils.set(CONFIG.KEYS.CUSTOM_ICON, this.customIcon);
                    Utils.set(CONFIG.KEYS.USE_CUSTOM_ICON, true);
                    
                    // 更新图标
                    this.updateBallIcon();
                    this.updateHeaderButtonIcon();
                    this.renderSettings();
                    const msgZh = iconType === 'hover' ? '悬停图标已更新' : '图标已更新';
                    const msgEn = iconType === 'hover' ? 'Hover icon updated' : 'Icon updated';
                    this.showToast(this.state.lang === 'zh' ? msgZh : msgEn, 'success');
                };
                img.onerror = () => {
                    this.showToast(this.state.lang === 'zh' ? '图片加载失败' : 'Failed to load image', 'error');
                };
                img.src = e.target.result;
            };
            reader.onerror = () => {
                this.showToast(this.state.lang === 'zh' ? '文件读取失败' : 'Failed to read file', 'error');
            };
            reader.readAsDataURL(file);
        }

        // 更新顶栏按钮的图标（如果存在）
        updateHeaderButtonIcon() {
            const headerBtn = document.getElementById('lda-header-btn');
            if (!headerBtn) return;

            // 根据图标设置决定显示内容（优先级：自定义图标 > 小秘书图标 > 经典图标）
            if (this.state.useCustomIcon && this.customIcon?.normal) {
                // 用户自定义图标（hover图可选，没有则用normal图）
                const normalUrl = this.customIcon.normal;
                const hoverUrl = this.customIcon.hover || this.customIcon.normal;
                headerBtn.innerHTML = `<span class="lda-header-btn-img-wrap"><img class="lda-header-btn-img lda-header-btn-img-normal" src="${normalUrl}" alt=""><img class="lda-header-btn-img lda-header-btn-img-hover" src="${hoverUrl}" alt=""></span>小秘书`;
            } else if (this.state.useClassicIcon) {
                headerBtn.innerHTML = `<svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>小秘书`;
            } else {
                // 使用小秘书图标（带 hover 效果）
                const normalUrl = this.iconCache?.normal || SECRETARY_ICONS.normal;
                const hoverUrl = this.iconCache?.hover || SECRETARY_ICONS.hover;
                headerBtn.innerHTML = `<span class="lda-header-btn-img-wrap"><img class="lda-header-btn-img lda-header-btn-img-normal" src="${normalUrl}" alt=""><img class="lda-header-btn-img lda-header-btn-img-hover" src="${hoverUrl}" alt=""></span>小秘书`;
            }
        }


        startUserWatcher() {
            // 事件驱动 + 保底轮询：检测账号切换/退出，用于缓存失效与 UI 更新
            if (this.userWatchTimer) return;
            if (location.host !== 'linux.do') return;

            const tickCore = () => {
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

            // 防抖包装：500ms 内多次调用只执行一次
            const tick = () => {
                if (this._tickDebounceTimer) clearTimeout(this._tickDebounceTimer);
                this._tickDebounceTimer = setTimeout(() => {
                    this._tickDebounceTimer = null;
                    tickCore();
                }, 500);
            };

            // 启动时执行一次（立即执行，不防抖）
            tickCore();

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
            this.userWatchTimer = setInterval(tickCore, 60000);
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

        // 初始化筛选工具（如果启用且在 linux.do 域名）
        initSieveIfNeeded() {
            // 检查是否启用
            if (!this.state.sieveEnabled) return;
            
            // 检查是否在 linux.do 域名
            if (window.location.hostname !== 'linux.do') return;
            
            // 不再检查路径，在 linux.do 域名下始终初始化
            // 路径检查在 SieveModule.init() 中进行，这样可以监听 URL 变化
            // 当用户从非首页跳转到首页时，能正确显示筛选工具
            
            // 如果已存在实例，直接初始化
            if (this.sieveModule) {
                this.sieveModule.init();
                return;
            }
            
            // 创建新实例
            this.sieveModule = new SieveModule(this);
            this.sieveModule.init();
        }

        // 销毁筛选工具
        destroySieve() {
            if (this.sieveModule) {
                this.sieveModule.destroy();
                this.sieveModule = null;
            }
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
            // 注意：不在这里自动设置 focusFlags，避免 focus 事件导致循环刷新
            // focusFlags 只在用户点击跳转链接时设置

            const lvlHtml = levelText !== null && levelText !== undefined
                ? `<div style="display:flex;justify-content:center;gap:8px;align-items:center;margin-bottom:10px;">
                        <span class="lda-big-lvl" style="font-size:18px;line-height:1;">Lv.${String(levelText)}</span>
                   </div>`
                : '';

            const leftBtnHtml = leftUrl
                ? `<a href="${leftUrl}" target="_blank" rel="noopener"
                        class="lda-auth-btn secondary" id="btn-go-${page}">
                        <span>${leftText || this.t('link_tip')} →</span>
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
                        <button class="lda-auth-btn" id="btn-retry-${page}"><span>${this.t('network_error_retry')}</span></button>
                    </div>
                </div>
            `;

            const retryBtn = Utils.el(`#btn-retry-${page}`, wrap);
            if (retryBtn) retryBtn.onclick = (e) => {
                e.stopPropagation();
                retryBtn.classList.add('loading');
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
                // 面板未展开时：根据显示模式决定动画位置
                const isHeaderMode = this.state.displayMode === 'header';
                const targetEl = isHeaderMode ? this.dom.headerBtn : this.dom.ball;
                if (!targetEl) return;

                const targetRect = targetEl.getBoundingClientRect();
                const isRightHalf = targetRect.left > window.innerWidth / 2;

                anim.style.position = 'fixed';
                anim.style.top = `${targetRect.top - 10}px`;

                if (isRightHalf) {
                    // 目标在右半边，动画显示在左侧
                    anim.style.right = `${window.innerWidth - targetRect.left + 8}px`;
                    anim.style.left = 'auto';
                } else {
                    // 目标在左半边，动画显示在右侧
                    anim.style.left = `${targetRect.right + 8}px`;
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

        // ===== 与增强版完全一致：仅用 GM_xmlhttpRequest 请求 connect.linux.do（不传 withCredentials/headers），不请求 session
        // 增强版：method GET, url, timeout 15000，无其它参数；先找 card 再解析，等级从页面文案「信任级别 X 的要求 已达到/未达到」解析
        fetchTrustFromConnectOnly() {
            return new Promise((resolve) => {
                GM_xmlhttpRequest({
                    method: 'GET',
                    url: 'https://connect.linux.do/',
                    timeout: 15000,
                    onload: (response) => {
                        if (response.status !== 200) {
                            resolve(null);
                            return;
                        }
                        try {
                            const responseText = response.responseText;
                            const tempDiv = document.createElement('div');
                            tempDiv.innerHTML = responseText;
                            const pageText = tempDiv.textContent || '';

                            // 1) 先找新版 card（与增强版 processHighLevelUserData 一致）
                            const card = Array.from(tempDiv.querySelectorAll('div.card')).find(div => {
                                const h2 = div.querySelector('h2.card-title');
                                return h2 && /信任级别/.test(h2.textContent) && /的要求/.test(h2.textContent);
                            });

                            if (!card) {
                                // 无 card 再判断是否未登录（避免页面上有「登录」链接但实际已登录有数据时误判）
                                const loginHint = tempDiv.querySelector('form[action*="/login"], form[action*="/session"]');
                                if (loginHint || (/登录|sign\s*in/i.test(pageText) && !/信任级别\s*\d+\s*的要求/.test(pageText))) {
                                    resolve(null);
                                    return;
                                }
                                resolve(null);
                                return;
                            }

                            // 2) 等级从页面文案解析（与增强版一致）
                            let level = '';
                            const levelRequirementMatch = pageText.match(/信任级别\s*(\d+)\s*的要求\s*(已达到|未达到)/);
                            if (levelRequirementMatch) {
                                const targetLevel = parseInt(levelRequirementMatch[1], 10);
                                const status = levelRequirementMatch[2];
                                level = status === '已达到' ? String(targetLevel) : String(targetLevel - 1);
                            }
                            if (!level) {
                                const statusMatch = pageText.match(/(已达到|不符合)信任级别\s*(\d+)\s*要求/);
                                if (statusMatch) {
                                    const targetLevel = parseInt(statusMatch[2], 10);
                                    level = statusMatch[1] === '已达到' ? String(targetLevel) : String(targetLevel - 1);
                                }
                            }

                            // 3) 解析指标（新排版）
                            const parsed = this._parseConnectNewLayout(card, level || null);
                            if (!parsed || parsed.items.length === 0) {
                                resolve(null);
                                return;
                            }
                            if (level) parsed.level = level;

                            // 4) 用户名：改版后从 card-subtitle，旧版从 h1
                            let username = null;
                            const sub = card.querySelector('p.card-subtitle');
                            if (sub) {
                                const atMatch = sub.textContent.trim().match(/@([^\s·]+)/);
                                if (atMatch) username = atMatch[1].trim();
                            }
                            if (!username) {
                                const h1 = tempDiv.querySelector('h1');
                                const h1Text = (h1 && h1.textContent) ? h1.textContent.trim() : '';
                                const m = h1Text.match(/你好，\s*[^(\s]*\s*\(?([^)]*)\)?\s*(\d+)级用户/i);
                                if (m) username = (m[1] || '').trim().replace(/^@/, '');
                            }

                            this.state.trustCache = parsed.newCache;
                            Utils.set(CONFIG.KEYS.CACHE_TRUST, parsed.newCache);
                            resolve({
                                username,
                                basic: { level: parsed.level, isPass: parsed.isPass, items: parsed.items, source: 'connect' },
                                newCache: parsed.newCache
                            });
                        } catch (_) {
                            resolve(null);
                        }
                    },
                    onerror: () => resolve(null),
                    ontimeout: () => resolve(null)
                });
            });
        }

        // ===== 2级及以上用户数据获取（使用 connect.linux.do）=====
        // 支持改版后的新排版：div.card + .tl3-ring / .tl3-bar-item / .tl3-quota-card / .tl3-veto-item，无数据时回退到旧版 table
        async fetchHighLevelTrustData(knownLevel = null) {
            // Firefox 需要 Referer 头才能正确发送跨域 cookie
            const html = await Utils.request(CONFIG.API.TRUST, { withCredentials: true, headers: { 'Referer': 'https://connect.linux.do/' } });
            const doc = new DOMParser().parseFromString(html, 'text/html');
            const bodyText = doc.body?.textContent || '';
            const loginHint = doc.querySelector('a[href*="/login"], form[action*="/login"], form[action*="/session"]');
            if (loginHint || /登录|login|sign\s*in/i.test(bodyText)) throw new Error("NeedLogin");

            const card = Array.from(doc.querySelectorAll('div.card')).find(div => {
                const h2 = div.querySelector('h2.card-title');
                return h2 && /信任级别/.test(h2.textContent) && /的要求/.test(h2.textContent);
            });

            if (card) {
                const parsed = this._parseConnectNewLayout(card, knownLevel);
                if (parsed && parsed.items.length > 0) {
                    this.state.trustCache = parsed.newCache;
                    Utils.set(CONFIG.KEYS.CACHE_TRUST, parsed.newCache);
                    return { level: parsed.level, isPass: parsed.isPass, items: parsed.items, source: 'connect' };
                }
            }

            // 回退：旧版页面结构（h2/h3 + table tr）
            const levelNode = Array.from(doc.querySelectorAll('h1, h2, h3')).find(x => /信任|trust/i.test(x.textContent));
            if (!levelNode) {
                const possibleTable = doc.querySelector('table');
                if (!possibleTable) throw new Error("ParseError");
            }

            const level = knownLevel !== null ? String(knownLevel) : levelNode.textContent.replace(/\D/g, '');
            const rows = Array.from(levelNode.parentElement.parentElement.querySelectorAll('tr')).slice(1);

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

            const isPass = items.length > 0 && allPassed;
            return { level, isPass, items, source: 'connect' };
        }

        // 解析 connect 改版后的新排版：.tl3-ring / .tl3-bar-item / .tl3-quota-card / .tl3-veto-item
        _parseConnectNewLayout(card, knownLevel) {
            const h2 = card.querySelector('h2.card-title');
            const titleMatch = (h2 && h2.textContent) ? h2.textContent.match(/信任级别\s*(\d+)\s*的要求/) : null;
            const targetLevel = titleMatch ? parseInt(titleMatch[1], 10) : null;
            const badge = card.querySelector('.card-header .badge');
            const isAchieved = badge && badge.classList.contains('badge-success');
            const level = knownLevel !== null ? String(knownLevel) : (targetLevel != null ? (isAchieved ? String(targetLevel) : String(targetLevel - 1)) : '');

            const items = [];
            const newCache = {};
            const seenNames = {};
            let allPassed = true;

            const pushItem = (name, currentNum, targetNum, isGood, currentStr) => {
                if (seenNames[name]) name = name + ' (All)';
                seenNames[name] = true;
                const oldVal = this.state.trustCache[name];
                let diff = (typeof oldVal === 'number' && oldVal !== currentNum) ? currentNum - oldVal : 0;
                newCache[name] = currentNum;
                let pct = 0;
                if (targetNum > 0) pct = Math.min((currentNum / targetNum) * 100, 100);
                else if (isGood) pct = 100;
                items.push({ name, current: currentStr, target: targetNum, isGood, pct, diff });
                if (!isGood) allPassed = false;
            };

            card.querySelectorAll('.tl3-ring').forEach(ring => {
                const label = ring.querySelector('.tl3-ring-label');
                const circle = ring.querySelector('.tl3-ring-circle');
                const currentEl = ring.querySelector('.tl3-ring-current');
                const targetEl = ring.querySelector('.tl3-ring-target');
                if (!label || !currentEl) return;
                const name = label.textContent.trim();
                const currentStr = currentEl.textContent.trim();
                const currentNum = parseFloat(currentStr.replace(/,/g, '')) || 0;
                const targetStr = targetEl ? targetEl.textContent.replace(/^[\s/]+/, '').trim() : '';
                const targetNum = parseFloat(targetStr.replace(/,/g, '')) || 0;
                const isGood = circle ? circle.classList.contains('met') : false;
                pushItem(name, currentNum, targetNum, isGood, currentStr);
            });

            card.querySelectorAll('.tl3-bar-item').forEach(bar => {
                const labelEl = bar.querySelector('.tl3-bar-label');
                const numsEl = bar.querySelector('.tl3-bar-nums');
                if (!labelEl || !numsEl) return;
                const name = labelEl.textContent.trim();
                const numsText = numsEl.textContent.trim();
                const parts = numsText.split('/');
                const currentStr = (parts[0] || '').trim();
                const targetNum = parseFloat((parts[1] || '').replace(/,/g, '')) || 0;
                const currentNum = parseFloat(currentStr.replace(/,/g, '')) || 0;
                const isGood = numsEl.classList.contains('met');
                pushItem(name, currentNum, targetNum, isGood, currentStr);
            });

            card.querySelectorAll('.tl3-quota-card').forEach(quota => {
                const labelEl = quota.querySelector('.tl3-quota-label');
                const numsEl = quota.querySelector('.tl3-quota-nums');
                if (!labelEl || !numsEl) return;
                const name = labelEl.textContent.trim();
                const numsText = numsEl.textContent.trim();
                const parts = numsText.split('/');
                const currentStr = (parts[0] || '').trim();
                const targetNum = parseFloat((parts[1] || '').replace(/,/g, '')) || 0;
                const currentNum = parseFloat(currentStr.replace(/,/g, '')) || 0;
                const isGood = quota.classList.contains('met');
                pushItem(name, currentNum, targetNum, isGood, currentStr);
            });

            card.querySelectorAll('.tl3-veto-item').forEach(veto => {
                const labelEl = veto.querySelector('.tl3-veto-label');
                const valueEl = veto.querySelector('.tl3-veto-value');
                if (!labelEl || !valueEl) return;
                const name = labelEl.textContent.trim();
                const currentStr = valueEl.textContent.trim();
                const currentNum = parseFloat(currentStr.replace(/,/g, '')) || 0;
                const targetNum = 0;
                const isGood = veto.classList.contains('met');
                pushItem(name, currentNum, targetNum, isGood, currentStr);
            });

            const isPass = items.length > 0 && allPassed;
            return { level, isPass, items, newCache };
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

            // 防止并发重复请求（手动刷新除外）
            if (this.refreshingPages.trust && !manual) {
                return;
            }

            // 全局冷却：距离上次请求至少 5 秒（手动刷新除外）
            const now = Date.now();
            if (!manual && now - this.lastRefreshAttempt.trust < 5000) {
                return;
            }
            this.lastRefreshAttempt.trust = now;

            const forceFetch = opts.force ?? !opts.background;
            const wrap = this.dom.trust;
            const endWait = this.beginWait('trust');

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

                // 【增强版逻辑】先直连 connect.linux.do（GM 直连不占限频），成功则直接完成，不请求 session
                const connectOnly = await this.fetchTrustFromConnectOnly();
                if (connectOnly && connectOnly.basic && connectOnly.basic.items.length > 0) {
                    const username = connectOnly.username || Utils.getCurrentUsernameFromDOM() || Utils.getCurrentUsername();
                    if (username) this.ensureUserSig(this.makeUserSig({ username }));
                    const basic = { ...connectOnly.basic, ui: 'normal' };
                    const statsPromise = this.state.showDailyRank ? Utils.fetchForumStats().catch(() => null) : Promise.resolve(null);
                    const userInfoPromise = username ? Utils.fetchUserInfo(username).catch(() => null) : Promise.resolve(null);
                    const [forumStats, userInfo] = await Promise.all([statsPromise, userInfoPromise]);
                    let memberDays = null;
                    if (userInfo?.created_at) {
                        const createdDate = new Date(userInfo.created_at);
                        memberDays = Math.floor((Date.now() - createdDate.getTime()) / (1000 * 60 * 60 * 24));
                    }
                    const oldStats = this.trustData?.stats;
                    const statsData = {
                        dailyRank: this.state.showDailyRank ? (forumStats?.dailyRank ?? oldStats?.dailyRank ?? null) : null,
                        score: this.state.showDailyRank ? (forumStats?.score ?? oldStats?.score ?? null) : null,
                        memberDays
                    };
                    this.trustData = { basic, stats: statsData };
                    this.renderTrust(this.trustData);
                    Utils.set(CONFIG.KEYS.CACHE_TRUST_DATA, this.trustData);
                    this.markFetch('trust');
                    if (manual) this.showToast(this.t('refresh_done'), 'success', 1500);
                    this.stopRefreshWithMinDuration('trust');
                    endWait();
                    return;
                }

                // 与增强版一致：未获取到 Connect 数据时不请求 session（避免 429），仅提示打开 Connect 后重试
                if (this.trustData) {
                    this.renderTrust(this.trustData);
                    if (manual) this.showToast(this.t('refresh_no_data'), 'warning', 2000);
                } else {
                    this.renderStateCard(wrap, 'trust', {
                        title: this.t('trust_fallback_title'),
                        tip: this.t('trust_fallback_tip'),
                        levelText: '?',
                        leftUrl: CONFIG.API.LINK_TRUST,
                        leftText: this.t('connect_open'),
                        onRetry: () => this.refreshTrust({ manual: true, force: true })
                    });
                    if (manual) this.showToast(this.t('refresh_no_data'), 'warning', 2000);
                }
                this.stopRefreshWithMinDuration('trust');
                endWait();
                return;

            } catch (e) {
                // 最外层兜底：如果有缓存数据，继续显示缓存；否则显示友好网络/环境错误
                if (this.trustData?.basic) {
                    this.renderTrust(this.trustData);
                    if (manual) this.showToast(this.t('refresh_no_data'), 'warning', 2000);
                } else {
                    this.renderStateCard(wrap, 'trust', {
                        title: this.t('network_error_title'),
                        tip: this.t('network_error_tip'),
                        levelText: '?',
                        leftUrl: CONFIG.API.LINK_TRUST,
                        leftText: this.t('connect_open'),
                        onRetry: () => this.refreshTrust({ manual: true, force: true })
                    });
                    if (manual) this.showToast(this.t('refresh_no_data'), 'warning', 2000);
                }
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
            // 根据设置决定是否显示每日排名和积分（它们都来自 Leaderboard）
            const showLeaderboardData = this.state.showDailyRank;
            if ((showLeaderboardData && (stats.dailyRank || stats.score)) || stats.memberDays !== null) {
                statsHtml = `<a href="${CONFIG.API.LINK_LEADERBOARD}" target="_blank" class="lda-stats-bar" id="btn-go-leaderboard">`;
                if (showLeaderboardData && stats.dailyRank) statsHtml += `<span class="lda-stat-item">${this.t('rank_today')}: <span class="num today">${stats.dailyRank}</span></span>`;
                if (showLeaderboardData && stats.score) statsHtml += `<span class="lda-stat-item">${this.t('score')}: <span class="num score">${Number(stats.score).toLocaleString()}</span></span>`;
                if (stats.memberDays !== null) statsHtml += `<span class="lda-stat-item">${this.t('member_days')}: <span class="num days">${stats.memberDays}</span></span>`;
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

            // 防止并发重复请求（手动刷新除外）
            if (this.refreshingPages.credit && !manual) {
                return;
            }

            // 全局冷却：距离上次请求至少 5 秒（手动刷新除外）
            const now = Date.now();
            if (!manual && now - this.lastRefreshAttempt.credit < 5000) {
                return;
            }
            this.lastRefreshAttempt.credit = now;

            const forceFetch = opts.force ?? !opts.background;
            const wrap = this.dom.credit;
            const endWait = this.beginWait('credit');

            // 【频率限制预检查】如果 credit 分组超限且有缓存，直接使用缓存
            const rateCheck = Utils.checkMultiGroupRateLimit(['credit']);
            if (rateCheck.limited && this.creditData) {
                this.renderCredit(this.creditData);
                this.showToast(`${this.t('rate_limit_exceeded')}（${rateCheck.waitTime}s）`, 'warning', 3000);
                endWait();
                return;
            }

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

                // Firefox 需要 Referer 头才能正确发送跨域 cookie
                const creditHeaders = { 'Referer': 'https://credit.linux.do/home' };
                const infoPromise = Utils.request(CONFIG.API.CREDIT_INFO, { withCredentials: true, headers: creditHeaders });
                const statPromise = Utils.request(CONFIG.API.CREDIT_STATS, { withCredentials: true, headers: creditHeaders });

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
                // 兼容 CREDIT_INFO API 返回 username 或 nickname 字段
                const creditUsername = info?.username || info?.nickname;
                if (creditUsername) {
                    try {
                        const userRes = await Utils.request(CONFIG.API.USER_INFO(creditUsername), { withCredentials: true });
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
                const isAuthError = e?.status === 401 || e?.status === 403 || /unauthorized|not\s*login/i.test(e?.responseText || '');

                if (isAuthError) {
                    // 检查用户是否登录到 LinuxDO 主站
                    const isUserLoggedIn = Utils.getLoginStateByDOM();
                    // 如果已有可用缓存数据
                    const hasUsableCache = !!(this.creditData?.info && this.creditData.info.available_balance !== undefined);

                    // 如果用户已登录主站且有缓存，显示缓存数据并提示需要重新授权
                    if (isUserLoggedIn === true && hasUsableCache) {
                        // 不自动设置 focusFlags，避免循环刷新
                        this.showToast(this.t('credit_keep_cache_tip'), 'warning', 3000);
                        try { this.renderCredit(this.creditData); } catch (_) { /* ignore */ }
                        this.stopRefreshWithMinDuration('credit');
                        endWait();
                        return;
                    }

                    // 如果用户未登录主站（isUserLoggedIn === false），则显示登录界面并清除缓存
                    // 如果无法确定登录状态（isUserLoggedIn === null）但没有缓存，也显示授权界面
                    if (isUserLoggedIn === false) {
                        // 清除 credit 缓存数据
                        this.creditData = null;
                        this.lastFetch.credit = 0;
                        Utils.set(CONFIG.KEYS.CACHE_CREDIT_DATA, null);
                        Utils.set(CONFIG.KEYS.CACHE_META, this.lastFetch);
                    }

                    this.stopRefreshWithMinDuration('credit');
                    // 不自动设置 focusFlags，避免循环刷新
                    wrap.innerHTML = `
                        <div class="lda-card lda-auth-card">
                            <div class="lda-auth-icon">
                                <svg viewBox="0 0 24 24" width="48" height="48"><path fill="currentColor" d="M12,1L3,5V11C3,16.55 6.84,21.74 12,23C17.16,21.74 21,16.55 21,11V5L12,1M12,5A3,3 0 0,1 15,8A3,3 0 0,1 12,11A3,3 0 0,1 9,8A3,3 0 0,1 12,5M17.13,17C15.92,18.85 14.11,20.24 12,20.92C9.89,20.24 8.08,18.85 6.87,17C6.53,16.5 6.24,16 6,15.47C6,13.82 8.71,12.47 12,12.47C15.29,12.47 18,13.79 18,15.47C17.76,16 17.47,16.5 17.13,17Z"/></svg>
                            </div>
                            <div class="lda-auth-title">${this.t('credit_not_auth')}</div>
                            <div class="lda-auth-tip">${this.t('credit_auth_tip')}</div>
                            <div class="lda-auth-btns">
                                <a href="${CONFIG.API.LINK_CREDIT}" target="_blank" class="lda-auth-btn" id="btn-go-credit"><span>${this.t('credit_go_auth')} →</span></a>
                                <button id="btn-credit-refresh" class="lda-auth-btn secondary"><span>${this.t('credit_refresh')}</span></button>
                            </div>
                        </div>
                    `;
                    const refreshBtn = Utils.el('#btn-credit-refresh', wrap);
                    if (refreshBtn) refreshBtn.onclick = (ev) => {
                        ev.stopPropagation();
                        refreshBtn.classList.add('loading');
                        this.refreshCredit({ manual: true, force: true });
                    };
                    const go = Utils.el('#btn-go-credit', wrap);
                    // 用户点击跳转链接时才设置 focusFlags
                    if (go) go.onclick = () => { this.focusFlags.credit = true; };
                    if (manual) this.showToast(this.t('refresh_no_data'), 'warning', 2000);
                    endWait();
                    return;
                }

                // ✅ 其他失败：如果有缓存数据，继续显示缓存；否则显示友好网络错误 UI
                if (this.creditData?.info) {
                    // 有缓存数据，继续显示缓存，只 toast 提示刷新失败
                    this.renderCredit(this.creditData);
                    this.stopRefreshWithMinDuration('credit');
                    if (manual) this.showToast(this.t('refresh_no_data'), 'warning', 2000);
                    endWait();
                    return;
                }

                // 无缓存时才显示友好网络错误 UI（左Credit右刷新）
                this.renderStateCard(wrap, 'credit', {
                    title: this.t('network_error_title'),
                    tip: this.t('network_error_tip'),
                    leftUrl: CONFIG.API.LINK_CREDIT,
                    leftText: this.t('credit_open'),
                    onRetry: () => this.refreshCredit({ manual: true, force: true })
                });

                this.stopRefreshWithMinDuration('credit');
                if (manual) this.showToast(this.t('refresh_no_data'), 'warning', 2000);
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

            // 防止并发重复请求（手动刷新除外）
            if (this.refreshingPages.cdk && !manual) {
                return;
            }

            // 全局冷却：距离上次请求至少 5 秒（手动刷新除外）
            const now = Date.now();
            if (!manual && now - this.lastRefreshAttempt.cdk < 5000) {
                return;
            }
            this.lastRefreshAttempt.cdk = now;

            const wrap = this.dom.cdk;
            const endWait = this.beginWait('cdk');

            // 【频率限制预检查】如果 cdk 分组超限且有缓存，直接使用缓存
            const rateCheck = Utils.checkMultiGroupRateLimit(['cdk']);
            if (rateCheck.limited && this.cdkCache?.data) {
                this.renderCDKContent(this.cdkCache.data);
                this.showToast(`${this.t('rate_limit_exceeded')}（${rateCheck.waitTime}s）`, 'warning', 3000);
                endWait();
                return;
            }

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

            // 如果已有缓存数据（不管是否新鲜），继续显示缓存，不覆盖为错误/未登录
            if (this.cdkCache?.data) {
                this.renderCDKContent(this.cdkCache.data);
                if (manual) this.showToast(this.t('refresh_no_data'), 'warning', 2000);
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
                if (manual) this.showToast(this.t('refresh_no_data'), 'warning', 2000);
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

            if (manual) this.showToast(this.t('refresh_no_data'), 'warning', 2000);
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
            // 不自动设置 focusFlags，避免循环刷新
            const wrap = this.dom.cdk;
            wrap.innerHTML = `
                <div class="lda-card lda-auth-card">
                    <div class="lda-auth-icon">
                        <svg viewBox="0 0 24 24" width="48" height="48"><path fill="currentColor" d="M12,1L3,5V11C3,16.55 6.84,21.74 12,23C17.16,21.74 21,16.55 21,11V5L12,1M12,5A3,3 0 0,1 15,8A3,3 0 0,1 12,11A3,3 0 0,1 9,8A3,3 0 0,1 12,5M17.13,17C15.92,18.85 14.11,20.24 12,20.92C9.89,20.24 8.08,18.85 6.87,17C6.53,16.5 6.24,16 6,15.47C6,13.82 8.71,12.47 12,12.47C15.29,12.47 18,13.79 18,15.47C17.76,16 17.47,16.5 17.13,17Z"/></svg>
                    </div>
                    <div class="lda-auth-title">${this.t('cdk_not_auth')}</div>
                    <div class="lda-auth-tip">${this.t('cdk_auth_tip')}</div>
                    <div class="lda-auth-btns">
                        <a href="${CONFIG.API.LINK_CDK}" target="_blank" class="lda-auth-btn" id="btn-go-cdk"><span>${this.t('cdk_go_auth')} →</span></a>
                        <button id="btn-cdk-refresh" class="lda-auth-btn secondary"><span>${this.t('cdk_refresh')}</span></button>
                    </div>
                </div>
            `;
            const refreshBtn = Utils.el('#btn-cdk-refresh', wrap);
            if (refreshBtn) refreshBtn.onclick = (e) => {
                e.stopPropagation();
                refreshBtn.classList.add('loading');
                this.refreshCDK({ manual: true, force: true });
            };
            const go = Utils.el('#btn-go-cdk', wrap);
            if (go) go.onclick = () => { this.focusFlags.cdk = true; };
        }

        togglePanel(show) {
            const isHeaderMode = this.state.displayMode === 'header';
            // 顶栏模式不需要隐藏/显示悬浮球
            if (!isHeaderMode) {
                this.dom.ball.style.display = show ? 'none' : 'flex';
            }
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
            // 顶栏模式不需要更新面板方向
            if (show && !isHeaderMode) this.updatePanelSide();
        }

        updatePanelSide() {
            // 从存储中读取位置来计算面板方向，避免在面板展开时因布局变化导致计算错误
            const savedPos = Utils.get(CONFIG.KEYS.POS, { r: 20, t: 100 });
            const ballWidth = 40; // 悬浮球固定宽度
            const panelWidth = 340; // 面板大致宽度

            // 根据保存的 right 值计算悬浮球的左边界位置
            const ballLeft = window.innerWidth - savedPos.r - ballWidth;
            const spaceLeft = ballLeft;
            const spaceRight = savedPos.r; // right 值就是右侧空间

            let side = 'left';
            if (spaceRight >= panelWidth + 12) side = 'right';
            else if (spaceLeft >= panelWidth + 12) side = 'left';
            else side = spaceRight >= spaceLeft ? 'right' : 'left';

            this.dom.root.classList.toggle('lda-side-right', side === 'right');
            this.dom.root.classList.toggle('lda-side-left', side === 'left');

            // 注意：不在这里重新设置 right/top，位置由拖拽逻辑和 restorePos() 管理
            // 边界修正在拖拽结束时已经处理（onUp/onTouchEnd 中的 clamp 逻辑）
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
            // 顶栏模式不需要拖拽功能
            if (this.state.displayMode === 'header') return;

            let isDrag = false, hasDragged = false, startX, startY, startR, startT;
            // 长按返回1楼相关变量
            let longPressTimer = null;
            let longPressTriggered = false;
            const LONG_PRESS_DURATION = 500; // 长按时间阈值（毫秒）

            // 取消长按计时器
            const cancelLongPress = () => {
                if (longPressTimer) {
                    clearTimeout(longPressTimer);
                    longPressTimer = null;
                }
                this.dom.ball.classList.remove('lda-long-pressing');
            };

            // 执行长按返回1楼
            const triggerLongPress = () => {
                longPressTriggered = true;
                cancelLongPress();
                // 添加视觉反馈
                this.dom.ball.classList.add('lda-long-pressing');
                // 执行返回1楼
                if (this.navigateToFirstFloor()) {
                    // 跳转成功，显示提示
                    this.showToast(this.t('back_to_first'), 'success', 1500);
                }
            };

            const onMove = (e) => {
                if (!isDrag) return;
                const dx = e.clientX - startX;
                const dy = e.clientY - startY;
                if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
                    hasDragged = true;
                    cancelLongPress(); // 拖拽时取消长按
                }
                requestAnimationFrame(() => {
                    this.dom.root.style.right = Math.max(0, startR - dx) + 'px';
                    this.dom.root.style.top = Math.max(0, Math.min(startT + dy, window.innerHeight - 50)) + 'px';
                });
            };

            const onUp = () => {
                cancelLongPress(); // 松开时取消长按
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
                longPressTriggered = false;
                startX = e.clientX;
                startY = e.clientY;
                const rect = this.dom.root.getBoundingClientRect();
                startR = window.innerWidth - rect.right;
                startT = rect.top;
                if (target === this.dom.ball) {
                    this.dom.ball.classList.add('dragging');
                    // 仅在帖子页面且非1楼时启动长按计时器
                    if (this.isTopicFloorPage()) {
                        longPressTimer = setTimeout(triggerLongPress, LONG_PRESS_DURATION);
                    }
                }
                document.addEventListener('mousemove', onMove);
                document.addEventListener('mouseup', onUp);
                e.preventDefault();
            };

            this.dom.ball.onmousedown = (e) => startDrag(e, this.dom.ball);

            this.dom.ball.onclick = (e) => {
                if (hasDragged || longPressTriggered) {
                    hasDragged = false;
                    longPressTriggered = false;
                    e.stopPropagation();
                    return;
                }
                this.togglePanel(true);
            };

            this.dom.head.onmousedown = (e) => startDrag(e, this.dom.head);

            // 移动端触摸事件支持
            let isTouchDrag = false, hasTouchDragged = false, touchStartX, touchStartY, touchStartR, touchStartT;
            let touchLongPressTimer = null;
            let touchLongPressTriggered = false;

            // 取消触摸长按计时器
            const cancelTouchLongPress = () => {
                if (touchLongPressTimer) {
                    clearTimeout(touchLongPressTimer);
                    touchLongPressTimer = null;
                }
                this.dom.ball.classList.remove('lda-long-pressing');
            };

            // 执行触摸长按返回1楼
            const triggerTouchLongPress = () => {
                touchLongPressTriggered = true;
                cancelTouchLongPress();
                // 添加视觉反馈
                this.dom.ball.classList.add('lda-long-pressing');
                // 震动反馈（如果支持）
                if (navigator.vibrate) {
                    navigator.vibrate(50);
                }
                // 执行返回1楼
                if (this.navigateToFirstFloor()) {
                    this.showToast(this.t('back_to_first'), 'success', 1500);
                }
            };

            const onTouchMove = (e) => {
                if (!isTouchDrag) return;
                const touch = e.touches[0];
                const dx = touch.clientX - touchStartX;
                const dy = touch.clientY - touchStartY;
                if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
                    hasTouchDragged = true;
                    cancelTouchLongPress(); // 拖拽时取消长按
                }
                if (hasTouchDragged) e.preventDefault();
                requestAnimationFrame(() => {
                    this.dom.root.style.right = Math.max(0, touchStartR - dx) + 'px';
                    this.dom.root.style.top = Math.max(0, Math.min(touchStartT + dy, window.innerHeight - 50)) + 'px';
                });
            };

            const onTouchEnd = () => {
                cancelTouchLongPress(); // 松开时取消长按
                if (isTouchDrag) {
                    isTouchDrag = false;
                    this.dom.ball.classList.remove('dragging');
                    document.removeEventListener('touchmove', onTouchMove);
                    document.removeEventListener('touchend', onTouchEnd);
                    document.removeEventListener('touchcancel', onTouchEnd);
                    const r = this.dom.root.getBoundingClientRect();
                    Utils.set(CONFIG.KEYS.POS, { r: window.innerWidth - r.right, t: r.top });
                    this.updatePanelSide();
                    // 处理触摸点击（长按触发后不展开面板）
                    if (!hasTouchDragged && !touchLongPressTriggered) {
                        this.togglePanel(true);
                    }
                    hasTouchDragged = false;
                    touchLongPressTriggered = false;
                }
            };

            const startTouchDrag = (e, target) => {
                if (target === this.dom.head && e.target.closest('.lda-icon-btn')) return;
                const touch = e.touches[0];
                isTouchDrag = true;
                hasTouchDragged = false;
                touchLongPressTriggered = false;
                touchStartX = touch.clientX;
                touchStartY = touch.clientY;
                const rect = this.dom.root.getBoundingClientRect();
                touchStartR = window.innerWidth - rect.right;
                touchStartT = rect.top;
                if (target === this.dom.ball) {
                    this.dom.ball.classList.add('dragging');
                    // 仅在帖子页面且非1楼时启动长按计时器
                    if (this.isTopicFloorPage()) {
                        touchLongPressTimer = setTimeout(triggerTouchLongPress, LONG_PRESS_DURATION);
                    }
                }
                document.addEventListener('touchmove', onTouchMove, { passive: false });
                document.addEventListener('touchend', onTouchEnd);
                document.addEventListener('touchcancel', onTouchEnd);
            };

            this.dom.ball.ontouchstart = (e) => startTouchDrag(e, this.dom.ball);
            this.dom.head.ontouchstart = (e) => startTouchDrag(e, this.dom.head);
        }

        restorePos() {
            const p = Utils.get(CONFIG.KEYS.POS, { r: 20, t: 100 });
            const ballSize = 40; // 悬浮球基准尺寸
            // 边界检查：确保悬浮球在屏幕范围内（修复窗口大小变化后位置超出的问题）
            const maxR = Math.max(0, window.innerWidth - ballSize);
            const maxT = Math.max(0, window.innerHeight - 50); // 与拖拽逻辑保持一致
            const safeR = Math.max(0, Math.min(p.r, maxR));
            const safeT = Math.max(0, Math.min(p.t, maxT));
            this.dom.root.style.right = safeR + 'px';
            this.dom.root.style.top = safeT + 'px';
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