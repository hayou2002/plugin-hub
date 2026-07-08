import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { execSync } from "node:child_process";

const PATCH_STATUS = "patch-status.json";
const PATCH_LOCK = "patch.lock";
const PATCH_MARKER = "plugin-hub:drawer-layout-v8";
const ASAR_VERSION = "3.4.1";
const MAX_BACKUPS = 3;

/* ═══════════════════════════════════════════════════
   增强版下拉函数
   ═══════════════════════════════════════════════════ */
const NEW_FT = String.raw`function bt({tabs:n,currentTab:l,onSelect:s,onPin:a,onContextMenu:i}){const[g,m]=o.useState(!1),u=o.useRef(null),c=o.useRef(null),f=o.useRef(null),p=o.useRef(null),E=o.useRef(0),[h,b]=o.useState(null),D=o.useCallback(()=>{c.current&&(clearTimeout(c.current),c.current=null),m(!0)},[]),P=o.useCallback(()=>{c.current&&clearTimeout(c.current),c.current=setTimeout(()=>{m(!1),b(null)},450)},[]);if(n.length===0)return null;let q={folders:[],rootItems:[]};try{q=JSON.parse(localStorage.getItem("plugin-hub:drawer-layout")||"{}")||q}catch{}Array.isArray(q.folders)||(q.folders=[]),Array.isArray(q.rootItems)||(q.rootItems=[]);const y=n.some(r=>r.id===l),S=n.filter(r=>!r.hidden),B=n.filter(r=>r.hidden),J=new Set;for(const r of q.folders)for(const C of r.items||[])J.add(C),J.add(` + "`plugin:${C}`" + `);const ee=q.folders.map(r=>{const C=new Set((r.items||[]).flatMap(M=>[M,` + "`plugin:${M}`" + `])),h=B.filter(M=>C.has(M.id));return{...r,tabs:h}}).filter(r=>r.tabs.length>0),te=B.filter(r=>!J.has(r.id)),se={position:"absolute",left:"calc(100% + 4px)",top:"0",minWidth:"148px",maxWidth:"240px",background:"var(--panel, #fff)",border:"1px solid var(--line, #ddd)",borderRadius:"8px",boxShadow:"0 8px 24px rgba(0,0,0,.16)",padding:"4px",zIndex:10000},re={minWidth:"132px",maxWidth:"220px",width:"100%",display:"flex",alignItems:"center",justifyContent:"space-between",gap:"10px"},ie={display:"block",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"};return d.jsxs("div",{className:v.overflowWrap,onMouseEnter:D,onMouseLeave:P,children:[d.jsx("button",{type:"button",ref:u,className:` + "`${v.overflowBtn}${g||y?` ${v.overflowBtnActive}`:\"\"}`" + `,title:t("channel.moreTabs"),onClick:()=>{E.current=Date.now(),m(r=>!r)},children:d.jsx("svg",{width:"12",height:"12",viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:"2",strokeLinecap:"round",strokeLinejoin:"round",children:d.jsx("polyline",{points:"6 9 12 15 18 9"})})}),d.jsxs(oe,{open:g,anchorRef:u,className:v.dropdown,minWidth:132,onClose:()=>{m(!1),b(null)},onMouseEnter:D,onMouseLeave:P,role:"menu",children:[S.map(r=>d.jsx("button",{type:"button",style:re,className:` + "`${v.dropdownItem}${r.id===l?` ${v.dropdownItemActive}`:\"\"}`" + `,onClick:()=>{s(r.id),m(!1)},onContextMenu:C=>{i?.(C,r.id),m(!1)},children:d.jsx("span",{style:ie,children:r.label})},r.id)),(B.length>0&&S.length>0)&&d.jsx("div",{className:v.divider}),ee.map(r=>d.jsxs("div",{className:v.dropdownRow,style:{position:"relative"},onMouseEnter:()=>{c.current&&(clearTimeout(c.current),c.current=null),p.current&&(clearTimeout(p.current),p.current=null),f.current&&(clearTimeout(f.current),f.current=null);const x=r.id,N=Date.now()-E.current<250?250:120;f.current=setTimeout(()=>b(x),N)},onMouseLeave:()=>{f.current&&(clearTimeout(f.current),f.current=null),p.current&&(clearTimeout(p.current),p.current=null),p.current=setTimeout(()=>b(null),180)},children:[d.jsxs("button",{type:"button",style:{...re,fontWeight:500},className:` + "`${v.dropdownItem} ${v.dropdownItemHidden}`" + `,children:[d.jsx("span",{style:ie,children:` + "`📂 ${r.name}`" + `}),d.jsx("span",{children:"›"})]}),h===r.id&&d.jsx("div",{style:se,onMouseEnter:()=>{c.current&&(clearTimeout(c.current),c.current=null),f.current&&(clearTimeout(f.current),f.current=null),p.current&&(clearTimeout(p.current),p.current=null),m(!0),b(r.id)},onMouseLeave:()=>{p.current&&(clearTimeout(p.current),p.current=null),p.current=setTimeout(()=>b(null),180)},children:r.tabs.map(C=>d.jsx("button",{type:"button",style:re,className:` + "`${v.dropdownItem} ${v.dropdownItemHidden}`" + `,onClick:()=>{s(C.id),m(!1)},children:d.jsx("span",{style:ie,children:C.label})},C.id))})]},r.id)),te.map(r=>d.jsx("button",{type:"button",style:re,className:` + "`${v.dropdownItem} ${v.dropdownItemHidden}`" + `,onClick:()=>{s(r.id),m(!1)},onContextMenu:C=>{i?.(C,r.id),m(!1)},children:d.jsx("span",{style:ie,children:r.label})},r.id))]})]})}`;

