// Gera a página de um cliente com as pautas dele trancadas pelo código de acesso.
// Uso: node cliente/gerar.mjs --cliente "Café Aurora" [--codigo ABCD-2345] --saida saida.html pauta1.json [pauta2.json ...]
// Sem --codigo, cria um código novo e mostra no terminal.
import { readFileSync, writeFileSync } from "node:fs";
import { webcrypto as crypto } from "node:crypto";
import { fileURLToPath } from "node:url";

const ITER = 310000;
const ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sem 0/O, 1/I

function args(argv) {
  const o = { arquivos: [] };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--cliente") o.cliente = argv[++i];
    else if (argv[i] === "--codigo") o.codigo = argv[++i];
    else if (argv[i] === "--saida") o.saida = argv[++i];
    else o.arquivos.push(argv[i]);
  }
  return o;
}
const norm = c => String(c || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const b64 = buf => Buffer.from(buf).toString("base64");

export function novoCodigo() {
  const r = crypto.getRandomValues(new Uint8Array(8));
  const s = [...r].map(n => ALFABETO[n % ALFABETO.length]).join("");
  return s.slice(0, 4) + "-" + s.slice(4);
}

// Só o que o cliente deve ver: as anotações internas do briefing ficam de fora.
export function limpar(p) {
  const { exemplo, briefing, criadoEm, atualizadoEm, ...resto } = p;
  return { ...resto, briefing: { temas: (briefing && briefing.temas) || [] } };
}

export async function trancar(cliente, codigo, pautas) {
  const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(norm(codigo)), "PBKDF2", false, ["deriveKey"]);
  const key = await crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: ITER, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt"]);
  const data = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(JSON.stringify({ pautas: pautas.map(limpar) })));
  return { v: 1, cliente, iter: ITER, salt: b64(salt), iv: b64(iv), data: b64(data) };
}

export function pagina(acesso) {
  const tpl = readFileSync(new URL("./pagina.html", import.meta.url), "utf8");
  const json = JSON.stringify(acesso).replace(/</g, "\\u003c");
  return tpl.replace("/*ACESSO*/null/*FIM*/", "/*ACESSO*/" + json + "/*FIM*/")
    .replace("<title>Pauta isadsign</title>", `<title>Pauta ${acesso.cliente.replace(/[<&]/g, "")}</title>`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const o = args(process.argv.slice(2));
  if (!o.cliente || !o.saida || !o.arquivos.length) {
    console.error('Uso: node cliente/gerar.mjs --cliente "Nome" [--codigo XXXX-XXXX] --saida saida.html pauta.json ...');
    process.exit(1);
  }
  const codigo = o.codigo || novoCodigo();
  if (norm(codigo).length < 8) { console.error("O código precisa ter 8 letras ou números."); process.exit(1); }
  const pautas = o.arquivos.map(f => JSON.parse(readFileSync(f, "utf8")));
  writeFileSync(o.saida, pagina(await trancar(o.cliente, codigo, pautas)));
  console.log(`Página: ${o.saida}\nCódigo de acesso: ${codigo}`);
}
