(function(){
"use strict";
const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>Array.from(r.querySelectorAll(s));
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const reduce=window.matchMedia&&matchMedia("(prefers-reduced-motion: reduce)").matches;
const svgNS="http://www.w3.org/2000/svg";
function S(tag,attrs={},parent){const e=document.createElementNS(svgNS,tag);for(const k in attrs)e.setAttribute(k,attrs[k]);if(parent)parent.appendChild(e);return e}
function css(name){return getComputedStyle(document.documentElement).getPropertyValue(name).trim()}

/* ---------------- storage (per-viewer, this browser) ---------------- */
const LS="aie:v1";
let state={};
try{state=JSON.parse(localStorage.getItem(LS)||"{}")||{}}catch(e){state={}}
let saveT=null;
const store={
  get(k,d){return k in state?state[k]:d},
  set(k,v){if(v===undefined||v===null||v===""||v===false)delete state[k];else state[k]=v;clearTimeout(saveT);saveT=setTimeout(()=>{try{localStorage.setItem(LS,JSON.stringify(state))}catch(e){}},250)},
  del(prefix){Object.keys(state).forEach(k=>{if(k===prefix||k.startsWith(prefix))delete state[k]});try{localStorage.setItem(LS,JSON.stringify(state))}catch(e){}}
};
window.AIE={store,$,$$,esc,toast,S,css,speak,dictate};

function toast(msg){const t=$("#toast");if(!t)return;t.textContent=msg;t.classList.add("on");clearTimeout(t._t);t._t=setTimeout(()=>t.classList.remove("on"),2400)}
function markSaved(el){const ws=el.closest(".worksheet");if(!ws)return;const s=$("[data-saved]",ws);if(s)s.textContent="saved ✓"}
async function copyText(txt,btn){
  try{await navigator.clipboard.writeText(txt);toast("Copied to your clipboard")}
  catch(e){const ta=document.createElement("textarea");ta.value=txt;ta.style.position="fixed";ta.style.opacity="0";document.body.appendChild(ta);ta.select();let ok=false;try{ok=document.execCommand("copy")}catch(_){}ta.remove();toast(ok?"Copied to your clipboard":"Select and copy the text manually")}
}

/* ---------------- runtime capabilities (when published) ---------------- */
const cap=name=>(window.claude&&typeof window.claude.use==="function")?window.claude.use(name).catch(()=>null):Promise.resolve(null);
let ttsP=null;function getTTS(){return ttsP||(ttsP=cap("tts"))}
let speaking=null;
async function speak(text,btn){
  if(speaking===btn){stopSpeak();return}
  stopSpeak();speaking=btn;if(btn)btn.dataset.state="speaking";
  const done=()=>{if(btn)btn.dataset.state="";if(speaking===btn)speaking=null};
  const t=await getTTS();
  if(t){try{await t.speak(text.slice(0,2000),{voice:"rounded"})}catch(e){}done();return}
  if("speechSynthesis" in window){const u=new SpeechSynthesisUtterance(text);u.rate=1;u.onend=done;u.onerror=done;speechSynthesis.speak(u)}else{done();toast("Audio isn't available in this browser")}
}
async function stopSpeak(){const b=speaking;speaking=null;if(b)b.dataset.state="";const t=await getTTS();if(t){try{t.stop()}catch(e){}}if("speechSynthesis" in window)speechSynthesis.cancel()}
let dictP=null;
async function dictate(){return dictP||(dictP=cap("dictation"))}

/* ---------------- theme ---------------- */
(function theme(){
  const root=document.documentElement;const saved=store.get("theme");if(saved)root.setAttribute("data-theme",saved);
  const btn=$("#theme-btn");if(!btn)return;
  btn.addEventListener("click",()=>{const cur=root.getAttribute("data-theme");const next=!cur?"dark":cur==="dark"?"light":null;if(next)root.setAttribute("data-theme",next);else root.removeAttribute("data-theme");store.set("theme",next);toast(next?`Theme: ${next}`:"Theme: match my system");document.dispatchEvent(new Event("aie:theme"))});
})();

/* ---------------- cover: the edit, animated ---------------- */
function playCover(){
  const marks=$$("#cover [data-seq]").sort((a,b)=>a.dataset.seq-b.dataset.seq);
  marks.forEach(m=>m.classList.remove("on"));
  if(reduce){marks.forEach(m=>m.classList.add("on"));return}
  marks.forEach((m,i)=>setTimeout(()=>m.classList.add("on"),500+i*650));
}
playCover();
$("#replay-cover")?.addEventListener("click",playCover);

/* ---------------- contents rings ---------------- */
(function rings(){
  const svg=$("#rings");if(!svg)return;
  const labels=["I · meaning","II · mind","III · commons","IV · market","V · institution"];
  const radii=[62,94,126,158,190];
  for(let i=4;i>=0;i--){
    const c=S("circle",{cx:210,cy:210,r:radii[i],class:"rg","data-act":i+1,tabindex:0,role:"button","aria-label":`Act ${["I","II","III","IV","V"][i]}`},svg);
    c.addEventListener("click",()=>sel(i+1));c.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();sel(i+1)}});
  }
  radii.forEach((r,i)=>{const t=S("text",{x:210,y:210-r+4,"text-anchor":"middle"},svg);t.textContent=labels[i].toUpperCase()});
  S("circle",{cx:210,cy:210,r:40,class:"ctr"},svg);
  const y=S("text",{x:210,y:217,"text-anchor":"middle",class:"you"},svg);y.textContent="you";
  const rows=$$("#acts-list .act-row");
  function sel(n){$$(".rg",svg).forEach(c=>c.classList.toggle("on",+c.dataset.act===n));rows.forEach(r=>r.classList.toggle("on",+r.dataset.act===n))}
  rows.forEach(r=>r.addEventListener("mouseenter",()=>sel(+r.dataset.act)));
  sel(1);
})();

/* ---------------- reading paths ---------------- */
(function paths(){
  const chips=$$("[data-path]");const panels=$$("[data-panel]",$("#how-to-use"));
  function show(p){chips.forEach(c=>c.setAttribute("aria-pressed",c.dataset.path===p));panels.forEach(x=>x.hidden=x.dataset.panel!==p);store.set("path",p)}
  chips.forEach(c=>c.addEventListener("click",()=>show(c.dataset.path)));
  show(store.get("path","student"));
})();

/* ---------------- generic widgets: data-save / data-seg / data-scale ---------------- */
function emit(el){el.dispatchEvent(new CustomEvent("aie:change",{bubbles:true}))}
function bind(root=document){
  $$("[data-save]",root).forEach(el=>{
    if(el._b)return;el._b=1;const k=el.dataset.save;const v=store.get(k);
    if(el.type==="checkbox"){el.checked=!!v;el.addEventListener("change",()=>{store.set(k,el.checked);markSaved(el);emit(el)})}
    else{if(v!==undefined)el.value=v;el.addEventListener("input",()=>{store.set(k,el.value);markSaved(el);emit(el)})}
  });
  $$("[data-seg]",root).forEach(el=>{
    if(el._b)return;el._b=1;const k=el.dataset.k;const opts=el.dataset.seg.split("|");
    const g=document.createElement("div");g.className="seg";g.setAttribute("role","group");
    opts.forEach(o=>{const b=document.createElement("button");b.type="button";b.textContent=o;b.setAttribute("aria-pressed",store.get(k)===o);b.addEventListener("click",()=>{const on=store.get(k)===o;store.set(k,on?null:o);$$("button",g).forEach(x=>x.setAttribute("aria-pressed",!on&&x===b));markSaved(el);emit(el)});g.appendChild(b)});
    el.appendChild(g);
  });
  $$("[data-scale]",root).forEach(el=>{
    if(el._b)return;el._b=1;const k=el.dataset.k;const sp=el.dataset.scale;let lo=1,hi=+sp;if(sp.includes("-")){[lo,hi]=sp.split("-").map(Number)}
    const g=document.createElement("div");g.className="scale";g.setAttribute("role","group");
    for(let n=lo;n<=hi;n++){const b=document.createElement("button");b.type="button";b.textContent=n;b.setAttribute("aria-label",`${n}`);b.setAttribute("aria-pressed",store.get(k)===n);b.addEventListener("click",()=>{const on=store.get(k)===n;store.set(k,on?null:n);$$("button",g).forEach(x=>x.setAttribute("aria-pressed",!on&&x===b));markSaved(el);emit(el)});g.appendChild(b)}
    el.appendChild(g);
  });
}

