/* Shared by the client portal and the panel: constants, Supabase client, pauta rendering and exports. */
(function(){
const MESES=["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const DIAS=["domingo","segunda","terça","quarta","quinta","sexta","sábado"];
const DIAS_C=["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];
const FORMATOS=["Carrossel","Reels","Estático","Stories"];
const STATUS={enviada:"Aguardando resposta",aprovada:"Aprovada",revisao:"Pediu revisão",reprovada:"Reprovada"};
const RESP={aprovada:["Aprovar","Aprovada","✅"],revisao:["Pedir revisão","Pedido de revisão","✏️"],reprovada:["Reprovar","Reprovada","❌"]};
const $=s=>document.querySelector(s);
const esc=s=>String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const slug=s=>String(s||"").normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
const fslug=f=>slug(f);
const daysIn=(m,y)=>new Date(y,m+1,0).getDate();
const dow=(d,m,y)=>new Date(y,m,d).getDay();
const normCod=c=>String(c||"").toUpperCase().replace(/[^A-Z0-9]/g,"");
const cfg=window.PORTAL_CONFIG||{};

/* Supabase client; tests inject window.__SUPABASE_MOCK */
let _sb=null;
function sb(){
  if(_sb)return _sb;
  if(window.__SUPABASE_MOCK)return _sb=window.__SUPABASE_MOCK;
  if(!cfg.supabaseUrl||!cfg.supabaseAnonKey||!window.supabase)return null;
  return _sb=window.supabase.createClient(cfg.supabaseUrl,cfg.supabaseAnonKey);
}

function toast(t){const el=$("#toast");if(!el)return;el.textContent=t;el.hidden=false;clearTimeout(toast._t);toast._t=setTimeout(()=>el.hidden=true,2600)}
async function copy(text){try{await navigator.clipboard.writeText(text);toast("Copiado")}catch(e){const ta=document.createElement("textarea");ta.value=text;document.body.appendChild(ta);ta.select();try{document.execCommand("copy");toast("Copiado")}catch(_){toast("Selecione o texto e copie")}ta.remove()}}
function statusChip(s){return `<span class="chip-st st-${esc(s||"enviada")}">${esc(STATUS[s]||STATUS.enviada)}</span>`}
function sorted(p){return [...(p.posts||[])].sort((a,b)=>a.dia-b.dia||FORMATOS.indexOf(a.formato)-FORMATOS.indexOf(b.formato))}
function baixarArquivo(nome,blob){const u=URL.createObjectURL(blob);const a=document.createElement("a");a.href=u;a.download=nome;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),4000)}
/* Várias pautas no mesmo mês: "Novembro 2026 · Pauta 2". A ordem vem do número que o app grava (n). */
function nPauta(y){return +((y&&y.dados&&y.dados.n)||(y&&y.n))||0}
function irmasPauta(x,lista){return (lista||[]).filter(y=>y&&y.mes===x.mes&&y.ano===x.ano&&(x.token==null||y.token===x.token)).sort((a,b)=>(nPauta(a)-nPauta(b))||String(a.id).localeCompare(String(b.id)))}
function rotuloPauta(x,lista){const ir=irmasPauta(x,lista),i=ir.indexOf(x)+1;return `${MESES[x.mes]} ${x.ano}`+(ir.length>1&&i>0?` · Pauta ${i}`:"")}
function nomeArquivo(p){return `pauta-${slug(p.cliente)}-${slug(MESES[p.mes])}-${p.ano}${p.sufixo||""}`}

/* ---------- Pauta view (read-only) ---------- */
function Pauta(root,p,opts){
  this.root=root;this.p=p;this.opts=opts||{};this.filtroFormato="Todos";this.filtroPilar=null;this.openId=null;this.render();
}
Pauta.prototype.today=function(){const n=new Date(),p=this.p;return n.getFullYear()===p.ano&&n.getMonth()===p.mes?n.getDate():null};
Pauta.prototype.render=function(){
  const p=this.p,mes=MESES[p.mes],counts=FORMATOS.map(f=>[f,(p.posts||[]).filter(x=>x.formato===f).length]).filter(c=>c[1]);
  let h=`<section class="panel head"><div><p class="eyebrow"><span>${esc(p.arroba||p.nicho||"Pauta")}</span><span class="tag mes">${esc(p.rotulo||(mes+" "+p.ano))}</span>${this.opts.status?statusChip(this.opts.status):""}</p>
  <h1>${esc(p.cliente)}: pauta de ${mes.toLowerCase()}</h1>${p.estrategia&&p.estrategia.resumo?`<p class="sub">${esc(p.estrategia.resumo)}</p>`:""}</div>
  ${this.opts.mesesHTML||""}
  <div class="counts"><div class="count"><b>${(p.posts||[]).length}</b><span>posts no mês</span></div>${counts.map(([f,n])=>`<div class="count"><b>${n}</b><span><i class="dot f-${fslug(f)}"></i>${f}</span></div>`).join("")}</div>
  <div class="actions no-print"><button type="button" class="btn" data-x="pdf">Baixar PDF</button><button type="button" class="btn" data-x="html">Baixar HTML</button><button type="button" class="btn" data-x="print">Imprimir</button></div></section>`;
  h+=this.opts.antesHTML||"";
  h+=this.calendar()+this.postsHTML()+this.strategy()+this.profile();
  this.root.innerHTML=h;this.bind();
};
Pauta.prototype.bind=function(){
  const r=this.root,p=this.p;
  r.querySelectorAll("[data-post]").forEach(b=>b.onclick=()=>this.open(b.dataset.post));
  r.querySelectorAll("[data-filtro]").forEach(b=>b.onclick=()=>{this.filtroFormato=b.dataset.filtro;this.rerenderPosts()});
  r.querySelectorAll(".pillar").forEach(b=>b.onclick=()=>{this.filtroPilar=this.filtroPilar===b.dataset.pilar?null:b.dataset.pilar;r.querySelectorAll(".pillar").forEach(x=>x.setAttribute("aria-pressed",x.dataset.pilar===this.filtroPilar));this.rerenderPosts();if(this.filtroPilar)r.querySelector("#postsCard").scrollIntoView({behavior:"smooth",block:"start"})});
  r.querySelectorAll("[data-x]").forEach(b=>b.onclick=async()=>{const k=b.dataset.x;
    if(k==="print")return window.print();
    const t=b.textContent;b.disabled=true;b.textContent="Gerando…";
    try{if(k==="html")baixarArquivo(nomeArquivo(p)+".html",new Blob([pautaHTML(p)],{type:"text/html"}));else baixarArquivo(nomeArquivo(p)+".pdf",await pautaPDF(p))}
    catch(e){toast("Não foi possível gerar o arquivo. Tente de novo.")}
    b.disabled=false;b.textContent=t});
  if(this.opts.onRender)this.opts.onRender(r);
};
Pauta.prototype.rerenderPosts=function(){const c=this.root.querySelector("#postsCard");c.outerHTML=this.postsHTML();const n=this.root.querySelector("#postsCard");
  n.querySelectorAll("[data-post]").forEach(b=>b.onclick=()=>this.open(b.dataset.post));n.querySelectorAll("[data-filtro]").forEach(b=>b.onclick=()=>{this.filtroFormato=b.dataset.filtro;this.rerenderPosts()});
  const cl=n.querySelector("#clearPilar");if(cl)cl.onclick=()=>{this.filtroPilar=null;this.root.querySelectorAll(".pillar").forEach(x=>x.setAttribute("aria-pressed","false"));this.rerenderPosts()}};
Pauta.prototype.calendar=function(){
  const p=this.p,n=daysIn(p.mes,p.ano),first=dow(1,p.mes,p.ano),t=this.today(),byDay={},hol={};
  (p.posts||[]).forEach(x=>{(byDay[x.dia]=byDay[x.dia]||[]).push(x)});((p.estrategia&&p.estrategia.datas)||[]).forEach(d=>hol[d.dia]=d.nome);
  let c=DIAS_C.map(d=>`<div class="dow">${d}</div>`).join("");for(let i=0;i<first;i++)c+=`<div class="day empty" aria-hidden="true"></div>`;
  for(let d=1;d<=n;d++)c+=`<div class="day${d===t?" today":""}"><span class="n">${d}</span>${hol[d]?`<span class="hol">${esc(hol[d])}</span>`:""}${(byDay[d]||[]).map(x=>`<button type="button" class="pill f-${fslug(x.formato)}" data-post="${esc(x.id)}" aria-label="${esc(x.formato+", dia "+d+": "+(x.titulo||x.tema))}" title="${esc(x.formato+": "+(x.titulo||x.tema))}">${esc(x.formato)}</button>`).join("")}</div>`;
  return `<section class="panel card"><h2>Calendário</h2><p class="lead">Toque em um post para ver o conteúdo completo.</p><div class="cal-legend">${FORMATOS.filter(f=>(p.posts||[]).some(x=>x.formato===f)).map(f=>`<span><i class="dot f-${fslug(f)}"></i>${f}</span>`).join("")}</div><div class="cal">${c}</div></section>`};
Pauta.prototype.postsHTML=function(){
  const p=this.p,present=FORMATOS.filter(f=>(p.posts||[]).some(x=>x.formato===f));
  const list=sorted(p).filter(x=>(this.filtroFormato==="Todos"||x.formato===this.filtroFormato)&&(!this.filtroPilar||x.pilar===this.filtroPilar));
  return `<section class="panel card" id="postsCard"><div class="toolbar"><h2>Posts</h2>${present.length>1?`<div class="seg" role="group" aria-label="Filtrar por formato">${["Todos",...present].map(f=>`<button type="button" data-filtro="${f}" aria-pressed="${this.filtroFormato===f}">${f}</button>`).join("")}</div>`:""}</div>
  ${this.filtroPilar?`<p class="lead">Pilar: ${esc(this.filtroPilar)} · <button type="button" class="btn link" id="clearPilar">ver todos</button></p>`:""}
  <div class="posts">${list.map(x=>`<button type="button" class="post" data-post="${esc(x.id)}"><span class="pm"><i class="dot f-${fslug(x.formato)}"></i>${esc(x.formato)} · ${DIAS_C[dow(x.dia,p.mes,p.ano)]}, ${x.dia}/${p.mes+1}${x.pilar?" · "+esc(x.pilar):""}</span><h3>${esc(x.titulo||x.tema)}</h3><p>${esc(x.descricao||(x.ganchos||[])[0]||x.objetivo||"")}</p></button>`).join("")||`<p class="lead">Nenhum post com esse filtro.</p>`}</div></section>`};
Pauta.prototype.strategy=function(){
  const p=this.p,e=p.estrategia;if(!e)return "";const tm=(p.briefing&&p.briefing.temas)||[];
  return `<section class="panel card"><h2>Estratégia do mês</h2><p class="lead">${p.objetivo?`Objetivo: ${esc(p.objetivo)}. `:""}Toque em um pilar para ver só os posts dele.</p>
  <div class="pillars">${(e.pilares||[]).map(pl=>`<button type="button" class="pillar" data-pilar="${esc(pl.nome)}" aria-pressed="false"><span class="pt">${esc(pl.nome)}<span class="pct">${+pl.pct||0}%</span></span><span class="bar"><i style="width:${Math.min(100,+pl.pct||0)}%"></i></span><p>${esc(pl.descricao)}</p></button>`).join("")}</div>
  <div class="meta">${e.frequencia?`<span><b>Frequência</b> ${esc(e.frequencia)}</span>`:""}${(e.datas||[]).length?`<span><b>Datas do mês</b> ${e.datas.map(d=>`${+d.dia}/${p.mes+1} ${esc(d.nome)}`).join(" · ")}</span>`:""}${tm.length?`<span><b>Temas</b> ${tm.map(esc).join(" · ")}</span>`:""}</div></section>`};
Pauta.prototype.profile=function(){
  const pf=this.p.perfil;if(!pf||!(pf.resumo||(pf.produtos||[]).length))return "";const li=a=>`<ul>${a.map(x=>`<li>${esc(x)}</li>`).join("")}</ul>`;
  return `<section class="panel card"><h2>Como entendemos a sua marca</h2><p class="lead">${esc(pf.resumo)}</p><div class="facts">
  ${(pf.produtos||[]).length?`<div class="fact"><h4>Produtos e serviços</h4>${li(pf.produtos.slice(0,6))}</div>`:""}${pf.publico?`<div class="fact"><h4>Público</h4><p>${esc(pf.publico)}</p></div>`:""}
  ${pf.tom?`<div class="fact"><h4>Tom de voz</h4><p>${esc(pf.tom)}</p></div>`:""}${(pf.diferenciais||[]).length?`<div class="fact"><h4>Diferenciais</h4>${li(pf.diferenciais.slice(0,5))}</div>`:""}
  ${pf.visual?`<div class="fact"><h4>Identidade visual</h4><p>${esc(pf.visual)}</p></div>`:""}</div></section>`};
Pauta.prototype.open=function(id){this.openId=id;this.sheet();$("#scrim").hidden=false;document.body.style.overflow="hidden";setTimeout(()=>{const x=$("#sheet .x");x&&x.focus()},30)};
Pauta.prototype.close=function(){$("#scrim").hidden=true;document.body.style.overflow="";this.openId=null};
Pauta.prototype.sheet=function(){
  const p=this.p,list=sorted(p),i=list.findIndex(x=>x.id===this.openId),x=list[i];if(!x)return this.close();
  $("#sheet").innerHTML=`<div class="sh-top"><div class="t"><p class="eyebrow"><i class="dot f-${fslug(x.formato)}"></i>${esc(x.formato)}${x.pilar?" · "+esc(x.pilar):""}</p><h2 id="shTitle">${esc(x.titulo||x.tema)}</h2><p class="m">${DIAS[dow(x.dia,p.mes,p.ano)]}, ${x.dia} de ${MESES[p.mes].toLowerCase()}</p></div><button type="button" class="x" aria-label="Fechar">✕</button></div>
  <div class="sh-body">${postBody(x,true)}</div>
  <div class="sh-nav"><button type="button" class="btn link" id="prevP" ${i===0?"disabled":""}>‹ Anterior</button><span class="m">${i+1} de ${list.length}</span><button type="button" class="btn link" id="nextP" ${i===list.length-1?"disabled":""}>Próximo ›</button></div>`;
  $("#sheet .x").onclick=()=>this.close();
  $("#prevP").onclick=()=>{if(i>0){this.openId=list[i-1].id;this.sheet();$("#sheet").scrollTop=0}};
  $("#nextP").onclick=()=>{if(i<list.length-1){this.openId=list[i+1].id;this.sheet();$("#sheet").scrollTop=0}};
  $("#sheet").querySelectorAll("[data-copy]").forEach(b=>b.onclick=()=>{const k=b.dataset.copy;
    if(k==="slides")copy(x.slides.map((s,j)=>`${j+1}. ${s.titulo}\n${s.texto}`).join("\n\n"));
    if(k==="roteiro")copy(x.roteiro.map(r=>`[${r.tempo}] ${r.fala}\nCena: ${r.cena}${r.texto_tela?"\nNa tela: "+r.texto_tela:""}`).join("\n\n"));
    if(k==="telas")copy(x.telas.map((t,j)=>`Tela ${j+1}: ${t.texto}${t.recurso?" ("+t.recurso+")":""}`).join("\n"));
    if(k==="legenda")copy(x.legenda+((x.hashtags||[]).length?"\n\n"+x.hashtags.join(" "):""))})};
function ligarSheet(getView){
  $("#scrim").addEventListener("click",e=>{if(e.target.id==="scrim"){const v=getView();v&&v.close()}});
  document.addEventListener("keydown",e=>{const v=getView();if(!v||!v.openId)return;if(e.key==="Escape")v.close();
    if(e.key==="ArrowRight"){const n=$("#nextP");n&&!n.disabled&&n.click()}if(e.key==="ArrowLeft"){const b=$("#prevP");b&&!b.disabled&&b.click()}})}
function postBody(x,withCopy){
  const cp=k=>withCopy?` <button type="button" data-copy="${k}">Copiar</button>`:"";let b="";
  if(x.descricao)b+=`<div class="sec"><h5>O que é este post</h5><p class="desc">${esc(x.descricao)}</p></div>`;
  b+=`<div class="sec kv">${x.objetivo?`<div><b>Objetivo</b><span>${esc(x.objetivo)}</span></div>`:""}${x.horario?`<div><b>Quando vai ao ar</b><span>${esc(x.horario)}</span></div>`:""}${x.metrica?`<div><b>Como vamos medir</b><span>${esc(x.metrica)}</span></div>`:""}</div>`;
  if((x.producao||[]).length)b+=`<div class="sec"><h5>O que precisamos para produzir</h5><ul class="check">${x.producao.map(t=>`<li>${esc(t)}</li>`).join("")}</ul></div>`;
  if(x.visual)b+=`<div class="sec"><h5>Visual</h5><p class="desc">${esc(x.visual)}</p></div>`;
  if((x.ganchos||[]).length)b+=`<div class="sec"><h5>Frases de abertura</h5>${x.ganchos.map(g=>`<div class="hook">${esc(g)}</div>`).join("")}</div>`;
  if((x.slides||[]).length)b+=`<div class="sec"><h5>Slides${cp("slides")}</h5><div class="slides">${x.slides.map((s,k)=>`<div class="slide"><span class="sn">${k+1}/${x.slides.length}</span><b>${esc(s.titulo)}</b><p>${esc(s.texto)}</p></div>`).join("")}</div></div>`;
  if((x.roteiro||[]).length)b+=`<div class="sec"><h5>Roteiro${cp("roteiro")}</h5><div class="script">${x.roteiro.map(r=>`<div class="beat"><span class="tm">${esc(r.tempo)}</span><div><p>${esc(r.fala)}</p><div class="sm">Cena: ${esc(r.cena)}</div>${r.texto_tela?`<div class="sm">Na tela: ${esc(r.texto_tela)}</div>`:""}</div></div>`).join("")}</div></div>`;
  if(x.arte)b+=`<div class="sec"><h5>Arte</h5><div class="hook">${esc(x.arte.frase)}</div><p class="desc m">${esc(x.arte.direcao)}</p></div>`;
  if((x.telas||[]).length)b+=`<div class="sec"><h5>Telas dos Stories${cp("telas")}</h5><div class="script">${x.telas.map((t,k)=>`<div class="beat"><span class="tm">Tela ${k+1}</span><div><p>${esc(t.texto)}</p>${t.recurso?`<div class="sm">Recurso: ${esc(t.recurso)}</div>`:""}</div></div>`).join("")}</div></div>`;
  if(x.legenda)b+=`<div class="sec"><h5>Legenda${cp("legenda")}</h5><div class="caption">${esc(x.legenda)}${(x.hashtags||[]).length?"\n\n"+esc(x.hashtags.join(" ")):""}</div></div>`;
  if(x.cta)b+=`<div class="sec"><h5>Chamada para ação</h5><p class="desc">${esc(x.cta)}</p></div>`;
  return b}

/* ---------- Exports ---------- */
/* Standalone page: calendar days and the index link to each post; works offline in any browser */
function pautaHTML(p){
  const ps=sorted(p),n=daysIn(p.mes,p.ano),first=dow(1,p.mes,p.ano),mes=MESES[p.mes],e=p.estrategia||{};
  const hol={};(e.datas||[]).forEach(d=>hol[d.dia]=d.nome);const byDay={};ps.forEach(x=>{(byDay[x.dia]=byDay[x.dia]||[]).push(x)});
  let cal=DIAS_C.map(d=>`<div class="dw">${d}</div>`).join("");for(let i=0;i<first;i++)cal+=`<div></div>`;
  for(let d=1;d<=n;d++)cal+=`<div class="d"><b>${d}</b>${hol[d]?`<small>${esc(hol[d])}</small>`:""}${(byDay[d]||[]).map(x=>`<a class="pl f-${fslug(x.formato)}" href="#${esc(x.id)}">${esc(x.formato)}</a>`).join("")}</div>`;
  const post=x=>`<article class="post" id="${esc(x.id)}"><p class="ey"><span class="dot f-${fslug(x.formato)}"></span>${esc(x.formato)} · ${DIAS[dow(x.dia,p.mes,p.ano)]}, ${x.dia} de ${mes.toLowerCase()}${x.pilar?" · "+esc(x.pilar):""}</p><h3>${esc(x.titulo||x.tema)}</h3>${postBody(x,false)}<p class="top"><a href="#topo">↑ Voltar ao calendário</a></p></article>`;
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Pauta ${esc(p.cliente)} · ${mes} ${p.ano}</title><style>
:root{--bg:#f5f5f7;--surface:#fff;--surface-2:#f0f0f3;--fg:#1d1d1f;--fg-2:#6e6e73;--line:rgba(0,0,0,.1);--accent:#d6237f;--c-car:#d6237f;--c-reel:#5856d6;--c-est:#c76a00;--c-sto:#248a3d}
@media (prefers-color-scheme:dark){:root{--bg:#000;--surface:#1c1c1e;--surface-2:#2c2c2e;--fg:#f5f5f7;--fg-2:#98989d;--line:rgba(255,255,255,.12);--accent:#ff4fa3;--c-car:#ff4fa3;--c-reel:#7d7aff;--c-est:#ffb340;--c-sto:#4cd964;color-scheme:dark}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.5 -apple-system,BlinkMacSystemFont,"Helvetica Neue",Arial,sans-serif;overflow-wrap:anywhere}
main{max-width:58rem;margin:0 auto;padding:2rem max(16px,env(safe-area-inset-left)) 3rem}h1{font-size:clamp(1.8rem,5vw,2.6rem);line-height:1.1;margin:.2rem 0 .5rem;letter-spacing:-.03em}
.ey{color:var(--accent);font-weight:600;font-size:.85rem;margin:0;display:flex;gap:.4rem;align-items:center;flex-wrap:wrap}.sub,.m{color:var(--fg-2);margin:0}
section,.post{background:var(--surface);border-radius:1.2rem;padding:1.3rem 1.4rem;margin-top:1.1rem}h2{font-size:1.25rem;margin:0 0 .6rem}h3{font-size:1.2rem;margin:.3rem 0 .8rem;line-height:1.3}h5{font-size:.75rem;text-transform:uppercase;letter-spacing:.06em;color:var(--fg-2);margin:1rem 0 .3rem}
.cal{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:.3rem}.dw{font-size:.7rem;color:var(--fg-2);text-align:center;font-weight:600;text-transform:uppercase}.d{background:var(--surface-2);border-radius:.55rem;min-height:4.6rem;padding:.3rem;display:flex;flex-direction:column;gap:.2rem;min-width:0}.d b{font-size:.8rem}.d small{font-size:.65rem;color:var(--accent);line-height:1.2}
.pl{display:block;border-radius:.35rem;padding:.15rem .3rem;font-size:.68rem;font-weight:600;color:#fff;text-decoration:none;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.f-carrossel{background:var(--c-car)}.f-reels{background:var(--c-reel)}.f-estatico{background:var(--c-est)}.f-stories{background:var(--c-sto)}.dot{width:.5rem;height:.5rem;border-radius:50%;display:inline-block}
.idx{list-style:none;padding:0;margin:0}.idx li{border-top:1px solid var(--line)}.idx a{display:flex;gap:.6rem;padding:.55rem 0;color:inherit;text-decoration:none}.idx a span{color:var(--fg-2);min-width:4.5rem}.idx a:hover b{color:var(--accent)}
.kv{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,12rem),1fr));gap:.6rem}.kv div{background:var(--surface-2);border-radius:.6rem;padding:.6rem .75rem}.kv b{display:block;font-size:.72rem;text-transform:uppercase;letter-spacing:.06em;color:var(--fg-2)}
.check{padding-left:1.1rem;margin:0}.hook,.caption{background:var(--surface-2);border-radius:.6rem;padding:.7rem .8rem;margin-bottom:.4rem}.caption{white-space:pre-wrap}.desc{margin:0}
.slides{display:flex;flex-direction:column;gap:.4rem}.slide{background:var(--surface-2);border-radius:.6rem;padding:.6rem .8rem;display:flex;flex-direction:column}.slide p{margin:0}.sn{font-size:.75rem;color:var(--fg-2)}
.beat{display:grid;grid-template-columns:4rem minmax(0,1fr);gap:.6rem;border-top:1px solid var(--line);padding-top:.5rem;margin-top:.5rem}.beat p{margin:0}.tm{color:var(--accent);font-weight:600}.sm{font-size:.85rem;color:var(--fg-2)}
.top a{color:var(--accent);font-size:.9rem}
@media (max-width:560px){.pl{font-size:0;height:.5rem;padding:0}.d small{display:none}.d{min-height:3.2rem}}
@media print{body{background:#fff}section,.post{break-inside:avoid-page;border:1px solid #ddd}}
</style></head><body><main id="topo"><p class="ey">${esc(p.arroba||p.nicho||"")} · ${mes} ${p.ano}</p><h1>${esc(p.cliente)}: pauta de ${mes.toLowerCase()}</h1><p class="sub">${e.resumo?esc(e.resumo):""}</p>
<section><h2>Calendário</h2><div class="cal">${cal}</div></section>
<section><h2>Posts do mês</h2><ol class="idx">${ps.map(x=>`<li><a href="#${esc(x.id)}"><span>${x.dia}/${p.mes+1} ${DIAS_C[dow(x.dia,p.mes,p.ano)]}</span><b>${esc(x.titulo||x.tema)}</b></a></li>`).join("")}</ol></section>
${(e.pilares||[]).length?`<section><h2>Estratégia</h2><ul>${e.pilares.map(pl=>`<li><b>${esc(pl.nome)} (${+pl.pct||0}%)</b>: ${esc(pl.descricao)}</li>`).join("")}</ul>${e.frequencia?`<p><b>Frequência:</b> ${esc(e.frequencia)}</p>`:""}</section>`:""}
${ps.map(post).join("")}
<p class="sub" style="margin-top:2rem;text-align:center">Pauta feita pela isadsign · @isadsign.co</p></main></body></html>`}
/* PDF with a clickable index: each line jumps to its post, each post links back */
let jspdfLib=null;
function loadJsPdf(){if(jspdfLib)return jspdfLib;jspdfLib=new Promise((res,rej)=>{if(window.jspdf)return res(window.jspdf.jsPDF);const s=document.createElement("script");s.src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";s.onload=()=>window.jspdf?res(window.jspdf.jsPDF):rej(new Error("jspdf"));s.onerror=()=>{jspdfLib=null;rej(new Error("jspdf"))};document.head.appendChild(s)});return jspdfLib}
const latin=t=>String(t==null?"":t).replace(/[“”]/g,'"').replace(/[‘’]/g,"'").replace(/[–—]/g,"-").replace(/…/g,"...").replace(/•/g,"·").replace(/[^\x09\x0A\x0D\x20-\xFF]/g,"").replace(/[ \t]+\n/g,"\n");
async function pautaPDF(p){
  const jsPDF=await loadJsPdf();const doc=new jsPDF({unit:"pt",format:"a4"});
  const W=doc.internal.pageSize.getWidth(),H=doc.internal.pageSize.getHeight(),M=48,CW=W-2*M,ROSA=[214,35,127],CINZA=[110,110,115];
  const ps=sorted(p),mes=MESES[p.mes];let y=M;
  const linhas=(t,size,cor,bold,gap)=>{doc.setFont("helvetica",bold?"bold":"normal");doc.setFontSize(size);doc.setTextColor(...(cor||[29,29,31]));
    doc.splitTextToSize(latin(t),CW).forEach(l=>{if(y+size>H-M){doc.addPage();y=M}doc.text(l,M,y+size);y+=size*1.35});y+=gap||0};
  const rotulo=t=>{if(y+40>H-M){doc.addPage();y=M}y+=6;linhas(t.toUpperCase(),8.5,CINZA,true,2)};
  const porPag=Math.floor((H-2*M-150)/20),nIdx=Math.max(1,Math.ceil(ps.length/porPag));
  for(let i=1;i<nIdx;i++)doc.addPage();
  const inicio={};
  ps.forEach(x=>{doc.addPage();y=M;inicio[x.id]=doc.internal.getNumberOfPages();
    doc.setFont("helvetica","normal");doc.setFontSize(9);doc.setTextColor(...ROSA);doc.textWithLink(latin("< Voltar ao índice"),M,y+9,{pageNumber:1});y+=26;
    linhas(`${x.formato} · ${DIAS[dow(x.dia,p.mes,p.ano)]}, ${x.dia} de ${mes.toLowerCase()}${x.pilar?" · "+x.pilar:""}`,10,ROSA,true,2);
    linhas(x.titulo||x.tema,17,null,true,6);
    if(x.descricao)linhas(x.descricao,10.5,null,false,4);
    if(x.objetivo){rotulo("Objetivo");linhas(x.objetivo,10.5)}if(x.horario){rotulo("Quando vai ao ar");linhas(x.horario,10.5)}if(x.metrica){rotulo("Como medir");linhas(x.metrica,10.5)}
    if((x.producao||[]).length){rotulo("O que produzir");x.producao.forEach(t=>linhas("[ ] "+t,10.5))}
    if(x.visual){rotulo("Visual");linhas(x.visual,10.5)}
    if((x.ganchos||[]).length){rotulo("Frases de abertura");x.ganchos.forEach(g=>linhas("- "+g,10.5))}
    if((x.slides||[]).length){rotulo("Slides");x.slides.forEach((s,k)=>{linhas(/^\d/.test(s.titulo)?s.titulo:`${k+1}. ${s.titulo}`,10.5,null,true);linhas(s.texto,10.5,null,false,2)})}
    if((x.roteiro||[]).length){rotulo("Roteiro");x.roteiro.forEach(r=>{linhas(`${r.tempo}  ${r.fala}`,10.5,null,true);linhas(`Cena: ${r.cena}${r.texto_tela?" · Na tela: "+r.texto_tela:""}`,9.5,CINZA,false,2)})}
    if(x.arte){rotulo("Arte");linhas(x.arte.frase,10.5,null,true);linhas(x.arte.direcao,10.5)}
    if((x.telas||[]).length){rotulo("Telas dos Stories");x.telas.forEach((t,k)=>linhas(`${k+1}. ${t.texto}${t.recurso?" ("+t.recurso+")":""}`,10.5))}
    if(x.legenda){rotulo("Legenda");linhas(x.legenda+((x.hashtags||[]).length?"\n\n"+x.hashtags.join(" "):""),10.5)}
    if(x.cta){rotulo("Chamada para ação");linhas(x.cta,10.5)}});
  doc.setPage(1);y=M;
  linhas(`${p.arroba||p.nicho||""}  ·  ${mes} ${p.ano}`,10,ROSA,true,4);linhas(`${p.cliente}: pauta de ${mes.toLowerCase()}`,22,null,true,6);
  if(p.estrategia&&p.estrategia.resumo)linhas(p.estrategia.resumo,11,CINZA,false,10);
  linhas("Posts do mês  (toque para abrir)",12,null,true,6);
  ps.forEach((x,i)=>{if(i&&i%porPag===0){doc.setPage(1+Math.floor(i/porPag));y=M}
    doc.setFont("helvetica","normal");doc.setFontSize(10.5);doc.setTextColor(...CINZA);doc.text(latin(`${String(x.dia).padStart(2,"0")}/${String(p.mes+1).padStart(2,"0")}  ${DIAS_C[dow(x.dia,p.mes,p.ano)]}`),M,y+11);
    doc.setTextColor(...ROSA);const t=doc.splitTextToSize(latin(`${x.formato}: ${x.titulo||x.tema}`),CW-90)[0];doc.textWithLink(t,M+90,y+11,{pageNumber:inicio[x.id]});
    doc.setTextColor(...CINZA);doc.text(String(inicio[x.id]),W-M,y+11,{align:"right"});y+=20});
  const total=doc.internal.getNumberOfPages();for(let i=1;i<=total;i++){doc.setPage(i);doc.setFont("helvetica","normal");doc.setFontSize(8);doc.setTextColor(...CINZA);doc.text(latin(`Pauta ${p.cliente} · ${mes} ${p.ano} · isadsign`),M,H-24);doc.text(`${i}/${total}`,W-M,H-24,{align:"right"})}
  return doc.output("blob")}

window.P={rotuloPauta,irmasPauta,MESES,DIAS,DIAS_C,FORMATOS,STATUS,RESP,$,esc,slug,normCod,cfg,sb,toast,copy,statusChip,sorted,Pauta,ligarSheet,pautaHTML,pautaPDF,baixarArquivo,nomeArquivo};
})();
