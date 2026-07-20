(function(){
var C=window.__PLUGIN_HUB__;if(!C)return;
var STATE_URL=C.stateUrl,PREFS_URL=C.prefsUrl,LAYOUT_URL=C.layoutUrl,CACHE_KEY="plugin-hub:state-cache",
    state=C.state||{pages:[],widgets:[],prefs:{hiddenTabs:[],hiddenWidgets:[],tabOrder:[]},layout:{folders:[],rootItems:[]}};
if(!state.prefs)state.prefs={hiddenTabs:[],hiddenWidgets:[],tabOrder:[]};
if(!Array.isArray(state.prefs.hiddenTabs))state.prefs.hiddenTabs=[];
if(!Array.isArray(state.prefs.hiddenWidgets))state.prefs.hiddenWidgets=[];
if(!state.layout)state.layout={folders:[],rootItems:[]};

var mode="browse"; // browse | manage

function esc(s){return String(s||"").replace(/[&<>"']/g,function(c){return({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]})}
function api(p,init){if(window.hana&&hana.api&&typeof hana.api.fetch==="function")return hana.api.fetch(p,init);return fetch(p,init)}
function getTitle(i){if(typeof i.title==="string")return i.title;if(i.title&&typeof i.title==="object")return i.title.zh||i.title.en||i.pluginId||"";return i.pluginId||""}
function getDesc(i){return i.description||i.desc||""}
function sanitizeSvg(raw){try{var doc=new DOMParser().parseFromString(raw,"image/svg+xml"),svg=doc.querySelector("svg");if(!svg)return null;var ok=["viewBox","fill","stroke","stroke-width","stroke-linecap","stroke-linejoin","d","cx","cy","r","rx","ry","x","y","width","height","points","transform","class","style","fill-opacity","stroke-opacity"];function cl(el){for(var i=el.attributes.length-1;i>=0;i--){var a=el.attributes[i];if(ok.indexOf(a.name.toLowerCase())===-1||a.name.indexOf("on")===0)el.removeAttribute(a)}Array.from(el.children).forEach(cl)}cl(svg);return svg.outerHTML}catch(e){return null}}
var iconColors=["ic-c0","ic-c1","ic-c2","ic-c3","ic-c4","ic-c5","ic-c6","ic-c7"];
function getIconColor(idx){return iconColors[idx%iconColors.length]}
function iconHtml(item,cls,idx){var colorIdx=typeof idx==="number"?idx:0;var colorCls=getIconColor(colorIdx);if(item.icon&&typeof item.icon==="string"&&item.icon.trim().startsWith("<svg")){var c=sanitizeSvg(item.icon);if(c)return'<span class="'+cls+" "+colorCls+'">'+c+"</span>"}var t=getTitle(item),ch=t?t.charAt(0).toUpperCase():"?";var isFb=cls.indexOf("ic-fb")>=0;return'<span class="'+(isFb?"ic-fb "+colorCls:"p-icon-fb "+colorCls)+'">'+esc(ch)+"</span>"}
var toastTimer;function toast(msg){if(window.hana&&hana.toast&&typeof hana.toast.show==="function"){try{hana.toast.show(msg);return}catch(e){}}var el=document.getElementById("toast");if(!el)return;el.textContent=msg;el.classList.add("show");clearTimeout(toastTimer);toastTimer=setTimeout(function(){el.classList.remove("show")},2000)}
function saveCache(d){try{localStorage.setItem(CACHE_KEY,JSON.stringify(d))}catch(e){}}

function getLayout(){if(!state.layout)state.layout={folders:[],rootItems:[]};if(!Array.isArray(state.layout.folders))state.layout.folders=[];if(!Array.isArray(state.layout.rootItems))state.layout.rootItems=[];return state.layout}
function folderOf(pid){var L=getLayout();for(var i=0;i<L.folders.length;i++){if((L.folders[i].items||[]).indexOf(pid)>=0)return L.folders[i].id}return"root"}
function setFolder(pid,fid){var L=getLayout();L.rootItems=(L.rootItems||[]).filter(function(id){return id!==pid});L.folders.forEach(function(f){f.items=(f.items||[]).filter(function(id){return id!==pid})});if(fid==="root")L.rootItems.push(pid);else{var f=L.folders.find(function(x){return x.id===fid});if(f){if(!Array.isArray(f.items))f.items=[];f.items.push(pid)}}}

async function loadState(){try{var res=await fetch(STATE_URL,{credentials:"include"});if(!res.ok)return;var fresh=await res.json();if(!fresh.prefs)fresh.prefs={};if(!Array.isArray(fresh.prefs.hiddenTabs))fresh.prefs.hiddenTabs=[];if(!Array.isArray(fresh.prefs.hiddenWidgets))fresh.prefs.hiddenWidgets=[];saveCache(fresh);if(JSON.stringify(fresh)!==JSON.stringify(state)){state=fresh;render()}}catch(e){}}
async function saveLayout(){var res=await api(LAYOUT_URL,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(state.layout||{folders:[],rootItems:[]})});if(!res.ok)throw new Error("HTTP "+res.status);state.layout=await res.json();delete state.layout.ok;render()}
async function updatePrefs(p){var res=await api(PREFS_URL,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(p)});if(!res.ok)throw new Error("HTTP "+res.status);return res.json()}
function notifyRenderer(){try{parent.postMessage({source:"hana-plugin",type:"plugin_ui_changed"},"*")}catch(e){}}
function visitPlugin(pid){parent.postMessage({type:"navigate-tab",payload:{tab:"plugin:"+pid}},"*");toast("\u6b63\u5728\u6253\u5f00...")}

var toggleSeq=0;
async function toggleTab(pid,show){var seq=++toggleSeq,prev=state.prefs.hiddenTabs.slice();if(show)state.prefs.hiddenTabs=prev.filter(function(id){return id!==pid});else if(prev.indexOf(pid)<0)state.prefs.hiddenTabs=prev.concat([pid]);renderMgmt();try{await updatePrefs({hiddenTabs:state.prefs.hiddenTabs});if(seq!==toggleSeq)return;notifyRenderer();toast(show?"已置顶":"已收进")}catch(e){if(seq!==toggleSeq)return;state.prefs.hiddenTabs=prev;renderMgmt();toast("失败")}}
async function toggleWidget(pid,show){var seq=++toggleSeq,prev=state.prefs.hiddenWidgets.slice();if(show)state.prefs.hiddenWidgets=prev.filter(function(id){return id!==pid});else if(prev.indexOf(pid)<0)state.prefs.hiddenWidgets=prev.concat([pid]);renderMgmt();try{await updatePrefs({hiddenWidgets:state.prefs.hiddenWidgets});if(seq!==toggleSeq)return;notifyRenderer();toast(show?"\u5df2\u663e\u793a":"\u5df2\u9690\u85cf")}catch(e){if(seq!==toggleSeq)return;state.prefs.hiddenWidgets=prev;renderMgmt();toast("\u5931\u8d25")}}

/* ═══ Browse Mode ═══ */
function renderBrowse(){
  var el=document.getElementById("browse-list");if(!el)return;
  var pages=state.pages||[],ht=state.prefs.hiddenTabs||[],L=getLayout();
  // Only show hidden plugins in browse mode (they're in the drawer)
  var hiddenPages=pages.filter(function(p){return ht.indexOf(p.pluginId)>=0});

  // Group by folder
  var groups=[],inF={};
  L.folders.forEach(function(f){
    var items=(f.items||[]).map(function(id){return hiddenPages.find(function(p){return p.pluginId===id})}).filter(Boolean);
    if(items.length){groups.push({name:f.name,emoji:"\uD83D\uDCC1",items:items});items.forEach(function(p){inF[p.pluginId]=true})}
  });
  var ungrouped=hiddenPages.filter(function(p){return !inF[p.pluginId]});
  if(ungrouped.length)groups.unshift({name:"\u672a\u5206\u7c7b",emoji:"\uD83D\uDCCB",items:ungrouped});

  if(!groups.length){el.innerHTML='<div class="empty"><div class="icon">\uD83D\uDCE6</div>\u62bd\u5c49\u4e3a\u7a7a\uff0c\u70b9\u53f3\u4e0a\u89d2\u2699 \u7ba1\u7406\u63d2\u4ef6</div>';return}

  el.innerHTML=groups.map(function(g){
    return'<div class="folder-group"><div class="fg-header" data-toggle-group><span class="emoji">'+g.emoji+'</span><span class="name">'+esc(g.name)+'</span><span class="cnt">'+g.items.length+'</span><span class="arrow">\u25BC</span></div><div class="fg-body"><div class="pg">'+g.items.map(function(p,idx){
      var ic=iconHtml(p,"ic-fb",idx);var inner=ic.indexOf("ic-fb")>=0?ic:'<span class="ic">'+ic+"</span>";
      return'<div class="pc" data-pid="'+esc(p.pluginId)+'" title="'+esc(getTitle(p))+'">'+inner+'<span class="nm">'+esc(getTitle(p))+'</span></div>'
    }).join("")+'</div></div></div>'
  }).join("");

  // Update count in header
  var cnt=document.getElementById("drawer-total");if(cnt)cnt.textContent=hiddenPages.length;
}

/* ═══ Manage Mode ═══ */
function renderMgmt(){
  var vp=(state.pages||[]).filter(function(p){return(state.prefs.hiddenTabs||[]).indexOf(p.pluginId)<0});
  var vw=(state.widgets||[]).filter(function(w){return(state.prefs.hiddenWidgets||[]).indexOf(w.pluginId)<0});
  var el1=document.getElementById("stat-topbar"),el2=document.getElementById("stat-drawer"),el3=document.getElementById("stat-widget");
  if(el1)el1.textContent=vp.length;if(el2)el2.textContent=(state.pages||[]).length-vp.length;if(el3)el3.textContent=vw.length;
  renderFolders();renderThemePicker();
  renderList("pages-list",state.pages||[],state.prefs.hiddenTabs||[] ,"tab");
  renderList("widgets-list",state.widgets||[],state.prefs.hiddenWidgets||[] ,"widget");
}
function renderFolders(){
  var el=document.getElementById("folder-list");if(!el)return;var L=getLayout();
  if(!L.folders.length){el.innerHTML='<div class="fm-hint">\u8fd8\u6ca1\u6709\u6587\u4ef6\u5939\uff0c\u70b9\u53f3\u4e0a\u89d2 + \u521b\u5efa</div>';return}
  el.innerHTML=L.folders.map(function(f){return'<div class="fm-row" data-fid="'+esc(f.id)+'"><span class="emoji">\uD83D\uDCC1</span><input class="folder-rename" data-fid="'+esc(f.id)+'" value="'+esc(f.name)+'" title="\u5931\u7126\u4fdd\u5b58"><span class="cnt">'+(f.items||[]).length+'</span><button class="del" data-del-fid="'+esc(f.id)+'" title="\u5220\u9664">\u00D7</button></div>'}).join("");
}
function renderList(cid,items,hiddenList,type){
  var c=document.getElementById(cid);if(!c)return;
  if(!items.length){c.innerHTML='<div class="empty">\u6682\u65e0\u63d2\u4ef6</div>';return}
  var L=getLayout();
  c.innerHTML=items.map(function(item){
    var hid=hiddenList.indexOf(item.pluginId)>=0,t=getTitle(item),d=getDesc(item);
    return'<div class="pi'+(hid?" is-hidden":"")+'" data-pid="'+esc(item.pluginId)+'" data-search="'+esc((t+" "+d+" "+item.pluginId).toLowerCase())+'">'+iconHtml(item,"p-icon-fb")+'<div class="p-body"><div class="p-name">'+esc(t)+'</div>'+(d?'<div class="p-desc">'+esc(d)+'</div>':"")+'</div><div class="p-actions">'+(type==="tab"?'<select class="p-fsel" data-fsel="'+esc(item.pluginId)+'"><option value="root"'+(folderOf(item.pluginId)==="root"?' selected':"")+'>\u6839\u76ee\u5f55</option>'+L.folders.map(function(f){return'<option value="'+esc(f.id)+'"'+(folderOf(item.pluginId)===f.id?' selected':"")+'>'+esc(f.name)+'</option>'}).join("")+'</select>':"")+'<span class="p-status '+(hid?"off":"on")+'">'+(type==="tab"?(hid?"\u62bd\u5c49":"\u7f6e\u9876"):(hid?"\u9690\u85cf":"\u663e\u793a"))+'</span><label class="toggle"><input type="checkbox" '+(hid?"":"checked")+' data-toggle="'+esc(item.pluginId)+'" data-type="'+type+'"><span class="track"></span></label></div></div>'
  }).join("");
}

/* ═══ Themes ═══ */
var THEMES=[
  {id:"aurora",name:"\u6781\u5149",desc:"\u7eff\u84dd\u7d2b\u6e10\u53d8",bg:"linear-gradient(135deg,#ecfdf5 0%,#f0fdf4 30%,#e0f2fe 60%,#ede9fe 100%)",accent:"#10b981",accentHover:"#059669",accentSoft:"rgba(16,185,129,0.08)",glassBorder:"rgba(16,185,129,0.2)",glassCard:"rgba(255,255,255,0.45)",text:"#064e3b",textSec:"#3d4f4a",muted:"#6b7f77",icon0:"linear-gradient(135deg,#06b6d4,#3b82f6)",icon1:"linear-gradient(135deg,#8b5cf6,#a855f7)",icon2:"linear-gradient(135deg,#f59e0b,#f97316)",icon3:"linear-gradient(135deg,#10b981,#059669)",icon4:"linear-gradient(135deg,#ec4899,#f43f5e)",icon5:"linear-gradient(135deg,#6366f1,#818cf8)",icon6:"linear-gradient(135deg,#14b8a6,#2dd4bf)",icon7:"linear-gradient(135deg,#f472b6,#fb7185)"},
  {id:"sunset",name:"\u843d\u65e5",desc:"\u6696\u6a59\u91d1\u8272",bg:"linear-gradient(135deg,#fef3c7 0%,#fde68a 50%,#fbbf24 100%)",accent:"#d97706",accentHover:"#b45309",accentSoft:"rgba(217,119,6,0.08)",glassBorder:"rgba(217,119,6,0.25)",glassCard:"rgba(255,255,255,0.5)",text:"#78350f",textSec:"#92400e",muted:"#a16207",icon0:"linear-gradient(135deg,#f59e0b,#f97316)",icon1:"linear-gradient(135deg,#ef4444,#f87171)",icon2:"linear-gradient(135deg,#f97316,#fb923c)",icon3:"linear-gradient(135deg,#eab308,#facc15)",icon4:"linear-gradient(135deg,#dc2626,#ef4444)",icon5:"linear-gradient(135deg,#d97706,#f59e0b)",icon6:"linear-gradient(135deg,#ea580c,#f97316)",icon7:"linear-gradient(135deg,#c2410c,#ea580c)"},
  {id:"ocean",name:"\u6d77\u6d0b",desc:"\u6df1\u84dd\u6e05\u6f88",bg:"linear-gradient(135deg,#e0f2fe 0%,#bae6fd 50%,#7dd3fc 100%)",accent:"#0284c7",accentHover:"#0369a1",accentSoft:"rgba(2,132,199,0.08)",glassBorder:"rgba(2,132,199,0.25)",glassCard:"rgba(255,255,255,0.5)",text:"#0c4a6e",textSec:"#075985",muted:"#0369a1",icon0:"linear-gradient(135deg,#0ea5e9,#38bdf8)",icon1:"linear-gradient(135deg,#06b6d4,#22d3ee)",icon2:"linear-gradient(135deg,#0284c7,#0ea5e9)",icon3:"linear-gradient(135deg,#14b8a6,#2dd4bf)",icon4:"linear-gradient(135deg,#0891b2,#06b6d4)",icon5:"linear-gradient(135deg,#0369a1,#0284c7)",icon6:"linear-gradient(135deg,#0e7490,#06b6d4)",icon7:"linear-gradient(135deg,#155e75,#0e7490)"},
  {id:"sakura",name:"\u6a31\u82b1",desc:"\u7c89\u5ae9\u67d4\u548c",bg:"linear-gradient(135deg,#fce7f3 0%,#fbcfe8 50%,#f9a8d4 100%)",accent:"#db2777",accentHover:"#be185d",accentSoft:"rgba(219,39,119,0.08)",glassBorder:"rgba(219,39,119,0.2)",glassCard:"rgba(255,255,255,0.5)",text:"#831843",textSec:"#9d174d",muted:"#be185d",icon0:"linear-gradient(135deg,#ec4899,#f472b6)",icon1:"linear-gradient(135deg,#f43f5e,#fb7185)",icon2:"linear-gradient(135deg,#e11d48,#f43f5e)",icon3:"linear-gradient(135deg,#db2777,#ec4899)",icon4:"linear-gradient(135deg,#be185d,#db2777)",icon5:"linear-gradient(135deg,#9d174d,#be185d)",icon6:"linear-gradient(135deg,#f472b6,#f9a8d4)",icon7:"linear-gradient(135deg,#fb7185,#fda4af)"},
  {id:"forest",name:"\u68ee\u6797",desc:"\u6df1\u7eff\u81ea\u7136",bg:"linear-gradient(135deg,#ecfdf5 0%,#d1fae5 50%,#a7f3d0 100%)",accent:"#059669",accentHover:"#047857",accentSoft:"rgba(5,150,105,0.08)",glassBorder:"rgba(5,150,105,0.25)",glassCard:"rgba(255,255,255,0.45)",text:"#064e3b",textSec:"#065f46",muted:"#047857",icon0:"linear-gradient(135deg,#10b981,#34d399)",icon1:"linear-gradient(135deg,#059669,#10b981)",icon2:"linear-gradient(135deg,#047857,#059669)",icon3:"linear-gradient(135deg,#065f46,#047857)",icon4:"linear-gradient(135deg,#064e3b,#065f46)",icon5:"linear-gradient(135deg,#34d399,#6ee7b7)",icon6:"linear-gradient(135deg,#10b981,#a7f3d0)",icon7:"linear-gradient(135deg,#059669,#34d399)"},
  {id:"midnight",name:"\u5348\u591c",desc:"\u6697\u7a7a\u661f\u8f89",bg:"linear-gradient(135deg,#0f172a 0%,#1e1b4b 50%,#312e81 100%)",accent:"#818cf8",accentHover:"#6366f1",accentSoft:"rgba(129,140,248,0.12)",glassBorder:"rgba(148,163,184,0.15)",glassCard:"rgba(30,41,59,0.5)",text:"#e2e8f0",textSec:"#cbd5e1",muted:"#94a3b8",icon0:"linear-gradient(135deg,#6366f1,#818cf8)",icon1:"linear-gradient(135deg,#8b5cf6,#a78bfa)",icon2:"linear-gradient(135deg,#06b6d4,#22d3ee)",icon3:"linear-gradient(135deg,#14b8a6,#2dd4bf)",icon4:"linear-gradient(135deg,#f472b6,#f9a8d4)",icon5:"linear-gradient(135deg,#38bdf8,#7dd3fc)",icon6:"linear-gradient(135deg,#a78bfa,#c4b5fd)",icon7:"linear-gradient(135deg,#818cf8,#a5b4fc)"}
];
var THEME_KEY="plugin-hub:theme";
function getTheme(){var id;try{id=localStorage.getItem(THEME_KEY)}catch(e){}return THEMES.find(function(t){return t.id===id})||THEMES[0]}
function setTheme(id){try{localStorage.setItem(THEME_KEY,id)}catch(e){}applyTheme(getTheme())}
function applyTheme(th){var r=document.documentElement.style;r.setProperty("--glass-bg",th.bg);r.setProperty("--accent",th.accent);r.setProperty("--accent-hover",th.accentHover);r.setProperty("--accent-soft",th.accentSoft);r.setProperty("--glass-border",th.glassBorder);r.setProperty("--glass-card",th.glassCard);r.setProperty("--text",th.text);r.setProperty("--text-secondary",th.textSec);r.setProperty("--muted",th.muted);r.setProperty("--ic0",th.icon0);r.setProperty("--ic1",th.icon1);r.setProperty("--ic2",th.icon2);r.setProperty("--ic3",th.icon3);r.setProperty("--ic4",th.icon4);r.setProperty("--ic5",th.icon5);r.setProperty("--ic6",th.icon6);r.setProperty("--ic7",th.icon7)}
function renderThemePicker(){var el=document.getElementById("theme-list");if(!el)return;var cur=getTheme();el.innerHTML=THEMES.map(function(th){var active=th.id===cur.id;return'<div class="theme-card'+(active?" active":"")+'" data-theme-id="'+th.id+'"><div class="theme-preview" style="background:'+th.bg+'"><div class="theme-dot" style="background:'+th.icon0+'"></div><div class="theme-dot" style="background:'+th.icon1+'"></div><div class="theme-dot" style="background:'+th.icon2+'"></div><div class="theme-dot" style="background:'+th.icon3+'"></div></div><div class="theme-name">'+esc(th.name)+'</div><div class="theme-desc">'+esc(th.desc)+'</div></div>'}).join("")}

/* ═══ Mode Switch ═══ */
function switchMode(m){
  mode=m;
  var browse=document.getElementById("browse-view"),mgmt=document.getElementById("mgmt-view");
  if(m==="manage"){browse.classList.add("hidden");mgmt.classList.add("active")}
  else{browse.classList.remove("hidden");mgmt.classList.remove("active")}
}

/* ═══ Search ═══ */
function applySearch(){var q=(document.getElementById("search").value||"").trim().toLowerCase();document.querySelectorAll(".pi").forEach(function(el){el.style.display=!q||(el.dataset.search||"").indexOf(q)>=0?"":"none"})}

/* ═══ Render ═══ */
function render(){renderBrowse();renderMgmt()}

/* ═══ Events ═══ */
document.addEventListener("change",function(e){
  var t=e.target;
  if(t.matches('[data-toggle]')){var pid=t.dataset.toggle,type=t.dataset.type;if(type==="tab")toggleTab(pid,t.checked);else toggleWidget(pid,t.checked);return}
  if(t.matches('[data-fsel]')){var pid=t.dataset.fsel,fid=t.value||"root",prevL={folders:getLayout().folders.map(function(f){return{id:f.id,name:f.name,items:(f.items||[]).slice()}}),rootItems:(getLayout().rootItems||[]).slice()},prevHT=state.prefs.hiddenTabs.slice();setFolder(pid,fid);var needHide=state.prefs.hiddenTabs.indexOf(pid)<0;if(needHide)state.prefs.hiddenTabs.push(pid);render();(async function(){try{await saveLayout();if(needHide)await updatePrefs({hiddenTabs:state.prefs.hiddenTabs});toast("\u5df2\u79fb\u52a8")}catch(err){state.layout.folders=prevL.folders;state.layout.rootItems=prevL.rootItems;state.prefs.hiddenTabs=prevHT;render();toast("\u5931\u8d25")}})();return}
});

document.addEventListener("click",function(e){
  var t=e.target;
  // Mode switch
  if(t.closest("#manage-btn")){switchMode("manage");return}
  if(t.closest("#back-btn")){switchMode("browse");renderBrowse();return}
  // Browse: click plugin card -> navigate
  var card=t.closest(".pc[data-pid]");if(card){visitPlugin(card.dataset.pid);return}
  // Browse: toggle folder group
  var gh=t.closest("[data-toggle-group]");if(gh){var g=gh.closest(".folder-group");if(g)g.classList.toggle("collapsed");return}
  // Manage: quick actions
  if(t.closest("#collect-all")){var cp=state.prefs.hiddenTabs.slice();state.prefs.hiddenTabs=(state.pages||[]).map(function(p){return p.pluginId});render();updatePrefs({hiddenTabs:state.prefs.hiddenTabs}).then(function(){notifyRenderer();toast("\u5df2\u5168\u90e8\u6536\u8fdb")}).catch(function(e){state.prefs.hiddenTabs=cp;render();toast("\u5931\u8d25")});return}
  if(t.closest("#restore-all")){var rp=state.prefs.hiddenTabs.slice();state.prefs.hiddenTabs=[];render();updatePrefs({hiddenTabs:[]}).then(function(){notifyRenderer();toast("\u5df2\u5168\u90e8\u7f6e\u9876")}).catch(function(e){state.prefs.hiddenTabs=rp;render();toast("\u5931\u8d25")});return}
  // Manage: folder section toggle
  if(t.closest("#fm-head")&&!t.closest("#new-folder")){var fp=document.getElementById("fm-panel");if(fp)fp.classList.toggle("collapsed");return}
  // Manage: new folder
  if(t.closest("#new-folder")){var L=getLayout(),n=L.folders.length+1;L.folders.push({id:"f_"+Date.now().toString(36),name:"\u65b0\u6587\u4ef6\u5939"+n,items:[]});render();(async function(){try{await saveLayout();toast("\u5df2\u521b\u5efa")}catch(e){toast("\u5931\u8d25")}})();return}
  // Manage: delete folder
  var del=t.closest("[data-del-fid]");if(del){e.stopPropagation();var fid=del.dataset.delFid,L=getLayout(),folder=L.folders.find(function(f){return f.id===fid});if(!folder)return;L.rootItems=(L.rootItems||[]).concat(folder.items||[]);L.folders=L.folders.filter(function(f){return f.id!==fid});render();(async function(){try{await saveLayout();toast("\u5df2\u5220\u9664")}catch(e){toast("\u5931\u8d25")}})();return}
  // Manage: visit plugin from list
  var info=t.closest(".p-body");if(info){var pi=info.closest(".pi");if(pi)visitPlugin(pi.dataset.pid);return}
  // Theme button toggle popup
  if(t.closest("#theme-btn")){var pop=document.getElementById("theme-pop"),btn=document.getElementById("theme-btn");if(pop&&btn){var isOpen=pop.classList.contains("open");pop.classList.toggle("open");btn.classList.toggle("active",!isOpen)}return}
  // Theme card click
  var tc=t.closest(".theme-card[data-theme-id]");if(tc){setTheme(tc.dataset.themeId);renderThemePicker();toast("\u5df2\u5207\u6362\u4e3b\u9898");return}
  // Hide overflow button
  if(t.closest("#hide-ov-btn")){toast("\u6b63\u5728\u5b89\u88c5\u8865\u4e01...");api(C.layoutUrl,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({_patchOverflow:true})}).then(function(r){return r.json()}).then(function(d){if(d.ok||d._patched)toast("\u8865\u4e01\u5df2\u66f4\u65b0\uff0c\u91cd\u542f Hana \u540e \u25bc \u6d88\u5931");else toast("\u5931\u8d25: "+(d.error||JSON.stringify(d)))}).catch(function(e){toast("\u8bf7\u6c42\u5931\u8d25")});return}
});

// Click outside theme popup to close
document.addEventListener("click",function(e){var pop=document.getElementById("theme-pop");var btn=document.getElementById("theme-btn");if(pop&&pop.classList.contains("open")&&!pop.contains(e.target)&&!btn.contains(e.target)){pop.classList.remove("open");btn.classList.remove("active")}});

document.addEventListener("blur",function(e){if(!e.target.matches(".folder-rename"))return;var fid=e.target.dataset.fid,L=getLayout(),f=L.folders.find(function(x){return x.id===fid});if(!f)return;var v=(e.target.value||"").trim()||"\u672a\u547d\u540d";if(f.name===v)return;f.name=v;render();(async function(){try{await saveLayout();toast("\u5df2\u91cd\u547d\u540d")}catch(e){toast("\u5931\u8d25")}})()},true);
document.addEventListener("keydown",function(e){if(e.target.matches(".folder-rename")&&e.key==="Enter")e.target.blur()});
document.getElementById("search").addEventListener("input",function(){var q=(this.value||"").trim().toLowerCase();if(mode==="manage"){applySearch()}else{document.querySelectorAll(".pc").forEach(function(el){var nm=el.querySelector(".nm");var txt=nm?nm.textContent.toLowerCase():"";el.style.display=!q||txt.indexOf(q)>=0?"":"none"})}});

(function(){getLayout();applyTheme(getTheme());renderThemePicker();render()})();
// Add hide-overflow button to management bar
(function(){var bar=document.querySelector("#mgmt-view .mgmt-bar");if(bar&&!document.getElementById("hide-ov-btn")){var btn=document.createElement("button");btn.id="hide-ov-btn";btn.className="hide-ov-btn";btn.textContent="\u9690\u85cf\u25bc";btn.title="\u91cd\u6253\u8865\u4e01\u540e\u91cd\u542f\uff0c\u9876\u680f\u25bc\u6309\u94ae\u6c38\u4e45\u6d88\u5931";bar.appendChild(btn)}})();
loadState();
})();