/* ---------------- encounter tools ---------------- */
$$(".encounter[data-ch]").forEach(enc=>{
  const ch=enc.dataset.ch;const k=`ch${ch}.react`;
  const bar=document.createElement("div");bar.className="enc-tools";
  bar.innerHTML=`<span class="q">Has this happened to you?</span>`+["Yes","Sort of","Not yet"].map(o=>`<button class="react" type="button" aria-pressed="${store.get(k)===o}">${o}</button>`).join("")+`<button class="react listen" type="button" aria-label="Listen to this Encounter">▶ Listen</button>`;
  enc.appendChild(bar);
  const echo=document.createElement("div");echo.className="echo";echo.dataset.echo=ch;enc.after(echo);
  $$(".react:not(.listen)",bar).forEach(b=>b.addEventListener("click",()=>{const on=store.get(k)===b.textContent;store.set(k,on?null:b.textContent);$$(".react:not(.listen)",bar).forEach(x=>x.setAttribute("aria-pressed",!on&&x===b));renderEcho(ch)}));
  $(".listen",bar).addEventListener("click",e=>{const txt=$$("p",enc).map(p=>p.textContent).join(" ");speak(txt,e.currentTarget)});
});
function renderEcho(ch){
  const el=$(`[data-echo="${ch}"]`);if(!el)return;const n=(window.AIE.countFor?window.AIE.countFor(+ch):0);const mine=store.get(`ch${ch}.react`);
  let h="";
  if(n>0)h+=`<span>${n} student ${n===1?"encounter echoes":"encounters echo"} this chapter</span><a href="#living" data-filter-ch="${ch}">read them →</a>`;
  if(mine&&mine!=="Not yet")h+=`<a href="#living" data-tell="${ch}">${n?"· ":""}tell yours →</a>`;
  else if(!n)h+=`<span>No student encounters for this chapter yet.</span><a href="#living" data-tell="${ch}">be the first →</a>`;
  el.innerHTML=h;
}
window.AIE.renderEchoes=()=>{for(let c=1;c<=12;c++)renderEcho(c)};
document.addEventListener("click",e=>{
  const f=e.target.closest("[data-filter-ch]");if(f&&window.AIE.filterTo)window.AIE.filterTo(+f.dataset.filterCh);
  const t=e.target.closest("[data-tell]");if(t&&window.AIE.tell)window.AIE.tell(+t.dataset.tell);
});

/* ---------------- key terms → index cards; glossary ---------------- */
const glossary=[];
$$("dl.terms").forEach(dl=>{
  const art=dl.closest("[data-ch]");const ch=art?art.dataset.ch:"";
  const grid=document.createElement("div");grid.className="terms";
  $$(":scope>div",dl).forEach(d=>{
    const term=$("dt",d).textContent,def=$("dd",d).textContent;glossary.push({term,def,ch});
    const b=document.createElement("button");b.type="button";b.className="term";b.setAttribute("aria-label",`${term}: ${def}`);
    b.innerHTML=`<span class="in"><span class="fa"><span style="font-family:var(--f-display);font-weight:700;font-size:19px;line-height:1.2;margin-top:52px">${esc(term)}</span><small>CH. ${ch} · TAP TO FLIP</small></span><span class="ba"><span>${esc(def)}</span></span></span>`;
    b.addEventListener("click",()=>b.classList.toggle("flip"));grid.appendChild(b);
  });
  dl.replaceWith(grid);
});
function renderGloss(q=""){
  const l=$("#gl-list");if(!l)return;q=q.toLowerCase();
  const items=glossary.slice().sort((a,b)=>a.term.localeCompare(b.term)).filter(g=>!q||(g.term+g.def).toLowerCase().includes(q));
  l.innerHTML=items.map(g=>`<div class="gl-item"><b>${esc(g.term)}</b> <a href="#ch${g.ch}" data-close-drawer>Ch. ${g.ch}</a><p>${esc(g.def)}</p></div>`).join("")||`<p class="hand" style="font-size:22px;color:var(--pencil)">No terms match.</p>`;
}
renderGloss();$("#gl-q")?.addEventListener("input",e=>renderGloss(e.target.value));

/* ---------------- discussion questions & try this ---------------- */
$$("ol.qs").forEach(ol=>{
  const ch=ol.dataset.ch;
  $$(":scope>li",ol).forEach((li,i)=>{
    const t=li.innerHTML;const k=`ch${ch}.q${i+1}`;
    li.innerHTML=`<span class="qt">${t}</span><button class="qbtn" type="button">✎ ${store.get(k)?"my response":"write a response"}</button><div class="reflect${store.get(k)?" open":""}"><textarea data-save="${k}" aria-label="My response to question ${i+1}"></textarea></div>`;
    $(".qbtn",li).addEventListener("click",()=>{const r=$(".reflect",li);r.classList.toggle("open");if(r.classList.contains("open"))$("textarea",r).focus()});
  });
});
$$(".try[data-ch]").forEach(tr=>{
  const ch=tr.dataset.ch;const k=`ch${ch}.tried`;
  const row=document.createElement("label");row.className="done-row";row.innerHTML=`<span class="checklist" style="margin:0"><input type="checkbox" data-save="${k}" id="try-${ch}"></span><span>I tried this</span>`;
  tr.appendChild(row);
  const upd=()=>tr.classList.toggle("is-done",!!store.get(k));tr.addEventListener("aie:change",upd);upd();
});

/* ---------------- chapter 1 ---------------- */
(function waves(){
  const rows=$$("#waves-rows tr");const det=$("#wave-detail");if(!det)return;const bs=$$(".wave");
  function show(i){bs.forEach((b,j)=>{b.classList.toggle("on",i===j);b.setAttribute("aria-selected",i===j)});const c=$$("td",rows[i]).map(td=>td.textContent);
    det.innerHTML=`<div><span class="k">What was automated</span><span class="v">${esc(c[2])}</span></div><div class="lost"><span class="k">What workers lost</span><span class="v">${esc(c[3])}</span></div><div class="gain"><span class="k">What workers gained</span><span class="v">${esc(c[4])}</span></div>`}
  bs.forEach((b,i)=>b.addEventListener("click",()=>show(i)));show(0);
})();
(function ladder(){
  const svg=$("#ladder"),r=$("#ladder-r");if(!svg)return;
  const msgs=["Every rung is there. A beginner can climb.","The first rung is gone. Beginners have to jump.","The easy work is disappearing.","Half the ladder is gone. Who builds judgment now?","Only senior work remains.","Almost nothing left to practice on.","The bottom of the ladder has been sawed off. Where does the next Marguerite come from?"];
  function draw(n){svg.innerHTML="";const ink=css("--ink"),red=css("--red"),pen=css("--pen");
    S("line",{x1:40,y1:10,x2:40,y2:250,stroke:ink,"stroke-width":4,"stroke-linecap":"round"},svg);S("line",{x1:120,y1:10,x2:120,y2:250,stroke:ink,"stroke-width":4,"stroke-linecap":"round"},svg);
    for(let i=0;i<6;i++){const y=230-i*38;const gone=i<n;S("line",{x1:40,y1:y,x2:120,y2:y,stroke:gone?red:ink,"stroke-width":gone?2:4,"stroke-dasharray":gone?"4 6":"0","stroke-linecap":"round",opacity:gone?.7:1},svg)}
    if(n>0){S("rect",{x:30,y:230-(n-1)*38+12,width:100,height:1,fill:"none"},svg);const t=S("text",{x:80,y:250,"text-anchor":"middle","font-family":"Caveat, cursive","font-size":18,fill:red},svg);t.textContent="sawed off"}
    S("circle",{cx:20,cy:n?250:236,r:9,fill:pen},svg);
    $("#ladder-v").textContent=n;$("#ladder-msg").textContent=msgs[n]}
  r.addEventListener("input",()=>draw(+r.value));draw(0);document.addEventListener("aie:theme",()=>draw(+r.value));
})();
function auditVerdicts(){
  $$("#audit tbody tr").forEach(tr=>{const k=tr.dataset.row;const g=store.get(`ch1.audit.${k}.grow`),t=store.get(`ch1.audit.${k}.ted`);const c=$(".vcell",tr);
    let v="",cls="";if(g&&t){if(g>=4&&t>=4){v="Partner";cls="partner"}else if(g>=4){v="Protect";cls="protect"}else if(g<=2&&t>=4){v="Liberate";cls="liberate"}else if(g>=3&&t>=3){v="Partner";cls="partner"}else if(g>=3){v="Protect";cls="protect"}else if(t>=3){v="Liberate";cls="liberate"}else{v="Your call";cls=""}}
    c.innerHTML=v?`<span class="verdict ${cls}">${v}</span>`:`<span class="mono" style="font-size:11px;color:var(--pencil)">score both →</span>`;store.set(`ch1.audit.${k}.verdict`,v)})}
