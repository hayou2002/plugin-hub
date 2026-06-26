import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execSync } from "node:child_process";

const PATCH_STATUS = "patch-status.json";
const PATCH_MARKER = "plugin-hub:drawer-layout-v8";

const NEW_FT = String.raw`function ft({tabs:n,currentTab:l,onSelect:s,onPin:a,onContextMenu:i}){const[g,m]=o.useState(!1),u=o.useRef(null),c=o.useRef(null),f=o.useRef(null),p=o.useRef(null),E=o.useRef(0),[h,b]=o.useState(null),D=o.useCallback(()=>{c.current&&(clearTimeout(c.current),c.current=null),m(!0)},[]),P=o.useCallback(()=>{c.current&&clearTimeout(c.current),c.current=setTimeout(()=>{m(!1),b(null)},450)},[]);if(n.length===0)return null;let q={folders:[],rootItems:[]};try{q=JSON.parse(localStorage.getItem("plugin-hub:drawer-layout")||"{}")||q}catch{}Array.isArray(q.folders)||(q.folders=[]),Array.isArray(q.rootItems)||(q.rootItems=[]);const y=n.some(r=>r.id===l),S=n.filter(r=>!r.hidden),B=n.filter(r=>r.hidden),J=new Set;for(const r of q.folders)for(const C of r.items||[])J.add(C),J.add(` + "`plugin:${C}`" + `);const ee=q.folders.map(r=>{const C=new Set((r.items||[]).flatMap(M=>[M,` + "`plugin:${M}`" + `])),h=B.filter(M=>C.has(M.id));return{...r,tabs:h}}).filter(r=>r.tabs.length>0),te=B.filter(r=>!J.has(r.id)),se={position:"absolute",left:"calc(100% + 4px)",top:"0",minWidth:"148px",maxWidth:"240px",background:"var(--panel, #fff)",border:"1px solid var(--line, #ddd)",borderRadius:"8px",boxShadow:"0 8px 24px rgba(0,0,0,.16)",padding:"4px",zIndex:10000},re={minWidth:"132px",maxWidth:"220px",width:"100%",display:"flex",alignItems:"center",justifyContent:"space-between",gap:"10px"},ie={display:"block",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"};return d.jsxs("div",{className:v.overflowWrap,onMouseEnter:D,onMouseLeave:P,children:[d.jsx("button",{type:"button",ref:u,className:` + "`${v.overflowBtn}${g||y?` ${v.overflowBtnActive}`:\"\"}`" + `,title:t("channel.moreTabs"),onClick:()=>{E.current=Date.now(),m(r=>!r)},children:d.jsx("svg",{width:"12",height:"12",viewBox:"0 0 24 24",fill:"none",stroke:"currentColor",strokeWidth:"2",strokeLinecap:"round",strokeLinejoin:"round",children:d.jsx("polyline",{points:"6 9 12 15 18 9"})})}),d.jsxs(oe,{open:g,anchorRef:u,className:v.dropdown,minWidth:132,onClose:()=>{m(!1),b(null)},onMouseEnter:D,onMouseLeave:P,role:"menu",children:[S.map(r=>d.jsx("button",{type:"button",style:re,className:` + "`${v.dropdownItem}${r.id===l?` ${v.dropdownItemActive}`:\"\"}`" + `,onClick:()=>{s(r.id),m(!1)},onContextMenu:C=>{i?.(C,r.id),m(!1)},children:d.jsx("span",{style:ie,children:r.label})},r.id)),(B.length>0&&S.length>0)&&d.jsx("div",{className:v.divider}),ee.map(r=>d.jsxs("div",{className:v.dropdownRow,style:{position:"relative"},onMouseEnter:()=>{c.current&&(clearTimeout(c.current),c.current=null),p.current&&(clearTimeout(p.current),p.current=null),f.current&&(clearTimeout(f.current),f.current=null);const x=r.id,N=Date.now()-E.current<250?250:120;f.current=setTimeout(()=>b(x),N)},onMouseLeave:()=>{f.current&&(clearTimeout(f.current),f.current=null),p.current&&(clearTimeout(p.current),p.current=null),p.current=setTimeout(()=>b(null),180)},children:[d.jsxs("button",{type:"button",style:{...re,fontWeight:500},className:` + "`${v.dropdownItem} ${v.dropdownItemHidden}`" + `,children:[d.jsx("span",{style:ie,children:` + "`📂 ${r.name}`" + `}),d.jsx("span",{children:"›"})]}),h===r.id&&d.jsx("div",{style:se,onMouseEnter:()=>{c.current&&(clearTimeout(c.current),c.current=null),f.current&&(clearTimeout(f.current),f.current=null),p.current&&(clearTimeout(p.current),p.current=null),m(!0),b(r.id)},onMouseLeave:()=>{p.current&&(clearTimeout(p.current),p.current=null),p.current=setTimeout(()=>b(null),180)},children:r.tabs.map(C=>d.jsx("button",{type:"button",style:re,className:` + "`${v.dropdownItem} ${v.dropdownItemHidden}`" + `,onClick:()=>{s(C.id),m(!1)},children:d.jsx("span",{style:ie,children:C.label})},C.id))})]},r.id)),te.map(r=>d.jsx("button",{type:"button",style:re,className:` + "`${v.dropdownItem} ${v.dropdownItemHidden}`" + `,onClick:()=>{s(r.id),m(!1)},onContextMenu:C=>{i?.(C,r.id),m(!1)},children:d.jsx("span",{style:ie,children:r.label})},r.id))]})]})}`;

