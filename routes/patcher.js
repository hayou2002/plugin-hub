import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { execSync } from "node:child_process";

const PATCH_STATUS = "patch-status.json";
const PATCH_LOCK = "patch.lock";
const PATCH_MARKER = "ph-tgl";
const ASAR_VERSION = "3.4.1";
const MAX_BACKUPS = 3;

// Injected into ChannelTabBar component at runtime
const BRIDGE_SCRIPT = `(function(){try{window.__ph_tgl="ph-tgl";var STYLE=document.createElement("style");STYLE.textContent="#ph-drawer{position:fixed;z-index:99999;display:none}#ph-drawer.open{display:block;inset:0}#ph-drawer .ph-bg{position:absolute;inset:0}#ph-drawer .ph-panel{position:absolute;top:48px;right:12px;min-width:170px;max-width:250px;background:var(--bg-card,#fff);border:1px solid var(--overlay-medium,#ddd);border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.18);padding:4px;max-height:75vh;overflow-y:auto}#ph-drawer .ph-fd{position:relative}#ph-drawer .ph-fb{display:flex;align-items:center;justify-content:space-between;padding:6px 10px;border:none;border-radius:4px;background:none;color:var(--text,#333);font-size:12px;cursor:pointer;width:100%;text-align:left;font-weight:500}#ph-drawer .ph-fb:hover{background:var(--overlay-light,#eee)}#ph-drawer .ph-sm{display:none;position:absolute;left:calc(100% + 4px);top:0;min-width:140px;background:var(--bg-card,#fff);border:1px solid var(--overlay-medium,#ddd);border-radius:6px;box-shadow:0 4px 16px rgba(0,0,0,.12);padding:4px;z-index:10}#ph-drawer .ph-fd:hover>.ph-sm{display:block}#ph-drawer .ph-tb{display:block;width:100%;padding:6px 10px;border:none;border-radius:4px;background:none;color:var(--text-light,#555);font-size:12px;cursor:pointer;text-align:left;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}#ph-drawer .ph-tb:hover{background:var(--overlay-light,#eee);color:var(--text,#111)}#ph-drawer .ph-sep{height:1px;background:var(--overlay-light,#eee);margin:4px 6px}#ph-drawer .ph-empty{color:var(--text-muted,#999);font-size:12px;padding:8px 10px;text-align:center}";document.head.appendChild(STYLE);var _drawer=null;function getState(){try{return JSON.parse(localStorage.getItem("plugin-hub:state-cache")||"{}")}catch(e){return{}}}function getLayout(){try{return JSON.parse(localStorage.getItem("plugin-hub:drawer-layout")||"{\"folders\":[],\"rootItems\":[]}")}catch(e){return{folders:[],rootItems:[]}}}function esc(s){return String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}function getTitle(p){if(typeof p.title==="string")return p.title;if(p.title&&typeof p.title==="object")return p.title.zh||p.title.en||p.pluginId||"";return p.pluginId||""}function buildHTML(){var st=getState(),layout=getLayout(),pages=st.pages||[],hidden=st.prefs&&st.prefs.hiddenTabs||[];var tabs=[];for(var i=0;i<pages.length;i++){if(hidden.indexOf(pages[i].pluginId)>=0)tabs.push({id:"plugin:"+pages[i].pluginId,label:getTitle(pages[i]),pid:pages[i].pluginId})}var folders=[],ungrouped=[],inF={};if(layout.folders)for(var a=0;a<layout.folders.length;a++){var f=layout.folders[a],ft=[];if(f.items)for(var b=0;b<f.items.length;b++){for(var c=0;c<tabs.length;c++){if(tabs[c].pid===f.items[b]||tabs[c].id==="plugin:"+f.items[b]){ft.push(tabs[c]);break}}}if(ft.length>0)folders.push({id:f.id,name:f.name,tabs:ft})}for(var d=0;d<folders.length;d++)for(var e=0;e<folders[d].tabs.length;e++)inF[folders[d].tabs[e].id]=true;for(var g=0;g<tabs.length;g++)if(!inF[tabs[g].id])ungrouped.push(tabs[g]);var h="";for(var j=0;j<folders.length;j++){var ff=folders[j];h+='<div class="ph-fd"><div class="ph-fb">\ud83d\udcc1 '+esc(ff.name)+" \u203a</div><div class=\"ph-sm\">";for(var k=0;k<ff.tabs.length;k++)h+='<button class="ph-tb" data-id="'+ff.tabs[k].id+'">'+esc(ff.tabs[k].label)+"</button>";h+="</div></div>"}if(folders.length>0&&ungrouped.length>0)h+='<div class="ph-sep"></div>';for(var l=0;l<ungrouped.length;l++)h+='<button class="ph-tb" data-id="'+ungrouped[l].id+'">'+esc(ungrouped[l].label)+"</button>";if(tabs.length===0)h='<div class="ph-empty">No hidden tabs</div>';return h}function ensureDrawer(){if(_drawer)return;_drawer=document.createElement("div");_drawer.id="ph-drawer";_drawer.innerHTML='<div class="ph-bg"></div><div class="ph-panel"><div class="ph-list"></div></div>';document.body.appendChild(_drawer);_drawer.querySelector(".ph-bg").addEventListener("click",function(){_drawer.classList.remove("open");var pid=tabId.replace("plugin:","");var t=document.querySelector('[data-tab="'+tabId+'"]');if(t){t.click()}else{var ov=document.querySelector("[class*=overflowBtn]");if(ov){ov.click();setTimeout(function(){var t2=document.querySelector('[data-tab="'+tabId+'"]');if(t2)t2.click()},150)}};setTimeout(function(){var st=JSON.parse(localStorage.getItem("plugin-hub:state-cache")||"{}");var ht=st.prefs&&st.prefs.hiddenTabs||[];if(ht.indexOf(pid)<0)ht.push(pid);fetch("/api/plugins/plugin-hub/api/prefs",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({hiddenTabs:ht})}).then(function(){try{var cache=JSON.parse(localStorage.getItem("plugin-hub:state-cache")||"{}");if(!cache.prefs)cache.prefs={};cache.prefs.hiddenTabs=ht;localStorage.setItem("plugin-hub:state-cache",JSON.stringify(cache))}catch(e){}})},300)})}function toggleDrawer(){ensureDrawer();if(_drawer.classList.contains("open")){_drawer.classList.remove("open");return}_drawer.querySelector(".ph-list").innerHTML=buildHTML();_drawer.classList.add("open")}function hookButtons(){var btns=document.querySelectorAll("button");for(var i=0;i<btns.length;i++){var b=btns[i];if(b.__ph)continue;if(!b.querySelector('polyline[points="6 9 12 15 18 9"]'))continue;b.__ph=1;b.addEventListener("mouseenter",function(){clearTimeout(b._phT);b._phT=setTimeout(toggleDrawer,120)},false);b.addEventListener("mouseleave",function(){clearTimeout(b._phT);b._phT=setTimeout(function(){if(_drawer&&!_drawer._phHover)_drawer.classList.remove("open")},300)},false);b.addEventListener("click",function(e){e.stopPropagation();e.stopImmediatePropagation();toggleDrawer()},true)}}function boot(){hookButtons();new MutationObserver(hookButtons).observe(document.body,{childList:true,subtree:true})}if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot);else boot()}catch(err){console.error("[plugin-hub] bridge error:",err)}})()`;

