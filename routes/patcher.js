import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const PATCH_STATUS = "patch-status.json";
const PATCH_LOCK = "patch.lock";
const PATCH_MARKER = "plugin-hub:drawer-layout-v8";
const ASAR_VERSION = "3.4.1"; // 锁定已知稳定版本，防供应链攻击
const MAX_BACKUPS = 3;

/* ═══════════════════════════════════════════════════
   NEW_FT — 增强版下拉函数（注入到 ChannelTabBar）
   ═══════════════════════════════════════════════════ */
const NEW_FT = String.raw`function ft({tabs:n,currentTab:l,onSelect:s,onPin:a,onContextMenu:i}){const[g,m]=o.useState(!1),u=o.useRef(null),c=o.useRef(null),f=o.useRef(null),p=o.useRef(null),E=o.useRef(0),[h,b]=o.useState(null),D=o.useCallback(()=>{c.current&&(clearTimeout(c.current),c.current=null),m(!0)},[]),P=o.useCallback(()=>{c.current&&clearTimeout(c.current),c.current=setTimeout(()=>{m(!1),b(null)},450)},[]);if(n.length===0)return null;let q={folders:[],rootItems:[]};try{q=JSON.parse(localStorage.getItem("plugin-hub:drawer-layout")||"{}")||q}catch{}Array.isArray(q.folders)||(q.folders=[]),Array.isArray(q.rootItems)||(q.rootItems=[]);const y=n.some(r=>r.id===l),S=n.filter(r=>!r.hidden),B=n.filter(r=>r.hidden),J=new Set;for(const r of q.folders)for(const C of r.items||[])J.add(C),J.add(` + "`plugin:${C}`" + `);const ee=q.folders.map(r=>{const C=new Set((r.items||[]).flatMap(M=>[M,` + "`plugin:${M}`" + `])),h=B.filter(M=>C.has(M.id));return{...r,tabs:h}}).filter(r=>r.tabs.length>0),te=B.filter(r=>!J.has(r.id)),se={position:"absolute",left:"calc(100% + 4px)",top:"0",minWidth:"148px",maxWidth:"240px",background:"var(--panel, #fff)",border:"1px solid var(--line, #ddd)",borderRadius:"8px",boxShadow:"0 8px 24px rgba(0,0,0,.16)",padding:"4px",zIndex:10000},re={minWidth:"132px",maxWidth:"220px",width:"100%",display:"flex",alignItems:"center",justifyContent:"space-between",gap:"10px"},ie={display:"block",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"};return d.jsxs("div",{className:v.overflowWrap,onMouseEnter:D,onMouseLeave:P,children:[d.jsx("button",{type:"button",ref:u,className:` + "`${v.overflowBtn}${g||y?` ${v.overflowBtnActive}`:\"\"}`" + `,title:t("channel.moreTabs"),onClick:()=>{E.current=Date.now(),m(r=>!r)},children:d.jsx("svg",{width:"12",height:"12",viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:"2",strokeLinecap:"round",strokeLinejoin:"round",children:d.jsx("polyline",{points:"6 9 12 15 18 9"})})}),d.jsxs(oe,{open:g,anchorRef:u,className:v.dropdown,minWidth:132,onClose:()=>{m(!1),b(null)},onMouseEnter:D,onMouseLeave:P,role:"menu",children:[S.map(r=>d.jsx("button",{type:"button",style:re,className:` + "`${v.dropdownItem}${r.id===l?` ${v.dropdownItemActive}`:\"\"}`" + `,onClick:()=>{s(r.id),m(!1)},onContextMenu:C=>{i?.(C,r.id),m(!1)},children:d.jsx("span",{style:ie,children:r.label})},r.id)),(B.length>0&&S.length>0)&&d.jsx("div",{className:v.divider}),ee.map(r=>d.jsxs("div",{className:v.dropdownRow,style:{position:"relative"},onMouseEnter:()=>{c.current&&(clearTimeout(c.current),c.current=null),p.current&&(clearTimeout(p.current),p.current=null),f.current&&(clearTimeout(f.current),f.current=null);const x=r.id,N=Date.now()-E.current<250?250:120;f.current=setTimeout(()=>b(x),N)},onMouseLeave:()=>{f.current&&(clearTimeout(f.current),f.current=null),p.current&&(clearTimeout(p.current),p.current=null),p.current=setTimeout(()=>b(null),180)},children:[d.jsxs("button",{type:"button",style:{...re,fontWeight:500},className:` + "`${v.dropdownItem} ${v.dropdownItemHidden}`" + `,children:[d.jsx("span",{style:ie,children:` + "`📂 ${r.name}`" + `}),d.jsx("span",{children:"›"})]}),h===r.id&&d.jsx("div",{style:se,onMouseEnter:()=>{c.current&&(clearTimeout(c.current),c.current=null),f.current&&(clearTimeout(f.current),f.current=null),p.current&&(clearTimeout(p.current),p.current=null),m(!0),b(r.id)},onMouseLeave:()=>{p.current&&(clearTimeout(p.current),p.current=null),p.current=setTimeout(()=>b(null),180)},children:r.tabs.map(C=>d.jsx("button",{type:"button",style:re,className:` + "`${v.dropdownItem} ${v.dropdownItemHidden}`" + `,onClick:()=>{s(C.id),m(!1)},children:d.jsx("span",{style:ie,children:C.label})},C.id))})]},r.id)),te.map(r=>d.jsx("button",{type:"button",style:re,className:` + "`${v.dropdownItem} ${v.dropdownItemHidden}`" + `,onClick:()=>{s(r.id),m(!1)},onContextMenu:C=>{i?.(C,r.id),m(!1)},children:d.jsx("span",{style:ie,children:r.label})},r.id))]})]})}`;

