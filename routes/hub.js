import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { installEnhancementPatch, uninstallEnhancementPatch, readPatchStatus } from "./patcher.js";

const __fileDir = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.dirname(__fileDir);
const ASSETS_DIR = path.join(ROOT_DIR, "assets");

// 模块加载时一次性读入 CSS/JS（参考 hana-backup 架构，秒开关键）
const CSS_CONTENT = (() => {
  try { return fs.readFileSync(path.join(ASSETS_DIR, "hub.css"), "utf-8"); }
  catch { return ""; }
})();
const JS_CONTENT = (() => {
  try { return fs.readFileSync(path.join(ASSETS_DIR, "hub.js"), "utf-8"); }
  catch { return ""; }
})();

function getLayoutPath(ctx) {
  return ctx?.dataDir ? path.join(ctx.dataDir, "drawer-layout.json") : null;
}

function readDrawerLayout(ctx) {
  try {
    const file = getLayoutPath(ctx);
    if (!file || !fs.existsSync(file)) return { folders: [], rootItems: [] };
    const data = JSON.parse(fs.readFileSync(file, "utf8") || "{}");
    return {
      folders: Array.isArray(data.folders) ? data.folders : [],
      rootItems: Array.isArray(data.rootItems) ? data.rootItems : [],
    };
  } catch {
    return { folders: [], rootItems: [] };
  }
}

function writeDrawerLayout(ctx, layout) {
  const file = getLayoutPath(ctx);
  if (!file) return;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(layout, null, 2)}\n`, "utf8");
  _layoutCache = null;
}

function getToken(c) {
  const auth = c.req.header("Authorization") || "";
  if (auth.startsWith("Bearer ")) return auth.slice(7);
  return c.req.query("token") || "";
}

function getBaseUrl(c) {
  const host = c.req.header("host") || "localhost:6806";
  return `http://${host}`;
}

