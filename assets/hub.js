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
async function toggleTab(pluginId,shouldShow){var seq=++toggleSeq,prev=state.prefs.hiddenTabs.slice();if(shouldShow)state.prefs.hiddenTabs=prev.filter(function(id){return id!==pluginId});else{if(!prev.includes(pluginId))state.prefs.hiddenTabs=prev.concat([pluginId])}patchItemDom(pluginId,shouldShow,"tab");updateStats();try{await updatePrefs({hiddenTabs:state.prefs.hiddenTabs});if(seq!==toggleSeq)return;notifyRenderer();showToast(shouldShow?"已涓洪《鏍忕疆椤?:"已敹杩涙娊灞?)}catch(e){if(seq!==toggleSeq)return;state.prefs.hiddenTabs=prev;patchItemDom(pluginId,!shouldShow,"tab");updateStats();showToast("操作失败: "+e.message)}}

async function toggleWidget(pluginId,shouldShow){var seq=++toggleSeq,prev=state.prefs.hiddenWidgets.slice();if(shouldShow)state.prefs.hiddenWidgets=prev.filter(function(id){return id!==pluginId});else{if(!prev.includes(pluginId))state.prefs.hiddenWidgets=prev.concat([pluginId])}patchItemDom(pluginId,shouldShow,"widget");updateStats();try{await updatePrefs({hiddenWidgets:state.prefs.hiddenWidgets});if(seq!==toggleSeq)return;notifyRenderer();showToast(shouldShow?"已樉绀轰晶鏍忛潰鏉?:"宸查殣钘忎晶鏍忛潰鏉?)}catch(e){if(seq!==toggleSeq)return;state.prefs.hiddenWidgets=prev;patchItemDom(pluginId,!shouldShow,"widget");updateStats();showToast("操作失败: "+e.message)}}

async function visitPlugin(pluginId){parent.postMessage({type:"navigate-tab",payload:{tab:"plugin:"+pluginId}},location.origin);showToast("姝ｅ湪鎵撳紑...")}
function notifyRenderer(){parent.postMessage({type:"hana:plugin-ui-refresh"},location.origin)}

var toastTimer;
function showToast(msg){if(window.hana&&hana.toast&&typeof hana.toast.show==="function"){try{hana.toast.show(msg);return}catch(e){}}var el=document.getElementById("toast");if(!el)return;el.textContent=msg;el.classList.add("show");clearTimeout(toastTimer);toastTimer=setTimeout(function(){el.classList.remove("show")},2000)}

function getLayout(){if(!state.layout)state.layout={folders:[],rootItems:[]};if(!Array.isArray(state.layout.folders))state.layout.folders=[];if(!Array.isArray(state.layout.rootItems))state.layout.rootItems=[];return state.layout}

function folderOf(pluginId){var layout=getLayout();for(var i=0;i<layout.folders.length;i++){if((layout.folders[i].items||[]).includes(pluginId))return layout.folders[i].id}return"root"}

function setPluginFolder(pluginId,folderId){var layout=getLayout();layout.rootItems=(layout.rootItems||[]).filter(function(id){return id!==pluginId});layout.folders.forEach(function(f){f.items=(f.items||[]).filter(function(id){return id!==pluginId})});if(folderId==="root")layout.rootItems.push(pluginId);else{var f=layout.folders.find(function(x){return x.id===folderId});if(f){if(!Array.isArray(f.items))f.items=[];f.items.push(pluginId)}}}