/* ═══════════════════════════════════════════════════
   智能补丁匹配规则表
   ═══════════════════════════════════════════════════ */
const PATCH_STEPS = [
  {
    label: "drawer-message-listener",
    // 使用更灵活的匹配，允许空白变化
    search: /const\s+U\s*=\s*9999\s*;/,
    replace: 'window.__pluginHubDrawerPatch="plugin-hub:drawer-layout-v8";window.addEventListener("message",e=>{try{e.data&&e.data.type==="plugin-hub:drawer-layout"&&localStorage.setItem("plugin-hub:drawer-layout",JSON.stringify(e.data.payload||{}))}catch{}});const U=9999;',
    type: "regex",
  },
  {
    label: "oe-hover-params",
    // 匹配函数签名，允许参数顺序变化
    search: /function\s+oe\s*\(\s*\{\s*open\s*:\s*n\s*,\s*anchorRef\s*:\s*l\s*,\s*children\s*:\s*s\s*,\s*className\s*:\s*a\s*,\s*align\s*:\s*i\s*=\s*"end"\s*,\s*offset\s*:\s*g\s*=\s*6\s*,\s*minWidth\s*:\s*m\s*,\s*viewportPadding\s*:\s*u\s*=\s*4\s*,\s*onClose\s*:\s*y\s*,\s*role\s*:\s*S\s*\}\s*\)/,
    replace: 'function oe({open:n,anchorRef:l,children:s,className:a,align:i="end",offset:g=6,minWidth:m,viewportPadding:u=4,onClose:y,role:S,onMouseEnter:V,onMouseLeave:K})',
    type: "regex",
  },
  {
    label: "oe-portal-div",
    search: /d\.jsx\("div",\s*\{\s*ref\s*:\s*B\s*,\s*className\s*:\s*a\s*,\s*style\s*:\s*r\s*,\s*role\s*:\s*S\s*,\s*(?:onMouseEnter\s*:\s*[^,]+,\s*onMouseLeave\s*:\s*[^,]+,\s*)?children\s*:\s*s\s*\}\s*\)/,
    replace: 'd.jsx("div",{ref:B,className:a,style:{...r,width:"auto",minWidth:"132px",maxWidth:"220px"},role:S,onMouseEnter:V,onMouseLeave:K,children:s})',
    type: "regex",
  },
  {
    label: "auto-pin-removal",
    // 使用更宽松的匹配
    search: /onSelect\s*:\s*e\s*=>\s*\{\s*S\.some\s*\(\s*h\s*=>\s*`plugin:\$\{h\.pluginId\}`\s*===\s*e\s*\)\s*&&\s*z\s*\(\s*e\s*\)\s*,\s*O\s*\(\s*e\s*\)\s*\}\s*,\s*onPin\s*:\s*e\s*=>\s*z\s*\(\s*e\s*\)/,
    replace: 'onSelect:e=>{O(e)}',
    type: "regex",
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
    const appAsar = saved.appAsar || findAppAsar();
    const markerInAsar = fs.existsSync(appAsar) && fs.readFileSync(appAsar).includes(Buffer.from(PATCH_MARKER));
    const statusInstalled = saved.installed === true;
    const installed = markerInAsar && statusInstalled;
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

/* ═══════════════════════════════════════════════════
   增强版文件查找 - 支持多平台多路径
   ═══════════════════════════════════════════════════ */
function findAppAsar() {
  const candidates = [];
  const platform = process.platform;
  
  // 1. 从进程信息推断
  if (process.resourcesPath) {
    candidates.push(path.join(process.resourcesPath, "app.asar"));
  }
  if (process.execPath) {
    candidates.push(path.join(path.dirname(process.execPath), "resources", "app.asar"));
  }
  
  // 2. 平台特定路径
  if (platform === "win32") {
    const localAppData = process.env.LOCALAPPDATA || "";
    const programFiles = process.env.ProgramFiles || "";
    const programFilesX86 = process.env["ProgramFiles(x86)"] || "";
    
    if (localAppData) {
      candidates.push(path.join(localAppData, "Programs", "HanaAgent", "resources", "app.asar"));
      candidates.push(path.join(localAppData, "HanaAgent", "resources", "app.asar"));
      // 兼容旧版本
      candidates.push(path.join(localAppData, "Programs", "hanako", "resources", "app.asar"));
    }
    if (programFiles) {
      candidates.push(path.join(programFiles, "HanaAgent", "resources", "app.asar"));
      candidates.push(path.join(programFiles, "Hana", "resources", "app.asar"));
    }
    if (programFilesX86) {
      candidates.push(path.join(programFilesX86, "HanaAgent", "resources", "app.asar"));
    }
    
    // 3. 尝试从注册表查询（静默失败）
    try {
      const regQuery = `reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall" /s /f "Hana" 2>nul`;
      const output = execSync(regQuery, { encoding: "utf8", timeout: 5000, stdio: "pipe" });
      const installPathMatch = output.match(/InstallLocation\s+REG_SZ\s+(.+)/i);
      if (installPathMatch) {
        const installPath = installPathMatch[1].trim();
        candidates.push(path.join(installPath, "resources", "app.asar"));
      }
    } catch (e) {
      // 注册表查询失败，忽略
    }
    
  } else if (platform === "darwin") {
    candidates.push("/Applications/HanaAgent.app/Contents/Resources/app.asar");
    candidates.push("/Applications/Hana.app/Contents/Resources/app.asar");
    candidates.push("/Applications/hanako.app/Contents/Resources/app.asar");
    
    const home = os.homedir();
    candidates.push(path.join(home, "Applications", "HanaAgent.app", "Contents", "Resources", "app.asar"));
    
  } else if (platform === "linux") {
    const home = os.homedir();
    candidates.push(path.join(home, ".local", "share", "HanaAgent", "resources", "app.asar"));
    candidates.push("/opt/HanaAgent/resources/app.asar");
    candidates.push("/usr/lib/HanaAgent/resources/app.asar");
    candidates.push("/usr/local/lib/HanaAgent/resources/app.asar");
  }
  
  // 4. 环境变量指定路径
  const envPaths = [
    process.env.HANA_HOME,
    process.env.HANA_INSTALL_PATH,
    process.env.HANA_ASAR_PATH,
  ].filter(Boolean);
  
  for (const envPath of envPaths) {
    if (envPath) {
      if (fs.existsSync(envPath) && fs.statSync(envPath).isDirectory()) {
        candidates.push(path.join(envPath, "app.asar"));
        candidates.push(path.join(envPath, "resources", "app.asar"));
      } else {
        candidates.push(envPath);
      }
    }
  }
  
  // 5. 去重并验证
  const uniqueCandidates = [...new Set(candidates)];
  for (const p of uniqueCandidates) {
    try {
      if (p && fs.existsSync(p)) {
        const stats = fs.statSync(p);
        if (stats.size > 1024 * 1024) { // 至少1MB
          return p;
        }
      }
    } catch (e) {
      continue;
    }
  }
  
  // 6. 提供详细的错误信息
  const errorMsg = [
    "找不到 Hana 的核心文件 app.asar，请确保 Hana 已正确安装。",
    "已尝试以下路径：",
    ...uniqueCandidates.slice(0, 8).map(p => `  - ${p}`),
    "",
    "可能的解决方案：",
    "1. 重新安装 HanaAgent",
    "2. 设置环境变量 HANA_HOME 指向 Hana 安装目录",
    "3. 从 Hana 内部运行此插件",
  ].join("\n");
  
  throw new Error(errorMsg);
}

function runNpx(args, cwd, retries = 2) {
  const safeArgs = args.map(a => String(a).replace(/"/g, '""'));
  const command = `npx --yes @electron/asar@${ASAR_VERSION} ${safeArgs.map(a => `"${a}"`).join(" ")}`;
  const shell = process.platform === "win32" ? (process.env.ComSpec || "cmd.exe") : "/bin/sh";
  
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      execSync(command, { cwd: cwd || os.tmpdir(), stdio: "pipe", timeout: 120000, shell });
      return; // 成功则返回
    } catch (err) {
      if (attempt === retries) {
        // 最后一次尝试失败
        throw new Error(
          `asar ${args[0]} 失败 (退出码 ${err.status})。` +
          `已重试 ${retries} 次。请确保网络连接正常，或手动安装 @electron/asar@${ASAR_VERSION}。`
        );
      }
      // 等待一段时间后重试
      const delay = (attempt + 1) * 2000;
      log(ctx, "warn", `asar ${args[0]} 失败，${delay/1000}秒后重试 (${attempt + 1}/${retries})`);
      execSync(`timeout /t ${delay/1000} /nobreak >nul 2>&1 || sleep ${delay/1000}`, { shell, stdio: "pipe" });
    }
  }
}

function verifyAsar(packed, retries = 1) {
  const shell = process.platform === "win32" ? (process.env.ComSpec || "cmd.exe") : "/bin/sh";
  
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      execSync(`npx --yes @electron/asar@${ASAR_VERSION} list "${String(packed).replace(/"/g, '""')}"`, { 
        stdio: "pipe", 
        timeout: 30000, 
        shell 
      });
      return true;
    } catch (err) {
      if (attempt === retries) {
        return false;
      }
      // 等待后重试
      execSync(`timeout /t 2 /nobreak >nul 2>&1 || sleep 2`, { shell, stdio: "pipe" });
    }
  }
  return false;
}