// ---- Path Helpers ----

function statusPath(ctx) {
  if (!ctx?.dataDir) throw new Error("plugin dataDir unavailable");
  fs.mkdirSync(ctx.dataDir, { recursive: true });
  return path.join(ctx.dataDir, PATCH_STATUS);
}

function lockPath(ctx) {
  return path.join(ctx.dataDir, PATCH_LOCK);
}

// ---- Lock ----

function acquireLock(ctx) {
  const lp = lockPath(ctx);
  if (fs.existsSync(lp)) {
    throw new Error("Another patch operation is already in progress.");
  }
  fs.writeFileSync(lp, String(process.pid), "utf-8");
  return () => {
    try { fs.rmSync(lp, { force: true }); } catch {}
  };
}

// ---- Logging ----

function log(ctx, level, msg) {
  const ts = new Date().toISOString();
  console.log(`[patcher][${ts}][${level}] ${msg}`);
}

// ---- Patch Status Persistence ----

function writePatchStatus(ctx, data) {
  const sp = statusPath(ctx);
  fs.mkdirSync(path.dirname(sp), { recursive: true });
  const payload = { installed: true, ...data, installedAt: new Date().toISOString() };
  fs.writeFileSync(sp, JSON.stringify(payload, null, 2), "utf-8");
}