function esc(v) {
  return String(v == null ? "" : v).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/* ════════════════════════════════════════════════════
   进程级缓存
   ════════════════════════════════════════════════════ */
let _runtimeCache = null;
let _layoutCache = null;
let _cachedState = null;
let _cachedStateTs = 0;

function getRuntimeStatus(ctx) {
  if (!_runtimeCache) _runtimeCache = readPatchStatus(ctx);
  return _runtimeCache;
}

function getCachedLayout(ctx) {
  if (!_layoutCache) _layoutCache = readDrawerLayout(ctx);
  return _layoutCache;
}

async function fetchFreshState(base, headers, ctx) {
  if (_cachedState && Date.now() - _cachedStateTs < 30000) return _cachedState;
  try {
    const [pagesRes, widgetsRes, prefsRes] = await Promise.all([
      fetch(`${base}/api/plugins/pages`, { headers }).then(r => r.ok ? r.json() : null).catch(() => null),
      fetch(`${base}/api/plugins/widgets`, { headers }).then(r => r.ok ? r.json() : null).catch(() => null),
      fetch(`${base}/api/preferences/plugin-ui`, { headers }).then(r => r.ok ? r.json() : null).catch(() => null),
    ]);
    const myId = ctx.pluginId || "plugin-hub";
    const state = {
      pages: (Array.isArray(pagesRes) ? pagesRes : []).filter(p => p.pluginId !== myId),
      widgets: Array.isArray(widgetsRes) ? widgetsRes : [],
      prefs: prefsRes || { hiddenTabs: [], hiddenWidgets: [], tabOrder: [] },
    };
    _cachedState = state;
    _cachedStateTs = Date.now();
    return state;
  } catch (e) {
    return _cachedState || { pages: [], widgets: [], prefs: { hiddenTabs: [], hiddenWidgets: [], tabOrder: [] } };
  }
}

export default function registerHubRoutes(app, ctx) {
  /* ── 主页面（骨架秒出，参考 hana-backup 架构）── */
  app.get("/page", (c) => {
    try {
      const hc = c.req.query("hana-css") || "";
      const th = c.req.query("hana-theme") || "inherit";
      const token = getToken(c);
      const pid = ctx.pluginId || "plugin-hub";
      const base = `/api/plugins/${pid}`;

      // 同步瞬时数据（进程缓存，零 I/O）
      const initialState = {
        pages: (_cachedState && _cachedState.pages) || [],
        widgets: (_cachedState && _cachedState.widgets) || [],
        prefs: (_cachedState && _cachedState.prefs) || { hiddenTabs: [], hiddenWidgets: [], tabOrder: [] },
        runtime: getRuntimeStatus(ctx),
        layout: getCachedLayout(ctx),
        stale: !_cachedState,
      };

      const html = `<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>插件中心</title>
${hc ? `<link rel="stylesheet" href="${esc(hc)}">` : ""}
<style>${CSS_CONTENT}</style>
</head>
<body data-hana-theme="${esc(th)}" data-surface="page">
<main class="wrap">
  <header class="header">
    <h1>插件抽屉</h1>
    <p class="sub">设置哪些插件固定显示在顶栏；低频插件收进原生溢出菜单，保持顶栏清爽。</p>
    <div id="runtime-notice" class="notice">默认安全模式：不修改 Hana 核心；点击下方按钮后才会安装原生下拉增强补丁。</div>
    <div class="patch-panel">
      <strong>原生下拉增强补丁</strong>
      <div id="patch-status">状态读取中...</div>
      <div class="patch-actions">
        <button id="patch-install" class="primary" type="button">安装增强补丁</button>
        <button id="patch-uninstall" type="button">卸载增强补丁</button>
      </div>
    </div>
    <div class="stats">
      <div class="stat"><strong id="stat-pages">0/0</strong><span>顶栏标签</span></div>
      <div class="stat"><strong id="stat-widgets">0/0</strong><span>侧栏面板</span></div>
    </div>
  </header>
  <div class="toolbar">
    <input id="search" class="search" type="search" placeholder="搜索插件名称或描述...">
    <button id="new-folder" class="toolbar-btn ghost" type="button">+ 新建文件夹</button>
    <button id="collect-all" class="toolbar-btn" type="button">全部收进抽屉</button>
    <button id="restore-all" class="toolbar-btn ghost" type="button">全部置顶</button>
  </div>
  <div class="folder-panel">
    <div class="folder-head"><strong>下拉文件夹</strong><span class="folder-hint">右键文件夹可重命名 / 删除</span></div>
    <div id="folder-chips" class="folder-chips"></div>
  </div>
  <section class="section">
    <h2 class="section-title">顶栏置顶</h2>
    <div id="pages-list" class="list"></div>
  </section>
  <section class="section">
    <h2 class="section-title">侧栏面板</h2>
    <div id="widgets-list" class="list"></div>
  </section>
</main>
<div id="toast"></div>
<script>
window.__PLUGIN_HUB__ = {
  base: ${JSON.stringify(base)},
  stateUrl: ${JSON.stringify(`${base}/api/state${token ? `?token=${encodeURIComponent(token)}` : ""}`)},
  prefsUrl: ${JSON.stringify(`${base}/api/prefs${token ? `?token=${encodeURIComponent(token)}` : ""}`)},
  layoutUrl: ${JSON.stringify(`${base}/api/layout${token ? `?token=${encodeURIComponent(token)}` : ""}`)},
  patchInstallUrl: ${JSON.stringify(`${base}/api/patch/install${token ? `?token=${encodeURIComponent(token)}` : ""}`)},
  patchUninstallUrl: ${JSON.stringify(`${base}/api/patch/uninstall${token ? `?token=${encodeURIComponent(token)}` : ""}`)},
  state: ${JSON.stringify(initialState)}
};
</script>
<script>(function(){window.parent.postMessage({source:"hana-plugin",type:"ready"},"*");})();</script>
<script>${JS_CONTENT}</script>
</body>
</html>`;
      return c.html(html);
    } catch (e) {
      ctx.log?.error?.("[PluginHub] /page ERROR: " + e.message);
      return c.text("Error: " + e.message, 500);
    }
  });

  // 后台预热缓存
  (function warmCache() {
    const base = "http://localhost:" + (process.env.PORT || "6806");
    fetchFreshState(base, {}, ctx);
  })();

  /* ── 获取插件列表 + 偏好 ── */
  app.get("/api/state", async (c) => {
    const token = getToken(c);
    const base = getBaseUrl(c);
    const headers = {};
    const auth = c.req.header("authorization");
    if (auth) headers["Authorization"] = auth;
    else if (token) headers["Authorization"] = `Bearer ${token}`;

    try {
      const [pagesRes, widgetsRes, prefsRes] = await Promise.all([
        fetch(`${base}/api/plugins/pages`, { headers }).then(r => r.ok ? r.json() : []).catch(() => []),
        fetch(`${base}/api/plugins/widgets`, { headers }).then(r => r.ok ? r.json() : []).catch(() => []),
        fetch(`${base}/api/preferences/plugin-ui`, { headers }).then(r => r.ok ? r.json() : {}).catch(() => ({})),
      ]);
      const myId = ctx.pluginId || "plugin-hub";
      const pages = (Array.isArray(pagesRes) ? pagesRes : []).filter(p => p.pluginId !== myId);
      const widgets = (Array.isArray(widgetsRes) ? widgetsRes : []).filter(w => w.pluginId !== myId);
      return c.json({ pages, widgets, prefs: prefsRes || {}, runtime: readPatchStatus(ctx), layout: readDrawerLayout(ctx) });
    } catch (e) {
      return c.json({ error: e.message, pages: [], widgets: [], prefs: {}, runtime: readPatchStatus(ctx) }, 500);
    }
  });

  /* ── 布局 ── */
  app.get("/api/layout", (c) => c.json(readDrawerLayout(ctx)));

  app.put("/api/layout", async (c) => {
    try {
      const body = await c.req.json();
      const folders = (Array.isArray(body?.folders) ? body.folders : []).map(f => ({
        id: String(f.id || ""),
        name: String(f.name || "未命名"),
        items: Array.isArray(f.items) ? f.items.map(String) : [],
      })).filter(f => f.id);
      writeDrawerLayout(ctx, { folders, rootItems: (Array.isArray(body?.rootItems) ? body.rootItems : []).map(String) });
      return c.json({ ok: true, folders, rootItems: body.rootItems });
    } catch (e) {
      return c.json({ error: e.message }, 500);
    }
  });

  /* ── 补丁 ── */
  app.get("/api/patch/status", (c) => c.json(readPatchStatus(ctx)));

  app.post("/api/patch/install", (c) => {
    try {
      const result = installEnhancementPatch(ctx);
      _runtimeCache = null;
      return c.json(result);
    } catch (e) {
      return c.json({ ok: false, error: e.message }, 500);
    }
  });

  app.post("/api/patch/uninstall", (c) => {
    try {
      const result = uninstallEnhancementPatch(ctx);
      _runtimeCache = null;
      return c.json(result);
    } catch (e) {
      return c.json({ ok: false, error: e.message }, 500);
    }
  });

  /* ── 偏好代理 ── */
  app.put("/api/prefs", async (c) => {
    const token = getToken(c);
    const base = getBaseUrl(c);
    const headers = { "Content-Type": "application/json" };
    const auth = c.req.header("authorization");
    if (auth) headers["Authorization"] = auth;
    else if (token) headers["Authorization"] = `Bearer ${token}`;

    try {
      const body = await c.req.json();
      const res = await fetch(`${base}/api/preferences/plugin-ui`, { method: "PUT", headers, body: JSON.stringify(body) });
      const data = await res.json();
      if (res.ok) setTimeout(() => { ctx.bus?.emit?.({ type: "plugin_ui_changed" }); }, 80);
      return c.json(data, res.status);
    } catch (e) {
      return c.json({ error: e.message }, 500);
    }
  });
}
