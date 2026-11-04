/* Entregas isadsign — portal de arquivos para clientes.
   Cloudflare Worker + R2. Uma pasta por cliente, com a identidade visual dele,
   acesso por link + código, e cada arquivo some 30 dias depois de enviado.

   R2 (binding ARQ):
     sys/segredo            chave aleatória para assinar sessões e links (criada sozinha)
     sys/chave-sync.json    par de chaves ECDH; a pública vai para o GitHub (branch dados)
     sys/sync.json          último arquivo de clientes aplicado (hash e data)
     cli/<id>.json          cliente: nome, slug, código, identidade, renovações
     logo/<id>              logo do cliente
     arq/<id>/<arquivo>     arquivos entregues (metadados: nome, pasta, enviado)
*/

const DIA = 86400000;
const VALIDADE_DIAS = 30;
const ALFA = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const SYNC_RAW = "https://raw.githubusercontent.com/isadsignco/pauta-isadsign/dados/entregas/clientes.enc.json";
const CORES_DEMANDAS = { pink: "#E9349E", lima: "#9ABC05", amarelo: "#FCDD6C", lilas: "#B49BFF", azul: "#6EC6F0", laranja: "#FF8A3D", agua: "#3FD1B0", coral: "#FF6B6B", rosa: "#F6A9CF", creme: "#F3E8CC", bege: "#ACA492", oliva: "#C9C26B" };

const enc = new TextEncoder();
const dec = new TextDecoder();

/* ---------------- utilidades ---------------- */
function json(dados, status = 200, extra = {}) {
  return new Response(JSON.stringify(dados), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...extra } });
}
function erro(msg, status = 400) { return json({ erro: msg }, status); }
function b64u(buf) {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = ""; for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function deB64(s) {
  s = String(s).replace(/-/g, "+").replace(/_/g, "/"); while (s.length % 4) s += "=";
  const bin = atob(s); const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function aleatorio(n) { const a = new Uint8Array(n); crypto.getRandomValues(a); return a; }
function idNovo(n = 10) { const a = aleatorio(n); let s = ""; for (const x of a) s += "abcdefghijkmnpqrstuvwxyz23456789"[x % 32]; return s; }
function codigoNovo() { const a = aleatorio(8); let s = ""; a.forEach((x, i) => { s += ALFA[x % ALFA.length]; if (i === 3) s += "-"; }); return s; }
function normCodigo(c) { return String(c || "").toUpperCase().replace(/[^A-Z0-9]/g, ""); }
function slugDe(nome) {
  const base = String(nome || "cliente").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 32) || "cliente";
  return base + "-" + idNovo(5);
}
function hexOk(h) { return /^#[0-9a-fA-F]{6}$/.test(String(h || "")) ? String(h).toUpperCase() : ""; }
function texto(v, max = 120) { return String(v == null ? "" : v).replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max); }
async function iguais(a, b) {
  const ha = new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(String(a))));
  const hb = new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(String(b))));
  let d = 0; for (let i = 0; i < ha.length; i++) d |= ha[i] ^ hb[i]; return d === 0;
}

/* ---------------- R2 como banco simples ---------------- */
async function lerJSON(env, chave) { const o = await env.ARQ.get(chave); return o ? o.json() : null; }
async function gravarJSON(env, chave, v) { await env.ARQ.put(chave, JSON.stringify(v), { httpMetadata: { contentType: "application/json" } }); }
async function listarTudo(env, prefixo, extra = {}) {
  const out = []; let cursor;
  do {
    const r = await env.ARQ.list({ prefix: prefixo, cursor, limit: 1000, ...extra });
    out.push(...r.objects); cursor = r.truncated ? r.cursor : undefined;
  } while (cursor);
  return out;
}
async function clientes(env) {
  const objs = await listarTudo(env, "cli/");
  const lista = await Promise.all(objs.map(o => lerJSON(env, o.key)));
  return lista.filter(Boolean);
}
async function cliente(env, id) { return /^[a-z0-9]{6,20}$/.test(id || "") ? lerJSON(env, "cli/" + id + ".json") : null; }
async function salvarCliente(env, c) { c.atualizado = new Date().toISOString(); await gravarJSON(env, "cli/" + c.id + ".json", c); return c; }