/* ═══════════════════════════════════════════════════
   补丁匹配规则表 — 每个 replace 都有 label，不匹配立即中止
   ═══════════════════════════════════════════════════ */
const PATCH_STEPS = [
  {
    label: "drawer-message-listener",
    search: 'const U=9999;',
    replace: 'window.__pluginHubDrawerPatch="plugin-hub:drawer-layout-v8";window.addEventListener("message",e=>{try{e.data&&e.data.type==="plugin-hub:drawer-layout"&&localStorage.setItem("plugin-hub:drawer-layout",JSON.stringify(e.data.payload||{}))}catch{}});const U=9999;',
    type: "string",
  },
  {
    label: "oe-hover-params",
    search: 'function oe({open:n,anchorRef:l,children:s,className:a,align:i="end",offset:g=6,minWidth:m,viewportPadding:u=4,onClose:y,role:S})',
    replace: 'function oe({open:n,anchorRef:l,children:s,className:a,align:i="end",offset:g=6,minWidth:m,viewportPadding:u=4,onClose:y,role:S,onMouseEnter:V,onMouseLeave:K})',
    type: "string",
  },
  {
    label: "oe-portal-div",
    search: /d\.jsx\("div",\{ref:B,className:a,style:r,role:S,(?:onMouseEnter:[^,]+,onMouseLeave:[^,]+,)?children:s\}\)/,
    replace: 'd.jsx("div",{ref:B,className:a,style:{...r,width:"auto",minWidth:"132px",maxWidth:"220px"},role:S,onMouseEnter:V,onMouseLeave:K,children:s})',
    type: "regex",
  },
  {
    label: "auto-pin-removal",
    search: 'onSelect:e=>{S.some(h=>`plugin:${h.pluginId}`===e)&&z(e),O(e)},onPin:e=>z(e)',
    replace: 'onSelect:e=>{O(e)}',
    type: "string",
  },
];

/* ═══════════════════════════════════════════════════
   工具函数
   ═══════════════════════════════════════════════════ */

function statusPath(ctx) {
  if (!ctx?.dataDir) throw new Error("plugin dataDir unavailable");
  fs.mkdirSync(ctx.dataDir, { recursive: true });
  return path.join(ctx.dataDir, PATCH_STATUS);
}

