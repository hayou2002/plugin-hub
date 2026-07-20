import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { installEnhancementPatch, uninstallEnhancementPatch, readPatchStatus } from "./patcher.js";

const __fileDir = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.dirname(__fileDir);
const ASSETS_DIR = path.join(ROOT_DIR, "assets");

// \u6a21\u5757\u52a0\u8f7d\u65f6\u4e00\u6b21\u6027\u8bfb\u5165 CSS/JS
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

/* \u8fdb\u7a0b\u7ea7\u7f13\u5b58 */
let _layoutCache = null;
let _cachedState = null;
let _cachedStateTs = 0;

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
  /* \u4e3b\u9875\u9762 */
  app.get("/page", (c) => {
    try {
      const hc = c.req.query("hana-css") || "";
      const th = c.req.query("hana-theme") || "inherit";
      const token = getToken(c);
      const pid = ctx.pluginId || "plugin-hub";
      const base = `/api/plugins/${pid}`;

      // \u540c\u6b65\u77ac\u65f6\u6570\u636e
      const initialState = {
        pages: (_cachedState && _cachedState.pages) || [],
        widgets: (_cachedState && _cachedState.widgets) || [],
        prefs: (_cachedState && _cachedState.prefs) || { hiddenTabs: [], hiddenWidgets: [], tabOrder: [] },
        layout: getCachedLayout(ctx),
        stale: !_cachedState,
      };

      const html = `<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>\u63d2\u4ef6\u62bd\u5c49</title>
${hc ? `<link rel="stylesheet" href="${esc(hc)}">` : ""}
<style>${CSS_CONTENT}</style>
</head>
<body data-hana-theme="${esc(th)}" data-surface="page">
<main class="wrap">

  <!-- Browse Mode -->
  <div id="browse-view">
    <div class="header">
      <div class="title-area"><h1>\u62bd\u5c49</h1><p class="sub">\u6536\u8fdb\u7684\u63d2\u4ef6\u6309\u6587\u4ef6\u5939\u5206\u7c7b\u5c55\u793a\uff0c\u70b9\u51fb\u5373\u53ef\u6253\u5f00</p></div>
      <div class="header-actions">
        <button id="theme-btn" class="icon-btn" type="button" title="\u4e3b\u9898">\uD83C\uDFA8</button>
        <button id="manage-btn" class="manage-btn" type="button">\u2699 \u7ba1\u7406</button>
      </div>
      <div id="theme-pop" class="theme-pop">
        <div class="theme-pop-title">\u9009\u62e9\u4e3b\u9898</div>
        <div id="theme-list" class="theme-grid"></div>
      </div>
    </div>
    <div class="search-bar"><span class="si">\uD83D\uDD0D</span><input id="search" type="search" placeholder="\u641c\u7d22\u62bd\u5c49\u4e2d\u7684\u63d2\u4ef6..."></div>
    <div id="browse-list"></div>
  </div>

  <!-- Management Mode -->
  <div id="mgmt-view" class="mgmt">
    <div class="mgmt-bar">
      <button id="back-btn" class="back" type="button">\u2190 \u8fd4\u56de</button>
      <h2>\u63d2\u4ef6\u7ba1\u7406</h2>
    </div>

    <div class="stats">
      <div class="stat"><div class="v" id="stat-topbar">0</div><div class="l">\u9876\u680f</div></div>
      <div class="stat"><div class="v" id="stat-drawer">0</div><div class="l">\u62bd\u5c49</div></div>
      <div class="stat"><div class="v" id="stat-widget">0</div><div class="l">\u4fa7\u680f</div></div>
    </div>

    <div class="qa">
      <button id="collect-all" class="pri" type="button">\u2B07 \u5168\u90e8\u6536\u8fdb</button>
      <button id="restore-all" type="button">\u2B06 \u5168\u90e8\u7f6e\u9876</button>
    </div>

    <div id="fm-panel" class="fm-panel">
      <div class="fm-head" id="fm-head">
        <span class="label">\uD83D\uDCC2 \u6587\u4ef6\u5939</span>
        <button id="new-folder" class="add" type="button" title="\u65b0\u5efa">+</button>
        <span class="arrow">\u25BC</span>
      </div>
      <div id="folder-list" class="fm-body"></div>
    </div>

    <section class="section">
      <div class="section-head"><span class="section-title">\u9876\u680f\u6807\u7b7e</span><span class="section-count"></span></div>
      <div id="pages-list" class="pl"></div>
    </section>
    <section class="section">
      <div class="section-head"><span class="section-title">\u4fa7\u680f\u9762\u677f</span><span class="section-count"></span></div>
      <div id="widgets-list" class="pl"></div>
    </section>
  </div>

</main>
<div id="toast"></div>
<script>
window.__PLUGIN_HUB__ = {
  base: ${JSON.stringify(base)},
  stateUrl: ${JSON.stringify(`${base}/api/state${token ? `?token=${encodeURIComponent(token)}` : ""}`)},
  prefsUrl: ${JSON.stringify(`${base}/api/prefs${token ? `?token=${encodeURIComponent(token)}` : ""}`)},
  layoutUrl: ${JSON.stringify(`${base}/api/layout${token ? `?token=${encodeURIComponent(token)}` : ""}`)},
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

  // \u540e\u53f0\u9884\u70ed\u7f13\u5b58
  (function warmCache() {
    const base = "http://localhost:" + (process.env.PORT || "6806");
    fetchFreshState(base, {}, ctx);
  })();

  /* \u83b7\u53d6\u63d2\u4ef6\u5217\u8868 + \u504f\u597d */
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
      return c.json({ pages, widgets, prefs: prefsRes || {}, layout: readDrawerLayout(ctx) });
    } catch (e) {
      return c.json({ error: e.message, pages: [], widgets: [], prefs: {} }, 500);
    }
  });

  /* \u5e03\u5c40 */
  app.get("/api/layout", (c) => c.json(readDrawerLayout(ctx)));

  app.put("/api/layout", async (c) => {
    try {
      const body = await c.req.json();
      
      /* 检测 _patchOverflow 标记→执行补丁重装 */
      if (body && body._patchOverflow) {
        delete body._patchOverflow;
        ctx._phForce = true;  // 跳过预检查，强制重写补丁
        const status = readPatchStatus(ctx);
        if (status.installed) {
          try { uninstallEnhancementPatch(ctx); } catch (e) {
            // 备份可能已丢失，忽略卸载失败
          }
        }
        const result = installEnhancementPatch(ctx);
        delete ctx._phForce;
        if (!result.ok && !result.alreadyPatched) {
          return c.json({ ok: false, error: result.error || "patch failed" }, 500);
        }
        return c.json({ ok: true, ...result });
      }
      
      const folders = (Array.isArray(body?.folders) ? body.folders : []).map(f => ({
        id: String(f.id || ""),
        name: String(f.name || "\u672a\u547d\u540d"),
        items: Array.isArray(f.items) ? f.items.map(String) : [],
      })).filter(f => f.id);
      writeDrawerLayout(ctx, { folders, rootItems: (Array.isArray(body?.rootItems) ? body.rootItems : []).map(String) });
      return c.json({ ok: true, folders, rootItems: body.rootItems });
    } catch (e) {
      return c.json({ error: e.message }, 500);
    }
  });

  /* \u504f\u597d\u4ee3\u7406 */
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