export function readPatchStatus(ctx) {
  let saved = { installed: false, arch: null };
  try {
    const sp = statusPath(ctx);
    if (fs.existsSync(sp)) saved = JSON.parse(fs.readFileSync(sp, "utf-8") || "{}");
  } catch (err) { log(ctx, "warn", "read status: " + err.message); }
  try {
    let arch = null;
    try {
      const tgz = findRendererTarGz();
      if (tgz && fs.existsSync(tgz)) arch = "tgz";
      else {
        const asar = findAppAsar();
        if (asar && fs.existsSync(asar)) arch = "asar";
      }
    } catch (e) { log(ctx, "warn", "detect arch: " + e.message); }
    return { ...saved, arch, installed: saved.installed === true, inconsistent: false };
  } catch (err) { log(ctx, "warn", "readPatchStatus: " + err.message); return saved; }
}

// ---- Architecture Detection ----

function findResourcesDir() {
  // 1. Electron runtime
  if (process.resourcesPath && fs.existsSync(process.resourcesPath)) return process.resourcesPath;
  // 2. cwd + resources (Hana plugin runtime cwd is often the app root)
  const cwdRes = path.join(process.cwd(), "resources");
  if (fs.existsSync(cwdRes)) return cwdRes;
  // 3. Windows standard paths
  const lad = process.env.LOCALAPPDATA || "";
  if (lad) {
    const candidates = [
      path.join(lad, "Programs", "HanaAgent", "resources"),
      path.join(lad, "HanaAgent", "resources"),
      path.join(lad, "Programs", "hanako", "resources"),
    ];
    for (const c of candidates) { if (fs.existsSync(c)) return c; }
  }
  // 4. macOS
  const macRes = "/Applications/HanaAgent.app/Contents/Resources";
  if (fs.existsSync(macRes)) return macRes;
  // 5. Traverse up from cwd
  let dir = process.cwd();
  for (let i = 0; i < 8; i++) {
    dir = path.dirname(dir);
    const res = path.join(dir, "resources");
    if (fs.existsSync(res)) return res;
  }
  return null;
}

function findRendererTarGz() {
  const resDir = findResourcesDir();
  if (!resDir) return null;
  // Check seed/ subdirectory first (Hana v0.407+ architecture)
  const seedDir = path.join(resDir, "seed");
  if (fs.existsSync(seedDir)) {
    try {
      const files = fs.readdirSync(seedDir).filter(f => f.startsWith("renderer-") && f.endsWith(".tar.gz")).sort((a, b) => b.localeCompare(a));
      if (files.length > 0) return path.join(seedDir, files[0]);
    } catch {}
  }
  // Fallback: check resources/ directly
  try {
    const files = fs.readdirSync(resDir).filter(f => f.startsWith("renderer") && f.endsWith(".tar.gz"));
    if (files.length > 0) return path.join(resDir, files[0]);
  } catch {}
  return null;
}

function findAppAsar() {
  const resDir = findResourcesDir();
  if (!resDir) return null;
  // Windows: resources/app.asar
  // macOS: HanaAgent.app/Contents/Resources/app.asar
  // Linux: resources/app.asar
  const asarPath = path.join(resDir, "app.asar");
  if (fs.existsSync(asarPath)) return asarPath;
  // macOS bundle fallback
  const macPath = path.join(resDir, "..", "Resources", "app.asar");
  return fs.existsSync(macPath) ? macPath : null;
}

function detectArchitecture(ctx) {
  const rendererTgz = findRendererTarGz();
  if (rendererTgz && fs.existsSync(rendererTgz)) {
    ctx.rendererTgz = rendererTgz;
    ctx.arch = "tgz";
    log(ctx, "info", "Detected tgz architecture (renderer.tar.gz).");
    return "tgz";
  }
  const appAsar = findAppAsar();
  if (appAsar && fs.existsSync(appAsar)) {
    ctx.appAsar = appAsar;
    ctx.arch = "asar";
    log(ctx, "info", "Detected asar architecture (app.asar).");
    return "asar";
  }
  throw new Error("No supported architecture: neither renderer.tar.gz nor app.asar found.");
}

// ---- Tar Operations ----

