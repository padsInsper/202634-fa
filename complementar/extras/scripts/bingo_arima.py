# BINGO ARIMA — versão Python (statsforecast)
#
# Objetivo: descobrir a ordem (p, d, q) do ARIMA por análise descritiva,
# antes de revelar o gabarito.
#
# Fluxo da brincadeira:
#   1. Rodamos "Sorteio + simulação" para gerar uma série nova.
#   2. Fazemos os passos 1-5 (descritiva, testes, diferenciação) e propomos
#      uma ordem (p, d, q).
#   3. Comparamos com o stepwise e o search do AutoARIMA.
#   4. Rodamos o bloco "Gabarito" no final pra revelar o que foi sorteado.
#
# Equivalente em R: complementar/extras/scripts/bingo_arima.R

# %% imports
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt

from statsmodels.tsa.arima_process import ArmaProcess
from statsmodels.tsa.stattools import adfuller, kpss
from statsmodels.graphics.tsaplots import plot_acf, plot_pacf
from statsmodels.stats.diagnostic import acorr_ljungbox

from statsforecast import StatsForecast
from statsforecast.models import AutoARIMA, ARIMA
from statsforecast.arima import arima_string

import warnings
warnings.filterwarnings("ignore")

# Para um sorteio reprodutível, fixe a seed (ex.: np.random.default_rng(42))
RNG = np.random.default_rng()

# %% 1. sorteio + simulação
# ARIMA(p, d, q) com p,q ∈ {0,1,2} e d ∈ {0,1} e coeficientes uniformes em [0.25, 0.45].
p_true = int(RNG.integers(0, 3))
d_true = int(RNG.integers(0, 2))
q_true = int(RNG.integers(0, 3))

ar_parm = RNG.uniform(0.25, 0.45, size=p_true) if p_true else np.array([])
ma_parm = RNG.uniform(0.25, 0.45, size=q_true) if q_true else np.array([])

# ArmaProcess usa convenção (1 - phi_1 z - ...) Y_t = (1 + theta_1 z + ...) eps_t
# então passamos ar coefs com sinal negativo.
proc = ArmaProcess(np.r_[1.0, -ar_parm], np.r_[1.0, ma_parm])
y_stat = proc.generate_sample(nsample=300, scale=1.0)

# Aplicar d diferenças usando a função inversa: integrais (cumsum d vezes) para gerar I(d)
y = y_stat.copy()
for _ in range(d_true):
    y = np.cumsum(y)

dates = pd.date_range("1995-05-01", periods=len(y), freq="MS")
dados = pd.DataFrame({"unique_id": "vendas", "ds": dates, "y": y})
serie = pd.Series(dados["y"].values, index=dados["ds"], name="vendas")

# %%
dados

# %% 2. helpers de visualização
def gg_tsdisplay(series, lag_max=30):
    s = pd.Series(series).dropna()
    ax = plt.figure(figsize=(10, 6)).subplots(3, 1)
    ax[0].plot(s.index, s.values)
    plot_acf(s, ax=ax[1], lags=lag_max)
    plot_pacf(s, ax=ax[2], lags=lag_max, method="ywm")
    

# %% PASSO 1: descritiva da série original
gg_tsdisplay(serie, title="Série original")

# PASSO 2: testes
# %% adf test
adfuller(serie)
# %% kpss test
kpss(serie.values)

# %% PASSO 3: 1ª e 2ª diferenças
dif1 = serie.diff()
gg_tsdisplay(dif1, title="1ª diferença", lag_max=30)

dif2 = dif1.diff()
gg_tsdisplay(dif2, title="2ª diferença", lag_max=30)


# %% Modelagem com statsforecast
# manual_consenso: ARIMA(p_chute, d_chute, q_chute)
p_chute, d_chute, q_chute = 0, 0, 0

sf = StatsForecast(
    models=[
        ARIMA(order=(p_chute, d_chute, q_chute), include_mean=True, alias="manual_consenso"),
        AutoARIMA(stepwise=True,  alias="stepwise", max_P=0, max_Q=0, max_D=0),
        AutoARIMA(stepwise=False, alias="search", max_P=0, max_Q=0, max_D=0),
    ],
    freq="MS",
    n_jobs=1,
)
sf.fit(df=dados)

# %% AICc por modelo (model_['arma'] = (p, q, P, Q, m, d, D))
fitted_models = {m.alias: m for m in sf.fitted_[0]}
for alias, m in fitted_models.items():
    info = m.model_
    aicc = info.get("aicc")
    arma = info.get("arma")
    ord_str = f"({arma[0]},{arma[5]},{arma[1]})" if arma is not None else "?"
    aicc_str = f"{aicc:.2f}" if isinstance(aicc, (int, float)) else "?"
    print(f"  {alias:18}  ordem = {ord_str:9}  AICc = {aicc_str}")

# %% Resíduos de um dos modelos
res_step = pd.Series(
    fitted_models["stepwise"].model_["residuals"],
    index=dados["ds"],
)
gg_tsdisplay(
    res_step,
    title="Resíduos · stepwise (deveriam parecer white noise)",
    lag_max=30,
)
# %% ljung-box test
acorr_ljungbox(res_step, lags=[10], return_df=True)


# %% GABARITO

print(f"Gabarito: ARIMA({p_true}, {d_true}, {q_true})")
print(f"ar_parm = {np.round(ar_parm, 3).tolist()}")
print(f"ma_parm = {np.round(ma_parm, 3).tolist()}")

# %%
