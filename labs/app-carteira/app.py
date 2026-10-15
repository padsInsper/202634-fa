"""Monte sua Carteira: app do Lab 3 (Shiny for Python, compatível com shinylive).

Roda tanto local (`shiny run labs/app-carteira/app.py`) quanto embutido no site via
shinylive (Pyodide, no navegador). Para funcionar no navegador não usa `yfinance`: lê os
retornos pré-baixados de `dados_carteira.csv` (gerado por `fetch_dados.py`).

Os grupos escolhem ativos do catálogo (buscando por nome), mexem nos pesos e veem ao vivo
retorno, volatilidade, Sharpe, VaR, a fronteira eficiente, o backtest contra o Ibovespa e
a matriz de correlação.
"""
import io
from pathlib import Path

import numpy as np
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
from shiny import App, reactive, render, ui
from shinywidgets import output_widget, render_widget

BENCH = "^BVSP"

INSPER_RED = "#E50505"
INSPER_TURQUESA = "#3ACC9F"
INSPER_ROXO = "#730D9F"
INSPER_GRAY = "#5B5B5B"


def _load_returns() -> pd.DataFrame:
    """Lê o CSV empacotado. No shinylive ele é montado em 'dados_carteira.csv'."""
    candidatos = ["dados_carteira.csv"]
    try:
        candidatos.append(str(Path(__file__).with_name("dados_carteira.csv")))
    except NameError:
        pass
    candidatos.append("labs/app-carteira/dados_carteira.csv")
    for c in candidatos:
        p = Path(c)
        if p.exists():
            return pd.read_csv(p, index_col=0, parse_dates=True)
    raise FileNotFoundError("dados_carteira.csv não encontrado em: " + ", ".join(candidatos))


RETORNOS = _load_returns()
ATIVOS_DISP = [c for c in RETORNOS.columns if c != BENCH]

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

# Só oferece o que está no CSV; mantém os grupos
CHOICES = {}
for grupo, d in CATALOGO.items():
    disp = {tk: f"{nm} ({tk.replace('.SA', '')})" for tk, nm in d.items() if tk in ATIVOS_DISP}
    if disp:
        CHOICES[grupo] = disp

DEFAULT = [a for a in ["HGRE11.SA", "BTLG11.SA", "HGRU11.SA", "VGIR11.SA"] if a in ATIVOS_DISP]
if not DEFAULT:
    DEFAULT = ATIVOS_DISP[:4]


def sid(ticker: str) -> str:
    return "w_" + ticker.replace(".", "_").replace("^", "_").replace("-", "_")


def nome_ativo(ticker: str) -> str:
    nm = NOMES.get(ticker)
    return f"{nm} ({ticker.replace('.SA', '')})" if nm else ticker