/* ═══════════════════════════════════════════════════
   智能补丁匹配 - 支持模糊匹配
   ═══════════════════════════════════════════════════ */
function applyPatch(content, search, replace, label) {
  let result;
  
  if (search instanceof RegExp) {
    result = content.replace(search, replace);
  } else {
    // 先尝试精确匹配
    result = content.replace(search, replace);
    
    // 如果精确匹配失败，尝试标准化匹配
    if (result === content) {
      const normalizedSearch = search.replace(/\s+/g, ' ').trim();
      const normalizedContent = content.replace(/\s+/g, ' ');
      
      if (normalizedContent.includes(normalizedSearch)) {
        // 使用正则表达式定位原始位置
        const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const flexiblePattern = escapedSearch.replace(/\s+/g, '\\s+');
        const regex = new RegExp(flexiblePattern, 's');
        const match = content.match(regex);
        
        if (match) {
          result = content.substring(0, match.index) + replace + 
                   content.substring(match.index + match[0].length);
        }
      }
    }
  }
  
  if (result === content) {
    throw new Error(
      `补丁 "${label}" 匹配失败。` +
      `当前 Hana 版本的代码结构可能已变化。` +
      `插件需要更新以适配新版本。`
    );
  }
  return result;
}

function patchChannelBundle(file, ctx) {
  let js = fs.readFileSync(file, "utf8");

  // 检查是否已打过补丁
  if (js.includes(PATCH_MARKER)) {
    throw new Error("增强补丁已应用到此文件。");
  }

  // 逐个执行补丁步骤
  for (const step of PATCH_STEPS) {
    js = applyPatch(js, step.search, step.replace, step.label);
  }

  // 替换 ft/bt 函数体 - 适配不同 minifier 命名
  const ftStartPattern = /function\s+[fb]t\s*\(\s*\{\s*tabs\s*:\s*n\s*,\s*currentTab\s*:\s*l\s*,\s*onSelect\s*:\s*s\s*,\s*onPin\s*:\s*a\s*,\s*onContextMenu\s*:\s*i\s*\}\s*\)/;
  const ftStartMatch = js.match(ftStartPattern);
  
  if (!ftStartMatch) {
    throw new Error(
      '找不到下拉组件函数（ft/bt）结构。当前 Hana 版本的代码可能已变化。' +
      '插件需要更新以适配新版本。'
    );
  }
  
  const ftStart = ftStartMatch.index;
  const ftEndSearch = js.indexOf('const Y=5;', ftStart);
  if (ftEndSearch < 0) {
    throw new Error(
      '找不到下拉组件的结束位置（const Y=5;标记）。当前 Hana 版本的代码可能已变化。'
    );
  }
  
  js = js.slice(0, ftStart) + NEW_FT + js.slice(ftEndSearch);

  // 记录补丁指纹
  const hash = crypto.createHash("sha256").update(js).digest("hex").slice(0, 16);
  const fingerprint = `window.__pluginHubDrawerFingerprint="${hash}";`;
  js = fingerprint + js;

  fs.writeFileSync(file, js, "utf8");
  log(ctx, "info", `ChannelTabBar 补丁成功 (指纹: ${hash})`);
}

