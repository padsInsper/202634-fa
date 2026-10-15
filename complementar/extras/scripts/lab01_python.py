# ===============================================
# ANÁLISE DE SÉRIES TEMPORAIS EM PYTHON
# Framework: nixtlaverse (statsforecast)
# ===============================================

# Instalação necessária (executar no terminal):
# pip install statsforecast utilsforecast datasetsforecast plotly kaleido

import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import warnings
from statsforecast import StatsForecast
from statsforecast.models import (
    AutoARIMA,
    ARIMA,
    AutoETS,
    SeasonalNaive,
    Naive,
    HoltWinters,
    MSTL
)
from utilsforecast.plotting import plot_series
from statsmodels.tsa.stattools import kpss
from statsmodels.graphics.tsaplots import plot_acf, plot_pacf
from statsmodels.tsa.seasonal import seasonal_decompose
# Nota: MSTL não expõe componentes diretamente como STL
# Para uma decomposição mais detalhada, usar outras bibliotecas como seasonal_decompose

warnings.filterwarnings('ignore')

# 1. PREPARAÇÃO DOS DADOS
# =====================

# Criando dados simulados (equivalente ao R)
np.random.seed(123)
n_obs = 48

# Criando datas mensais
dates = pd.date_range(start='2005-06', periods=n_obs, freq='M')

# Criando dados com tendência e sazonalidade
trend = np.arange(1, n_obs + 1) * 0.3
seasonal = 3 * np.sin(2 * np.pi * np.arange(1, n_obs + 1) / 12)
noise = np.random.normal(0, 1.5, n_obs)
vendas = 5 + trend + seasonal + noise

# Criando DataFrame no formato necessário para statsforecast
dados = pd.DataFrame({
    'unique_id': ['serie_vendas'] * n_obs,  # Identificador da série
    'ds': dates,  # Data/timestamp
    'y': vendas   # Valor da série
})

print("Estrutura dos dados:")
print(dados.head())
print(f"\nShape: {dados.shape}")
print(f"Período: {dados['ds'].min()} a {dados['ds'].max()}")

# 2. EXPLORAÇÃO E VISUALIZAÇÃO
# ============================

# Plot da série temporal
plt.figure(figsize=(12, 6))
plt.plot(dados['ds'], dados['y'], linewidth=2)
plt.title('Série Temporal Original', fontsize=14)
plt.xlabel('Tempo')
plt.ylabel('Vendas')
plt.grid(True, alpha=0.3)
plt.tight_layout()
plt.show()

# alternativa
plot_series(dados, engine = "plotly")

# Decomposição da série usando MSTL
sf_decomp = StatsForecast(
    models=[MSTL(season_length=12)],
    freq='M'
)

# Ajustando para decomposição
decomposition = sf_decomp.fit(dados).fitted_[0, 0].model_

decomposition.plot()

# Plot da decomposição (simplificado)
fig, axes = plt.subplots(4, 1, figsize=(12, 10))
axes[0].plot(dados['ds'], dados['y'])
axes[0].set_title('Série Original')
axes[0].grid(True, alpha=0.3)

# Convertendo para série temporal com índice de data
ts_data = dados.set_index('ds')['y']
decomp_stats = seasonal_decompose(ts_data, model='additive', period=12)

axes[1].plot(dados['ds'], decomp_stats.trend)
axes[1].set_title('Tendência')
axes[1].grid(True, alpha=0.3)

axes[2].plot(dados['ds'], decomp_stats.seasonal)
axes[2].set_title('Sazonalidade')
axes[2].grid(True, alpha=0.3)

axes[3].plot(dados['ds'], decomp_stats.resid)
axes[3].set_title('Resíduos')
axes[3].grid(True, alpha=0.3)

plt.tight_layout()
plt.show()

# ANÁLISE DE AUTOCORRELAÇÃO
# =========================

# ACF e PACF da série original
fig, axes = plt.subplots(2, 2, figsize=(15, 10))

# ACF da série original
plot_acf(ts_data.dropna(), lags=24, ax=axes[0,0], title='ACF - Série Original')
axes[0,0].grid(True, alpha=0.3)

# PACF da série original
plot_pacf(ts_data.dropna(), lags=24, ax=axes[0,1], title='PACF - Série Original')
axes[0,1].grid(True, alpha=0.3)

# ACF da série diferenciada
ts_diff = ts_data.diff().dropna()
plot_acf(ts_diff, lags=23, ax=axes[1,0], title='ACF - Série Diferenciada (1ª diferença)')
axes[1,0].grid(True, alpha=0.3)

# PACF da série diferenciada
plot_pacf(ts_diff, lags=23, ax=axes[1,1], title='PACF - Série Diferenciada (1ª diferença)')
axes[1,1].grid(True, alpha=0.3)

plt.tight_layout()
plt.show()

# Teste de estacionariedade (KPSS)
def kpss_test(series, regression='c'):
    """Teste KPSS para estacionariedade"""
    statistic, p_value, lags, critical_values = kpss(series, regression=regression)
    return {
        'statistic': statistic,
        'p_value': p_value,
        'lags': lags,
        'critical_values': critical_values
    }

print("Teste de estacionariedade (KPSS):")
print("Série original:")
kpss_original = kpss_test(ts_data.dropna())
print(f"  Estatística: {kpss_original['statistic']:.4f}")
print(f"  p-value: {kpss_original['p_value']:.4f}")

