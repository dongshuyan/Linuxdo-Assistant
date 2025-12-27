# Linux.do 小秘书 (Linux.do Assistant)

> 🎯 一个简洁优雅的 Linux.do 仪表盘，让你随时掌握信任级别进度、积分动态和 CDK 社区分数

在浏览 Linux.do 时，是不是经常想知道自己距离下一信任等级还差多少？或者今天的积分还剩多少额度？CDK 社区分数又是多少？

**Linux.do 小秘书** 帮你解决这个问题——一个悬浮在页面角落的小助手，实时显示你的信任级别进度、积分余额、CDK 社区分数，支持数据变化追踪，再也不用频繁切换页面了。

## ✨ 功能特点

- **信任级别监控** - 一目了然的进度条，清晰展示各项指标完成情况
- **排名积分展示** - 今日排名、总排名、积分一览无余
- **数据变化追踪** - 自动记录并显示数据涨跌，看清每一点进步
- **积分详情查看** - 余额、每日额度、近7日收支，一个面板搞定
- **CDK 社区分数** - 显示基于徽章计算的社区信誉分，快速查看用户信息
- **智能数据缓存** - 跨标签页数据持久化，秒显缓存后台刷新，丝滑无感知
- **账号隔离保护** - 自动识别账号切换，避免数据混淆
- **标签拖拽排序** - 可自由拖拽调整标签页顺序，个性化你的面板布局
- **多主题支持** - 亮色 / 深色 / 跟随系统，总有一款适合你
- **中英双语** - 界面语言随心切换
- **可拖动面板** - 放在你喜欢的位置，不遮挡阅读
- **记忆功能** - 自动保存位置和偏好设置
- **自动更新** - 支持 Tampermonkey 自动检测更新，也可手动检查
- **支持作者** - 内置便捷支持入口，感谢您的支持 ❤️

## 📸 截图预览

### 悬浮球效果

<p align="center">
  <img src="pics/p0.png" alt="悬浮球" width="400">
</p>

### 功能页面

| 信任级别 | 积分详情 | CDK分数 | 偏好设置 |
|:---:|:---:|:---:|:---:|
| ![信任级别](pics/p1.png) | ![积分详情](pics/p2.png) | ![CDK分数](pics/p4.png) | ![偏好设置](pics/p3.png) |

