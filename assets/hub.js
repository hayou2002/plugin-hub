(function(){
var C=window.__PLUGIN_HUB__;
if(!C)return;
var STATE_URL=C.stateUrl,PREFS_URL=C.prefsUrl,LAYOUT_URL=C.layoutUrl,PATCH_INSTALL_URL=C.patchInstallUrl,PATCH_UNINSTALL_URL=C.patchUninstallUrl,CACHE_KEY="plugin-hub:state-cache",state=C.state||{pages:[],widgets:[],prefs:{hiddenTabs:[],hiddenWidgets:[],tabOrder:[]},runtime:{},layout:{folders:[],rootItems:[]}};
if(!state.prefs)state.prefs={hiddenTabs:[],hiddenWidgets:[],tabOrder:[]};
if(!Array.isArray(state.prefs.hiddenTabs))state.prefs.hiddenTabs=[];
if(!Array.isArray(state.prefs.hiddenWidgets))state.prefs.hiddenWidgets=[];
if(!state.layout)state.layout={folders:[],rootItems:[]};
if(!state.runtime)state.runtime={};

function escT(s){return String(s||"").replace(/[&<>"']/g,function(c){return({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]})}
function escA(s){return escT(s)}

function api(p,init){if(window.hana&&hana.api&&typeof hana.api.fetch==="function")return hana.api.fetch(p,init);return fetch(p,init)}

function getTitle(item){if(typeof item.title==="string")return item.title;if(item.title&&typeof item.title==="object")return item.title.zh||item.title.en||item.pluginId||"";return item.pluginId||""}
function getDesc(item){return item.description||item.desc||""}

function sanitizeSvg(raw){try{var doc=new DOMParser().parseFromString(raw,"image/svg+xml"),svg=doc.querySelector("svg");if(!svg)return null;var ALLOWED=["viewBox","fill","stroke","stroke-width","stroke-linecap","stroke-linejoin","d","cx","cy","r","rx","ry","x","y","width","height","points","transform","class","style","fill-opacity","stroke-opacity","stroke-dasharray"];function clean(el){for(var i=el.attributes.length-1;i>=0;i--){var a=el.attributes[i],n=a.name.toLowerCase();if(ALLOWED.indexOf(n)===-1||n.indexOf("on")===0)el.removeAttribute(n)}Array.from(el.children).forEach(clean)}clean(svg);return svg.outerHTML}catch(e){return null}}

function getIconHtml(item){if(item.icon&&typeof item.icon==="string"&&item.icon.trim().startsWith("<svg")){var c=sanitizeSvg(item.icon);if(c)return'<span class="item-icon">'+c+"</span>"}var t=getTitle(item),ch=t?t.charAt(0).toUpperCase():"?";return'<span class="item-icon-fallback">'+escT(ch)+"</span>"}

function saveCache(d){try{localStorage.setItem(CACHE_KEY,JSON.stringify(d))}catch(e){}}

async function loadState(){try{var res=await fetch(STATE_URL,{credentials:"include"});if(!res.ok)return;var fresh=await res.json();if(!fresh.prefs)fresh.prefs={};if(!Array.isArray(fresh.prefs.hiddenTabs))fresh.prefs.hiddenTabs=[];if(!Array.isArray(fresh.prefs.hiddenWidgets))fresh.prefs.hiddenWidgets=[];saveCache(fresh);if(JSON.stringify(fresh)!==JSON.stringify(state)){state=fresh;getLayout();updateRuntimeNotice();render()}}catch(e){}}

async function saveLayout(){var res=await api(LAYOUT_URL,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(state.layout||{folders:[],rootItems:[]})});if(!res.ok)throw new Error("HTTP "+res.status);state.layout=await res.json();delete state.layout.ok;try{parent.postMessage({type:"plugin-hub:drawer-layout",payload:state.layout},location.origin)}catch(e){}}

async function updatePrefs(prefs){var res=await api(PREFS_URL,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(prefs)});if(!res.ok)throw new Error("HTTP "+res.status);return res.json()}

function patchItemDom(pluginId,visible,type){var item=document.querySelector('.item[data-plugin-id="'+escA(pluginId)+'"]');if(!item)return;if(visible)item.classList.remove("is-hidden");else item.classList.add("is-hidden");var cb=item.querySelector("input[type=checkbox]");if(cb)cb.checked=visible;var st=item.querySelector(".item-status");if(st)st.textContent=type==="tab"?(visible?"顶栏":"下拉"):(visible?"侧栏":"隐藏")}

function updateStats(){var vp=(state.pages||[]).filter(function(p){return!(state.prefs.hiddenTabs||[]).includes(p.pluginId)}),vw=(state.widgets||[]).filter(function(w){return!(state.prefs.hiddenWidgets||[]).includes(w.pluginId)});var sp=document.getElementById("stat-pages"),sw=document.getElementById("stat-widgets");if(sp)sp.textContent=vp.length+"/"+(state.pages||[]).length;if(sw)sw.textContent=vw.length+"/"+(state.widgets||[]).length}

var toggleSeq=0;
async function toggleTab(pluginId,shouldShow){var seq=++toggleSeq,prev=state.prefs.hiddenTabs.slice();if(shouldShow)state.prefs.hiddenTabs=prev.filter(function(id){return id!==pluginId});else{if(!prev.includes(pluginId))state.prefs.hiddenTabs=prev.concat([pluginId])}patchItemDom(pluginId,shouldShow,"tab");updateStats();try{await updatePrefs({hiddenTabs:state.prefs.hiddenTabs});if(seq!==toggleSeq)return;notifyRenderer();showToast(shouldShow?"已设为顶栏置顶":"已收进抽屉")}catch(e){if(seq!==toggleSeq)return;state.prefs.hiddenTabs=prev;patchItemDom(pluginId,!shouldShow,"tab");updateStats();showToast("操作失败: "+e.message)}}

async function toggleWidget(pluginId,shouldShow){var seq=++toggleSeq,prev=state.prefs.hiddenWidgets.slice();if(shouldShow)state.prefs.hiddenWidgets=prev.filter(function(id){return id!==pluginId});else{if(!prev.includes(pluginId))state.prefs.hiddenWidgets=prev.concat([pluginId])}patchItemDom(pluginId,shouldShow,"widget");updateStats();try{await updatePrefs({hiddenWidgets:state.prefs.hiddenWidgets});if(seq!==toggleSeq)return;notifyRenderer();showToast(shouldShow?"已显示侧栏面板":"已隐藏侧栏面板")}catch(e){if(seq!==toggleSeq)return;state.prefs.hiddenWidgets=prev;patchItemDom(pluginId,!shouldShow,"widget");updateStats();showToast("操作失败: "+e.message)}}

async function visitPlugin(pluginId){parent.postMessage({type:"navigate-tab",payload:{tab:"plugin:"+pluginId}},location.origin);showToast("正在打开...")}
function notifyRenderer(){parent.postMessage({type:"hana:plugin-ui-refresh"},location.origin)}

var toastTimer;
function showToast(msg){if(window.hana&&hana.toast&&typeof hana.toast.show==="function"){try{hana.toast.show(msg);return}catch(e){}}var el=document.getElementById("toast");if(!el)return;el.textContent=msg;el.classList.add("show");clearTimeout(toastTimer);toastTimer=setTimeout(function(){el.classList.remove("show")},2000)}

function getLayout(){if(!state.layout)state.layout={folders:[],rootItems:[]};if(!Array.isArray(state.layout.folders))state.layout.folders=[];if(!Array.isArray(state.layout.rootItems))state.layout.rootItems=[];return state.layout}

function folderOf(pluginId){var layout=getLayout();for(var i=0;i<layout.folders.length;i++){if((layout.folders[i].items||[]).includes(pluginId))return layout.folders[i].id}return"root"}

function setPluginFolder(pluginId,folderId){var layout=getLayout();layout.rootItems=(layout.rootItems||[]).filter(function(id){return id!==pluginId});layout.folders.forEach(function(f){f.items=(f.items||[]).filter(function(id){return id!==pluginId})});if(folderId==="root")layout.rootItems.push(pluginId);else{var f=layout.folders.find(function(x){return x.id===folderId});if(f){if(!Array.isArray(f.items))f.items=[];f.items.push(pluginId)}}}

function updateRuntimeNotice(){var el=document.getElementById("runtime-notice"),st=document.getElementById("patch-status"),r=state.runtime||{};if(el){if(r.inconsistent){el.style.borderColor="#c5372a";el.style.color="#c5372a";el.textContent="\u26A0 状态不一致：asar 与记录不符。建议卸载补丁后重新安装。"}else{el.style.borderColor="";el.style.color="";el.textContent="默认安全模式：插件不会自动修改 Hana；只有点击\u201C安装增强补丁\u201D才会备份并修改 app.asar。"}}if(!st)return;if(r.inconsistent)st.textContent="\u26A0 补丁状态异常（记录与实际不一致），请卸载后重新安装。";else if(r.error)st.textContent="上次安装失败："+r.error;else if(r.installed)st.textContent=r.restartRequired?"已安装增强补丁，重启 Hana 后生效。":"增强补丁已安装。";else if(r.restoredAt)st.textContent="已于 "+r.restoredAt.slice(0,10)+" 恢复备份，重启 Hana 后生效。";else if(r.backup)st.textContent="增强补丁未安装，存在可用备份。";else st.textContent="增强补丁未安装。"}

function render(){var pages=state.pages||[],widgets=state.widgets||[],ht=state.prefs.hiddenTabs||[],hw=state.prefs.hiddenWidgets||[];updateStats();renderFolders();renderList("pages-list",pages,ht,"tab");renderList("widgets-list",widgets,hw,"widget");applySearch()}

function renderFolders(){var layout=getLayout(),chips=['<span class="folder-chip root">根目录 / 未分类</span>'];layout.folders.forEach(function(f){chips.push('<span class="folder-chip" data-folder-id="'+escA(f.id)+'"><span>\u{1F4C2}</span><input class="folder-name-input" data-folder-id="'+escA(f.id)+'" value="'+escA(f.name)+'" title="改名后失焦保存"><button class="folder-delete" data-folder-id="'+escA(f.id)+'" title="删除文件夹" type="button">\u00D7</button></span>')});document.getElementById("folder-chips").innerHTML=chips.join("")}

function renderFolderSelect(pluginId){var layout=getLayout(),cur=folderOf(pluginId),h='<select class="folder-select" data-plugin-id="'+escA(pluginId)+'">';h+='<option value="root"'+(cur==="root"?' selected':"")+'>根目录</option>';layout.folders.forEach(function(f){h+='<option value="'+escA(f.id)+'"'+(cur===f.id?' selected':"")+'>'+escT(f.name)+'</option>'});h+='</select>';return h}

function renderList(cid,items,hiddenList,type){var c=document.getElementById(cid);if(!items.length){c.innerHTML='<div class="msg">暂无插件</div>';return}c.innerHTML=items.map(function(item){var isHidden=hiddenList.includes(item.pluginId),title=getTitle(item),desc=getDesc(item),icon=getIconHtml(item);return'<div class="item'+(isHidden?" is-hidden":"")+'" data-plugin-id="'+escA(item.pluginId)+'" data-search="'+escA((title+" "+desc+" "+item.pluginId).toLowerCase())+'">'+icon+'<div class="item-info"><div class="item-name">'+escT(title)+'</div><div class="item-desc">'+escT(desc)+'</div></div>'+(type==="tab"?renderFolderSelect(item.pluginId):"")+'<span class="item-status">'+(type==="tab"?(isHidden?"下拉":"顶栏"):(isHidden?"隐藏":"侧栏"))+'</span><label class="switch"><input type="checkbox" '+(isHidden?"":"checked")+' data-plugin-id="'+escA(item.pluginId)+'" data-type="'+type+'"><span class="slider"></span></label></div>'}).join("")}

function applySearch(){var q=(document.getElementById("search").value||"").trim().toLowerCase();document.querySelectorAll(".item").forEach(function(el){el.style.display=!q||(el.dataset.search||"").indexOf(q)>=0?"":"none"})}

document.addEventListener("change",async function(e){if(e.target.matches(".folder-select")){var pid=e.target.dataset.pluginId,fid=e.target.value||"root",prevHT=state.prefs.hiddenTabs.slice(),prevLayout={folders:getLayout().folders.map(function(f){return{id:f.id,name:f.name,items:(f.items||[]).slice()}}),rootItems:(getLayout().rootItems||[]).slice()};setPluginFolder(pid,fid);var needTopbarRefresh=!state.prefs.hiddenTabs.includes(pid);if(needTopbarRefresh)state.prefs.hiddenTabs.push(pid);render();try{await saveLayout();if(needTopbarRefresh)await updatePrefs({hiddenTabs:state.prefs.hiddenTabs});showToast("已移动到"+(fid==="root"?"根目录":"文件夹"))}catch(err){state.layout.folders=prevLayout.folders;state.layout.rootItems=prevLayout.rootItems;state.prefs.hiddenTabs=prevHT;render();showToast("移动失败: "+err.message)}return}if(e.target.matches(".switch input[type=checkbox]")){var pid=e.target.dataset.pluginId,type=e.target.dataset.type,shouldShow=e.target.checked;if(type==="tab")toggleTab(pid,shouldShow);else toggleWidget(pid,shouldShow)}});

document.addEventListener("click",function(e){var info=e.target.closest(".item-info");if(!info)return;var item=info.closest(".item");if(!item)return;visitPlugin(item.dataset.pluginId)});
document.getElementById("search").addEventListener("input",applySearch);

async function callPatchApi(url,sm){showToast("正在处理增强补丁，请稍候...");var res=await api(url,{method:"POST"});var data=await res.json().catch(function(){return{}});if(!res.ok||data.ok===false)throw new Error(data.error||("HTTP "+res.status));state.runtime=data;updateRuntimeNotice();showToast(sm)}

document.getElementById("patch-install").addEventListener("click",async function(){try{await callPatchApi(PATCH_INSTALL_URL,"增强补丁已安装，请重启 Hana")}catch(e){showToast("安装失败: "+e.message)}});
document.getElementById("patch-uninstall").addEventListener("click",async function(){try{await callPatchApi(PATCH_UNINSTALL_URL,"增强补丁已卸载，请重启 Hana")}catch(e){showToast("卸载失败: "+e.message)}});
document.getElementById("new-folder").addEventListener("click",async function(){var layout=getLayout(),n=layout.folders.length+1;layout.folders.push({id:"f_"+Date.now().toString(36),name:"新文件夹"+n,items:[]});render();try{await saveLayout();showToast("已创建文件夹")}catch(e){showToast("创建失败: "+e.message)}});

document.addEventListener("blur",async function(e){if(!e.target.matches(".folder-name-input"))return;var fid=e.target.dataset.folderId,layout=getLayout(),folder=layout.folders.find(function(f){return f.id===fid});if(!folder)return;var next=(e.target.value||"").trim()||"未命名";if(folder.name===next)return;folder.name=next;render();try{await saveLayout();showToast("已重命名文件夹")}catch(err){showToast("保存失败: "+err.message)}},true);

document.addEventListener("keydown",function(e){if(e.target.matches(".folder-name-input")&&e.key==="Enter")e.target.blur()});

document.addEventListener("click",async function(e){var del=e.target.closest(".folder-delete[data-folder-id]");if(!del)return;e.stopPropagation();var fid=del.dataset.folderId,layout=getLayout(),folder=layout.folders.find(function(f){return f.id===fid});if(!folder)return;layout.rootItems=(layout.rootItems||[]).concat(folder.items||[]);layout.folders=layout.folders.filter(function(f){return f.id!==fid});render();try{await saveLayout();showToast("已删除文件夹，内部插件已移到根目录")}catch(err){showToast("删除失败: "+err.message)}});

document.getElementById("collect-all").addEventListener("click",async function(){var prev=state.prefs.hiddenTabs.slice();state.prefs.hiddenTabs=(state.pages||[]).map(function(p){return p.pluginId});render();try{await updatePrefs({hiddenTabs:state.prefs.hiddenTabs});notifyRenderer();showToast("已全部收进抽屉")}catch(e){state.prefs.hiddenTabs=prev;render();showToast("操作失败: "+e.message)}});

document.getElementById("restore-all").addEventListener("click",async function(){var prev=state.prefs.hiddenTabs.slice();state.prefs.hiddenTabs=[];render();try{await updatePrefs({hiddenTabs:[]});notifyRenderer();showToast("已全部设为顶栏置顶")}catch(e){state.prefs.hiddenTabs=prev;render();showToast("操作失败: "+e.message)}});

// init
(function initView(){getLayout();updateRuntimeNotice();render()})();
loadState();
})();
