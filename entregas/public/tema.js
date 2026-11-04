/* Tema de cada pasta a partir da identidade do cliente (paleta, fontes e logo do Demandas). */
(function (g) {
  function rgb(h) { h = String(h || "").replace("#", ""); if (h.length === 3) h = h.replace(/./g, "$&$&"); var n = parseInt(h, 16); return isNaN(n) ? null : [n >> 16 & 255, n >> 8 & 255, n & 255]; }
  function hex(c) { return "#" + c.map(function (v) { v = Math.round(Math.max(0, Math.min(255, v))); return (v < 16 ? "0" : "") + v.toString(16); }).join("").toUpperCase(); }
  function lum(h) { var c = rgb(h); if (!c) return 0; c = c.map(function (v) { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }); return .2126 * c[0] + .7152 * c[1] + .0722 * c[2]; }
  function contraste(a, b) { var x = lum(a), y = lum(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); }
  function sat(h) { var c = rgb(h); if (!c) return 0; var mx = Math.max.apply(0, c) / 255, mn = Math.min.apply(0, c) / 255; return mx === 0 ? 0 : (mx - mn) / mx; }
  function mistura(a, b, t) { var x = rgb(a), y = rgb(b); if (!x || !y) return a; return hex(x.map(function (v, i) { return v + (y[i] - v) * t; })); }
  function valido(h) { return /^#[0-9a-f]{6}$/i.test(String(h || "")); }

  function tema(id) {
    id = id || {};
    var pal = (id.paleta || []).filter(valido);
    var claras = pal.filter(function (h) { return lum(h) > .75 && sat(h) < .3; }).sort(function (a, b) { return lum(b) - lum(a); });
    var escuras = pal.filter(function (h) { return lum(h) < .08; }).sort(function (a, b) { return lum(a) - lum(b); });
    var fundoPal = valido(id.fundo) ? id.fundo : claras.find(function (h) { return h !== "#FFFFFF"; });
    var ref = fundoPal || "#FAFAFA";
    // destaque: a cor mais viva da paleta que aparece bem sobre o fundo
    var vivas = pal.filter(function (h) { return sat(h) > .25 && lum(h) > .005; }).sort(function (a, b) { return sat(b) - sat(a); });
    var legiveis = vivas.filter(function (h) { return contraste(h, ref) >= 3; });
    var destaque = valido(id.destaque) ? id.destaque : (legiveis[0] || vivas[0] || (valido(id.corDemandas) ? id.corDemandas : "#E9349E"));
    var fundo = fundoPal || mistura(destaque, "#FFFFFF", .93);
    var escuro = lum(fundo) < .25;
    var texto = valido(id.texto) ? id.texto : (escuro ? (claras[0] || "#F5F5F7") : (escuras[0] || "#1D1D1F"));
    if (contraste(texto, fundo) < 4.5) texto = escuro ? "#FFFFFF" : "#141414";
    var sobre = contraste("#FFFFFF", destaque) >= contraste("#141414", destaque) ? "#FFFFFF" : "#141414";
    var destaqueTxt = contraste(destaque, fundo) >= 3 ? destaque : texto;
    return {
      fundo: fundo, texto: texto, destaque: destaque, sobreDestaque: sobre, destaqueTexto: destaqueTxt, escuro: escuro,
      superficie: escuro ? mistura(fundo, "#FFFFFF", .07) : mistura(fundo, "#FFFFFF", .72),
      superficie2: mistura(fundo, texto, escuro ? .12 : .06),
      suave: mistura(texto, fundo, .42), linha: mistura(fundo, texto, escuro ? .2 : .12),
      paleta: pal
    };
  }
  function aplicar(el, t) {
    var s = el.style;
    s.setProperty("--fundo", t.fundo); s.setProperty("--texto", t.texto); s.setProperty("--destaque", t.destaque);
    s.setProperty("--sobre-destaque", t.sobreDestaque); s.setProperty("--destaque-texto", t.destaqueTexto);
    s.setProperty("--superficie", t.superficie); s.setProperty("--superficie-2", t.superficie2);
    s.setProperty("--suave", t.suave); s.setProperty("--linha", t.linha);
  }

  /* Fontes: tenta o Google Fonts pelo nome; se não existir lá, usa uma fonte do sistema parecida */
  var PESOS = { thin: 100, extralight: 200, ultralight: 200, light: 300, regular: 400, book: 400, medium: 500, semibold: 600, demibold: 600, bold: 700, extrabold: 800, ultrabold: 800, heavy: 900, black: 900 };
  function fonte(nome) {
    var partes = String(nome || "").trim().split(/\s+/), peso = 0;
    while (partes.length > 1) { var u = partes[partes.length - 1].toLowerCase().replace(/[-_]/g, ""); if (PESOS[u]) { peso = peso || PESOS[u]; partes.pop(); } else if (u === "italic") partes.pop(); else break; }
    return { familia: partes.join(" "), peso: peso };
  }
  var carregadas = {};
  function carregar(familia) {
    if (!familia || carregadas[familia]) return;
    carregadas[familia] = 1;
    var fam = encodeURIComponent(familia).replace(/%20/g, "+");
    var l = document.createElement("link"); l.rel = "stylesheet";
    l.href = "https://fonts.googleapis.com/css2?family=" + fam + ":wght@400;500;700;800&display=swap";
    l.onerror = function () { l.remove(); var l2 = document.createElement("link"); l2.rel = "stylesheet"; l2.href = "https://fonts.googleapis.com/css2?family=" + fam + "&display=swap"; document.head.appendChild(l2); };
    document.head.appendChild(l);
  }
  function fontes(el, id) {
    var t = fonte(id.fonteTitulo), x = fonte(id.fonteTexto || id.fonteTitulo);
    carregar(t.familia); carregar(x.familia);
    var sis = '-apple-system,BlinkMacSystemFont,"SF Pro Display","Helvetica Neue",Arial,sans-serif';
    el.style.setProperty("--f-titulo", (t.familia ? '"' + t.familia.replace(/"/g, "") + '",' : "") + sis);
    el.style.setProperty("--f-texto", (x.familia ? '"' + x.familia.replace(/"/g, "") + '",' : "") + sis);
    el.style.setProperty("--peso-titulo", String(t.peso || 700));
  }
  function logoHTML(id, alt) {
    var ini = String(id.nome || "?").trim().charAt(0).toUpperCase();
    if (!id.logo) return '<span class="disco-letra">' + ini.replace(/[<>&"]/g, "") + "</span>";
    var a = id.logoAjuste, tf = a ? ' style="transform:translate(' + (+a.x || 0) + "%," + (+a.y || 0) + "%) scale(" + (+a.zoom || 1) + ')"' : "";
    return '<img src="' + id.logo + '" alt="' + String(alt || "Logo").replace(/"/g, "") + '"' + tf + ' draggable="false">';
  }
  function bytes(n) { n = +n || 0; if (n < 1024) return n + " B"; var u = ["KB", "MB", "GB", "TB"], i = -1; do { n /= 1024; i++; } while (n >= 1024 && i < 3); return (n >= 100 ? Math.round(n) : n.toFixed(n >= 10 ? 1 : 2).replace(/\.?0+$/, "")).toString().replace(".", ",") + " " + u[i]; }
  g.TemaEntregas = { tema: tema, aplicar: aplicar, fontes: fontes, logoHTML: logoHTML, bytes: bytes, contraste: contraste, lum: lum, mistura: mistura };
})(window);
