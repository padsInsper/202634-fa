# ===============================================
# ANÁLISE DE SÉRIES TEMPORAIS EM R
# Framework: fpp3 (tsibble + forecast ecology)
# ===============================================

# Carregando bibliotecas
library(fpp3)
library(tsibble)
library(dplyr)
library(ggplot2)

# 1. PREPARAÇÃO DOS DADOS
# =====================

# Exemplo com dados simulados (substitua pelos seus dados)
set.seed(123)
n_obs <- 48
dates <- seq(from = yearmonth("2005 Jun"), by = 1, length.out = n_obs)

# Criando dados com tendência e sazonalidade
trend <- 1:n_obs * 0.3
seasonal <- 3 * sin(2 * pi * (1:n_obs) / 12)
noise <- rnorm(n_obs, 0, 1.5)
vendas <- 5 + trend + seasonal + noise

# Criando tsibble
dados <- tsibble(
  mes = dates,
  vendas = vendas,
  index = mes
)

print("Estrutura dos dados:")
print(dados)

# 2. EXPLORAÇÃO E VISUALIZAÇÃO
# ============================

dados |>
  dplyr::mutate(vendas_1 = lag(vendas, 1), vendas_2 = lag(vendas, 2)) |>
  with(cor(vendas, vendas_2, use = "complete.obs"))

# Plot da série temporal
p1 <- dados |>
  gg_tsdisplay(vendas)

print(p1)

# Decomposição da série temporal
dec <- dados |>
  model(STL(vendas ~ trend(window = 13) + season(window = 13))) |>
  components()

# Plot da decomposição
p2 <- dec |>
  autoplot() +
  theme_minimal()
print(p2)

# ANÁLISE DE AUTOCORRELAÇÃO
# =========================

print("=== ANÁLISE DE AUTOCORRELAÇÃO ===")

# ACF e PACF da série original
p_acf <- dados |>
  ACF(vendas, lag_max = 24) |>
  autoplot() +
  labs(title = "Função de Autocorrelação (ACF) - Série Original") +
  theme_minimal()

p_pacf <- dados |>
  PACF(vendas, lag_max = 24) |>
  autoplot() +
  labs(title = "Função de Autocorrelação Parcial (PACF) - Série Original") +
  theme_minimal()

print(p_acf)
print(p_pacf)

# ACF e PACF da série diferenciada (para verificar estacionariedade)
dados_diff <- dados |>
  mutate(vendas_diff = difference(vendas))

p_acf_diff <- dados_diff |>
  ACF(vendas_diff, lag_max = 24) |>
  autoplot() +
  labs(title = "ACF - Série Diferenciada (1ª diferença)") +
  theme_minimal()

p_pacf_diff <- dados_diff |>
  PACF(vendas_diff, lag_max = 24) |>
  autoplot() +
  labs(title = "PACF - Série Diferenciada (1ª diferença)") +
  theme_minimal()

print(p_acf_diff)
print(p_pacf_diff)

# Teste de estacionariedade (KPSS)
library(feasts)
print("Teste de estacionariedade (KPSS):")
kpss_original <- dados |> features(vendas, unitroot_kpss)
kpss_diff <- dados_diff |> features(vendas_diff, unitroot_kpss)

print("Série original:")
print(kpss_original)
print("Série diferenciada:")
print(kpss_diff)

# 3. AJUSTE DE MODELOS
# ===================

# Dividindo em treino e teste
dados_treino <- dados |>
  filter(mes <= yearmonth("2008 May"))
dados_teste <- dados |>
  filter(mes > yearmonth("2008 May"))

# Ajustando múltiplos modelos
modelos <- dados_treino |>
  model(
    # ARIMA automático
    arima = ARIMA(vendas),

    # ARIMA manual
    arima_manual = ARIMA(vendas ~ pdq(1, 1, 1) + PDQ(1, 1, 1)),

    # Exponential Smoothing (ETS)
    ets = ETS(vendas),

    # ETS específico
    ets_manual = ETS(vendas ~ error("A") + trend("A") + season("A")),

    # Naive sazonal
    snaive = SNAIVE(vendas),

    # Modelo linear com tendência e sazonalidade
    tslm = TSLM(vendas ~ trend() + season())
  )

print("Resumo dos modelos ajustados:")
print(modelos)

# 4. AVALIAÇÃO DOS MODELOS
# =======================

# Critérios de informação (AIC, BIC)
criterios <- modelos |> glance()
print("Critérios de seleção:")
print(criterios)

# Análise de resíduos
residuos <- modelos |>
  select(arima, ets, snaive) |>
  augment()

# Plot dos resíduos
p3 <- residuos |>
  ggplot(aes(x = mes, y = .resid)) +
  geom_line() +
  facet_wrap(~.model, scales = "free_y") +
  labs(title = "Análise de Resíduos", x = "Tempo", y = "Resíduos") +
  theme_minimal()

print(p3)

# ANÁLISE DE AUTOCORRELAÇÃO DOS RESÍDUOS
# =====================================

print("=== ANÁLISE DE AUTOCORRELAÇÃO DOS RESÍDUOS ===")

# ACF dos resíduos para cada modelo
p_acf_residuos <- residuos |>
  ACF(.resid, lag_max = 24) |>
  autoplot() +
  facet_wrap(~.model) +
  labs(title = "ACF dos Resíduos por Modelo") +
  theme_minimal()

print(p_acf_residuos)

# PACF dos resíduos
p_pacf_residuos <- residuos |>
  PACF(.resid, lag_max = 24) |>
  autoplot() +
  facet_wrap(~.model) +
  labs(title = "PACF dos Resíduos por Modelo") +
  theme_minimal()

print(p_pacf_residuos)

# Teste de Ljung-Box para autocorrelação dos resíduos
print("Testes de diagnóstico (Ljung-Box):")
lb_test <- modelos |>
  select(arima, ets, snaive) |>
  augment() |>
  features(.resid, ljung_box, lag = 10)

print(lb_test)

# Teste de normalidade dos resíduos
print("Teste de normalidade dos resíduos (Shapiro-Wilk):")
residuos |>
  group_by(.model) |>
  summarise(
    shapiro_statistic = shapiro.test(.resid)$statistic,
    shapiro_p_value = shapiro.test(.resid)$p.value,
    .groups = 'drop'
  ) |>
  print()

# Plot Q-Q para verificar normalidade
p_qq <- residuos |>
  ggplot(aes(sample = .resid)) +
  geom_qq() +
  geom_qq_line() +
  facet_wrap(~.model) +
  labs(
    title = "Q-Q Plot dos Resíduos",
    x = "Quantis Teóricos",
    y = "Quantis da Amostra"
  ) +
  theme_minimal()

print(p_qq)

# 5. PREVISÕES
# ===========

# Gerando previsões
previsoes <- modelos |>
  forecast(h = 12)

# Plot das previsões
p4 <- previsoes |>
  autoplot(dados, level = 95) +
  labs(title = "Previsões dos Principais Modelos", x = "Tempo", y = "Vendas") +
  theme_minimal() +
  facet_wrap(~.model)

print(p4)
