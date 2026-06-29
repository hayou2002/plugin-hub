# 插件抽屉（plugin-hub）

Hana 插件抽屉。默认安全模式管理顶栏插件、下拉收纳和文件夹分类；手动安装增强补丁后可获得原生下拉悬浮菜单。

**性能**：CSS/JS 外部化 + 进程级缓存 + 同步骨架，点击秒开，无转圈。

## 两种模式

### 安全模式（默认）——hanako新版本可能失效。完整体验请安装增强补丁

- 不修改 Hana `app.asar`，不对核心代码做任何改动
- 只在抽屉页面中管理插件
- 支持顶栏/下拉开关、文件夹分类、搜索、批量操作
- 安装/卸载插件不留核心补丁

### 原生下拉增强（手动安装）

在抽屉页面点击「安装增强补丁」后启用：

- 自动备份 `app.asar`
- 下拉菜单悬浮打开，文件夹右侧弹出子菜单
- 点击下拉插件只打开，不自动置顶
- 支持文件夹分类进原生下拉
- 安装/卸载后需重启 Hana

## 安装

1. 下载 [最新 Release](https://github.com/hayou2002/plugin-hub/releases/latest) 的 zip
2. 打开 Hana → 插件管理
3. 拖入 zip 安装，重启 Hana

## 架构

```
plugin-hub/
  manifest.json       # full-access, onStartup
  index.js            # 生命周期
  README.md
  assets/
    hub.css           # CSS 独立文件（模块级常量秒出）
    hub.js            # JS 独立文件（DOM patching + 序列号防竞态）
  routes/
    hub.js            # 骨架路由 + 进程缓存 + API 代理
    patcher.js        # asar 补丁引擎（版本锁定 + 完整性校验 + 互斥锁）
```

## 安全

- 默认不修改核心，增强补丁需手动确认
- 补丁安装前自动备份，可随时恢复
- `@electron/asar` 版本锁定防供应链攻击
- 打包后完整性校验，损坏即中止
- 文件锁防并发，`try/finally` 清理
- SVG icon DOMParser 白名单防 XSS

## 注意事项

- page 插件需 `trust: full-access`
- 增强补丁修改 `app.asar`，理解风险后操作
- 异常时点「卸载增强补丁」并重启

## 兼容性

- `minAppVersion`: 0.82.0
- 动态适配 Hana 版本（自动匹配 ChannelTabBar 文件哈希）
