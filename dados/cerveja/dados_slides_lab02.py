"""Exporta os números que os slides do Lab 2 desenham (recursos/dados_lab02.js).

Rodar num ambiente com statsforecast e hierarchicalforecast: python dados/cerveja/dados_slides_lab02.py
"""

import json
from pathlib import Path

import pandas as pd
from statsforecast import StatsForecast
from statsforecast.models import AutoETS

RAIZ = Path(__file__).resolve().parents[2]
vendas = pd.read_csv(RAIZ / "dados" / "cerveja_vendas.csv", parse_dates=["data"])

brasil = vendas.groupby("data").vendas.sum()
regioes = vendas.groupby(["regiao", "data"]).vendas.sum().unstack(0)

# previsões de base do AutoETS para 2025, no Brasil e em cada região, como no notebook
serie = pd.concat([
    brasil.rename("y").reset_index().assign(unique_id="Brasil"),
    *[regioes[r].rename("y").reset_index().assign(unique_id=r) for r in regioes],
]).rename(columns={"data": "ds"})
treino = serie[serie.ds < "2025-01-01"]
prev = StatsForecast(models=[AutoETS(season_length=12)], freq="MS", n_jobs=1).forecast(df=treino, h=12)
anual = prev.groupby("unique_id").AutoETS.sum() / 1000  # milhões de litros
real = serie[serie.ds >= "2025-01-01"].groupby("unique_id").y.sum() / 1000

# o total de 2025 somado a partir de cada nível da hierarquia (AutoETS em todas as 76 séries)
from hierarchicalforecast.utils import aggregate

vendas["total"] = "Brasil"
base = vendas.rename(columns={"data": "ds", "vendas": "y"})
spec = [["total"], ["total", "regiao"], ["total", "regiao", "categoria"], ["total", "regiao", "categoria", "sku"]]
Y_df, _, tags = aggregate(base[["total", "regiao", "categoria", "sku", "ds", "y"]], spec)
prev_todas = StatsForecast(models=[AutoETS(season_length=12)], freq="MS", n_jobs=1).forecast(
    df=Y_df[Y_df.ds < "2025-01-01"], h=12)
por_serie = prev_todas.groupby("unique_id").AutoETS.sum() / 1000
niveis = {nivel: round(por_serie[ids].sum(), 1) for nivel, ids in tags.items()}

saida = {
    "datas": [d.strftime("%Y-%m") for d in brasil.index],
    "brasil": [round(v, 1) for v in brasil.values],
    "regioes": {r: [round(v, 1) for v in regioes[r].values] for r in regioes},
    "ets2025": {k: round(v, 1) for k, v in anual.items()},
    "real2025": {k: round(v, 1) for k, v in real.items()},
    "ets2025_niveis": niveis,
    "real2024": {k: round(v / 1000, 1) for k, v in serie[serie.ds.dt.year == 2024].groupby("unique_id").y.sum().items()},
}
destino = RAIZ / "slides" / "lab02" / "recursos" / "dados_lab02.js"
destino.write_text("// gerado por dados/cerveja/dados_slides_lab02.py\nwindow.DADOS_LAB02 = "
                   + json.dumps(saida, ensure_ascii=False) + ";\n", encoding="utf-8")
print(json.dumps({k: saida[k] for k in ["ets2025", "ets2025_niveis", "real2025", "real2024"]}, ensure_ascii=False, indent=1))