$("#audit")?.addEventListener("aie:change",auditVerdicts);

/* ---------------- chapter 2 ---------------- */
$$(".figure .tabs [role=tab]").forEach(t=>t.addEventListener("click",()=>{const fig=t.closest(".figure");$$("[role=tab]",fig).forEach(x=>x.setAttribute("aria-selected",x===t));$$(".tabpanel",fig).forEach(p=>p.hidden=p.dataset.panel!==t.dataset.tab)}));
(function matrix(){
  const board=$("#mwm");if(!board)return;const K="ch2.matrix";
  const zones={steward:"Steward it",protect:"Protect it",automate:"Automate or drop it",redirect:"Redirect it"};
  let tasks=store.get(K,[]);
  function save(){store.set(K,tasks.length?tasks:null);markSaved(board);render()}
  function render(){
    $$(".zone .tasks",board).forEach(z=>z.innerHTML="");
    tasks.forEach((t,i)=>{const el=document.createElement("span");el.className="task";el.dataset.i=i;
      el.innerHTML=`<span>${esc(t.name)}</span><select aria-label="Move ${esc(t.name)}">${Object.entries(zones).map(([k,v])=>`<option value="${k}"${k===t.z?" selected":""}>${v}</option>`).join("")}</select><button type="button" aria-label="Remove ${esc(t.name)}">×</button>`;
      $(`.zone[data-z="${t.z}"] .tasks`,board).appendChild(el);
      $("select",el).addEventListener("change",e=>{t.z=e.target.value;save()});
      $("button",el).addEventListener("click",()=>{tasks.splice(i,1);save()});
      el.addEventListener("pointerdown",ev=>{if(ev.target.closest("select,button"))return;drag(ev,el,t)});
    });
    const n=tasks.length,p=n?Math.round(tasks.filter(t=>t.z==="protect").length/n*100):0;$("#mwm-fill").style.width=p+"%";$("#mwm-pct").textContent=n?p+"%":"—";
  }
  function drag(ev,el,t){ev.preventDefault();const g=el.cloneNode(true);const r=el.getBoundingClientRect();g.style.cssText=`position:fixed;left:${r.left}px;top:${r.top}px;z-index:100;pointer-events:none;transform:rotate(-4deg) scale(1.05);opacity:.92`;document.body.appendChild(g);el.style.opacity=".3";
    const ox=ev.clientX-r.left,oy=ev.clientY-r.top;let over=null;
    const mv=e=>{g.style.left=e.clientX-ox+"px";g.style.top=e.clientY-oy+"px";const z=document.elementFromPoint(e.clientX,e.clientY)?.closest(".zone");if(over&&over!==z)over.classList.remove("over");over=z;if(z)z.classList.add("over")};
    const up=()=>{window.removeEventListener("pointermove",mv);window.removeEventListener("pointerup",up);g.remove();el.style.opacity="";if(over){over.classList.remove("over");t.z=over.dataset.z;save()}};
    window.addEventListener("pointermove",mv);window.addEventListener("pointerup",up)}
  const inp=$("#mwm-new");const add=()=>{const v=inp.value.trim();if(!v)return;tasks.push({name:v.slice(0,60),z:"steward"});inp.value="";save()};
  $("#mwm-add").addEventListener("click",add);inp.addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();add()}});
  render();
  window.AIE.ex2=()=>tasks.length?"Matrix:\n"+Object.entries(zones).map(([k,v])=>`  ${v}: ${tasks.filter(t=>t.z===k).map(t=>t.name).join(", ")||"—"}`).join("\n"):"";
  window.AIE.clr2=()=>{tasks=[];save()};
})();
(function energy(){
  const tb=$("#energy-log tbody");if(!tb)return;
  for(let d=1;d<=5;d++){const tr=document.createElement("tr");tr.innerHTML=`<td>Day ${d}</td><td><input type="text" class="field" style="font-size:20px" data-save="ch2.energy.d${d}.task" aria-label="Day ${d} task"></td><td data-seg="energized|neutral|drained" data-k="ch2.energy.d${d}.e"></td><td data-seg="AI|no AI" data-k="ch2.energy.d${d}.ai"></td>`;tb.appendChild(tr)}
})();

/* ---------------- chapter 3 ---------------- */
(function scaffold(){
  const svg=$("#sb-svg");if(!svg)return;
  function draw(mode){svg.innerHTML="";const ink=css("--ink"),pen=css("--pen"),red=css("--red"),pencil=css("--pencil"),card=css("--card");
    S("line",{x1:10,y1:205,x2:510,y2:205,stroke:pencil,"stroke-width":1.5},svg);
    if(mode==="scaffold"){
      for(let i=0;i<4;i++)S("rect",{x:200,y:165-i*40,width:120,height:38,fill:card,stroke:ink,"stroke-width":2},svg);
      for(let i=0;i<4;i++)for(let j=0;j<3;j++)S("rect",{x:214+j*36,y:175-i*40,width:16,height:16,fill:"none",stroke:ink,"stroke-width":1.2},svg);
      [180,340].forEach(x=>S("line",{x1:x,y1:205,x2:x,y2:20,stroke:pen,"stroke-width":2},svg));
      for(let y=205;y>=20;y-=37)S("line",{x1:180,y1:y,x2:340,y2:y,stroke:pen,"stroke-width":1.5,"stroke-dasharray":"0"},svg);
      for(let y=205;y>40;y-=37){S("line",{x1:180,y1:y,x2:200,y2:y-37,stroke:pen,"stroke-width":1},svg);S("line",{x1:340,y1:y,x2:320,y2:y-37,stroke:pen,"stroke-width":1},svg)}
      S("rect",{x:200,y:20,width:120,height:22,fill:"none",stroke:ink,"stroke-width":1.5,"stroke-dasharray":"5 5"},svg);
      const t=S("text",{x:360,y:60,"font-family":"Caveat, cursive","font-size":22,fill:pen},svg);t.textContent="still going up…";
    }else{
      S("line",{x1:260,y1:120,x2:200,y2:205,stroke:ink,"stroke-width":3},svg);S("line",{x1:260,y1:120,x2:320,y2:205,stroke:ink,"stroke-width":3},svg);S("line",{x1:260,y1:120,x2:260,y2:205,stroke:ink,"stroke-width":3},svg);
      S("rect",{x:190,y:20,width:140,height:130,fill:card,stroke:ink,"stroke-width":5},svg);
      for(let i=0;i<4;i++)S("rect",{x:235,y:118-i*24,width:50,height:22,fill:"none",stroke:pencil,"stroke-width":1.2},svg);
      const t=S("text",{x:350,y:70,"font-family":"Caveat, cursive","font-size":22,fill:red},svg);t.textContent="just a picture of one";
      S("line",{x1:30,y1:205,x2:150,y2:205,stroke:red,"stroke-width":2,"stroke-dasharray":"4 6"},svg);const t2=S("text",{x:30,y:195,"font-family":"Caveat, cursive","font-size":20,fill:red},svg);t2.textContent="(nothing built)";
    }
    $("#sb-cap").textContent=mode==="scaffold"?"A scaffold supports a building while it goes up.":"A bypass replaces the building with a picture of one.";
    $("#sb-cap").style.color=mode==="scaffold"?"var(--pen)":"var(--red)"}
  let mode="scaffold";$$("[data-sb]").forEach(b=>b.addEventListener("click",()=>{mode=b.dataset.sb;$$("[data-sb]").forEach(x=>x.setAttribute("aria-pressed",x===b));draw(mode)}));draw(mode);document.addEventListener("aie:theme",()=>draw(mode));
})();
function frictionWarn(){const rows=$$("#friction tbody tr");const zones=[];rows.forEach(tr=>{const name=$("td",tr).textContent;const k=$("[data-ftest]",tr).dataset.k;if(store.get(k)==="No")zones.push(name)});
  const bypassed=rows.filter(tr=>{const name=$("td",tr).textContent;const d=$$("[data-k]",tr).pop().dataset.k;return store.get(d)==="Bypass"&&zones.includes(name)}).map(tr=>$("td",tr).textContent);
  const el=$("#friction-warn");if(!el)return;el.textContent=bypassed.length?`Wait: you marked ${bypassed.join(" & ")} as a growth zone, then chose Bypass. Keep the friction there?`:zones.length?`Growth zones: ${zones.join(", ")}. Keep the friction.`:""}
