"""Monta labs/app-carteira.qmd (app shinylive embutido) a partir de app.py + dados.

O bloco {shinylive-python} precisa conter o código do app e os arquivos de dados inline
(diretiva `## file:`). Este gerador junta tudo, para você não copiar nada à mão. Rode
depois de editar app.py ou regenerar os dados:

    python labs/app-carteira/build_qmd.py
"""
from pathlib import Path

AQUI = Path(__file__).parent
RAIZ = AQUI.parent.parent  # repo root
DESTINO = RAIZ / "labs" / "app-carteira.qmd"

app_code = (AQUI / "app.py").read_text(encoding="utf-8")
csv_text = (AQUI / "dados_carteira.csv").read_text(encoding="utf-8")

CABECALHO = '''---
title: "App: Monte sua Carteira"
subtitle: "Dinâmica do Lab 3 rodando no navegador (shinylive)"
format:
  html:
    toc: false
filters:
  - shinylive
---

Este é o app interativo da dinâmica do Lab 3, rodando **inteiramente no seu navegador**
(via shinylive, sem servidor). Escolha ativos pelo nome, mexa nos pesos e veja ao vivo o
retorno, a volatilidade, o Sharpe, o VaR, a fronteira eficiente, o backtest contra o
Ibovespa e a matriz de correlação.

::: {.callout-note appearance="minimal"}
A primeira carga baixa o Python para o navegador e pode levar alguns segundos. Os dados
são pré-baixados (catálogo de ativos da B3); para rodar local com qualquer ticker, use
`shiny run labs/app-carteira/app.py`.
:::

'''

# A div .column-screen-inset deixa só esta célula com a largura (quase) total da
# página, mantendo o resto no layout de artigo.
# https://quarto.org/docs/authoring/article-layout.html#page-column
bloco = ["::: {.column-screen-inset}", ""]
bloco += ["```{shinylive-python}", "#| standalone: true", "#| viewerHeight: 1400", ""]
bloco.append(app_code.rstrip("\n"))
bloco.append("")
bloco.append("## file: dados_carteira.csv")
bloco.append(csv_text.rstrip("\n"))
bloco.append("```")
bloco += ["", ":::", ""]

DESTINO.write_text(CABECALHO + "\n".join(bloco), encoding="utf-8")
kb = DESTINO.stat().st_size / 1024
print(f"Gerado {DESTINO} ({kb:.0f} KB)")