function lockPath(ctx) {
  return path.join(ctx.dataDir || os.tmpdir(), PATCH_LOCK);
}

function acquireLock(ctx) {
  const lock = lockPath(ctx);
  const now = Date.now();
  if (fs.existsSync(lock)) {
    const mtime = fs.statSync(lock).mtimeMs;
    if (now - mtime > 300000) {
      // 超过 5 分钟的僵尸锁，覆盖
      fs.rmSync(lock, { force: true });
    } else {
      throw new Error("Another patch operation is in progress. Please wait.");
    }
  }
  fs.writeFileSync(lock, String(now), "utf8");
  return () => {
    try { fs.rmSync(lock, { force: true }); } catch {}
  };
}

function log(ctx, level, msg) {
  try { ctx?.log?.[level]?.(`[PluginHub] ${msg}`); } catch {}
}

export function readPatchStatus(ctx) {
  let saved = { installed: false };
  try {
    const file = statusPath(ctx);
    if (fs.existsSync(file)) {
      const raw = fs.readFileSync(file, "utf8") || "{}";
      saved = JSON.parse(raw);
    }
  } catch (err) {
    log(ctx, "warn", "Failed to read patch-status.json: " + err.message);
  }
  try {
    const appAsar = saved.appAsar || findAppAsar(ctx);
    const markerInAsar = fs.existsSync(appAsar) && fs.readFileSync(appAsar).includes(Buffer.from(PATCH_MARKER));
    // AND 逻辑：状态文件和 asar 内容必须双重一致
    const statusInstalled = saved.installed === true;
    const installed = markerInAsar && statusInstalled;
    // 检测不一致的情况
    const inconsistent = (markerInAsar && !statusInstalled) || (!markerInAsar && statusInstalled);
    return { ...saved, appAsar, installed, inconsistent };
  } catch (err) {
    log(ctx, "warn", "Failed to verify asar marker: " + err.message);
    return saved;
  }
}

function writePatchStatus(ctx, status) {
  const payload = { ...status, updatedAt: new Date().toISOString() };
  fs.writeFileSync(statusPath(ctx), JSON.stringify(payload, null, 2) + "\n", "utf8");
}

function findAppAsar(ctx) {
  const candidates = [];
  const checked = [];
  if (process.env.HANA_APP_ASAR) candidates.push(path.resolve(process.env.HANA_APP_ASAR));
  if (process.resourcesPath) candidates.push(path.join(process.resourcesPath, "app.asar"));
  if (process.execPath) {
    candidates.push(path.join(path.dirname(process.execPath), "resources", "app.asar"));
  }
  if (process.env.LOCALAPPDATA) candidates.push(path.join(process.env.LOCALAPPDATA, "Programs", "HanaAgent", "resources", "app.asar"));
  if (process.argv?.[0]) searchAppAsarInTree(process.argv[0], candidates, checked);
  if (process.cwd?.()) searchAppAsarInTree(process.cwd(), candidates, checked);
  if (ctx?.dataDir) searchAppAsarInTree(ctx.dataDir, candidates, checked);
  if (ctx?.pluginDir) searchAppAsarInTree(ctx.pluginDir, candidates, checked);
  try { searchAppAsarInTree(fileURLToPath(import.meta.url), candidates, checked); } catch {}
  const programRoots = [
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, "Programs"),
    process.env.ProgramFiles,
    process.env["ProgramFiles(x86)"],
    process.env.ProgramData && path.join(process.env.ProgramData, "Programs"),
  ].filter(Boolean);
  for (const root of programRoots) {
    let entries;
    try { entries = fs.readdirSync(root); } catch { continue; }
    for (const name of entries) {
      if (!/hana|hanako/i.test(name)) continue;
      candidates.push(path.join(root, name, "resources", "app.asar"));
    }
  }
  if (process.platform === "darwin") {
    for (const appsDir of ["/Applications", path.join(os.homedir(), "Applications")]) {
      let entries;
      try { entries = fs.readdirSync(appsDir); } catch { continue; }
      for (const name of entries) {
        if (!/hana|hanako/i.test(name)) continue;
        candidates.push(path.join(appsDir, name, "Contents", "Resources", "app.asar"));
      }
    }
  }
  if (process.platform === "win32") {
    const regScans = [
      "HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall",
      "HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall",
      "HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall",
    ];
    for (const rootKey of regScans) {
      try {
        const output = execSync(`reg query "${rootKey}" /s /f "Hana" /k 2>nul`, { encoding: "utf8", timeout: 5000, shell: "cmd.exe" });
        if (output) {
          const m = output.match(/InstallLocation\\s+REG_SZ\\s+(.+)/i);
          if (m) candidates.push(path.join(m[1].trim(), "resources", "app.asar"));
        }
      } catch {}
    }
    try {
      const output = execSync("where HanaAgent 2>nul & where Hanako 2>nul", { encoding: "utf8", timeout: 3000, shell: "cmd.exe" });
      if (output && output.trim()) {
        for (const line of output.split("\n").map(s => s.trim()).filter(Boolean)) {
          searchAppAsarInTree(path.dirname(line), candidates, checked, 3);
        }
      }
    } catch {}
    scanStartMenuShortcuts(candidates, checked);
  }
  if (process.platform === "linux") {
    for (const dir of ["/opt", "/usr/lib", "/usr/local/lib", "/usr/share"]) {
      let entries;
      try { entries = fs.readdirSync(dir); } catch { continue; }
      for (const name of entries) {
        if (!/hana|hanako/i.test(name)) continue;
        candidates.push(path.join(dir, name, "resources", "app.asar"));
        candidates.push(path.join(dir, name, "app.asar"));
      }
    }
  }
  for (const p of [...new Set(candidates)]) {
    if (p && fs.existsSync(p)) return p;
  }
  throw new Error("app.asar not found. Ensure Hana is installed correctly.");
}