function patchChannelCss(cssFile, ctx) {
  let css = fs.readFileSync(cssFile, "utf8");
  const search = 'min-width:140px;max-width:200px;';
  const replace = 'min-width:auto;max-width:none;';

  if (css.includes(replace)) {
    log(ctx, "info", "CSS 已打补丁，跳过");
    return;
  }

  css = applyPatch(css, search, replace, "css-dropdown-width");
  fs.writeFileSync(cssFile, css, "utf8");
  log(ctx, "info", "ChannelTabBar CSS 补丁成功");
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

/* ═══════════════════════════════════════════════════
   公开 API
   ═══════════════════════════════════════════════════ */

export function installEnhancementPatch(ctx) {
  const release = acquireLock(ctx);
  const work = path.join(ctx.dataDir, "patch-work");

  try {
    const appAsar = findAppAsar();
    const current = fs.readFileSync(appAsar);

    // 已安装检测
    if (current.includes(Buffer.from(PATCH_MARKER))) {
      writePatchStatus(ctx, { installed: true, appAsar, restartRequired: false, note: "已安装" });
      return { ok: true, installed: true, alreadyPatched: true, appAsar };
    }

    // 创建备份
    const backup = `${appAsar}.bak-dh-${Date.now()}`;
    fs.copyFileSync(appAsar, backup);
    cleanupOldBackups(path.dirname(appAsar));
    log(ctx, "info", `备份已创建: ${backup}`);

    // 解压 asar
    fs.rmSync(work, { recursive: true, force: true });
    fs.mkdirSync(work, { recursive: true });
    runNpx(["extract", appAsar, work], ctx.dataDir);

    // 动态查找 ChannelTabBar 文件
    const assetsDir = path.join(work, "desktop", "dist-renderer", "assets");
    
    if (!fs.existsSync(assetsDir)) {
      throw new Error(
        "在 app.asar 中找不到资源目录。" +
        "当前 Hana 版本的目录结构可能已变化。"
      );
    }
    
    const channelJs = fs.readdirSync(assetsDir)
      .filter(name => name.startsWith("ChannelTabBar-") && name.endsWith(".js"))
      .sort((a, b) => fs.statSync(path.join(assetsDir, b)).mtimeMs - fs.statSync(path.join(assetsDir, a)).mtimeMs);
    
    if (channelJs.length === 0) {
      throw new Error(
        "在 app.asar 中找不到 ChannelTabBar 组件。" +
        "当前 Hana 版本可能已更新，插件需要适配。"
      );
    }
    
    const channelFile = path.join(assetsDir, channelJs[0]);
    patchChannelBundle(channelFile, ctx);

    // CSS 补丁
    const channelCss = fs.readdirSync(assetsDir)
      .filter(name => name.startsWith("ChannelTabBar-") && name.endsWith(".css"))
      .sort((a, b) => fs.statSync(path.join(assetsDir, b)).mtimeMs - fs.statSync(path.join(assetsDir, a)).mtimeMs);
    
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
        "补丁后的 asar 文件校验失败。补丁未应用，原始文件未修改。"
      );
    }

    // 写入目标
    fs.copyFileSync(packed, appAsar);
    writePatchStatus(ctx, { installed: true, appAsar, backup, restartRequired: true });
    log(ctx, "info", "增强补丁安装成功");

    return { ok: true, installed: true, appAsar, backup, restartRequired: true };

  } catch (err) {
    writePatchStatus(ctx, {
      installed: false,
      error: err.message,
      failedAt: new Date().toISOString(),
    });
    log(ctx, "error", "补丁安装失败: " + err.message);
    throw err;

  } finally {
    try { fs.rmSync(work, { recursive: true, force: true }); } catch {}
    release();
  }
}

