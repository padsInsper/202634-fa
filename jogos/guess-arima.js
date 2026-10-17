/* Guess the ARIMA: interface do jogo (depende de guess-arima-core.js). */
(function () {
  "use strict";
  const G = window.GACore;
  const root = document.getElementById("ga-root");
  if (!root || !G) return;

  // ---------------------------------------------------------------- utilidades
  const $ = (sel, el) => (el || root).querySelector(sel);
  const h = (tag, attrs, ...kids) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === "class") el.className = v;
      else if (k === "html") el.innerHTML = v;
      else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else if (v !== false && v != null) el.setAttribute(k, v === true ? "" : v);
    }
    for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(kid));
    return el;
  };
  const store = {
    get(k, d) { try { const v = localStorage.getItem("ga:" + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem("ga:" + k, JSON.stringify(v)); } catch (e) { /* sem armazenamento */ } },
  };
  const newSeed = () => {
    try { return crypto.getRandomValues(new Uint32Array(1))[0]; } catch (e) { return Math.floor(Math.random() * 2 ** 32); }
  };
  const fmt = (v, k) => (v < 0 ? "−" : "") + Math.abs(v).toFixed(k == null ? 4 : k);
  const sub = { 1: "₁", 2: "₂" };

  // ---------------------------------------------------------------- som (WebAudio)
  const Sound = {
    ctx: null,
    on: store.get("sound", true),
    ensure() {
      if (!this.on) return null;
      try {
        if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        if (this.ctx.state === "suspended") this.ctx.resume();
      } catch (e) { return null; }
      return this.ctx;
    },
    tone(freq, dur, opt) {
      const ctx = this.ensure();
      if (!ctx) return;
      const o = Object.assign({ type: "square", vol: 0.08, at: 0, to: null }, opt || {});
      const t0 = ctx.currentTime + o.at;
      const osc = ctx.createOscillator(), g = ctx.createGain();
      osc.type = o.type;
      osc.frequency.setValueAtTime(freq, t0);
      if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t0 + dur);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(o.vol, t0 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(g).connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
    },
    noise(dur, opt) {
      const ctx = this.ensure();
      if (!ctx) return;
      const o = Object.assign({ vol: 0.06, at: 0, f0: 400, f1: 3000 }, opt || {});
      const t0 = ctx.currentTime + o.at;
      const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      src.buffer = buf;
      f.type = "bandpass";
      f.Q.value = 1.2;
      f.frequency.setValueAtTime(o.f0, t0);
      f.frequency.exponentialRampToValueAtTime(o.f1, t0 + dur);
      g.gain.setValueAtTime(o.vol, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      src.connect(f).connect(g).connect(ctx.destination);
      src.start(t0);
    },
    click() { this.tone(880, 0.05, { vol: 0.04 }); },
    select() { this.tone(660, 0.06, { type: "triangle", vol: 0.07, to: 990 }); },
    hit(i) { this.tone([784, 880, 988, 1047, 1175, 1319][i % 6], 0.12, { type: "triangle", vol: 0.09, at: i * 0.11 }); },
    miss(i) { this.tone(196, 0.16, { type: "sawtooth", vol: 0.05, at: i * 0.11, to: 140 }); },
    neutral(i) { this.tone(440, 0.08, { type: "sine", vol: 0.05, at: i * 0.11 }); },
    perfect(at) { [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.16, { type: "square", vol: 0.06, at: at + i * 0.08 })); },
    lifeLost(at) { this.tone(130, 0.35, { type: "sawtooth", vol: 0.09, at, to: 55 }); this.noise(0.25, { at, f0: 900, f1: 120, vol: 0.05 }); },
    lifeUp(at) { [988, 1319, 1976].forEach((f, i) => this.tone(f, 0.1, { type: "triangle", vol: 0.07, at: at + i * 0.07 })); },
    whoosh() { this.noise(0.35, { f0: 300, f1: 4000, vol: 0.07 }); },
    start() { [392, 523, 659, 784].forEach((f, i) => this.tone(f, 0.12, { type: "square", vol: 0.05, at: i * 0.07 })); },
    gameOver(at) { [523, 466, 415, 349, 262].forEach((f, i) => this.tone(f, 0.28, { type: "square", vol: 0.06, at: at + i * 0.2 })); },
  };

  // ---------------------------------------------------------------- gráficos (SVG)
  const SVGNS = "http://www.w3.org/2000/svg";
  const sv = (tag, attrs) => {
    const el = document.createElementNS(SVGNS, tag);
    for (const [k, v] of Object.entries(attrs || {})) el.setAttribute(k, v);
    return el;
  };
  function lineChart(y, opt) {
    const W = 520, H = 200, m = { l: 44, r: 10, t: 12, b: 22 };
    const svg = sv("svg", { viewBox: `0 0 ${W} ${H}`, class: "ga-chart", role: "img", "aria-label": opt.label });
    let lo = Infinity, hi = -Infinity;
    for (const v of y) { if (v < lo) lo = v; if (v > hi) hi = v; }
    const pad = (hi - lo) * 0.08 || 1;
    lo -= pad; hi += pad;
    const X = (i) => m.l + (i / (y.length - 1)) * (W - m.l - m.r);
    const Y = (v) => H - m.b - ((v - lo) / (hi - lo)) * (H - m.t - m.b);
    if (opt.seasonal) for (let i = 0; i < y.length; i += 12) svg.append(sv("line", { x1: X(i), x2: X(i), y1: m.t, y2: H - m.b, class: "ga-grid" }));
    for (let k = 0; k <= 3; k++) {
      const v = lo + ((hi - lo) * k) / 3;
      svg.append(sv("line", { x1: m.l, x2: W - m.r, y1: Y(v), y2: Y(v), class: "ga-grid" }));
      const t = sv("text", { x: m.l - 6, y: Y(v) + 3, class: "ga-tick", "text-anchor": "end" });
      t.textContent = Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(1);
      svg.append(t);
    }
    for (let i = 0; i < y.length; i += opt.seasonal ? 60 : 50) {
      const t = sv("text", { x: X(i), y: H - 6, class: "ga-tick", "text-anchor": "middle" });
      t.textContent = i;
      svg.append(t);
    }
    let d = "";
    y.forEach((v, i) => { d += (i ? "L" : "M") + X(i).toFixed(1) + " " + Y(v).toFixed(1); });
    svg.append(sv("path", { d, class: "ga-line" }));
    return svg;
  }
  function barChart(r, n, opt) {
    const W = 360, H = 200, m = { l: 34, r: 8, t: 12, b: 22 };
    const svg = sv("svg", { viewBox: `0 0 ${W} ${H}`, class: "ga-chart", role: "img", "aria-label": opt.label });
    const L = r.length - 1;
    const X = (k) => m.l + ((k - 0.5) / L) * (W - m.l - m.r);
    const Y = (v) => m.t + ((1 - v) / 2) * (H - m.t - m.b);
    const band = 1.96 / Math.sqrt(n);
    svg.append(sv("rect", { x: m.l, y: Y(band), width: W - m.l - m.r, height: Y(-band) - Y(band), class: "ga-band" }));
    for (const v of [-1, -0.5, 0.5, 1]) svg.append(sv("line", { x1: m.l, x2: W - m.r, y1: Y(v), y2: Y(v), class: "ga-grid" }));
    for (const v of [-1, -0.5, 0, 0.5, 1]) {
      const t = sv("text", { x: m.l - 5, y: Y(v) + 3, class: "ga-tick", "text-anchor": "end" });
      t.textContent = v;
      svg.append(t);
    }
    if (opt.seasonal) {
      for (let k = 12; k <= L; k += 12) svg.append(sv("line", { x1: X(k), x2: X(k), y1: m.t, y2: H - m.b, class: "ga-seas" }));
    }
    const bw = Math.max(1.5, ((W - m.l - m.r) / L) * 0.5);
    for (let k = 1; k <= L; k++) {
      const v = Math.max(-1, Math.min(1, r[k]));
      svg.append(sv("rect", { x: X(k) - bw / 2, y: Math.min(Y(v), Y(0)), width: bw, height: Math.max(0.6, Math.abs(Y(v) - Y(0))), class: "ga-bar" }));
    }
    svg.append(sv("line", { x1: m.l, x2: W - m.r, y1: Y(0), y2: Y(0), class: "ga-axis" }));
    const step = opt.seasonal ? 12 : 6;
    for (let k = step; k <= L; k += step) {
      const t = sv("text", { x: X(k), y: H - 6, class: "ga-tick" + (opt.seasonal ? " ga-tick-s" : ""), "text-anchor": "middle" });
      t.textContent = k;
      svg.append(t);
    }
    return svg;
  }

  // ---------------------------------------------------------------- saídas dos testes
  function testsBlock(x) {
    const a = G.adfuller(x), k = G.kpss(x);
    const adfCrit = Object.entries(a.critical).map(([q, v]) => `${q}: ${fmt(v, 3)}`).join("  ");
    const kCrit = Object.entries(k.critical).map(([q, v]) => `${q}: ${v.toFixed(3)}`).join("  ");
    const pnote = k.pnote === "menor" ? "  (p real é menor que o exibido)" : k.pnote === "maior" ? "  (p real é maior que o exibido)" : "";
    const adfTxt =
      `adfuller(x, regression='c', autolag='AIC')
` +
      `  estatística   ${fmt(a.adf)}
` +
      `  p-valor        ${a.pvalue.toFixed(4)}
` +
      `  lags usados    ${a.usedlag}
` +
      `  nobs           ${a.nobs}
` +
      `  críticos       ${adfCrit}`;
    const kTxt =
      `kpss(x, regression='c', nlags='auto')
` +
      `  estatística    ${k.kpss.toFixed(4)}
` +
      `  p-valor        ${k.pvalue.toFixed(4)}${pnote}
` +
      `  lags           ${k.lags}
` +
      `  críticos       ${kCrit}`;
    return h("div", { class: "ga-tests-row" },
      h("figure", { class: "ga-fig ga-fig-tests" }, h("figcaption", {}, "teste ADF"), h("pre", { class: "ga-tests" }, adfTxt)),
      h("figure", { class: "ga-fig ga-fig-tests" }, h("figcaption", {}, "teste KPSS"), h("pre", { class: "ga-tests" }, kTxt)),
    );
  }

  // ---------------------------------------------------------------- estado
  const MAX_LIVES = 3;
  const S = {
    phase: "menu",
    mode: store.get("mode", "easy"),
    resample: false,
    lives: MAX_LIVES,
    score: 0,
    round: 0,
    spec: null,
    seed: 0,
    resamples: 0,
    ans: {},
    history: [],
  };
  const hard = () => S.mode === "hard";
  const params = () => (hard() ? ["p", "d", "q", "P", "D", "Q"] : ["p", "d", "q"]);
  const choices = { p: [0, 1, 2], q: [0, 1, 2], d: [0, 1], P: [0, 1], D: [0, 1], Q: [0, 1] };
  const bestKey = () => "best-" + S.mode;

  function modelName(o, withS) {
    const base = `(${o.p},${o.d},${o.q})`;
    return withS ? `SARIMA${base}(${o.P},${o.D},${o.Q})₁₂` : `ARIMA${base}`;
  }
  function coefText(spec) {
    const parts = [];
    spec.phi.forEach((v, i) => parts.push(`φ${sub[i + 1]} = ${fmt(v, 2)}`));
    spec.theta.forEach((v, i) => parts.push(`θ${sub[i + 1]} = ${fmt(v, 2)}`));
    if (spec.P) parts.push(`Φ₁ = ${fmt(spec.Phi, 2)}`);
    if (spec.Q) parts.push(`Θ₁ = ${fmt(spec.Theta, 2)}`);
    return parts.length ? parts.join("   ") : "ruído branco nos componentes ARMA";
  }

  // ---------------------------------------------------------------- HUD
  function hud() {
    const hearts = [];
    for (let i = 0; i < MAX_LIVES; i++) hearts.push(h("span", { class: "ga-heart" + (i < S.lives ? "" : " off") }, "♥"));
    return h("div", { class: "ga-hud" },
      h("div", { class: "ga-brand" }, h("span", { class: "ga-logo" }, "Guess the ", h("em", {}, hard() ? "SARIMA" : "ARIMA"))),
      h("div", { class: "ga-stats" },
        h("div", { class: "ga-stat" }, h("small", {}, "vidas"), h("div", { class: "ga-hearts", id: "ga-hearts" }, hearts)),
        h("div", { class: "ga-stat" }, h("small", {}, "rodada"), h("b", { id: "ga-round" }, String(S.round))),
        h("div", { class: "ga-stat" }, h("small", {}, "pontos"), h("b", { id: "ga-score" }, String(S.score))),
        h("div", { class: "ga-stat" }, h("small", {}, "recorde"), h("b", {}, String(store.get(bestKey(), 0)))),
        h("button", { class: "ga-icon", title: "Som", "aria-label": "Ligar ou desligar som", onclick: toggleSound }, Sound.on ? "🔊" : "🔇"),
      ));
  }
  function toggleSound(ev) {
    Sound.on = !Sound.on;
    store.set("sound", Sound.on);
    ev.currentTarget.textContent = Sound.on ? "🔊" : "🔇";
    if (Sound.on) Sound.select();
  }

  // ---------------------------------------------------------------- telas
  function render() {
    root.innerHTML = "";
    const top = root.getBoundingClientRect().top;
    if (top < 0) root.scrollIntoView({ behavior: "smooth", block: "start" });
    if (S.phase === "menu") return renderMenu();
    if (S.phase === "over") return renderOver();
    renderRound();
  }

  function renderMenu() {
    const card = (mode, title, model, desc) =>
      h("button", {
        class: "ga-mode" + (S.mode === mode ? " on" : ""),
        onclick: () => { S.mode = mode; store.set("mode", mode); Sound.select(); render(); },
      }, h("span", { class: "ga-mode-t" }, title), h("span", { class: "ga-mode-m" }, model), h("span", { class: "ga-mode-d" }, desc));
    root.append(
      h("div", { class: "ga-stage ga-menu" },
        h("div", { class: "ga-title" }, h("span", {}, "Guess the"), h("strong", {}, "ARIMA")),
        h("p", { class: "ga-lead" }, "Cada rodada traz uma série simulada. Olhe a série, as ACF/PACF das versões diferenciadas e as saídas brutas do ADF e do KPSS, e descubra as ordens do modelo."),
        h("div", { class: "ga-modes" },
          card("easy", "Fácil", "ARIMA(p,d,q)", "Sem sazonalidade. Painéis: série original e 1ª diferença."),
          card("hard", "Difícil", "SARIMA(p,d,q)(P,D,Q)₁₂", "Sazonal mensal. Painéis: original, Δ₁₂, Δ e ΔΔ₁₂."),
        ),
        h("label", { class: "ga-toggle" },
          h("input", { type: "checkbox", id: "ga-resample", checked: S.resample, onchange: (e) => { S.resample = e.target.checked; Sound.click(); } }),
          h("span", { class: "ga-switch" }),
          h("span", {}, "Permitir gerar uma nova série com os mesmos parâmetros durante a rodada")),
        h("div", { class: "ga-rules" },
          h("h4", {}, "Pontuação"),
          h("ul", {},
            h("li", {}, h("b", {}, "d"), " e ", h("b", {}, "D"), ": acertou ", h("span", { class: "pos" }, "+1"), ", errou ", h("span", { class: "neg" }, "−1"), " e perde uma vida."),
            h("li", {}, h("b", {}, "p, q, P, Q"), ": acertou ", h("span", { class: "pos" }, "+1"), ", errou 0."),
            h("li", {}, "Rodada perfeita (tudo certo) recupera uma vida. Sem vidas, fim de jogo."),
            h("li", {}, "Ordens possíveis: p, q ∈ {0, 1, 2}; d, P, D, Q ∈ {0, 1}; período sazonal s = 12."),
          ),
        ),
        h("button", { class: "ga-cta", onclick: startGame }, "Jogar"),
        h("p", { class: "ga-foot" }, "Atalhos: teclas 0, 1, 2 escolhem o valor do parâmetro em foco; Tab muda de parâmetro; Enter confirma e avança."),
      ),
    );
  }

  function startGame() {
    S.lives = MAX_LIVES;
    S.score = 0;
    S.round = 0;
    S.history = [];
    Sound.start();
    nextRound();
  }

  function nextRound() {
    S.round += 1;
    S.spec = G.sampleSpec(S.mode, newSeed());
    S.seed = newSeed();
    S.resamples = 0;
    S.ans = {};
    S.phase = "play";
    render();
    const first = $(".ga-seg button");
    if (first) first.focus({ preventScroll: true });
  }

  function resample() {
    S.seed = newSeed();
    S.resamples += 1;
    Sound.whoosh();
    const panels = $("#ga-panels");
    panels.replaceWith(buildPanels());
    const rb = $("#ga-resample-btn");
    if (rb) rb.querySelector("small").textContent = `${S.resamples}×`;
  }

  function buildPanels() {
    const y = G.simulate(S.spec, S.seed);
    const seasonal = hard();
    const L = seasonal ? 48 : 24;
    const rows = seasonal
      ? [
          ["yₜ", "série original", y],
          ["Δ₁₂ yₜ = (1 − B¹²) yₜ", "diferença sazonal", G.diff(y, 12)],
          ["Δ yₜ = (1 − B) yₜ", "1ª diferença", G.diff(y, 1)],
          ["Δ Δ₁₂ yₜ", "1ª diferença + diferença sazonal", G.diff(G.diff(y, 12), 1)],
        ]
      : [
          ["yₜ", "série original", y],
          ["Δ yₜ = (1 − B) yₜ", "1ª diferença", G.diff(y, 1)],
        ];
    return h("div", { id: "ga-panels", class: "ga-panels" },
      rows.map(([lab, desc, x], i) =>
        h("section", { class: "ga-row", style: `--i:${i}` },
          h("header", { class: "ga-row-h" }, h("b", {}, lab), h("span", {}, desc), h("span", { class: "ga-n" }, `n = ${x.length}`)),
          h("div", { class: "ga-row-g" + (seasonal ? "" : " easy") },
            h("figure", { class: "ga-fig ga-fig-series" }, h("figcaption", {}, "série"), lineChart(x, { seasonal, label: "Série " + desc })),
            h("figure", { class: "ga-fig" }, h("figcaption", {}, "ACF"), barChart(G.acf(x, L), x.length, { seasonal, label: "ACF " + desc })),
            h("figure", { class: "ga-fig" }, h("figcaption", {}, "PACF"), barChart(G.pacf(x, L), x.length, { seasonal, label: "PACF " + desc })),
            testsBlock(x),
          ),
        ),
      ),
    );
  }

  function answerBar() {
    const reveal = S.phase === "reveal";
    const segs = params().map((k) =>
      h("div", { class: "ga-param", "data-k": k },
        h("span", { class: "ga-pk" }, k),
        h("div", { class: "ga-seg", role: "radiogroup", "aria-label": "Valor de " + k },
          choices[k].map((v) =>
            h("button", {
              role: "radio",
              "aria-checked": S.ans[k] === v ? "true" : "false",
              class: S.ans[k] === v ? "on" : "",
              disabled: reveal,
              onclick: () => { S.ans[k] = v; Sound.select(); refreshBar(); },
              onkeydown: (e) => {
                if (/^[0-2]$/.test(e.key) && choices[k].includes(+e.key)) { e.preventDefault(); S.ans[k] = +e.key; Sound.select(); refreshBar(); focusParam(k); }
              },
            }, String(v)),
          ),
        ),
        h("span", { class: "ga-res", id: "ga-res-" + k }),
      ),
    );
    const done = params().every((k) => S.ans[k] !== undefined);
    const guess = Object.assign({ p: "p", d: "d", q: "q", P: "P", D: "D", Q: "Q" }, S.ans);
    return h("div", { class: "ga-bar-wrap" },
      h("div", { class: "ga-answer", id: "ga-answer" },
        h("div", { class: "ga-params" }, segs),
        h("div", { class: "ga-actions" },
          h("div", { class: "ga-guess" }, h("small", {}, "seu palpite"), h("b", {}, modelName(guess, hard()))),
          S.resample && !reveal ? h("button", { class: "ga-btn ghost", id: "ga-resample-btn", onclick: resample, title: "Nova série com os mesmos parâmetros" }, "↻ nova amostra ", h("small", {}, `${S.resamples}×`)) : null,
          reveal
            ? h("button", { class: "ga-btn", id: "ga-next", onclick: () => { Sound.click(); S.lives > 0 ? nextRound() : endGame(); } }, S.lives > 0 ? "Próxima rodada →" : "Ver resultado →")
            : h("button", { class: "ga-btn", id: "ga-confirm", disabled: !done, onclick: confirm }, "Confirmar"),
        ),
      ),
      h("div", { id: "ga-reveal" }),
    );
  }
  function focusParam(k) {
    const b = root.querySelector(`.ga-param[data-k="${k}"] .ga-seg button.on`) || root.querySelector(`.ga-param[data-k="${k}"] .ga-seg button`);
    if (b) b.focus({ preventScroll: true });
  }
  function refreshBar() {
    const old = $(".ga-bar-wrap");
    const nb = answerBar();
    old.replaceWith(nb);
  }

  function renderRound() {
    root.append(
      h("div", { class: "ga-stage" },
        hud(),
        h("div", { class: "ga-roundline" },
          h("span", {}, `Rodada ${S.round}`),
          h("span", { class: "ga-hint" }, hard()
            ? "Linhas tracejadas amarelas nas ACF/PACF marcam as defasagens sazonais 12, 24, 36 e 48. Faixa cinza: ±1,96/√n."
            : "Faixa cinza nas ACF/PACF: ±1,96/√n."),
        ),
        buildPanels(),
        answerBar(),
      ),
    );
  }

  // ---------------------------------------------------------------- correção
  function confirm() {
    if (S.phase !== "play") return;
    const spec = S.spec;
    const items = params().map((k) => {
      const ok = S.ans[k] === spec[k];
      const strict = k === "d" || k === "D";
      return { k, ok, pts: ok ? 1 : strict ? -1 : 0, strict };
    });
    const pts = items.reduce((s, it) => s + it.pts, 0);
    const lost = items.filter((it) => it.strict && !it.ok).length;
    const perfect = items.every((it) => it.ok);
    S.score += pts;
    const livesBefore = S.lives;
    S.lives = Math.max(0, S.lives - lost);
    const gained = perfect && S.lives < MAX_LIVES;
    if (gained) S.lives += 1;
    S.history.push({ spec, ans: Object.assign({}, S.ans), pts });
    S.phase = "reveal";
    refreshBar();

    // efeitos por parâmetro
    items.forEach((it, i) => {
      setTimeout(() => {
        const el = $("#ga-res-" + it.k);
        const par = root.querySelector(`.ga-param[data-k="${it.k}"]`);
        par.classList.add(it.ok ? "ok" : it.pts < 0 ? "bad" : "meh");
        el.textContent = (it.pts > 0 ? "+" : it.pts < 0 ? "−" : "") + Math.abs(it.pts);
        el.className = "ga-res show " + (it.pts > 0 ? "pos" : it.pts < 0 ? "neg" : "zero");
        if (!it.ok) {
          const right = par.querySelector(`.ga-seg button:nth-child(${choices[it.k].indexOf(spec[it.k]) + 1})`);
          if (right) right.classList.add("truth");
        }
      }, i * 110);
      if (it.ok) Sound.hit(i);
      else if (it.pts < 0) Sound.miss(i);
      else Sound.neutral(i);
    });
    const tEnd = items.length * 0.11 + 0.05;
    if (lost) Sound.lifeLost(tEnd);
    if (perfect) Sound.perfect(tEnd);
    if (gained) Sound.lifeUp(tEnd + 0.45);

    setTimeout(() => {
      const sc = $("#ga-score");
      sc.textContent = String(S.score);
      sc.classList.remove("pop");
      void sc.offsetWidth;
      sc.classList.add("pop");
      const hearts = $("#ga-hearts");
      hearts.innerHTML = "";
      for (let i = 0; i < MAX_LIVES; i++) hearts.append(h("span", { class: "ga-heart" + (i < S.lives ? "" : " off") + (lost && i >= S.lives && i < livesBefore ? " lost" : "") + (gained && i === S.lives - 1 ? " gain" : "") }, "♥"));
      if (lost) { const st = $(".ga-stage"); st.classList.remove("shake"); void st.offsetWidth; st.classList.add("shake"); }
    }, items.length * 110);

    const rv = $("#ga-reveal");
    rv.append(
      h("div", { class: "ga-reveal" + (perfect ? " perfect" : "") },
        h("div", { class: "ga-rv-main" },
          h("small", {}, perfect ? "rodada perfeita!" : "modelo verdadeiro"),
          h("b", {}, modelName(spec, hard())),
          h("span", { class: "ga-coef" }, coefText(spec)),
        ),
        h("div", { class: "ga-rv-pts " + (pts > 0 ? "pos" : pts < 0 ? "neg" : "zero") }, (pts > 0 ? "+" : pts < 0 ? "−" : "") + Math.abs(pts), h("small", {}, "pts")),
        lost ? h("div", { class: "ga-rv-note neg" }, lost > 1 ? "Errou d e D: −2 vidas" : "Errou a ordem de integração: −1 vida") : null,
        gained ? h("div", { class: "ga-rv-note pos" }, "Rodada perfeita: +1 vida") : null,
      ),
    );
    const nx = $("#ga-next");
    if (nx) nx.focus({ preventScroll: true });
  }

  function endGame() {
    const best = store.get(bestKey(), 0);
    S.newBest = S.score > best;
    if (S.newBest) store.set(bestKey(), S.score);
    S.phase = "over";
    Sound.gameOver(0);
    render();
  }

  function renderOver() {
    const max = S.history.length * (hard() ? 6 : 3);
    const counts = { d: 0, p: 0, q: 0, P: 0, D: 0, Q: 0 };
    S.history.forEach((r) => params().forEach((k) => { if (r.ans[k] === r.spec[k]) counts[k] += 1; }));
    root.append(
      h("div", { class: "ga-stage ga-menu ga-over" },
        h("div", { class: "ga-title" }, h("span", {}, "fim de"), h("strong", {}, "jogo")),
        h("div", { class: "ga-final" }, h("b", {}, String(S.score)), h("small", {}, `pontos em ${S.history.length} rodadas (máximo possível ${max})`)),
        S.newBest ? h("div", { class: "ga-newbest" }, "★ novo recorde neste navegador ★") : h("div", { class: "ga-foot" }, `Recorde (${hard() ? "difícil" : "fácil"}): ${store.get(bestKey(), 0)}`),
        h("div", { class: "ga-acc" },
          params().map((k) => h("div", {}, h("b", {}, k), h("span", {}, `${counts[k]}/${S.history.length}`))),
        ),
        h("div", { class: "ga-hist" },
          S.history.map((r, i) =>
            h("div", { class: "ga-hist-r" },
              h("span", {}, `#${i + 1}`),
              h("span", {}, modelName(r.spec, hard())),
              h("span", { class: "ga-dim" }, "palpite " + modelName(r.ans, hard())),
              h("b", { class: r.pts > 0 ? "pos" : r.pts < 0 ? "neg" : "zero" }, (r.pts > 0 ? "+" : r.pts < 0 ? "−" : "") + Math.abs(r.pts)),
            ),
          ),
        ),
        h("div", { class: "ga-row-btns" },
          h("button", { class: "ga-cta", onclick: startGame }, "Jogar de novo"),
          h("button", { class: "ga-btn ghost", onclick: () => { Sound.click(); S.phase = "menu"; render(); } }, "Trocar modo"),
        ),
      ),
    );
  }

  // ---------------------------------------------------------------- teclado
  root.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" || e.target.tagName === "INPUT") return;
    if (S.phase === "play") {
      const b = $("#ga-confirm");
      if (b && !b.disabled) { e.preventDefault(); confirm(); }
    }
  });

  render();
})();
