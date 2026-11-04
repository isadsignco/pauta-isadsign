// node entregas/teste/testar.mjs DIR_CLIENTES_DEMANDAS
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import worker from "../src/worker.js";
import { r2Falso, assetsFalsos } from "./r2-falso.mjs";

const aqui = path.dirname(fileURLToPath(import.meta.url));
const dirClientes = process.argv[2];
const tmp = mkdtempSync(path.join(os.tmpdir(), "entregas-"));
const env = { ARQ: r2Falso(), ASSETS: assetsFalsos(path.join(aqui, "..", "public")), ADMIN_SENHA: "senha-teste-123" };
const ctx = { waitUntil: p => p };
const B = "https://entregas.exemplo.workers.dev";
let ok = 0;
const passo = (t) => { ok++; console.log("✓", t); };

async function chamar(metodo, rota, { corpo, token, headers = {} } = {}) {
  const h = { ...headers };
  if (token) h.authorization = "Bearer " + token;
  let body = corpo;
  if (corpo && !(corpo instanceof Uint8Array) && typeof corpo !== "string") { body = JSON.stringify(corpo); h["content-type"] = "application/json"; }
  const r = await worker.fetch(new Request(B + rota, { method: metodo, headers: h, body, duplex: "half" }), env, ctx);
  return r;
}
async function j(metodo, rota, o) { const r = await chamar(metodo, rota, o); const t = await r.text(); let d; try { d = JSON.parse(t); } catch { d = t; } return { s: r.status, d, r }; }

