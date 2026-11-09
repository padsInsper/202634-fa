"""Gera a base simulada de vendas da Cervejaria Ipê (exercício do Lab 2).

Vendas mensais, em milhares de litros, de jan/2018 a dez/2025, numa hierarquia

    Total -> Região (5) -> Categoria (4) -> SKU (10 por região)

O que a simulação coloca de propósito, para o exercício ter o que mostrar:

- sazonalidade nacional de verão (pico de dezembro a março, vale em junho e julho),
  com diferenças regionais: o Nordeste tem um segundo pico no São João (junho),
  o Sul tem o inverno mais fraco e o Norte quase não tem sazonalidade;
- Carnaval, que muda de mês (fevereiro ou março, conforme o ano);
- pandemia: bares fechados em abr-jun/2020, o que derruba a garrafa de 600 ml
  (consumida em bar) e empurra a lata (consumida em casa);
- tendências de categoria: Pilsen estável, puro malte e premium crescendo,
  sem álcool lançado em mar/2022 e crescendo rápido a partir de uma base pequena;
- Copa do Mundo em nov-dez/2022;
- ruído multiplicativo maior nos SKUs pequenos e promoções pontuais por SKU.

Rodar: python dados/cerveja/gerar_vendas_cerveja.py
"""

from pathlib import Path

import numpy as np
import pandas as pd

SEMENTE = 2026
rng = np.random.default_rng(SEMENTE)

datas = pd.date_range("2018-01-01", "2025-12-01", freq="MS")
n = len(datas)
t = np.arange(n)
mes = datas.month.to_numpy()
ano = datas.year.to_numpy()

# participação de cada região no volume nacional e intensidade da sazonalidade
REGIOES = {
    "Sudeste": dict(peso=0.44, saz=1.00, sao_joao=0.00, inverno=0.00),
    "Nordeste": dict(peso=0.23, saz=0.85, sao_joao=0.22, inverno=0.00),
    "Sul": dict(peso=0.15, saz=1.15, sao_joao=0.00, inverno=0.10),
    "Centro-Oeste": dict(peso=0.10, saz=0.80, sao_joao=0.00, inverno=0.00),
    "Norte": dict(peso=0.08, saz=0.35, sao_joao=0.05, inverno=0.00),
}

# SKUs: categoria, participação dentro da região (em 2018), canal (casa ou bar),
# crescimento anual e mês de lançamento
SKUS = {
    "PIL-LT350": dict(cat="Pilsen", peso=0.30, canal="casa", cresc=0.000),
    "PIL-GF600": dict(cat="Pilsen", peso=0.22, canal="bar", cresc=-0.025),
    "PIL-LT473": dict(cat="Pilsen", peso=0.12, canal="casa", cresc=0.020),
    "PM-LT350": dict(cat="Puro malte", peso=0.10, canal="casa", cresc=0.070),
    "PM-LN355": dict(cat="Puro malte", peso=0.06, canal="bar", cresc=0.050),
    "PM-LT473": dict(cat="Puro malte", peso=0.05, canal="casa", cresc=0.090),
    "PR-LN330": dict(cat="Premium", peso=0.06, canal="bar", cresc=0.060),
    "PR-GF600": dict(cat="Premium", peso=0.04, canal="bar", cresc=0.030),
    "SA-LT350": dict(cat="Sem álcool", peso=0.025, canal="casa", cresc=0.300, inicio="2022-03-01"),
    "SA-LN355": dict(cat="Sem álcool", peso=0.015, canal="bar", cresc=0.250, inicio="2022-03-01"),
}

# meses de Carnaval (fevereiro ou março)
CARNAVAL = {2018: 2, 2019: 3, 2020: 2, 2021: None, 2022: None, 2023: 2, 2024: 2, 2025: 3}

VOLUME_NACIONAL = 60_000  # mil litros por mês em jan/2018, ordem de grandeza


def sazonalidade(r):
    """Efeito multiplicativo de calendário de uma região, mês a mês."""
    verao = np.cos(2 * np.pi * (mes - 1.5) / 12)  # pico entre janeiro e fevereiro
    efeito = 1 + 0.20 * r["saz"] * verao
    efeito *= 1 + r["sao_joao"] * (mes == 6)
    efeito *= 1 - r["inverno"] * np.isin(mes, [6, 7, 8])
    carn = np.array([CARNAVAL.get(a) == m for a, m in zip(ano, mes)])
    efeito *= 1 + 0.08 * carn
    return efeito


def choque_pandemia(canal):
    """Bares fechados em 2020: o bar cai, a casa sobe um pouco."""
    efeito = np.ones(n)
    meses = {"2020-04": 0.45, "2020-05": 0.50, "2020-06": 0.65, "2020-07": 0.80,
             "2020-08": 0.88, "2020-09": 0.93, "2021-03": 0.85, "2021-04": 0.88}
    for d, f in meses.items():
        i = np.where(datas == pd.Timestamp(d + "-01"))[0][0]
        efeito[i] = f if canal == "bar" else 1 + (1 - f) * 0.12
    return efeito


copa = np.isin(datas, pd.to_datetime(["2022-11-01", "2022-12-01"])) * 0.06 + 1
tendencia_nacional = 1 + 0.012 * t / 12  # +1,2% ao ano

linhas = []
for regiao, r in REGIOES.items():
    saz = sazonalidade(r)
    # cada região tem um ritmo de crescimento um pouco diferente
    ritmo = 1 + rng.normal(0, 0.008) * t / 12
    for sku, s in SKUS.items():
        base = VOLUME_NACIONAL * r["peso"] * s["peso"]
        # SKU lançado depois de 2018 cresce a partir do lançamento
        t0 = np.where(datas == pd.Timestamp(s["inicio"]))[0][0] if "inicio" in s else 0
        cresc = (1 + s["cresc"]) ** (np.maximum(t - t0, 0) / 12)
        nivel = base * cresc * tendencia_nacional * ritmo * saz * copa * choque_pandemia(s["canal"])
        # SKU pequeno é mais ruidoso
        sd = 0.04 + 0.05 / np.sqrt(base / 100)
        ruido = np.exp(rng.normal(0, sd, n) - sd**2 / 2)
        # promoções pontuais: alguns meses com +15% a +30%
        promo = 1 + (rng.random(n) < 0.04) * rng.uniform(0.15, 0.30, n)
        y = nivel * ruido * promo
        if "inicio" in s:
            # rampa de lançamento: começa pequeno e chega ao nível em 10 meses
            rampa = np.clip((t - t0 + 1) / 10, 0, 1) ** 1.5
            y = np.where(t < t0, np.nan, y * rampa)
        linhas.append(pd.DataFrame({
            "data": datas, "regiao": regiao, "categoria": s["cat"], "sku": sku,
            "vendas": np.round(y, 1),
        }))

df = pd.concat(linhas, ignore_index=True).dropna(subset=["vendas"])
saida = Path(__file__).resolve().parent.parent / "cerveja_vendas.csv"
df.to_csv(saida, index=False)
print(f"{len(df)} linhas, {df.groupby(['regiao', 'sku']).ngroups} séries de base -> {saida}")
