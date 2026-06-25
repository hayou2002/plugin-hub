import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";

const PLUGIN_ID = "plugin-hub";
const DRAWER_TAB = `plugin:${PLUGIN_ID}`;

const OLD_OVERFLOW_CLICK = "onSelect:e=>{S.some(h=>`plugin:${h.pluginId}`===e)&&z(e),O(e)},onPin:e=>z(e)";
const PATCH_SEED = "onSelect:e=>{O(e)/*plugin-hub:no-auto-pin";
const PATCH_TAIL = "*/},onPin:e=>z(e)";
const NEW_OVERFLOW_CLICK = PATCH_SEED + ".".repeat(OLD_OVERFLOW_CLICK.length - PATCH_SEED.length - PATCH_TAIL.length) + PATCH_TAIL;
const PATCH_MARKER = "plugin-hub:no-auto-pin";

function getHomeDir() {
  return process.env.USERPROFILE || os.homedir();
}

function getPreferencesPath() {
  return path.join(getHomeDir(), ".hanako", "user", "preferences.json");
}

function cleanupDrawerPrefs(pluginId = PLUGIN_ID) {
  const prefsPath = getPreferencesPath();
  if (!fs.existsSync(prefsPath)) return { changed: false, reason: "preferences not found" };

  const raw = fs.readFileSync(prefsPath, "utf8");
  const prefs = JSON.parse(raw || "{}");
  const pluginUi = prefs.plugin_ui && typeof prefs.plugin_ui === "object" ? prefs.plugin_ui : {};

  const hiddenTabs = Array.isArray(pluginUi.hiddenTabs) ? pluginUi.hiddenTabs : [];
  const tabOrder = Array.isArray(pluginUi.tabOrder) ? pluginUi.tabOrder.filter(Boolean) : [];
  const drawerTab = `plugin:${pluginId}`;

  const nextHiddenTabs = hiddenTabs.filter((id) => id !== pluginId && id !== drawerTab);
  const nextTabOrder = tabOrder.filter((id) => id !== drawerTab);

  const changed = JSON.stringify(hiddenTabs) !== JSON.stringify(nextHiddenTabs)
    || JSON.stringify(tabOrder) !== JSON.stringify(nextTabOrder);

  if (!changed) return { changed: false };

  prefs.plugin_ui = {
    ...pluginUi,
    hiddenTabs: nextHiddenTabs,
    tabOrder: nextTabOrder,
  };

  fs.writeFileSync(prefsPath, `${JSON.stringify(prefs, null, 2)}\n`, "utf8");
  return { changed: true };
}

function ensureDrawerPinned(pluginId = PLUGIN_ID) {
  const prefsPath = getPreferencesPath();
  if (!fs.existsSync(prefsPath)) return { changed: false, reason: "preferences not found" };

  const raw = fs.readFileSync(prefsPath, "utf8");
  const prefs = JSON.parse(raw || "{}");
  const pluginUi = prefs.plugin_ui && typeof prefs.plugin_ui === "object" ? prefs.plugin_ui : {};

  const hiddenTabs = Array.isArray(pluginUi.hiddenTabs) ? pluginUi.hiddenTabs : [];
  const nextHiddenTabs = hiddenTabs.filter((id) => id !== pluginId && id !== `plugin:${pluginId}`);

  const tabOrder = Array.isArray(pluginUi.tabOrder) ? pluginUi.tabOrder.filter(Boolean) : [];
  const drawerTab = `plugin:${pluginId}`;
  const nextTabOrder = [drawerTab, ...tabOrder.filter((id) => id !== drawerTab)];

  const changed = JSON.stringify(hiddenTabs) !== JSON.stringify(nextHiddenTabs)
    || JSON.stringify(tabOrder) !== JSON.stringify(nextTabOrder);

  if (!changed) return { changed: false };

  prefs.plugin_ui = {
    ...pluginUi,
    hiddenTabs: nextHiddenTabs,
    tabOrder: nextTabOrder,
  };

  fs.writeFileSync(prefsPath, `${JSON.stringify(prefs, null, 2)}\n`, "utf8");
  return { changed: true };
}

