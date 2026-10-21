/* Guess the ARIMA: interface do jogo (depende de guess-arima-core.js).
   Partidas com número fixo de rodadas; o resultado de cada partida é gravado no
   Firebase Realtime Database e alimenta o ranking da turma. */
(function () {
  "use strict";
  const G = window.GACore;
  const root = document.getElementById("ga-root");
  if (!root || !G) return;

  // ---------------------------------------------------------------- configuração
  const qs = new URLSearchParams(location.search);
  const CFG = {
    rtdb: "https://jtrecenti-default-rtdb.firebaseio.com",
    no: "fa_2026_34_guess_arima",
    // ?semregistro=1 joga sem gravar (para testar sem poluir o ranking)
    registrar: qs.get("semregistro") !== "1",
    opcoesRodadas: [5, 10, 15, 20],
    // Semente da sequência de séries: todos jogam as mesmas rodadas, na mesma ordem.
    // ?semente=xyz troca a sequência (por exemplo, uma por aula); o ranking separa por semente.
    semente: (qs.get("semente") || "fa-2026-34").trim().slice(0, 40),
  };

  // ---------------------------------------------------------------- utilidades
  const $ = (sel, el) => (el || root).querySelector(sel);
  const h = (tag, attrs, ...kids) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === "class") el.className = v;
      else if (k === "html") el.innerHTML = v;
      else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else if (k === "value") el.value = v;
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
  // semente determinística (FNV-1a 32 bits) a partir da semente da turma e da posição no jogo
  const seedFor = (...parts) => {
    const s = [CFG.semente, ...parts].join("|");
    let x = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 0x01000193); }
    return x >>> 0;
  };
  const fmt = (v, k) => (v < 0 ? "−" : "") + Math.abs(v).toFixed(k == null ? 4 : k);
  const signed = (v) => (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v);
  const sub = { 1: "₁", 2: "₂" };
  const cleanName = (s) => String(s || "").replace(/\s+/g, " ").trim().slice(0, 40);
  const nameKey = (s) => cleanName(s).toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[̀-ͯ]/g, "");
  const SESSAO = (crypto.randomUUID && crypto.randomUUID()) || "s-" + Date.now() + "-" + newSeed();

  // ---------------------------------------------------------------- som (discreto, desligado por padrão)
  const Sound = {
    ctx: null,
    on: store.get("sound2", false),
    tone(freq, dur, at) {
      if (!this.on) return;
      try {
        if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        if (this.ctx.state === "suspended") this.ctx.resume();
      } catch (e) { return; }
      const ctx = this.ctx, t0 = ctx.currentTime + (at || 0);
      const osc = ctx.createOscillator(), g = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, t0);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.05, t0 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(g).connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
    },
    good() { this.tone(880, 0.12); this.tone(1175, 0.14, 0.09); },
    bad() { this.tone(220, 0.2); },
    neutral() { this.tone(523, 0.1); },
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
      `adfuller(x, regression='c', autolag='AIC')\n` +
      `  estatística   ${fmt(a.adf)}\n` +
      `  p-valor        ${a.pvalue.toFixed(4)}\n` +
      `  lags usados    ${a.usedlag}\n` +
      `  nobs           ${a.nobs}\n` +
      `  críticos       ${adfCrit}`;
    const kTxt =
      `kpss(x, regression='c', nlags='auto')\n` +
      `  estatística    ${k.kpss.toFixed(4)}\n` +
      `  p-valor        ${k.pvalue.toFixed(4)}${pnote}\n` +
      `  lags           ${k.lags}\n` +
      `  críticos       ${kCrit}`;
    return h("div", { class: "ga-tests-row" },
      h("figure", { class: "ga-fig ga-fig-tests" }, h("figcaption", {}, "teste ADF"), h("pre", { class: "ga-tests" }, adfTxt)),
      h("figure", { class: "ga-fig ga-fig-tests" }, h("figcaption", {}, "teste KPSS"), h("pre", { class: "ga-tests" }, kTxt)),
    );
  }

  // ---------------------------------------------------------------- estado
  const S = {
    phase: "menu",
    name: store.get("name", ""),
    mode: store.get("mode", "easy"),
    resample: store.get("resample", true),
    rounds: store.get("rounds", 10),
    score: 0,
    round: 0,
    spec: null,
    seed: 0,
    resamples: 0,
    ans: {},
    history: [],
    saved: null,
  };
  if (!CFG.opcoesRodadas.includes(S.rounds)) S.rounds = 10;
  const hard = () => S.mode === "hard";
  const params = () => (hard() ? ["p", "d", "q", "P", "D", "Q"] : ["p", "d", "q"]);
  const choices = { p: [0, 1, 2], q: [0, 1, 2], d: [0, 1], P: [0, 1], D: [0, 1], Q: [0, 1] };
  const modeLabel = (m) => (m === "hard" ? "Difícil (SARIMA)" : "Fácil (ARIMA)");

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

  // ---------------------------------------------------------------- Firebase (REST)
  async function saveGame() {
    if (!CFG.registrar) return { ok: true, off: true };
    const ks = params();
    const acertos = {};
    ks.forEach((k) => { acertos[k] = S.history.filter((r) => r.ans[k] === r.spec[k]).length; });
    const body = {
      nome: S.name,
      nome_chave: nameKey(S.name),
      modo: S.mode,
      rodadas: S.rounds,
      nova_amostra: S.resample,
      semente: CFG.semente,
      pontos: S.score,
      maximo: S.rounds * ks.length,
      perfeitas: S.history.filter((r) => ks.every((k) => r.ans[k] === r.spec[k])).length,
      acertos,
      historico: S.history.map((r) => ({
        verdadeiro: Object.fromEntries(ks.map((k) => [k, r.spec[k]])),
        palpite: Object.fromEntries(ks.map((k) => [k, r.ans[k]])),
        pontos: r.pts,
        novas_amostras: r.resamples,
        segundos: r.secs,
      })),
      sessao: SESSAO,
      quando: { ".sv": "timestamp" },
    };
    try {
      const r = await fetch(`${CFG.rtdb}/${CFG.no}.json`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await r.json().catch(() => ({}));
      return { ok: r.ok, id: j && j.name };
    } catch (e) {
      return { ok: false };
    }
  }
  async function loadGames() {
    const url = `${CFG.rtdb}/${CFG.no}.json?orderBy=${encodeURIComponent('"quando"')}&limitToLast=2000`;
    const r = await fetch(url);
    if (!r.ok) throw new Error("HTTP " + r.status);
    const data = (await r.json()) || {};
    return Object.entries(data).map(([id, v]) => Object.assign({ id }, v));
  }

  // ---------------------------------------------------------------- HUD
  function hud() {
    return h("div", { class: "ga-hud" },
      h("div", { class: "ga-brand" },
        h("span", { class: "ga-logo" }, "Guess the ", hard() ? "SARIMA" : "ARIMA"),
        h("span", { class: "ga-player" }, S.name)),
      h("div", { class: "ga-stats" },
        h("div", { class: "ga-stat" }, h("small", {}, "rodada"), h("b", { id: "ga-round" }, `${S.round} / ${S.rounds}`)),
        h("div", { class: "ga-stat" }, h("small", {}, "pontos"), h("b", { id: "ga-score" }, String(S.score))),
        h("button", { class: "ga-icon", title: "Som", "aria-pressed": Sound.on ? "true" : "false", onclick: toggleSound }, Sound.on ? "som ligado" : "som desligado"),
      ));
  }
  function toggleSound(ev) {
    Sound.on = !Sound.on;
    store.set("sound2", Sound.on);
    ev.currentTarget.textContent = Sound.on ? "som ligado" : "som desligado";
    ev.currentTarget.setAttribute("aria-pressed", Sound.on ? "true" : "false");
    if (Sound.on) Sound.neutral();
  }

  // ---------------------------------------------------------------- telas
  function render() {
    root.innerHTML = "";
    const top = root.getBoundingClientRect().top;
    if (top < 0) root.scrollIntoView({ behavior: "smooth", block: "start" });
    if (S.phase === "menu") return renderMenu();
    if (S.phase === "over") return renderOver();
    if (S.phase === "board") return renderBoardPage();
    renderRound();
  }

  function renderMenu() {
    const card = (mode, title, model, desc) =>
      h("button", {
        type: "button",
        class: "ga-mode" + (S.mode === mode ? " on" : ""),
        "aria-pressed": S.mode === mode ? "true" : "false",
        onclick: () => { S.mode = mode; store.set("mode", mode); render(); },
      }, h("span", { class: "ga-mode-t" }, title), h("span", { class: "ga-mode-m" }, model), h("span", { class: "ga-mode-d" }, desc));
    const nameInput = h("input", {
      id: "ga-name", type: "text", maxlength: "40", autocomplete: "name", placeholder: "Nome e sobrenome", value: S.name,
      oninput: (e) => { S.name = e.target.value; $("#ga-name-err").hidden = true; },
    });
    root.append(
      h("div", { class: "ga-stage ga-menu" },
        h("header", { class: "ga-menu-h" },
          h("p", { class: "ga-lead" }, "Cada rodada traz uma série simulada. Olhe a série, as ACF/PACF das versões diferenciadas e as saídas do ADF e do KPSS, e identifique as ordens do modelo.")),
        h("form", { class: "ga-setup", onsubmit: (e) => { e.preventDefault(); startGame(); } },
          h("div", { class: "ga-field" },
            h("label", { for: "ga-name" }, "Seu nome"),
            nameInput,
            h("span", { class: "ga-err", id: "ga-name-err", hidden: true }, "Informe seu nome (pelo menos 2 letras) para entrar no ranking.")),
          h("div", { class: "ga-field" },
            h("span", { class: "ga-label" }, "Modo"),
            h("div", { class: "ga-modes" },
              card("easy", "Fácil", "ARIMA(p,d,q)", "Sem sazonalidade. Painéis: série original e 1ª diferença."),
              card("hard", "Difícil", "SARIMA(p,d,q)(P,D,Q)₁₂", "Sazonal mensal. Painéis: original, Δ₁₂, Δ e ΔΔ₁₂."))),
          h("div", { class: "ga-field ga-field-row" },
            h("label", { for: "ga-rounds" }, "Rodadas"),
            h("select", { id: "ga-rounds", onchange: (e) => { S.rounds = +e.target.value; store.set("rounds", S.rounds); } },
              CFG.opcoesRodadas.map((n) => h("option", { value: String(n), selected: n === S.rounds }, String(n))))),
          h("label", { class: "ga-check" },
            h("input", { type: "checkbox", checked: S.resample, onchange: (e) => { S.resample = e.target.checked; store.set("resample", S.resample); } }),
            h("span", {}, "Permitir gerar uma nova série com os mesmos parâmetros durante a rodada")),
          h("details", { class: "ga-rules" },
            h("summary", {}, "Pontuação"),
            h("ul", {},
              h("li", {}, h("b", {}, "d"), " e ", h("b", {}, "D"), ": acerto vale +1, erro vale −1."),
              h("li", {}, h("b", {}, "p, q, P, Q"), ": acerto vale +1, erro vale 0."),
              h("li", {}, "Ordens possíveis: p, q ∈ {0, 1, 2}; d, P, D, Q ∈ {0, 1}; período sazonal s = 12."),
              h("li", {}, "Todos jogam as mesmas séries, na mesma ordem (inclusive as novas amostras). Jogar de novo repete as mesmas rodadas."),
              h("li", {}, "O ranking compara partidas com o mesmo modo e o mesmo número de rodadas e, por padrão, conta só a primeira partida de cada pessoa."))),
          h("div", { class: "ga-row-btns" },
            h("button", { type: "submit", class: "ga-btn" }, "Começar"),
            h("button", { type: "button", class: "ga-btn ghost", onclick: () => { S.phase = "board"; render(); } }, "Ver ranking"))),
        CFG.registrar ? null : h("p", { class: "ga-foot" }, "Modo de teste: as partidas não são gravadas."),
        h("p", { class: "ga-foot" }, "Atalhos: teclas 0, 1, 2 escolhem o valor do parâmetro em foco; Tab muda de parâmetro; Enter confirma e avança."),
      ),
    );
  }

  function startGame() {
    S.name = cleanName(S.name);
    if (S.name.length < 2) {
      const err = $("#ga-name-err");
      if (err) err.hidden = false;
      const inp = $("#ga-name");
      if (inp) inp.focus();
      return;
    }
    store.set("name", S.name);
    S.score = 0;
    S.round = 0;
    S.history = [];
    S.saved = null;
    nextRound();
  }

  function nextRound() {
    S.round += 1;
    S.resamples = 0;
    S.spec = G.sampleSpec(S.mode, seedFor(S.mode, "modelo", S.round));
    S.seed = seedFor(S.mode, "serie", S.round, S.resamples);
    S.ans = {};
    S.t0 = Date.now();
    S.phase = "play";
    render();
    const first = $(".ga-seg button");
    if (first) first.focus({ preventScroll: true });
  }

  function resample() {
    S.resamples += 1;
    S.seed = seedFor(S.mode, "serie", S.round, S.resamples);
    const panels = $("#ga-panels");
    panels.replaceWith(buildPanels());
    const rb = $("#ga-resample-btn");
    if (rb) rb.querySelector("small").textContent = `(${S.resamples})`;
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
      rows.map(([lab, desc, x]) =>
        h("section", { class: "ga-row" },
          h("header", { class: "ga-row-h" }, h("b", {}, lab), h("span", {}, desc), h("span", { class: "ga-n" }, `n = ${x.length}`)),
          h("div", { class: "ga-row-g" },
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
              type: "button",
              role: "radio",
              "aria-checked": S.ans[k] === v ? "true" : "false",
              class: S.ans[k] === v ? "on" : "",
              disabled: reveal,
              onclick: () => { S.ans[k] = v; refreshBar(); focusParam(k); },
              onkeydown: (e) => {
                if (/^[0-2]$/.test(e.key) && choices[k].includes(+e.key)) { e.preventDefault(); S.ans[k] = +e.key; refreshBar(); focusParam(k); }
              },
            }, String(v)),
          ),
        ),
        h("span", { class: "ga-res", id: "ga-res-" + k }),
      ),
    );
    const done = params().every((k) => S.ans[k] !== undefined);
    const guess = Object.assign({ p: "p", d: "d", q: "q", P: "P", D: "D", Q: "Q" }, S.ans);
    const last = S.round >= S.rounds;
    return h("div", { class: "ga-bar-wrap" },
      h("div", { class: "ga-answer", id: "ga-answer" },
        h("div", { class: "ga-params" }, segs),
        h("div", { class: "ga-actions" },
          h("div", { class: "ga-guess" }, h("small", {}, "seu palpite"), h("b", {}, modelName(guess, hard()))),
          S.resample && !reveal ? h("button", { type: "button", class: "ga-btn ghost", id: "ga-resample-btn", onclick: resample, title: "Nova série com os mesmos parâmetros" }, "Nova amostra ", h("small", {}, `(${S.resamples})`)) : null,
          reveal
            ? h("button", { type: "button", class: "ga-btn", id: "ga-next", onclick: () => (last ? endGame() : nextRound()) }, last ? "Ver resultado" : "Próxima rodada")
            : h("button", { type: "button", class: "ga-btn", id: "ga-confirm", disabled: !done, onclick: confirm }, "Confirmar"),
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
    old.replaceWith(answerBar());
  }

  function renderRound() {
    const pct = ((S.round - 1) / S.rounds) * 100;
    root.append(
      h("div", { class: "ga-stage" },
        hud(),
        h("div", { class: "ga-progress", role: "progressbar", "aria-valuemin": "0", "aria-valuemax": String(S.rounds), "aria-valuenow": String(S.round - 1) },
          h("span", { style: `width:${pct}%` })),
        h("div", { class: "ga-roundline" },
          h("span", {}, `Rodada ${S.round} de ${S.rounds}`),
          h("span", { class: "ga-hint" }, hard()
            ? "Linhas tracejadas nas ACF/PACF marcam as defasagens sazonais 12, 24, 36 e 48. Faixa cinza: ±1,96/√n."
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
      return { k, ok, pts: ok ? 1 : strict ? -1 : 0 };
    });
    const pts = items.reduce((s, it) => s + it.pts, 0);
    const perfect = items.every((it) => it.ok);
    S.score += pts;
    S.history.push({ spec, ans: Object.assign({}, S.ans), pts, resamples: S.resamples, secs: Math.round((Date.now() - S.t0) / 1000) });
    S.phase = "reveal";
    refreshBar();

    items.forEach((it) => {
      const el = $("#ga-res-" + it.k);
      const par = root.querySelector(`.ga-param[data-k="${it.k}"]`);
      par.classList.add(it.ok ? "ok" : it.pts < 0 ? "bad" : "meh");
      el.textContent = signed(it.pts);
      el.className = "ga-res show " + (it.pts > 0 ? "pos" : it.pts < 0 ? "neg" : "zero");
      if (!it.ok) {
        const right = par.querySelector(`.ga-seg button:nth-child(${choices[it.k].indexOf(spec[it.k]) + 1})`);
        if (right) right.classList.add("truth");
      }
    });
    if (perfect) Sound.good(); else if (items.some((it) => it.pts < 0)) Sound.bad(); else Sound.neutral();
    $("#ga-score").textContent = String(S.score);

    const missedInt = items.filter((it) => it.pts < 0).map((it) => it.k);
    $("#ga-reveal").append(
      h("div", { class: "ga-reveal" + (perfect ? " perfect" : "") },
        h("div", { class: "ga-rv-main" },
          h("small", {}, perfect ? "rodada perfeita" : "modelo verdadeiro"),
          h("b", {}, modelName(spec, hard())),
          h("span", { class: "ga-coef" }, coefText(spec)),
        ),
        missedInt.length ? h("div", { class: "ga-rv-note neg" }, `Errou a ordem de integração (${missedInt.join(" e ")}).`) : null,
        h("div", { class: "ga-rv-pts " + (pts > 0 ? "pos" : pts < 0 ? "neg" : "zero") }, signed(pts), h("small", {}, "pts")),
      ),
    );
    const nx = $("#ga-next");
    if (nx) nx.focus({ preventScroll: true });
  }

  async function endGame() {
    S.phase = "over";
    S.saved = "salvando";
    render();
    const r = await saveGame();
    S.saved = r.off ? "off" : r.ok ? "ok" : "erro";
    S.savedId = r.id || null;
    if (S.phase === "over") render();
  }

  function renderOver() {
    const ks = params();
    const max = S.history.length * ks.length;
    const counts = {};
    ks.forEach((k) => { counts[k] = S.history.filter((r) => r.ans[k] === r.spec[k]).length; });
    const status = {
      salvando: h("p", { class: "ga-save" }, "Gravando o resultado no ranking…"),
      ok: h("p", { class: "ga-save ok" }, "Resultado gravado no ranking."),
      off: h("p", { class: "ga-save" }, "Modo de teste: resultado não gravado."),
      erro: h("p", { class: "ga-save neg" }, "Não foi possível gravar o resultado (sem conexão?). ",
        h("button", { type: "button", class: "ga-link", onclick: endGame }, "Tentar de novo")),
    }[S.saved];
    const board = h("div", { class: "ga-board-slot" });
    root.append(
      h("div", { class: "ga-stage ga-over" },
        h("header", { class: "ga-over-h" },
          h("div", {},
            h("small", { class: "ga-kicker" }, `${S.name} · ${modeLabel(S.mode)} · ${S.rounds} rodadas`),
            h("div", { class: "ga-final" }, h("b", {}, String(S.score)), h("span", {}, `de ${max} pontos possíveis`))),
          h("div", { class: "ga-acc" },
            ks.map((k) => h("div", {}, h("b", {}, k), h("span", {}, `${counts[k]}/${S.history.length}`))))),
        status,
        h("table", { class: "ga-table ga-hist" },
          h("thead", {}, h("tr", {}, h("th", {}, "#"), h("th", {}, "Modelo verdadeiro"), h("th", {}, "Seu palpite"), h("th", { class: "num" }, "Pontos"))),
          h("tbody", {}, S.history.map((r, i) =>
            h("tr", {},
              h("td", {}, String(i + 1)),
              h("td", {}, modelName(r.spec, hard())),
              h("td", { class: "ga-dim" }, modelName(r.ans, hard())),
              h("td", { class: "num " + (r.pts > 0 ? "pos" : r.pts < 0 ? "neg" : "zero") }, signed(r.pts)))))),
        h("div", { class: "ga-row-btns" },
          h("button", { type: "button", class: "ga-btn", onclick: startGame }, "Jogar de novo"),
          h("button", { type: "button", class: "ga-btn ghost", onclick: () => { S.phase = "menu"; render(); } }, "Mudar configuração")),
        h("h3", { class: "ga-sec" }, "Ranking"),
        board,
      ),
    );
    if (S.saved !== "salvando") mountBoard(board, { mode: S.mode, rounds: S.rounds });
  }

  // ---------------------------------------------------------------- ranking
  function renderBoardPage() {
    const board = h("div", { class: "ga-board-slot" });
    root.append(
      h("div", { class: "ga-stage" },
        h("div", { class: "ga-board-top" },
          h("div", { class: "ga-title sm" }, "Ranking"),
          h("button", { type: "button", class: "ga-btn ghost", onclick: () => { S.phase = "menu"; render(); } }, "Voltar")),
        board));
    mountBoard(board, { mode: S.mode, rounds: S.rounds });
  }

  function mountBoard(slot, init) {
    const F = { mode: init.mode, rounds: init.rounds, period: store.get("board-period", "hoje"), which: "primeira" };
    let games = null, error = null;
    const sel = (id, value, opts, onchange) =>
      h("select", { id, onchange }, opts.map(([v, t]) => h("option", { value: String(v), selected: String(v) === String(value) }, t)));
    function draw() {
      slot.innerHTML = "";
      const controls = h("div", { class: "ga-filters" },
        h("label", {}, "Modo ", sel("ga-f-mode", F.mode, [["easy", "Fácil"], ["hard", "Difícil"]], (e) => { F.mode = e.target.value; draw(); })),
        h("label", {}, "Rodadas ", sel("ga-f-rounds", F.rounds, CFG.opcoesRodadas.map((n) => [n, String(n)]), (e) => { F.rounds = +e.target.value; draw(); })),
        h("label", {}, "Período ", sel("ga-f-period", F.period, [["hoje", "Hoje"], ["7d", "Últimos 7 dias"], ["todos", "Todos"]], (e) => { F.period = e.target.value; store.set("board-period", F.period); draw(); })),
        h("label", {}, "Partidas ", sel("ga-f-which", F.which, [["primeira", "Primeira de cada pessoa"], ["melhor", "Melhor de cada pessoa"], ["todas", "Todas"]], (e) => { F.which = e.target.value; draw(); })),
        h("button", { type: "button", class: "ga-btn ghost sm", onclick: load }, "Atualizar"));
      slot.append(controls);
      if (error) { slot.append(h("p", { class: "ga-save neg" }, "Não foi possível carregar o ranking.")); return; }
      if (!games) { slot.append(h("p", { class: "ga-save" }, "Carregando…")); return; }
      const now = Date.now();
      const start = F.period === "hoje" ? new Date().setHours(0, 0, 0, 0) : F.period === "7d" ? now - 7 * 864e5 : 0;
      let rows = games.filter((g) => g.modo === F.mode && g.rodadas === F.rounds && g.semente === CFG.semente && (g.quando || 0) >= start);
      const keep = (list) => { const seen = new Set(); return list.filter((g) => { const k = g.nome_chave || nameKey(g.nome); if (seen.has(k)) return false; seen.add(k); return true; }); };
      if (F.which === "primeira") rows = keep(rows.sort((a, b) => (a.quando || 0) - (b.quando || 0)));
      rows.sort((a, b) => b.pontos - a.pontos || (a.quando || 0) - (b.quando || 0));
      if (F.which === "melhor") rows = keep(rows);
      if (!rows.length) { slot.append(h("p", { class: "ga-save" }, "Nenhuma partida com esses filtros ainda.")); return; }
      const me = nameKey(S.name);
      let pos = 0, prev = null;
      slot.append(
        h("table", { class: "ga-table ga-board" },
          h("thead", {}, h("tr", {},
            h("th", { class: "num" }, "#"), h("th", {}, "Nome"), h("th", { class: "num" }, "Pontos"), h("th", { class: "num" }, "Aproveitamento"),
            h("th", { class: "num hide-sm" }, "Rodadas perfeitas"), h("th", { class: "hide-sm" }, "Nova amostra"), h("th", { class: "hide-sm" }, "Quando"))),
          h("tbody", {}, rows.slice(0, 100).map((g, i) => {
            if (g.pontos !== prev) { pos = i + 1; prev = g.pontos; }
            const mine = (S.savedId && g.id === S.savedId) || (F.which !== "todas" && (g.nome_chave || nameKey(g.nome)) === me);
            const dt = g.quando ? new Date(g.quando) : null;
            return h("tr", { class: mine ? "me" : "" },
              h("td", { class: "num" }, String(pos)),
              h("td", {}, g.nome),
              h("td", { class: "num" }, String(g.pontos)),
              h("td", { class: "num" }, g.maximo ? Math.round((100 * g.pontos) / g.maximo) + "%" : ""),
              h("td", { class: "num hide-sm" }, g.perfeitas != null ? String(g.perfeitas) : ""),
              h("td", { class: "hide-sm" }, g.nova_amostra ? "permitida" : "não"),
              h("td", { class: "hide-sm ga-dim" }, dt ? dt.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : ""));
          }))));
    }
    async function load() {
      games = null; error = null; draw();
      try { games = await loadGames(); } catch (e) { error = e; }
      draw();
    }
    load();
  }

  // ---------------------------------------------------------------- teclado
  root.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" || e.target.tagName === "INPUT" || e.target.tagName === "SELECT") return;
    if (S.phase === "play") {
      const b = $("#ga-confirm");
      if (b && !b.disabled) { e.preventDefault(); confirm(); }
    }
  });

  render();
})();