function statusPath(ctx) {
  if (!ctx?.dataDir) throw new Error("plugin dataDir unavailable");
  fs.mkdirSync(ctx.dataDir, { recursive: true });
  return path.join(ctx.dataDir, PATCH_STATUS);
}

export function readPatchStatus(ctx) {
  let saved = { installed: false };
  try {
    const file = statusPath(ctx);
    if (fs.existsSync(file)) saved = JSON.parse(fs.readFileSync(file, "utf8") || "{}");
  } catch {}
  try {
    const appAsar = saved.appAsar || findAppAsar();
    const actualInstalled = fs.existsSync(appAsar) && fs.readFileSync(appAsar).includes(Buffer.from(PATCH_MARKER));
    return { ...saved, appAsar, installed: actualInstalled || saved.installed === true };
  } catch {
    return saved;
  }
}

function writePatchStatus(ctx, status) {
  fs.writeFileSync(statusPath(ctx), `${JSON.stringify({ ...status, updatedAt: new Date().toISOString() }, null, 2)}\n`, "utf8");
}

function findAppAsar() {
  const candidates = [];
  if (process.resourcesPath) candidates.push(path.join(process.resourcesPath, "app.asar"));
  if (process.execPath) candidates.push(path.join(path.dirname(process.execPath), "resources", "app.asar"));
  if (process.env.LOCALAPPDATA) candidates.push(path.join(process.env.LOCALAPPDATA, "Programs", "HanaAgent", "resources", "app.asar"));
  for (const p of [...new Set(candidates)]) if (p && fs.existsSync(p)) return p;
  throw new Error("app.asar not found");
}

function shellQuote(value) {
  const s = String(value);
  if (process.platform === "win32") return `"${s.replace(/"/g, '\\"')}"`;
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

function runNpx(args, cwd) {
  const command = `npx --yes @electron/asar ${args.map(shellQuote).join(" ")}`;
  if (process.platform === "win32") {
    execSync(command, { cwd, stdio: "pipe", timeout: 120000, shell: process.env.ComSpec || "cmd.exe" });
  } else {
    execSync(command, { cwd, stdio: "pipe", timeout: 120000, shell: "/bin/sh" });
  }
}

function patchChannelBundle(file) {
  let js = fs.readFileSync(file, "utf8");
  if (!js.includes(PATCH_MARKER)) {
    js = js.replace('const U=9999;', 'window.__pluginHubDrawerPatch="plugin-hub:drawer-layout-v8";window.addEventListener("message",e=>{try{e.data&&e.data.type==="plugin-hub:drawer-layout"&&localStorage.setItem("plugin-hub:drawer-layout",JSON.stringify(e.data.payload||{}))}catch{}});const U=9999;');
  }
  // oe 函数：给 portal div 加 onMouseEnter/onMouseLeave + maxWidth
  js = js.replace(
    'function oe({open:n,anchorRef:l,children:s,className:a,align:i="end",offset:g=6,minWidth:m,viewportPadding:u=4,onClose:y,role:S})',
    'function oe({open:n,anchorRef:l,children:s,className:a,align:i="end",offset:g=6,minWidth:m,viewportPadding:u=4,onClose:y,role:S,onMouseEnter:V,onMouseLeave:K})'
  );
  // portal div: 加 hover 事件 + 覆盖 CSS class 的宽度限制
  // 匹配原始版本和已有补丁版本
  js = js.replace(
    /d\.jsx\("div",\{ref:B,className:a,style:[^}]+\},role:S,(?:onMouseEnter:[^,]+,onMouseLeave:[^,]+,)?children:s\}\)/,
    'd.jsx("div",{ref:B,className:a,style:{...r,width:"auto",minWidth:"132px",maxWidth:"220px"},role:S,onMouseEnter:V,onMouseLeave:K,children:s})'
  );
  // ft 函数替换
  const start = js.indexOf('function ft({tabs:n,currentTab:l,onSelect:s,onPin:a,onContextMenu:i})');
  const end = js.indexOf('const Y=5;', start);
  if (start < 0 || end < 0) throw new Error("PluginTabOverflow function not found");
  js = js.slice(0, start) + NEW_FT + js.slice(end);
  // 去掉点击隐藏插件时自动置顶
  js = js.replace('onSelect:e=>{S.some(h=>`plugin:${h.pluginId}`===e)&&z(e),O(e)},onPin:e=>z(e)', 'onSelect:e=>{O(e)}');
  fs.writeFileSync(file, js, "utf8");
}

