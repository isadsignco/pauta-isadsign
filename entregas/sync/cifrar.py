#!/usr/bin/env python3
"""Monta o arquivo de clientes do painel Demandas para o portal Entregas isadsign.

Lê os clientes salvos pelo Claude (ArtifactData list ... out_dir) e as logos baixadas
do painel, junta só o que o portal usa (nome, status, cores, fontes, logo, submarca)
e cifra com a chave pública do portal. O resultado pode ficar no GitHub público:
só o Worker do portal tem a chave privada para abrir.

Uso:
  python3 cifrar.py --clientes DIR/clientes --logos DIR_LOGOS \
      --chave entregas/chave-publica.json --saida entregas/clientes.enc.json
"""
import argparse, base64, glob, io, json, os, sys
from datetime import datetime, timezone

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF


def b64u(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()


def de_b64u(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def logo_de(asset_id: str, pasta: str):
    if not asset_id or not pasta:
        return None
    achados = [f for f in glob.glob(os.path.join(pasta, asset_id + "*")) if os.path.isfile(f)]
    if not achados:
        return None
    dados = open(achados[0], "rb").read()
    tipo = "image/png"
    try:  # reduz para no máximo 640 px, para o arquivo ficar leve
        from PIL import Image
        im = Image.open(io.BytesIO(dados))
        im.thumbnail((640, 640))
        if im.mode not in ("RGB", "RGBA"):
            im = im.convert("RGBA")
        saida = io.BytesIO()
        im.save(saida, "PNG", optimize=True)
        dados = saida.getvalue()
    except Exception:
        cab = dados[:12]
        if cab[:3] == b"\xff\xd8\xff":
            tipo = "image/jpeg"
        elif cab[:4] == b"RIFF" and cab[8:12] == b"WEBP":
            tipo = "image/webp"
        elif cab[:3] == b"GIF":
            tipo = "image/gif"
        elif cab[:8] != b"\x89PNG\r\n\x1a\n":
            return None  # formato que o portal não mostra
        if len(dados) > 1_500_000:
            return None
    return {"tipo": tipo, "b64": b64u(dados)}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--clientes", required=True)
    ap.add_argument("--logos", default="")
    ap.add_argument("--chave", required=True)
    ap.add_argument("--saida", required=True)
    a = ap.parse_args()

    lista = []
    for f in sorted(glob.glob(os.path.join(a.clientes, "*.json"))):
        d = json.load(open(f, encoding="utf-8"))
        nome = str(d.get("nome") or "").strip()
        if not nome or nome.lower().startswith("(exemplo)"):
            continue
        c = {
            "demId": os.path.splitext(os.path.basename(f))[0],
            "nome": nome,
            "status": d.get("status") or "",
            "cor": d.get("cor") or "",
            "paleta": [p for p in (d.get("paleta") or []) if isinstance(p, str)],
            "fontes": [{"nome": x.get("nome", ""), "uso": x.get("uso", "")} for x in (d.get("fontes") or []) if isinstance(x, dict) and x.get("nome")],
            "instagram": d.get("instagram") or "",
            "maeId": d.get("maeId") or "",
        }
        logo = logo_de(d.get("logoAsset") or "", a.logos)
        if logo:
            if any(k in d for k in ("logoX", "logoY", "logoZoom")):
                logo["ajuste"] = {"x": d.get("logoX") or 0, "y": d.get("logoY") or 0, "zoom": d.get("logoZoom") or 1}
            c["logo"] = logo
        lista.append(c)

    pacote = {"v": 1, "gerado": datetime.now(timezone.utc).isoformat(timespec="seconds"), "clientes": lista}
    claro = json.dumps(pacote, ensure_ascii=False, separators=(",", ":")).encode()

    chave = json.load(open(a.chave, encoding="utf-8"))
    jwk = chave["jwk"]
    pub = ec.EllipticCurvePublicNumbers(int.from_bytes(de_b64u(jwk["x"]), "big"), int.from_bytes(de_b64u(jwk["y"]), "big"), ec.SECP256R1()).public_key()
    eph = ec.generate_private_key(ec.SECP256R1())
    comum = eph.exchange(ec.ECDH(), pub)
    aes = HKDF(algorithm=hashes.SHA256(), length=32, salt=b"\x00" * 32, info=b"entregas-isadsign v1").derive(comum)
    iv = os.urandom(12)
    ct = AESGCM(aes).encrypt(iv, claro, None)
    n = eph.public_key().public_numbers()
    env = {
        "v": 1,
        "alg": chave.get("alg", "ECDH-P256+HKDF-SHA256+A256GCM"),
        "chave": jwk["x"][:16],
        "epk": {"kty": "EC", "crv": "P-256", "x": b64u(n.x.to_bytes(32, "big")), "y": b64u(n.y.to_bytes(32, "big"))},
        "iv": b64u(iv),
        "ct": b64u(ct),
    }
    os.makedirs(os.path.dirname(os.path.abspath(a.saida)), exist_ok=True)
    json.dump(env, open(a.saida, "w"), separators=(",", ":"))
    com_logo = sum(1 for c in lista if c.get("logo"))
    print(f"{len(lista)} clientes ({com_logo} com logo) cifrados em {a.saida}")


if __name__ == "__main__":
    sys.exit(main())
