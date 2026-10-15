"""Gera dados_carteira.csv (retornos diários do catálogo) para o app shiny-live.

O app embutido no site roda no navegador (Pyodide) e não consegue usar yfinance, então
embarcamos os retornos pré-baixados deste CSV. Rode localmente quando quiser atualizar:

    python labs/app-carteira/fetch_dados.py

Mantém o arquivo enxuto: ~4 anos de histórico, retornos arredondados.
"""
from pathlib import Path

import numpy as np
import pandas as pd
import requests
import yfinance as yf

_old = requests.Session.request


def _patched(self, method, url, *args, **kwargs):
    headers = kwargs.get("headers", {}) or {}
    headers.setdefault(
        "User-Agent",
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    )
    kwargs["headers"] = headers
    return _old(self, method, url, *args, **kwargs)


requests.Session.request = _patched

# Mantém em sincronia com o CATALOGO do app.py
TICKERS = [
    # FIIs
    "HGRE11.SA", "BTLG11.SA", "HGRU11.SA", "VGIR11.SA", "KNRI11.SA", "KNCR11.SA",
    "MXRF11.SA", "HGLG11.SA", "XPML11.SA", "VISC11.SA", "HGCR11.SA", "RECT11.SA",
    # Bancos e financeiro
    "ITUB4.SA", "BBDC4.SA", "BBAS3.SA", "SANB11.SA", "ITSA4.SA", "B3SA3.SA", "BPAC11.SA",
    # Commodities e materiais
    "PETR4.SA", "PETR3.SA", "VALE3.SA", "PRIO3.SA", "CSNA3.SA", "GGBR4.SA", "SUZB3.SA",
    "KLBN11.SA", "BRAP4.SA", "CMIN3.SA",
    # Consumo e varejo
    "ABEV3.SA", "MGLU3.SA", "LREN3.SA", "ASAI3.SA", "PCAR3.SA", "NTCO3.SA", "RADL3.SA",
    "CRFB3.SA",
    # Indústria e serviços
    "WEGE3.SA", "EMBR3.SA", "RENT3.SA", "RAIL3.SA", "TOTS3.SA", "VIVT3.SA",
    # Energia e utilities
    "ELET3.SA", "EGIE3.SA", "CPLE6.SA", "TAEE11.SA", "SBSP3.SA", "CMIG4.SA", "EQTL3.SA",
    # Saúde
    "RDOR3.SA", "HAPV3.SA", "FLRY3.SA",
    # Exterior
    "AAPL", "MSFT", "AMZN", "GOOGL", "KO",
    # Benchmark
    "^BVSP",
]
START = (pd.Timestamp.today() - pd.DateOffset(years=2)).strftime("%Y-%m-%d")


def main() -> None:
    precos = yf.download(TICKERS, start=START, auto_adjust=False, progress=False)["Adj Close"]
    # retornos diários por ativo (cada coluna pode ter NaN onde o ativo não negociou)
    retornos = np.log(precos / precos.shift(1))
    # descarta dias e ativos totalmente vazios (tickers que falharam no download)
    retornos = retornos.dropna(how="all").dropna(axis=1, how="all").round(4)
    out = Path(__file__).with_name("dados_carteira.csv")
    retornos.to_csv(out)
    kb = out.stat().st_size / 1024
    print(f"Salvo {out} | {retornos.shape[1]} ativos x {retornos.shape[0]} dias | {kb:.0f} KB")


if __name__ == "__main__":
    main()