$("#friction")?.closest(".worksheet").addEventListener("aie:change",frictionWarn);

/* ---------------- chapter 4 ---------------- */
(function hcai(){
  const a=$("#hc-auto"),c=$("#hc-ctrl");if(!a)return;
  const f=()=>{const q=(+a.value>=50?"h":"l")+(+c.value>=50?"h":"l");$$("#hcai-fig .cell").forEach(x=>x.classList.toggle("on",x.dataset.q===q))};
  a.addEventListener("input",f);c.addEventListener("input",f);f();
})();
function sparPrompts(){
  const box=$("#sp-prompts");if(!box)return;const th=(store.get("ch4.thesis")||"").trim(),op=(store.get("ch4.opponent")||"").trim();
  const T=th||"The 1912 Lawrence textile strike succeeded mainly because of national publicity.";
  const P=[["Step 2 · Assign an opponent",`Here is my thesis: "${T}" Argue against it as ${op||"a labor historian who believes worker organization, not publicity, was decisive"}. Be specific and don't soften your view.`],
    ["Step 3 · Interrogate the premises",`What assumptions does my thesis rely on? Which is weakest? What evidence would prove me wrong?`],
    ["Step 3 · …then the other side",`Now answer the same three questions about the opposing argument you just made.`],
    ["Rules of the ring",`What is the strongest objection to my argument?`]];
  box.innerHTML=(th?"":`<span class="hand" style="font-size:20px;color:var(--pencil)">Using the book's example until you write your own thesis above.</span>`)+P.map((p,i)=>`<div style="display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:start;padding:10px 12px;border:1px solid var(--line);border-radius:6px;background:var(--sheet)"><div><div style="font-size:10.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--pencil)">${p[0]}</div><div>${esc(p[1])}</div></div><button class="react" type="button" data-cp="${i}">Copy</button></div>`).join("");
  $$("[data-cp]",box).forEach(b=>b.addEventListener("click",()=>copyText(P[+b.dataset.cp][1])));
}
$("#sp-thesis")?.addEventListener("input",sparPrompts);$("#sp-opp")?.addEventListener("input",sparPrompts);

/* ---------------- chapter 5 ---------------- */
(function tokenizer(){
  const inp=$("#tok-in"),out=$("#tok-out");if(!inp)return;
  const suf=["ation","ingly","ment","ness","able","tion","ing","ed","ly","ers","er","s"];
  function tok(s){const parts=s.match(/\s*[A-Za-z]+|\s*\d{1,3}|\s*[^\sA-Za-z\d]/g)||[];const out=[];
    parts.forEach(p=>{const m=p.match(/^(\s*)([A-Za-z]+)$/);if(!m||m[2].length<=5){out.push(p);return}
      let w=m[2],lead=m[1],tail="";for(const x of suf){if(w.length-x.length>=3&&w.toLowerCase().endsWith(x)){tail=w.slice(-x.length);w=w.slice(0,-x.length);break}}
      const chunks=[];while(w.length>6){chunks.push(w.slice(0,4));w=w.slice(4)}chunks.push(w);chunks[0]=lead+chunks[0];out.push(...chunks);if(tail)out.push(tail)});return out}
  const cols=["--pen","--red","--hi","--pencil","--margin"];
  function r(){const t=tok(inp.value);out.innerHTML=t.map((x,i)=>`<span style="background:color-mix(in srgb,var(${cols[i%5]}) 22%,transparent)">${esc(x.replace(/ /g,"·"))}</span>`).join("");$("#tok-n").textContent=t.length}
  inp.addEventListener("input",r);r();
})();
(function predictor(){
  const ctx=$("#pred-ctx");if(!ctx)return;
  const M={will:[["grow",.46],["decline",.22],["remain",.14],["double",.10],["vanish",.08]],grow:[["steadily",.38],["by",.27],["rapidly",.2],["as",.15]],decline:[["sharply",.4],["as",.3],["by",.3]],remain:[["stable",.7],["low",.3]],double:[["by",.6],["within",.4]],vanish:[["by",.6],["as",.4]],by:[["2040",.4],["30%",.35],["half",.25]],within:[["a",.7],["two",.3]],a:[["decade",1]],two:[["decades",1]],as:[["temperatures",.5],["habitat",.3],["rainfall",.2]],temperatures:[["rise",.8],["shift",.2]],habitat:[["expands",.6],["shrinks",.4]],rainfall:[["increases",.7],["drops",.3]],through:[["2050",.6],["the",.4]],the:[["decade",1]]};
  ["steadily","rapidly","sharply","stable","low"].forEach(k=>M[k]=[["as",.45],["through",.3],[".",.25]]);
  const base="The model says the heron population will";let gen=[];let last="will";
  function dist(){const d=M[last]||[[".",1]];const T=.2+(+$("#pred-temp").value/100)*1.4;const w=d.map(([t,p])=>[t,Math.pow(p,1/T)]);const s=w.reduce((a,b)=>a+b[1],0);return w.map(([t,p])=>[t,p/s])}
  function render(pick){const d=dist();ctx.innerHTML=esc(base)+gen.map(g=>g==="."?`<span class="gen">.</span>`:` <span class="gen">${esc(g)}</span>`).join("")+(last==="."?"":` <span class="caret" style="display:inline-block;width:.5em;height:1em;background:var(--pencil);vertical-align:-.12em;animation:blink 1s steps(1) infinite"></span>`);
    $("#pred-bars").innerHTML=last==="."?`<p class="hand" style="font-size:23px;color:var(--red);margin:0">Done: a fluent sentence. Now check it against the field notebook. Our counts say otherwise. Why?</p>`:d.map(([t,p])=>`<div class="bar-row${t===pick?" pick":""}"><span>${esc(t)}</span><span class="b"><i style="width:${(p*100).toFixed(1)}%"></i></span><span class="p">${(p*100).toFixed(0)}%</span></div>`).join("");
    $("#pred-next").disabled=last==="."}
  $("#pred-next").addEventListener("click",()=>{const d=dist();let r=Math.random(),pick=d[d.length-1][0];for(const [t,p] of d){if((r-=p)<=0){pick=t;break}}gen.push(pick);last=pick;render(pick)});
  $("#pred-reset").addEventListener("click",()=>{gen=[];last="will";render()});
  $("#pred-temp").addEventListener("input",()=>render());render();
})();
(function cites(){
  const tb=$("#cite-check tbody");if(!tb)return;
  for(let i=1;i<=5;i++){const tr=document.createElement("tr");tr.innerHTML=`<td>${i}</td><td><input type="text" class="field" style="font-size:19px" data-save="ch5.cite.${i}" aria-label="Citation ${i}"></td><td data-seg="Real|Partly real|Invented" data-k="ch5.cite.${i}.v"></td>`;tb.appendChild(tr)}
  const sum=()=>{const v=[1,2,3,4,5].map(i=>store.get(`ch5.cite.${i}.v`)).filter(Boolean);const c=k=>v.filter(x=>x===k).length;$("#cite-sum").textContent=v.length?`So far: ${c("Real")} real · ${c("Partly real")} partly real · ${c("Invented")} invented`:""};
  tb.closest(".try").addEventListener("aie:change",sum);setTimeout(sum);
})();

/* ---------------- chapter 6 ---------------- */
(function lenses(){
  const ls=$$(".lens");if(!ls.length)return;const out=$("#lens-out");const bars=$$("#lens-fig .puzzle i");
  const msg=["Add a lens.","One lens sees a fragment.","Two lenses see more, but not the whole story.","None of them could have found the whole story alone. Together, they did."];
  const f=()=>{const n=ls.filter(l=>l.getAttribute("aria-pressed")==="true").length;out.textContent=msg[n];out.classList.toggle("full",n===3);bars.forEach((b,i)=>b.classList.toggle("on",i<n))};
  ls.forEach(l=>l.addEventListener("click",()=>{l.setAttribute("aria-pressed",l.getAttribute("aria-pressed")!=="true");f()}));f();
})();