/* ---------------- assinaturas ---------------- */
async function segredo(env) {
  if (env.__seg) return env.__seg;
  let o = await env.ARQ.get("sys/segredo");
  let bruto;
  if (o) bruto = new Uint8Array(await o.arrayBuffer());
  else { bruto = aleatorio(32); await env.ARQ.put("sys/segredo", bruto); }
  // a senha da Isa entra na chave: trocar a senha derruba todas as sessões antigas
  const k = await crypto.subtle.importKey("raw", new Uint8Array([...bruto, ...enc.encode(env.ADMIN_SENHA || "")]), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  env.__seg = k; return k;
}
async function assinar(env, txt) { return b64u(await crypto.subtle.sign("HMAC", await segredo(env), enc.encode(txt))); }
async function tokenNovo(env, partes, dias) {
  const corpo = [...partes, String(Date.now() + dias * DIA)].join(".");
  return corpo + "." + await assinar(env, corpo);
}
async function tokenValido(env, tok, tipo) {
  const p = String(tok || "").split(".");
  if (p.length < 3 || p[0] !== tipo) return null;
  const sig = p.pop(), corpo = p.join(".");
  if (!(await iguais(sig, await assinar(env, corpo)))) return null;
  if (+p[p.length - 1] < Date.now()) return null;
  return p;
}
function bearer(req) { const h = req.headers.get("authorization") || ""; return h.startsWith("Bearer ") ? h.slice(7) : ""; }
async function exigeAdmin(env, req) { return !!(await tokenValido(env, bearer(req), "adm")); }
async function linkArquivo(env, cliId, arqId, baixar, horas = 6) {
  const exp = Date.now() + horas * 3600000;
  const corpo = `f.${cliId}.${arqId}.${exp}`;
  return `/api/f/${cliId}/${arqId}?e=${exp}&s=${await assinar(env, corpo)}${baixar ? "&d=1" : ""}`;
}

/* ---------------- arquivos ---------------- */
function tipoDe(nome, mime) {
  const n = String(nome).toLowerCase(), m = String(mime || "");
  if (m.startsWith("video/") || /\.(mp4|mov|m4v|webm|avi|mkv)$/.test(n)) return "video";
  if (m === "application/pdf" || n.endsWith(".pdf")) return "pdf";
  if (m.startsWith("image/") || /\.(jpe?g|png|gif|webp|heic|svg|avif)$/.test(n)) return "imagem";
  if (/\.(zip|rar|7z)$/.test(n)) return "zip";
  return "outro";
}
function expiraDe(cli, obj) {
  const md = obj.customMetadata || {};
  const base = cli.renovado && cli.renovado[obj.key.split("/")[2]];
  return base || new Date(+new Date(md.enviado || obj.uploaded) + VALIDADE_DIAS * DIA).toISOString();
}
async function arquivosDe(env, cli, comLinks) {
  const objs = await listarTudo(env, "arq/" + cli.id + "/", { include: ["customMetadata", "httpMetadata"] });
  const agora = Date.now();
  const lista = [];
  for (const o of objs) {
    const md = o.customMetadata || {};
    const expira = expiraDe(cli, o);
    if (+new Date(expira) <= agora) continue;
    const id = o.key.split("/")[2];
    const item = { id, nome: md.nome || id, pasta: md.pasta || "", tipo: md.tipo || tipoDe(md.nome || "", o.httpMetadata && o.httpMetadata.contentType), mime: (o.httpMetadata && o.httpMetadata.contentType) || "", tamanho: o.size, enviado: md.enviado || new Date(o.uploaded).toISOString(), expira };
    if (comLinks) { item.ver = await linkArquivo(env, cli.id, id, false); item.baixar = await linkArquivo(env, cli.id, id, true); }
    lista.push(item);
  }
  lista.sort((a, b) => (b.enviado > a.enviado ? 1 : -1));
  return lista;
}
function nomeArquivoSeguro(n) { return texto(n, 180).replace(/[\\/:*?"<>|]/g, "_") || "arquivo"; }

async function servirArquivo(env, req, cliId, arqId, url) {
  const e = +url.searchParams.get("e"), s = url.searchParams.get("s") || "";
  if (!e || e < Date.now() || !(await iguais(s, await assinar(env, `f.${cliId}.${arqId}.${e}`)))) return new Response("Link expirado. Atualize a página.", { status: 403 });
  const cli = await cliente(env, cliId);
  if (!cli) return new Response("Não encontrado", { status: 404 });
  const chave = `arq/${cliId}/${arqId}`;
  const range = req.headers.get("range");
  const obj = await env.ARQ.get(chave, range ? { range: req.headers } : {});
  if (!obj) return new Response("Este arquivo não está mais disponível.", { status: 404 });
  if (+new Date(expiraDe(cli, obj)) <= Date.now()) return new Response("Este arquivo expirou.", { status: 410 });
  const md = obj.customMetadata || {};
  const nome = nomeArquivoSeguro(md.nome || arqId);
  const h = new Headers();
  obj.writeHttpMetadata(h);
  h.set("etag", obj.httpEtag);
  h.set("accept-ranges", "bytes");
  h.set("cache-control", "private, max-age=3600");
  h.set("x-content-type-options", "nosniff");
  const ascii = nome.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "");
  const disp = url.searchParams.get("d") ? "attachment" : "inline";
  h.set("content-disposition", `${disp}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(nome)}`);
  // SVG e HTML nunca rodam como página
  if (/svg|html|xml|javascript/.test(h.get("content-type") || "")) { h.set("content-security-policy", "sandbox"); }
  let status = 200;
  if (range && obj.range) {
    const r = obj.range, ini = r.offset || 0, len = r.length != null ? r.length : obj.size - ini;
    h.set("content-range", `bytes ${ini}-${ini + len - 1}/${obj.size}`);
    h.set("content-length", String(len));
    status = 206;
  } else h.set("content-length", String(obj.size));
  return new Response(obj.body, { status, headers: h });
}

/* ---------------- identidade ---------------- */
function identidadePublica(c, extra = {}) {
  const id = c.ident || {};
  return {
    nome: c.nome, slug: c.slug,
    paleta: id.paleta || [], corDemandas: id.cor || "",
    fundo: id.fundo || "", texto: id.texto || "", destaque: id.destaque || "",
    fonteTitulo: id.fonteTitulo || "", fonteTexto: id.fonteTexto || "",
    logo: c.logo ? `/api/logo/${c.id}?v=${encodeURIComponent(c.logo.v || "1")}` : "",
    logoAjuste: c.logo && c.logo.ajuste || null, logoFundo: c.logo && c.logo.fundo || "",
    instagram: c.instagram || "",
    ...extra
  };
}
function identDoDemandas(d) {
  const pal = (Array.isArray(d.paleta) ? d.paleta : []).map(hexOk).filter(Boolean).slice(0, 12);
  const fontes = Array.isArray(d.fontes) ? d.fontes.filter(f => f && f.nome) : [];
  const tit = fontes.find(f => /t[ií]tulo/i.test(f.uso || "")) || fontes[0];
  const txt = fontes.find(f => /texto/i.test(f.uso || "")) || fontes[1] || tit;
  return {
    paleta: pal, cor: CORES_DEMANDAS[d.cor] || hexOk(d.corHex) || "",
    fonteTitulo: tit ? texto(tit.nome, 60) : "", fonteTexto: txt ? texto(txt.nome, 60) : ""
  };
}
function resumoAdmin(c, arqs) {
  return {
    id: c.id, nome: c.nome, slug: c.slug, codigo: c.codigo, status: c.status || "", origem: c.demId ? "demandas" : "manual",
    maeId: c.maeId || "", foraDemandas: !!c.foraDemandas, manual: !!c.identManual, oculto: !!c.oculto,
    ident: identidadePublica(c), identDemandas: c.identDemandas || null,
    arquivos: arqs ? arqs.length : 0, bytes: arqs ? arqs.reduce((s, a) => s + a.tamanho, 0) : 0,
    ultimoEnvio: arqs && arqs[0] ? arqs[0].enviado : "", atualizado: c.atualizado || ""
  };
}
async function novoCliente(env, dados) {
  const todos = await clientes(env);
  let slug; do { slug = slugDe(dados.nome); } while (todos.some(c => c.slug === slug));
  const c = { id: idNovo(10), slug, codigo: codigoNovo(), criado: new Date().toISOString(), renovado: {}, ...dados };
  return salvarCliente(env, c);
}

/* ---------------- sincronização com o Demandas ----------------
   O Claude lê os clientes do painel Demandas, cifra com a chave pública deste portal
   e grava no GitHub (branch dados). Só este Worker tem a chave privada. */
async function chaveSync(env) {
  let k = await lerJSON(env, "sys/chave-sync.json");
  if (!k) {
    const par = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
    k = { publica: await crypto.subtle.exportKey("jwk", par.publicKey), privada: await crypto.subtle.exportKey("jwk", par.privateKey), criada: new Date().toISOString() };
    await gravarJSON(env, "sys/chave-sync.json", k);
  }
  return k;
}
async function decifrar(env, env1) {
  const k = await chaveSync(env);
  const priv = await crypto.subtle.importKey("jwk", k.privada, { name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"]);
  const epk = await crypto.subtle.importKey("jwk", { kty: "EC", crv: "P-256", x: env1.epk.x, y: env1.epk.y }, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const comum = await crypto.subtle.deriveBits({ name: "ECDH", public: epk }, priv, 256);
  const hk = await crypto.subtle.importKey("raw", comum, "HKDF", false, ["deriveKey"]);
  const aes = await crypto.subtle.deriveKey({ name: "HKDF", hash: "SHA-256", salt: new Uint8Array(32), info: enc.encode("entregas-isadsign v1") }, hk, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
  const claro = await crypto.subtle.decrypt({ name: "AES-GCM", iv: deB64(env1.iv) }, aes, deB64(env1.ct));
  return JSON.parse(dec.decode(claro));
}
async function aplicarSync(env, pacote) {
  const lista = Array.isArray(pacote.clientes) ? pacote.clientes : [];
  const todos = await clientes(env);
  const porDem = {}; todos.forEach(c => { if (c.demId) porDem[c.demId] = c; });
  const vistos = {};
  let novos = 0, atualizados = 0;
  for (const d of lista) {
    const demId = texto(d.demId, 40); if (!demId || !d.nome) continue;
    vistos[demId] = 1;
    let c = porDem[demId];
    const ident = identDoDemandas(d);
    if (!c) { c = await novoCliente(env, { demId, nome: texto(d.nome, 80), ident: { ...ident }, identDemandas: ident }); novos++; }
    else {
      c.nome = texto(d.nome, 80); c.identDemandas = ident;
      if (!c.identManual) c.ident = { ...(c.ident || {}), ...ident };
      delete c.foraDemandas; atualizados++;
    }
    c.status = texto(d.status, 20); c.instagram = texto(d.instagram, 60);
    c.maeDem = texto(d.maeId, 40);
    if (d.logo && d.logo.b64 && !(c.logo && c.logo.manual)) {
      const bytes = deB64(d.logo.b64);
      const hash = b64u(await crypto.subtle.digest("SHA-256", bytes)).slice(0, 12);
      if (!c.logo || c.logo.v !== hash) await env.ARQ.put("logo/" + c.id, bytes, { httpMetadata: { contentType: /^image\/(png|jpeg|webp|gif)$/.test(d.logo.tipo) ? d.logo.tipo : "image/png" } });
      c.logo = { v: hash, ajuste: d.logo.ajuste || null, manual: false };
    }
    await salvarCliente(env, c);
  }
  // submarcas: liga ao id interno da marca-mãe
  const depois = await clientes(env);
  const porDem2 = {}; depois.forEach(c => { if (c.demId) porDem2[c.demId] = c; });
  for (const c of depois) {
    const mae = c.maeDem && porDem2[c.maeDem] ? porDem2[c.maeDem].id : "";
    let mudou = (c.maeId || "") !== mae;
    if (c.demId && !vistos[c.demId] && lista.length && !c.foraDemandas) { c.foraDemandas = true; mudou = true; }
    if (mudou) { c.maeId = mae; await salvarCliente(env, c); }
  }
  return { novos, atualizados, total: lista.length };
}
async function sincronizar(env, forcar) {
  const r = await fetch(SYNC_RAW + "?t=" + Date.now(), { headers: { "user-agent": "entregas-isadsign" }, cf: { cacheTtl: 0 } });
  if (r.status === 404) return { ok: false, msg: "Ainda não há clientes do Demandas no GitHub." };
  if (!r.ok) return { ok: false, msg: "GitHub respondeu " + r.status };
  const txt = await r.text();
  const hash = b64u(await crypto.subtle.digest("SHA-256", enc.encode(txt)));
  const ant = (await lerJSON(env, "sys/sync.json")) || {};
  if (!forcar && ant.hash === hash) return { ok: true, msg: "Nada mudou desde a última sincronização.", em: ant.em, gerado: ant.gerado };
  let pacote;
  try { pacote = await decifrar(env, JSON.parse(txt)); }
  catch (e) { return { ok: false, msg: "Não deu para abrir o arquivo do Demandas (a chave do portal mudou?). O Claude cifra de novo na próxima sincronização." }; }
  const res = await aplicarSync(env, pacote);
  const reg = { hash, em: new Date().toISOString(), gerado: pacote.gerado || "", ...res };
  await gravarJSON(env, "sys/sync.json", reg);
  return { ok: true, msg: `${res.total} clientes lidos do Demandas (${res.novos} novos).`, ...reg };
}

/* ---------------- limpeza diária ---------------- */
async function limpar(env) {
  const todos = await clientes(env);
  const porId = {}; todos.forEach(c => porId[c.id] = c);
  const objs = await listarTudo(env, "arq/", { include: ["customMetadata"] });
  const agora = Date.now(); let apagados = 0, bytes = 0;
  const lote = [];
  for (const o of objs) {
    const cli = porId[o.key.split("/")[1]];
    if (!cli || +new Date(expiraDe(cli, o)) <= agora) { lote.push(o.key); apagados++; bytes += o.size; }
  }
  for (let i = 0; i < lote.length; i += 1000) await env.ARQ.delete(lote.slice(i, i + 1000));
  // renovações de arquivos que já não existem
  for (const c of todos) {
    const ids = Object.keys(c.renovado || {});
    const vivos = ids.filter(id => objs.some(o => o.key === `arq/${c.id}/${id}` && lote.indexOf(o.key) < 0));
    if (vivos.length !== ids.length) { const r = {}; vivos.forEach(id => r[id] = c.renovado[id]); c.renovado = r; await salvarCliente(env, c); }
  }
  // uploads interrompidos ficam como multipart incompleto; o R2 os descarta sozinho em 7 dias
  await gravarJSON(env, "sys/limpeza.json", { em: new Date().toISOString(), apagados, bytes });
  return { apagados, bytes };
}

/* ---------------- rotas ---------------- */
async function api(req, env, url) {
  const p = url.pathname.replace(/\/+$/, "");
  const m = req.method;
  let r;

  /* público */
  if (p === "/api/sync/chave" && m === "GET") {
    const k = await chaveSync(env);
    return json({ v: 1, alg: "ECDH-P256+HKDF-SHA256+A256GCM", info: "entregas-isadsign v1", jwk: { kty: "EC", crv: "P-256", x: k.publica.x, y: k.publica.y }, criada: k.criada });
  }
  if ((r = p.match(/^\/api\/logo\/([a-z0-9]+)$/)) && m === "GET") {
    const o = await env.ARQ.get("logo/" + r[1]);
    if (!o) return new Response("", { status: 404 });
    const h = new Headers(); o.writeHttpMetadata(h); h.set("cache-control", "public, max-age=86400"); h.set("x-content-type-options", "nosniff");
    return new Response(o.body, { headers: h });
  }
  if ((r = p.match(/^\/api\/f\/([a-z0-9]+)\/([a-z0-9]+)$/)) && (m === "GET" || m === "HEAD")) return servirArquivo(env, req, r[1], r[2], url);

  /* cliente */
  if ((r = p.match(/^\/api\/c\/ident\/([a-z0-9-]+)$/)) && m === "GET") {
    const c = (await clientes(env)).find(x => x.slug === r[1] && !x.oculto);
    return c ? json(identidadePublica(c)) : erro("Pasta não encontrada", 404);
  }
  if (p === "/api/c/entrar" && m === "POST") {
    const b = await req.json().catch(() => ({}));
    await new Promise(ok => setTimeout(ok, 350));
    const c = (await clientes(env)).find(x => x.slug === String(b.slug || "") && !x.oculto);
    if (!c || !(await iguais(normCodigo(b.codigo), normCodigo(c.codigo)))) return erro("Código não confere. Confira com a Isa.", 401);
    return json({ token: await tokenNovo(env, ["cli", c.id, normCodigo(c.codigo).slice(0, 4)], 30) });
  }
  if (p === "/api/c/pasta" && m === "GET") {
    const t = await tokenValido(env, bearer(req), "cli");
    if (!t) return erro("Entre com o código", 401);
    const c = await cliente(env, t[1]);
    // trocar o código encerra os acessos antigos
    if (!c || c.oculto || normCodigo(c.codigo).slice(0, 4) !== t[2]) return erro("Entre com o código", 401);
    return json({ ...identidadePublica(c), arquivos: await arquivosDe(env, c, true), validadeDias: VALIDADE_DIAS });
  }

  /* admin */
  if (p === "/api/admin/entrar" && m === "POST") {
    if (!env.ADMIN_SENHA) return erro("A senha do painel ainda não foi configurada (segredo ENTREGAS_SENHA no GitHub).", 503);
    const b = await req.json().catch(() => ({}));
    await new Promise(ok => setTimeout(ok, 400));
    if (!(await iguais(String(b.senha || ""), env.ADMIN_SENHA))) return erro("Senha incorreta", 401);
    return json({ token: await tokenNovo(env, ["adm"], 30) });
  }
  if (!p.startsWith("/api/admin/")) return erro("Rota não encontrada", 404);
  if (!(await exigeAdmin(env, req))) return erro("Entre de novo", 401);

  if (p === "/api/admin/visao" && m === "GET") {
    const todos = await clientes(env);
    const res = [];
    let total = 0;
    for (const c of todos) { const a = await arquivosDe(env, c, false); total += a.reduce((s, x) => s + x.tamanho, 0); res.push(resumoAdmin(c, a)); }
    return json({ clientes: res, bytes: total, sync: await lerJSON(env, "sys/sync.json"), limpeza: await lerJSON(env, "sys/limpeza.json"), validadeDias: VALIDADE_DIAS });
  }
  if (p === "/api/admin/sincronizar" && m === "POST") return json(await sincronizar(env, true));
  if (p === "/api/admin/limpar" && m === "POST") return json(await limpar(env));
  if (p === "/api/admin/clientes" && m === "POST") {
    const b = await req.json().catch(() => ({}));
    const nome = texto(b.nome, 80); if (!nome) return erro("Dê um nome para a pasta");
    const c = await novoCliente(env, { nome, identManual: true, ident: { paleta: [], cor: hexOk(b.cor) || "#E9349E" } });
    return json(resumoAdmin(c, []));
  }
  if ((r = p.match(/^\/api\/admin\/clientes\/([a-z0-9]+)(\/[a-z]+)?$/))) {
    const c = await cliente(env, r[1]); if (!c) return erro("Pasta não encontrada", 404);
    const sub = r[2] || "";
    if (!sub && m === "GET") { const a = await arquivosDe(env, c, true); return json({ ...resumoAdmin(c, a), lista: a }); }
    if (!sub && m === "PATCH") {
      const b = await req.json().catch(() => ({}));
      if ("oculto" in b) c.oculto = !!b.oculto;
      if (b.ident) {
        const i = b.ident;
        c.ident = {
          ...(c.ident || {}),
          paleta: Array.isArray(i.paleta) ? i.paleta.map(hexOk).filter(Boolean).slice(0, 12) : (c.ident || {}).paleta || [],
          fundo: hexOk(i.fundo), texto: hexOk(i.texto), destaque: hexOk(i.destaque),
          fonteTitulo: texto(i.fonteTitulo, 60), fonteTexto: texto(i.fonteTexto, 60)
        };
        c.identManual = true;
      }
      if (b.usarDemandas && c.identDemandas) { c.ident = { ...c.identDemandas }; c.identManual = false; }
      if (b.nome && !c.demId) c.nome = texto(b.nome, 80);
      if (b.logoAjuste && c.logo) c.logo.ajuste = { x: +b.logoAjuste.x || 0, y: +b.logoAjuste.y || 0, zoom: Math.min(4, Math.max(.3, +b.logoAjuste.zoom || 1)) };
      if ("logoFundo" in b && c.logo) c.logo.fundo = hexOk(b.logoFundo);
      await salvarCliente(env, c);
      return json(resumoAdmin(c, await arquivosDe(env, c, false)));
    }
    if (sub === "/codigo" && m === "POST") { c.codigo = codigoNovo(); await salvarCliente(env, c); return json({ codigo: c.codigo }); }
    if (sub === "/logo" && m === "PUT") {
      const tipo = req.headers.get("content-type") || "";
      if (!/^image\/(png|jpeg|webp|gif|svg\+xml)$/.test(tipo)) return erro("Use PNG, JPG, WEBP ou SVG");
      const bytes = new Uint8Array(await req.arrayBuffer());
      if (bytes.length > 3 * 1024 * 1024) return erro("Logo até 3 MB");
      await env.ARQ.put("logo/" + c.id, bytes, { httpMetadata: { contentType: tipo } });
      c.logo = { v: idNovo(6), manual: true, ajuste: null, fundo: (c.logo && c.logo.fundo) || "" };
      await salvarCliente(env, c); return json({ ok: true, logo: identidadePublica(c).logo });
    }
    if (sub === "/logo" && m === "DELETE") { await env.ARQ.delete("logo/" + c.id); delete c.logo; await salvarCliente(env, c); return json({ ok: true }); }
    if (!sub && m === "DELETE") {
      if (c.demId && !c.foraDemandas) return erro("Esta pasta vem do Demandas. Para tirar do painel, use Esconder.");
      const objs = await listarTudo(env, "arq/" + c.id + "/");
      for (let i = 0; i < objs.length; i += 1000) await env.ARQ.delete(objs.slice(i, i + 1000).map(o => o.key));
      await env.ARQ.delete(["logo/" + c.id, "cli/" + c.id + ".json"]);
      return json({ ok: true });
    }
    return erro("Rota não encontrada", 404);
  }
  if ((r = p.match(/^\/api\/admin\/arquivos\/([a-z0-9]+)\/([a-z0-9]+)$/))) {
    const c = await cliente(env, r[1]); if (!c) return erro("Pasta não encontrada", 404);
    const chave = `arq/${c.id}/${r[2]}`;
    if (m === "DELETE") { await env.ARQ.delete(chave); if (c.renovado) { delete c.renovado[r[2]]; await salvarCliente(env, c); } return json({ ok: true }); }
    if (m === "PATCH") {
      const o = await env.ARQ.head(chave); if (!o) return erro("Arquivo não encontrado", 404);
      c.renovado = c.renovado || {};
      c.renovado[r[2]] = new Date(Date.now() + VALIDADE_DIAS * DIA).toISOString();
      await salvarCliente(env, c); return json({ expira: c.renovado[r[2]] });
    }
  }

  /* envio em partes (aceita reels grandes: cada parte passa pelo Worker abaixo do limite de 100 MB) */
  if (p === "/api/admin/envio/inicio" && m === "POST") {
    const b = await req.json().catch(() => ({}));
    const c = await cliente(env, b.cliente); if (!c) return erro("Pasta não encontrada", 404);
    const nome = nomeArquivoSeguro(b.nome);
    const mime = /^[\w.+-]+\/[\w.+-]+$/.test(b.tipo || "") ? b.tipo : "application/octet-stream";
    const arqId = idNovo(12);
    const up = await env.ARQ.createMultipartUpload(`arq/${c.id}/${arqId}`, {
      httpMetadata: { contentType: mime },
      customMetadata: { nome, pasta: texto(b.pasta, 60), tipo: tipoDe(nome, mime), enviado: new Date().toISOString() }
    });
    return json({ arquivo: arqId, envio: up.uploadId });
  }
  if (p === "/api/admin/envio/parte" && m === "PUT") {
    const cli = url.searchParams.get("cliente"), arq = url.searchParams.get("arquivo"), envio = url.searchParams.get("envio"), n = +url.searchParams.get("n");
    if (!/^[a-z0-9]+$/.test(cli || "") || !/^[a-z0-9]+$/.test(arq || "") || !envio || !(n >= 1 && n <= 10000)) return erro("Parte inválida");
    const up = env.ARQ.resumeMultipartUpload(`arq/${cli}/${arq}`, envio);
    const parte = await up.uploadPart(n, req.body);
    return json({ n: parte.partNumber, etag: parte.etag });
  }
  if (p === "/api/admin/envio/fim" && m === "POST") {
    const b = await req.json().catch(() => ({}));
    if (!/^[a-z0-9]+$/.test(b.cliente || "") || !/^[a-z0-9]+$/.test(b.arquivo || "")) return erro("Envio inválido");
    const up = env.ARQ.resumeMultipartUpload(`arq/${b.cliente}/${b.arquivo}`, b.envio);
    if (b.cancelar) { await up.abort(); return json({ ok: true }); }
    const partes = (b.partes || []).map(x => ({ partNumber: +x.n, etag: String(x.etag) })).sort((a, z) => a.partNumber - z.partNumber);
    const o = await up.complete(partes);
    return json({ ok: true, tamanho: o.size });
  }
  return erro("Rota não encontrada", 404);
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    try {
      if (url.pathname.startsWith("/api/")) return await api(req, env, url);
      // páginas
      if (url.pathname === "/painel" || url.pathname === "/painel/") return env.ASSETS.fetch(new Request(new URL("/painel.html", url), req));
      if (/^\/p\/[a-z0-9-]+\/?$/.test(url.pathname)) return env.ASSETS.fetch(new Request(new URL("/pasta.html", url), req));
      return env.ASSETS.fetch(req);
    } catch (e) {
      console.error(e && e.stack || e);
      return url.pathname.startsWith("/api/") ? erro("Algo deu errado aqui. Tente de novo.", 500) : new Response("Erro", { status: 500 });
    }
  },
  async scheduled(evento, env, ctx) {
    ctx.waitUntil((async () => {
      try { await limpar(env); } catch (e) { console.error("limpeza", e); }
      try { await sincronizar(env, false); } catch (e) { console.error("sync", e); }
    })());
  }
};

export const _teste = { aplicarSync, sincronizar, limpar, decifrar, chaveSync, identDoDemandas };