function searchAppAsarInTree(startPath, candidates, checked, depth) {
  if (depth === void 0) depth = 6;
  if (!startPath) return;
  let dir = String(startPath);
  try { if (fs.existsSync(dir) && fs.statSync(dir).isFile()) dir = path.dirname(dir); } catch {}
  dir = path.resolve(dir);
  for (let i = 0; i < depth && dir && dir !== path.dirname(dir); i += 1) {
    const p1 = path.join(dir, "app.asar");
    const p2 = path.join(dir, "resources", "app.asar");
    for (const p of [p1, p2]) {
      if (!candidates.includes(p)) candidates.push(p);
    }
    dir = path.dirname(dir);
  }
}

function scanStartMenuShortcuts(candidates, checked) {
  if (process.platform !== "win32") return;
  const dirs = [
    path.join(process.env.APPDATA || "", "Microsoft", "Windows", "Start Menu", "Programs"),
    path.join(process.env.ProgramData || "C:\\ProgramData", "Microsoft", "Windows", "Start Menu", "Programs"),
  ];
  for (const dir of dirs) {
    walkShortcutDir(dir, candidates, checked);
  }
}

function walkShortcutDir(dir, candidates, checked) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (!/\.|node_modules/i.test(ent.name)) walkShortcutDir(full, candidates, checked);
    } else if (ent.name.endsWith(".lnk")) {
      resolveShortcut(full, candidates, checked);
    }
  }
}