/* ---------------- chapter 7 ---------------- */
(function voiceParts(){
  const b=$("#vp-toggle");if(!b)return;const lis=$$("#vp-list li");
  b.addEventListener("click",()=>{const on=b.getAttribute("aria-pressed")!=="true";b.setAttribute("aria-pressed",on);b.setAttribute("aria-selected",on);b.textContent=on?"Hide":"Show what AI can imitate";
    lis.forEach(li=>{$(".vtag",li)?.remove();if(on){const s=document.createElement("span");s.className="vtag hand";s.style.cssText=`margin-left:10px;font-size:21px;color:var(${li.dataset.ai?"--pencil":"--red"})`;s.textContent=li.dataset.ai?"← AI can imitate this":"← only you can supply this";li.appendChild(s)}})});
})();
const CLICHES=["in today's fast-paced world","passionate about","proven track record","leverage","leveraging","delve","delving","driving impact","cross-functional collaboration"];
function voiceCheck(){
  const ta=$("#voice-in"),out=$("#voice-out");if(!ta)return;const text=ta.value;
  const wc=(text.trim().match(/\S+/g)||[]).length;$("#voice-wc").textContent=wc;
  if(!text.trim()){out.innerHTML=`<span class="hand" style="font-size:22px;color:var(--pencil)">Your sentences will appear here. Clichés get struck through in red.</span>`;$("#voice-stats").innerHTML="";return}
  const never=new Set(store.get("ch7.never",[]));const re=new RegExp("\\b("+CLICHES.map(c=>c.replace(/[.*+?^${}()|[\]\\]/g,"\\$&").replace(/'/g,"['’]")).join("|")+")\\b","gi");
  const sents=text.match(/[^.!?\n]+[.!?]*[\s]*|\n+/g)||[];let nc=0;
  out.innerHTML=sents.map(s=>{if(/^\n+$/.test(s))return s;const key=s.trim();const h=esc(s).replace(re,m=>{nc++;return `<mark>${m}</mark>`});return `<span class="sent${never.has(key)?" never":""}" data-s="${esc(key)}" tabindex="0" role="button">${h}</span>`}).join("");
  const nn=sents.filter(s=>never.has(s.trim())).length;
  $("#voice-stats").innerHTML=`<span>${sents.filter(s=>s.trim()).length} sentences</span><span><b>${nn}</b> you'd never say</span><span><b>${nc}</b> cliché${nc===1?"":"s"}</span>`;
}
$("#voice-out")?.addEventListener("click",e=>{const s=e.target.closest(".sent");if(!s)return;const k=s.dataset.s;const arr=new Set(store.get("ch7.never",[]));arr.has(k)?arr.delete(k):arr.add(k);store.set("ch7.never",arr.size?[...arr]:null);voiceCheck()});
$("#voice-in")?.addEventListener("input",voiceCheck);
$("#voice-read")?.addEventListener("click",e=>{const t=$("#voice-in").value.trim();if(!t){toast("Paste a draft first");return}speak(t,e.currentTarget)});
function voiceAudit(){$$("#voice-audit tbody tr").forEach(tr=>{const p=tr.dataset.p;const v=["spec","cad","stance"].map(k=>store.get(`ch7.p${p}.${k}`));const c=$(".vcell",tr);if(v.some(x=>x===undefined)){c.innerHTML=`<span class="mono" style="font-size:11px;color:var(--pencil)">score all three</span>`;return}const s=v.reduce((a,b)=>a+b,0);c.innerHTML=s<=3?`<span class="verdict protect" style="font-size:20px">${s}/6 · rewrite: add a real story, opinion, or detail</span>`:`<span class="verdict liberate" style="font-size:20px">${s}/6 · keep</span>`})}
$("#voice-audit")?.addEventListener("aie:change",voiceAudit);

/* ---------------- chapter 8 ---------------- */
(function m2m(){
  const svg=$("#m2m");if(!svg)return;let mode="machines";
  function draw(){svg.innerHTML="";const ink=css("--ink"),pen=css("--pen"),red=css("--red"),pencil=css("--pencil"),card=css("--card");
    const node=(x,label,sub)=>{if(mode==="machines"){S("rect",{x:x-34,y:50,width:68,height:60,rx:8,fill:card,stroke:ink,"stroke-width":2},svg);S("circle",{cx:x-12,cy:72,r:5,fill:ink},svg);S("circle",{cx:x+12,cy:72,r:5,fill:ink},svg);S("line",{x1:x-14,y1:92,x2:x+14,y2:92,stroke:ink,"stroke-width":2},svg)}else{S("circle",{cx:x,cy:66,r:16,fill:card,stroke:pen,"stroke-width":2.2},svg);S("path",{d:`M${x-28} 116 Q${x} 76 ${x+28} 116`,fill:card,stroke:pen,"stroke-width":2.2},svg)}
      const t=S("text",{x,y:140,"text-anchor":"middle","font-family":"IBM Plex Mono, monospace","font-size":12,fill:ink},svg);t.textContent=label;const t2=S("text",{x,y:156,"text-anchor":"middle","font-family":"IBM Plex Mono, monospace","font-size":10,fill:pencil},svg);t2.textContent=sub};
    node(70,mode==="machines"?"student's AI":"student","writes · revises");node(490,mode==="machines"?"instructor's AI":"instructor","gives feedback");
    for(let i=0;i<4;i++){const x=200+i*45;S("rect",{x:x-14,y:96,width:28,height:16,fill:"none",stroke:pencil,"stroke-width":1.2},svg);if(mode==="people")S("circle",{cx:x,cy:84,r:8,fill:pen,opacity:.7},svg)}
    const ct=S("text",{x:280,y:140,"text-anchor":"middle","font-family":"Caveat, cursive","font-size":20,fill:mode==="machines"?red:pen},svg);ct.textContent=mode==="machines"?"an empty classroom":"someone real is on the other end";
    const p1=S("path",{d:"M110 60 C220 10 340 10 450 60",fill:"none",stroke:mode==="machines"?pencil:pen,"stroke-width":1.5,"stroke-dasharray":"5 6"},svg);const p2=S("path",{d:"M450 100 C340 150 220 150 110 100",fill:"none",stroke:mode==="machines"?pencil:pen,"stroke-width":1.5,"stroke-dasharray":"5 6",opacity:0},svg);
    const lab=(x,y,s)=>{const t=S("text",{x,y,"text-anchor":"middle","font-family":"Caveat, cursive","font-size":19,fill:ink},svg);t.textContent=s};lab(280,24,mode==="machines"?"essay → feedback → revision":"I read your work, I thought about you");
    if(!reduce){const dot=S("circle",{r:6,fill:mode==="machines"?red:pen},svg);const am=S("animateMotion",{dur:"3.2s",repeatCount:"indefinite",path:"M110 60 C220 10 340 10 450 60 L450 100 C340 150 220 150 110 100 Z"},dot)}}
  $$("[data-m2m]").forEach(b=>b.addEventListener("click",()=>{mode=b.dataset.m2m;$$("[data-m2m]").forEach(x=>x.setAttribute("aria-pressed",x===b));draw()}));draw();document.addEventListener("aie:theme",draw);
})();
(function levels(){
  const tb=$("#ai-levels tbody");if(!tb)return;let n=store.get("ch8.as.n",3);
  function row(i){const tr=document.createElement("tr");tr.innerHTML=`<td><input type="text" class="field" style="font-size:20px" data-save="ch8.as.${i}.name" placeholder="${i===0?"e.g. Research paper":"assignment"}" aria-label="Assignment ${i+1}"></td>`+[0,1,2,3].map(l=>`<td style="text-align:center"><input type="radio" name="lvl-${i}" value="${l}" aria-label="Level ${l}" ${store.get(`ch8.as.${i}.lvl`)===l?"checked":""} style="width:20px;height:20px;accent-color:var(--pen)"></td>`).join("")+`<td><input type="text" class="field" style="font-size:20px" data-save="ch8.as.${i}.why" aria-label="Why this level, assignment ${i+1}"></td><td></td>`;
    $$("input[type=radio]",tr).forEach(r=>r.addEventListener("change",()=>{store.set(`ch8.as.${i}.lvl`,+r.value);markSaved(tr)}));tb.appendChild(tr);bind(tr)}
  for(let i=0;i<n;i++)row(i);
  $("#add-assign").addEventListener("click",()=>{row(n);n++;store.set("ch8.as.n",n)});
  window.AIE.ex8=()=>{const L=["No AI","AI for ideas only","AI as editor or tutor","AI as collaborator, documented"];const out=[];for(let i=0;i<n;i++){const nm=store.get(`ch8.as.${i}.name`),l=store.get(`ch8.as.${i}.lvl`),w=store.get(`ch8.as.${i}.why`);if(nm||l!==undefined)out.push(`  ${nm||"(assignment)"}: Level ${l??"?"}${l!==undefined?" ("+L[l]+")":""}${w?" because "+w:""}`)}return out.length?"AI use by assignment:\n"+out.join("\n"):""};
})();

/* ---------------- chapter 9 ---------------- */
(function eli(){
  const a=$("#eli-a"),b=$("#eli-b");if(!a)return;
  a.innerHTML=Array.from({length:400},()=>`<i style="width:6px;height:6px;border-radius:1px;background:var(--line)"></i>`).join("");
  b.innerHTML=Array.from({length:12},(_,i)=>`<i style="width:16px;height:16px;border-radius:50%;background:${i<3?"var(--red)":"var(--pen)"}" title="${i<3?"interview":"conversation"}"></i>`).join("");
})();
$$("#translate .tr-card").forEach(c=>c.addEventListener("click",()=>c.classList.toggle("on")));
$("#translate-all")?.addEventListener("click",()=>{const cs=$$("#translate .tr-card");const all=cs.every(c=>c.classList.contains("on"));cs.forEach(c=>c.classList.toggle("on",!all))});
(function tiemap(){
  const svg=$("#tie-svg");if(!svg)return;const K="ch9.nodes";let nodes=store.get(K,[]);let ring=1;const R=[95,165,235],C=260;
  $$("#tie-ring button").forEach(b=>b.addEventListener("click",()=>{ring=+b.dataset.r;$$("#tie-ring button").forEach(x=>x.setAttribute("aria-pressed",x===b))}));
  function save(){store.set(K,nodes.length?nodes:null);markSaved(svg);draw();table()}
  function draw(){svg.innerHTML="";["inner · strong ties","middle · weak ties","outer · dormant / potential"].forEach((l,i)=>{S("circle",{cx:C,cy:C,r:R[i],class:"ringc"},svg);const t=S("text",{x:C,y:C-R[i]-6,"text-anchor":"middle",class:"rlab"},svg);t.textContent=l.toUpperCase()});
    const list=nodes.length?nodes:[{name:"e.g. Mom",r:0},{name:"e.g. Dr. Patel",r:1,broker:1},{name:"e.g. summer supervisor",r:1},{name:"e.g. aunt's neighbor",r:2,broker:1},{name:"e.g. alum in policy",r:2}];
    const ghost=!nodes.length;
    [0,1,2].forEach(ri=>{const inR=list.filter(n=>n.r===ri);inR.forEach((n,i)=>{const ang=-Math.PI/2+(i+.5)*(2*Math.PI/inR.length)+ri*.35;const x=C+R[ri]*Math.cos(ang),y=C+R[ri]*Math.sin(ang);
      S("line",{x1:C,y1:C,x2:x,y2:y,class:"edge"},svg);const g=S("g",{class:"node"+(n.broker?" broker":""),tabindex:ghost?-1:0,role:ghost?"presentation":"button","aria-label":ghost?"":`${n.name}${n.broker?", broker":""}`,opacity:ghost?.45:1},svg);
      S("circle",{cx:x,cy:y,r:7},g);if(n.broker)S("ellipse",{cx:x,cy:y,rx:15,ry:13,class:"bring",transform:`rotate(-12 ${x} ${y})`},g);
      const right=x>=C;const tx=S("text",{x:x+(right?14:-14),y:y+5,"text-anchor":right?"start":"end"},g);tx.textContent=n.name.length>18?n.name.slice(0,17)+"…":n.name;
      if(!ghost){const tog=()=>{n.broker=!n.broker;save()};g.addEventListener("click",tog);g.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();tog()}})}})});
    S("circle",{cx:C,cy:C,r:30,class:"me"},svg);const me=S("text",{x:C,y:C+7,"text-anchor":"middle",class:"me-t"},svg);me.textContent="me";
    $("#tie-n").textContent=nodes.length}
  function table(){const tb=$("#outreach tbody");tb.innerHTML="";const ord=nodes.slice().sort((a,b)=>(b.broker?1:0)-(a.broker?1:0));
    if(!ord.length){tb.innerHTML=`<tr><td colspan="7" class="hand" style="font-family:var(--f-hand);font-size:21px;color:var(--pencil);font-weight:400">Names you add to the map show up here, brokers first.</td></tr>`;return}
    ord.forEach(n=>{const tr=document.createElement("tr");const f=k=>`<td><input type="text" class="field" style="font-size:19px" data-save="ch9.out.${n.id}.${k}" aria-label="${esc(n.name)} ${k}"></td>`;
      tr.innerHTML=`<td>${n.broker?'<span style="color:var(--red)">◯ </span>':""}${esc(n.name)} <button type="button" class="react" style="padding:0 6px" aria-label="Remove ${esc(n.name)}">×</button></td><td>${["Inner","Middle","Outer"][n.r]}</td>`+["field","why","sent","date","thanks"].map(f).join("");
      $("button",tr).addEventListener("click",()=>{nodes=nodes.filter(x=>x!==n);store.del(`ch9.out.${n.id}.`);save()});tb.appendChild(tr);bind(tr)})}
  const inp=$("#tie-name");const add=()=>{const v=inp.value.trim();if(!v)return;nodes.push({id:Date.now().toString(36),name:v.slice(0,40),r:ring,broker:false});inp.value="";save();inp.focus()};
  $("#tie-add").addEventListener("click",add);inp.addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();add()}});
  draw();table();document.addEventListener("aie:theme",draw);
  window.AIE.ex9=()=>nodes.length?`Network map (${nodes.length} names):\n`+nodes.map(n=>`  ${n.name} · ${["inner","middle","outer"][n.r]}${n.broker?" · BROKER":""}${["field","why","sent","date","thanks"].map(k=>store.get(`ch9.out.${n.id}.${k}`)?` · ${k}: ${store.get(`ch9.out.${n.id}.${k}`)}`:"").join("")}`).join("\n"):"";
  window.AIE.clr9=()=>{nodes=[];save()};
})();
(function askCount(){const t=$("#ask-msg");if(!t)return;const f=()=>{const w=(t.value.trim().match(/\S+/g)||[]).length;$("#ask-count").textContent=w?`${w} words${w>90?" · try trimming: short and specific works best":""}`:""};t.addEventListener("input",f);setTimeout(f)})();

