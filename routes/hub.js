import fs from "node:fs";
import path from "node:path";
import { installEnhancementPatch, uninstallEnhancementPatch, readPatchStatus } from "./patcher.js";

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
}

/**
 * Plugin Hub - 插件中心路由
 *
 * /page       - 主页面（HTML）
 * /api/state  - 获取所有 page/widget 插件列表 + 当前标签偏好
 * /api/prefs  - PUT 更新标签偏好（代理原生 /api/preferences/plugin-ui）
 */

function getToken(c) {
  const auth = c.req.header("Authorization") || "";
  if (auth.startsWith("Bearer ")) return auth.slice(7);
  return c.req.query("token") || "";
}

function getBaseUrl(c) {
  const host = c.req.header("host") || "localhost:6806";
  return `http://${host}`;
}

function readRuntimeStatus(ctx) {
  return readPatchStatus(ctx);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export default function registerHubRoutes(app, ctx) {
  /* ── 主页面 ── */
  app.get("/page", (c) => {
    try {
      const token = getToken(c);
      const theme = c.req.query("hana-theme") || "inherit";
      ctx.log?.info?.("[PluginHub] /page called, theme=" + theme);
      const html = renderPage(ctx, token, theme);
      return c.html(html);
    } catch (e) {
      ctx.log?.error?.("[PluginHub] /page ERROR: " + e.message);
      return c.text("Error: " + e.message, 500);
    }
  });

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
        fetch(`${base}/api/plugins/pages`, { headers })
          .then((r) => (r.ok ? r.json() : []))
          .catch(() => []),
        fetch(`${base}/api/plugins/widgets`, { headers })
          .then((r) => (r.ok ? r.json() : []))
          .catch(() => []),
        fetch(`${base}/api/preferences/plugin-ui`, { headers })
          .then((r) => (r.ok ? r.json() : {}))
          .catch(() => ({})),
      ]);

      // 排除自己
      const myId = ctx.pluginId || "plugin-hub";
      const pages = (Array.isArray(pagesRes) ? pagesRes : []).filter(
        (p) => p.pluginId !== myId
      );
      const widgets = (Array.isArray(widgetsRes) ? widgetsRes : []).filter(
        (w) => w.pluginId !== myId
      );

      return c.json({
        pages,
        widgets,
        prefs: prefsRes || {},
        runtime: readRuntimeStatus(ctx),
        layout: readDrawerLayout(ctx),
      });
    } catch (e) {
      ctx.log?.error?.("[PluginHub] /api/state ERROR: " + e.message);
      return c.json(
        { error: e.message, pages: [], widgets: [], prefs: {}, runtime: readRuntimeStatus(ctx) },
        500
      );
    }
  });

  /* ── 读取 / 保存抽屉文件夹布局 ── */
  app.get("/api/layout", (c) => c.json(readDrawerLayout(ctx)));

  app.put("/api/layout", async (c) => {
    try {
      const body = await c.req.json();
      const folders = Array.isArray(body?.folders) ? body.folders : [];
      const rootItems = Array.isArray(body?.rootItems) ? body.rootItems : [];
      const clean = {
        folders: folders.map((f) => ({
          id: String(f.id || ""),
          name: String(f.name || "未命名"),
          items: Array.isArray(f.items) ? f.items.map(String) : [],
        })).filter((f) => f.id),
        rootItems: rootItems.map(String),
      };
      writeDrawerLayout(ctx, clean);
      return c.json({ ok: true, ...clean });
    } catch (e) {
      return c.json({ error: e.message }, 500);
    }
  });

  /* ── 增强补丁：安装 / 卸载 ── */
  app.get("/api/patch/status", (c) => c.json(readPatchStatus(ctx)));

  app.post("/api/patch/install", (c) => {
    try {
      return c.json(installEnhancementPatch(ctx));
    } catch (e) {
      return c.json({ ok: false, error: e.message }, 500);
    }
  });

  app.post("/api/patch/uninstall", (c) => {
    try {
      return c.json(uninstallEnhancementPatch(ctx));
    } catch (e) {
      return c.json({ ok: false, error: e.message }, 500);
    }
  });

  /* ── 更新偏好（代理原生 API）── */
  app.put("/api/prefs", async (c) => {
    const token = getToken(c);
    const base = getBaseUrl(c);
    const headers = { "Content-Type": "application/json" };
    const auth = c.req.header("authorization");
    if (auth) headers["Authorization"] = auth;
    else if (token) headers["Authorization"] = `Bearer ${token}`;

    try {
      const body = await c.req.json();
      const res = await fetch(`${base}/api/preferences/plugin-ui`, {
        method: "PUT",
        headers,
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok) {
        // 请求先返回给抽屉页面，再异步通知 renderer 刷新顶栏，避免当前 iframe 长时间 loading。
        setTimeout(() => {
          ctx.bus?.emit?.({ type: "plugin_ui_changed" });
        }, 80);
      }
      return c.json(data, res.status);
    } catch (e) {
      ctx.log?.error?.("[PluginHub] /api/prefs PUT ERROR: " + e.message);
      return c.json({ error: e.message }, 500);
    }
  });
}

