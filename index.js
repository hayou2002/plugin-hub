import fs from "node:fs";
import path from "node:path";

// Multiple CSS selectors to handle different Hana versions
const CSS_RULES = [
  'button[class*="overflow"]{display:none!important}',
  '[class*="overflowBtn"]{display:none!important}',
];

function findRendererAssetsDir(ctx) {
  const hanaDir = path.dirname(path.dirname(ctx.dataDir));
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

function injectOverflowHide(ctx) {
  try {
    const assetsDir = findRendererAssetsDir(ctx);
    if (!assetsDir) return false;

    // Find ChannelTabBar CSS file (content-hashed filename, use glob)
    const cssFiles = fs.readdirSync(assetsDir)
      .filter(f => /^ChannelTabBar-.+\.css$/.test(f))
      .sort()
      .reverse();
    if (cssFiles.length === 0) return false;

    const cssPath = path.join(assetsDir, cssFiles[0]);
    let content = fs.readFileSync(cssPath, "utf-8");

    let injected = false;
    for (const rule of CSS_RULES) {
      if (content.includes(rule)) continue;
      content += "\n" + rule + "\n";
      injected = true;
    }

    if (!injected) {
      ctx?.log?.info?.("[PluginHub] Overflow hide CSS already injected");
      return true;
    }

    fs.writeFileSync(cssPath, content, "utf-8");
    ctx?.log?.info?.("[PluginHub] Overflow hide CSS injected into " + cssFiles[0]);
    return true;
  } catch (e) {
    ctx?.log?.warn?.("[PluginHub] injectOverflowHide: " + e.message);
    return false;
  }
}

export default class PluginHubPlugin {
  constructor(ctx) {
    this.ctx = ctx;
  }

  async onload() {
    this.ctx?.log?.info?.("[PluginHub] loaded");

    // Inject CSS to hide the overflow ▼ button in the top bar
    // Retry up to 3 times with delay (renderer cache might not be ready on first startup)
    const maxAttempts = 3;
    for (let i = 0; i < maxAttempts; i++) {
      if (injectOverflowHide(this.ctx)) break;
      if (i < maxAttempts - 1) {
        await new Promise(r => setTimeout(r, 2000 * (i + 1)));
      }
    }
  }

  async onunload() {
    this.ctx?.log?.info?.("[PluginHub] unloaded");
  }
}