function updateRuntimeNotice(){var el=document.getElementById("runtime-notice"),st=document.getElementById("patch-status"),r=state.runtime||{};if(el){if(r.inconsistent){el.style.borderColor="#c5372a";el.style.color="#c5372a";el.textContent="\u26A0 鐘舵€佷笉涓€鑷达細asar 涓庤褰曚笉绗︺€傚缓璁嵏杞借ˉ涓佸悗閲嶆柊安装銆?}else{el.style.borderColor="";el.style.color="";el.textContent="榛樿瀹夊叏妯″紡锛氭彃浠朵笉浼氳嚜鍔ㄤ慨鏀?Hana锛涘彧鏈夌偣鍑籠u201C安装澧炲己琛ヤ竵\u201D鎵嶄細澶囦唤骞朵慨鏀?app.asar銆?}}if(!st)return;if(r.inconsistent)st.textContent="\u26A0 琛ヤ竵鐘舵€佸紓甯革紙璁板綍涓庡疄闄呬笉涓€鑷达級锛岃鍗歌浇鍚庨噸鏂板畨瑁呫€?;else if(r.error)st.textContent="涓婃安装澶辫触锛?+r.error;else if(r.installed)st.textContent=r.restartRequired?"已畨瑁呭寮鸿ˉ涓侊紝閲嶅惎 Hana 鍚庣敓鏁堛€?:"澧炲己琛ヤ竵已畨瑁呫€?;else if(r.restoredAt)st.textContent="宸蹭簬 "+r.restoredAt.slice(0,10)+" 鎭㈠澶囦唤锛岄噸鍚?Hana 鍚庣敓鏁堛€?;else if(r.backup)st.textContent="澧炲己琛ヤ竵鏈畨瑁咃紝瀛樺湪鍙敤澶囦唤銆?;else st.textContent="澧炲己琛ヤ竵鏈畨瑁呫€?}

function render(){var pages=state.pages||[],widgets=state.widgets||[],ht=state.prefs.hiddenTabs||[],hw=state.prefs.hiddenWidgets||[];updateStats();renderFolders();renderList("pages-list",pages,ht,"tab");renderList("widgets-list",widgets,hw,"widget");applySearch()}

function renderFolders(){var layout=getLayout(),chips=['<span class="folder-chip root">鏍圭洰褰?/ 鏈垎绫?/span>'];layout.folders.forEach(function(f){chips.push('<span class="folder-chip" data-folder-id="'+escA(f.id)+'"><span>\u{1F4C2}</span><input class="folder-name-input" data-folder-id="'+escA(f.id)+'" value="'+escA(f.name)+'" title="鏀瑰悕鍚庡け鐒︿繚瀛?><button class="folder-delete" data-folder-id="'+escA(f.id)+'" title="鍒犻櫎鏂囦欢澶? type="button">\u00D7</button></span>')});document.getElementById("folder-chips").innerHTML=chips.join("")}

function renderFolderSelect(pluginId){var layout=getLayout(),cur=folderOf(pluginId),h='<select class="folder-select" data-plugin-id="'+escA(pluginId)+'">';h+='<option value="root"'+(cur==="root"?' selected':"")+'>鏍圭洰褰?/option>';layout.folders.forEach(function(f){h+='<option value="'+escA(f.id)+'"'+(cur===f.id?' selected':"")+'>'+escT(f.name)+'</option>'});h+='</select>';return h}

function renderList(cid,items,hiddenList,type){var c=document.getElementById(cid);if(!items.length){c.innerHTML='<div class="msg">暂无插件</div>';return}c.innerHTML=items.map(function(item){var isHidden=hiddenList.includes(item.pluginId),title=getTitle(item),desc=getDesc(item),icon=getIconHtml(item);return'<div class="item'+(isHidden?" is-hidden":"")+'" data-plugin-id="'+escA(item.pluginId)+'" data-search="'+escA((title+" "+desc+" "+item.pluginId).toLowerCase())+'">'+icon+'<div class="item-info"><div class="item-name">'+escT(title)+'</div><div class="item-desc">'+escT(desc)+'</div></div>'+(type==="tab"?renderFolderSelect(item.pluginId):"")+'<span class="item-status">'+(type==="tab"?(isHidden?"下拉":"顶栏"):(isHidden?"隐藏":"侧栏"))+'</span><label class="switch"><input type="checkbox" '+(isHidden?"":"checked")+' data-plugin-id="'+escA(item.pluginId)+'" data-type="'+type+'"><span class="slider"></span></label></div>'}).join("")}

function applySearch(){var q=(document.getElementById("search").value||"").trim().toLowerCase();document.querySelectorAll(".item").forEach(function(el){el.style.display=!q||(el.dataset.search||"").indexOf(q)>=0?"":"none"})}

document.addEventListener("change",async function(e){if(e.target.matches(".folder-select")){var pid=e.target.dataset.pluginId,fid=e.target.value||"root",prevHT=state.prefs.hiddenTabs.slice(),prevLayout={folders:getLayout().folders.map(function(f){return{id:f.id,name:f.name,items:(f.items||[]).slice()}}),rootItems:(getLayout().rootItems||[]).slice()};setPluginFolder(pid,fid);var needTopbarRefresh=!state.prefs.hiddenTabs.includes(pid);if(needTopbarRefresh)state.prefs.hiddenTabs.push(pid);render();try{await saveLayout();if(needTopbarRefresh)await updatePrefs({hiddenTabs:state.prefs.hiddenTabs});showToast("宸茬Щ鍔ㄥ埌"+(fid==="root"?"鏍圭洰褰?:"鏂囦欢澶?))}catch(err){state.layout.folders=prevLayout.folders;state.layout.rootItems=prevLayout.rootItems;state.prefs.hiddenTabs=prevHT;render();showToast("绉诲姩澶辫触: "+err.message)}return}if(e.target.matches(".switch input[type=checkbox]")){var pid=e.target.dataset.pluginId,type=e.target.dataset.type,shouldShow=e.target.checked;if(type==="tab")toggleTab(pid,shouldShow);else toggleWidget(pid,shouldShow)}});

document.addEventListener("click",function(e){var info=e.target.closest(".item-info");if(!info)return;var item=info.closest(".item");if(!item)return;visitPlugin(item.dataset.pluginId)});
document.getElementById("search").addEventListener("input",applySearch);

async function callPatchApi(url,sm,btn){var origText=btn?btn.textContent:"";if(btn){btn.disabled=true;btn.textContent="馃攧 安装涓?.."}showToast("姝ｅ湪安装澧炲己琛ヤ竵锛岃绋嶅€?..");try{var res=await api(url,{method:"POST"});var data=await res.json().catch(function(){return{}});if(!res.ok||data.ok===false)throw new Error(data.error||("HTTP "+res.status));state.runtime=data;updateRuntimeNotice();showToast(sm)}catch(e){var prompt="璇峰府鎴戝畨瑁?plugin-hub 鐨勫寮鸿ˉ涓侊紙鎶藉眽下拉澧炲己锛?;var msg="安装澶辫触锛?+e.message+"\n\n璇峰鍒朵互涓嬫彁绀鸿瘝鍒拌亰澶╀腑锛孉I 浼氬府浣犲畨瑁咃細\n"+prompt;try{if(navigator.clipboard){navigator.clipboard.writeText(prompt);showToast("鎻愮ず璇嶅凡澶嶅埗锛佽绮樿创鍒拌亰澶╀腑鍙戦€佺粰 AI")}else{promptUser(msg)}}catch(e2){promptUser(msg)}throw e}finally{if(btn){btn.disabled=false;btn.textContent=origText}}}function promptUser(msg){var ta=document.createElement("textarea");ta.value=msg;ta.style.cssText="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);width:400px;height:150px;z-index:99999;background:white;border:2px solid #4f46e5;border-radius:8px;padding:12px;font-size:14px;box-shadow:0 8px 24px rgba(0,0,0,.3)";document.body.appendChild(ta);ta.select();setTimeout(function(){document.body.removeChild(ta)},5000)}

document.getElementById("patch-install").addEventListener("click",async function(){var btn=this;try{await callPatchApi(PATCH_INSTALL_URL,"澧炲己琛ヤ竵已畨瑁咃紝璇烽噸鍚?Hana",btn)}catch(e){showToast("安装澶辫触: "+e.message)}});
document.getElementById("patch-uninstall").addEventListener("click",async function(){var btn=this;try{await callPatchApi(PATCH_UNINSTALL_URL,"澧炲己琛ヤ竵已嵏杞斤紝璇烽噸鍚?Hana",btn)}catch(e){showToast("鍗歌浇澶辫触: "+e.message)}});
document.getElementById("new-folder").addEventListener("click",async function(){var layout=getLayout(),n=layout.folders.length+1;layout.folders.push({id:"f_"+Date.now().toString(36),name:"鏂版枃浠跺す"+n,items:[]});render();try{await saveLayout();showToast("已垱寤烘枃浠跺す")}catch(e){showToast("鍒涘缓澶辫触: "+e.message)}});

document.addEventListener("blur",async function(e){if(!e.target.matches(".folder-name-input"))return;var fid=e.target.dataset.folderId,layout=getLayout(),folder=layout.folders.find(function(f){return f.id===fid});if(!folder)return;var next=(e.target.value||"").trim()||"鏈懡鍚?;if(folder.name===next)return;folder.name=next;render();try{await saveLayout();showToast("宸查噸鍛藉悕鏂囦欢澶?)}catch(err){showToast("淇濆瓨澶辫触: "+err.message)}},true);

