// Servidor local para ver as páginas: node entregas/teste/servidor.mjs DIR_CLIENTES [porta]
// Usa o simulador de R2, puxa os clientes do Demandas cifrados e sobe arquivos de exemplo.
import http from "node:http";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import worker from "../src/worker.js";
import { r2Falso, assetsFalsos } from "./r2-falso.mjs";

const aqui = path.dirname(fileURLToPath(import.meta.url));
const [dirClientes, porta = "8787"] = process.argv.slice(2);
const env = { ARQ: r2Falso(), ASSETS: assetsFalsos(path.join(aqui, "..", "public")), ADMIN_SENHA: "teste" };
const ctx = { waitUntil() {} };
const B = "http://localhost:" + porta;
const tmp = mkdtempSync(path.join(os.tmpdir(), "entregas-srv-"));
const fetchReal = globalThis.fetch;

async function chama(m, rota, corpo, tok, tipo) {
  const h = {}; if (tok) h.authorization = "Bearer " + tok;
  if (corpo && !(corpo instanceof Uint8Array)) { corpo = JSON.stringify(corpo); h["content-type"] = "application/json"; } else if (tipo) h["content-type"] = tipo;
  const r = await worker.fetch(new Request(B + rota, { method: m, headers: h, body: corpo, duplex: "half" }), env, ctx);
  return r.json();
}
const ch = await chama("GET", "/api/sync/chave");
writeFileSync(path.join(tmp, "chave.json"), JSON.stringify(ch));
const saida = path.join(tmp, "c.enc.json");
execFileSync("python3", [path.join(aqui, "..", "sync", "cifrar.py"), "--clientes", dirClientes, "--chave", path.join(tmp, "chave.json"), "--saida", saida]);
const cifrado = readFileSync(saida, "utf8");
globalThis.fetch = async (u, o) => String(u).startsWith("https://raw.githubusercontent.com/") ? new Response(cifrado) : fetchReal(u, o);
const tok = (await chama("POST", "/api/admin/entrar", { senha: "teste" })).token;
await chama("POST", "/api/admin/sincronizar", null, tok);
const vis = await chama("GET", "/api/admin/visao", null, tok);

// arquivos de exemplo em algumas pastas
const ex = JSON.parse(process.env.EXEMPLOS || "[]");
for (const e of ex) {
  const c = vis.clientes.find(x => x.nome === e.cliente); if (!c) continue;
  const bytes = new Uint8Array(readFileSync(e.arquivo));
  const ini = await chama("POST", "/api/admin/envio/inicio", { cliente: c.id, nome: e.nome, tipo: e.tipo, pasta: e.pasta || "" }, tok);
  const p = await (await worker.fetch(new Request(`${B}/api/admin/envio/parte?cliente=${c.id}&arquivo=${ini.arquivo}&envio=${ini.envio}&n=1`, { method: "PUT", headers: { authorization: "Bearer " + tok }, body: bytes, duplex: "half" }), env, ctx)).json();
  await chama("POST", "/api/admin/envio/fim", { cliente: c.id, arquivo: ini.arquivo, envio: ini.envio, partes: [p] }, tok);
  if (e.diasAtras) env.ARQ._mapa.get(`arq/${c.id}/${ini.arquivo}`).custom.enviado = new Date(Date.now() - e.diasAtras * 864e5).toISOString();
}
if (process.env.LOGO) { // logo de teste para um cliente
  const [nome, arq] = process.env.LOGO.split("=");
  const c = vis.clientes.find(x => x.nome === nome);
  if (c) await chama("PUT", `/api/admin/clientes/${c.id}/logo`, new Uint8Array(readFileSync(arq)), tok, "image/png");
}
const v2 = await chama("GET", "/api/admin/visao", null, tok);
writeFileSync(path.join(aqui, ".clientes-local.json"), JSON.stringify(v2.clientes.map(c => ({ nome: c.nome, slug: c.slug, codigo: c.codigo, id: c.id }))));

http.createServer(async (req, res) => {
  const chunks = []; for await (const c of req) chunks.push(c);
  const body = chunks.length ? Buffer.concat(chunks) : undefined;
  const r = await worker.fetch(new Request(B + req.url, { method: req.method, headers: req.headers, body: ["GET", "HEAD"].includes(req.method) ? undefined : body, duplex: "half" }), env, ctx);
  res.writeHead(r.status, Object.fromEntries(r.headers));
  res.end(Buffer.from(await r.arrayBuffer()));
}).listen(+porta, () => console.log("pronto em " + B));