/* ════════════════════════════════════════════════════
   HTML 页面渲染
   ════════════════════════════════════════════════════ */

function renderPage(ctx, token, theme) {
  const pid = ctx.pluginId || "plugin-hub";
  const base = `/api/plugins/${pid}`;
  const stateUrl = `${base}/api/state${token ? `?token=${encodeURIComponent(token)}` : ""}`;
  const prefsUrl = `${base}/api/prefs${token ? `?token=${encodeURIComponent(token)}` : ""}`;
  const layoutUrl = `${base}/api/layout${token ? `?token=${encodeURIComponent(token)}` : ""}`;
  const patchInstallUrl = `${base}/api/patch/install${token ? `?token=${encodeURIComponent(token)}` : ""}`;
  const patchUninstallUrl = `${base}/api/patch/uninstall${token ? `?token=${encodeURIComponent(token)}` : ""}`;

  return `<!doctype html>
<html lang="zh">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>插件中心</title>
<style>
:root {
  --bg: #f7f6f3;
  --panel: #ffffff;
  --line: #e5e2db;
  --text: #2c2c2c;
  --muted: #7a7a7a;
  --accent: #4a90d9;
  --accent-soft: #e8f0fc;
  --shadow: 0 1px 2px rgba(0,0,0,0.05);
}
body[data-hana-theme="dark"] {
  --bg: #1a1a1a;
  --panel: #252525;
  --line: #383838;
  --text: #e0e0e0;
  --muted: #888;
  --accent: #5fa8f5;
  --accent-soft: #1a2838;
  --shadow: 0 1px 3px rgba(0,0,0,0.3);
}
@media (prefers-color-scheme: dark) {
  body[data-hana-theme="inherit"], body[data-hana-theme=""] {
    --bg: #1a1a1a;
    --panel: #252525;
    --line: #383838;
    --text: #e0e0e0;
    --muted: #888;
    --accent: #5fa8f5;
    --accent-soft: #1a2838;
    --shadow: 0 1px 3px rgba(0,0,0,0.3);
  }
}
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { height: 100%; }
body {
  background: var(--bg);
  color: var(--text);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif;
  font-size: 14px;
  line-height: 1.5;
}
.wrap { max-width: 640px; margin: 0 auto; padding: 16px 14px 28px; }

/* header */
.header { margin-bottom: 14px; }
.header h1 { font-size: 20px; font-weight: 700; }
.header .sub { color: var(--muted); font-size: 13px; margin-top: 4px; }
.notice {
  margin-top: 8px;
  padding: 7px 10px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--panel);
  color: var(--muted);
  font-size: 12px;
}
.patch-panel {
  margin-top: 8px;
  padding: 9px 10px;
  border: 1px solid #e3b341;
  border-radius: 8px;
  background: rgba(227,179,65,.1);
  font-size: 12px;
}
.patch-panel strong { display: block; margin-bottom: 4px; }
.patch-actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 8px; }
.patch-actions button {
  height: 30px;
  border: 1px solid var(--line);
  border-radius: 7px;
  background: var(--panel);
  color: var(--text);
  padding: 0 10px;
  cursor: pointer;
}
.patch-actions button.primary { border-color: var(--accent); color: var(--accent); }
.stats { display: flex; gap: 8px; margin-top: 10px; }
.stat {
  border: 1px solid var(--line);
  background: var(--panel);
  border-radius: 8px;
  padding: 6px 10px;
  box-shadow: var(--shadow);
}
.stat strong { font-size: 14px; }
.stat span { color: var(--muted); font-size: 11px; margin-left: 4px; }

/* toolbar */
.toolbar { display: flex; gap: 8px; margin-bottom: 16px; }
.search {
  flex: 1;
  min-width: 0;
  height: 36px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--panel);
  color: var(--text);
  padding: 0 12px;
  font-size: 13px;
  outline: none;
  transition: border-color 0.15s;
}
.search:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
.toolbar-btn {
  height: 36px;
  border: 1px solid var(--accent);
  border-radius: 8px;
  background: var(--accent);
  color: #fff;
  padding: 0 12px;
  font-size: 13px;
  cursor: pointer;
  white-space: nowrap;
}
.toolbar-btn.ghost {
  background: var(--panel);
  color: var(--accent);
}
.toolbar-btn:hover { filter: brightness(0.98); }
.folder-panel {
  margin: -6px 0 16px;
  padding: 10px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--panel);
  box-shadow: var(--shadow);
}
.folder-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.folder-head strong { font-size: 13px; }
.folder-hint { color: var(--muted); font-size: 11px; }
.folder-chips { display: flex; gap: 6px; flex-wrap: wrap; }
.folder-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: 1px solid var(--line);
  background: var(--bg);
  color: var(--text);
  border-radius: 999px;
  padding: 3px 8px;
  font-size: 12px;
  cursor: default;
  user-select: none;
}
.folder-chip.root { color: var(--muted); }
.folder-name-input {
  width: 74px;
  border: none;
  outline: none;
  background: transparent;
  color: var(--text);
  font-size: 12px;
}
.folder-delete {
  border: none;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  font-size: 13px;
  line-height: 1;
  padding: 0 2px;
}
.folder-delete:hover { color: #d9534f; }
.folder-select {
  height: 24px;
  max-width: 100px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--panel);
  color: var(--text);
  font-size: 11px;
  padding: 0 6px;
}

/* section */
.section { margin-bottom: 16px; }
.section-title {
  font-size: 12px;
  font-weight: 700;
  color: var(--muted);
  margin-bottom: 6px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

/* compact list */
.list { display: flex; flex-direction: column; gap: 4px; }
.item {
  display: flex;
  align-items: center;
  gap: 9px;
  min-height: 38px;
  padding: 6px 10px;
  border: 1px solid var(--line);
  background: var(--panel);
  border-radius: 8px;
  box-shadow: var(--shadow);
  transition: border-color 0.15s, opacity 0.15s;
}
.item:hover { border-color: var(--accent); }
.item.is-hidden { opacity: 0.62; }
.item.is-hidden:hover { opacity: 0.82; }

.item-icon {
  width: 18px; height: 18px;
  flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  color: var(--text);
}
.item-icon svg { width: 17px; height: 17px; }
.item-icon-fallback {
  width: 18px; height: 18px;
  border-radius: 4px;
  background: var(--accent-soft);
  color: var(--accent);
  font-size: 11px;
  font-weight: 700;
  display: flex; align-items: center; justify-content: center;
}

.item-info { flex: 1; min-width: 0; cursor: pointer; display: flex; align-items: baseline; gap: 8px; }
.item-name { font-size: 13px; font-weight: 650; white-space: nowrap; }
.item-desc {
  flex: 1;
  min-width: 0;
  font-size: 11px;
  color: var(--muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.item-status {
  flex-shrink: 0;
  min-width: 42px;
  text-align: center;
  padding: 2px 7px;
  border-radius: 999px;
  background: var(--accent-soft);
  color: var(--accent);
  font-size: 11px;
  line-height: 1.4;
}
.item.is-hidden .item-status {
  background: transparent;
  border: 1px solid var(--line);
  color: var(--muted);
}

/* toggle switch */
.switch {
  position: relative;
  display: inline-block;
  width: 36px; height: 20px;
  flex-shrink: 0;
}
.switch input { opacity: 0; width: 0; height: 0; }
.slider {
  position: absolute;
  cursor: pointer;
  inset: 0;
  background: var(--line);
  border-radius: 999px;
  transition: 0.2s;
}
.slider::before {
  content: "";
  position: absolute;
  height: 14px; width: 14px;
  left: 3px; bottom: 3px;
  background: #fff;
  border-radius: 50%;
  transition: 0.2s;
  box-shadow: 0 1px 2px rgba(0,0,0,0.25);
}
.switch input:checked + .slider { background: var(--accent); }
.switch input:checked + .slider::before { transform: translateX(16px); }

/* empty / loading / error */
.msg {
  border: 1px solid var(--line);
  background: var(--panel);
  border-radius: 8px;
  padding: 24px;
  text-align: center;
  color: var(--muted);
}
.msg.error { color: #c5372a; }

/* toast */
#toast {
  position: fixed;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%) translateY(60px);
  background: var(--text);
  color: var(--bg);
  padding: 8px 18px;
  border-radius: 8px;
  font-size: 13px;
  opacity: 0;
  transition: 0.25s;
  pointer-events: none;
  z-index: 999;
}
#toast.show {
  opacity: 1;
  transform: translateX(-50%) translateY(0);
}

@media (max-width: 600px) {
  .wrap { padding: 14px 10px 24px; }
  .stats { flex-wrap: wrap; }
  .toolbar { flex-wrap: wrap; }
  .search { flex-basis: 100%; }
}
</style>
</head>
<body data-hana-theme="${escapeHtml(theme)}">
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
    <div id="pages-list" class="list"><div class="msg">加载中...</div></div>
  </section>

  <section class="section">
    <h2 class="section-title">侧栏面板</h2>
    <div id="widgets-list" class="list"><div class="msg">加载中...</div></div>
  </section>
</main>

<div id="toast"></div>

<script>
var STATE_URL = ${JSON.stringify(stateUrl)};
var PREFS_URL = ${JSON.stringify(prefsUrl)};
var LAYOUT_URL = ${JSON.stringify(layoutUrl)};
var PATCH_INSTALL_URL = ${JSON.stringify(patchInstallUrl)};
var PATCH_UNINSTALL_URL = ${JSON.stringify(patchUninstallUrl)};
var state = { pages: [], widgets: [], prefs: { hiddenTabs: [], hiddenWidgets: [], tabOrder: [] }, runtime: {}, layout: { folders: [], rootItems: [] } };

try { parent.postMessage({ type: "ready" }, "*"); } catch(e) {}

/* ── helpers ── */
function escapeText(s) {
  return String(s || "").replace(/[&<>"']/g, function(ch) {
    return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch];
  });
}
function escapeAttr(s) { return escapeText(s); }

function getTitle(item) {
  if (typeof item.title === "string") return item.title;
  if (item.title && typeof item.title === "object") return item.title.zh || item.title.en || item.pluginId || "";
  return item.pluginId || "";
}
function getDesc(item) {
  return item.description || item.desc || "";
}
function getIconHtml(item) {
  if (item.icon && typeof item.icon === "string" && item.icon.trim().startsWith("<svg")) {
    return '<span class="item-icon">' + item.icon + "</span>";
  }
  var t = getTitle(item);
  var ch = t ? t.charAt(0).toUpperCase() : "?";
  return '<span class="item-icon-fallback">' + escapeText(ch) + "</span>";
}

/* ── API ── */
async function loadState() {
  try {
    var res = await fetch(STATE_URL, { credentials: "include" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    state = await res.json();
    if (!state.prefs) state.prefs = {};
    if (!Array.isArray(state.prefs.hiddenTabs)) state.prefs.hiddenTabs = [];
    if (!Array.isArray(state.prefs.hiddenWidgets)) state.prefs.hiddenWidgets = [];
    getLayout();
    updateRuntimeNotice();
    render();
  } catch (e) {
    document.getElementById("pages-list").innerHTML = '<div class="msg error">加载失败: ' + escapeText(e.message) + "</div>";
    document.getElementById("widgets-list").innerHTML = "";
  }
}

async function saveLayout() {
  var res = await fetch(LAYOUT_URL, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(state.layout || { folders: [], rootItems: [] })
  });
  if (!res.ok) throw new Error("HTTP " + res.status);
  state.layout = await res.json();
  delete state.layout.ok;
  try { parent.postMessage({ type: "plugin-hub:drawer-layout", payload: state.layout }, "*"); } catch(e) {}
}

async function updatePrefs(prefs) {
  var res = await fetch(PREFS_URL, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(prefs),
    credentials: "include",
  });
  if (!res.ok) throw new Error("HTTP " + res.status);
  return res.json();
}

/* ── toggle ── */
async function toggleTab(pluginId, shouldShow) {
  var prev = state.prefs.hiddenTabs.slice();
  if (shouldShow) {
    state.prefs.hiddenTabs = prev.filter(function(id) { return id !== pluginId; });
  } else {
    if (!prev.includes(pluginId)) state.prefs.hiddenTabs = prev.concat([pluginId]);
  }
  render();
  try {
    await updatePrefs({ hiddenTabs: state.prefs.hiddenTabs });
    notifyRenderer();
    showToast(shouldShow ? "已设为顶栏置顶" : "已收进抽屉");
  } catch (e) {
    state.prefs.hiddenTabs = prev;
    render();
    showToast("操作失败: " + e.message);
  }
}

async function toggleWidget(pluginId, shouldShow) {
  var prev = state.prefs.hiddenWidgets.slice();
  if (shouldShow) {
    state.prefs.hiddenWidgets = prev.filter(function(id) { return id !== pluginId; });
  } else {
    if (!prev.includes(pluginId)) state.prefs.hiddenWidgets = prev.concat([pluginId]);
  }
  render();
  try {
    await updatePrefs({ hiddenWidgets: state.prefs.hiddenWidgets });
    notifyRenderer();
    showToast(shouldShow ? "已显示侧栏面板" : "已隐藏侧栏面板");
  } catch (e) {
    state.prefs.hiddenWidgets = prev;
    render();
    showToast("操作失败: " + e.message);
  }
}

/* ── visit ── */
async function visitPlugin(pluginId) {
  // 直接切换到目标插件页，不改变顶栏置顶状态。
  // Hana renderer 监听 type:"navigate-tab" + payload.tab。
  parent.postMessage({ type: "navigate-tab", payload: { tab: "plugin:" + pluginId } }, "*");
  showToast("正在打开...");
}

/* ── notify renderer ── */
function notifyRenderer() {
  // 真正的热刷新由后端 ctx.bus.emit({ type:"plugin_ui_changed" }) 完成。
  // 这里保留轻量消息，不依赖它。
  parent.postMessage({ type: "hana:plugin-ui-refresh" }, "*");
}

/* ── toast ── */
var toastTimer;
function showToast(msg) {
  if (window.hana && hana.toast && typeof hana.toast.show === "function") {
    try { hana.toast.show(msg); return; } catch(e) {}
  }
  var el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function() { el.classList.remove("show"); }, 2000);
}

function getLayout() {
  if (!state.layout) state.layout = { folders: [], rootItems: [] };
  if (!Array.isArray(state.layout.folders)) state.layout.folders = [];
  if (!Array.isArray(state.layout.rootItems)) state.layout.rootItems = [];
  return state.layout;
}

function folderOf(pluginId) {
  var layout = getLayout();
  for (var i = 0; i < layout.folders.length; i++) {
    if ((layout.folders[i].items || []).includes(pluginId)) return layout.folders[i].id;
  }
  return "root";
}

function setPluginFolder(pluginId, folderId) {
  var layout = getLayout();
  layout.rootItems = (layout.rootItems || []).filter(function(id) { return id !== pluginId; });
  layout.folders.forEach(function(f) { f.items = (f.items || []).filter(function(id) { return id !== pluginId; }); });
  if (folderId === "root") layout.rootItems.push(pluginId);
  else {
    var f = layout.folders.find(function(x) { return x.id === folderId; });
    if (f) {
      if (!Array.isArray(f.items)) f.items = [];
      f.items.push(pluginId);
    }
  }
}

function updateRuntimeNotice() {
  var el = document.getElementById("runtime-notice");
  var status = document.getElementById("patch-status");
  var runtime = state.runtime || {};
  if (el) el.textContent = "默认安全模式：插件不会自动修改 Hana；只有点击“安装增强补丁”才会备份并修改 app.asar。";
  if (!status) return;
  if (runtime.installed) {
    status.textContent = runtime.restartRequired ? "已安装增强补丁，重启 Hana 后生效。" : "增强补丁已安装。";
  } else if (runtime.backup) {
    status.textContent = runtime.restartRequired ? "已恢复备份，重启 Hana 后恢复原生逻辑。" : "增强补丁未安装，存在可用备份。";
  } else {
    status.textContent = "增强补丁未安装。";
  }
}

/* ── render ── */
function render() {
  var pages = state.pages || [];
  var widgets = state.widgets || [];
  var hiddenTabs = state.prefs.hiddenTabs || [];
  var hiddenWidgets = state.prefs.hiddenWidgets || [];

  var visiblePages = pages.filter(function(p) { return !hiddenTabs.includes(p.pluginId); });
  var visibleWidgets = widgets.filter(function(w) { return !hiddenWidgets.includes(w.pluginId); });

  document.getElementById("stat-pages").textContent = visiblePages.length + "/" + pages.length;
  document.getElementById("stat-widgets").textContent = visibleWidgets.length + "/" + widgets.length;

  renderFolders();
  renderList("pages-list", pages, hiddenTabs, "tab");
  renderList("widgets-list", widgets, hiddenWidgets, "widget");
  applySearch();
}

function renderFolders() {
  var layout = getLayout();
  var chips = ['<span class="folder-chip root">根目录 / 未分类</span>'];
  layout.folders.forEach(function(f) {
    chips.push('<span class="folder-chip" data-folder-id="' + escapeAttr(f.id) + '">'
      + '<span>📂</span>'
      + '<input class="folder-name-input" data-folder-id="' + escapeAttr(f.id) + '" value="' + escapeAttr(f.name) + '" title="改名后失焦保存">'
      + '<button class="folder-delete" data-folder-id="' + escapeAttr(f.id) + '" title="删除文件夹" type="button">×</button>'
      + '</span>');
  });
  document.getElementById("folder-chips").innerHTML = chips.join("");
}

function renderFolderSelect(pluginId) {
  var layout = getLayout();
  var current = folderOf(pluginId);
  var html = '<select class="folder-select" data-plugin-id="' + escapeAttr(pluginId) + '">';
  html += '<option value="root"' + (current === "root" ? " selected" : "") + '>根目录</option>';
  layout.folders.forEach(function(f) {
    html += '<option value="' + escapeAttr(f.id) + '"' + (current === f.id ? " selected" : "") + '>' + escapeText(f.name) + '</option>';
  });
  html += '</select>';
  return html;
}

function renderList(containerId, items, hiddenList, type) {
  var container = document.getElementById(containerId);
  if (!items.length) {
    container.innerHTML = '<div class="msg">暂无插件</div>';
    return;
  }

  container.innerHTML = items.map(function(item) {
    var isHidden = hiddenList.includes(item.pluginId);
    var title = getTitle(item);
    var desc = getDesc(item);
    var icon = getIconHtml(item);

    return '<div class="item' + (isHidden ? " is-hidden" : "") + '" '
      + 'data-plugin-id="' + escapeAttr(item.pluginId) + '" '
      + 'data-search="' + escapeAttr((title + " " + desc + " " + item.pluginId).toLowerCase()) + '">'
      + icon
      + '<div class="item-info">'
      + '<div class="item-name">' + escapeText(title) + "</div>"
      + '<div class="item-desc">' + escapeText(desc) + "</div>"
      + "</div>"
      + (type === "tab" ? renderFolderSelect(item.pluginId) : "")
      + '<span class="item-status">' + (type === "tab" ? (isHidden ? "下拉" : "顶栏") : (isHidden ? "隐藏" : "侧栏")) + '</span>'
      + '<label class="switch">'
      + '<input type="checkbox" ' + (isHidden ? "" : "checked")
      + ' data-plugin-id="' + escapeAttr(item.pluginId) + '"'
      + ' data-type="' + type + '">'
      + '<span class="slider"></span>'
      + "</label>"
      + "</div>";
  }).join("");
}

/* ── search ── */
function applySearch() {
  var query = (document.getElementById("search").value || "").trim().toLowerCase();
  var items = document.querySelectorAll(".item");
  items.forEach(function(el) {
    var text = el.dataset.search || "";
    el.style.display = !query || text.indexOf(query) >= 0 ? "" : "none";
  });
}

/* ── events (delegation) ── */
document.addEventListener("change", async function(e) {
  if (e.target.matches(".folder-select")) {
    var pid = e.target.dataset.pluginId;
    var folderId = e.target.value || "root";
    setPluginFolder(pid, folderId);
    var needTopbarRefresh = !state.prefs.hiddenTabs.includes(pid);
    if (needTopbarRefresh) state.prefs.hiddenTabs.push(pid);
    render();
    try {
      await saveLayout();
      if (needTopbarRefresh) await updatePrefs({ hiddenTabs: state.prefs.hiddenTabs });
      showToast("已移动到" + (folderId === "root" ? "根目录" : "文件夹"));
    } catch(err) { showToast("移动失败: " + err.message); }
    return;
  }
  if (!e.target.matches(".switch input[type=checkbox]")) return;
  var pluginId = e.target.dataset.pluginId;
  var type = e.target.dataset.type;
  var shouldShow = e.target.checked;
  if (type === "tab") toggleTab(pluginId, shouldShow);
  else toggleWidget(pluginId, shouldShow);
});

document.addEventListener("click", function(e) {
  var info = e.target.closest(".item-info");
  if (!info) return;
  var item = info.closest(".item");
  if (!item) return;
  visitPlugin(item.dataset.pluginId);
});

document.getElementById("search").addEventListener("input", applySearch);

async function callPatchApi(url, successMessage) {
  showToast("正在处理增强补丁，请稍候...");
  var res = await fetch(url, { method: "POST", credentials: "include" });
  var data = await res.json().catch(function() { return {}; });
  if (!res.ok || data.ok === false) throw new Error(data.error || ("HTTP " + res.status));
  state.runtime = data;
  updateRuntimeNotice();
  showToast(successMessage);
}

document.getElementById("patch-install").addEventListener("click", async function() {
  try { await callPatchApi(PATCH_INSTALL_URL, "增强补丁已安装，请重启 Hana"); }
  catch(e) { showToast("安装失败: " + e.message); }
});

document.getElementById("patch-uninstall").addEventListener("click", async function() {
  try { await callPatchApi(PATCH_UNINSTALL_URL, "增强补丁已卸载，请重启 Hana"); }
  catch(e) { showToast("卸载失败: " + e.message); }
});

document.getElementById("new-folder").addEventListener("click", async function() {
  var layout = getLayout();
  var n = layout.folders.length + 1;
  layout.folders.push({ id: "f_" + Date.now().toString(36), name: "新文件夹" + n, items: [] });
  render();
  try { await saveLayout(); showToast("已创建文件夹"); }
  catch(e) { showToast("创建失败: " + e.message); }
});

document.addEventListener("blur", async function(e) {
  if (!e.target.matches(".folder-name-input")) return;
  var folderId = e.target.dataset.folderId;
  var layout = getLayout();
  var folder = layout.folders.find(function(f) { return f.id === folderId; });
  if (!folder) return;
  var next = (e.target.value || "").trim() || "未命名";
  if (folder.name === next) return;
  folder.name = next;
  render();
  try { await saveLayout(); showToast("已重命名文件夹"); }
  catch(err) { showToast("保存失败: " + err.message); }
}, true);

document.addEventListener("keydown", function(e) {
  if (e.target.matches(".folder-name-input") && e.key === "Enter") e.target.blur();
});

document.addEventListener("click", async function(e) {
  var del = e.target.closest(".folder-delete[data-folder-id]");
  if (!del) return;
  e.stopPropagation();
  var folderId = del.dataset.folderId;
  var layout = getLayout();
  var folder = layout.folders.find(function(f) { return f.id === folderId; });
  if (!folder) return;
  layout.rootItems = (layout.rootItems || []).concat(folder.items || []);
  layout.folders = layout.folders.filter(function(f) { return f.id !== folderId; });
  render();
  try { await saveLayout(); showToast("已删除文件夹，内部插件已移到根目录"); }
  catch(err) { showToast("删除失败: " + err.message); }
});

document.getElementById("collect-all").addEventListener("click", async function() {
  var prev = state.prefs.hiddenTabs.slice();
  state.prefs.hiddenTabs = (state.pages || []).map(function(p) { return p.pluginId; });
  render();
  try {
    await updatePrefs({ hiddenTabs: state.prefs.hiddenTabs });
    notifyRenderer();
    showToast("已全部收进抽屉");
  } catch(e) {
    state.prefs.hiddenTabs = prev;
    render();
    showToast("操作失败: " + e.message);
  }
});

document.getElementById("restore-all").addEventListener("click", async function() {
  var prev = state.prefs.hiddenTabs.slice();
  state.prefs.hiddenTabs = [];
  render();
  try {
    await updatePrefs({ hiddenTabs: [] });
    notifyRenderer();
    showToast("已全部设为顶栏置顶");
  } catch(e) {
    state.prefs.hiddenTabs = prev;
    render();
    showToast("操作失败: " + e.message);
  }
});

/* ── init ── */
loadState();
</script>
</body>
</html>`;
}
