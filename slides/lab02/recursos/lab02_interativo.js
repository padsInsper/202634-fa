/*
 * Slides interativos do Lab 2 (ML para séries e séries hierárquicas), com GSAP.
 * Mesmo esquema das aulas de CDAD II e Ciência dos Dados: cada slide com
 * animação tem fragmentos vazios `.passo`, e a função `cena(k, anim)` do slide
 * redesenha o estado com k passos visíveis. Nas caixas `.legendas`, aparece o
 * filho de índice k. Slides com animação de entrada guardam `_entrar`.
 *
 * Código de cores (ver lab02.css): série em cinza escuro, features em azul,
 * alvo em laranja, vazamento e incoerência em vermelho, previsão em turquesa,
 * reconciliado em roxo.
 *
 * Os números da Cervejaria Ipê vêm de recursos/dados_lab02.js. As séries
 * ilustrativas (árvore, modelo global) usam semente fixa.
 */
(function () {
  "use strict";

  const NS = "http://www.w3.org/2000/svg";
  const D = window.DADOS_LAB02;

  /* ---------- utilitários ---------------------------------------------- */

  function el(tag, attrs, pai) {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs || {}) n.setAttribute(k, attrs[k]);
    if (pai) pai.appendChild(n);
    return n;
  }
  function texto(pai, x, y, t, attrs) {
    const n = el("text", Object.assign({ x, y }, attrs || {}), pai);
    n.textContent = t;
    return n;
  }
  const escala = (d0, d1, r0, r1) => (v) => r0 + ((v - d0) / (d1 - d0)) * (r1 - r0);
  function num(v, casas = 0) {
    return Number(v).toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
  }
  const $ = (s, r) => (r || document).querySelector(s);
  const DUR = 0.45;

  function gerador(semente) {
    let a = semente >>> 0;
    const u = () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const normal = () => {
      let x = 0;
      while (x === 0) x = u();
      return Math.sqrt(-2 * Math.log(x)) * Math.cos(2 * Math.PI * u());
    };
    return { u, normal };
  }

  function caminho(xs, ys) {
    return xs.map((x, i) => `${i ? "L" : "M"}${x.toFixed(1)},${ys[i].toFixed(1)}`).join("");
  }
  function marcas(a, b, n = 5) {
    const bruto = (b - a) / n;
    const pot = 10 ** Math.floor(Math.log10(bruto));
    const st = [1, 2, 5, 10].map((k) => k * pot).find((v) => v >= bruto * 0.999);
    const out = [];
    for (let v = Math.ceil(a / st - 1e-9) * st; v <= b + 1e-9; v += st) out.push(+v.toFixed(10));
    return out;
  }
  function eixoY(g, sy, y0, y1, x, x1, n = 4, casas = 0) {
    for (const v of marcas(y0, y1, n)) {
      el("line", { x1: x, x2: x1, y1: sy(v), y2: sy(v), class: "grade-linha" }, g);
      texto(g, x - 8, sy(v) + 5, num(v, casas), { "text-anchor": "end", class: "rotulo-eixo" });
    }
  }
  function ponta(svg, id, cls) {
    const mk = el("marker", { id, viewBox: "0 0 10 10", refX: 8, refY: 5, markerWidth: 6, markerHeight: 6,
                              orient: "auto-start-reverse" }, el("defs", {}, svg));
    el("path", { d: "M0,0 L10,5 L0,10 Z", class: cls }, mk);
    return `url(#${id})`;
  }
  function vis(alvo, on, anim, extra) {
    if (!alvo) return;
    gsap.to(alvo, Object.assign({ autoAlpha: on ? 1 : 0, duration: anim ? DUR : 0, overwrite: "auto" }, extra || {}));
  }
  /* desenha um path do começo ao fim */
  function tracar(path, dur = 1.6) {
    const L = path.getTotalLength();
    gsap.fromTo(path, { strokeDasharray: L, strokeDashoffset: L },
                { strokeDashoffset: 0, duration: dur, ease: "power1.inOut",
                  onComplete: () => gsap.set(path, { clearProps: "strokeDasharray,strokeDashoffset" }) });
  }
  function modos(id, f) {
    const caixa = $(`#${id}`);
    if (!caixa) return null;
    const bs = [...caixa.querySelectorAll("button")];
    const estado = { v: (bs.find((b) => b.classList.contains("ativo")) || bs[0]).dataset.modo };
    bs.forEach((b) => {
      b.addEventListener("click", () => {
        b.blur(); // as setas voltam a passar slide
        estado.v = b.dataset.modo;
        bs.forEach((o) => o.classList.toggle("ativo", o === b));
        f(true);
      });
    });
    estado.escolher = (m) => {
      estado.v = m;
      bs.forEach((o) => o.classList.toggle("ativo", o.dataset.modo === m));
    };
    return estado;
  }
  function controle(id, fmt, f) {
    const inp = $(`#${id}`), saida = $(`#${id}-v`);
    if (!inp) return null;
    inp.addEventListener("keydown", (e) => e.stopPropagation()); // as setas movem o controle, e não o slide
    const at = (anim) => { if (saida) saida.textContent = fmt(+inp.value); f(anim); };
    inp.addEventListener("input", () => at(false));
    return { inp, at, get v() { return +inp.value; }, set v(x) { inp.value = x; } };
  }
  function secao(caixa) { return caixa && caixa.closest("section"); }
  function cena(caixa, f) { const s = secao(caixa); if (s) s._cena = f; }
  function entrar(caixa, f) { const s = secao(caixa); if (s) s._entrar = f; }
  function novoSvg(caixa, W, H) {
    return el("svg", { viewBox: `0 0 ${W} ${H}`, class: "grafico-svg" }, caixa);
  }
  const ANO = (s) => +s.slice(0, 4), MES = (s) => +s.slice(5, 7);

  /* ====================================================================== */
  /* 1. A série da Cervejaria Ipê                                           */
  /* ====================================================================== */

  function montarSerie() {
    const caixa = $("#g-serie");
    if (!caixa) return;
    const n = D.datas.findIndex((d) => d === "2025-01");
    const ds = D.datas.slice(0, n), ys = D.brasil.slice(0, n).map((v) => v / 1000);
    const W = 760, H = 480, x0 = 60, x1 = W - 10, yTop = 30, yBase = H - 40;
    const svg = novoSvg(caixa, W, H);
    const sx = escala(0, n - 1, x0, x1), sy = escala(40, 100, yBase, yTop);
    eixoY(svg, sy, 40, 100, x0, x1, 5);
    texto(svg, x0 - 50, 18, "milhões de litros por mês", { class: "anot fraco pequena" });

    const gVerao = el("g", {}, svg), gPand = el("g", {}, svg);
    // verão: dezembro a março de cada ano
    ds.forEach((d, i) => {
      if (MES(d) === 12 || MES(d) <= 3) {
        el("rect", { x: sx(i) - (x1 - x0) / (n - 1) / 2, y: yTop, width: (x1 - x0) / (n - 1), height: yBase - yTop,
                     class: "destaque-area" }, gVerao);
      }
    });
    const iP = ds.indexOf("2020-04"), fP = ds.indexOf("2020-07");
    el("rect", { x: sx(iP) - 4, y: yTop, width: sx(fP) - sx(iP) + 8, height: yBase - yTop, class: "destaque-marca" }, gPand);
    texto(gPand, sx(fP) + 10, sy(46), "bares fechados", { class: "anot c-marca" });

    for (let a = 2018; a <= 2024; a++) {
      const i = ds.indexOf(`${a}-01`);
      el("line", { x1: sx(i), x2: sx(i), y1: yBase, y2: yBase + 5, class: "eixo" }, svg);
      texto(svg, sx(i) + 4, yBase + 24, String(a), { class: "rotulo-eixo" });
    }
    el("line", { x1: x0, x2: x1, y1: yBase, y2: yBase, class: "eixo" }, svg);
    const linha = el("path", { d: caminho(ds.map((_, i) => sx(i)), ys.map(sy)), class: "linha-serie" }, svg);

    // tendência: reta de mínimos quadrados
    const mx = (n - 1) / 2, my = ys.reduce((a, b) => a + b, 0) / n;
    let sxy = 0, sxx = 0;
    ys.forEach((y, i) => { sxy += (i - mx) * (y - my); sxx += (i - mx) ** 2; });
    const b = sxy / sxx, a = my - b * mx;
    const tend = el("line", { x1: sx(0), y1: sy(a), x2: sx(n - 1), y2: sy(a + b * (n - 1)), class: "seta-prev",
                              "stroke-dasharray": "10 6" }, svg);

    cena(caixa, (k, anim) => {
      vis(gVerao, k >= 1, anim);
      vis(gPand, k >= 2, anim);
      vis(tend, k >= 3, anim);
    });
    entrar(caixa, () => tracar(linha));
  }

  /* ====================================================================== */
  /* 2. A série vira uma tabela                                             */
  /* ====================================================================== */

  function montarTabela() {
    const caixa = $("#g-tabela");
    if (!caixa) return;
    const i0 = D.datas.indexOf("2022-07"), i1 = D.datas.indexOf("2024-12");
    const ds = D.datas.slice(i0, i1 + 1), ys = D.brasil.slice(i0, i1 + 1).map((v) => v / 1000);
    const n = ds.length;
    const W = 1180, H = 380, x0 = 50, x1 = 560, yTop = 40, yBase = 320;
    const svg = novoSvg(caixa, W, H);
    const sx = escala(0, n - 1, x0, x1), sy = escala(50, 95, yBase, yTop);
    eixoY(svg, sy, 50, 95, x0, x1, 4);
    el("line", { x1: x0, x2: x1, y1: yBase, y2: yBase, class: "eixo" }, svg);
    for (const a of [2023, 2024]) {
      const i = ds.indexOf(`${a}-01`);
      texto(svg, sx(i), yBase + 24, String(a), { class: "rotulo-eixo", "text-anchor": "middle" });
    }
    const banda = el("rect", { y: yTop - 10, height: yBase - yTop + 10, class: "faixa-azul", rx: 4 }, svg);
    el("path", { d: caminho(ys.map((_, i) => sx(i)), ys.map(sy)), class: "linha-serie fina" }, svg);
    ys.forEach((y, i) => el("circle", { cx: sx(i), cy: sy(y), r: 4, class: "ponto-serie" }, svg));
    const seta = ponta(svg, "tab-seta", "seta-cabeca-azul");
    const arco1 = el("path", { class: "arco", "marker-end": seta }, svg);
    const arco12 = el("path", { class: "arco", "marker-end": seta }, svg);
    const pL1 = el("circle", { r: 8, class: "ponto-feat" }, svg);
    const pL12 = el("circle", { r: 8, class: "ponto-feat" }, svg);
    const pT = el("circle", { r: 9, class: "ponto-alvo" }, svg);
    const tT = texto(svg, 0, 0, "t", { class: "anot forte c-laranja", "text-anchor": "middle" });
    const tL1 = texto(svg, 0, 0, "t − 1", { class: "anot c-azul pequena", "text-anchor": "middle" });
    const tL12 = texto(svg, 0, 0, "t − 12", { class: "anot c-azul pequena", "text-anchor": "middle" });

    // a tabela, desenhada no mesmo SVG
    const cols = [["mês t", "mes"], ["lag 1", "feat"], ["lag 12", "feat"], ["média 3m", "feat"], ["y (alvo)", "alvo"]];
    const tx0 = 610, cw = 112, rh = 46, ty0 = 40;
    cols.forEach(([c], j) => {
      el("rect", { x: tx0 + j * cw, y: ty0, width: cw, height: rh, class: "tab-cab" }, svg);
      texto(svg, tx0 + j * cw + cw / 2, ty0 + 29, c, { class: "tab-txt cab", "text-anchor": "middle" });
    });
    const linhasT = [ds.indexOf("2024-07"), ds.indexOf("2024-08"), ds.indexOf("2024-09"), ds.indexOf("2024-10"),
                     ds.indexOf("2024-11")];
    const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
    const valores = linhasT.map((t) => [
      `${MESES[MES(ds[t]) - 1]}/${String(ANO(ds[t])).slice(2)}`,
      num(ys[t - 1], 1), num(ys[t - 12], 1), num((ys[t - 1] + ys[t - 2] + ys[t - 3]) / 3, 1), num(ys[t], 1),
    ]);
    const celulas = linhasT.map((_, r) => cols.map(([, tipo], j) => {
      const y = ty0 + rh * (r + 1);
      el("rect", { x: tx0 + j * cw, y, width: cw, height: rh, class: `tab-cel${tipo === "alvo" ? " alvo" : ""}` }, svg);
      return texto(svg, tx0 + j * cw + cw / 2, y + 29, valores[r][j], { class: `tab-txt ${tipo}`, "text-anchor": "middle" });
    }));
    const voadores = [0, 1, 2, 3].map((j) => el("circle", { r: 7, class: j === 3 ? "ponto-alvo" : "ponto-feat" }, svg));

    function marcar(t, anim) {
      const d = anim ? 0.5 : 0;
      gsap.to(pT, { attr: { cx: sx(t), cy: sy(ys[t]) }, duration: d });
      gsap.to(pL1, { attr: { cx: sx(t - 1), cy: sy(ys[t - 1]) }, duration: d });
      gsap.to(pL12, { attr: { cx: sx(t - 12), cy: sy(ys[t - 12]) }, duration: d });
      gsap.to(tT, { attr: { x: sx(t), y: sy(ys[t]) - 18 }, duration: d });
      gsap.to(tL1, { attr: { x: sx(t - 1), y: yBase + 46 }, duration: d });
      gsap.to(tL12, { attr: { x: sx(t - 12), y: sy(ys[t - 12]) - 16 }, duration: d });
      gsap.to(banda, { attr: { x: sx(t - 3) - 9, width: sx(t - 1) - sx(t - 3) + 18 }, duration: d });
      const arco = (a, b) => {
        const xa = sx(a), xb = sx(b), ya = sy(ys[a]), yb = sy(ys[b]);
        const topo = Math.min(ya, yb) - 40 - (xb - xa) * 0.12;
        return `M${xb},${yb - 10} Q${(xa + xb) / 2},${topo} ${xa},${ya - 12}`;
      };
      arco1.setAttribute("d", arco(t - 1, t));
      arco12.setAttribute("d", arco(t - 12, t));
    }
    function voar(r, t, tl, inicio) {
      const alvos = [[t - 1, 1], [t - 12, 2], [t - 2, 3], [t, 4]];
      alvos.forEach(([i, j], q) => {
        const c = voadores[q];
        const cx = tx0 + j * cw + cw / 2, cy = ty0 + rh * (r + 1) + rh / 2;
        tl.set(c, { attr: { cx: sx(i), cy: sy(ys[i]) }, autoAlpha: 1 }, inicio)
          .to(c, { attr: { cx, cy }, duration: 0.7, ease: "power2.inOut" }, inicio + q * 0.08)
          .to(c, { autoAlpha: 0, duration: 0.15 }, inicio + 0.75 + q * 0.08);
      });
      tl.to(celulas[r], { autoAlpha: 1, duration: 0.25, stagger: 0.05 }, inicio + 0.7);
    }
    let tl = null;
    cena(caixa, (k, anim) => {
      if (tl) tl.kill();
      gsap.set(voadores, { autoAlpha: 0 });
      const marcaveis = [pT, pL1, pL12, tT, tL1, tL12, banda, arco1, arco12];
      if (k === 0) {
        marcar(linhasT[0], false);
        gsap.set(celulas.flat(), { autoAlpha: 0 });
        vis(marcaveis, true, anim);
        return;
      }
      if (k === 1) {
        marcar(linhasT[0], false);
        gsap.set(celulas.slice(1).flat(), { autoAlpha: 0 });
        if (!anim) { gsap.set(celulas[0], { autoAlpha: 1 }); return; }
        gsap.set(celulas[0], { autoAlpha: 0 });
        tl = gsap.timeline();
        voar(0, linhasT[0], tl, 0);
        return;
      }
      // k = 2: o mês t anda e as linhas seguintes se preenchem
      gsap.set(celulas[0], { autoAlpha: 1 });
      if (!anim) {
        marcar(linhasT[linhasT.length - 1], false);
        gsap.set(celulas.flat(), { autoAlpha: 1 });
        return;
      }
      gsap.set(celulas.slice(1).flat(), { autoAlpha: 0 });
      tl = gsap.timeline();
      linhasT.slice(1).forEach((t, q) => {
        const r = q + 1, ini = q * 1.25;
        tl.call(() => marcar(t, true), null, ini);
        voar(r, t, tl, ini + 0.5);
      });
    });
  }

  /* ====================================================================== */
  /* 3. As features mais usadas                                             */
  /* ====================================================================== */

  function montarFeatures() {
    const caixa = $("#g-features");
    if (!caixa) return;
    const i0 = D.datas.indexOf("2023-01"), i1 = D.datas.indexOf("2024-12");
    const ds = D.datas.slice(i0, i1 + 1), ys = D.brasil.slice(i0, i1 + 1).map((v) => v / 1000);
    const n = ds.length, t = n - 1;
    const W = 720, H = 400, x0 = 50, x1 = W - 20, yTop = 40, yBase = 350;
    const svg = novoSvg(caixa, W, H);
    const sx = escala(0, n - 1, x0, x1), sy = escala(55, 95, yBase, yTop);
    eixoY(svg, sy, 55, 95, x0, x1, 4);
    el("line", { x1: x0, x2: x1, y1: yBase, y2: yBase, class: "eixo" }, svg);
    texto(svg, sx(0), yBase + 24, "jan/23", { class: "rotulo-eixo", "text-anchor": "middle" });
    texto(svg, sx(12), yBase + 24, "jan/24", { class: "rotulo-eixo", "text-anchor": "middle" });
    texto(svg, sx(t), yBase + 24, "dez/24 = t", { class: "rotulo-eixo", "text-anchor": "end" });
    const banda = el("rect", { y: yTop - 8, height: yBase - yTop + 8, rx: 4, class: "faixa-azul" }, svg);
    const media = el("line", { class: "seta", "stroke-dasharray": "6 4" }, svg);
    const tMedia = texto(svg, 0, 0, "", { class: "anot c-azul pequena" });
    el("path", { d: caminho(ys.map((_, i) => sx(i)), ys.map(sy)), class: "linha-serie fina" }, svg);
    const pts = ys.map((y, i) => el("circle", { cx: sx(i), cy: sy(y), r: 5, class: "ponto-serie" }, svg));
    el("circle", { cx: sx(t), cy: sy(ys[t]), r: 9, class: "ponto-alvo" }, svg);
    texto(svg, sx(t), sy(ys[t]) - 16, "alvo", { class: "anot c-laranja", "text-anchor": "middle" });
    const tMes = texto(svg, sx(t) - 120, yTop - 10, "", { class: "anot c-azul" });

    const INFO = {
      lag1: ["Lag 1", "O valor do mês anterior. Carrega o <b>nível recente</b> da série.", "df.y.shift(1)", [t - 1]],
      lag12: ["Lag 12", "O mesmo mês do ano anterior. Carrega a <b>sazonalidade</b> anual.", "df.y.shift(12)", [t - 12]],
      media3: ["Média de 3 meses", "O nível dos últimos três meses, com menos ruído que um lag só.",
               "df.y.shift(1).rolling(3).mean()", [t - 3, t - 2, t - 1]],
      media12: ["Média de 12 meses", "O patamar do último ano inteiro: limpa a sazonalidade e mostra a <b>tendência</b>.",
                "df.y.shift(1).rolling(12).mean()", Array.from({ length: 12 }, (_, i) => t - 12 + i)],
      mes: ["Mês do ano", "Só o número do mês (12), ou o par seno e cosseno, para dezembro ficar perto de janeiro.",
            "df.ds.dt.month", []],
    };
    const caixaTxt = $("#ft-texto");
    let modo;
    function desenhar(anim) {
      const [nome, desc, cod, usados] = INFO[modo.v];
      caixaTxt.innerHTML = `<span class="rotulo">${nome}</span><p>${desc}</p><p><code>${cod}</code></p>`;
      pts.forEach((p, i) => p.setAttribute("class", usados.includes(i) ? "ponto-feat" : "ponto-serie"));
      gsap.to(pts, { attr: { r: (i) => (usados.includes(i) ? 8 : 5) }, duration: anim ? 0.3 : 0 });
      const temBanda = usados.length > 1;
      if (temBanda) {
        gsap.to(banda, { attr: { x: sx(usados[0]) - 10, width: sx(usados[usados.length - 1]) - sx(usados[0]) + 20 },
                         autoAlpha: 1, duration: anim ? 0.4 : 0 });
        const m = usados.reduce((a, i) => a + ys[i], 0) / usados.length;
        gsap.to(media, { attr: { x1: sx(usados[0]) - 10, x2: sx(t), y1: sy(m), y2: sy(m) }, autoAlpha: 1, duration: anim ? 0.4 : 0 });
        tMedia.textContent = `média = ${num(m, 1)}`;
        gsap.to(tMedia, { attr: { x: sx(usados[0]), y: sy(m) + 22 }, autoAlpha: 1, duration: anim ? 0.4 : 0 });
      } else {
        vis([banda, media, tMedia], false, anim);
      }
      if (modo.v === "mes") {
        tMes.textContent = "feature: mês = 12";
        vis(tMes, true, anim);
        // os dezembros ganham destaque: é o mesmo valor da feature
        ds.forEach((d, i) => { if (MES(d) === 12 && i !== t) { pts[i].setAttribute("class", "ponto-feat"); gsap.set(pts[i], { attr: { r: 8 } }); } });
      } else vis(tMes, false, anim);
    }
    modo = modos("ft-modos", desenhar);
    desenhar(false);
  }

  /* ====================================================================== */
  /* 3b. Variáveis exógenas: o que se sabe depois da origem da previsão     */
  /* ====================================================================== */

  function montarExog() {
    const caixa = $("#g-exog");
    if (!caixa) return;
    const np = 24, nf = 12, n = np + nf;
    const W = 760, H = 330, x0 = 190, x1 = W - 10, cw = (x1 - x0) / n;
    const svg = novoSvg(caixa, W, H);
    const xc = (i) => x0 + i * cw;
    const LIN = [
      ["y: vendas", 40, "y"], ["datas especiais", 100, "cal"], ["preço, promoção", 160, "dec"],
      ["temperatura, renda", 220, "ext"], ["temperatura (lag 12)", 280, "lag"],
    ];
    const g = gerador(5);
    const temp = Array.from({ length: n }, (_, i) => 0.55 + 0.35 * Math.cos((2 * Math.PI * i) / 12) + 0.08 * g.normal());
    const linhas = {};
    // origem da previsão
    const xo = xc(np);
    el("rect", { x: xo, y: 14, width: x1 - xo, height: H - 22, class: "faixa-teste" }, svg);
    texto(svg, xo - 6, 12, "passado", { class: "rotulo-eixo", "text-anchor": "end" });
    texto(svg, xo + 6, 12, "futuro: o que queremos prever", { class: "rotulo-eixo" });
    for (const [rot, y, id] of LIN) {
      const gl = el("g", {}, svg);
      texto(gl, x0 - 12, y + 20, rot, { class: "anot pequena", "text-anchor": "end" });
      for (let i = 0; i < n; i++) {
        const fut = i >= np, x = xc(i) + 1.5, w = cw - 3;
        let cls = "cel-fora", alt = 26, op = 1, txt = null;
        if (id === "y") { cls = fut ? "cel-teste" : "cel-treino"; op = fut ? 0.35 : 1; txt = fut ? "?" : null; }
        if (id === "cal") { const ev = [1, 13, 25, 10, 22, 34].includes(i); cls = ev ? "cel-treino" : "cel-fora"; }
        if (id === "dec") { cls = "cel-treino"; op = fut ? 0.6 : 1; alt = 10 + 16 * (0.5 + 0.5 * Math.sin(i * 1.7)); }
        if (id === "ext") { cls = fut ? "cel-fora" : "cel-treino"; alt = fut ? 26 : 26 * temp[i]; txt = fut ? "?" : null; }
        if (id === "lag") { cls = "cel-treino"; alt = i >= 12 ? 26 * temp[i - 12] : 0; op = fut ? 0.75 : 1; }
        if (alt > 0) el("rect", { x, y: y + 26 - alt, width: w, height: alt, rx: 2, class: cls, style: `opacity:${op}` }, gl);
        if (txt) texto(gl, x + w / 2, y + 20, txt, { class: "anot pequena", "text-anchor": "middle" });
      }
      const sinal = { cal: ["✓ conhecida", "c-turquesa"], dec: ["✓ planejada", "c-turquesa"],
                      ext: ["✗ não existe", "c-marca"], lag: ["✓ já observada", "c-turquesa"] }[id];
      if (sinal) texto(gl, x1 - 4, y - 6, sinal[0], { class: `anot pequena ${sinal[1]}`, "text-anchor": "end" });
      linhas[id] = gl;
    }
    el("line", { x1: xo, x2: xo, y1: 14, y2: H - 8, style: "stroke:var(--marca);stroke-width:3" }, svg);
    texto(svg, xo, H + 8, "origem da previsão", { class: "anot c-marca pequena", "text-anchor": "middle" });
    // a seta do lag: o valor de 12 meses antes vai para o futuro
    const gSeta = el("g", {}, svg);
    const cab = ponta(svg, "pt-exog", "seta-cabeca-azul");
    el("path", { d: `M${xc(np - 9) + cw / 2},${246} C${xc(np - 9) + cw / 2},${264} ${xc(np + 3) + cw / 2},${258} ${xc(np + 3) + cw / 2},${276}`,
                 class: "arco", "marker-end": cab }, gSeta);
    cena(caixa, (k, anim) => {
      vis(linhas.cal, k >= 1, anim);
      vis(linhas.dec, k >= 2, anim);
      vis(linhas.ext, k >= 3, anim);
      vis([linhas.lag, gSeta], k >= 4, anim);
    });
  }

  /* ====================================================================== */
  /* 3c. Features automáticas: uma série vira centenas de colunas           */
  /* ====================================================================== */

  function montarAutoFeat() {
    const caixa = $("#g-autofeat");
    if (!caixa) return;
    const i1 = D.datas.indexOf("2024-12");
    const ys = D.brasil.slice(0, i1 + 1).map((v) => v / 1000), n = ys.length;
    const W = 720, H = 405;
    const svg = novoSvg(caixa, W, H);
    // a série, pequena, à esquerda
    const sx = escala(0, n - 1, 10, 230), mn = Math.min(...ys), mx = Math.max(...ys);
    const sy = escala(mn, mx, 250, 130);
    const serie = el("path", { d: caminho(ys.map((_, i) => sx(i)), ys.map(sy)), class: "linha-serie" }, svg);
    texto(svg, 120, 110, "vendas no Brasil, 2018 a 2024", { class: "anot pequena", "text-anchor": "middle" });
    const cab = ponta(svg, "pt-auto", "seta-cabeca");
    el("path", { d: "M245,190 L300,190", class: "seta", "marker-end": cab }, svg);
    // features calculadas de verdade sobre a série
    const media = ys.reduce((a, v) => a + v, 0) / n;
    const dp = Math.sqrt(ys.reduce((a, v) => a + (v - media) ** 2, 0) / (n - 1));
    const acf = (l) => {
      let a = 0, b = 0;
      for (let i = 0; i < n; i++) { b += (ys[i] - media) ** 2; if (i >= l) a += (ys[i] - media) * (ys[i - l] - media); }
      return a / b;
    };
    const xm = (n - 1) / 2;
    const incl = ys.reduce((a, v, i) => a + (i - xm) * (v - media), 0) / ys.reduce((a, _, i) => a + (i - xm) ** 2, 0);
    const assim = ys.reduce((a, v) => a + ((v - media) / dp) ** 3, 0) / n;
    let picos = 0;
    for (let i = 1; i < n - 1; i++) if (ys[i] > ys[i - 1] && ys[i] > ys[i + 1]) picos++;
    const FEAT = [
      ["média", num(media, 1)], ["desvio padrão", num(dp, 1)], ["autocorrelação, lag 1", num(acf(1), 2)],
      ["autocorrelação, lag 12", num(acf(12), 2)], ["inclinação por ano", num(incl * 12, 2)],
      ["assimetria", num(assim, 2)], ["número de picos", String(picos)], ["máximo", num(mx, 1)],
      ["mínimo", num(mn, 1)], ["força da sazonalidade", "…"], ["entropia espectral", "…"],
    ];
    const x0 = 320, lw = 300, rh = 28, y0 = 20;
    el("rect", { x: x0, y: y0, width: lw + 90, height: rh, class: "tab-cab" }, svg);
    texto(svg, x0 + 10, y0 + 22, "feature", { class: "tab-txt cab" });
    texto(svg, x0 + lw + 80, y0 + 22, "valor", { class: "tab-txt cab", "text-anchor": "end" });
    const linhas = FEAT.map(([f, v], i) => {
      const gl = el("g", {}, svg), y = y0 + rh * (i + 1);
      el("rect", { x: x0, y, width: lw + 90, height: rh, class: "tab-cel" }, gl);
      texto(gl, x0 + 10, y + 20, f, { class: "tab-txt" });
      texto(gl, x0 + lw + 80, y + 20, v, { class: "tab-txt feat", "text-anchor": "end" });
      return gl;
    });
    const yC = y0 + rh * (FEAT.length + 1) + 34;
    const cont = texto(svg, x0 + (lw + 90) / 2, yC, "", { class: "anot forte c-azul", "text-anchor": "middle", style: "font-size:24px" });
    const contar = { v: 0 };
    const escrever = () => { cont.textContent = `+ ${Math.round(contar.v)} features no tsfresh`; };
    function animar() {
      gsap.killTweensOf([linhas, contar]);
      tracar(serie, 1);
      gsap.fromTo(linhas, { autoAlpha: 0, x: -30 }, { autoAlpha: 1, x: 0, duration: 0.3, stagger: 0.12, delay: 0.6 });
      contar.v = 0; escrever();
      gsap.to(contar, { v: 780, duration: 1.6, delay: 0.6 + 0.12 * FEAT.length, ease: "power2.out", onUpdate: escrever });
    }
    contar.v = 780; escrever();
    entrar(caixa, animar);
  }

  /* ====================================================================== */
  /* 4. O vazamento: a janela que inclui o próprio mês                      */
  /* ====================================================================== */

  function montarVazamento() {
    const caixa = $("#g-vazamento");
    if (!caixa) return;
    const b = $("#vz-modos");
    // um terceiro botão: a janela centrada, que também vaza
    const extra = document.createElement("button");
    extra.dataset.modo = "centrada";
    extra.textContent = "rolling(3, center=True).mean()";
    b.appendChild(extra);
    const i0 = D.datas.indexOf("2024-01");
    const ys = D.brasil.slice(i0, i0 + 12).map((v) => v / 1000);
    const n = ys.length, t = 8;
    const W = 720, H = 300, x0 = 40, x1 = W - 30, yTop = 50, yBase = 240;
    const svg = novoSvg(caixa, W, H);
    const sx = escala(0, n - 1, x0, x1), sy = escala(55, 95, yBase, yTop);
    el("line", { x1: x0, x2: x1, y1: yBase, y2: yBase, class: "eixo" }, svg);
    const banda = el("rect", { y: yTop - 22, height: yBase - yTop + 22, rx: 6 }, svg);
    const tBanda = texto(svg, 0, yTop - 30, "", { class: "anot", "text-anchor": "middle" });
    el("path", { d: caminho(ys.map((_, i) => sx(i)), ys.map(sy)), class: "linha-serie fina" }, svg);
    const pts = ys.map((y, i) => el("circle", { cx: sx(i), cy: sy(y), r: 6, class: "ponto-serie" }, svg));
    const rot = ["t − 3", "t − 2", "t − 1", "t", "t + 1"];
    [-3, -2, -1, 0, 1].forEach((d, q) => texto(svg, sx(t + d), yBase + 26, rot[q],
      { class: `rotulo-eixo${d === 0 ? " forte" : ""}`, "text-anchor": "middle" }));
    const alvo = el("circle", { cx: sx(t), cy: sy(ys[t]), r: 11, class: "ponto-alvo" }, svg);
    const tAlvo = texto(svg, sx(t) + 16, sy(ys[t]) + 30, "alvo", { class: "anot c-laranja" });
    const regra = $("#vz-regra");
    const MODOS = {
      errado: { de: t - 2, ate: t, ok: false, rot: "a janela contém o alvo",
                txt: "<b>Vazou:</b> a média de t − 2 a t já contém o y que queremos prever. Na validação o erro fica lindo; em produção, esse valor ainda não existe." },
      certo: { de: t - 3, ate: t - 1, ok: true, rot: "só o passado",
               txt: "<b>Seguro:</b> a janela termina em t − 1, que é o que de fato se conhece na hora de prever o mês t." },
      centrada: { de: t - 1, ate: t + 1, ok: false, rot: "usa t + 1, o futuro",
                  txt: "<b>Vazou duas vezes:</b> a janela centrada usa o próprio t e ainda o mês seguinte. Comum em gráfico de tendência; proibida como feature." },
    };
    let modo;
    function desenhar(anim) {
      const m = MODOS[modo.v], d = anim ? 0.45 : 0;
      banda.setAttribute("class", m.ok ? "faixa-azul" : "faixa-marca");
      gsap.to(banda, { attr: { x: sx(m.de) - 18, width: sx(m.ate) - sx(m.de) + 36 }, duration: d, ease: "power2.out" });
      tBanda.textContent = m.rot;
      tBanda.setAttribute("class", `anot forte ${m.ok ? "c-azul" : "c-marca"}`);
      gsap.to(tBanda, { attr: { x: (sx(m.de) + sx(m.ate)) / 2 }, duration: d });
      pts.forEach((p, i) => p.setAttribute("class", i >= m.de && i <= m.ate ? (m.ok ? "ponto-feat" : "ponto-vaza") : "ponto-serie"));
      alvo.setAttribute("class", m.ok ? "ponto-alvo" : "ponto-vaza");
      tAlvo.setAttribute("class", `anot ${m.ok ? "c-laranja" : "c-marca"}`);
      if (anim && !m.ok) gsap.fromTo(alvo, { attr: { r: 18 } }, { attr: { r: 11 }, duration: 0.6, ease: "elastic.out(1, 0.4)" });
      regra.className = `regra-viva${m.ok ? " ok" : ""}`;
      regra.innerHTML = m.txt;
    }
    modo = modos("vz-modos", desenhar);
    desenhar(false);
  }

  /* ====================================================================== */
  /* 5. Validação cruzada no tempo                                          */
  /* ====================================================================== */

  function montarCV() {
    const caixa = $("#g-cv");
    if (!caixa) return;
    const n = 84, K = 5, W = 1180, H = 290, x0 = 110, x1 = W - 10, y0 = 34, rh = 38;
    const svg = novoSvg(caixa, W, H);
    const cw = (x1 - x0) / n;
    const celulas = [];
    for (let r = 0; r < K; r++) {
      texto(svg, x0 - 12, y0 + r * rh + 24, `janela ${r + 1}`, { class: "rotulo-eixo", "text-anchor": "end" });
      celulas.push(Array.from({ length: n }, (_, i) =>
        el("rect", { x: x0 + i * cw + 0.6, y: y0 + r * rh, width: cw - 1.2, height: rh - 8, rx: 2 }, svg)));
    }
    for (let a = 0; a < 7; a++) {
      texto(svg, x0 + (a * 12 + 6) * cw, y0 + K * rh + 18, String(2018 + a), { class: "rotulo-eixo", "text-anchor": "middle" });
      if (a) el("line", { x1: x0 + a * 12 * cw, x2: x0 + a * 12 * cw, y1: y0 - 6, y2: y0 + K * rh - 4, class: "grade-linha" }, svg);
    }
    const leg = el("g", {}, svg);
    [["cel-treino", "treino"], ["cel-teste", "teste"], ["cel-fora", "não usado"]].forEach(([c, t], q) => {
      el("rect", { x: x0 + q * 150, y: 4, width: 18, height: 18, rx: 3, class: c }, leg);
      texto(leg, x0 + q * 150 + 26, 19, t, { class: "rotulo-eixo" });
    });
    // k-fold: meses sorteados (semente fixa) em 5 grupos
    const g = gerador(7), ordem = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) { const j = Math.floor(g.u() * (i + 1)); [ordem[i], ordem[j]] = [ordem[j], ordem[i]]; }
    const grupo = new Array(n);
    ordem.forEach((m, q) => { grupo[m] = q % K; });
    const TEXTO = {
      kfold: ["", "<b>Treina com o futuro:</b> para prever um mês de 2019, o modelo já viu 2023 e 2024. O erro sai otimista, e a comparação entre modelos fica enganosa."],
      expanding: [" ok", "<b>Janela expansível:</b> cada janela treina com tudo o que veio antes e testa nos 12 meses seguintes. É a simulação honesta de usar o modelo em produção."],
      sliding: [" ok", "<b>Janela deslizante:</b> o treino tem tamanho fixo (aqui, 24 meses) e esquece o passado distante. Útil quando o regime muda; numa série curta, joga dado fora."],
    };
    let modo;
    function desenhar(anim) {
      for (let r = 0; r < K; r++) {
        const ini = 24 + r * 12;
        celulas[r].forEach((c, i) => {
          let cls;
          if (modo.v === "kfold") cls = grupo[i] === r ? "cel-teste" : "cel-treino";
          else if (i >= ini && i < ini + 12) cls = "cel-teste";
          else if (i < ini && (modo.v === "expanding" || i >= ini - 24)) cls = "cel-treino";
          else cls = "cel-fora";
          c.setAttribute("class", cls);
        });
      }
      if (anim) gsap.fromTo(celulas.flat(), { scaleY: 0.15, transformOrigin: "50% 50%" },
                            { scaleY: 1, duration: 0.35, stagger: { each: 0.0012, from: "start" }, ease: "back.out(2)" });
      const [c, t] = TEXTO[modo.v];
      const r = $("#cv-texto");
      r.className = `regra-viva${c}`;
      r.innerHTML = t;
    }
    modo = modos("cv-modos", desenhar);
    desenhar(false);
  }

  /* ====================================================================== */
  /* 6. Recursivo ou direto                                                 */
  /* ====================================================================== */

  function montarHorizonte() {
    const caixa = $("#g-horizonte");
    if (!caixa) return;
    const i0 = D.datas.indexOf("2023-07"), i1 = D.datas.indexOf("2024-12");
    const ys = D.brasil.slice(i0, i1 + 1).map((v) => v / 1000);
    const nh = ys.length, H12 = 12;
    // previsão ilustrativa: o mesmo mês do ano anterior, com 3% de crescimento
    const prev = Array.from({ length: H12 }, (_, h) => ys[nh - 12 + h] * 1.03);
    const W = 760, H = 320, x0 = 40, x1 = W - 20, yTop = 30, yBase = 260;
    const svg = novoSvg(caixa, W, H);
    const sx = escala(0, nh + H12 - 1, x0, x1), sy = escala(50, 110, yBase, yTop);
    el("line", { x1: x0, x2: x1, y1: yBase, y2: yBase, class: "eixo" }, svg);
    el("rect", { x: sx(nh) - 10, y: yTop - 10, width: x1 - sx(nh) + 20, height: yBase - yTop + 10, class: "faixa-teste" }, svg);
    texto(svg, sx(nh + 5.5), yBase + 24, "2025: 12 meses à frente", { class: "rotulo-eixo", "text-anchor": "middle" });
    texto(svg, sx(8), yBase + 24, "observado", { class: "rotulo-eixo", "text-anchor": "middle" });
    el("path", { d: caminho(ys.map((_, i) => sx(i)), ys.map(sy)), class: "linha-serie" }, svg);
    const faixa = el("path", { class: "destaque-area" }, svg);
    const gSetas = el("g", {}, svg);
    const cabeca = ponta(svg, "hz-seta", "seta-cabeca-prev");
    const pts = prev.map((v, h) => el("circle", { cx: sx(nh + h), cy: sy(v), r: 7, class: "ponto-prev" }, svg));
    const tRot = texto(svg, 0, 0, "", { class: "anot c-turquesa pequena", "text-anchor": "middle" });
    const TXT = {
      recursivo: `<span class="rotulo">Recursivo</span><p>Um modelo de <b>um passo</b>. A previsão de t + 1 vira o lag 1 para prever t + 2, e assim por diante.</p><p>Um modelo só, e as 12 previsões ficam consistentes entre si. Mas o erro de um passo <b>entra no seguinte</b>: a incerteza cresce depressa com o horizonte.</p>`,
      direto: `<span class="rotulo">Direto</span><p>Um modelo <b>para cada horizonte</b>: 12 modelos, e cada um prevê h meses à frente usando só dados observados.</p><p>Não realimenta o erro de um passo no seguinte (a incerteza ainda cresce com h, só que mais devagar), mas custa 12 vezes mais para treinar, e as previsões podem ficar pouco suaves entre si.</p>`,
    };
    let modo, tl = null;
    function desenhar(anim) {
      if (tl) tl.kill();
      gSetas.innerHTML = "";
      $("#hz-texto").innerHTML = TXT[modo.v];
      const rec = modo.v === "recursivo";
      // faixa de incerteza (ilustração): cresce com h nos dois, mais depressa no recursivo
      const sup = prev.map((v, h) => sy(v + (rec ? 1.2 + 0.55 * h : 1.2 + 0.35 * h)));
      const inf = prev.map((v, h) => sy(v - (rec ? 1.2 + 0.55 * h : 1.2 + 0.35 * h)));
      const xs = prev.map((_, h) => sx(nh + h));
      faixa.setAttribute("d", `${caminho(xs, sup)}L${[...xs].reverse().map((x, i) => `${x},${[...inf].reverse()[i]}`).join("L")}Z`);
      const setas = prev.map((v, h) => {
        let d;
        if (rec) {
          const xa = h ? sx(nh + h - 1) : sx(nh - 1), ya = h ? sy(prev[h - 1]) : sy(ys[nh - 1]);
          const xb = sx(nh + h), yb = sy(v);
          d = `M${xa + 4},${ya - 8} Q${(xa + xb) / 2},${Math.min(ya, yb) - 34} ${xb - 2},${yb - 10}`;
        } else {
          const xa = sx(nh - 1), ya = sy(ys[nh - 1]);
          const xb = sx(nh + h), yb = sy(v);
          d = `M${xa + 6},${ya} Q${(xa + xb) / 2},${yb + 40 + h * 5} ${xb - 8},${yb + 4}`;
        }
        return el("path", { d, class: "seta-prev", "marker-end": cabeca, opacity: rec ? 1 : 0.55 }, gSetas);
      });
      tRot.textContent = rec ? "cada previsão vira entrada da próxima" : "12 modelos, todos a partir do observado";
      tRot.setAttribute("x", sx(nh + 6));
      tRot.setAttribute("y", yTop + 4);
      if (!anim) {
        gsap.set(pts, { autoAlpha: 1 });
        gsap.set([faixa, tRot], { autoAlpha: 1 });
        return;
      }
      gsap.set([...pts, ...setas, faixa, tRot], { autoAlpha: 0 });
      tl = gsap.timeline();
      tl.to(tRot, { autoAlpha: 1, duration: 0.3 });
      if (rec) {
        setas.forEach((s, h) => {
          tl.to(s, { autoAlpha: 1, duration: 0.18 }, 0.2 + h * 0.28)
            .fromTo(pts[h], { autoAlpha: 0, attr: { r: 14 } }, { autoAlpha: 1, attr: { r: 7 }, duration: 0.3 }, 0.32 + h * 0.28);
        });
      } else {
        tl.to(setas, { autoAlpha: 0.55, duration: 0.3, stagger: 0.04 }, 0.2)
          .fromTo(pts, { autoAlpha: 0, attr: { r: 14 } }, { autoAlpha: 1, attr: { r: 7 }, duration: 0.3, stagger: 0.04 }, 0.45);
      }
      tl.to(faixa, { autoAlpha: 1, duration: 0.5 });
    }
    modo = modos("hz-modos", desenhar);
    desenhar(false);
    entrar(caixa, () => desenhar(true));
  }

  /* ====================================================================== */
  /* 7. Árvores não extrapolam                                              */
  /* ====================================================================== */

  function montarArvore() {
    const caixa = $("#g-arvore");
    if (!caixa) return;
    const g = gerador(11), n = 60, nt = 44, F = 4;
    const saz = (t) => 7 * Math.sin((2 * Math.PI * t) / 12);
    const ys = Array.from({ length: n }, (_, t) => 40 + 1.1 * t + saz(t) + 2.2 * g.normal());
    const topo = Math.max(...ys.slice(0, nt));
    // ilustração: com t como feature, folhas de F meses com a média do treino;
    // com lags, a previsão bate no teto; na diferença, prevê y_t − y_{t−12} e soma de volta
    const difMedia = ys.slice(12, nt).reduce((a, y, i) => a + (y - ys[i]), 0) / (nt - 12);
    const prevNivel = [], prevDif = [];
    for (let t = nt; t < n; t++) {
      const semTeto = ys[nt - 12 + ((t - nt) % 12)] + difMedia * Math.ceil((t - nt + 1) / 12);
      prevNivel.push(Math.min(semTeto, topo - 1.5 + 0.35 * saz(t)));
      prevDif.push(semTeto);
    }
    const W = 760, H = 320, x0 = 40, x1 = W - 20, yTop = 30, yBase = 270;
    const svg = novoSvg(caixa, W, H);
    const sx = escala(0, n - 1, x0, x1), sy = escala(20, 120, yBase, yTop);
    el("line", { x1: x0, x2: x1, y1: yBase, y2: yBase, class: "eixo" }, svg);
    el("rect", { x: sx(nt) - 5, y: yTop - 10, width: x1 - sx(nt) + 5, height: yBase - yTop + 10, class: "faixa-teste" }, svg);
    texto(svg, sx(nt) + 8, yBase - 8, "teste", { class: "rotulo-eixo" });
    texto(svg, x0 + 4, yBase - 8, "treino", { class: "rotulo-eixo" });
    const gTeto = el("g", {}, svg);
    el("line", { x1: x0, x2: x1, y1: sy(topo), y2: sy(topo), class: "linha-ref" }, gTeto);
    texto(gTeto, x0 + 6, sy(topo) - 8, "maior valor visto no treino", { class: "anot fraco pequena" });
    el("path", { d: caminho(ys.slice(0, nt).map((_, i) => sx(i)), ys.slice(0, nt).map(sy)), class: "linha-serie fina" }, svg);
    el("path", { d: caminho(ys.slice(nt - 1).map((_, i) => sx(nt - 1 + i)), ys.slice(nt - 1).map(sy)), class: "linha-verdade" }, svg);
    // folhas: degraus de F meses no treino
    const gFolhas = el("g", {}, svg), folhas = [];
    for (let a = 0; a < nt; a += F) {
      const b = Math.min(a + F, nt), m = ys.slice(a, b).reduce((u, v) => u + v, 0) / (b - a);
      folhas.push(el("line", { x1: sx(a), x2: sx(b - 1) + (sx(1) - sx(0)), y1: sy(m), y2: sy(m),
                               style: "stroke:var(--laranja);stroke-width:4;stroke-linecap:round" }, gFolhas));
    }
    const ultima = ys.slice(nt - F, nt).reduce((u, v) => u + v, 0) / F;
    const gReta = el("g", {}, svg);
    el("line", { x1: sx(nt), x2: x1, y1: sy(ultima), y2: sy(ultima),
                 style: "stroke:var(--laranja);stroke-width:4;stroke-dasharray:10 6" }, gReta);
    texto(gReta, x1 - 4, sy(ultima) + 24, "última folha", { class: "anot c-laranja pequena", "text-anchor": "end" });
    const xsP = prevNivel.map((_, i) => sx(nt + i));
    const linhaP = el("path", { d: caminho(xsP, prevNivel.map(sy)), class: "linha-prev" }, svg);
    texto(svg, x1 - 4, yTop + 4, "ilustração", { class: "anot fraco pequena", "text-anchor": "end" });
    cena(caixa, (k, anim) => {
      vis(gFolhas, k === 1 || k === 2, anim);
      if (k === 1 && anim) gsap.fromTo(folhas, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.25, stagger: 0.07 });
      else gsap.set(folhas, { autoAlpha: 1 });
      vis(gReta, k === 2, anim);
      vis(gTeto, k >= 2, anim);
      vis(linhaP, k >= 3, anim);
      const v = k >= 4 ? prevDif : prevNivel;
      gsap.to(linhaP, { attr: { d: caminho(xsP, v.map(sy)) }, duration: anim ? 0.7 : 0, ease: "power2.inOut" });
    });
  }

  /* ====================================================================== */
  /* 8. O modelo global                                                     */
  /* ====================================================================== */

  function montarGlobal() {
    const caixa = $("#g-global");
    if (!caixa) return;
    const g = gerador(5), n = 36;
    const SKUS = [["SKU A", 10000, 0.18], ["SKU B", 4200, 0.25], ["SKU C", 1500, 0.12], ["SKU D", 500, 0.3]];
    const cores = ["var(--azul)", "var(--turquesa)", "var(--roxo)", "var(--laranja)"];
    const series = SKUS.map(([, nivel, amp]) => Array.from({ length: n }, (_, t) =>
      nivel * (1 + amp * Math.cos((2 * Math.PI * (t - 1)) / 12) + 0.006 * t + 0.05 * g.normal())));
    const W = 760, H = 430, sw = 210, sh = 70;
    const svg = novoSvg(caixa, W, H);
    const yLinha = (r) => 20 + r * 100;
    const maxGeral = Math.max(...series.flat());
    const linhas = [], rotulos = [], blocos = [];
    series.forEach((s, r) => {
      const y0 = yLinha(r);
      texto(svg, 0, y0 + 14, SKUS[r][0], { class: "anot forte pequena" });
      rotulos.push(texto(svg, 0, y0 + 34, `até ${num(Math.max(...s), 0)}`, { class: "anot fraco pequena" }));
      const sx = escala(0, n - 1, 90, 90 + sw);
      const dEsc = caminho(s.map((_, i) => sx(i)), s.map((v) => y0 + sh - (v / maxGeral) * sh));
      const mn = Math.min(...s), mx = Math.max(...s);
      const dPad = caminho(s.map((_, i) => sx(i)), s.map((v) => y0 + sh - ((v - mn) / (mx - mn)) * sh));
      linhas.push({ p: el("path", { d: dEsc, class: "linha-serie", style: `stroke:${cores[r]}` }, svg), dEsc, dPad });
      // o bloco de tabela da série: 4 linhas por 4 colunas
      const b = el("g", {}, svg);
      for (let i = 0; i < 4; i++) {
        for (let j = 0; j < 5; j++) {
          el("rect", { x: j * 26, y: i * 14, width: 24, height: 12, rx: 2,
                       style: `fill:${j === 0 ? cores[r] : "var(--superficie)"};stroke:var(--regua)` }, b);
        }
      }
      gsap.set(b, { x: 340, y: y0 + 6 });
      blocos.push(b);
    });
    const cab = el("g", {}, svg);
    ["série", "lag 1", "lag 12", "mês", "y"].forEach((t, j) => texto(cab, 560 + j * 26 + 12, 38, t,
      { class: "anot pequena", "text-anchor": "start", transform: `rotate(-40 ${560 + j * 26 + 12} 38)` }));
    const modelo = el("g", {}, svg);
    el("rect", { x: 520, y: 330, width: 200, height: 56, rx: 10, style: "fill:var(--azul)" }, modelo);
    texto(modelo, 620, 365, "1 LightGBM", { class: "anot", "text-anchor": "middle", style: "fill:#fff;stroke:none;font-weight:800" });
    const cabeca = ponta(svg, "gl-seta", "seta-cabeca");
    const seta = el("path", { d: "M620,300 L620,326", class: "seta", "marker-end": cabeca }, svg);
    const tPad = texto(svg, 90, 418, "cada série padronizada: mesma escala", { class: "anot c-marca pequena" });

    cena(caixa, (k, anim) => {
      const d = anim ? 0.8 : 0;
      vis(blocos, k >= 1, anim);
      blocos.forEach((b, r) => gsap.to(b, k >= 2 ? { x: 560, y: 50 + r * 60, duration: d, ease: "power2.inOut", delay: anim ? r * 0.1 : 0 }
                                              : { x: 340, y: yLinha(r) + 6, duration: d }));
      vis([cab, modelo, seta], k >= 2, anim, { delay: anim && k === 2 ? 0.8 : 0 });
      linhas.forEach((l) => gsap.to(l.p, { attr: { d: k >= 3 ? l.dPad : l.dEsc }, duration: d }));
      vis(tPad, k >= 3, anim);
      vis(rotulos, k < 3, anim);
    });
  }

  /* ====================================================================== */
  /* 9. A escada de complexidade                                            */
  /* ====================================================================== */

  function montarEscada() {
    const caixa = $("#g-escada");
    if (!caixa) return;
    // Lab 2, seção 2.5: produção de veículos (BCB 1373), CV de 4 janelas de 12 meses
    const M = [
      ["SeasonalNaive", 0.51, "ingenuo"], ["AutoETS", 0.34, "simples"], ["AutoARIMA", 0.51, "simples"],
      ["GradientBoosting", 0.47, "ml"], ["LightGBM", 0.55, "ml"], ["ARIMA-Boost", 0.40, "ml"],
      ["LSTM", 0.52, "neural"], ["N-BEATS", 0.64, "neural"], ["Chronos (zero-shot)", 0.47, "fundacao"],
    ];
    const W = 760, H = 470, x0 = 190, x1 = W - 60, y0 = 76, rh = 40;
    const svg = novoSvg(caixa, W, H);
    const sx = escala(0, 0.7, x0, x1);
    const leg = [["ingênuo", "ingenuo"], ["estatístico", "simples"], ["árvores e híbridos", "ml"], ["redes", "neural"], ["foundation", "fundacao"]];
    leg.forEach(([t, c], q) => {
      const xq = [10, 110, 230, 410, 510][q];
      el("rect", { x: xq, y: 6, width: 16, height: 16, rx: 3, class: `barra ${c}` }, svg);
      texto(svg, xq + 22, 20, t, { class: "rotulo-eixo" });
    });
    for (const v of [0, 0.2, 0.4, 0.6]) {
      el("line", { x1: sx(v), x2: sx(v), y1: y0 - 6, y2: y0 + M.length * rh, class: "grade-linha" }, svg);
      texto(svg, sx(v), y0 + M.length * rh + 20, num(v, 1), { class: "rotulo-eixo", "text-anchor": "middle" });
    }
    texto(svg, (x0 + x1) / 2, y0 + M.length * rh + 44, "MASE (menor é melhor)", { class: "titulo-eixo", "text-anchor": "middle" });
    const ref = el("line", { x1: sx(0.51), x2: sx(0.51), y1: y0 - 10, y2: y0 + M.length * rh, class: "linha-ref" }, svg);
    const tRef = texto(svg, sx(0.51) + 6, y0 - 12, "SeasonalNaive = 0,51", { class: "anot fraco pequena" });
    const itens = M.map(([nome, v, c]) => {
      const g = el("g", {}, svg);
      texto(g, x0 - 10, 25, nome, { class: "anot pequena", "text-anchor": "end" });
      const b = el("rect", { x: x0, y: 8, height: rh - 12, width: sx(v) - x0, rx: 3, class: `barra ${c}` }, g);
      const t = texto(g, sx(v) + 6, 26, num(v, 2), { class: "anot pequena" });
      return { g, b, t, v, nome };
    });
    const ordemMASE = [...itens].sort((a, b) => a.v - b.v);
    function posicionar(ordem, anim) {
      ordem.forEach((it, i) => gsap.to(it.g, { y: y0 + i * rh, duration: anim ? 0.8 : 0, ease: "power2.inOut", delay: anim ? i * 0.03 : 0 }));
    }
    cena(caixa, (k, anim) => {
      posicionar(k >= 1 ? ordemMASE : itens, anim);
      itens.forEach((it) => {
        let op = 1;
        if (k === 2) op = it.nome.startsWith("Chronos") || it.nome === "AutoETS" ? 1 : 0.25;
        if (k >= 3) op = it.v > 0.51 ? 1 : 0.35;
        gsap.to(it.g, { opacity: op, duration: anim ? 0.4 : 0 });
        it.t.setAttribute("class", `anot pequena${k >= 3 && it.v > 0.51 ? " c-marca forte" : ""}`);
      });
      vis([ref, tRef], k >= 3, anim);
    });
    entrar(caixa, () => {
      const k = [...secao(caixa).querySelectorAll(".fragment.passo")].filter((f) => f.classList.contains("visible")).length;
      if (k === 0) itens.forEach((it, i) => gsap.fromTo(it.b, { attr: { width: 0 } },
        { attr: { width: sx(it.v) - x0 }, duration: 0.7, delay: i * 0.08, ease: "power2.out" }));
    });
  }

  /* ====================================================================== */
  /* 10. Previsões que não somam                                            */
  /* ====================================================================== */

  function montarCoerencia() {
    const caixa = $("#g-coerencia");
    if (!caixa) return;
    const REG = ["Sudeste", "Nordeste", "Sul", "Centro-Oeste", "Norte"];
    const W = 1180, H = 300, nw = 128, nh = 66;
    const svg = novoSvg(caixa, W, H);
    const xr = (i) => 10 + i * 142;
    const xb = 10 + 2 * 142 + nw / 2, yb = 10, yr = 150;
    REG.forEach((_, i) => el("line", { x1: xb, y1: yb + nh, x2: xr(i) + nw / 2, y2: yr, class: "aresta" }, svg));
    function no(x, y, nome) {
      const r = el("rect", { x, y, width: nw, height: nh, rx: 10, class: "no" }, svg);
      texto(svg, x + nw / 2, y + 26, nome, { class: "no-txt", "text-anchor": "middle" });
      const v = texto(svg, x + nw / 2, y + 52, "", { class: "no-num", "text-anchor": "middle" });
      return { r, v };
    }
    const brasil = no(xb - nw / 2, yb, "Brasil");
    const regs = REG.map((r, i) => no(xr(i), yr, r));
    const soma = texto(svg, xb, yr + nh + 50, "", { class: "anot forte", "text-anchor": "middle" });

    // à direita: o total de 2025 somado a partir de cada nível
    const NIV = [["total", "Brasil, direto"], ["total/regiao", "soma das 5 regiões"],
                 ["total/regiao/categoria", "soma das 20 região × categoria"], ["total/regiao/categoria/sku", "soma dos 50 SKUs"]];
    const vals = NIV.map(([k]) => D.ets2025_niveis[k]);
    const vmin = Math.min(...vals), vmax = Math.max(...vals);
    document.querySelectorAll(".n-ets").forEach((s) => { s.textContent = num(s.dataset.nivel === "min" ? vmin : vmax, 1); });
    const painel = el("g", {}, svg);
    const px0 = 990, pw = 170, py0 = 40, ph = 52;
    const spx = escala(880, 950, px0, px0 + pw);
    texto(painel, 760, 22, "total de 2025 (milhões de litros), somado a partir de cada nível", { class: "anot pequena" });
    const barras = NIV.map(([, rot], q) => {
      const y = py0 + q * ph;
      texto(painel, px0 - 12, y + 26, rot, { class: "anot pequena", "text-anchor": "end" });
      const b = el("rect", { x: px0, y: y + 8, height: 28, width: spx(vals[q]) - px0, rx: 3,
                             class: `barra ${q ? "neural" : "fundacao"}` }, painel);
      texto(painel, spx(vals[q]) + 6, y + 28, num(vals[q], 1), { class: "anot pequena forte" });
      return b;
    });
    texto(painel, px0, py0 + 4 * ph + 16, "eixo começa em 880", { class: "anot fraco pequena" });
    const real = D.real2025.Brasil;
    document.querySelectorAll(".n-real").forEach((s) => { s.textContent = num(real, 1); });
    const gReal = el("g", {}, painel);
    el("line", { x1: spx(real), x2: spx(real), y1: py0, y2: py0 + 4 * ph,
                 style: "stroke:var(--turquesa);stroke-width:2.5;stroke-dasharray:4 4" }, gReal);
    texto(gReal, spx(real), py0 - 4, `real: ${num(real, 1)}`, { class: "anot pequena c-turquesa", "text-anchor": "middle" });
    const estado = { b: 0, r: REG.map(() => 0), s: 0 };
    function escrever() {
      brasil.v.textContent = num(estado.b, 1);
      regs.forEach((n, i) => { n.v.textContent = num(estado.r[i], 1); });
    }
    function para(valB, valR, anim) {
      const alvo = { b: valB };
      valR.forEach((v, i) => { alvo[`r${i}`] = v; });
      const prox = { b: estado.b };
      estado.r.forEach((v, i) => { prox[`r${i}`] = v; });
      gsap.to(prox, Object.assign({}, alvo, {
        duration: anim ? 0.9 : 0, ease: "power2.out",
        onUpdate: () => { estado.b = prox.b; estado.r = REG.map((_, i) => prox[`r${i}`]); escrever(); },
      }));
    }
    cena(caixa, (k, anim) => {
      const fonte = k === 0 ? D.real2024 : D.ets2025;
      // em 2024 o Brasil mostrado é a soma das regiões exibidas; em 2025 a soma vem do
      // mesmo número do painel (somar valores já arredondados daria 0,1 de diferença)
      const s = k === 0 ? REG.reduce((a, r) => a + fonte[r], 0) : D.ets2025_niveis["total/regiao"];
      para(k === 0 ? s : fonte.Brasil, REG.map((r) => fonte[r]), anim);
      const coerente = k === 0;
      brasil.r.setAttribute("class", `no${k >= 2 ? " erro" : coerente ? " usado" : ""}`);
      regs.forEach((n) => n.r.setAttribute("class", `no${coerente ? " usado" : ""}`));
      soma.setAttribute("class", `anot forte ${k >= 2 ? "c-marca" : coerente ? "c-turquesa" : ""}`);
      if (k === 0) soma.textContent = `2024 observado: soma das regiões = ${num(s, 1)} = Brasil ✓`;
      else soma.textContent = `soma das regiões = ${num(s, 1)}  ≠  Brasil previsto = ${num(fonte.Brasil, 1)}`;
      if (k >= 1) soma.setAttribute("class", "anot forte c-marca");
      brasil.r.setAttribute("class", `no${k >= 1 ? " erro" : " usado"}`);
      vis(painel, k >= 2, anim);
      vis(gReal, k >= 3, anim);
      if (anim && k === 2) gsap.fromTo(barras, { attr: { width: 0 } }, { attr: { width: (i) => spx(vals[i]) - px0 }, duration: 0.7, stagger: 0.15 });
    });
  }

  /* ====================================================================== */
  /* 11. Hierarquia e agrupamento                                           */
  /* ====================================================================== */

  function noSimples(svg, x, y, w, h, t, cls) {
    el("rect", { x: x - w / 2, y, width: w, height: h, rx: 7, class: `no ${cls || ""}` }, svg);
    texto(svg, x, y + h / 2 + 5, t, { class: "no-txt", "text-anchor": "middle", style: "font-size:13px" });
  }

  function montarArvHier() {
    const caixa = $("#g-arv-hier");
    if (!caixa) return;
    const svg = novoSvg(caixa, 520, 250);
    const N = [[260, 6, "Brasil"]];
    const reg = [[110, "Sudeste"], [260, "Nordeste"], [410, "…"]];
    const cat = [[60, "Pilsen"], [160, "Puro malte"]];
    const sku = [[22, "lata"], [100, "600 ml"]];
    reg.forEach(([x]) => el("line", { x1: 260, y1: 40, x2: x, y2: 80, class: "aresta" }, svg));
    cat.forEach(([x]) => el("line", { x1: 110, y1: 114, x2: x, y2: 150, class: "aresta" }, svg));
    sku.forEach(([x]) => el("line", { x1: 60, y1: 184, x2: x, y2: 214, class: "aresta" }, svg));
    N.forEach(([x, y, t]) => noSimples(svg, x, y, 100, 34, t, "usado"));
    reg.forEach(([x, t]) => noSimples(svg, x, 80, 110, 34, t));
    cat.forEach(([x, t]) => noSimples(svg, x, 150, 96, 34, t));
    sku.forEach(([x, t]) => noSimples(svg, x, 214, 62, 30, t));
    texto(svg, 230, 236, "← cada nó tem um único pai", { class: "anot fraco pequena" });
  }

  function montarArvGrupo() {
    const caixa = $("#g-arv-grupo");
    if (!caixa) return;
    const svg = novoSvg(caixa, 520, 250);
    const R = ["Sudeste", "Nordeste", "Sul"], C = ["Pilsen", "Puro malte", "Premium"];
    const x0 = 120, y0 = 40, cw = 100, rh = 46;
    C.forEach((c, j) => texto(svg, x0 + j * cw + cw / 2, y0 - 10, c, { class: "anot pequena", "text-anchor": "middle" }));
    R.forEach((r, i) => {
      texto(svg, x0 - 10, y0 + i * rh + 28, r, { class: "anot pequena", "text-anchor": "end" });
      C.forEach((_, j) => el("rect", { x: x0 + j * cw + 4, y: y0 + i * rh + 4, width: cw - 8, height: rh - 8, rx: 5, class: "no" }, svg));
      texto(svg, x0 + C.length * cw + 12, y0 + i * rh + 28, "Σ região", { class: "anot c-roxo pequena" });
    });
    C.forEach((_, j) => texto(svg, x0 + j * cw + cw / 2, y0 + R.length * rh + 22, "Σ categoria", { class: "anot c-laranja pequena", "text-anchor": "middle" }));
    texto(svg, x0 + C.length * cw + 12, y0 + R.length * rh + 22, "Σ Brasil", { class: "anot forte pequena" });
  }

  /* ====================================================================== */
  /* 12. A matriz S                                                         */
  /* ====================================================================== */

  function montarS() {
    const cArv = $("#g-arv-s"), cMat = $("#g-matriz");
    if (!cArv || !cMat) return;
    const svg = novoSvg(cArv, 440, 220);
    const pos = { Brasil: [220, 8], Norte: [110, 88], Sul: [330, 88], N1: [55, 168], N2: [165, 168], S1: [275, 168], S2: [385, 168] };
    const pais = { Norte: "Brasil", Sul: "Brasil", N1: "Norte", N2: "Norte", S1: "Sul", S2: "Sul" };
    for (const [f, p] of Object.entries(pais)) {
      el("line", { x1: pos[p][0], y1: pos[p][1] + 40, x2: pos[f][0], y2: pos[f][1], class: "aresta" }, svg);
    }
    const nos = {};
    for (const [k, [x, y]] of Object.entries(pos)) {
      nos[k] = el("rect", { x: x - 42, y, width: 84, height: 40, rx: 8, class: "no" }, svg);
      texto(svg, x, y + 26, k, { class: "no-txt", "text-anchor": "middle" });
    }
    const LIN = ["Brasil", "Norte", "Sul", "N1", "N2", "S1", "S2"], COL = ["N1", "N2", "S1", "S2"];
    const S = { Brasil: [1, 1, 1, 1], Norte: [1, 1, 0, 0], Sul: [0, 0, 1, 1], N1: [1, 0, 0, 0], N2: [0, 1, 0, 0], S1: [0, 0, 1, 0], S2: [0, 0, 0, 1] };
    const tab = document.createElement("table");
    tab.className = "matriz-s";
    tab.innerHTML = `<thead><tr><th></th>${COL.map((c) => `<th>${c}</th>`).join("")}</tr></thead><tbody>${
      LIN.map((l) => `<tr data-l="${l}"><th class="linha">${l}</th>${S[l].map((v) => `<td class="${v ? "um" : ""}">${v}</td>`).join("")}</tr>`).join("")
    }</tbody>`;
    cMat.appendChild(tab);
    const f = document.createElement("p");
    f.className = "formula-s";
    f.innerHTML = "<b>y</b> = <i>S</i> · <b>b</b>: as 7 séries saem das 4 de baixo. Previsão coerente: <b>ŷ</b> = <i>S</i> · <b>b̂</b>.";
    cMat.appendChild(f);
    const linhas = [...tab.querySelectorAll("tbody tr")];
    const GRUPOS = [[], ["Brasil"], ["Norte"], ["N1", "N2", "S1", "S2"]];
    const FOLHAS = [[], COL, ["N1", "N2"], COL];
    cena(cArv, (k) => {
      linhas.forEach((tr) => tr.classList.toggle("realce", GRUPOS[k].includes(tr.dataset.l)));
      for (const [nome, r] of Object.entries(nos)) {
        const foco = GRUPOS[k].includes(nome), folha = FOLHAS[k].includes(nome);
        r.setAttribute("class", `no${foco ? " foco" : folha ? " usado" : ""}`);
      }
    });
  }

  /* ====================================================================== */
  /* 13. Bottom-up, top-down e middle-out                                   */
  /* ====================================================================== */

  function montarFluxo() {
    const caixa = $("#g-fluxo");
    if (!caixa) return;
    const svg = novoSvg(caixa, 760, 380);
    const pos = { Brasil: [380, 20], Sudeste: [200, 150], Nordeste: [560, 150],
                  "lata SE": [100, 285], "600 SE": [300, 285], "lata NE": [460, 285], "600 NE": [660, 285] };
    const pais = { Sudeste: "Brasil", Nordeste: "Brasil", "lata SE": "Sudeste", "600 SE": "Sudeste", "lata NE": "Nordeste", "600 NE": "Nordeste" };
    const nivel = { Brasil: 0, Sudeste: 1, Nordeste: 1, "lata SE": 2, "600 SE": 2, "lata NE": 2, "600 NE": 2 };
    const arestas = Object.entries(pais).map(([f, p]) => {
      const a = [pos[p][0], pos[p][1] + 64], b = [pos[f][0], pos[f][1]];
      el("line", { x1: a[0], y1: a[1], x2: b[0], y2: b[1], class: "aresta" }, svg);
      return { f, p, a, b };
    });
    const nos = {};
    for (const [k, [x, y]] of Object.entries(pos)) {
      nos[k] = el("rect", { x: x - 75, y, width: 150, height: 64, rx: 10, class: "no" }, svg);
      texto(svg, x, y + 38, k, { class: "no-txt", "text-anchor": "middle" });
    }
    const leg = el("g", {}, svg);
    el("rect", { x: 10, y: 352, width: 22, height: 18, rx: 4, class: "no usado" }, leg);
    texto(leg, 40, 366, "previsão usada", { class: "rotulo-eixo" });
    el("rect", { x: 190, y: 352, width: 22, height: 18, rx: 4, class: "no derivado" }, leg);
    texto(leg, 220, 366, "obtida por soma ou proporção", { class: "rotulo-eixo" });
    const gPart = el("g", {}, svg);
    const TXT = {
      bu: ["Bottom-up", "só o nível mais baixo (os SKUs), e soma para cima.",
           "as séries de baixo têm sinal claro, e o detalhe importa (logística).",
           "séries de baixo ruidosas ou com muitos zeros: os modelos de baixo não enxergam a sazonalidade, e os vieses se somam no total."],
      td: ["Top-down", "só o Brasil, e reparte por proporções (históricas ou das próprias previsões).",
           "o topo é estável e a base é muito ruidosa.",
           "proporções históricas médias apagam padrões locais, como o São João do Nordeste (com proporções das próprias previsões, isso melhora)."],
      mo: ["Middle-out", "um nível do meio (as regiões): soma para cima e reparte para baixo.",
           "o nível do meio é o mais confiável.",
           "herda um pouco dos problemas dos dois."],
    };
    const USADO = { bu: 2, td: 0, mo: 1 };
    let tl = null, modo;
    function desenhar(anim) {
      if (tl) tl.kill();
      gPart.innerHTML = "";
      const u = USADO[modo.v];
      for (const [k, r] of Object.entries(nos)) r.setAttribute("class", `no ${nivel[k] === u ? "usado" : "derivado"}`);
      const [nome, usa, bom, cuid] = TXT[modo.v];
      $("#rc-texto").innerHTML = `<div class="caixa ideia"><span class="rotulo">${nome}</span><p><b>Usa:</b> ${usa}</p></div>` +
        `<div class="caixa exercicio"><span class="rotulo">Bom quando</span><p>${bom}</p></div>` +
        `<div class="caixa atencao"><span class="rotulo">Cuidado</span><p>${cuid}</p></div>`;
      // partículas: sobem para os pais (soma) ou descem para os filhos (proporção)
      tl = gsap.timeline({ repeat: -1, repeatDelay: 0.6 });
      arestas.forEach(({ f, p, a, b }) => {
        const nf = nivel[f], np = nivel[p];
        let de, ate, cls;
        if (nf <= u) { de = b; ate = a; cls = "particula"; }            // acima do nível usado: soma para cima
        else if (np >= u) { de = a; ate = b; cls = "particula desce"; } // abaixo do nível usado: proporção para baixo
        else return;
        // em ondas: a soma começa no nível usado e sobe; a proporção começa nele e desce
        const atraso = cls === "particula" ? (u - nf) * 0.9 : (np - u) * 0.9;
        for (let q = 0; q < 3; q++) {
          const c = el("circle", { r: 6, class: cls, cx: de[0], cy: de[1] }, gPart);
          tl.fromTo(c, { attr: { cx: de[0], cy: de[1] }, autoAlpha: 0 },
                    { attr: { cx: ate[0], cy: ate[1] }, autoAlpha: 1, duration: 0.9, ease: "power1.inOut" }, atraso + q * 0.18)
            .to(c, { autoAlpha: 0, duration: 0.2 }, atraso + q * 0.18 + 0.9);
        }
      });
      if (!anim) tl.pause(0);
    }
    modo = modos("rc-modos", desenhar);
    desenhar(false);
    const s = secao(caixa);
    s._entrar = () => tl && tl.play(0);
    s._sair = () => tl && tl.pause(0);
  }

  /* ====================================================================== */
  /* 14. MinT com duas regiões                                              */
  /* ====================================================================== */

  function montarMinT() {
    const caixa = $("#g-mint");
    if (!caixa) return;
    const B = { T: 100, N: 55, S: 38 };
    const W = 640, H = 400, yBase = 340, yTop = 40;
    const svg = novoSvg(caixa, W, H);
    const sy = escala(0, 110, yBase, yTop);
    eixoY(svg, sy, 0, 110, 50, W - 10, 5);
    el("line", { x1: 50, x2: W - 10, y1: yBase, y2: yBase, class: "eixo" }, svg);
    const X = { T: 90, NS: 210, N: 380, S: 510 }, bw = 90;
    texto(svg, X.T + bw / 2, yBase + 26, "Brasil", { class: "anot", "text-anchor": "middle" });
    texto(svg, X.NS + bw / 2, yBase + 26, "Norte + Sul", { class: "anot", "text-anchor": "middle" });
    texto(svg, X.N + bw / 2, yBase + 26, "Norte", { class: "anot", "text-anchor": "middle" });
    texto(svg, X.S + bw / 2, yBase + 26, "Sul", { class: "anot", "text-anchor": "middle" });
    const base = (x, v) => el("rect", { x, width: bw, y: sy(v), height: yBase - sy(v), class: "barra-base" }, svg);
    base(X.T, B.T); base(X.NS, B.N + B.S); base(X.N, B.N); base(X.S, B.S);
    const rT = el("rect", { x: X.T + 12, width: bw - 24, class: "barra-rec" }, svg);
    const rNS_N = el("rect", { x: X.NS + 12, width: bw - 24, class: "barra-rec" }, svg);
    const rNS_S = el("rect", { x: X.NS + 12, width: bw - 24, class: "barra-rec b2" }, svg);
    const rN = el("rect", { x: X.N + 12, width: bw - 24, class: "barra-rec" }, svg);
    const rS = el("rect", { x: X.S + 12, width: bw - 24, class: "barra-rec b2" }, svg);
    const tT = texto(svg, X.T + bw / 2, 0, "", { class: "anot c-roxo", "text-anchor": "middle" });
    const tN = texto(svg, X.N + bw / 2, 0, "", { class: "anot c-roxo", "text-anchor": "middle" });
    const tS = texto(svg, X.S + bw / 2, 0, "", { class: "anot c-roxo", "text-anchor": "middle" });
    const igual = el("line", { x1: X.T, x2: X.NS + bw, class: "linha-ref" }, svg);
    texto(svg, 60, 24, "tracejado: previsão de base   ·   roxo: reconciliada", { class: "anot fraco pequena" });
    // o buraco de 7 entre o Brasil e a soma das regiões
    const gFalta = el("g", {}, svg);
    el("line", { x1: X.T, x2: X.NS + bw + 8, y1: sy(B.T), y2: sy(B.T), class: "linha-ref" }, gFalta);
    el("line", { x1: X.NS + bw + 8, x2: X.NS + bw + 8, y1: sy(B.T), y2: sy(B.N + B.S),
                 style: "stroke:var(--marca);stroke-width:4" }, gFalta);
    texto(gFalta, X.NS + bw + 16, (sy(B.T) + sy(B.N + B.S)) / 2 + 6, "faltam 7", { class: "anot c-marca" });
    const recs = [rT, rNS_N, rNS_S, rN, rS, tT, tN, tS, igual];
    const contas = $("#mt-contas");
    let modo, ctl;
    function resolver(r) {
      // WLS: minimiza Σ (y − ŷ)² / v com Brasil = Norte + Sul; v_Brasil = r², v_Norte = v_Sul = 1
      const wT = 1 / (r * r);
      const a = wT + 1, b = wT, c = wT + 1;
      const y1 = wT * B.T + B.N, y2 = wT * B.T + B.S;
      const det = a * c - b * b;
      const N = (c * y1 - b * y2) / det, S = (a * y2 - b * y1) / det;
      return { N, S, T: N + S };
    }
    function desenhar(anim) {
      const r = ctl.v, z = resolver(r), d = anim ? 0.5 : 0;
      const alt = (v) => ({ y: sy(v), height: yBase - sy(v) });
      gsap.to(rT, { attr: alt(z.T), duration: d });
      gsap.to(rN, { attr: alt(z.N), duration: d });
      gsap.to(rS, { attr: alt(z.S), duration: d });
      gsap.to(rNS_S, { attr: { y: sy(z.S), height: yBase - sy(z.S) }, duration: d });
      gsap.to(rNS_N, { attr: { y: sy(z.T), height: sy(z.S) - sy(z.T) }, duration: d });
      gsap.to(igual, { attr: { y1: sy(z.T), y2: sy(z.T) }, duration: d });
      gsap.to(tT, { attr: { y: Math.min(sy(z.T), sy(B.T)) - 10 }, duration: d });
      gsap.to(tN, { attr: { y: Math.min(sy(z.N), sy(B.N)) - 10 }, duration: d });
      gsap.to(tS, { attr: { y: Math.min(sy(z.S), sy(B.S)) - 10 }, duration: d });
      tT.textContent = num(z.T, 1); tN.textContent = num(z.N, 1); tS.textContent = num(z.S, 1);
      const sinal = (v) => (v >= 0 ? "+" : "−") + num(Math.abs(v), 2);
      contas.innerHTML = `ajustes: Brasil <b>${sinal(z.T - B.T)}</b> · Norte <b>${sinal(z.N - B.N)}</b> · Sul <b>${sinal(z.S - B.S)}</b><br>` +
        `reconciliado: Brasil = Norte + Sul = <b>${num(z.T, 2)}</b>`;
    }
    ctl = controle("mt-r", (v) => `${num(v, 2)}×`, desenhar);
    modo = modos("mt-modos", (anim) => {
      ctl.v = { ols: 1, topo: 0.3, base: 3 }[modo.v];
      ctl.at(anim);
    });
    ctl.inp.addEventListener("input", () => {
      const v = ctl.v;
      const m = Math.abs(v - 1) < 0.03 ? "ols" : v < 1 ? "topo" : "base";
      modo.escolher(m);
    });
    ctl.at(false);
    cena(caixa, (k, anim) => {
      vis(gFalta, k === 0, anim);
      vis(recs, k >= 1, anim);
      vis($("#mt-ctrl"), k >= 2, anim);
      if (k < 2) { modo.escolher("ols"); ctl.v = 1; ctl.at(anim); }
    });
  }

  /* ====================================================================== */
  /* 15. As cinco regiões da Cervejaria Ipê                                 */
  /* ====================================================================== */

  function montarRegioes() {
    const caixa = $("#g-regioes");
    if (!caixa) return;
    const REG = ["Sudeste", "Nordeste", "Sul", "Centro-Oeste", "Norte"];
    const cores = ["var(--marca)", "var(--laranja)", "var(--azul)", "var(--turquesa)", "var(--roxo)"];
    const ds = D.datas, n = ds.length;
    const W = 720, H = 360, x0 = 50, x1 = W - 120, yTop = 20, yBase = 320;
    const svg = novoSvg(caixa, W, H);
    const sx = escala(0, n - 1, x0, x1), sy = escala(0, 45, yBase, yTop);
    eixoY(svg, sy, 0, 45, x0, x1, 4);
    el("line", { x1: x0, x2: x1, y1: yBase, y2: yBase, class: "eixo" }, svg);
    for (let a = 2018; a <= 2025; a += 1) {
      const i = ds.indexOf(`${a}-01`);
      if (a % 2 === 0) texto(svg, sx(i), yBase + 22, String(a), { class: "rotulo-eixo", "text-anchor": "middle" });
    }
    const linhas = REG.map((r, q) => {
      const ys = D.regioes[r].map((v) => v / 1000);
      const p = el("path", { d: caminho(ys.map((_, i) => sx(i)), ys.map(sy)), class: "linha-serie", style: `stroke:${cores[q]};stroke-width:2` }, svg);
      const t = texto(svg, x1 + 8, sy(ys[n - 1]) + 5, r, { class: "anot pequena", style: `fill:${cores[q]}` });
      const junhos = el("g", {}, svg);
      ds.forEach((d, i) => { if (MES(d) === 6) el("circle", { cx: sx(i), cy: sy(ys[i]), r: 5, style: `fill:${cores[q]}` }, junhos); });
      return { p, t, junhos, r };
    });
    cena(caixa, (k, anim) => {
      linhas.forEach((l) => {
        let op = 1;
        if (k === 1) op = l.r === "Nordeste" ? 1 : 0.18;
        if (k === 2) op = l.r === "Norte" || l.r === "Sul" ? 1 : 0.18;
        gsap.to([l.p, l.t], { opacity: op, duration: anim ? 0.4 : 0 });
        vis(l.junhos, k === 1 && l.r === "Nordeste", anim);
      });
    });
    entrar(caixa, () => {
      const k = [...secao(caixa).querySelectorAll(".fragment.passo")].filter((f) => f.classList.contains("visible")).length;
      if (k !== 0) return;
      // esconde todas antes, para nenhuma aparecer inteira e sumir em seguida
      linhas.forEach((l) => {
        const L = l.p.getTotalLength();
        gsap.killTweensOf(l.p);
        gsap.set(l.p, { strokeDasharray: L, strokeDashoffset: L });
      });
      linhas.forEach((l, q) => gsap.delayedCall(q * 0.25, () => tracar(l.p, 1.4)));
    });
  }

  /* ====================================================================== */
  /* 16. Fluxo final: etapas entram em sequência                            */
  /* ====================================================================== */

  function montarFluxoFinal() {
    const caixa = $("#fluxo-final");
    if (!caixa) return;
    const etapas = [...caixa.querySelectorAll(".etapa-f")];
    entrar(caixa, () => gsap.fromTo(etapas, { autoAlpha: 0, y: 24 }, { autoAlpha: 1, y: 0, duration: 0.5, stagger: 0.18, ease: "power2.out" }));
  }

  /* ====================================================================== */
  /* 17. Cronômetro do chat em cascata                                      */
  /* ====================================================================== */

  function montarCronometros() {
    document.querySelectorAll(".cronometro").forEach((c) => {
      const total = +(c.dataset.segundos || 40);
      const R = 86, L = 2 * Math.PI * R;
      const svg = el("svg", { viewBox: "0 0 210 210" }, c);
      el("circle", { cx: 105, cy: 105, r: R, class: "anel-fundo" }, svg);
      const anel = el("circle", { cx: 105, cy: 105, r: R, class: "anel", transform: "rotate(-90 105 105)",
                                  "stroke-dasharray": L, "stroke-dashoffset": 0 }, svg);
      const nume = texto(svg, 105, 128, String(total), { class: "num", "text-anchor": "middle" });
      const instr = document.createElement("div");
      instr.className = "instr";
      c.appendChild(instr);
      const fmt = c.dataset.formato ? `<br>formato: <b>${c.dataset.formato}</b>` : "";
      const INI = `clique para começar · digitem no chat e <b>só enviem no zero</b>${fmt}`;
      let tw = null;
      function zerar() {
        if (tw) tw.kill();
        tw = null;
        anel.classList.remove("fim");
        gsap.set(anel, { attr: { "stroke-dashoffset": 0 } });
        gsap.set(svg, { scale: 1 });
        nume.textContent = String(total);
        instr.innerHTML = INI;
      }
      c.addEventListener("click", () => {
        if (tw) { zerar(); return; }
        const p = { s: total };
        instr.innerHTML = `pensem e digitem, mas <b>não enviem ainda</b>${fmt}`;
        tw = gsap.to(p, {
          s: 0, duration: total, ease: "none",
          onUpdate: () => {
            nume.textContent = String(Math.ceil(p.s));
            anel.setAttribute("stroke-dashoffset", String(L * (1 - p.s / total)));
          },
          onComplete: () => {
            anel.classList.add("fim");
            nume.textContent = "0";
            instr.innerHTML = "<b>Enviem agora!</b> (clique para reiniciar)";
            gsap.fromTo(svg, { scale: 1.12, transformOrigin: "50% 50%" }, { scale: 1, duration: 0.8, ease: "elastic.out(1, 0.35)" });
          },
        });
      });
      zerar();
      const s = c.closest("section");
      const sairAnt = s._sair;
      s._sair = () => { if (sairAnt) sairAnt(); zerar(); };
    });
  }

  /* ---------- ligação com o revealjs ------------------------------------ */

  function atualizar(slide, anim) {
    if (!slide) return;
    const k = [...slide.querySelectorAll(".fragment.passo")].filter((f) => f.classList.contains("visible")).length;
    if (slide._cena) slide._cena(k, anim);
    for (const caixa of slide.querySelectorAll(".legendas")) {
      const filhos = [...caixa.children];
      const alvo = Math.min(k, filhos.length - 1);
      filhos.forEach((n, i) => {
        gsap.to(n, i === alvo ? { autoAlpha: 1, y: 0, duration: anim ? 0.3 : 0, delay: anim ? 0.1 : 0, overwrite: true }
                              : { autoAlpha: 0, duration: anim ? 0.15 : 0, overwrite: true });
      });
    }
  }

  function iniciar() {
    for (const f of [montarSerie, montarTabela, montarFeatures, montarExog, montarAutoFeat, montarVazamento, montarCV, montarHorizonte,
                     montarArvore, montarGlobal, montarEscada, montarCoerencia, montarArvHier, montarArvGrupo,
                     montarS, montarFluxo, montarMinT, montarRegioes, montarFluxoFinal, montarCronometros]) {
      try { f(); } catch (e) { console.error("[lab02]", f.name, e); }
    }
    for (const s of document.querySelectorAll(".reveal .slides > section")) atualizar(s, false);
    const R = window.Reveal;
    R.on("fragmentshown", () => atualizar(R.getCurrentSlide(), true));
    R.on("fragmenthidden", () => atualizar(R.getCurrentSlide(), true));
    R.on("slidechanged", (e) => {
      if (e.previousSlide && e.previousSlide._sair) e.previousSlide._sair();
      atualizar(e.currentSlide, false);
      if (e.currentSlide._entrar) e.currentSlide._entrar();
    });
    const atual = R.getCurrentSlide();
    atualizar(atual, false);
    if (atual && atual._entrar) atual._entrar();
  }

  function quandoPronto() {
    const R = window.Reveal;
    if (!R || !window.gsap) return setTimeout(quandoPronto, 50);
    if (R.isReady && R.isReady()) iniciar();
    else R.on("ready", iniciar);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", quandoPronto);
  else quandoPronto();
})();