> 注：CDK 社区分数功能需要先访问 [cdk.linux.do](https://cdk.linux.do/dashboard) 完成 OAuth 授权

## 📦 安装方法

### 前提条件

安装脚本前，你需要先安装一个用户脚本管理器扩展。推荐使用**Tampermonkey**：

**Tampermonkey**
- [Chrome 版](https://chrome.google.com/webstore/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo)
- [Firefox 版](https://addons.mozilla.org/en-US/firefox/addon/tampermonkey/)
- [Edge 版](https://microsoftedge.microsoft.com/addons/detail/tampermonkey/iikmkjmpaadaobahmlepeloendndfphd)
- [Safari 版](https://apps.apple.com/app/apple-store/id1482490089)

### 方法一：从 GreasyFork 安装（推荐）

1. 安装好 Tampermonkey 后，访问脚本页面：
   - **[GreasyFork - Linux.do Assistant](https://greasyfork.org/zh-CN/scripts/560271-linux-do-assistant)**
2. 点击「安装此脚本」
3. 在 Tampermonkey 弹出的确认页点击「安装」
4. 完成！访问 [linux.do](https://linux.do) 即可看到悬浮球

### 方法二：从 GitHub 安装

1. 确保已安装 Tampermonkey
2. 点击下方链接直接安装：
   - **[安装 Linux.do Assistant](https://github.com/dongshuyan/Linuxdo-Assistant/raw/main/Linuxdo-Assistant.user.js)**
3. Tampermonkey 会自动识别并弹出安装页
4. 点击「安装」即可

### 方法三：手动安装

1. 点击 Tampermonkey 图标 → 「添加新脚本」
2. 删除编辑器中的默认代码
3. 复制 [Linuxdo-Assistant.user.js](https://github.com/dongshuyan/Linuxdo-Assistant/blob/main/Linuxdo-Assistant.user.js) 的全部内容粘贴进去
4. 按 `Ctrl+S` 或点击「文件 → 保存」

## 🚀 使用说明

安装后访问 [linux.do](https://linux.do)，页面右侧会出现一个蓝色悬浮球。

| 操作 | 说明 |
|---|---|
| **点击悬浮球** | 展开仪表盘面板 |
| **拖动悬浮球/标题栏** | 移动面板位置 |
| **切换标签页** | 信任级别 / 积分详情 / CDK 社区分数 / 偏好设置 |
| **点击主题图标** | 切换亮色/深色/跟随系统 |
| **点击刷新按钮** | 手动刷新数据 |
| **偏好设置** | 可调整语言、面板高度、自动刷新频率等 |
| **拖拽排序标签** | 在偏好设置中，拖动标签项调整显示顺序，点击保存生效 |
| **清除缓存数据** | 在偏好设置中，点击"清除缓存"按钮清空本地存储的所有数据 |
| **检查更新** | 在偏好设置页面，手动检查是否有新版本 |

> 💡 **提示**：
> - 使用前请确保已登录 linux.do 账号
> - 在偏好设置中可以自由拖拽标签顺序，打造专属你的面板布局

## 🔄 自动更新

脚本支持自动更新功能：

- **自动检测**：Tampermonkey 会定期检查 GitHub 上的最新版本
- **手动检查**：在「偏好设置」页面点击「检查更新」按钮
- 发现新版本后，Tampermonkey 会提示你更新，无需手动重新安装

## ⚠️ 注意事项

- 脚本需要登录 linux.do 后才能正常获取数据
- 信任级别数据来自 connect.linux.do
- 排名/积分数据来自 linux.do 主站
- Credit 数据来自 credit.linux.do，首次使用需完成 OAuth 授权
- CDK 社区分数来自 cdk.linux.do，首次使用需访问 [cdk.linux.do/dashboard](https://cdk.linux.do/dashboard) 完成 OAuth 授权
- 若使用 Tampermonkey，请允许脚本在 cdk.linux.do 域运行；授权后切回 linux.do 若仍为空，打开 cdk.linux.do/dashboard 刷新一次再回到主站
- 数据会在浏览器本地缓存，跨标签页共享；切换账号时会自动清理缓存避免数据混淆
- 如果数据加载失败，请检查网络连接或尝试刷新；若仍有问题可在偏好设置中清除缓存

## 🙏 致谢

本脚本的开发参考了以下项目和资源，在此表示感谢：

- [LinuxDoStatus](https://github.com/1e0n/LinuxDoStatus) - 信任级别显示脚本，提供了实现思路参考
- [Linux.do 社区讨论](https://linux.do/t/topic/1356074) - 社区成员的需求反馈和建议
- [Linux.do 顶部显示脚本](https://linux.do/t/topic/1357173) - 排名/积分数据获取方案参考
- AI 辅助工具 - 协助完成部分代码编写

## 📝 更新日志

### v2.1.0
- ⚡ **多源兜底策略**：信任级别/积分数据采用多方法获取，首选最快的，失败自动切换备用方案
- 🔄 **智能重试机制**：每个数据源最多重试3次，大幅提升稳定性和成功率
- 🎯 **分级优化**：0-1级用户使用轻量 summary.json，2级+用户使用完整 connect 页面数据
- 📊 **性能优化**：基于实测数据（connect 267ms vs summary 686ms）优化请求顺序
- 🛡️ **鲁棒性提升**：清除缓存后自动触发数据预拉取，避免页面空白
- 🚀 **秒开体验**：标签切换直接使用缓存，仅在必要时才刷新（无数据/手动刷新/到达间隔）

### v2.0.0
- 🚀 脚本加载自动检查更新，发现新版本在面板内弹窗提示
- 🕐 "暂不更新"后1小时内不再自动提醒，手动按钮仍可随时检查
- 🪟 更新提示改为面板内弹窗，不再占据页面底部

### v1.8.0
- ⚡ 智能数据缓存：跨标签页数据持久化，秒显缓存后台刷新
- 🔄 并行取数优化：脚本加载即并行预热三页数据，按设置间隔后台刷新
- 🔒 账号隔离保护：自动识别账号切换，防止不同账号数据混淆
- 🗑️ 新增清除缓存：偏好设置中可一键清空本地缓存数据
- 🕐 页面级慢速提示：请求超5s时友好提示，不再干等
- 🛠️ 重试策略优化：401/403错误不再无意义重试，网络错误最多重试2次

### v1.7.0
- 🎨 面板标题更名为「Linux.do 小秘书」
- 📐 优化设置页面布局，增加面板宽度，减少文字换行
- 💖 支持作者区域移至设置底部，更加整洁

### v1.6.1
- 修复若干 bug

## 📄 许可证

MIT License

## 🔗 相关链接

- **GitHub**: [https://github.com/dongshuyan/Linuxdo-Assistant](https://github.com/dongshuyan/Linuxdo-Assistant)
- **GreasyFork**: [https://greasyfork.org/zh-CN/scripts/560271-linux-do-assistant](https://greasyfork.org/zh-CN/scripts/560271-linux-do-assistant)
- **问题反馈**: [GitHub Issues](https://github.com/dongshuyan/Linuxdo-Assistant/issues)

---

<p align="center">
  Made with ❤️ for Linux.do Community
</p>