function hasTarCommand() {
  try {
    execSync("tar --version", { stdio: "ignore", timeout: 3000 });
    return true;
  } catch {
    return false;
  }
}

function execTar(args, cwd) {
  const sh = process.platform === "win32" ? (process.env.ComSpec || "cmd.exe") : "/bin/sh";
  const cmdArgs = Array.isArray(args) ? args.map(a => a.includes(" ") ? `"${a}"` : a).join(" ") : args;
  return execSync(`tar ${cmdArgs}`, { cwd: cwd || os.tmpdir(), stdio: "pipe", timeout: 180000, shell: sh });
}

function extractTarGz(src, dest) {
  execTar(`-xzf "${src}" -C "${dest}"`, process.cwd());
}

function repackTarGz(srcDir, dest) {
  execTar(`-czf "${dest}" -C "${srcDir}" .`, process.cwd());
}

function verifyTarGz(file) {
  try {
    execTar(`-tzf "${file}"`, process.cwd());
    return true;
  } catch {
    return false;
  }
}

// ---- Asar Operations ----

function runNpx(pkg, args) {
  return execSync(`npx ${pkg} ${args}`, { stdio: "pipe", timeout: 120000 });
}

function verifyAsar(asarPath) {
  try {
    runNpx("@electron/asar", `list "${asarPath}"`);
    return true;
  } catch {
    return false;
  }
}

// ---- File Helpers ----

function findChannelFiles(dir, ext) {
  let files;
  try { files = fs.readdirSync(dir); } catch { return []; }
  return files
    .filter(f => f.startsWith("ChannelTabBar-") && f.endsWith(ext))
    .sort((a, b) => {
      try { return fs.statSync(path.join(dir, b)).mtimeMs - fs.statSync(path.join(dir, a)).mtimeMs; }
      catch { return 0; }
    });
}

function findBackup(dir, prefix) {
  if (!dir || !fs.existsSync(dir)) return null;
  let files;
  try { files = fs.readdirSync(dir); } catch { return null; }
  const matched = files.filter(f => f.startsWith(prefix)).sort().reverse();
  return matched.length > 0 ? path.join(dir, matched[0]) : null;
}

function cleanupOldBackups(dir, prefix, ctx) {
  if (!dir || !fs.existsSync(dir)) return;
  let files;
  try { files = fs.readdirSync(dir); } catch { return; }
  const matched = files.filter(f => f.startsWith(prefix)).sort();
  while (matched.length > MAX_BACKUPS) {
    const oldFile = matched.shift();
    try {
      fs.rmSync(path.join(dir, oldFile), { force: true });
      log(ctx, "info", `Removed old backup: ${oldFile}`);
    } catch {}
  }
}

// ---- Patch Functions ----

export function patchChannelBundle(file, ctx) {
  let content = fs.readFileSync(file, "utf-8");
  if (content.includes(PATCH_MARKER)) {
    log(ctx, "info", `Already patched: ${path.basename(file)}`);
    return { patched: false, alreadyPatched: true };
  }
  const target = "const U=9999;";
  const idx = content.indexOf(target);
  if (idx === -1) {
    log(ctx, "warn", `Target '${target}' not found in ${path.basename(file)}. Appending as fallback.`);
    const lastBrace = content.lastIndexOf("}");
    if (lastBrace === -1) throw new Error("Cannot locate insertion point in bundle.");
    const hash = crypto.createHash("md5").update(BRIDGE_SCRIPT).digest("hex").slice(0, 8);
    const injected = `\n/* ${PATCH_MARKER}:${hash} */\n${BRIDGE_SCRIPT}\n`;
    content = content.slice(0, lastBrace) + injected + content.slice(lastBrace);
  } else {
    const hash = crypto.createHash("md5").update(BRIDGE_SCRIPT).digest("hex").slice(0, 8);
    const injected = `${target}\n\n/* ${PATCH_MARKER}:${hash} */\n${BRIDGE_SCRIPT}\n`;
    content = content.replace(target, injected);
  }
  fs.writeFileSync(file, content, "utf-8");
  log(ctx, "info", `Patched: ${path.basename(file)}`);
  return { patched: true };
}