function findAppAsar() {
  const candidates = [];

  if (process.resourcesPath) {
    candidates.push(path.join(process.resourcesPath, "app.asar"));
  }

  if (process.execPath) {
    candidates.push(path.join(path.dirname(process.execPath), "resources", "app.asar"));
  }

  // 常见 Windows 安装路径兜底：%LOCALAPPDATA%\\Programs\\HanaAgent\\resources\\app.asar
  if (process.env.LOCALAPPDATA) {
    candidates.push(path.join(process.env.LOCALAPPDATA, "Programs", "HanaAgent", "resources", "app.asar"));
  }

  for (const candidate of [...new Set(candidates)]) {
    if (candidate && fs.existsSync(candidate)) return candidate;
  }

  return null;
}

function getRuntimeStatusPath(ctx) {
  if (!ctx?.dataDir) return null;
  return path.join(ctx.dataDir, "runtime-status.json");
}

function readRuntimeStatus(ctx) {
  try {
    const statusPath = getRuntimeStatusPath(ctx);
    if (!statusPath || !fs.existsSync(statusPath)) return {};
    return JSON.parse(fs.readFileSync(statusPath, "utf8") || "{}");
  } catch {
    return {};
  }
}

function writeRuntimeStatus(ctx, status) {
  try {
    const statusPath = getRuntimeStatusPath(ctx);
    if (!statusPath) return;
    fs.mkdirSync(path.dirname(statusPath), { recursive: true });
    fs.writeFileSync(statusPath, `${JSON.stringify({ ...readRuntimeStatus(ctx), ...status, updatedAt: new Date().toISOString() }, null, 2)}\n`, "utf8");
  } catch {
    // 状态文件只用于页面提示和卸载回滚，失败不影响插件主体功能。
  }
}

