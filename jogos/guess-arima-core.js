/* Guess the ARIMA: núcleo numérico (simulação SARIMA, ACF/PACF, ADF e KPSS).
 *
 * ADF e KPSS replicam statsmodels 0.14 (adfuller com regression="c", autolag="AIC";
 * kpss com regression="c", nlags="auto"), inclusive p-valores de MacKinnon e
 * valores críticos. Funciona no navegador (window.GACore) e no Node (module.exports).
 */
(function (root) {
  "use strict";

  // ---------- aleatoriedade com semente ----------
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function makeRng(seed) {
    const u = mulberry32(seed);
    let spare = null;
    return {
      unif: u,
      norm() {
        if (spare !== null) { const s = spare; spare = null; return s; }
        let x, y, r;
        do { x = 2 * u() - 1; y = 2 * u() - 1; r = x * x + y * y; } while (r === 0 || r >= 1);
        const f = Math.sqrt(-2 * Math.log(r) / r);
        spare = y * f;
        return x * f;
      },
      range(a, b) { return a + (b - a) * u(); },
      sign() { return u() < 0.5 ? -1 : 1; },
      pick(arr, w) {
        if (!w) return arr[Math.floor(u() * arr.length)];
        const tot = w.reduce((s, v) => s + v, 0);
        let r = u() * tot;
        for (let i = 0; i < arr.length; i++) { r -= w[i]; if (r <= 0) return arr[i]; }
        return arr[arr.length - 1];
      },
    };
  }

  // ---------- polinômios em B ----------
  function polyMul(a, b) {
    const out = new Array(a.length + b.length - 1).fill(0);
    for (let i = 0; i < a.length; i++) for (let j = 0; j < b.length; j++) out[i + j] += a[i] * b[j];
    return out;
  }
  // AR: (1 - phi1 B - ... )(1 - Phi1 B^s); MA: (1 + theta1 B + ...)(1 + Theta1 B^s)
  function arPoly(phi, Phi, s) {
    let a = [1].concat(phi.map((v) => -v));
    if (Phi) { const S = new Array(s + 1).fill(0); S[0] = 1; S[s] = -Phi; a = polyMul(a, S); }
    return a;
  }
  function maPoly(theta, Theta, s) {
    let m = [1].concat(theta.slice());
    if (Theta) { const S = new Array(s + 1).fill(0); S[0] = 1; S[s] = Theta; m = polyMul(m, S); }
    return m;
  }

  // ---------- simulação ----------
  // spec: {p,d,q,P,D,Q,s,phi,theta,Phi,Theta,n,sigma,level}
  function simulate(spec, seed) {
    const rng = makeRng(seed);
    const s = spec.s || 12;
    const a = arPoly(spec.phi, spec.P ? spec.Phi : 0, s);
    const m = maPoly(spec.theta, spec.Q ? spec.Theta : 0, s);
    const burn = 300;
    const N = spec.n + burn;
    const e = new Array(N), w = new Array(N);
    for (let t = 0; t < N; t++) e[t] = rng.norm() * (spec.sigma || 1);
    for (let t = 0; t < N; t++) {
      let v = 0;
      for (let j = 0; j < m.length; j++) if (t - j >= 0) v += m[j] * e[t - j];
      for (let i = 1; i < a.length; i++) if (t - i >= 0) v -= a[i] * w[t - i];
      w[t] = v;
    }
    let y = w.slice(burn);
    // integração sazonal e depois regular (as diferenças comutam)
    for (let k = 0; k < (spec.D || 0); k++) {
      const z = new Array(y.length);
      for (let t = 0; t < y.length; t++) z[t] = y[t] + (t - s >= 0 ? z[t - s] : 0);
      y = z;
    }
    for (let k = 0; k < (spec.d || 0); k++) {
      const z = new Array(y.length);
      let acc = 0;
      for (let t = 0; t < y.length; t++) { acc += y[t]; z[t] = acc; }
      y = z;
    }
    const lvl = spec.level || 0;
    return y.map((v) => v + lvl);
  }

  function diff(x, lag) {
    lag = lag || 1;
    const out = [];
    for (let t = lag; t < x.length; t++) out.push(x[t] - x[t - lag]);
    return out;
  }

  // ---------- ACF / PACF ----------
  function mean(x) { let s = 0; for (const v of x) s += v; return s / x.length; }
  function acf(x, nlags) {
    const n = x.length, mu = mean(x);
    const d = x.map((v) => v - mu);
    let c0 = 0;
    for (const v of d) c0 += v * v;
    const r = [1];
    for (let k = 1; k <= nlags; k++) {
      let c = 0;
      for (let t = k; t < n; t++) c += d[t] * d[t - k];
      r.push(c / c0);
    }
    return r;
  }
  // Durbin-Levinson sobre a ACF amostral (equivale a statsmodels pacf method="ywm")
  function pacf(x, nlags) {
    const r = acf(x, nlags);
    const out = [1];
    let phiPrev = [];
    let v = 1;
    for (let k = 1; k <= nlags; k++) {
      let num = r[k];
      for (let j = 1; j < k; j++) num -= phiPrev[j - 1] * r[k - j];
      const pkk = num / v;
      const phi = new Array(k);
      for (let j = 1; j < k; j++) phi[j - 1] = phiPrev[j - 1] - pkk * phiPrev[k - j - 1];
      phi[k - 1] = pkk;
      v *= 1 - pkk * pkk;
      phiPrev = phi;
      out.push(pkk);
    }
    return out;
  }

  // ---------- OLS ----------
  function solveSym(A, b) {
    // eliminação de Gauss com pivoteamento parcial; devolve {x, inv}
    const n = A.length;
    const M = A.map((row, i) => row.concat(b ? [b[i]] : []).concat(Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))));
    const w = M[0].length;
    for (let c = 0; c < n; c++) {
      let piv = c;
      for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
      [M[c], M[piv]] = [M[piv], M[c]];
      const d = M[c][c];
      for (let j = c; j < w; j++) M[c][j] /= d;
      for (let r = 0; r < n; r++) {
        if (r === c) continue;
        const f = M[r][c];
        if (f === 0) continue;
        for (let j = c; j < w; j++) M[r][j] -= f * M[c][j];
      }
    }
    const off = b ? 1 : 0;
    return { x: b ? M.map((row) => row[n]) : null, inv: M.map((row) => row.slice(n + off)) };
  }
  function ols(y, X) {
    const n = y.length, k = X[0].length;
    const XtX = Array.from({ length: k }, () => new Array(k).fill(0));
    const Xty = new Array(k).fill(0);
    for (let t = 0; t < n; t++) {
      const row = X[t];
      for (let i = 0; i < k; i++) {
        Xty[i] += row[i] * y[t];
        for (let j = i; j < k; j++) XtX[i][j] += row[i] * row[j];
      }
    }
    for (let i = 0; i < k; i++) for (let j = 0; j < i; j++) XtX[i][j] = XtX[j][i];
    const { x: beta, inv } = solveSym(XtX, Xty);
    let ssr = 0;
    for (let t = 0; t < n; t++) {
      let f = 0;
      for (let i = 0; i < k; i++) f += X[t][i] * beta[i];
      ssr += (y[t] - f) ** 2;
    }
    const llf = -n / 2 * (Math.log(2 * Math.PI) + Math.log(ssr / n) + 1);
    const s2 = ssr / (n - k);
    const se = inv.map((row, i) => Math.sqrt(s2 * row[i]));
    return { beta, se, ssr, llf, aic: -2 * llf + 2 * k, n, k };
  }

  // ---------- distribuição normal ----------
  function normCdf(z) {
    // Abramowitz-Stegun 7.1.26 via erf, com refinamento suficiente para p-valores exibidos
    const t = 1 / (1 + 0.3275911 * Math.abs(z) / Math.SQRT2);
    const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(z * z) / 2);
    return z >= 0 ? (1 + y) / 2 : (1 - y) / 2;
  }
  function polyval(coefLowFirst, x) {
    let v = 0;
    for (let i = coefLowFirst.length - 1; i >= 0; i--) v = v * x + coefLowFirst[i];
    return v;
  }

  // ---------- ADF (statsmodels adfuller, regression="c", autolag="AIC") ----------
  function mackinnonpC(stat) {
    const smallp = [2.1659, 1.4412, 0.038269];
    const largep = [1.7339, 0.93202, -0.12745, -0.010368];
    if (stat > 2.74) return 1.0;
    if (stat < -18.83) return 0.0;
    return normCdf(polyval(stat <= -1.61 ? smallp : largep, stat));
  }
  function mackinnoncritC(nobs) {
    const tau = [
      [-3.43035, -6.5393, -16.786, -79.433],
      [-2.86154, -2.8903, -4.234, -40.04],
      [-2.56677, -1.5384, -2.809, 0],
    ];
    const z = 1 / nobs;
    return { "1%": polyval(tau[0], z), "5%": polyval(tau[1], z), "10%": polyval(tau[2], z) };
  }
  function adfDesign(x, xd, lag) {
    // linhas t = lag .. len(xd)-1 : [1, x[t], xd[t-1], ..., xd[t-lag]] e y = xd[t]
    const X = [], y = [];
    for (let t = lag; t < xd.length; t++) {
      const row = [1, x[t]];
      for (let j = 1; j <= lag; j++) row.push(xd[t - j]);
      X.push(row);
      y.push(xd[t]);
    }
    return { X, y };
  }
  function adfuller(x) {
    const n = x.length;
    let maxlag = Math.ceil(12 * Math.pow(n / 100, 0.25));
    maxlag = Math.min(Math.floor(n / 2) - 1 - 1, maxlag);
    const xd = diff(x, 1);
    // seleção por AIC na amostra comum (trim por maxlag)
    const full = adfDesign(x, xd, maxlag);
    let best = null;
    for (let lag = 0; lag <= maxlag; lag++) {
      const Xs = full.X.map((r) => r.slice(0, 2 + lag));
      const fit = ols(full.y, Xs);
      if (best === null || fit.aic < best.aic || (fit.aic === best.aic && lag < best.lag)) best = { aic: fit.aic, lag };
    }
    const d = adfDesign(x, xd, best.lag);
    const fit = ols(d.y, d.X);
    const stat = fit.beta[1] / fit.se[1];
    return {
      adf: stat,
      pvalue: mackinnonpC(stat),
      usedlag: best.lag,
      nobs: d.y.length,
      critical: mackinnoncritC(d.y.length),
      icbest: best.aic,
    };
  }

  // ---------- KPSS (statsmodels kpss, regression="c", nlags="auto") ----------
  function kpss(x) {
    const n = x.length, mu = mean(x);
    const e = x.map((v) => v - mu);
    // nlags automático (Hobijn et al., 1998)
    const covlags = Math.floor(Math.pow(n, 2 / 9));
    let s0 = 0, s1 = 0;
    for (const v of e) s0 += v * v;
    s0 /= n;
    for (let i = 1; i <= covlags; i++) {
      let p = 0;
      for (let t = i; t < n; t++) p += e[t] * e[t - i];
      p /= n / 2;
      s0 += p;
      s1 += i * p;
    }
    const sHat0 = s1 / s0;
    const gamma = 1.1447 * Math.pow(sHat0 * sHat0, 1 / 3);
    let lags = Math.floor(gamma * Math.pow(n, 1 / 3));
    lags = Math.min(lags, n - 1);
    let cs = 0, eta = 0;
    for (const v of e) { cs += v; eta += cs * cs; }
    eta /= n * n;
    let sHat = 0;
    for (const v of e) sHat += v * v;
    for (let i = 1; i <= lags; i++) {
      let p = 0;
      for (let t = i; t < n; t++) p += e[t] * e[t - i];
      sHat += 2 * p * (1 - i / (lags + 1));
    }
    sHat /= n;
    const stat = eta / sHat;
    const crit = [0.347, 0.463, 0.574, 0.739];
    const pv = [0.1, 0.05, 0.025, 0.01];
    let p, note = null;
    if (stat <= crit[0]) { p = 0.1; note = "maior"; }
    else if (stat >= crit[3]) { p = 0.01; note = "menor"; }
    else {
      for (let i = 0; i < 3; i++) {
        if (stat <= crit[i + 1]) { p = pv[i] + (pv[i + 1] - pv[i]) * (stat - crit[i]) / (crit[i + 1] - crit[i]); break; }
      }
    }
    return { kpss: stat, pvalue: p, pnote: note, lags, critical: { "10%": 0.347, "5%": 0.463, "2.5%": 0.574, "1%": 0.739 } };
  }

  // ---------- sorteio de especificações ----------
  function sampleAR(rng, p) {
    if (p === 0) return [];
    if (p === 1) return [rng.sign() * rng.range(0.5, 0.85)];
    for (;;) {
      const phi2 = rng.sign() * rng.range(0.3, 0.6);
      const phi1 = rng.sign() * rng.range(0.25, 1.0);
      if (phi1 + phi2 < 0.9 && phi2 - phi1 < 0.9 && Math.abs(phi2) < 0.9) return [phi1, phi2];
    }
  }
  function sampleMA(rng, q) {
    if (q === 0) return [];
    if (q === 1) return [rng.sign() * rng.range(0.5, 0.85)];
    for (;;) {
      const t2 = rng.sign() * rng.range(0.3, 0.6);
      const t1 = rng.sign() * rng.range(0.25, 1.0);
      // invertibilidade: mesmas condições do AR com sinais trocados
      if (-t1 - t2 < 0.9 && -t2 + t1 < 0.9 && Math.abs(t2) < 0.9) return [t1, t2];
    }
  }
  function sampleSpec(mode, seed) {
    const rng = makeRng(seed);
    const hard = mode === "hard";
    for (;;) {
      const p = rng.pick([0, 1, 2], [0.3, 0.45, 0.25]);
      const q = rng.pick([0, 1, 2], [0.35, 0.45, 0.2]);
      const d = rng.pick([0, 1], [0.45, 0.55]);
      let P = 0, D = 0, Q = 0;
      if (hard) {
        P = rng.pick([0, 1], [0.6, 0.4]);
        Q = rng.pick([0, 1], [0.55, 0.45]);
        D = rng.pick([0, 1], [0.4, 0.6]);
      }
      // evita o caso trivial em que não há nada para identificar
      if (!hard && p + q === 0 && rng.unif() < 0.7) continue;
      if (hard && P + Q + D === 0) continue;
      const phi = sampleAR(rng, p);
      const theta = sampleMA(rng, q);
      // evita quase cancelamento entre AR(1) e MA(1): (1 - phi B) ~ (1 + theta B)
      if (p >= 1 && q >= 1 && Math.abs(phi[0] + theta[0]) < 0.6) continue;
      const Phi = P ? rng.sign() * rng.range(0.45, 0.85) : 0;
      const Theta = Q ? rng.sign() * rng.range(0.45, 0.85) : 0;
      if (P && Q && Math.abs(Phi + Theta) < 0.6) continue;
      return {
        mode, p, d, q, P, D, Q, s: 12, phi, theta, Phi, Theta,
        n: hard ? 300 : 220,
        sigma: 1,
        level: Math.round(rng.range(20, 120)),
      };
    }
  }

  const api = { makeRng, simulate, diff, acf, pacf, adfuller, kpss, sampleSpec, ols, normCdf, mackinnonpC };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.GACore = api;
})(typeof window !== "undefined" ? window : this);
