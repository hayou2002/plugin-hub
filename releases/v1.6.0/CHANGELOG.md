# Changelog

## v1.6.0 (2026-07-23)

- **安全重构** 彻底移除 JS 桥接补丁（曾导致 GPU crash/SHA256 校验失败）
- **全新方案** 插件 onload 时自动注入 CSS 到运行时 renderer 缓存，不修改种子文件，不触发校验
- **修复** 抽屉项点击无响应（桥接脚本 .ph-tb 无 click 监听器）
- **修复** 遮罩点击报 tabId 未定义
- **修复** 抽屉悬停自动消失（添加 mouseenter/mouseleave 处理 _phHover）
- **优化** 管理页移除「隐藏▼」按钮（旧补丁触发入口）
- **优化** 后端路由移除 _patchOverflow 处理逻辑
- **优化** install-patch 工具改为安全的 CSS 注入方式（不碰 app.asar）
- **优化** 首次启动重试机制（renderer 缓存未就绪时自动重试 3 次）