// 1) chave pública + arquivo cifrado pelo script Python, com os clientes reais do Demandas
const ch = await j("GET", "/api/sync/chave");
assert.equal(ch.s, 200); assert.ok(ch.d.jwk.x);
writeFileSync(path.join(tmp, "chave.json"), JSON.stringify(ch.d));
const logos = path.join(tmp, "logos"); mkdirSync(logos);
// logos falsas (PNG 1x1) para os clientes que têm logo no Demandas
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
for (const f of readdirSync(dirClientes)) { const d = JSON.parse(readFileSync(path.join(dirClientes, f))); if (d.logoAsset) writeFileSync(path.join(logos, d.logoAsset + ".png"), png); }
const saida = path.join(tmp, "clientes.enc.json");
console.log(execFileSync("python3", [path.join(aqui, "..", "sync", "cifrar.py"), "--clientes", dirClientes, "--logos", logos, "--chave", path.join(tmp, "chave.json"), "--saida", saida]).toString().trim());
const cifrado = readFileSync(saida, "utf8");
assert.ok(!/Ousion|Isadsign|#13233F/.test(cifrado), "arquivo público não pode ter nomes nem cores");
passo("arquivo do Demandas cifrado sem nada legível");

globalThis.fetch = async (u) => String(u).startsWith("https://raw.githubusercontent.com/") ? new Response(cifrado) : new Response("", { status: 404 });

// 2) admin
assert.equal((await j("POST", "/api/admin/entrar", { corpo: { senha: "errada" } })).s, 401);
const adm = (await j("POST", "/api/admin/entrar", { corpo: { senha: "senha-teste-123" } })).d.token;
assert.ok(adm); passo("login do painel");
assert.equal((await j("GET", "/api/admin/visao")).s, 401);
assert.equal((await j("GET", "/api/admin/visao", { token: adm + "x" })).s, 401);

const sy = await j("POST", "/api/admin/sincronizar", { token: adm });
assert.equal(sy.d.ok, true, JSON.stringify(sy.d)); console.log("  ", sy.d.msg);
let vis = (await j("GET", "/api/admin/visao", { token: adm })).d;
const total = readdirSync(dirClientes).length;
assert.equal(vis.clientes.length, total);
const yeh = vis.clientes.find(c => c.nome === "Yeh"), ousion = vis.clientes.find(c => c.nome === "Ousion Tecnologia");
assert.equal(yeh.maeId, ousion.id, "submarca ligada à marca-mãe");
assert.deepEqual(yeh.ident.paleta.slice(0, 2), ["#13233F", "#F2EFE8"]);
assert.equal(yeh.ident.fonteTitulo, "Bricolage Grotesque ExtraBold");
const isa = vis.clientes.find(c => c.nome === "Isadsign.co");
assert.ok(isa.ident.logo, "logo veio do Demandas");
assert.match(isa.codigo, /^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
passo(`sincronização: ${vis.clientes.length} pastas, submarcas, paleta, fontes e logo`);

// ressincronizar não duplica nem troca código
const codAntes = isa.codigo;
await j("POST", "/api/admin/sincronizar", { token: adm });
vis = (await j("GET", "/api/admin/visao", { token: adm })).d;
assert.equal(vis.clientes.length, total);
assert.equal(vis.clientes.find(c => c.id === isa.id).codigo, codAntes);
passo("sincronizar de novo não duplica pastas nem muda códigos");

// identidade manual sobrevive ao sync
await j("PATCH", "/api/admin/clientes/" + isa.id, { token: adm, corpo: { ident: { paleta: ["#111111"], fundo: "#FFFFFF", texto: "#111111", destaque: "#E9349E", fonteTitulo: "Fraunces", fonteTexto: "Inter" } } });
await j("POST", "/api/admin/sincronizar", { token: adm });
let det = (await j("GET", "/api/admin/clientes/" + isa.id, { token: adm })).d;
assert.equal(det.ident.fonteTitulo, "Fraunces"); assert.equal(det.manual, true);
await j("PATCH", "/api/admin/clientes/" + isa.id, { token: adm, corpo: { usarDemandas: true } });
det = (await j("GET", "/api/admin/clientes/" + isa.id, { token: adm })).d;
assert.equal(det.ident.fonteTitulo, "Creato Display"); assert.equal(det.manual, false);
passo("ajuste manual da identidade é mantido; 'usar do Demandas' volta ao original");

// 3) envio em 2 partes (5 MB + resto) — como um reel grande
const parte1 = new Uint8Array(5 * 1024 * 1024).fill(7), parte2 = new Uint8Array(1234).fill(9);
const ini = (await j("POST", "/api/admin/envio/inicio", { token: adm, corpo: { cliente: isa.id, nome: "Reel Novembro — versão final.mp4", tipo: "video/mp4", pasta: "Novembro" } })).d;
const q = `cliente=${isa.id}&arquivo=${ini.arquivo}&envio=${encodeURIComponent(ini.envio)}`;
const p1 = (await j("PUT", `/api/admin/envio/parte?${q}&n=1`, { token: adm, corpo: parte1 })).d;
const p2 = (await j("PUT", `/api/admin/envio/parte?${q}&n=2`, { token: adm, corpo: parte2 })).d;
const fim = await j("POST", "/api/admin/envio/fim", { token: adm, corpo: { cliente: isa.id, arquivo: ini.arquivo, envio: ini.envio, partes: [p2, p1] } });
assert.equal(fim.d.tamanho, parte1.length + parte2.length);
// e uma imagem pequena
const ini2 = (await j("POST", "/api/admin/envio/inicio", { token: adm, corpo: { cliente: isa.id, nome: "post-01.png", tipo: "image/png", pasta: "" } })).d;
const pp = (await j("PUT", `/api/admin/envio/parte?cliente=${isa.id}&arquivo=${ini2.arquivo}&envio=${ini2.envio}&n=1`, { token: adm, corpo: new Uint8Array(png) })).d;
await j("POST", "/api/admin/envio/fim", { token: adm, corpo: { cliente: isa.id, arquivo: ini2.arquivo, envio: ini2.envio, partes: [pp] } });
assert.equal((await j("PUT", `/api/admin/envio/parte?${q}&n=1`, { corpo: parte2 })).s, 401, "envio exige login");
passo("envio em partes (reel de 5 MB+) e imagem");

// 4) cliente
const pub = await j("GET", "/api/c/ident/" + isa.slug);
assert.equal(pub.d.nome, "Isadsign.co"); assert.ok(!("codigo" in pub.d));
assert.equal((await j("POST", "/api/c/entrar", { corpo: { slug: isa.slug, codigo: "AAAA-AAAA" } })).s, 401);
const tcli = (await j("POST", "/api/c/entrar", { corpo: { slug: isa.slug, codigo: codAntes.toLowerCase().replace("-", " ") } })).d.token;
assert.ok(tcli, "código aceita minúsculas e espaço");
const pasta = (await j("GET", "/api/c/pasta", { token: tcli })).d;
assert.equal(pasta.arquivos.length, 2);
const reel = pasta.arquivos.find(a => a.tipo === "video");
assert.equal(reel.pasta, "Novembro"); assert.equal(reel.nome, "Reel Novembro — versão final.mp4");
const dias = Math.round((new Date(reel.expira) - Date.now()) / 86400000); assert.equal(dias, 30);
passo("cliente entra com o código e vê os 2 arquivos, válidos por 30 dias");

// outro cliente não abre esta pasta
const outro = vis.clientes.find(c => c.nome === "Katia");
const tout = (await j("POST", "/api/c/entrar", { corpo: { slug: outro.slug, codigo: outro.codigo } })).d.token;
const pOut = (await j("GET", "/api/c/pasta", { token: tout })).d;
assert.equal(pOut.arquivos.length, 0); assert.equal(pOut.nome, "Katia");
passo("cada cliente só vê a própria pasta");

// download assinado, com nome e range
let r = await chamar("GET", reel.baixar);
assert.equal(r.status, 200);
assert.match(r.headers.get("content-disposition"), /^attachment;.*filename\*=UTF-8''Reel%20Novembro/);
assert.equal((await r.arrayBuffer()).byteLength, parte1.length + parte2.length);
r = await chamar("GET", reel.ver, { headers: { range: "bytes=0-99" } });
assert.equal(r.status, 206); assert.equal(r.headers.get("content-range"), `bytes 0-99/${parte1.length + parte2.length}`);
assert.equal((await chamar("GET", reel.baixar.replace(/s=[^&]+/, "s=adulterado"))).status, 403);
passo("download com nome original, vídeo com range, link adulterado recusado");

// trocar o código derruba o acesso antigo
const novo = (await j("POST", `/api/admin/clientes/${isa.id}/codigo`, { token: adm })).d.codigo;
assert.notEqual(novo, codAntes);
assert.equal((await j("GET", "/api/c/pasta", { token: tcli })).s, 401);
passo("novo código encerra acessos antigos");

// 5) validade de 30 dias e limpeza
const chaveReel = `arq/${isa.id}/${reel.id}`;
env.ARQ._mapa.get(chaveReel).custom.enviado = new Date(Date.now() - 31 * 86400000).toISOString();
det = (await j("GET", "/api/admin/clientes/" + isa.id, { token: adm })).d;
assert.equal(det.lista.length, 1, "arquivo vencido some na hora para todo mundo");
const lim = (await j("POST", "/api/admin/limpar", { token: adm })).d;
assert.equal(lim.apagados, 1); assert.ok(!env.ARQ._mapa.has(chaveReel));
// renovar mantém mais 30 dias
const img = det.lista[0];
env.ARQ._mapa.get(`arq/${isa.id}/${img.id}`).custom.enviado = new Date(Date.now() - 29.9 * 86400000).toISOString();
await j("PATCH", `/api/admin/arquivos/${isa.id}/${img.id}`, { token: adm });
env.ARQ._mapa.get(`arq/${isa.id}/${img.id}`).custom.enviado = new Date(Date.now() - 40 * 86400000).toISOString();
await worker.scheduled({}, env, { waitUntil: async p => p });
await new Promise(ok => setTimeout(ok, 50));
assert.ok(env.ARQ._mapa.has(`arq/${isa.id}/${img.id}`), "renovado não é apagado");
passo("arquivos com mais de 30 dias são apagados; 'mais 30 dias' segura o arquivo");

// 6) pasta manual + páginas
const man = (await j("POST", "/api/admin/clientes", { token: adm, corpo: { nome: "Cliente Avulso", cor: "#3FD1B0" } })).d;
assert.equal(man.origem, "manual");
assert.equal((await j("DELETE", "/api/admin/clientes/" + isa.id, { token: adm })).s, 400, "pasta do Demandas não é apagada");
assert.equal((await j("DELETE", "/api/admin/clientes/" + man.id, { token: adm })).s, 200);
passo("pasta avulsa criada e apagada; pastas do Demandas protegidas");

console.log(`\n${ok} verificações passaram.`);
