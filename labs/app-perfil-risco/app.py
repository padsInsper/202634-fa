"""Perfil de risco e recomendação de ativos: app individual do Lab 3 (Shiny for Python).

Cada aluno responde a um formulário curto (loterias estilo Kahneman para medir aversão a
risco, horizonte de investimento e preferência de diversificação) e, ao clicar em "Calcular
recomendação", o app devolve uma recomendação de ativos do catálogo com base na relação
risco-retorno do período (janela que depende do horizonte) e na correlação entre as séries.
As justificativas de cada ativo são calculadas na hora.

Roda local (`shiny run labs/app-perfil-risco/app.py`) e embutido no site via shinylive
(Pyodide, no navegador). Não usa `yfinance`: lê os retornos pré-baixados de
`dados_carteira.csv` (o mesmo do app Monte sua Carteira).
"""
from pathlib import Path

import numpy as np
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
from shiny import App, reactive, render, ui
from shinywidgets import output_widget, render_widget

BENCH = "^BVSP"
RF_ANUAL = 0.10  # taxa livre de risco anual usada no Sharpe (Selic de referência)

INSPER_RED = "#E50505"
INSPER_TURQUESA = "#3ACC9F"
INSPER_AMARELO = "#FFCC00"
INSPER_ROXO = "#730D9F"
INSPER_GRAY = "#5B5B5B"

# Loterias estilo Holt-Laury: a "chance alta" p cresce a cada decisão. A é sempre a opção
# segura (payoffs próximos) e B a arriscada (payoffs distantes). Mais escolhas seguras =
# mais aversão a risco.
LOTERIAS = [0.10, 0.30, 0.50, 0.70, 0.90, 1.00]

# Horizonte -> janela (meses) usada para medir risco-retorno. Curto prazo olha o passado
# recente; longo prazo usa uma janela mais longa.
HORIZONTE_MESES = {"curto": 6, "medio": 12, "longo": 24}
TAM_CARTEIRA = {"concentrada": 3, "equilibrada": 5, "diversificada": 7}


def perfil_de(n_safe: int):
    """Número de escolhas seguras (0 a 6) -> (rótulo do perfil, lambda da utilidade)."""
    if n_safe <= 1:
        return ("Arrojado", 2.5)
    if n_safe <= 3:
        return ("Moderado", 6.0)
    return ("Conservador", 14.0)


def _load_returns() -> pd.DataFrame:
    """Lê o CSV empacotado. No shinylive ele é montado em 'dados_carteira.csv'."""
    candidatos = ["dados_carteira.csv"]
    try:
        candidatos.append(str(Path(__file__).with_name("dados_carteira.csv")))
    except NameError:
        pass
    candidatos.append("labs/app-perfil-risco/dados_carteira.csv")
    for c in candidatos:
        p = Path(c)
        if p.exists():
            return pd.read_csv(p, index_col=0, parse_dates=True)
    raise FileNotFoundError("dados_carteira.csv não encontrado em: " + ", ".join(candidatos))


RETORNOS = _load_returns()

