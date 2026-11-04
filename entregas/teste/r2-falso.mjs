// Simulador mínimo do R2 e dos assets, para testar o Worker em Node sem Wrangler.
import { readFile } from "node:fs/promises";
import path from "node:path";

function corpoDe(v) {
  if (v == null) return new Uint8Array();
  if (typeof v === "string") return new TextEncoder().encode(v);
  if (v instanceof Uint8Array) return v;
  if (v instanceof ArrayBuffer) return new Uint8Array(v);
  throw new Error("tipo de corpo não suportado");
}
async function lerCorpo(v) {
  if (v && typeof v.getReader === "function") return new Uint8Array(await new Response(v).arrayBuffer());
  return corpoDe(v);
}
function objeto(key, rec, fatia) {
  const dados = fatia || rec.dados;
  return {
    key, size: rec.dados.length, uploaded: rec.uploaded, httpEtag: '"' + rec.etag + '"', etag: rec.etag,
    customMetadata: { ...rec.custom }, httpMetadata: { ...rec.http },
    range: fatia ? rec.range : undefined,
    writeHttpMetadata(h) { if (rec.http.contentType) h.set("content-type", rec.http.contentType); },
    body: new Response(dados).body,
    async arrayBuffer() { return dados.buffer.slice(dados.byteOffset, dados.byteOffset + dados.byteLength); },
    async text() { return new TextDecoder().decode(dados); },
    async json() { return JSON.parse(new TextDecoder().decode(dados)); }
  };
}
export function r2Falso() {
  const m = new Map(), ups = new Map();
  let n = 0;
  const api = {
    _mapa: m,
    async put(key, valor, o = {}) {
      m.set(key, { dados: await lerCorpo(valor), custom: o.customMetadata || {}, http: o.httpMetadata || {}, uploaded: new Date(), etag: "e" + (++n) });
      return objeto(key, m.get(key));
    },
    async get(key, o = {}) {
      const rec = m.get(key); if (!rec) return null;
      if (o.range) {
        const h = o.range.get ? o.range.get("range") : null;
        const mm = /bytes=(\d+)-(\d*)/.exec(h || "");
        if (mm) { const ini = +mm[1], fim = mm[2] ? +mm[2] : rec.dados.length - 1; rec.range = { offset: ini, length: fim - ini + 1 }; return objeto(key, rec, rec.dados.slice(ini, fim + 1)); }
      }
      return objeto(key, rec);
    },
    async head(key) { const rec = m.get(key); return rec ? objeto(key, rec) : null; },
    async delete(keys) { (Array.isArray(keys) ? keys : [keys]).forEach(k => m.delete(k)); },
    async list({ prefix = "", cursor, limit = 1000 } = {}) {
      const todas = [...m.keys()].filter(k => k.startsWith(prefix)).sort();
      const ini = cursor ? +cursor : 0, fatia = todas.slice(ini, ini + limit);
      return { objects: fatia.map(k => objeto(k, m.get(k))), truncated: ini + limit < todas.length, cursor: String(ini + limit) };
    },
    async createMultipartUpload(key, o = {}) { const id = "up" + (++n); ups.set(id, { key, o, partes: new Map() }); return { uploadId: id, key }; },
    resumeMultipartUpload(key, id) {
      return {
        async uploadPart(num, corpo) { const u = ups.get(id); if (!u || u.key !== key) throw new Error("upload inexistente"); const d = await lerCorpo(corpo); u.partes.set(num, d); return { partNumber: num, etag: "p" + num + "-" + d.length }; },
        async complete(partes) {
          const u = ups.get(id); if (!u) throw new Error("upload inexistente");
          const pedacos = partes.map(p => { const d = u.partes.get(p.partNumber); if (!d || p.etag !== "p" + p.partNumber + "-" + d.length) throw new Error("etag errado"); return d; });
          const tam = pedacos.reduce((s, d) => s + d.length, 0), tudo = new Uint8Array(tam); let off = 0;
          pedacos.forEach(d => { tudo.set(d, off); off += d.length; });
          ups.delete(id); return api.put(key, tudo, u.o);
        },
        async abort() { ups.delete(id); }
      };
    }
  };
  return api;
}
export function assetsFalsos(pasta) {
  return {
    async fetch(req) {
      const u = new URL(req.url);
      try { const b = await readFile(path.join(pasta, decodeURIComponent(u.pathname))); return new Response(b, { headers: { "content-type": u.pathname.endsWith(".html") ? "text/html" : "application/octet-stream" } }); }
      catch { return new Response("404", { status: 404 }); }
    }
  };
}
