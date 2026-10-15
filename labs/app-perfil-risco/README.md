# App: Perfil de Risco e Recomendação de Ativos

Formulário individual da dinâmica do Lab 3. O aluno responde a loterias (estilo
Kahneman/Holt-Laury), informa horizonte e preferência de diversificação e, ao clicar em
**Calcular recomendação**, recebe um conjunto de ativos do catálogo com justificativas
calculadas a partir da relação risco-retorno do período e da correlação entre as séries.

## Rodar local

```bash
shiny run labs/app-perfil-risco/app.py
```

## Publicar no site (shinylive)

```bash
python labs/app-perfil-risco/build_qmd.py   # gera labs/app-perfil-risco.qmd
quarto render labs/app-perfil-risco.qmd      # precisa do CLI shinylive no PATH
```

## Notas

- Sem `yfinance`: usa `dados_carteira.csv` (cópia do mesmo CSV do app Monte sua Carteira;
  regenere com `labs/app-carteira/fetch_dados.py` e copie para esta pasta).
- **Encoding (Windows):** evite no código-fonte caracteres cujo UTF-8 contenha bytes
  indefinidos em cp1252 (`0x81`, `0x8D`, `0x8F`, `0x90`, `0x9D`). O `_find_imports` do
  shinylive lê o fonte com `surrogateescape` e quebra. Em particular, **não use `ρ`**
  (U+03C1 = `CF 81`) em strings. As letras `λ`, `μ`, `σ`, `√` são seguras.
- A recomendação é didática (utilidade média-variância + seleção gulosa por correlação),
  não é conselho de investimento.