# Nome das empresas/fundos por setor (só rótulos; o universo é o que está no CSV)
CATALOGO = {
    "Fundos imobiliários (FIIs)": {
        "HGRE11.SA": "CSHG Real Estate", "BTLG11.SA": "BTG Pactual Logística",
        "HGRU11.SA": "CSHG Renda Urbana", "VGIR11.SA": "Valora CRI",
        "KNRI11.SA": "Kinea Renda Imobiliária", "KNCR11.SA": "Kinea Rendimentos",
        "MXRF11.SA": "Maxi Renda", "HGLG11.SA": "CSHG Logística",
        "XPML11.SA": "XP Malls", "VISC11.SA": "Vinci Shopping Centers",
        "HGCR11.SA": "CSHG Recebíveis", "RECT11.SA": "REC Renda Imobiliária",
    },
    "Bancos e financeiro": {
        "ITUB4.SA": "Itaú Unibanco", "BBDC4.SA": "Bradesco", "BBAS3.SA": "Banco do Brasil",
        "SANB11.SA": "Santander Brasil", "ITSA4.SA": "Itaúsa", "B3SA3.SA": "B3 (bolsa)",
        "BPAC11.SA": "BTG Pactual",
    },
    "Commodities e materiais": {
        "PETR4.SA": "Petrobras (PN)", "PETR3.SA": "Petrobras (ON)", "VALE3.SA": "Vale",
        "PRIO3.SA": "PRIO (PetroRio)", "CSNA3.SA": "CSN", "GGBR4.SA": "Gerdau",
        "SUZB3.SA": "Suzano", "KLBN11.SA": "Klabin", "BRAP4.SA": "Bradespar",
        "CMIN3.SA": "CSN Mineração",
    },
    "Consumo e varejo": {
        "ABEV3.SA": "Ambev", "MGLU3.SA": "Magazine Luiza", "LREN3.SA": "Lojas Renner",
        "ASAI3.SA": "Assaí", "PCAR3.SA": "Pão de Açúcar", "NTCO3.SA": "Natura",
        "RADL3.SA": "Raia Drogasil", "CRFB3.SA": "Carrefour Brasil",
    },
    "Indústria e serviços": {
        "WEGE3.SA": "WEG", "EMBR3.SA": "Embraer", "RENT3.SA": "Localiza",
        "RAIL3.SA": "Rumo", "TOTS3.SA": "Totvs", "VIVT3.SA": "Vivo (Telefônica)",
    },
    "Energia e utilities": {
        "ELET3.SA": "Eletrobras", "EGIE3.SA": "Engie Brasil", "CPLE6.SA": "Copel",
        "TAEE11.SA": "Taesa", "SBSP3.SA": "Sabesp", "CMIG4.SA": "Cemig",
        "EQTL3.SA": "Equatorial",
    },
    "Saúde": {
        "RDOR3.SA": "Rede D'Or", "HAPV3.SA": "Hapvida", "FLRY3.SA": "Fleury",
    },
    "Exterior (exemplos)": {
        "AAPL": "Apple", "MSFT": "Microsoft", "AMZN": "Amazon",
        "GOOGL": "Alphabet (Google)", "KO": "Coca-Cola",
    },
}
NOMES = {tk: nm for g in CATALOGO.values() for tk, nm in g.items()}
SETOR = {tk: grupo for grupo, d in CATALOGO.items() for tk in d}


def curto(tk: str) -> str:
    return tk.replace(".SA", "")


def nome_ativo(tk: str) -> str:
    nm = NOMES.get(tk)
    return f"{nm} ({curto(tk)})" if nm else tk


def loterias_ui():
    itens = []
    for i, p in enumerate(LOTERIAS):
        itens.append(ui.input_radio_buttons(
            f"lot{i}", f"Decisão {i + 1}: chance alta = {p:.0%}",
            choices={
                "A": f"Seguro: {p:.0%} → R$ 40, senão R$ 32",
                "B": f"Arriscado: {p:.0%} → R$ 77, senão R$ 2",
            },
            selected="A",
        ))
    return itens


NOTA_METODOLOGICA = """
**Perfil de risco (λ).** As loterias são do tipo Holt-Laury: a cada decisão, a chance do
prêmio alto cresce. O número de escolhas seguras é convertido num coeficiente de aversão a
risco λ da utilidade média-variância sobre o retorno excedente ao rf

U = (μ - rf) - (λ / 2) · σ²

onde μ é o retorno esperado, rf a taxa livre de risco e σ² a variância. λ alto penaliza
mais o risco. Mapa usado: 0 a
1 escolhas seguras = Arrojado (λ = 2,5); 2 a 3 = Moderado (λ = 6); 4 a 6 = Conservador (λ =
14). É uma calibração didática, não uma estimativa formal de aversão relativa (CRRA).

**Métricas (na janela do horizonte).** Para cada ativo, a partir dos retornos diários da
janela: retorno anual = média × 252; volatilidade anual = desvio padrão × √252; Sharpe =
(retorno anual menos rf) / volatilidade, com rf = 10% a.a. A correlação é a de Pearson,
calculada par a par (aproveitando todos os dias disponíveis de cada par).

**Recomendação.** Primeiro filtramos os ativos que **batem a taxa livre de risco** no
período (Sharpe positivo), para não sugerir um ativo de baixa volatilidade que rendeu menos
que o rf só por ser pouco volátil. Cada ativo elegível recebe a utilidade U calculada com o
seu λ. Os ativos são ranqueados por U e selecionados por um procedimento guloso que,
conforme a sua preferência de diversificação, penaliza correlação positiva (ativos pouco
correlacionados) ou premia correlação negativa (hedge). O tamanho da carteira vem da sua
resposta. Os ativos do exterior usam dias de pregão próprios, então entram quando têm
histórico suficiente na janela.

**Referências.**

- Kahneman, D., e Tversky, A. (1979). Prospect Theory: An Analysis of Decision under Risk. *Econometrica*.
- Holt, C. A., e Laury, S. K. (2002). Risk Aversion and Incentive Effects. *American Economic Review*.
- Markowitz, H. (1952). Portfolio Selection. *Journal of Finance*.
- Sharpe, W. F. (1964). Capital Asset Prices: A Theory of Market Equilibrium under Conditions of Risk. *Journal of Finance*.

Material didático do Lab 3 de Financial Analytics. Não é recomendação de investimento.
"""