# ---------------------------------------------------------------- UI
app_ui = ui.page_sidebar(
    ui.sidebar(
        ui.input_selectize(
            "tickers", "Ativos (busque por nome ou código)",
            choices=CHOICES, selected=DEFAULT, multiple=True,
            options={"placeholder": "ex.: Petrobras, ITUB4, Vale..."},
        ),
        ui.output_ui("status_dados"),
        ui.hr(),
        ui.markdown("**Pesos** (0% remove o ativo; renormaliza para somar 100%)."),
        ui.output_ui("weight_sliders"),
        ui.input_action_button("igualar", "Igualar pesos", class_="btn-sm"),
        ui.hr(),
        ui.input_slider("rf", "Taxa livre de risco (% a.a.)", min=0, max=20, value=10, step=0.5),
        ui.input_slider("janela", "Janela (meses)", min=6, max=24,
                        value=min(24, max(6, len(RETORNOS) // 21)), step=3),
        title="Monte sua Carteira",
        width=330,
    ),
    ui.layout_columns(
        ui.value_box("Retorno (a.a.)", ui.output_text("vb_ret")),
        ui.value_box("Volatilidade (a.a.)", ui.output_text("vb_vol")),
        ui.value_box("Sharpe", ui.output_text("vb_sharpe")),
        ui.value_box("VaR 95% (dia)", ui.output_text("vb_var")),
        fill=False,
    ),
    ui.layout_columns(
        ui.card(ui.card_header("Fronteira eficiente: sua carteira vs. 3000 aleatórias"),
                output_widget("plot_fronteira")),
        ui.card(ui.card_header("Pesos (renormalizados)"), output_widget("plot_pesos")),
        col_widths=(8, 4),
    ),
    ui.layout_columns(
        ui.card(ui.card_header("Retorno acumulado da carteira vs. Ibovespa"), output_widget("plot_backtest")),
        ui.card(ui.card_header("Correlação dos ativos na carteira"), output_widget("plot_corr")),
        col_widths=(7, 5),
    ),
    title="Lab 3: Monte sua Carteira",
    fillable=True,
)


# ---------------------------------------------------------------- server
def server(input, output, session):

    @reactive.calc
    def ativos_sel():
        return list(input.tickers())

    @render.ui
    def weight_sliders():
        ativos = ativos_sel()
        if not ativos:
            return ui.p(ui.tags.em("Escolha ao menos um ativo."))
        passo = max(5, round(100 / len(ativos) / 5) * 5)
        return ui.TagList(*[
            ui.input_slider(sid(a), nome_ativo(a), min=0, max=100, value=passo, step=5, post="%")
            for a in ativos
        ])

    @render.ui
    def status_dados():
        d0 = RETORNOS.index.min().date()
        d1 = RETORNOS.index.max().date()
        return ui.tags.small(
            f"{len(ATIVOS_DISP)} ativos no catálogo | dados de {d0} a {d1}",
            style="color:#666;",
        )

    @reactive.effect
    @reactive.event(input.igualar)
    def _igualar():
        ativos = ativos_sel()
        if ativos:
            v = max(5, round(100 / len(ativos) / 5) * 5)
            for a in ativos:
                ui.update_slider(sid(a), value=v)

    @reactive.calc
    def pesos():
        ativos = ativos_sel()
        if not ativos:
            return pd.Series(dtype=float)
        raw = []
        for a in ativos:
            try:
                v = input[sid(a)]()
            except Exception:
                v = None
            raw.append(0.0 if v is None else float(v))
        raw = np.array(raw, dtype=float)
        total = raw.sum()
        if total <= 0:
            return pd.Series(0.0, index=ativos)
        return pd.Series(raw / total, index=ativos)

    @reactive.calc
    def ret_janela():
        n = int(input.janela()) * 21
        return RETORNOS.tail(n)

    @reactive.calc
    def stats_carteira():
        w = pesos()
        ativos_w = list(w[w > 0].index) if len(w) else []
        d = ret_janela()
        if not ativos_w:
            return None
        da = d[ativos_w].dropna()
        if len(da) < 5:
            return None
        wv = w[ativos_w].values
        mean_ret = da.mean().values
        cov = da.cov().values
        port_ret_d = float(wv @ mean_ret)
        port_vol_d = float(np.sqrt(wv @ cov @ wv))
        rf_d = (input.rf() / 100) / 252
        sharpe = (port_ret_d - rf_d) / port_vol_d if port_vol_d > 0 else np.nan
        port_series = (da * wv).sum(axis=1)
        var95 = -np.percentile(port_series, 5)
        return dict(
            ret_a=port_ret_d * 252, vol_a=port_vol_d * np.sqrt(252),
            sharpe=sharpe * np.sqrt(252), var=var95,
            da=da, wv=wv, mean_ret=mean_ret, cov=cov, ativos=ativos_w,
        )

    @render.text
    def vb_ret():
        s = stats_carteira()
        return "-" if s is None else f"{s['ret_a'] * 100:.1f}%"

    @render.text
    def vb_vol():
        s = stats_carteira()
        return "-" if s is None else f"{s['vol_a'] * 100:.1f}%"

    @render.text
    def vb_sharpe():
        s = stats_carteira()
        return "-" if s is None else f"{s['sharpe']:.2f}"

    @render.text
    def vb_var():
        s = stats_carteira()
        return "-" if s is None else f"{s['var'] * 100:.2f}%"

    @render_widget
    def plot_fronteira():
        s = stats_carteira()
        fig = go.Figure()
        if s is None or len(s["ativos"]) < 2:
            fig.add_annotation(text="Selecione ao menos 2 ativos com peso > 0.",
                               showarrow=False, font=dict(size=16))
            fig.update_layout(template="plotly_white")
            return fig
        rng = np.random.default_rng(42)
        W = rng.dirichlet(np.ones(len(s["ativos"])), 3000)
        rr = (W @ s["mean_ret"]) * 252 * 100
        rk = np.sqrt(np.einsum("ij,jk,ik->i", W, s["cov"], W)) * np.sqrt(252) * 100
        sh = rr / rk
        fig.add_trace(go.Scatter(
            x=rk, y=rr, mode="markers",
            marker=dict(size=4, color=sh, colorscale="Viridis", opacity=0.55,
                        showscale=True, colorbar=dict(title="Sharpe")),
            name="Aleatórias", hovertemplate="risco %{x:.1f}%<br>retorno %{y:.1f}%<extra></extra>"))
        fig.add_trace(go.Scatter(
            x=[s["vol_a"] * 100], y=[s["ret_a"] * 100], mode="markers",
            marker=dict(size=20, color=INSPER_RED, symbol="star",
                        line=dict(width=1, color="white")),
            name="Sua carteira",
            hovertemplate="SUA CARTEIRA<br>risco %{x:.1f}%<br>retorno %{y:.1f}%<extra></extra>"))
        fig.update_layout(template="plotly_white", xaxis_title="Risco anual (%)",
                          yaxis_title="Retorno anual (%)", margin=dict(t=10, r=10, l=10, b=10),
                          legend=dict(yanchor="top", y=0.99, xanchor="left", x=0.01))
        return fig

    @render_widget
    def plot_pesos():
        w = pesos()
        w = w[w > 0] if len(w) else w
        if len(w) == 0:
            return go.Figure().update_layout(template="plotly_white")
        fig = px.bar(x=w.values, y=[nome_ativo(a) for a in w.index], orientation="h",
                     template="plotly_white", color_discrete_sequence=[INSPER_ROXO])
        fig.update_layout(xaxis_tickformat=".0%", xaxis_title="Peso", yaxis_title=None,
                          margin=dict(t=10, r=10, l=10, b=10), showlegend=False)
        return fig

    @render_widget
    def plot_backtest():
        s = stats_carteira()
        fig = go.Figure()
        if s is None:
            return fig.update_layout(template="plotly_white")
        d = ret_janela()
        port = (d[s["ativos"]].dropna() * s["wv"]).sum(axis=1)
        traces = [(port, "Sua carteira", INSPER_RED)]
        if BENCH in d.columns:
            bench = d[BENCH].reindex(port.index).dropna()
            port = port.reindex(bench.index)
            traces = [(port, "Sua carteira", INSPER_RED), (bench, "Ibovespa", INSPER_GRAY)]
        for serie, nome, cor in traces:
            cum = (1 + serie).cumprod()
            fig.add_trace(go.Scatter(x=cum.index.strftime("%Y-%m-%d").tolist(),
                                     y=cum.values, name=nome, line=dict(color=cor, width=2)))
        fig.update_layout(template="plotly_white", yaxis_title="Retorno acumulado",
                          hovermode="x unified", margin=dict(t=10, r=10, l=10, b=10),
                          xaxis=dict(type="date"),
                          legend=dict(yanchor="top", y=0.99, xanchor="left", x=0.01))
        return fig

    @render_widget
    def plot_corr():
        s = stats_carteira()
        if s is None or len(s["ativos"]) < 2:
            return go.Figure().update_layout(template="plotly_white")
        corr = s["da"].corr()
        labels = [a.replace(".SA", "") for a in corr.columns]
        fig = px.imshow(corr.values, x=labels, y=labels, text_auto=".2f",
                        color_continuous_scale=[INSPER_TURQUESA, "#FFFFFF", INSPER_RED],
                        zmin=-1, zmax=1, template="plotly_white")
        fig.update_layout(margin=dict(t=10, r=10, l=10, b=10))
        return fig


app = App(app_ui, server)
