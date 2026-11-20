(function(){
"use strict";
const {store,$,$$,esc,toast,dictate}=window.AIE;
const reduce=window.matchMedia&&matchMedia("(prefers-reduced-motion: reduce)").matches;
const CH_TITLES=["The Ghost in the Mill","The Anatomy of Meaningful Work","The Architecture of Friction","The Sparring Partner","Unmasking the Oracle","Reading the Hidden Code","The Sovereign Voice","The Architecture of the Handshake","The Human Bridge","Standing in the Arena","Leading Through the Fog","The Gathering Ground"];
const ACT_OF=[1,1,1,2,2,2,3,3,4,4,5,5];
const WHO=["Marguerite & Dev","Jordan","Sam","Aisha","Dr. Okafor & Lena","Marcus, Priya & Teresa","Rosa","An English department","Eli","Nadia","A provost","Three professors"];
const CLICHES=/\b(in today['’]s fast-paced world|passionate about|proven track record|leverag(e|ing)|delv(e|ing)|driving impact|cross-functional collaboration)\b/gi;
const PUBLIC=["title","story","question","chose","dir","chs","course","major","name","createdAt"];
const pick=(o,ks)=>{const r={};ks.forEach(k=>{if(o[k]!==undefined)r[k]=o[k]});return r};
const newId=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,7);

/* founding threads: the book's own twelve Encounters, read from the page */
const BOOK=$$(".encounter[data-ch]").map(enc=>{const ch=+enc.dataset.ch;const ps=$$("p",enc).map(p=>p.textContent.trim());const th=$(".thought",enc);
  return {id:"book-"+ch,book:true,title:CH_TITLES[ch-1],name:WHO[ch-1],story:ps.join("\n\n"),question:th?th.textContent:"",chs:[ch],dir:"book",createdAt:0}});

/* =====================================================================
   Storage. Published as a claude.ai artifact (db capability):
     stories/<id>                approved, public          read: view  write: admin
     submissions/<uid>           {items:[…]} one per student  read/write: that student + admins
     res/<uid>                   {ids:[…]} "me too"s        read: view  write: that viewer
     flags/<uid>                 {ids:[…]} reader flags     read: admin write: that viewer
   Anywhere else: a single-browser preview where you play both roles.
   ===================================================================== */
const LKEY="aie:collection";
const Store={
  mode:"local",db:null,uid:null,isMod:false,canWrite:true,listeners:[],
  approved:[],mine:[],subs:{},res:{},flags:{},
  async init(){
    const inArtifact=window.claude&&typeof window.claude.use==="function";
    const isLocal=/^(localhost|127\.0\.0\.1|\[::1\]|)$/.test(location.hostname)&&!/[?&]bridge\b/.test(location.search);
    if(!inArtifact&&!isLocal){this.mode="bridge";this.isMod=false;this.uid=null;bridge();setState("bridge");this.emit();return}
    this.loadLocal();this.emit();
    if(!inArtifact){setState("local");return}
    setState("connecting");
    let db=null;try{db=await window.claude.use("db")}catch(e){}
    if(!db){setState("local");return}
    this.db=db;this.mode="db";this.isMod=false;this.approved=[];this.mine=[];this.subs={};this.res={};this.flags={};
    let user=null;try{user=await window.claude.use("user")}catch(e){}
    if(user){try{this.uid=await user.id()}catch(e){}try{this.isMod=!!((await user.isOwner())||(await user.canEdit()))}catch(e){}try{if((await user.can("data.write"))===false)this.canWrite=false}catch(e){}}
    const timer=setTimeout(()=>setState("slow"),10000);
    const fail=e=>{clearTimeout(timer);setState("error",e&&e.code)};
    db.collection("stories").orderBy("createdAt","desc").limit(500).onSnapshot(s=>{clearTimeout(timer);this.approved=s.docs.map(d=>Object.assign({id:d.id},d.data()));setState(this.canWrite?"live":"readonly");this.emit()},fail);
    db.collection("res").onSnapshot(s=>{this.res={};s.docs.forEach(d=>this.res[d.id]=(d.data().ids||[]));this.emit()},()=>{});
    if(this.uid&&this.canWrite)db.doc("submissions/"+this.uid).onSnapshot(d=>{this.mine=(d.exists&&d.data().items)||[];this.emit()},()=>{});
    if(this.isMod){
      db.collection("submissions").onSnapshot(s=>{this.subs={};s.docs.forEach(d=>this.subs[d.id]=d.data().items||[]);this.emit()},()=>{});
      db.collection("flags").onSnapshot(s=>{this.flags={};s.docs.forEach(d=>this.flags[d.id]=d.data().ids||[]);this.emit()},()=>{});
    }
  },
  loadLocal(){let o={};try{o=JSON.parse(localStorage.getItem(LKEY)||"{}")}catch(e){}this.mine=o.mine||[];this.approved=o.approved||[];this.res={me:o.res||[]};this.flags={me:o.flags||[]};this.uid="me";this.isMod=true;this.subs={me:this.mine}},
  saveLocal(){try{localStorage.setItem(LKEY,JSON.stringify({mine:this.mine,approved:this.approved,res:this.res.me||[],flags:this.flags.me||[]}))}catch(e){}this.subs={me:this.mine};this.emit()},
  emit(){this.listeners.forEach(f=>f())},
  resCount(id){let n=0;for(const k in this.res)if(this.res[k].includes(id))n++;return n},
  flagCount(id){let n=0;for(const k in this.flags)if(this.flags[k].includes(id))n++;return n},
  iRes(id){return (this.res[this.uid]||[]).includes(id)},
  iFlag(id){return (this.flags[this.uid]||[]).includes(id)},
  /* student: send a story to the queue */
  async submit(s){
    const item=Object.assign({id:newId(),status:"pending",createdAt:Date.now()},s);
    if(this.mode==="db"){const items=this.mine.concat(item);await this.db.doc("submissions/"+this.uid).set({items})}
    else{this.mine.push(item);this.saveLocal()}
  },
  /* student: withdraw (pending → gone; approved → ask for removal) */
  async withdraw(id){
    const it=this.mine.find(x=>x.id===id);if(!it)return;
    const items=it.status==="pending"?this.mine.filter(x=>x.id!==id):this.mine.map(x=>x.id===id?Object.assign({},x,{removeRequested:true}):x);
    if(this.mode==="db")await this.db.doc("submissions/"+this.uid).set({items});else{this.mine=items;this.saveLocal()}
  },
  /* moderator: approve / decline / take down / keep */
  async setStatus(owner,id,patch){
    const items=(this.subs[owner]||[]).map(x=>x.id===id?Object.assign({},x,patch,{decidedAt:Date.now()}):x);
    if(this.mode==="db")await this.db.doc("submissions/"+owner).set({items});else{this.mine=items;this.saveLocal()}
  },
  async approve(owner,item){
    const pub=Object.assign(pick(item,PUBLIC),{approvedAt:Date.now()});
    if(this.mode==="db")await this.db.doc("stories/"+item.id).set(pub);else{this.approved=this.approved.filter(x=>x.id!==item.id).concat(Object.assign({id:item.id},pub))}
    await this.setStatus(owner,item.id,{status:"approved",note:"",removeRequested:false});
  },
  async decline(owner,item,note){await this.setStatus(owner,item.id,{status:"declined",note:note||""})},
  async takeDown(owner,id,note){
    if(this.mode==="db")await this.db.doc("stories/"+id).delete();else this.approved=this.approved.filter(x=>x.id!==id);
    if(owner)await this.setStatus(owner,id,{status:"removed",note:note||"",removeRequested:false});else if(this.mode!=="db")this.saveLocal();
  },
  async keep(id){const n=this.flagCount(id);if(this.mode==="db")await this.db.doc("stories/"+id).update({reviewedFlags:n});else{const s=this.approved.find(x=>x.id===id);if(s)s.reviewedFlags=n;this.saveLocal()}},
  /* readers */
  async toggleRes(id){const cur=this.res[this.uid]||[];const ids=cur.includes(id)?cur.filter(x=>x!==id):cur.concat(id);if(this.mode==="db")await this.db.doc("res/"+this.uid).set({ids});else{this.res.me=ids;this.saveLocal()}},
  async flag(id){const cur=this.flags[this.uid]||[];if(cur.includes(id))return;const ids=cur.concat(id);if(this.mode==="db")await this.db.doc("flags/"+this.uid).set({ids});else{this.flags.me=ids;this.saveLocal()}}
};
/* hosted outside claude.ai (e.g. GitHub Pages): send students to the live collection */
const LIVE_URL="https://claude.ai/artifact/4Jk5MwZ5TFNxPvi36DdVW9";
function bridge(){
  const c=$(".compose");if(!c)return;
  c.innerHTML=`<div class="worksheet"><div class="ws-head"><span class="stamp">Your Encounter</span></div>
    <h3 style="font-size:28px;font-weight:800;margin-bottom:6px">Add yours on the live collection</h3>
    <p style="font-size:16px;color:var(--ink-2)">Students in HCAI courses share their encounters on the live edition of this book, where an instructor reviews each one before it's woven onto the loom. You'll write it the same way the book does: what happened, the question it left you with, what you chose, and whether it brought you closer or carried you away.</p>
    <p><a class="btn solid" href="${LIVE_URL}" target="_blank" rel="noopener">Open the live collection ↗</a></p>
    <p class="hand" style="font-size:20px;color:var(--pencil);line-height:1.2;margin:0">You'll need to be signed in to claude.ai with access your instructor gives you.</p></div>`;
  window.AIE.tell=()=>{};
}
function setState(st){
  const el=$("#store-state");if(!el)return;const txt={
    bridge:"This copy shows the book's twelve founding threads. Student stories are on the live collection, linked on this page.",
    local:"Local preview: stories stay in this browser, and you're seeing the moderator view so you can try the review flow. Once it's published with shared storage, students only see their own submissions and approved stories.",
    connecting:"Connecting to the shared collection…",
    slow:"Still connecting to the shared collection. Stories will appear when it answers.",
    live:"Live: approved stories from every student appear here as they're added.",
    readonly:"You can read the collection. Your account can't send stories yet, so ask your instructor for contributor access.",
    error:"Couldn't reach the shared collection right now. Try reloading in a minute."}[st];
  el.classList.toggle("live",st==="live");$("span",el).textContent=txt;
  if(st==="readonly")$("#sf-submit").disabled=true;
}

/* ---------------- cards ---------------- */
function card(s,opts={}){
  const dir=s.book?"book":s.dir||"unsure";const date=s.book?`Chapter ${s.chs[0]}`:new Date(s.createdAt).toLocaleDateString(undefined,{month:"short",day:"numeric",year:"numeric"});
  const tags=(s.chs||[]).map(c=>`<a href="#ch${c}">Ch. ${c}</a>`).join("")+(s.course?`<span>${esc(s.course)}</span>`:"")+(s.major?`<span>${esc(s.major)}</span>`:"");
  const story=s.book?esc(s.story.split("\n\n")[0])+` <a href="#ch${s.chs[0]}" class="hand" style="font-size:19px">keep reading →</a>`:esc(s.story).replace(/\n/g,"<br>");
  const dirLabel={closer:'<span class="dirl" style="color:var(--pen)">closer</span>',away:'<span class="dirl" style="color:var(--red)">away</span>',unsure:'<span class="dirl" style="color:var(--pencil)">not sure yet</span>',book:'<span class="dirl" style="color:var(--pencil)">from the book</span>'}[dir];
  let actions="";
  if(opts.wall&&!s.book){const n=Store.resCount(s.id);actions=`<button type="button" data-res="${esc(s.id)}" class="${Store.iRes(s.id)?"me":""}">✋ me too${n?` · ${n}`:""}</button><button type="button" data-flag="${esc(s.id)}">${Store.iFlag(s.id)?"flagged":"flag"}</button>`}
  if(opts.foot)actions=opts.foot;
  return `<article class="story ${dir==="book"?"book":dir}" id="${opts.wall?"story-":"rv-"}${esc(s.id)}">${s.book?'<span class="book-tag">from the book</span>':""}
    <div class="sh"><span class="who">${esc(s.name||"Anonymous")}</span><span class="dt">${esc(date)}</span></div>
    ${s.title?`<h5>${esc(s.title)}</h5>`:""}<p>${story}</p>
    ${s.question?`<p class="qq">"${esc(s.question)}"</p>`:""}
    ${s.chose?`<p class="chose">↳ ${esc(s.chose)}</p>`:""}
    <div class="tags">${tags}</div><div class="sf">${actions}${dirLabel}</div></article>`;
}

/* ---------------- the public wall ---------------- */
const filt={q:"",ch:"",course:"",dir:"",sort:"new",book:true};
window.AIE.countFor=ch=>Store.approved.filter(s=>(s.chs||[]).includes(ch)).length;
function renderWall(){
  const box=$("#stories");if(!box)return;const q=filt.q.toLowerCase();
  let list=Store.approved.slice();if(filt.book)list=list.concat(BOOK);
  list=list.filter(s=>(!filt.ch||(s.chs||[]).includes(+filt.ch))&&(!filt.course||s.course===filt.course)&&(!filt.dir||s.dir===filt.dir)&&(!q||[s.title,s.story,s.question,s.chose,s.name,s.major,s.course].join(" ").toLowerCase().includes(q)));
  list.sort((a,b)=>{if(!!a.book!==!!b.book)return a.book?1:-1;if(a.book)return a.chs[0]-b.chs[0];return filt.sort==="res"?Store.resCount(b.id)-Store.resCount(a.id)||b.createdAt-a.createdAt:b.createdAt-a.createdAt});
  const students=list.filter(s=>!s.book).length;let head="";
  if(Store.mode==="bridge"&&!filt.q&&!filt.ch&&!filt.course&&!filt.dir)head=`<div class="empty-wall">Student encounters are on the <a href="${LIVE_URL}" target="_blank" rel="noopener">live collection ↗</a>. The book's twelve founding threads are below.</div>`;
  else if(!students&&!filt.q&&!filt.ch&&!filt.course&&!filt.dir)head=`<div class="empty-wall">No student encounters on the wall yet. The book's twelve are below. Yours can be the first thread. ←</div>`;
  else if(!list.length)head=`<div class="empty-wall">Nothing matches those filters yet.</div>`;
  box.innerHTML=head+list.map(s=>card(s,{wall:true})).join("");
  window.AIE.renderEchoes&&window.AIE.renderEchoes();
}
$("#stories")?.addEventListener("click",async e=>{
  const r=e.target.closest("[data-res]"),f=e.target.closest("[data-flag]");
  try{
    if(r)await Store.toggleRes(r.dataset.res);
    if(f&&!Store.iFlag(f.dataset.flag)){await Store.flag(f.dataset.flag);toast("Thanks. An instructor will take a look.")}
  }catch(err){toast("That didn't go through. Try again in a moment.")}
});
(function filters(){
  const ch=$("#fl-ch");CH_TITLES.forEach((t,i)=>ch.insertAdjacentHTML("beforeend",`<option value="${i+1}">Ch. ${i+1} · ${esc(t)}</option>`));
  const map={"fl-q":"q","fl-ch":"ch","fl-course":"course","fl-dir":"dir","fl-sort":"sort"};
  Object.entries(map).forEach(([id,k])=>$("#"+id).addEventListener("input",e=>{filt[k]=e.target.value;renderWall()}));
  $("#fl-book").addEventListener("click",e=>{filt.book=!filt.book;e.currentTarget.setAttribute("aria-pressed",filt.book);renderWall()});
  window.AIE.filterTo=n=>{filt.ch=String(n);$("#fl-ch").value=String(n);renderWall()};
})();

/* ---------------- your submissions ---------------- */
const STATUS={pending:"waiting for review",approved:"on the wall",declined:"not approved",removed:"taken down",withdrawn:"withdrawn"};
function renderMine(){
  const box=$("#mine");if(!box)return;const items=Store.mine.slice().sort((a,b)=>b.createdAt-a.createdAt);
  box.hidden=!items.length;if(!items.length)return;
  $("#mine-list").innerHTML=items.map(it=>{const st=it.removeRequested&&it.status==="approved"?"removal requested":STATUS[it.status]||it.status;
    const btn=it.status==="pending"?`<button type="button" data-wd="${esc(it.id)}">withdraw it</button>`:it.status==="approved"&&!it.removeRequested?`<button type="button" data-wd="${esc(it.id)}">ask to take it down</button>`:"";
    return `<li><span class="t">${esc(it.title||it.story)}</span><span class="pill ${esc(it.status)}">${esc(st)}</span>${it.note?`<span class="note">Instructor's note: ${esc(it.note)}</span>`:""}${btn}</li>`}).join("");
}
$("#mine-list")?.addEventListener("click",async e=>{const b=e.target.closest("[data-wd]");if(!b)return;
  if(!b._armed){b._armed=1;const o=b.textContent;b.textContent="click again to confirm";setTimeout(()=>{b._armed=0;b.textContent=o},3000);return}
  try{await Store.withdraw(b.dataset.wd);toast("Done")}catch(err){toast("That didn't go through. Try again in a moment.")}});

/* ---------------- review queue (moderators) ---------------- */
let rTab="pending";
function queue(){
  const all=[];for(const owner in Store.subs)(Store.subs[owner]||[]).forEach(it=>all.push({owner,it}));
  const pending=all.filter(x=>x.it.status==="pending").sort((a,b)=>a.it.createdAt-b.it.createdAt);
  const removal=all.filter(x=>x.it.status==="approved"&&x.it.removeRequested);
  const flagged=Store.approved.filter(s=>Store.flagCount(s.id)>(s.reviewedFlags||0)).map(s=>({owner:(all.find(x=>x.it.id===s.id)||{}).owner,it:s,flagged:Store.flagCount(s.id)}));
  const decided=all.filter(x=>x.it.status!=="pending").sort((a,b)=>(b.it.decidedAt||0)-(a.it.decidedAt||0)).slice(0,40);
  return {pending,attention:removal.map(x=>Object.assign(x,{why:"The student asked to take this down"})).concat(flagged.map(x=>Object.assign(x,{why:`Flagged by ${x.flagged} reader${x.flagged>1?"s":""}`}))),decided};
}
function renderReview(){
  const sec=$("#review");if(!sec)return;sec.hidden=!Store.isMod;if(!Store.isMod)return;
  const Q=queue();const n=Q.pending.length+Q.attention.length;const b=$("#review-badge");b.textContent=n?`${n} to review`:"all caught up";b.classList.toggle("zero",!n);
  $$("#review-tabs [data-rt]").forEach(c=>{c.setAttribute("aria-pressed",c.dataset.rt===rTab);const k=c.dataset.rt;c.textContent={pending:"Waiting",attention:"Needs attention",decided:"Decided"}[k]+(k!=="decided"&&Q[k].length?` · ${Q[k].length}`:"")});
  if(Store.mode==="local")$("#review-note").textContent="Local preview: your own test submissions land here so you can try approving and declining. Once published, only you and your Editors see this panel.";
  const list=Q[rTab];
  const empty={pending:"Nothing waiting. New submissions show up here first.",attention:"No flags or take-down requests.",decided:"Nothing decided yet."}[rTab];
  $("#review-list").innerHTML=list.length?list.map(({owner,it,why})=>{
    const key=esc((owner||"")+"|"+it.id);
    let acts="";
    if(rTab==="pending")acts=`<button class="btn small solid" type="button" data-act="approve" data-key="${key}">Approve</button><button class="btn small redb" type="button" data-act="decline" data-key="${key}">Decline</button><input type="text" maxlength="200" placeholder="optional note to the student" aria-label="Note to the student" data-note="${key}">`;
    else if(rTab==="attention")acts=`<button class="btn small redb" type="button" data-act="down" data-key="${key}">Take it down</button>`+(why.startsWith("Flagged")?`<button class="btn small" type="button" data-act="keep" data-key="${key}">Keep it up</button>`:"")+`<input type="text" maxlength="200" placeholder="optional note to the student" aria-label="Note to the student" data-note="${key}">`;
    else acts=`<span class="pill ${esc(it.status)}">${esc(STATUS[it.status]||it.status)}</span>`+(it.status==="approved"?`<button class="btn small" type="button" data-act="down" data-key="${key}">Take it down</button>`:it.status==="declined"||it.status==="removed"?`<button class="btn small" type="button" data-act="approve" data-key="${key}">Approve after all</button>`:"")+(it.note?`<span class="rv-status" style="flex-basis:100%;color:var(--ink-2)">note: ${esc(it.note)}</span>`:"");
    return `<div class="rv">${why?`<span class="rv-why">${esc(why)}</span>`:""}${card(it,{foot:" "})}<div class="rv-actions">${acts}</div></div>`}).join(""):`<div class="empty-wall">${empty}</div>`;
}
$("#review-tabs")?.addEventListener("click",e=>{const c=e.target.closest("[data-rt]");if(!c)return;rTab=c.dataset.rt;renderReview()});
$("#review-list")?.addEventListener("click",async e=>{
  const b=e.target.closest("[data-act]");if(!b)return;const [owner,id]=b.dataset.key.split("|");
  const note=($(`[data-note="${CSS.escape(b.dataset.key)}"]`)||{}).value||"";
  const it=(Store.subs[owner]||[]).find(x=>x.id===id)||Store.approved.find(x=>x.id===id);if(!it)return;
  b.disabled=true;
  try{
    if(b.dataset.act==="approve"){await Store.approve(owner,it);toast("Approved. It's on the wall.")}
    if(b.dataset.act==="decline"){await Store.decline(owner,it,note);toast("Declined. The student will see your note.")}
    if(b.dataset.act==="down"){await Store.takeDown(owner||null,id,note);toast("Taken down")}
    if(b.dataset.act==="keep"){await Store.keep(id);toast("Kept on the wall")}
  }catch(err){b.disabled=false;toast(err&&err.code==="invalid_argument"?"Your account can't moderate this collection.":"That didn't go through. Try again in a moment.")}
});

/* ---------------- the loom ---------------- */
const Loom=(function(){
  const cv=$("#loom"),wrap=$("#loom-wrap"),tip=$("#loom-tip");if(!cv)return {set(){},draw(){}};
  let threads=[],W=0,H=340,anim=new Map(),hover=-1,raf=0;
  const COL={closer:"#8ea7ff",away:"#ff8a78",unsure:"#c9c3b6",book:"rgba(244,239,228,.38)"};
  const ACTC=["#e3a29a","#8ea7ff","#f6e27a","#9fd3b5","#c4a6ff"];
  function layout(){const r=wrap.getBoundingClientRect();W=r.width;H=W<560?300:340;const dpr=Math.min(2,devicePixelRatio||1);cv.width=W*dpr;cv.height=H*dpr;cv.style.height=H+"px";cv.getContext("2d").setTransform(dpr,0,0,dpr,0,0)}
  const PADX=()=>Math.max(28,W*.06),TOP=56,BOT=40;
  const xOf=ch=>PADX()+(ch-1)*((W-2*PADX())/11);
  function set(items){const stu=items.slice().sort((a,b)=>b.createdAt-a.createdAt).slice(0,48).reverse();threads=BOOK.concat(stu);stu.forEach(t=>{if(!anim.has(t.id))anim.set(t.id,reduce?1:0)});$("#loom-count").textContent=`${stu.length} student ${stu.length===1?"thread":"threads"} · 12 from the book`;kick()}
  function yOf(i){const n=threads.length;const span=H-TOP-BOT;return TOP+(n<=1?span/2:i*(span/(n-1)))}
  function draw(){const c=cv.getContext("2d");c.clearRect(0,0,W,H);
    for(let ch=1;ch<=12;ch++){const x=xOf(ch);c.strokeStyle=ACTC[ACT_OF[ch-1]-1];c.globalAlpha=.55;c.lineWidth=2;c.beginPath();c.moveTo(x,TOP-14);c.lineTo(x,H-BOT+8);c.stroke();c.globalAlpha=.85;c.fillStyle="rgba(244,239,228,.75)";c.font="11px 'IBM Plex Mono', monospace";c.textAlign="center";c.fillText(ch,x,H-BOT+24)}
    threads.forEach((t,i)=>{const y=yOf(i);const p=t.book?1:(anim.get(t.id)??1);const col=COL[t.book?"book":(t.dir||"unsure")];const hi=i===hover;
      c.strokeStyle=col;c.lineWidth=hi?3.2:(t.book?1.2:2);c.globalAlpha=hi?1:(hover>=0?.35:.95);c.beginPath();const x0=PADX()-18,x1=W-PADX()+18;const xe=x0+(x1-x0)*p;
      for(let x=x0;x<=xe;x+=4){const yy=y+Math.sin((x/W)*Math.PI*6+i)*3;x===x0?c.moveTo(x,yy):c.lineTo(x,yy)}c.stroke();
      for(let ch=1;ch<=12;ch++){const x=xOf(ch);if(x>xe)break;if((ch+i)%2===0){c.globalAlpha=hover>=0&&!hi?.4:.9;c.strokeStyle=ACTC[ACT_OF[ch-1]-1];c.lineWidth=2;c.beginPath();c.moveTo(x,y-5);c.lineTo(x,y+5);c.stroke()}}
      (t.chs||[]).forEach(ch=>{const x=xOf(ch);if(x>xe)return;c.globalAlpha=hover>=0&&!hi?.45:1;c.fillStyle=col;c.beginPath();c.arc(x,y+Math.sin((x/W)*Math.PI*6+i)*3,hi?6:(t.book?3.5:4.5),0,7);c.fill()});
    });c.globalAlpha=1}
  function kick(){cancelAnimationFrame(raf);const step=()=>{let moving=false;anim.forEach((v,k)=>{if(v<1){anim.set(k,Math.min(1,v+.025));moving=true}});draw();if(moving)raf=requestAnimationFrame(step)};step()}
  function pickT(e){const r=cv.getBoundingClientRect();const y=e.clientY-r.top;let best=-1,bd=1e9;threads.forEach((t,i)=>{const d=Math.abs(yOf(i)-y);if(d<bd){bd=d;best=i}});return bd<Math.max(6,(H-TOP-BOT)/Math.max(1,threads.length)/1.4)?best:-1}
  cv.addEventListener("mousemove",e=>{const i=pickT(e);if(i!==hover){hover=i;draw()}if(i<0){tip.style.opacity=0;cv.style.cursor="default";return}cv.style.cursor="pointer";const t=threads[i];const r=wrap.getBoundingClientRect();
    tip.innerHTML=`<b>${esc(t.title||t.name||"Anonymous")}</b>${esc((t.story||"").slice(0,140))}${(t.story||"").length>140?"…":""}<br><small>${t.book?"from the book · Ch. "+t.chs[0]:esc((t.name||"Anonymous")+(t.course?" · "+t.course:""))} · echoes ${(t.chs||[]).map(c=>"Ch. "+c).join(", ")||"—"}</small>`;
    let x=e.clientX-r.left+14,y=e.clientY-r.top+14;if(x>r.width-310)x=e.clientX-r.left-310;if(y>r.height-120)y=e.clientY-r.top-120;tip.style.left=Math.max(8,x)+"px";tip.style.top=Math.max(8,y)+"px";tip.style.opacity=1});
  cv.addEventListener("mouseleave",()=>{hover=-1;tip.style.opacity=0;draw()});
  cv.addEventListener("click",e=>{const i=pickT(e);if(i<0)return;const t=threads[i];if(t.book){document.getElementById("ch"+t.chs[0]).scrollIntoView({behavior:reduce?"auto":"smooth"});return}const el=document.getElementById("story-"+t.id);if(el){el.scrollIntoView({behavior:reduce?"auto":"smooth",block:"center"});el.animate&&el.animate([{boxShadow:"0 0 0 4px var(--red)"},{boxShadow:"0 0 0 0 transparent"}],{duration:1600})}});
  addEventListener("resize",()=>{layout();draw()});layout();
  return {set,draw};
})();

/* ---------------- the form ---------------- */
(function form(){
  const f=$("#story-form");if(!f)return;const D="aie:draft";let draft={};try{draft=JSON.parse(localStorage.getItem(D)||"{}")}catch(e){}
  const fields={story:"#sf-story",question:"#sf-question",chose:"#sf-chose",course:"#sf-course",major:"#sf-major",name:"#sf-name",title:"#sf-title"};
  let dir=draft.dir||"",chs=new Set(draft.chs||[]);
  const picks=$("#sf-chs");CH_TITLES.forEach((t,i)=>picks.insertAdjacentHTML("beforeend",`<button type="button" data-c="${i+1}" aria-pressed="${chs.has(i+1)}" title="${esc(t)}">${i+1} · ${esc(t.replace(/^The /,""))}</button>`));
  Object.entries(fields).forEach(([k,s])=>{if(draft[k])$(s).value=draft[k];$(s).addEventListener("input",upd)});
  picks.addEventListener("click",e=>{const b=e.target.closest("button");if(!b)return;const c=+b.dataset.c;chs.has(c)?chs.delete(c):chs.add(c);b.setAttribute("aria-pressed",chs.has(c));upd()});
  const dirBs=$$("#sf-dir button");function setDir(v){dir=v;dirBs.forEach(b=>b.setAttribute("aria-pressed",b.dataset.v===v));upd()}
  dirBs.forEach(b=>b.addEventListener("click",()=>setDir(dir===b.dataset.v?"":b.dataset.v)));
  window.AIE.presetDir=v=>{if(!dir)setDir(v)};
  window.AIE.tell=ch=>{chs.add(ch);$$("#sf-chs button").forEach(b=>b.setAttribute("aria-pressed",chs.has(+b.dataset.c)));upd();setTimeout(()=>$("#sf-story").focus({preventScroll:true}),700)};
  function val(){const o={};Object.entries(fields).forEach(([k,s])=>o[k]=$(s).value.trim());o.dir=dir;o.chs=[...chs].sort((a,b)=>a-b);return o}
  function upd(){const v=val();try{localStorage.setItem(D,JSON.stringify(v))}catch(e){}
    $("#draft-saved").textContent=v.story?"draft saved ✓":"your draft autosaves";
    const n=(v.story.match(CLICHES)||[]).length+(v.chose.match(CLICHES)||[]).length;$("#sf-nudge").textContent=n?`Sovereign Voice check: ${n} phrase${n>1?"s":""} that sound${n>1?"":"s"} generated. Say it your way?`:"";
    $("#sf-preview").innerHTML=v.story?card(Object.assign({id:"preview",createdAt:Date.now()},v,{dir:v.dir||"unsure"}),{foot:'<span class="dirl" style="color:var(--pencil);margin-left:0">preview</span>'}):`<p class="hand" style="font-size:21px;color:var(--pencil);margin:0">Start writing and your card appears here, just as others will see it once it's approved.</p>`}
  setDir(dir);
  function reset(){Object.values(fields).forEach(s=>$(s).value="");chs.clear();$$("#sf-chs button").forEach(x=>x.setAttribute("aria-pressed","false"));setDir("");$("#sf-consent").checked=false;try{localStorage.removeItem(D)}catch(e){}upd()}
  $("#sf-clear").addEventListener("click",e=>{const b=e.currentTarget;if(!b._armed){b._armed=1;b.textContent="Click again to start over";setTimeout(()=>{b._armed=0;b.textContent="Start over"},3000);return}b._armed=0;b.textContent="Start over";reset();$("#sf-msg").textContent=""});
  f.addEventListener("submit",async e=>{e.preventDefault();const v=val();const msg=$("#sf-msg");msg.className="form-msg err";
    if(v.story.length<40){msg.textContent="Tell a little more of the story first (a few sentences).";$("#sf-story").focus();return}
    if(!v.dir){msg.textContent="Pick one in step 4: closer, away, or not sure yet.";return}
    if(!v.chs.length){msg.textContent="Choose at least one chapter it echoes in step 5.";return}
    if(!$("#sf-consent").checked){msg.textContent="Check the box to confirm it's yours to share.";return}
    if(Store.mode==="db"&&!Store.uid){msg.textContent="Sign in to claude.ai to send your story.";return}
    const btn=$("#sf-submit");btn.disabled=true;btn.textContent="Sending…";
    try{await Store.submit({title:v.title.slice(0,80),story:v.story.slice(0,1600),question:v.question.slice(0,200),chose:v.chose.slice(0,600),dir:v.dir,chs:v.chs,course:v.course,major:v.major.slice(0,60),name:v.name.slice(0,40)});
      msg.className="form-msg ok";msg.textContent="Sent for review. Thank you. Once an instructor approves it, it's woven onto the loom. You can check on it below.";
      reset();setTimeout(()=>$("#mine")?.scrollIntoView({behavior:reduce?"auto":"smooth",block:"center"}),300);
    }catch(err){msg.textContent=err&&err.code==="invalid_argument"?"Your account can't send stories yet. Ask your instructor for contributor access.":err&&err.code==="quota_exceeded"?"The collection is full right now. Let your instructor know.":"That didn't send. Check your connection and try again."}
    finally{btn.disabled=Store.mode==="db"&&!Store.canWrite;btn.textContent="Send it for review"}});

  /* speak it: dictation when published, browser speech recognition locally */
  (async function mic(){const b=$("#sf-mic");const ta=$("#sf-story");let d=null;try{d=await dictate()}catch(e){}
    const SR=window.SpeechRecognition||window.webkitSpeechRecognition;if(!d&&!SR)return;b.hidden=false;let base="",on=false,rec=null;
    const setOn=v=>{on=v;b.dataset.state=v?"listening":"";b.textContent=v?"■ Stop":"● Speak it"};
    if(d){d.onPartial(({text})=>{ta.value=base+text;upd()});d.onFinal(({text})=>{base=base+text+" ";ta.value=base;upd()});d.onState(({state})=>setOn(state==="listening"||state==="starting"))}
    b.addEventListener("click",()=>{if(on){d?d.stop().catch(()=>{}):rec&&rec.stop();setOn(false);return}base=ta.value?ta.value.replace(/\s*$/," "):"";
      if(d){d.start().catch(err=>{if(err&&err.code==="not_granted")b.hidden=true;setOn(false)});setOn(true);return}
      rec=new SR();rec.continuous=true;rec.interimResults=true;rec.onresult=ev=>{let fin="",int="";for(let i=ev.resultIndex;i<ev.results.length;i++){(ev.results[i].isFinal?(fin+=ev.results[i][0].transcript):(int+=ev.results[i][0].transcript))}if(fin)base+=fin+" ";ta.value=base+int;upd()};rec.onend=()=>setOn(false);rec.onerror=()=>setOn(false);try{rec.start();setOn(true)}catch(e){}});
  })();
})();

/* ---------------- go ---------------- */
Store.listeners.push(()=>{renderWall();renderMine();renderReview();Loom.set(Store.approved)});
document.addEventListener("aie:theme",()=>Loom.draw());
Store.init();
})();