function patchAppAsarNoAutoPin() {
  if (Buffer.byteLength(OLD_OVERFLOW_CLICK) !== Buffer.byteLength(NEW_OVERFLOW_CLICK)) {
    throw new Error("internal patch length mismatch");
  }

  const appAsarPath = findAppAsar();
  if (!appAsarPath) return { patched: false, reason: "app.asar not found" };

  const buffer = fs.readFileSync(appAsarPath);
  const markerBuffer = Buffer.from(PATCH_MARKER, "utf8");
  if (buffer.includes(markerBuffer)) return { patched: false, alreadyPatched: true, appAsarPath };

  const oldBuffer = Buffer.from(OLD_OVERFLOW_CLICK, "utf8");
  const index = buffer.indexOf(oldBuffer);
  if (index < 0) {
    return { patched: false, reason: "target snippet not found; Hana version may have changed", appAsarPath };
  }

  const backupPath = `${appAsarPath}.bak-plugin-hub-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  fs.copyFileSync(appAsarPath, backupPath);

  const newBuffer = Buffer.from(NEW_OVERFLOW_CLICK, "utf8");
  newBuffer.copy(buffer, index);
  fs.writeFileSync(appAsarPath, buffer);

  return { patched: true, appAsarPath, backupPath };
}

function scheduleRestoreIfActuallyUninstalled(ctx) {
  if (process.platform !== "win32") return { scheduled: false, reason: "restore watchdog currently supports Windows only" };
  if (!ctx?.dataDir || !ctx?.pluginDir) return { scheduled: false, reason: "missing plugin context" };

  const status = readRuntimeStatus(ctx);
  const appAsarPath = status.appAsarPath || findAppAsar();
  const backupPath = status.backupPath;
  if (!appAsarPath || !backupPath) return { scheduled: false, reason: "missing app.asar or backup path" };

  fs.mkdirSync(ctx.dataDir, { recursive: true });
  const scriptPath = path.join(ctx.dataDir, "restore-on-uninstall.ps1");
  const prefsPath = getPreferencesPath();

  const ps = `
Start-Sleep -Seconds 2
$pluginDir = ${JSON.stringify(ctx.pluginDir)}
$appAsar = ${JSON.stringify(appAsarPath)}
$backup = ${JSON.stringify(backupPath)}
$prefsPath = ${JSON.stringify(prefsPath)}
$marker = ${JSON.stringify(PATCH_MARKER)}
$oldSnippet = ${JSON.stringify(OLD_OVERFLOW_CLICK)}
$drawerTab = ${JSON.stringify(DRAWER_TAB)}
$pluginId = ${JSON.stringify(PLUGIN_ID)}

# 目录仍存在，说明只是关闭 / 重载 / 禁用，不执行恢复。
if (Test-Path -LiteralPath $pluginDir) { exit 0 }

try {
  if ((Test-Path -LiteralPath $appAsar) -and (Test-Path -LiteralPath $backup)) {
    $currentText = [System.Text.Encoding]::UTF8.GetString([System.IO.File]::ReadAllBytes($appAsar))
    $backupText = [System.Text.Encoding]::UTF8.GetString([System.IO.File]::ReadAllBytes($backup))
    if ($currentText.Contains($marker) -and $backupText.Contains($oldSnippet)) {
      Copy-Item -LiteralPath $backup -Destination $appAsar -Force
    }
  }
} catch {}

try {
  if (Test-Path -LiteralPath $prefsPath) {
    $p = Get-Content -LiteralPath $prefsPath -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($null -ne $p.plugin_ui) {
      $hidden = @()
      if ($null -ne $p.plugin_ui.hiddenTabs) {
        $hidden = @($p.plugin_ui.hiddenTabs | Where-Object { $_ -ne $pluginId -and $_ -ne $drawerTab })
      }
      $order = @()
      if ($null -ne $p.plugin_ui.tabOrder) {
        $order = @($p.plugin_ui.tabOrder | Where-Object { $_ -and $_ -ne $drawerTab })
      }
      if ($p.plugin_ui.PSObject.Properties.Name -contains 'hiddenTabs') { $p.plugin_ui.hiddenTabs = $hidden } else { $p.plugin_ui | Add-Member -NotePropertyName hiddenTabs -NotePropertyValue $hidden }
      if ($p.plugin_ui.PSObject.Properties.Name -contains 'tabOrder') { $p.plugin_ui.tabOrder = $order } else { $p.plugin_ui | Add-Member -NotePropertyName tabOrder -NotePropertyValue $order }
      $p | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $prefsPath -Encoding UTF8
    }
  }
} catch {}
`;

  fs.writeFileSync(scriptPath, ps, "utf8");
  const child = spawn("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", scriptPath], {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  child.unref();
  return { scheduled: true, scriptPath };
}

export default class PluginHubPlugin {
  constructor(ctx) {
    this.ctx = ctx;
  }

  async onload() {
    this.ctx?.log?.info?.("[PluginHub] loaded");

    try {
      const pinResult = ensureDrawerPinned(this.ctx?.pluginId || PLUGIN_ID);
      if (pinResult.changed) {
        this.ctx?.log?.info?.("[PluginHub] ensured drawer tab pinned");
        this.ctx?.bus?.emit?.({ type: "plugin_ui_changed" });
      }
    } catch (err) {
      this.ctx?.log?.warn?.("[PluginHub] ensure drawer pinned failed: " + (err?.message || err));
    }

    try {
      const patchResult = patchAppAsarNoAutoPin();
      if (patchResult.patched) {
        writeRuntimeStatus(this.ctx, { patch: "patched", restartRequired: true, appAsarPath: patchResult.appAsarPath, backupPath: patchResult.backupPath });
        this.ctx?.log?.info?.("[PluginHub] patched app.asar overflow click; restart Hana to take effect. Backup: " + patchResult.backupPath);
      } else if (patchResult.alreadyPatched) {
        writeRuntimeStatus(this.ctx, { patch: "already-patched", restartRequired: false, appAsarPath: patchResult.appAsarPath });
        this.ctx?.log?.info?.("[PluginHub] app.asar overflow click patch already present");
      } else {
        writeRuntimeStatus(this.ctx, { patch: "skipped", restartRequired: false, appAsarPath: patchResult.appAsarPath, reason: patchResult.reason || "unknown" });
        this.ctx?.log?.warn?.("[PluginHub] app.asar overflow click patch skipped: " + (patchResult.reason || "unknown"));
      }
    } catch (err) {
      writeRuntimeStatus(this.ctx, { patch: "failed", restartRequired: false, reason: err?.message || String(err) });
      this.ctx?.log?.warn?.("[PluginHub] app.asar overflow click patch failed: " + (err?.message || err));
    }
  }

  async onunload() {
    this.ctx?.log?.info?.("[PluginHub] unloading");

    try {
      const result = scheduleRestoreIfActuallyUninstalled(this.ctx);
      if (result.scheduled) {
        this.ctx?.log?.info?.("[PluginHub] uninstall restore watchdog scheduled: " + result.scriptPath);
      } else {
        this.ctx?.log?.info?.("[PluginHub] uninstall restore watchdog skipped: " + (result.reason || "unknown"));
      }
    } catch (err) {
      this.ctx?.log?.warn?.("[PluginHub] uninstall restore watchdog failed: " + (err?.message || err));
    }

    this.ctx?.log?.info?.("[PluginHub] unloaded");
  }
}