/* ---------------- chapter 10 ---------------- */
$$("#dash .dr[data-flag]").forEach(r=>$(".flag",r).addEventListener("click",()=>r.classList.toggle("open")));
(function star(){
  const tb=$("#star tbody");if(!tb)return;
  function show(s){tb.innerHTML=`<tr>${["S","T","A","R"].map(k=>`<td><textarea rows="4" data-save="ch10.star.${s}.${k}" aria-label="Story ${s} ${({S:"Situation",T:"Task",A:"Action",R:"Result"})[k]}"></textarea></td>`).join("")}</tr>`;bind(tb);$$("#star-tabs button").forEach(b=>b.setAttribute("aria-pressed",b.dataset.s==s))}
  $$("#star-tabs button").forEach(b=>b.addEventListener("click",()=>show(b.dataset.s)));show(1);
})();

/* ---------------- chapter 11 ---------------- */
(function inbox(){
  const ib=$("#inbox");if(!ib)return;const msgs=$$(".msg",ib);let shown=false;
  msgs.forEach(m=>m.classList.add("in"));$("#inbox-n").textContent=`${msgs.length} unread`;
  const run=()=>{if(shown||reduce)return;shown=true;msgs.forEach(m=>m.classList.remove("in"));msgs.forEach((m,i)=>setTimeout(()=>m.classList.add("in"),200+i*380))};
  if("IntersectionObserver" in window){const io=new IntersectionObserver(es=>{if(es.some(e=>e.isIntersecting)){run();io.disconnect()}},{threshold:.5});io.observe(ib)}
  $("#draft-send").addEventListener("click",()=>{$("#draft").classList.remove("struck");$("#draft-msg").style.color="var(--red)";$("#draft-msg").textContent="Sent. By August it's out of date, and use goes underground. The ban would have been obsolete within a semester."});
  $("#draft-hold").addEventListener("click",()=>{$("#draft").classList.add("struck");$("#draft-msg").style.color="var(--pen)";$("#draft-msg").textContent="Six months later: guidelines faculty actually use, because faculty helped write them."});
})();
(function silos(){
  const ss=$$("#silos .silo");if(!ss.length)return;const m=$("#silo-meter");
  const f=()=>{const n=ss.filter(s=>s.getAttribute("aria-pressed")==="true").length;m.textContent=n===0?"0 of 7 at the table. Every office is working alone.":n<7?`${n} of 7 at the table. Keep building the bridge.`:"All 7 at the table. An effective AI council is, above all, a bridge between silos."};
  ss.forEach(s=>s.addEventListener("click",()=>{s.setAttribute("aria-pressed",s.getAttribute("aria-pressed")!=="true");f()}));
})();