export function uninstallEnhancementPatch(ctx) {
  const release = acquireLock(ctx);

  try {
    const status = readPatchStatus(ctx);
    const appAsar = status.appAsar || findAppAsar();
    let backup = (status.backup && fs.existsSync(status.backup)) ? status.backup : null;

    if (!backup) {
      const dir = path.dirname(appAsar);
      const candidates = fs.readdirSync(dir)
        .filter((name) => name.startsWith("app.asar.bak-dh-"))
        .map((name) => path.join(dir, name))
        .filter((file) => fs.existsSync(file))
        .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
      
      if (candidates.length === 0) {
        throw new Error(
          "找不到备份文件。备份可能已被删除。" +
          "您可能需要重新安装 Hana 来恢复原始文件。"
        );
      }
      backup = candidates[0];
    }

    if (!fs.existsSync(backup)) {
      throw new Error("备份文件不存在。请重新安装 Hana 来恢复。");
    }

    fs.copyFileSync(backup, appAsar);
    writePatchStatus(ctx, {
      installed: false,
      restoredAt: new Date().toISOString(),
      note: "已从备份恢复原始 app.asar。重启 Hana 生效。",
    });
    log(ctx, "info", "增强补丁已卸载，原始文件已恢复");

    return { ok: true, installed: false, appAsar, backup, restartRequired: true };

  } catch (err) {
    log(ctx, "error", "补丁卸载失败: " + err.message);
    throw err;

  } finally {
    release();
  }
}