# ---------------------------------------------------------------- UI
app_ui = ui.page_fluid(
    ui.h2("Perfil de risco e recomendação de ativos"),
    ui.markdown(
        "Responda ao formulário, clique em **Calcular recomendação** e o app estima o seu "
        "**perfil de risco** e sugere automaticamente um conjunto de ativos do catálogo, "
        "com base na relação risco-retorno do período e na correlação entre as séries."
    ),
    ui.accordion(
        ui.accordion_panel(
            "Formulário (clique no título para abrir ou fechar)",
            ui.card(
                ui.card_header("1. Seu perfil de risco (loterias)"),
                ui.markdown(
                    "Em cada decisão, escolha entre uma aposta **segura** (A) e uma "
                    "**arriscada** (B). Quanto mais vezes você fica no seguro, mais avesso "
                    "ao risco é o seu perfil."
                ),
                ui.layout_columns(*loterias_ui(), col_widths=(4, 4, 4, 4, 4, 4)),
            ),
            ui.card(
                ui.card_header("2. Horizonte e diversificação"),
                ui.layout_columns(
                    ui.input_radio_buttons(
                        "horizonte", "Você investe pensando no:",
                        choices={
                            "curto": "Curto prazo (até ~1 ano)",
                            "medio": "Médio prazo (1 a 2 anos)",
                            "longo": "Longo prazo (2 anos ou mais)",
                        },
                        selected="longo",
                    ),
                    ui.input_radio_buttons(
                        "tamanho", "Quantos ativos quer na carteira?",
                        choices={
                            "concentrada": "Concentrar (cerca de 3)",
                            "equilibrada": "Equilibrar (cerca de 5)",
                            "diversificada": "Diversificar (cerca de 7)",
                        },
                        selected="equilibrada",
                    ),
                    ui.input_radio_buttons(
                        "correlacao", "Sobre como os ativos se movem juntos:",
                        choices={
                            "baixa": "Pouco correlacionados (se compensam e reduzem risco)",
                            "negativa": "Negativamente correlacionados (sentidos opostos, hedge)",
                            "tanto": "Não tenho preferência por correlação",
                        },
                        selected="baixa",
                    ),
                    col_widths=(4, 4, 4),
                ),
            ),
            ui.card(
                ui.card_header("3. Curiosidade: enquadramento (opcional, não afeta a recomendação)"),
                ui.markdown(
                    "As duas decisões abaixo têm o **mesmo valor esperado**. Veja se você "
                    "muda de atitude entre ganhos e perdas (efeito reflexão de Kahneman e "
                    "Tversky)."
                ),
                ui.layout_columns(
                    ui.input_radio_buttons(
                        "frame_ganho", "Cenário de ganhos: você prefere",
                        choices={"seguro": "Receber R$ 1.000 garantidos",
                                 "aposta": "50% de ganhar R$ 2.000 (50% de nada)"},
                        selected="seguro",
                    ),
                    ui.input_radio_buttons(
                        "frame_perda", "Cenário de perdas: você prefere",
                        choices={"seguro": "Perder R$ 1.000 garantidos",
                                 "aposta": "50% de perder R$ 2.000 (50% de nada)"},
                        selected="aposta",
                    ),
                    col_widths=(6, 6),
                ),
                ui.output_ui("nota_frame"),
            ),
            ui.input_action_button("calcular", "Calcular recomendação",
                                    class_="btn-primary btn-lg"),
            value="form",
        ),
        id="acc_form", open="form",
    ),
    ui.output_ui("aviso"),
    ui.layout_columns(
        ui.value_box("Perfil de risco", ui.output_text("vb_perfil")),
        ui.value_box("Aversão (λ)", ui.output_text("vb_lambda")),
        ui.value_box("Janela analisada", ui.output_text("vb_janela")),
        ui.value_box("Correlação média sugerida", ui.output_text("vb_corr")),
        fill=False,
    ),
    ui.card(
        ui.card_header("Ativos recomendados para o seu perfil"),
        ui.output_ui("tabela_reco"),
        ui.markdown(
            "_As recomendações têm fins didáticos e não representam uma recomendação de "
            "investimento real._"
        ),
    ),
    ui.layout_columns(
        ui.card(ui.card_header("Risco x retorno no período (catálogo e recomendados)"),
                output_widget("plot_rr")),
        ui.card(ui.card_header("Correlação dos ativos recomendados"),
                output_widget("plot_corr")),
        col_widths=(7, 5),
    ),
    ui.card(
        ui.card_header("Para apresentar (leia em voz alta se for sorteado)"),
        ui.output_ui("resumo_apresentar"),
    ),
    ui.card(
        ui.card_header("Nota metodológica"),
        ui.markdown(NOTA_METODOLOGICA),
    ),
    title="Lab 3: Perfil de risco",
)


