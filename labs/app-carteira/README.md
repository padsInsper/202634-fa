# Monte sua Carteira (app do Lab 3)

App interativo da dinâmica do Lab 3, em **Shiny for Python**. Roda de duas formas:

1. **No site, dentro do navegador** (shinylive, sem servidor): página
   [`labs/app-carteira.qmd`](../app-carteira.qmd). O Python sobe no navegador via Pyodide
   e os dados vêm de um catálogo da B3 já embarcado.
2. **Local** (mesmo app, sem a espera do shinylive):
   ```bash
   shiny run labs/app-carteira/app.py
   ```
   e abra <http://127.0.0.1:8000>.

Os grupos escolhem ativos (buscando por nome), mexem nos pesos e veem ao vivo retorno,
volatilidade, Sharpe, VaR, a fronteira eficiente, o backtest contra o Ibovespa e a matriz
de correlação.

## Arquivos

| Arquivo | Para que serve |
|---|---|
| `app.py` | O app (sem `yfinance`/`arch`; lê o CSV embarcado). Roda em CPython e em Pyodide. |
| `dados_carteira.csv` | Retornos pré-baixados do catálogo (lido pelo app). |
| `fetch_dados.py` | Regera o CSV via `yfinance` (rode local). |
| `build_qmd.py` | Monta `labs/app-carteira.qmd` (app + dados inline no bloco shinylive). |

## Atualizar os dados e a página

```bash
python labs/app-carteira/fetch_dados.py     # baixa retornos do catálogo -> dados_carteira.csv
python labs/app-carteira/build_qmd.py       # regenera labs/app-carteira.qmd
quarto render labs/app-carteira.qmd         # opcional: testar o render
```

Para editar os ativos do catálogo, ajuste a lista em `fetch_dados.py` e o `CATALOGO`
em `app.py`, depois rode os dois scripts acima.

## Por que não baixa ao vivo no navegador?

No shinylive tudo roda em Pyodide (WebAssembly). O `yfinance` depende do `curl_cffi`
(extensão C sem wheel no Pyodide) e o Yahoo bloquearia por CORS de qualquer forma. Por
isso os dados são embarcados. Para reativar download ao vivo de tickers arbitrários dentro
do navegador, dá para buscar a API de chart do Yahoo (`query1.finance.yahoo.com/v8/finance/chart/...`)
passando por um **proxy CORS** (por exemplo um Cloudflare Worker), parseando o JSON com
`urllib` puro, sem `yfinance`.

## Render no projeto (Windows)

O scan do Quarto lê os notebooks dos alunos e o kernel `pyvenv` precisa do `JUPYTER_PATH`.
Para renderizar a página do app:

```powershell
$env:JUPYTER_PATH = "<repo>\.jupyter_kernels"
$env:PATH = "<repo>\.venv\Scripts;" + $env:PATH   # para o CLI 'shinylive'
quarto render labs/app-carteira.qmd
```

Se o scan quebrar no YAML de algum notebook de aluno, esconda a pasta temporariamente
(prefixo `_`, ignorado pelo scan) e renderize.