function patchChannelCss(cssFile) {
  let css = fs.readFileSync(cssFile, "utf8");
  // 直接删除 dropdown 的固定宽度限制，让 inline style 接管
  css = css.replace('min-width:140px;max-width:200px;', 'min-width:auto;max-width:none;');
  fs.writeFileSync(cssFile, css, "utf8");
}

export function installEnhancementPatch(ctx) {
  const appAsar = findAppAsar();
  const current = fs.readFileSync(appAsar);
  if (current.includes(Buffer.from(PATCH_MARKER))) {
    const status = readPatchStatus(ctx);
    writePatchStatus(ctx, { ...status, installed: true, appAsar, restartRequired: false, note: "already patched" });
    return { ok: true, installed: true, alreadyPatched: true, appAsar };
  }
  const backup = `${appAsar}.bak-plugin-hub-manual-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  fs.copyFileSync(appAsar, backup);
  writePatchStatus(ctx, { installed: false, appAsar, backup, restartRequired: false, note: "backup created; patch in progress" });
  const work = path.join(ctx.dataDir, "patch-work");
  fs.rmSync(work, { recursive: true, force: true });
  fs.mkdirSync(work, { recursive: true });
  runNpx(["extract", appAsar, work], ctx.dataDir || os.tmpdir());
  const channel = path.join(work, "desktop", "dist-renderer", "assets", "ChannelTabBar-PyNP7Rpo.js");
  if (!fs.existsSync(channel)) throw new Error("ChannelTabBar bundle not found in app.asar");
  patchChannelBundle(channel);
  // 同时 patch CSS，去掉 dropdown 的固定宽度限制
  const cssFile = path.join(work, "desktop", "dist-renderer", "assets", "ChannelTabBar-BO4ulsgA.css");
  if (fs.existsSync(cssFile)) patchChannelCss(cssFile);
  const packed = path.join(ctx.dataDir, "app.asar.plugin-hub-patched");
  fs.rmSync(packed, { force: true });
  runNpx(["pack", work, packed], ctx.dataDir || os.tmpdir());
  fs.copyFileSync(packed, appAsar);
  writePatchStatus(ctx, { installed: true, appAsar, backup, restartRequired: true });
  return { ok: true, installed: true, appAsar, backup, restartRequired: true };
}

export function uninstallEnhancementPatch(ctx) {
  const status = readPatchStatus(ctx);
  const appAsar = status.appAsar || findAppAsar();
  let backup = status.backup;
  if (!backup || !fs.existsSync(backup)) {
    const dir = path.dirname(appAsar);
    const candidates = fs.readdirSync(dir)
      .filter((name) => name.startsWith("app.asar.bak-plugin-hub-manual-"))
      .map((name) => path.join(dir, name))
      .filter((file) => fs.existsSync(file))
      .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
    backup = candidates[0];
  }
  if (!backup || !fs.existsSync(backup)) throw new Error("backup not found; enhancement patch was not installed or backup was removed");
  fs.copyFileSync(backup, appAsar);
  writePatchStatus(ctx, { installed: false, appAsar, backup, restoredAt: new Date().toISOString(), restartRequired: true });
  return { ok: true, installed: false, appAsar, backup, restartRequired: true };
}
