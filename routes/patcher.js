import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { execSync } from "node:child_process";

const PATCH_STATUS = "patch-status.json";
const PATCH_LOCK = "patch.lock";
const PATCH_CSS_MARKER = "/* ph-overflow-hide */";
const MAX_BACKUPS = 3;

// CSS-only: hide overflow ▼ button in ChannelTabBar
const OVERFLOW_CSS = "button[class*=overflow]{display:none!important}";


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

export function patchChannelCss(file, ctx) {
  let content = fs.readFileSync(file, "utf-8");
  // Check if already patched
  if (content.includes(PATCH_CSS_MARKER)) {
    log(ctx, "info", `Already patched: ${path.basename(file)}`);
    return { patched: false, alreadyPatched: true };
  }
  // Append the overflow-hide rule at the end
  content += "\n" + PATCH_CSS_MARKER + " " + OVERFLOW_CSS + "\n";
  fs.writeFileSync(file, content, "utf-8");
  log(ctx, "info", `CSS patched: ${path.basename(file)}`);
  return { patched: true };
}

// ---- Flow: Asar Patch ----

function patchAsarFlow(ctx, workDir) {
  const appAsar = ctx.appAsar || findAppAsar();
  if (!appAsar) throw new Error("app.asar not found.");
  const resDir = path.dirname(appAsar);

  // Quick pre-check via asar list (skip in force mode)
  if (!ctx._phForce) {
    const checkDir = path.join(workDir, "_check");
    fs.mkdirSync(checkDir, { recursive: true });
    try {
      const listing = runNpx("@electron/asar", `list "${appAsar}"`).toString();
      if (listing.includes(PATCH_CSS_MARKER)) {
        fs.rmSync(workDir, { recursive: true, force: true });
        log(ctx, "info", "Asar already contains patch marker. Skipping.");
        return { ok: true, installed: true, alreadyPatched: true, appAsar };
      }
    } finally {
      fs.rmSync(checkDir, { recursive: true, force: true });
    }
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

  const channelCss = findChannelFiles(assetsDir, ".css");
  if (channelCss.length > 0) {
    patchChannelCss(path.join(assetsDir, channelCss[0]), ctx);
  } else {
    // Fallback: inject into any CSS file
    const allCss = findChannelFiles(assetsDir, ".css");
    if (allCss.length > 0) patchChannelCss(path.join(assetsDir, allCss[0]), ctx);
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

  // Quick pre-check (skip in force mode)
  if (!ctx._phForce) {
    try {
      const listing = execTar(`-tzf "${rendererTgz}"`, process.cwd()).toString();
      if (listing.includes(PATCH_CSS_MARKER)) {
        log(ctx, "info", "Renderer tgz already contains patch marker. Skipping.");
        return { ok: true, installed: true, alreadyPatched: true, rendererTgz };
      }
    } catch {}
  }

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
    // 删掉 artifacts/renderer 缓存，让 Hana 从 seed 重新解压（避免 SHA256 校验失败）
    if (result && result.ok) {
      try {
        const hanaDir = path.dirname(path.dirname(ctx.dataDir));
        const cacheDir = path.join(hanaDir, "artifacts", "renderer");
        if (fs.existsSync(cacheDir)) {
          fs.rmSync(cacheDir, { recursive: true, force: true });
          log(ctx, "info", "Cleared renderer cache, Hana will re-extract from seed on restart.");
        }
      } catch (e) {
        log(ctx, "warn", "Failed to clear renderer cache: " + e.message);
      }
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