export function patchChannelCss(file, ctx) {
  const target = "min-width:140px;max-width:200px;";
  const replacement = "min-width:auto;max-width:none;";
  let content = fs.readFileSync(file, "utf-8");
  if (!content.includes(target)) {
    log(ctx, "info", `CSS target not found (already patched?): ${path.basename(file)}`);
    return { patched: false, alreadyPatched: true };
  }
  content = content.replaceAll(target, replacement);
  fs.writeFileSync(file, content, "utf-8");
  log(ctx, "info", `CSS patched: ${path.basename(file)}`);
  return { patched: true };
}

// ---- Flow: Asar Patch ----

function patchAsarFlow(ctx, workDir) {
  const appAsar = ctx.appAsar || findAppAsar();
  if (!appAsar) throw new Error("app.asar not found.");
  const resDir = path.dirname(appAsar);

  // Quick pre-check via asar list
  const checkDir = path.join(workDir, "_check");
  fs.mkdirSync(checkDir, { recursive: true });
  try {
    const listing = runNpx("@electron/asar", `list "${appAsar}"`).toString();
    if (listing.includes(PATCH_MARKER)) {
      fs.rmSync(workDir, { recursive: true, force: true });
      log(ctx, "info", "Asar already contains patch marker. Skipping.");
      return { ok: true, installed: true, alreadyPatched: true, appAsar };
    }
  } finally {
    fs.rmSync(checkDir, { recursive: true, force: true });
  }

  // Backup
  const backup = path.join(resDir, `app.bak-dh-${Date.now()}.asar`);
  fs.copyFileSync(appAsar, backup);
  log(ctx, "info", `Backup: ${backup}`);
  cleanupOldBackups(resDir, "app.bak-dh-", ctx);

  // Extract asar
  const extractDir = path.join(workDir, "extracted");
  fs.rmSync(workDir, { recursive: true, force: true });
  fs.mkdirSync(extractDir, { recursive: true });
  runNpx("@electron/asar", `extract "${appAsar}" "${extractDir}"`);

  // Locate channel bundle
  const assetsDir = path.join(extractDir, "dist", "assets");
  if (!fs.existsSync(assetsDir)) throw new Error("dist/assets not found inside app.asar.");

  const channelJs = findChannelFiles(assetsDir, ".js");
  if (channelJs.length === 0) throw new Error("No channel bundle JS found in dist/assets.");
  patchChannelBundle(path.join(assetsDir, channelJs[0]), ctx);

  const channelCss = findChannelFiles(assetsDir, ".css");
  if (channelCss.length > 0) {
    patchChannelCss(path.join(assetsDir, channelCss[0]), ctx);
  }

  // Repack
  const repacked = path.join(workDir, "app.asar");
  fs.rmSync(repacked, { force: true });
  runNpx("@electron/asar", `pack "${extractDir}" "${repacked}"`);

  if (!verifyAsar(repacked)) throw new Error("Repacked asar verification failed.");

  // Replace original
  fs.rmSync(appAsar, { force: true });
  fs.copyFileSync(repacked, appAsar);

  writePatchStatus(ctx, { arch: "asar", appAsar, backup, restartRequired: true });
  log(ctx, "info", "Asar patch installed successfully.");
  return { ok: true, installed: true, appAsar, backup, restartRequired: true };
}

// ---- Flow: Renderer TGZ Patch ----

