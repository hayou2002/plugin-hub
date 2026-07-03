import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { installEnhancementPatch, uninstallEnhancementPatch, readPatchStatus, getDiagnostics } from "./patcher.js";

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
  /* -- AI helper install with auto-repair -- */
  app.post("/api/patch/ai-install", async (c) => {
    const diag = getDiagnostics(ctx);
    let installResult = null;
    let installError = "";
    let repairAttempts = [];

    const status = readPatchStatus(ctx);
    if (status.inconsistent) {
      repairAttempts.push("\u68c0\u6d4b\u5230\u72b6\u6001\u4e0d\u4e00\u81f4\uff0c\u5c1d\u8bd5\u5148\u5378\u8f7d\u518d\u91cd\u88c5...");
      try {
        uninstallEnhancementPatch(ctx);
        _runtimeCache = null;
        repairAttempts.push("\u5378\u8f7d\u6210\u529f\uff0c\u7ee7\u7eed\u5b89\u88c5...");
      } catch (e) {
        repairAttempts.push("\u5378\u8f7d\u5931\u8d25: " + e.message);
      }
    }

    try {
      installResult = installEnhancementPatch(ctx);
      _runtimeCache = null;
    } catch (e) {
      installError = e.message || String(e);
    }

    if (!installResult || !installResult.ok) {
      if (installError.includes("EBUSY") || installError.includes("EPERM") || installError.includes("access")) {
        repairAttempts.push("\u68c0\u6d4b\u5230\u6587\u4ef6\u88ab\u5360\u7528\uff0c\u53ef\u80fd Hana \u6b63\u5728\u8fd0\u884c\u3002\u8bf7\u5173\u95ed Hana \u540e\u91cd\u8bd5\u3002");
      } else if (installError.includes("npx") || installError.includes("npm") || installError.includes("ENOTFOUND")) {
        repairAttempts.push("\u68c0\u6d4b\u5230\u7f51\u7edc\u95ee\u9898\uff0c\u65e0\u6cd5\u4e0b\u8f7d @electron/asar\u3002\u8bf7\u68c0\u67e5\u7f51\u7edc\u8fde\u63a5\u540e\u91cd\u8bd5\u3002");
      } else if (installError.includes("app.asar not found")) {
        repairAttempts.push("\u68c0\u6d4b\u5230 app.asar \u6587\u4ef6\u4e0d\u5b58\u5728\uff0c\u8bf7\u68c0\u67e5 Hana \u5b89\u88c5\u662f\u5426\u5b8c\u6574\u3002");
      } else if ("\u517c\u5bb9" in installError || "match" in installError) {
        repairAttempts.push("\u68c0\u6d4b\u5230\u8865\u4e01\u4e0e\u5f53\u524d Hana \u7248\u672c\u4e0d\u517c\u5bb9\u3002\u8bf7\u68c0\u67e5 plugin-hub \u662f\u5426\u6709\u65b0\u7248\u672c\u3002");
      }
    }

    const envLines = [
      "Platform: " + (diag.platform || "?") + " " + (diag.arch || ""),
      "Node: " + (diag.nodeVersion || "?"),
      "Electron: " + (diag.electronVersion || "?"),
      "Asar: " + (diag.appAsarFound ? "Found " + diag.appAsarPath : "Not found"),
    ];
    if (diag.findError) envLines.push("Find error: " + diag.findError);
    if (diag.ctxDataDir) envLines.push("DataDir: " + diag.ctxDataDir);
    const envSummary = envLines.join("\n");

    if (installResult && installResult.ok) {
      return c.json({
        ok: true,
        installed: true,
        installResult,
        envSummary,
        repairAttempts,
        aiAnalysis: repairAttempts.length > 0
          ? "\u81ea\u52a8\u4fee\u590d\u540e\u5b89\u88c5\u6210\u529f\uff0c\u91cd\u542f Hana \u540e\u751f\u6548\u3002"
          : "\u5b89\u88c5\u6210\u529f\uff0c\u91cd\u542f Hana \u540e\u751f\u6548\u3002",
      });
    }

    let aiAnalysis = "";
    try {
      const prompt = "\u6211\u662f Hana \u63d2\u4ef6\u62bd\u5c49\uff08plugin-hub\uff09\u7684\u589e\u5f3a\u8865\u4e01\u5b89\u88c5\u52a9\u624b\u3002\u7528\u6237\u5c1d\u8bd5\u5b89\u88c5\u8865\u4e01\u65f6\u9047\u5230\u95ee\u9898\u3002\n\n\u3010\u73af\u5883\u4fe1\u606f\u3011\n" + envSummary + "\n\n\u3010\u5b89\u88c5\u7ed3\u679c\u3011\n\u5b89\u88c5\u5931\u8d25: " + installError + "\n\n\u3010\u81ea\u52a8\u4fee\u590d\u5c1d\u8bd5\u3011\n" + (repairAttempts.length > 0 ? repairAttempts.join("\n") : "\u65e0") + "\n\n\u8bf7\u5206\u6790\u53ef\u80fd\u7684\u539f\u56e0\uff0c\u5e76\u7ed9\u51fa\u5177\u4f53\u7684\u4fee\u590d\u6b65\u9aa4\u3002\u7528\u4e2d\u6587\u56de\u7b54\uff0c\u7b80\u6d01\u660e\u4e86\u3002";

      aiAnalysis = await ctx.sampleText({
        prompt,
        maxTokens: 800,
      });
    } catch (e) {
      aiAnalysis = "AI \u5206\u6790\u5931\u8d25: " + e.message;
    }

    return c.json({
      ok: false,
      installed: false,
      installError,
      envSummary,
      repairAttempts,
      aiAnalysis,
    });
  });


  /* ── 环境诊断 ── */
  app.get("/api/patch/diagnostics", (c) => {
    try { return c.json(getDiagnostics(ctx)); }
    catch (e) { return c.json({ error: e.message }, 500); }
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