document.addEventListener("keydown",function(e){if(e.target.matches(".folder-name-input")&&e.key==="Enter")e.target.blur()});

document.addEventListener("click",async function(e){var del=e.target.closest(".folder-delete[data-folder-id]");if(!del)return;e.stopPropagation();var fid=del.dataset.folderId,layout=getLayout(),folder=layout.folders.find(function(f){return f.id===fid});if(!folder)return;layout.rootItems=(layout.rootItems||[]).concat(folder.items||[]);layout.folders=layout.folders.filter(function(f){return f.id!==fid});render();try{await saveLayout();showToast("已垹闄ゆ枃浠跺す锛屽唴閮ㄦ彃浠跺凡绉诲埌鏍圭洰褰?)}catch(err){showToast("鍒犻櫎澶辫触: "+err.message)}});

document.getElementById("collect-all").addEventListener("click",async function(){var prev=state.prefs.hiddenTabs.slice();state.prefs.hiddenTabs=(state.pages||[]).map(function(p){return p.pluginId});render();try{await updatePrefs({hiddenTabs:state.prefs.hiddenTabs});notifyRenderer();showToast("已叏閮ㄦ敹杩涙娊灞?)}catch(e){state.prefs.hiddenTabs=prev;render();showToast("操作失败: "+e.message)}});

document.getElementById("restore-all").addEventListener("click",async function(){var prev=state.prefs.hiddenTabs.slice();state.prefs.hiddenTabs=[];render();try{await updatePrefs({hiddenTabs:[]});notifyRenderer();showToast("已叏閮ㄨ涓洪《鏍忕疆椤?)}catch(e){state.prefs.hiddenTabs=prev;render();showToast("操作失败: "+e.message)}});

// init
(function initView(){getLayout();updateRuntimeNotice();render()})();
loadState();
})();

/* AI helper */
(function(){
var aiInstallUrl=(window.__PLUGIN_HUB__||{}).base+"/api/patch/ai-install";
var token=new URLSearchParams(location.search).get("token")||"";

function esc(s){return String(s||"").replace(/[&<>"']/g,function(c){return({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"})[c]})}
function toast(m){try{var el=document.getElementById("toast");if(el){el.textContent=m;el.classList.add("show");setTimeout(function(){el.classList.remove("show")},2000)}}catch(e){}}

async function aiAutoInstall(){
  var btn=document.getElementById("ai-assist-btn");
  if(!btn)return;
  var orig=btn.textContent;
  btn.disabled=true;
  btn.textContent="\u{1F916} \u8bca\u65ad\u5e76\u4fee\u590d...";
  toast("\u6b63\u5728\u81ea\u52a8\u8bca\u65ad\u3001\u4fee\u590d\u5e76\u5b89\u88c5...");
  try{
    var url=aiInstallUrl+(token?"?token="+encodeURIComponent(token):"");
    var res=await fetch(url,{method:"POST",credentials:"include"});
    var data=await res.json().catch(function(){return{}});
    showResultModal(data);
    if(data.ok){
      try{var stEl=document.getElementById("patch-status");if(stEl)stEl.textContent="\u589e\u5f3a\u8865\u4e01\u5df2\u5b89\u88c5\uff0c\u91cd\u542f Hana \u540e\u751f\u6548\u3002";}catch(e){}
      toast("\u589e\u5f3a\u8865\u4e01\u5df2\u5b89\u88c5");
    }
  }catch(e){
    showResultModal({ok:false,installError:e.message});
  }finally{
    btn.disabled=false;
    btn.textContent=orig;
  }
}

function showResultModal(data){
  var ov=document.getElementById("ai-overlay");
  if(ov)ov.remove();
  ov=document.createElement("div");
  ov.id="ai-overlay";
  ov.className="show";

  var statusHtml=data.ok
    ?'<div class="ai-status ok">\u2705 '+(data.repairAttempts&&data.repairAttempts.length?"\u81ea\u52a8\u4fee\u590d\u540e\u5b89\u88c5\u6210\u529f":"\u5b89\u88c5\u6210\u529f")+'</div>'
    :'<div class="ai-status err">\u274C \u5b89\u88c5\u5931\u8d25: '+esc(data.installError||"\u672a\u77e5\u9519\u8bef")+'</div>';

  var repairHtml="";
  if(data.repairAttempts&&data.repairAttempts.length){
    repairHtml='<div class="ai-section"><strong>\u{1F527} \u81ea\u52a8\u4fee\u590d</strong></div>'
      +'<div class="ai-repair-list">'
      +data.repairAttempts.map(function(r){return'<div class="ai-repair-item">\u2022 '+esc(r)+'</div>'}).join("")
      +'</div>';
  }

  var aiHtml=data.aiAnalysis
    ?'<div class="ai-section"><strong>AI \u5206\u6790</strong></div><div class="ai-reply">'+esc(data.aiAnalysis)+'</div>'
    :"";

  var envHtml=data.envSummary
    ?'<details class="ai-details"><summary>\u73af\u5883\u4fe1\u606f</summary><pre class="ai-env">'+esc(data.envSummary)+'</pre></details>'
    :"";

  ov.innerHTML='<div class="ai-modal ai-modal-wide">'
    +'<h3>\u{1F916} AI \u8f85\u52a9\u5b89\u88c5</h3>'
    +statusHtml
    +repairHtml
    +aiHtml
    +envHtml
    +'<div class="ai-rows">'
    +'<button id="ai-copy">\u{1F4CB} \u590d\u5236\u62a5\u544a</button>'
    +(!data.ok?'<button id="ai-retry" class="primary">\u{1F504} \u91cd\u8bd5</button>':"")
    +'<button id="ai-close">\u5173\u95ed</button>'
    +'</div></div>';
  document.body.appendChild(ov);

  document.getElementById("ai-close").addEventListener("click",function(){ov.remove()});
  var retryBtn=document.getElementById("ai-retry");
  if(retryBtn)retryBtn.addEventListener("click",function(){ov.remove();aiAutoInstall()});
  document.getElementById("ai-copy").addEventListener("click",function(){
    var parts=["\u3010\u63d2\u4ef6\u62bd\u5c49\u5b89\u88c5\u62a5\u544a\u3011"];
    parts.push(data.ok?"\u72b6\u6001: \u6210\u529f":"\u72b6\u6001: \u5931\u8d25 - "+(data.installError||""));
    if(data.repairAttempts&&data.repairAttempts.length)parts.push("\n\u81ea\u52a8\u4fee\u590d:\n"+data.repairAttempts.join("\n"));
    if(data.envSummary)parts.push("\n\u73af\u5883:\n"+data.envSummary);
    if(data.aiAnalysis)parts.push("\nAI \u5206\u6790:\n"+data.aiAnalysis);
    navigator.clipboard.writeText(parts.join("\n")).then(function(){toast("\u5df2\u590d\u5236")}).catch(function(){toast("\u590d\u5236\u5931\u8d25")});
  });
  ov.addEventListener("click",function(e){if(e.target===ov)ov.remove()});
}

function addAiBtn(){
  var pp=document.querySelector(".patch-panel .patch-actions");
  if(!pp||document.getElementById("ai-assist-btn"))return;
  var btn=document.createElement("button");
  btn.id="ai-assist-btn";
  btn.type="button";
  btn.className="ghost";
  btn.style.cssText="margin-left:8px";
  btn.textContent="\u{1F916} AI \u8f85\u52a9\u5b89\u88c5";
  btn.title="\u70b9\u51fb\u540e\u81ea\u52a8\u8bca\u65ad\u3001\u4fee\u590d\u5e76\u5b89\u88c5";
  btn.addEventListener("click",aiAutoInstall);
  pp.appendChild(btn);
}
addAiBtn();
})();