function patchRendererTgzFlow(ctx, workDir) {
  const rendererTgz = ctx.rendererTgz || findRendererTarGz();
  if (!rendererTgz) throw new Error("renderer.tar.gz not found.");
  if (!hasTarCommand()) throw new Error("tar command is required but not available.");

  // Quick pre-check
  try {
    const listing = execTar(`-tzf "${rendererTgz}"`, process.cwd()).toString();
    if (listing.includes(PATCH_MARKER)) {
      log(ctx, "info", "Renderer tgz already contains patch marker. Skipping.");
      return { ok: true, installed: true, alreadyPatched: true, rendererTgz };
    }
  } catch {}

  const resDir = path.dirname(rendererTgz);
  const backup = path.join(resDir, `renderer.bak-dh-${Date.now()}.tar.gz`);
  fs.copyFileSync(rendererTgz, backup);
  log(ctx, "info", `Backup: ${backup}`);
  cleanupOldBackups(resDir, "renderer.bak-dh-", ctx);

  // Extract
  const extractDir = path.join(workDir, "extracted");
  fs.rmSync(workDir, { recursive: true, force: true });
  fs.mkdirSync(extractDir, { recursive: true });
  extractTarGz(rendererTgz, extractDir);

  // Locate channel bundle
  const assetsDir = path.join(extractDir, "assets");
  if (!fs.existsSync(assetsDir)) throw new Error("assets directory not found inside extracted renderer.");

  const channelJs = findChannelFiles(assetsDir, ".js");
  if (channelJs.length === 0) throw new Error("No channel bundle JS found in assets.");
  patchChannelBundle(path.join(assetsDir, channelJs[0]), ctx);

  const channelCss = findChannelFiles(assetsDir, ".css");
  if (channelCss.length > 0) {
    patchChannelCss(path.join(assetsDir, channelCss[0]), ctx);
  }

  // Repack
  const repacked = path.join(workDir, "renderer-patched.tar.gz");
  fs.rmSync(repacked, { force: true });
  repackTarGz(extractDir, repacked);

  if (!verifyTarGz(repacked)) throw new Error("Repacked tar.gz verification failed.");

  // Replace original
  fs.rmSync(rendererTgz, { force: true });
  fs.copyFileSync(repacked, rendererTgz);

  writePatchStatus(ctx, { arch: "tgz", rendererTgz, backup, restartRequired: true });
  log(ctx, "info", "Renderer tgz patch installed successfully.");
  return { ok: true, installed: true, rendererTgz, backup, restartRequired: true };
}

// ---- Uninstall Functions ----

function uninstallAsarPatch(ctx, status) {
  const appAsar = status.appAsar || findAppAsar();
  if (!appAsar) throw new Error("app.asar not found for restoration.");
  let backup = (status.backup && fs.existsSync(status.backup)) ? status.backup : null;
  if (!backup) {
    const resDir = path.dirname(appAsar);
    backup = findBackup(resDir, "app.bak-dh-");
  }
  if (!backup || !fs.existsSync(backup)) throw new Error("No valid backup found for asar restoration.");

  fs.rmSync(appAsar, { force: true });
  fs.copyFileSync(backup, appAsar);

  const sp = statusPath(ctx);
  if (fs.existsSync(sp)) fs.rmSync(sp, { force: true });
  log(ctx, "info", "Asar patch uninstalled. Backup restored.");
  return { ok: true, installed: false, appAsar, backup, restartRequired: true };
}

function uninstallTgzPatch(ctx, status) {
  const rendererTgz = status.rendererTgz || findRendererTarGz();
  if (!rendererTgz) throw new Error("renderer.tar.gz not found for restoration.");
  let backup = (status.backup && fs.existsSync(status.backup)) ? status.backup : null;
  if (!backup) {
    const resDir = path.dirname(rendererTgz);
    backup = findBackup(resDir, "renderer.bak-dh-");
  }
  if (!backup || !fs.existsSync(backup)) throw new Error("No valid backup found for tgz restoration.");

  fs.rmSync(rendererTgz, { force: true });
  fs.copyFileSync(backup, rendererTgz);

  const sp = statusPath(ctx);
  if (fs.existsSync(sp)) fs.rmSync(sp, { force: true });
  log(ctx, "info", "Tgz patch uninstalled. Backup restored.");
  return { ok: true, installed: false, rendererTgz, backup, restartRequired: true };
}

// ---- Public API ----

export function installEnhancementPatch(ctx) {
  const unlock = acquireLock(ctx);
  const workDir = path.join(os.tmpdir(), `ph-patch-${Date.now()}`);
  try {
    const arch = detectArchitecture(ctx);
    let result;
    if (arch === "asar") {
      result = patchAsarFlow(ctx, workDir);
    } else {
      result = patchRendererTgzFlow(ctx, workDir);
    }
    return result;
  } finally {
    try { fs.rmSync(workDir, { recursive: true, force: true }); } catch {}
    unlock();
  }
}

export function uninstallEnhancementPatch(ctx) {
  const unlock = acquireLock(ctx);
  try {
    const status = readPatchStatus(ctx);
    if (!status) {
      // No saved status: attempt auto-detect
      const arch = detectArchitecture(ctx);
      if (arch === "asar") return uninstallAsarPatch(ctx, {});
      return uninstallTgzPatch(ctx, {});
    }
    if (status.arch === "asar") return uninstallAsarPatch(ctx, status);
    return uninstallTgzPatch(ctx, status);
  } finally {
    unlock();
  }
}