# ---------------------------------------------------------------- server
def server(input, output, session):

    @reactive.effect
    @reactive.event(input.calcular)
    def _colapsa_form():
        # ao calcular, fecha o formulário para destacar o resultado
        ui.update_accordion("acc_form", show=False)

    @reactive.calc
    @reactive.event(input.calcular)
    def respostas():
        """Captura as respostas no momento do clique em Calcular (não a cada mudança)."""
        nsafe = 0
        for i in range(len(LOTERIAS)):
            try:
                if input[f"lot{i}"]() == "A":
                    nsafe += 1
            except Exception:
                pass
        nome, lam = perfil_de(nsafe)
        horizonte = input.horizonte()
        return dict(
            nsafe=nsafe, nome=nome, lam=lam, horizonte=horizonte,
            janela=HORIZONTE_MESES.get(horizonte, 24),
            N=TAM_CARTEIRA.get(input.tamanho(), 5),
            correlacao=input.correlacao(),
        )

    @reactive.calc
    def dados():
        """Retornos da janela, só com ativos do catálogo que têm histórico suficiente."""
        r = respostas()
        n = min(r["janela"] * 21, len(RETORNOS))
        d = RETORNOS.tail(n)
        cols = [c for c in d.columns if c != BENCH and c in NOMES]
        da = d[cols]
        minimo = max(20, len(da) // 2)
        validos = [c for c in cols if da[c].notna().sum() >= minimo]
        return da[validos]

    @reactive.calc
    def metricas():
        da = dados()
        ret_a = da.mean() * 252           # mean/std ignoram NaN
        vol_a = da.std() * np.sqrt(252)
        sharpe = (ret_a - RF_ANUAL) / vol_a
        return pd.DataFrame({"ret": ret_a, "vol": vol_a, "sharpe": sharpe})

    @reactive.calc
    def recomendacao():
        r = respostas()
        m = metricas()
        da = dados()
        if len(m) < 2:
            return []
        N = min(r["N"], len(m))
        # só considera ativos que batem a taxa livre de risco (Sharpe > 0);
        # se faltar, relaxa para os de maior Sharpe. Evita recomendar ativos
        # de baixa vol que renderam menos que o rf só por serem pouco voláteis.
        pool = list(m.index[m["sharpe"] > 0])
        if len(pool) < N:
            pool = list(m["sharpe"].sort_values(ascending=False).head(max(N, 8)).index)
        mm = m.loc[pool]
        # utilidade média-variância sobre o retorno EXCEDENTE ao rf
        u = (mm["ret"] - RF_ANUAL) - 0.5 * r["lam"] * mm["vol"] ** 2
        un = (u - u.min()) / (u.max() - u.min() + 1e-9)   # normaliza para 0..1
        C = da[pool].corr()                               # correlação pairwise (no pool)

        modo = r["correlacao"]
        if modo == "baixa":
            div_w, agg = 0.6, "maxpos"     # penaliza correlação positiva alta
        elif modo == "negativa":
            div_w, agg = 0.9, "mean"       # premia correlação média negativa
        else:
            div_w, agg = 0.0, "none"

        restantes = list(un.index)
        escolhidos = [un.idxmax()]
        restantes.remove(escolhidos[0])
        while len(escolhidos) < N and restantes:
            melhor, melhor_val = None, -1e9
            for c in restantes:
                corrs = [float(C.loc[c, s]) for s in escolhidos]
                if agg == "maxpos":
                    pen = max(max(corrs), 0.0)
                elif agg == "mean":
                    pen = float(np.mean(corrs))   # pode ser negativo => bônus
                else:
                    pen = 0.0
                val = un[c] - div_w * pen
                if val > melhor_val:
                    melhor_val, melhor = val, c
            escolhidos.append(melhor)
            restantes.remove(melhor)
        return escolhidos

    def justificativa(tk, m, escolhidos, C):
        r = m.loc[tk]
        frac_vol_menor = float((m["vol"] < r["vol"]).mean())
        frac_sharpe_maior = float((m["sharpe"] > r["sharpe"]).mean())
        outros = [s for s in escolhidos if s != tk]
        maxcorr = max((float(C.loc[tk, s]) for s in outros), default=float("nan"))
        motivos = []
        if frac_vol_menor <= 0.25:
            motivos.append("baixa volatilidade no período (entre as menores do catálogo)")
        if frac_sharpe_maior <= 0.25:
            motivos.append("ótima relação risco-retorno (Sharpe entre os melhores)")
        if r["ret"] >= m["ret"].quantile(0.75):
            motivos.append("retorno elevado no período")
        if not np.isnan(maxcorr):
            if maxcorr < 0:
                motivos.append(f"correlação negativa (corr. máx {maxcorr:.2f}) com algum dos demais, funciona como hedge")
            elif maxcorr < 0.4:
                motivos.append(f"baixa correlação (corr. máx {maxcorr:.2f}) com os demais, ajuda a diversificar")
        if not motivos:
            motivos.append("bom equilíbrio risco-retorno para o seu perfil")
        return motivos, maxcorr

    @reactive.calc
    def corr_media():
        da = dados()
        esc = recomendacao()
        if len(esc) < 2:
            return float("nan")
        C = da[esc].corr().values
        iu = np.triu_indices(len(esc), k=1)
        return float(np.nanmean(C[iu]))

    pronto = lambda: input.calcular() > 0

    @render.ui
    def aviso():
        if pronto():
            return ui.div()
        return ui.div(
            ui.markdown("**Preencha o formulário acima e clique em _Calcular recomendação_.**"),
            class_="alert alert-secondary", role="status",
        )

    @render.text
    def vb_perfil():
        return respostas()["nome"] if pronto() else "-"

    @render.text
    def vb_lambda():
        return f"{respostas()['lam']:g}" if pronto() else "-"

    @render.text
    def vb_janela():
        return f"{respostas()['janela']} meses" if pronto() else "-"

    @render.text
    def vb_corr():
        if not pronto():
            return "-"
        c = corr_media()
        return "-" if np.isnan(c) else f"{c:.2f}"

    @render.ui
    def tabela_reco():
        if not pronto():
            return ui.p(ui.tags.em("A recomendação aparece aqui após calcular."))
        esc = recomendacao()
        if not esc:
            return ui.p(ui.tags.em("Sem dados suficientes na janela escolhida."))
        m = metricas()
        C = dados().corr()
        linhas = []
        for k, tk in enumerate(esc, start=1):
            motivos, _ = justificativa(tk, m, esc, C)
            r = m.loc[tk]
            linhas.append(ui.tags.tr(
                ui.tags.td(ui.tags.strong(f"{k}")),
                ui.tags.td(nome_ativo(tk)),
                ui.tags.td(SETOR.get(tk, "")),
                ui.tags.td(f"{r['ret'] * 100:.1f}%"),
                ui.tags.td(f"{r['vol'] * 100:.1f}%"),
                ui.tags.td(f"{r['sharpe']:.2f}"),
                ui.tags.td("; ".join(motivos)),
            ))
        cabecalho = ui.tags.tr(*[ui.tags.th(h) for h in
                                 ["#", "Ativo", "Setor", "Retorno (a.a.)",
                                  "Vol. (a.a.)", "Sharpe", "Por que entrou"]])
        return ui.tags.table(
            ui.tags.thead(cabecalho), ui.tags.tbody(*linhas),
            class_="table table-sm table-striped", style="font-size:0.92rem;",
        )

    @render_widget
    def plot_rr():
        if not pronto():
            return go.Figure().update_layout(template="plotly_white")
        m = metricas()
        if len(m) < 2:
            return go.Figure().update_layout(template="plotly_white")
        esc = set(recomendacao())
        cores = [INSPER_RED if tk in esc else INSPER_GRAY for tk in m.index]
        tamanhos = [13 if tk in esc else 7 for tk in m.index]
        textos = [curto(tk) if tk in esc else "" for tk in m.index]
        fig = go.Figure()
        fig.add_trace(go.Scatter(
            x=m["vol"] * 100, y=m["ret"] * 100, mode="markers+text",
            text=textos, textposition="top center",
            marker=dict(size=tamanhos, color=cores, opacity=0.85),
            hovertext=[nome_ativo(tk) for tk in m.index],
            hovertemplate="%{hovertext}<br>risco %{x:.1f}%<br>retorno %{y:.1f}%<extra></extra>",
        ))
        fig.update_layout(template="plotly_white", xaxis_title="Risco anual (%)",
                          yaxis_title="Retorno anual (%)",
                          margin=dict(t=10, r=10, l=10, b=10), showlegend=False)
        return fig

    @render_widget
    def plot_corr():
        if not pronto():
            return go.Figure().update_layout(template="plotly_white")
        esc = recomendacao()
        if len(esc) < 2:
            return go.Figure().update_layout(template="plotly_white")
        C = dados()[esc].corr()
        labels = [curto(tk) for tk in esc]
        fig = px.imshow(C.values, x=labels, y=labels, text_auto=".2f",
                        color_continuous_scale=[INSPER_TURQUESA, "#FFFFFF", INSPER_RED],
                        zmin=-1, zmax=1, template="plotly_white")
        fig.update_layout(margin=dict(t=10, r=10, l=10, b=10))
        return fig

    @render.ui
    def resumo_apresentar():
        if not pronto():
            return ui.p(ui.tags.em("O texto para apresentação aparece aqui após calcular."))
        esc = recomendacao()
        if not esc:
            return ui.div()
        r = respostas()
        horizonte_txt = {"curto": "curto prazo", "medio": "médio prazo",
                         "longo": "longo prazo"}[r["horizonte"]]
        div_txt = {
            "baixa": "ativos pouco correlacionados, que se compensam",
            "negativa": "ativos negativamente correlacionados, como hedge",
            "tanto": "sem restrição de correlação",
        }[r["correlacao"]]
        c = corr_media()
        lista = ", ".join(curto(tk) for tk in esc)
        m = metricas()
        C = dados().corr()
        destaque = esc[0]
        motivos_destaque, _ = justificativa(destaque, m, esc, C)
        corr_frase = ("" if np.isnan(c) else
                      f" A correlação média entre eles é {c:.2f} "
                      f"({'baixa, então tendem a se compensar' if c < 0.5 else 'mais alta, então se movem juntos'}).")
        return ui.markdown(
            f"Meu perfil de risco é **{r['nome']}** (λ = {r['lam']:g}). Como penso no "
            f"**{horizonte_txt}**, a análise olhou os **últimos {r['janela']} meses** e "
            f"prioriza **{div_txt}**. A recomendação automática para uma carteira de "
            f"**{len(esc)} ativos** é: **{lista}**. O destaque é **{nome_ativo(destaque)}**, "
            f"por {motivos_destaque[0]}.{corr_frase}"
        )

    @render.ui
    def nota_frame():
        try:
            g = input.frame_ganho()
            pp = input.frame_perda()
        except Exception:
            return ui.div()
        if g == "seguro" and pp == "aposta":
            txt = ("Você exibiu o **efeito reflexão**: avesso ao risco nos ganhos e propenso "
                   "nas perdas. É a marca da **aversão à perda** da teoria do prospecto.")
            cor = INSPER_ROXO
        elif g == "aposta" and pp == "seguro":
            txt = ("Atitude invertida em relação ao padrão usual: propenso nos ganhos e avesso "
                   "nas perdas. Vale discutir o que motivou cada escolha.")
            cor = INSPER_GRAY
        else:
            txt = ("Você manteve a mesma atitude nos dois cenários. Boa parte das pessoas "
                   "troca de lado: esse é o ponto da teoria do prospecto.")
            cor = INSPER_GRAY
        return ui.div(ui.markdown(txt), style=f"border-left:4px solid {cor};padding-left:10px;")


app = App(app_ui, server)