/* ---------------- chapter 12 ---------------- */
(function cycle(){
  const svg=$("#cycle-svg");if(!svg)return;const items=$$("#cycle-list li");let cur=0,hold=0;
  function draw(){svg.innerHTML="";const cx=190,cy=190,R=140;S("circle",{cx,cy,r:R,class:"arc"},svg);
    if(!reduce){const sp=S("circle",{cx,cy,r:R,class:"spin","stroke-dasharray":"60 820",transform:`rotate(-90 ${cx} ${cy})`},svg);S("animateTransform",{attributeName:"transform",type:"rotate",from:`-90 ${cx} ${cy}`,to:`270 ${cx} ${cy}`,dur:"13.2s",repeatCount:"indefinite"},sp)}
    const words=["Gather","Experiment","Share","Recognize","Institutionalize","Gather again"];
    items.forEach((li,i)=>{const a=-Math.PI/2+i*2*Math.PI/6;const x=cx+R*Math.cos(a),y=cy+R*Math.sin(a);const g=S("g",{class:"cn"+(i===cur?" on":""),"data-i":i},svg);S("circle",{cx:x,cy:y,r:26},g);const t=S("text",{x,y:y+6,"text-anchor":"middle"},g);t.textContent=i+1;g.addEventListener("click",()=>{set(i);hold=Date.now()})});
    const t=S("text",{x:cx,y:cy-4,"text-anchor":"middle","font-family":"Fraunces, Georgia, serif","font-weight":800,"font-size":22,fill:css("--ink")},svg);t.textContent=words[cur];const t2=S("text",{x:cx,y:cy+20,"text-anchor":"middle","font-family":"Caveat, cursive","font-size":19,fill:css("--red")},svg);t2.textContent=cur===5?"…and around again":"step "+(cur+1)+" of 6"}
  function set(i){cur=i;items.forEach((li,j)=>li.classList.toggle("on",j===i));draw()}
  items.forEach((li,i)=>li.addEventListener("click",()=>{set(i);hold=Date.now()}));set(0);
  if(!reduce)setInterval(()=>{if(Date.now()-hold>8000&&!document.hidden)set((cur+1)%6)},2200);
  document.addEventListener("aie:theme",draw);
})();
(function seating(){
  const box=$("#seating");if(!box)return;const D=[["Philosophy","--pen"],["Engineering","--red"],["Computer science","--ink"],["Biology","--pencil"]];
  function render(mode){box.innerHTML="";let pairs=0;for(let t=0;t<4;t++){const seats=[0,1,2,3].map(s=>mode==="mix"?(s+t)%4:t);for(let a=0;a<4;a++)for(let b=a+1;b<4;b++)if(seats[a]!==seats[b])pairs++;
    box.insertAdjacentHTML("beforeend",`<div style="text-align:center"><svg viewBox="0 0 120 120" style="width:100%;max-width:150px;height:auto" aria-label="Table ${t+1}: ${seats.map(s=>D[s][0]).join(", ")}"><circle cx="60" cy="60" r="28" fill="var(--sheet)" stroke="var(--ink)" stroke-width="1.5"/>${seats.map((s,i)=>{const a=-Math.PI/2+i*Math.PI/2;return `<circle cx="${60+45*Math.cos(a)}" cy="${60+45*Math.sin(a)}" r="11" fill="var(${D[s][1]})"/>`}).join("")}<text x="60" y="65" text-anchor="middle" font-family="IBM Plex Mono, monospace" font-size="11" fill="var(--ink)">T${t+1}</text></svg></div>`)}
    box.insertAdjacentHTML("beforeend",`<div style="display:flex;flex-direction:column;gap:4px;justify-content:center;font-family:var(--f-mono);font-size:12px">${D.map(d=>`<span><i style="display:inline-block;width:10px;height:10px;border-radius:50%;background:var(${d[1]});margin-right:6px"></i>${d[0]}</span>`).join("")}</div>`);
    $("#seat-score").innerHTML=`<span class="hand" style="font-size:21px;color:var(${mode==="mix"?"--pen":"--red"})">${pairs} cross-department conversations possible</span>`;
    $$("[data-seat]").forEach(b=>b.classList.toggle("solid",b.dataset.seat===mode))}
  $$("[data-seat]").forEach(b=>b.addEventListener("click",()=>render(b.dataset.seat)));render("dept");
})();

/* ---------------- postscript ---------------- */
$$("#map-table tbody tr").forEach(tr=>{const cs=tr.dataset.c.split(" ");const on=v=>$$("#courses .course").forEach(c=>c.classList.toggle("hl",v&&cs.includes(c.dataset.c)));tr.addEventListener("mouseenter",()=>on(true));tr.addEventListener("mouseleave",()=>on(false));tr.addEventListener("click",()=>{on(true);$("#courses").scrollIntoView({behavior:reduce?"auto":"smooth",block:"center"})})});
(function settings(){
  const box=$("#setting-chips");if(!box)return;const rows=$$("#settings tbody tr");
  rows.forEach(r=>{const b=document.createElement("button");b.className="chip";b.type="button";b.dataset.s=$("td",r).textContent;b.textContent=$("td",r).textContent;b.setAttribute("aria-pressed","false");box.appendChild(b)});
  box.addEventListener("click",e=>{const b=e.target.closest(".chip");if(!b)return;$$(".chip",box).forEach(x=>x.setAttribute("aria-pressed",x===b));rows.forEach(r=>r.hidden=b.dataset.s!=="all"&&$("td",r).textContent!==b.dataset.s)});
})();

/* ---------------- coda ---------------- */
$$("[data-choose]").forEach(b=>b.addEventListener("click",()=>{const v=b.dataset.choose;store.set("coda.choice",v);$("#choose-out").textContent={closer:"Then hold on to it. And tell someone how it happened.",away:"You noticed. That's where choosing starts.",unsure:"Good. Keep asking it. Probably today."}[v];window.AIE.presetDir&&window.AIE.presetDir(v)}));
(function codaThread(){
  const cv=$("#coda-canvas");if(!cv)return;let drawn=0;
  function draw(p){const r=cv.getBoundingClientRect();const dpr=Math.min(2,devicePixelRatio||1);cv.width=r.width*dpr;cv.height=r.height*dpr;const c=cv.getContext("2d");c.scale(dpr,dpr);c.clearRect(0,0,r.width,r.height);
    c.strokeStyle=css("--red");c.lineWidth=2;c.globalAlpha=.55;c.beginPath();const N=10;const pts=[];for(let i=0;i<=200*p;i++){const t=i/200;const x=t*r.width;const y=r.height*.12+t*r.height*.8+Math.sin(t*Math.PI*N)*38;pts.push([x,y]);i?c.lineTo(x,y):c.moveTo(x,y)}c.stroke();
    c.fillStyle=css("--red");c.globalAlpha=.8;for(let k=1;k<=N;k++){const t=(k-.5)/N;if(t>p)break;const x=t*r.width,y=r.height*.12+t*r.height*.8+Math.sin(t*Math.PI*N)*38;c.beginPath();c.arc(x,y,4.5,0,7);c.fill()}}
  const go=()=>{if(drawn)return;drawn=1;if(reduce){draw(1);return}let p=0;const st=()=>{p=Math.min(1,p+.012);draw(p);if(p<1)requestAnimationFrame(st)};st()};
  draw(1);
  if("IntersectionObserver" in window){const io=new IntersectionObserver(es=>{if(es[0].isIntersecting){go();io.disconnect()}},{threshold:.25});io.observe(cv)}
  window.addEventListener("resize",()=>draw(1));document.addEventListener("aie:theme",()=>draw(1));
})();