print("Série diferenciada:")
kpss_diff = kpss_test(ts_diff)
print(f"  Estatística: {kpss_diff['statistic']:.4f}")
print(f"  p-value: {kpss_diff['p_value']:.4f}")


# 3. DIVISÃO TREINO/TESTE
# ======================

# Dividindo os dados (36 para treino, 12 para teste)
split_date = dados['ds'].iloc[36]  # Equivalente a May 2008
dados_treino = dados[dados['ds'] <= split_date].copy()
dados_teste = dados[dados['ds'] > split_date].copy()

print(f"Dados de treino: {len(dados_treino)} observações")
print(f"Dados de teste: {len(dados_teste)} observações")

# 4. AJUSTE DE MODELOS
# ===================

# Definindo os modelos
modelos = [
    # ARIMA automático
    AutoARIMA(season_length=12),
    
    # ARIMA manual
    ARIMA(order=(1, 1, 1), seasonal_order=(1, 1, 1), season_length=12),
    
    # Exponential Smoothing
    AutoETS(season_length=12),
    
    # Holt-Winters
    HoltWinters(season_length=12),
    
    # Naive sazonal
    SeasonalNaive(season_length=12),
    
    # Naive simples
    Naive(),
]

# Criando o objeto StatsForecast
sf = StatsForecast(
    models=modelos,
    freq='M'
)

# 5. TREINAMENTO E PREVISÕES
# =========================

# Ajustando os modelos
print("Ajustando modelos...")
sf.fit(dados_treino)

# Gerando previsões para o período de teste
previsoes = sf.predict(h=len(dados_teste), level=[80, 95])

print("Previsões geradas:")
print(previsoes.head())

# 6. AVALIAÇÃO DOS MODELOS
# =======================

# Preparando dados para avaliação
dados_teste_eval = dados_teste.copy()
dados_teste_eval = dados_teste_eval.merge(previsoes, on=['unique_id', 'ds'])

# Calculando métricas de erro
metricas = []
for modelo in [col for col in previsoes.columns if col not in ['unique_id', 'ds']]:
    if not modelo.endswith('-lo-80') and not modelo.endswith('-hi-80') and \
       not modelo.endswith('-lo-95') and not modelo.endswith('-hi-95'):
        
        y_true = dados_teste_eval['y'].values
        y_pred = dados_teste_eval[modelo].values
        
        mae = np.mean(np.abs(y_true - y_pred))
        mse = np.mean((y_true - y_pred)**2)
        rmse = np.sqrt(mse)
        mape = np.mean(np.abs((y_true - y_pred) / y_true)) * 100
        
        metricas.append({
            'model': modelo,
            'MAE': mae,
            'MSE': mse,
            'RMSE': rmse,
            'MAPE': mape
        })

metricas_df = pd.DataFrame(metricas)
print("\nMétricas de avaliação:")
print(metricas_df.round(4))

# 7. VALIDAÇÃO CRUZADA
# ===================

# Validação cruzada por origem temporal
print("\nExecutando validação cruzada...")

def time_series_cv(data, models, h=1, step=1, initial_train_size=24):
    """Validação cruzada por origem temporal"""
    results = []
    
    for start_idx in range(initial_train_size, len(data) - h + 1, step):
        # Dados de treino
        train_data = data.iloc[:start_idx].copy()
        
        # Dados de validação
        val_data = data.iloc[start_idx:start_idx + h].copy()
        
        # Ajustando modelos
        sf_cv = StatsForecast(models=models, freq='M')
        sf_cv.fit(train_data)
        
        # Previsões
        preds = sf_cv.predict(h=h)
        
        # Avaliação
        for modelo in [col for col in preds.columns if col not in ['unique_id', 'ds']]:
            if not modelo.endswith('-lo-80') and not modelo.endswith('-hi-80') and \
               not modelo.endswith('-lo-95') and not modelo.endswith('-hi-95'):
                
                mae = np.mean(np.abs(val_data['y'].values - preds[modelo].values))
                results.append({
                    'model': modelo,
                    'fold': start_idx - initial_train_size,
                    'MAE': mae
                })
    
    return pd.DataFrame(results)

# 8. VISUALIZAÇÃO DAS PREVISÕES
# ============================

# Plot das previsões
plt.figure(figsize=(15, 8))

# Série original
plt.plot(dados['ds'], dados['y'], label='Original', linewidth=2, color='black')

# Separação treino/teste
plt.axvline(x=split_date, color='red', linestyle='--', alpha=0.7, label='Divisão Treino/Teste')

# Previsões dos principais modelos
cores = ['blue', 'green', 'orange', 'purple']
modelos_principais = ['AutoARIMA', 'ETS', 'HoltWinters', 'SeasonalNaive']

for i, modelo in enumerate(modelos_principais):
    if modelo in previsoes.columns:
        plt.plot(previsoes['ds'], previsoes[modelo], 
                label=f'{modelo}', linewidth=2, color=cores[i])
        
        # Intervalos de confiança (se disponíveis)
        if f'{modelo}-lo-95' in previsoes.columns:
            plt.fill_between(previsoes['ds'], 
                           previsoes[f'{modelo}-lo-95'], 
                           previsoes[f'{modelo}-hi-95'],
                           alpha=0.2, color=cores[i])

plt.title('Comparação de Previsões', fontsize=14)
plt.xlabel('Tempo')
plt.ylabel('Vendas')
plt.legend()
plt.grid(True, alpha=0.3)
plt.tight_layout()
plt.show()

