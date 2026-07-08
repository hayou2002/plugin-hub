# 增强补丁安装指南

当用户请求安装 plugin-hub 增强补丁时，执行以下步骤：

## 自动安装（推荐）

1. 调用 `plugin-hub_install-patch` 工具，参数 `action: "install"`
2. 工具会自动执行：查找 app.asar → 解压 → 打补丁 → 重新打包
3. 返回安装结果（成功/失败/已安装）

## 手动安装（自动安装失败时）

如果自动安装失败，按以下步骤排查：

1. 确认 HanaAgent 已正确安装（app.asar 存在）
2. 确认有足够权限修改 app.asar 文件
3. 检查网络连接（需要下载 @electron/asar 工具）
4. 查看错误信息，常见问题：
   - "app.asar not found" → HanaAgent 安装路径异常
   - "Patch did not match" → HanaAgent 版本不兼容，补丁需要更新
   - "asar extract failed" → 网络问题或 npm/npx 不可用

## 补丁内容

增强补丁为 plugin-hub 的抽屉功能添加：
- 下拉菜单文件夹分类
- 插件拖拽排序
- 自动收起/展开

安装后需要重启 HanaAgent 生效。
