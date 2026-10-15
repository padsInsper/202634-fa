# Financial Analytics: PADS Insper (turma 2026.34)

Material da disciplina **Financial Analytics** do Programa Avançado de Data Science e Decisão (Insper), turma PADSONL08, outubro a dezembro de 2026.

**Site:** <https://padsinsper.github.io/202634-fa/>

O site é gerado com [Quarto](https://quarto.org) e publicado automaticamente no GitHub Pages a cada push na branch `main` (GitHub Actions, cerca de 5 minutos).

## Estrutura

```
_quarto.yml          configuração do site e menu de navegação
_variables.yml       valores da edição (turma, prazos, links do repositório)
cronograma.yml       sessões do curso: fonte única do Cronograma e das "Próximas sessões"
index.qmd            página inicial
cronograma.qmd       página do cronograma (usa cronograma.yml + assets/cronograma.ejs)
aulas/               uma página por tema (os números das aulas ficam só no cronograma e no menu)
labs/                labs conduzidos pelo monitor, apps shinylive (perfil de risco e carteira)
trabalhos/           enunciados do trabalho intermediário e do trabalho final
complementar/        notebooks (Colab/download) e materiais em R
slides/              slides das aulas
dados/               dados públicos usados nos trabalhos
assets/              tema, CSS, templates do cronograma, logos
```

| Sessão | Página |
|---|---|
| Aulas 1 e 2 | `aulas/fundamentos.qmd` |
| Aulas 3 e 4 | `aulas/arima.qmd` |
| Aula 5 | `aulas/sarima-prophet.qmd` |
| Aula 6 | `aulas/previsao.qmd` |
| Aula 7 | `aulas/fechamento-parte1.qmd` |
| Aula 8 | `aulas/retornos.qmd` |
| Aula 9 | `aulas/volatilidade.qmd` |
| Aula 10 | `aulas/var.qmd` |
| Aula 11 | `aulas/portfolios.qmd` |
| Aula 12 | `aulas/avancados.qmd` |
| Labs 1 a 4 | `labs/lab01-exploracao.qmd`, `labs/lab02-pipeline.qmd`, `labs/lab03-financeiras.qmd` (Labs 3 e 4), `labs/lab04-carteira.qmd` |

## Como adicionar slides de uma aula

Dá para fazer tudo pela interface web do GitHub, sem instalar nada:

1. Abra a pasta [`slides/`](slides/) e use **Add file → Upload files** para enviar o arquivo (de preferência PDF, por exemplo `slides/aula01-fundamentos.pdf`). Faça o commit direto na `main`.
2. Abra o [`cronograma.yml`](cronograma.yml), clique no lápis (**Edit**) e, na sessão correspondente, troque `slides: []` por:

   ```yaml
     slides:
       - texto: "Slides da aula"
         href: slides/aula01-fundamentos.pdf
   ```

   Links externos também funcionam (Google Slides, Canva etc.): basta colocar a URL completa em `href`.
3. Faça o commit. Em alguns minutos o botão dos slides aparece no card da aula no [Cronograma](https://padsinsper.github.io/202634-fa/cronograma.html).

Arquivos `.pdf` e `.pptx` dentro de `slides/` são publicados automaticamente no site.

## Como rodar localmente

Requer [uv](https://docs.astral.sh/uv/) e [Quarto](https://quarto.org/docs/get-started/).

```bash
git clone https://github.com/padsInsper/202634-fa.git
cd 202634-fa
uv sync
uv run quarto preview
```

As páginas com código usam `freeze: auto`: o resultado da execução fica em `_freeze/` e o GitHub Actions reaproveita esse resultado. Ao alterar uma página com código Python, renderize-a localmente (`uv run quarto render aulas/arquivo.qmd`) e faça commit da pasta `_freeze/` correspondente. As páginas em R são executadas no GitHub Actions.

## Checklist para uma nova edição

1. Criar o repositório novo a partir deste (sem histórico de alunos).
2. Atualizar `_variables.yml` (turma, período, prazos, links do repositório).
3. Reescrever `cronograma.yml` com as datas da nova planilha de aulas.
4. Em `_quarto.yml`: `site-url`, `repo-url`, link do GitHub na navbar, rodapé e rótulos "Aula N" do menu (procure por `EDICAO`).
5. Trocar `202634-fa` pelo novo nome em todo o repositório (`grep -rl 202634-fa`): links em URLs, blocos de código e notebooks são literais, porque o Quarto não aceita `{{< var >}}` nesses lugares.
6. Ativar o GitHub Pages com origem **GitHub Actions** e dar acesso de escrita à equipe docente.