/* ---------------- copy / clear / toolkit ---------------- */
function colHead(el){const td=el.closest("td");const tr=el.closest("tr");const tbl=el.closest("table");if(!td||!tbl)return "";const i=Array.from(tr.children).indexOf(td);const th=$$("thead th",tbl)[i];return th?th.textContent.trim():""}
function rowHead(el){const tr=el.closest("tr");return tr?$("td",tr).textContent.trim():""}
function exportWS(ws){
  const ch=ws.dataset.ch;const lines=[`## Chapter ${ch} · ${ws.dataset.tool}`];
  $$("[data-save],[data-k]",ws).forEach(el=>{const k=el.dataset.save||el.dataset.k;let v=store.get(k);if(v===undefined)return;if(v===true)v="✓";
    let lab=el.getAttribute("aria-label")||"";if(!lab&&el.closest("tr")&&el.closest("table"))lab=`${rowHead(el)} / ${colHead(el)}`;if(!lab)lab=el.placeholder||k;
    if(el.closest("tr")&&el.dataset.k&&!el.getAttribute("aria-label"))lab=`${rowHead(el)} / ${colHead(el)}`;lines.push(`- ${lab}: ${v}`)});
  if(ch==="1")$$("#audit tbody tr").forEach(tr=>{const v=store.get(`ch1.audit.${tr.dataset.row}.verdict`);if(v)lines.push(`- Verdict for ${$("td",tr).textContent}: ${v}`)});
  const ex=window.AIE["ex"+ch];if(ex){const t=ex();if(t)lines.push(t)}
  if(ch==="7"){const nv=store.get("ch7.never",[]);if(nv.length)lines.push("Sentences I'd never say:\n"+nv.map(s=>"  • "+s).join("\n"))}
  return lines.length>1?lines.join("\n"):"";
}
function exportAll(){const parts=["# AI Encounters · My Toolkit",""];$$(".worksheet[data-tool]").forEach(ws=>{const t=exportWS(ws);if(t)parts.push(t,"")});
  for(let c=1;c<=12;c++){const qs=[1,2,3].map(i=>store.get(`ch${c}.q${i}`)).map((v,i)=>v?`  Q${i+1}: ${v}`:"").filter(Boolean);const tr=store.get(`ch${c}.tried`);if(qs.length||tr)parts.push(`## Chapter ${c} · reflections`,...qs,tr?"  ✓ Tried the Try This activity":"","")}
  return parts.join("\n")}
document.addEventListener("click",e=>{
  const cp=e.target.closest("[data-copy-tool]");if(cp){const t=exportWS(cp.closest(".worksheet"));t?copyText(t):toast("Nothing filled in yet")}
  const cl=e.target.closest("[data-clear-tool]");if(cl){if(!cl._armed){cl._armed=1;const o=cl.textContent;cl.textContent="Click again to clear";setTimeout(()=>{cl._armed=0;cl.textContent=o},3000);return}
    const ws=cl.closest(".worksheet");$$("[data-save],[data-k]",ws).forEach(el=>{const k=el.dataset.save||el.dataset.k;store.set(k,null);if(el.dataset.save){el.type==="checkbox"?el.checked=false:el.value=""}else $$("button",el).forEach(b=>b.setAttribute("aria-pressed","false"))});
    const c=window.AIE["clr"+ws.dataset.ch];if(c)c();if(ws.dataset.ch==="7"){store.set("ch7.never",null);voiceCheck()}emit(ws);cl._armed=0;cl.textContent="Clear";toast("Cleared")}
});

/* ---------------- drawers ---------------- */
const scrim=$("#scrim");let openD=null;
function openDrawer(id){closeDrawer();const d=$("#"+id);if(!d)return;if(id==="kit-drawer")renderKit();if(id==="toc-drawer")renderToc();d.classList.add("open");d.setAttribute("aria-hidden","false");scrim.classList.add("on");openD=d;setTimeout(()=>$("button,input,a",d)?.focus(),50)}
function closeDrawer(){if(!openD)return;openD.classList.remove("open");openD.setAttribute("aria-hidden","true");scrim.classList.remove("on");openD=null}
$("#open-toc")?.addEventListener("click",()=>openDrawer("toc-drawer"));$("#open-gloss")?.addEventListener("click",()=>openDrawer("gloss-drawer"));$("#open-kit")?.addEventListener("click",()=>openDrawer("kit-drawer"));
scrim?.addEventListener("click",closeDrawer);document.addEventListener("keydown",e=>{if(e.key==="Escape")closeDrawer()});
document.addEventListener("click",e=>{if(e.target.closest("[data-close]")||e.target.closest("[data-close-drawer]")||e.target.closest(".drawer .toc-list a"))closeDrawer();const o=e.target.closest("[data-open=kit]");if(o){e.preventDefault();openDrawer("kit-drawer")}});
function renderToc(){const seen=new Set(store.get("seen",[]));$("#toc-list").innerHTML=$$("[data-title]").map(s=>{const isAct=s.classList.contains("act");const ch=s.dataset.ch;return `<li class="${isAct?"actrow":""}"><a href="#${s.id}"><span class="n">${ch?"Ch. "+ch:isAct?"":"·"}</span><span>${esc(s.dataset.title.replace(/^Chapter \d+: /,""))}</span>${seen.has(s.id)?'<span class="ck">✓</span>':""}</a></li>`}).join("")}
function renderKit(){$("#kit-list").innerHTML=$$(".worksheet[data-tool]").map(ws=>{const ch=ws.dataset.ch;const has=!!exportWS(ws);return `<li><a href="#ch${ch}-tool"><span class="n">Ch. ${ch}</span><span>${esc(ws.dataset.tool)}</span>${has?'<span class="ck">started ✓</span>':""}</a></li>`}).join("")}
$("#kit-copy")?.addEventListener("click",()=>copyText(exportAll()));
$("#kit-dl")?.addEventListener("click",async()=>{const txt=exportAll();const dl=await cap("downloads");if(dl){try{await dl.save({filename:"ai-encounters-toolkit.md",data:txt});toast("Saved")}catch(e){toast("Save was cancelled")}return}
  try{const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([txt],{type:"text/markdown"}));a.download="ai-encounters-toolkit.md";document.body.appendChild(a);a.click();a.remove()}catch(e){copyText(txt)}});

/* ---------------- scroll: progress, threadline, where am I ---------------- */
const secs=$$("[data-title]");const rail=$("#rail"),rsvg=$("#rail-svg");let knots=[];
function buildRail(){if(!rail)return;$$(".knot",rail).forEach(k=>k.remove());rsvg.innerHTML="";const H=rail.clientHeight;if(!H)return;
  let d="";for(let y=0;y<=H;y+=6){const x=23+5*Math.sin(y/34);d+=(y?"L":"M")+x.toFixed(1)+" "+y}
  S("path",{d,fill:"none",stroke:css("--margin"),"stroke-width":1.5,opacity:.6},rsvg);
  const red=S("path",{d,fill:"none",stroke:css("--red"),"stroke-width":2.5,pathLength:1000,"stroke-dasharray":1000,"stroke-dashoffset":1000,id:"rail-red"},rsvg);
  const max=document.documentElement.scrollHeight-innerHeight;
  knots=secs.filter(s=>s.dataset.ch||s.classList.contains("act")||s.id==="coda"||s.id==="living").map(s=>{const b=document.createElement("button");const isAct=s.classList.contains("act");b.type="button";b.className="knot"+(isAct?" act":"");b.textContent=isAct?["I","II","III","IV","V"][+s.dataset.act-1]:"";
    const tip=document.createElement("span");tip.className="tip";tip.textContent=s.dataset.title;b.appendChild(tip);b.setAttribute("aria-label",s.dataset.title);
    const f=Math.min(1,Math.max(0,(s.offsetTop-80)/max));b.style.top=(f*H)+"px";b.addEventListener("click",()=>s.scrollIntoView({behavior:reduce?"auto":"smooth"}));rail.appendChild(b);return {b,s,f}})}
let ticking=false;
function onScroll(){if(ticking)return;ticking=true;requestAnimationFrame(()=>{ticking=false;const max=document.documentElement.scrollHeight-innerHeight;const f=max>0?scrollY/max:0;
  $("#progress").style.width=(f*100)+"%";const red=$("#rail-red");if(red)red.setAttribute("stroke-dashoffset",1000-f*1000);
  knots.forEach(k=>k.b.classList.toggle("done",f>=k.f-.002));
  let cur=null;for(const s of secs){if(s.getBoundingClientRect().top<innerHeight*.35)cur=s}$("#where").textContent=cur?cur.dataset.title:"Cover";
  if(cur){const seen=store.get("seen",[]);if(!seen.includes(cur.id)){seen.push(cur.id);store.set("seen",seen)}}})}
addEventListener("scroll",onScroll,{passive:true});
let rT;addEventListener("resize",()=>{clearTimeout(rT);rT=setTimeout(()=>{buildRail();onScroll()},200)});
document.addEventListener("aie:theme",buildRail);

/* ---------------- init ---------------- */
bind();auditVerdicts();frictionWarn();sparPrompts();voiceCheck();voiceAudit();
window.AIE.renderEchoes();
window.addEventListener("load",()=>{buildRail();onScroll()});setTimeout(()=>{buildRail();onScroll()},600);
if("fonts" in document)document.fonts.ready.then(()=>{buildRail();onScroll()});
})();
