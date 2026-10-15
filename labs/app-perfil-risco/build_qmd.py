"""Monta labs/app-perfil-risco.qmd (app shinylive embutido) a partir de app.py + dados.

Rode depois de editar app.py ou regenerar os dados:

    python labs/app-perfil-risco/build_qmd.py
"""
from pathlib import Path

AQUI = Path(__file__).parent
RAIZ = AQUI.parent.parent  # repo root
DESTINO = RAIZ / "labs" / "app-perfil-risco.qmd"

app_code = (AQUI / "app.py").read_text(encoding="utf-8")
csv_text = (AQUI / "dados_carteira.csv").read_text(encoding="utf-8")

CABECALHO = '''---
title: "App: Perfil de Risco e Recomendação de Ativos"
subtitle: "Formulário individual do Lab 3 (shinylive)"
format:
  html:
    toc: false
filters:
  - shinylive
---

Formulário individual da dinâmica do Lab 3, rodando **inteiramente no seu navegador** (via
shinylive, sem servidor). Você responde às perguntas (perfil de risco, horizonte e
diversificação) e o app recomenda automaticamente um conjunto de ativos do catálogo, com
justificativas calculadas a partir da relação risco-retorno do período e da correlação
entre as séries.

::: {.callout-tip}
## Como funciona a dinâmica

1. **Cada aluno** preenche o seu formulário e gera a sua recomendação.
2. O monitor **sorteia uma pessoa** para apresentar o resultado (a leitura do bloco "Para
   apresentar" serve de roteiro).
3. Depois desse aquecimento, separamos os **grupos** para discutir e convergir para uma
   carteira, que vira ponto de partida do trabalho final.
:::

::: {.callout-note appearance="minimal"}
A primeira carga baixa o Python para o navegador e pode levar alguns segundos. Os dados são
pré-baixados (catálogo de ativos da B3 e alguns exemplos do exterior). A recomendação é um
ponto de partida didático, não é conselho de investimento.
:::

'''

# A div .column-screen-inset deixa só esta célula com a largura (quase) total da página.
# https://quarto.org/docs/authoring/article-layout.html#page-column
bloco = ["::: {.column-screen-inset}", ""]
bloco += ["```{shinylive-python}", "#| standalone: true", "#| viewerHeight: 1500", ""]
bloco.append(app_code.rstrip("\n"))
bloco.append("")
bloco.append("## file: dados_carteira.csv")
bloco.append(csv_text.rstrip("\n"))
bloco.append("```")
bloco += ["", ":::", ""]

DESTINO.write_text(CABECALHO + "\n".join(bloco), encoding="utf-8")
kb = DESTINO.stat().st_size / 1024
print(f"Gerado {DESTINO} ({kb:.0f} KB)")
