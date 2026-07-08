# 插件抽屉（plugin-hub）

Hana 插件抽屉。管理顶栏插件置顶/收纳、文件夹分类。

**秒开架构**：CSS/JS 外部化 + 进程级缓存 + 同步骨架，点击即开。

## 安装

1. 下载 [最新 Release](https://github.com/hayou2002/plugin-hub/releases/latest) 的 zip
2. 打开 Hana → 插件管理
3. 拖入 zip 安装，重启 Hana

## 用法

- 安装后顶栏出现「抽屉」标签
- 点击进入管理页，通过开关控制插件显示/隐藏
- 创建文件夹分类管理下拉插件
- 点击「安装增强补丁」启用原生下拉增强（悬浮自动展开、文件夹子菜单、点击不置顶）

## 版本结构

```
plugin-hub/
  releases/             ← 历史版本归档
    v1.3.0/              ← 原始版本
  manifest.json          ← v1.4.0（最新）
  index.js
  routes/
    hub.js
    patcher.js           ← 智能补丁引擎（正则匹配、多平台、自动重试）
  assets/
    hub.css
    hub.js
  tools/
    install-patch.js
  CHANGELOG.md
  README.md
```

## 安全

- 默认不修改核心，增强补丁需手动确认
- 安装前自动备份 app.asar，可随时「卸载增强补丁」恢复
- `@electron/asar` 版本锁定 + 完整性校验 + 互斥文件锁

## 兼容性

- `minAppVersion`: 0.82.0
- 智能适配不同 Hana 版本（正则模糊匹配 ChannelTabBar 代码变化）
- 支持 Windows / macOS / Linux