function resolveShortcut(lnkPath, candidates, checked) {
  try {
    const safe = String(lnkPath).replace(/'/g, "''");
    const cmd = `powershell -NoProfile -Command "$ws=New-Object -ComObject WScript.Shell;$sc=$ws.CreateShortcut('${safe}');Write-Output $sc.TargetPath" 2>nul`;
    const output = execSync(cmd, { encoding: "utf8", timeout: 8000, shell: "cmd.exe" });
    const target = (output || "").trim();
    if (target) {
      const targetDir = path.dirname(target);
      searchAppAsarInTree(targetDir, candidates, checked, 4);
    }
  } catch {}
}

function runNpx(args, cwd) {
  // Windows 上 npx 是 .cmd，必须用 shell
  const safeArgs = args.map(a => String(a).replace(/"/g, '""'));
  const command = `npx --yes @electron/asar@${ASAR_VERSION} ${safeArgs.map(a => `"${a}"`).join(" ")}`;
  const shell = process.platform === "win32" ? (process.env.ComSpec || "cmd.exe") : "/bin/sh";
  try {
    execSync(command, { cwd: cwd || os.tmpdir(), stdio: "pipe", timeout: 120000, shell });
  } catch (err) {
    throw new Error(
      `asar ${args[0]} failed (exit code ${err.status}). ` +
      `The patcher uses @electron/asar@${ASAR_VERSION}. Ensure network access is available.`
    );
  }
}

function verifyAsar(packed) {
  try {
    const shell = process.platform === "win32" ? (process.env.ComSpec || "cmd.exe") : "/bin/sh";
    execSync(`npx --yes @electron/asar@${ASAR_VERSION} list "${String(packed).replace(/"/g, '""')}"`, { stdio: "pipe", timeout: 30000, shell });
    return true;
  } catch {
    return false;
  }
}

/* ═══════════════════════════════════════════════════
   补丁替换核心 — patchOrFail
   ═══════════════════════════════════════════════════ */

function applyPatch(content, search, replace, label) {
  const result = content.replace(search, replace);
  if (result === content) {
    throw new Error(
      `Patch "${label}" did not match any code. ` +
      `This version of Hana may have changed the target code. ` +
      `The enhancement patch cannot be applied.`
    );
  }
  return result;
}

function patchChannelBundle(file, ctx) {
  let js = fs.readFileSync(file, "utf8");

  // 检查是否已打过补丁
  if (js.includes(PATCH_MARKER)) {
    throw new Error("Enhancement patch already applied to this file.");
  }

  // 逐个执行补丁步骤
  for (const step of PATCH_STEPS) {
    js = applyPatch(js, step.search, step.replace, step.label);
  }

  // 替换 ft 函数体
  const ftStart = js.indexOf('function ft({tabs:n,currentTab:l,onSelect:s,onPin:a,onContextMenu:i})');
  const ftEnd = js.indexOf('const Y=5;', ftStart);
  if (ftStart < 0 || ftEnd < 0) {
    throw new Error(
      'ft() function structure not found. This version of Hana may have changed the ChannelTabBar code. ' +
      'The enhancement patch needs to be updated to match.'
    );
  }
  js = js.slice(0, ftStart) + NEW_FT + js.slice(ftEnd);

  // 记录补丁指纹
  const hash = crypto.createHash("sha256").update(js).digest("hex").slice(0, 16);
  const fingerprint = `window.__pluginHubDrawerFingerprint="${hash}";`;
  js = fingerprint + js;

  fs.writeFileSync(file, js, "utf8");
  log(ctx, "info", `ChannelTabBar patched successfully (fingerprint: ${hash})`);
}

function patchChannelCss(cssFile, ctx) {
  let css = fs.readFileSync(cssFile, "utf8");
  const variants = [
    'min-width:140px;max-width:200px;',
    'min-width:140px;max-width:220px;',
    'min-width:132px;max-width:200px;',
    'min-width:140px;max-width:240px;',
  ];
  const replace = 'min-width:auto;max-width:none;';

  if (css.includes(replace)) {
    log(ctx, "info", "CSS already patched, skipping");
    return;
  }

  let matched = false;
  for (const variant of variants) {
    if (css.includes(variant)) {
      css = css.split(variant).join(replace);
      matched = true;
      break;
    }
  }
  if (!matched) {
    // 正则 fallback：限定在 _dropdown class 内
    css = css.replace(/(_dropdown_[a-z0-9]+\{[^}]*?)min-width:\d+px;max-width:\d+px;/g, '$1' + replace);
  }
  fs.writeFileSync(cssFile, css, "utf8");
  log(ctx, "info", "ChannelTabBar CSS patched");
}

function cleanupOldBackups(appAsarDir) {
  try {
    const backups = fs.readdirSync(appAsarDir)
      .filter(n => n.startsWith("app.asar.bak-dh-"))
      .map(n => ({ name: n, time: fs.statSync(path.join(appAsarDir, n)).mtimeMs }))
      .sort((a, b) => b.time - a.time);
    for (const old of backups.slice(MAX_BACKUPS)) {
      fs.rmSync(path.join(appAsarDir, old.name), { force: true });
    }
  } catch {}
}

/* ── 环境诊断（供 AI 辅助使用）── */
function collectDiagnostics(ctx, error) {
  return {
    error: error?.message || String(error || ""),
    platform: process.platform,
    arch: process.arch,
    nodeVersion: process.version,
    electronVersion: process.versions?.electron,
    envHints: {
      HANA_APP_ASAR: process.env.HANA_APP_ASAR || "(unset)",
      LOCALAPPDATA: process.env.LOCALAPPDATA || "(unset)",
      ProgramFiles: process.env.ProgramFiles || "(unset)",
      resourcesPath: process.resourcesPath || "(unset)",
      execPath: process.execPath || "(unset)",
    },
    ctxDataDir: ctx?.dataDir || "(unavailable)",
    ctxPluginDir: ctx?.pluginDir || "(unavailable)",
    timestamp: new Date().toISOString(),
  };
}

function collectCandidatePaths(ctx) {
  const candidates = [];
  const checked = [];
  if (process.env.HANA_APP_ASAR) checked.push(path.resolve(process.env.HANA_APP_ASAR));
  if (process.resourcesPath) checked.push(path.join(process.resourcesPath, "app.asar"));
  if (process.execPath) searchAppAsarInTree(process.execPath, candidates, checked);
  if (process.argv?.[0]) searchAppAsarInTree(process.argv[0], candidates, checked);
  if (process.cwd?.()) searchAppAsarInTree(process.cwd(), candidates, checked);
  if (ctx?.dataDir) searchAppAsarInTree(ctx.dataDir, candidates, checked);
  if (ctx?.pluginDir) searchAppAsarInTree(ctx.pluginDir, candidates, checked);
  try { searchAppAsarInTree(fileURLToPath(import.meta.url), candidates, checked); } catch {}
  const programRoots = [
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, "Programs"),
    process.env.ProgramFiles,
    process.env["ProgramFiles(x86)"],
    process.env.ProgramData && path.join(process.env.ProgramData, "Programs"),
  ].filter(Boolean);
  for (const root of programRoots) {
    let entries;
    try { entries = fs.readdirSync(root); } catch { continue; }
    for (const name of entries) {
      if (/hana|hanako/i.test(name)) checked.push(path.join(root, name, "resources", "app.asar"));
    }
  }
  if (process.platform === "win32") scanStartMenuShortcuts(candidates, checked);
  return checked.slice(0, 50);
}

export function getDiagnostics(ctx) {
  const diag = collectDiagnostics(ctx, null);
  try {
    const appAsar = findAppAsar(ctx);
    diag.appAsarFound = true;
    diag.appAsarPath = appAsar;
  } catch (e) {
    diag.appAsarFound = false;
    diag.findError = e.message;
  }
  diag.checkedPaths = collectCandidatePaths(ctx);
  return diag;
}

/* ═══════════════════════════════════════════════════
   公开 API
   ═══════════════════════════════════════════════════ */

export function installEnhancementPatch(ctx) {
  const release = acquireLock(ctx);
  const work = path.join(ctx.dataDir, "patch-work");

  try {
    const appAsar = findAppAsar(ctx);
    const current = fs.readFileSync(appAsar);

    // 已安装检测
    if (current.includes(Buffer.from(PATCH_MARKER))) {
      writePatchStatus(ctx, { installed: true, appAsar, restartRequired: false, note: "already patched" });
      return { ok: true, installed: true, alreadyPatched: true, appAsar };
    }

    // 创建备份（短文件名，防长路径）
    const backup = `${appAsar}.bak-dh-${Date.now()}`;
    fs.copyFileSync(appAsar, backup);
    cleanupOldBackups(path.dirname(appAsar));
    log(ctx, "info", `Backup created: ${backup}`);

    // 解压 asar
    fs.rmSync(work, { recursive: true, force: true });
    fs.mkdirSync(work, { recursive: true });
    runNpx(["extract", appAsar, work], ctx.dataDir);

    // 动态查找 ChannelTabBar 文件
    const assetsDir = path.join(work, "desktop", "dist-renderer", "assets");
    const channelJs = fs.readdirSync(assetsDir)
      .filter(name => name.startsWith("ChannelTabBar-") && name.endsWith(".js"))
      .sort((a, b) => fs.statSync(path.join(assetsDir, b)).size - fs.statSync(path.join(assetsDir, a)).size);
    if (channelJs.length === 0) {
      const allFiles = fs.readdirSync(assetsDir).slice(0, 30).join(", ");
      throw new Error(`ChannelTabBar JS not found. Available: ${allFiles}`);
    }
    const channelFile = path.join(assetsDir, channelJs[0]);
    patchChannelBundle(channelFile, ctx);

    // CSS 补丁
    const channelCss = fs.readdirSync(assetsDir)
      .filter(name => name.startsWith("ChannelTabBar-") && name.endsWith(".css"))
      .sort((a, b) => fs.statSync(path.join(assetsDir, b)).size - fs.statSync(path.join(assetsDir, a)).size);
    if (channelCss.length > 0) {
      patchChannelCss(path.join(assetsDir, channelCss[0]), ctx);
    }

    // 重新打包
    const packed = path.join(ctx.dataDir, "app.asar.plugin-hub-patched");
    fs.rmSync(packed, { force: true });
    runNpx(["pack", work, packed], ctx.dataDir);

    // 完整性校验
    if (!verifyAsar(packed)) {
      throw new Error(
        "Patched asar failed integrity check. The patch was not applied. " +
        "Your original app.asar is untouched."
      );
    }

    // 写入目标（直接 copy，original 已有 backup）
    fs.copyFileSync(packed, appAsar);
    writePatchStatus(ctx, { installed: true, appAsar, backup, restartRequired: true });
    log(ctx, "info", "Enhancement patch installed successfully");

    return { ok: true, installed: true, appAsar, backup, restartRequired: true };

  } catch (err) {
    // 明确记录失败状态
    writePatchStatus(ctx, {
      installed: false,
      error: err.message,
      failedAt: new Date().toISOString(),
    });
    log(ctx, "error", "Patch installation failed: " + err.message);
    throw err;

  } finally {
    // 清理工作目录
    try { fs.rmSync(work, { recursive: true, force: true }); } catch {}
    release();
  }
}

export function uninstallEnhancementPatch(ctx) {
  const release = acquireLock(ctx);

  try {
    const status = readPatchStatus(ctx);
    const appAsar = status.appAsar || findAppAsar(ctx);
    let backup = (status.backup && fs.existsSync(status.backup)) ? status.backup : null;

    // 回退查找备份
    if (!backup) {
      const dir = path.dirname(appAsar);
      const candidates = fs.readdirSync(dir)
        .filter((name) => name.startsWith("app.asar.bak-dh-"))
        .map((name) => path.join(dir, name))
        .filter((file) => fs.existsSync(file))
        .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
      if (candidates.length === 0) {
        throw new Error(
          "No backup found. The enhancement patch backup may have been removed. " +
          "You may need to reinstall Hana to restore the original app.asar."
        );
      }
      backup = candidates[0];
    }

    if (!fs.existsSync(backup)) {
      throw new Error("Backup file no longer exists. Please reinstall Hana to restore.");
    }

    fs.copyFileSync(backup, appAsar);
    writePatchStatus(ctx, {
      installed: false,
      restoredAt: new Date().toISOString(),
      note: "Original app.asar restored from backup. Restart Hana to take effect.",
    });
    log(ctx, "info", "Enhancement patch uninstalled, original restored");

    return { ok: true, installed: false, appAsar, backup, restartRequired: true };

  } catch (err) {
    log(ctx, "error", "Patch uninstall failed: " + err.message);
    throw err;

  } finally {
    release();
  }
}
