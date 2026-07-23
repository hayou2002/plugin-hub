/**
 * tools/install-patch.js — 安装项栏 ▼ 隐藏补丁
 * 安全版：修改已解压的 renderer CSS 文件，不碰 tar.gz/seed-train.json
 * 插件每次启动时自动注入，此工具用于手动触发或查看状态
 */
import fs from "node:fs";
import path from "node:path";

export const name = "install-patch";
export const description = "隐藏 HanaAgent 顶栏的 ▼ 下拉按钮（抽屉收纳后出现的那个按钮）。安全版，不修改 renderer 种子文件，不触发 SHA256 校验。安装后重启 Hana 生效。";
export const parameters = {
  type: "object",
  properties: {
    action: {
      type: "string",
      enum: ["install", "uninstall", "status"],
      description: "操作类型：install 安装，uninstall 卸载，status 查看状态。默认 status"
    }
  },
  required: []
};

export const sessionPermission = {
  kind: "external_side_effect",
  description: "修改 artifacts/renderer 目录中的 CSS 文件，不影响种子文件和校验"
};

const CSS_RULES = [
  'button[class*="overflow"]{display:none!important}',
  '[class*="overflowBtn"]{display:none!important}',
];

function findRendererAssetsDir(ctx) {
  const dataDir = ctx?.dataDir;
  if (!dataDir) return null;
  const hanaDir = path.dirname(path.dirname(dataDir));
  const rendererDir = path.join(hanaDir, "artifacts", "renderer");
  if (!fs.existsSync(rendererDir)) return null;
  const versions = fs.readdirSync(rendererDir)
    .filter(d => /^\d/.test(d))
    .sort()
    .reverse();
  if (versions.length === 0) return null;
  const assetsDir = path.join(rendererDir, versions[0], "assets");
  return fs.existsSync(assetsDir) ? assetsDir : null;
}

function getCssPath(ctx) {
  const assetsDir = findRendererAssetsDir(ctx);
  if (!assetsDir) return null;
  const files = fs.readdirSync(assetsDir)
    .filter(f => /^ChannelTabBar-.+\.css$/.test(f))
    .sort()
    .reverse();
  return files.length > 0 ? path.join(assetsDir, files[0]) : null;
}

function isInjected(ctx) {
  const cssPath = getCssPath(ctx);
  if (!cssPath) return false;
  try {
    const content = fs.readFileSync(cssPath, "utf-8");
    return CSS_RULES.some(r => content.includes(r));
  } catch {
    return false;
  }
}

export async function execute(params, toolCtx) {
  const action = params?.action || "status";
  const ctx = toolCtx?.plugin || toolCtx;

  try {
    if (action === "status") {
      const injected = isInjected(ctx);
      return {
        installed: injected,
        note: injected
          ? "▼ 隐藏 CSS 已注入到当前 renderer CSS 文件中"
          : "▼ 隐藏 CSS 未注入，执行 action=install 可安装"
      };
    }

    if (action === "uninstall") {
      const cssPath = getCssPath(ctx);
      if (!cssPath) {
        return { ok: false, error: "找不到 renderer CSS 文件" };
      }
      let content = fs.readFileSync(cssPath, "utf-8");
      let removed = false;
      for (const rule of CSS_RULES) {
        if (content.includes(rule)) {
          content = content.replace(rule, "");
          removed = true;
        }
      }
      if (removed) {
        // Cleanup empty lines
        content = content.replace(/\n{3,}/g, "\n\n");
        fs.writeFileSync(cssPath, content, "utf-8");
      }
      return {
        ok: true,
        installed: false,
        note: removed ? "▼ 隐藏 CSS 已移除" : "之前未安装"
      };
    }

    // Install: inject CSS into extracted renderer file
    const cssPath = getCssPath(ctx);
    if (!cssPath) {
      return {
        ok: false,
        error: "找不到 renderer CSS 文件",
        note: "请先启动 Hana 一次，让 renderer 缓存生成后再执行安装"
      };
    }

    let content = fs.readFileSync(cssPath, "utf-8");
    let injected = false;
    for (const rule of CSS_RULES) {
      if (content.includes(rule)) continue;
      content += "\n" + rule + "\n";
      injected = true;
    }
    if (injected) {
      fs.writeFileSync(cssPath, content, "utf-8");
    }

    return {
      ok: true,
      installed: true,
      note: injected
        ? "▼ 隐藏 CSS 已注入，重启 Hana 后生效（或切换到其他页面再切回来触发重渲染）"
        : "▼ 隐藏 CSS 已存在，无需重复安装",
      restartRequired: false // CSS affects renderer on next style recalc
    };
  } catch (e) {
    return {
      ok: false,
      error: e.message,
      note: "操作失败: " + e.message
    };
  }
}