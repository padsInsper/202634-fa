#' Nosso objetivo é descobrir qual a ordem do ARIMA usando análise descritiva

# gerando os dados --------------------------------------------------------

ar <- sample(0:2, 1)
ma <- sample(0:2, 1)
dif <- sample(0:1, 1)

ar_parm <- runif(ar, min = .3, max = .4)
ma_parm <- runif(ma, min = .3, max = .4)

dados <- data.frame(
  mes = 1:(300 + dif),
  vendas = arima.sim(
    list(
      order = c(ar, dif, ma),
      ma = ma_parm,
      ar = ar_parm
    ),
    n = 300
  )
)

# montando os dados -------------------------------------------------------

dados_tsibble <- dados |>
  dplyr::mutate(
    mes = as.Date("1995-05-01") + months(mes),
    mes = tsibble::yearmonth(mes)
  ) |>
  tsibble::as_tsibble(index = mes)

# descritiva --------------------------------------------------------------

# PASSO 1
dados_tsibble |>
  ggtime::gg_tsdisplay(vendas, plot_type = "partial")

tseries::adf.test(dados_tsibble$vendas)

# PASSO 2: TESTE
dados_tsibble |>
  fabletools::features(
    vendas,
    list(
      feasts::unitroot_kpss,
      feasts::unitroot_ndiffs,
      feasts::unitroot_nsdiffs
    )
  )

# PASSO 3: DIFERENCIAÇÃO E VISUALIZAÇÃO
dados_tsibble |>
  dplyr::mutate(dif_vendas = tsibble::difference(vendas)) |>
  feasts::gg_tsdisplay(dif_vendas, plot_type = "partial", lag_max = 30)

dados_tsibble |>
  dplyr::mutate(dif_vendas = tsibble::difference(vendas)) |>
  dplyr::mutate(dif_vendas2 = tsibble::difference(dif_vendas)) |>
  feasts::gg_tsdisplay(dif_vendas2, plot_type = "partial", lag_max = 30)

# PASSO 1: descritiva
# PASSO 2: AVALIAR NECESSIDADE DE DIFERENÇA SAZONAL
# PASSO 3: descritiva, depois de tirar a diferença sazonal, se necessário
# PASSO 4: AVALIAR NECESSIDADE DE DIFERENÇA
# PASSO 5: descritiva, depois de tirar a diferença, se necessário

# modelagem ---------------------------------------------------------------

fit <- dados_tsibble |>
  fabletools::model(
    arima_manual_consenso = fable::ARIMA(
      vendas ~ 1 + pdq(0, 0, 0) + PDQ(0, 0, 0)
    ),
    stepwise = fable::ARIMA(vendas ~ 1 + PDQ(0, 0, 0)),
    search = fable::ARIMA(vendas ~ 1 + PDQ(0, 0, 0), stepwise = FALSE)
  )

dplyr::glimpse(fit)

fit |>
  broom::glance() |>
  dplyr::select(.model, AICc) |>
  dplyr::arrange(AICc)

fit |>
  broom::augment() |>
  dplyr::filter(.model == "stepwise") |>
  feasts::gg_tsdisplay(.resid, plot_type = "partial", lag_max = 30)

# gabarito ----------------------------------------------------------------

c(ar, dif, ma)
ar_parm
ma_parm
