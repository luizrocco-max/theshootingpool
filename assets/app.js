/* ═══════════════════════════════════════════════════════════════════════════
   The Shooting Pool — interface
   ───────────────────────────────────────────────────────────────────────────
   Guarda tudo no próprio navegador (localStorage) e usa assets/calc.js para
   fazer as contas. Publicar no site do clube é opcional.
═══════════════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  const C = window.Calc;
  const CHAVE_LOCAL = "tsp_dados_v1";
  const CHAVE_PUB = "tsp_publicador";
  const CHAVE_TRAVA = "tsp_trava"; // verificador da senha do clube
  const CHAVE_LEMBRADA = "tsp_senha"; // só se a pessoa pedir "lembrar"
  const CAMINHO_DADOS = "data/apostas.json";

  let SENHA = null; // a senha do clube, só na memória enquanto a aba está aberta

  /* ──────────────────────────── utilidades ──────────────────────────── */

  const $ = (id) => document.getElementById(id);
  const esc = (s) =>
    String(s == null ? "" : s).replace(/[&<>"']/g, (m) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m])
    );
  const fmt = (c) => C.fmt(c);
  const uid = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const hoje = () => new Date().toISOString().slice(0, 10);
  const dataBR = (iso) => {
    if (!iso) return "";
    const [a, m, d] = String(iso).split("-");
    return d ? `${d}/${m}/${a}` : String(iso);
  };
  /** "Etapa de agosto · 23/08/2026" — sem repetir a data se o nome já tem. */
  const rotuloComp = (c) => {
    const d = dataBR(c.data);
    return c.nome + (d && !c.nome.includes(d) ? " · " + d : "");
  };
  const agora = () => {
    const n = new Date(), p = (x) => String(x).padStart(2, "0");
    return `${p(n.getDate())}/${p(n.getMonth() + 1)}/${n.getFullYear()} ${p(n.getHours())}:${p(n.getMinutes())}`;
  };
  const money = (c) =>
    `<span class="money ${c > 0 ? "pos" : c < 0 ? "neg" : ""}">${esc(fmt(c))}</span>`;

  function msg(el, texto, tipo) {
    const d = $(el);
    if (!d) return;
    if (!texto) { d.className = "msg"; d.innerHTML = ""; return; }
    d.className = "msg " + (tipo || "info");
    d.innerHTML = texto;
  }

  /* ─────────────────────────────── estado ───────────────────────────── */

  let DADOS = { versao: 1, atualizado_em: null, regraPadrao: null, competicoes: [] };
  let compId = null;
  let view = "apostas";
  let filtroAtirador = null;

  function normalizar(d) {
    const out = {
      versao: 1,
      atualizado_em: (d && d.atualizado_em) || null,
      regraPadrao: (d && d.regraPadrao) || null,
      competicoes: [],
    };
    ((d && d.competicoes) || []).forEach((c) => {
      out.competicoes.push({
        id: c.id || uid("c"),
        nome: C.norm(c.nome) || "Competição",
        data: c.data || "",
        regra: c.regra || null,
        resultado: Array.isArray(c.resultado) ? c.resultado.slice(0, 3) : ["", "", ""],
        acertos: c.acertos || {},
        apostas: ((c.apostas) || []).map((a) => ({
          id: a.id || uid("a"),
          atirador: C.norm(a.atirador),
          apostador: C.norm(a.apostador),
          valor: Number(a.valor) || 0,
          pago: !!a.pago,
          pagoAuto: !!a.pagoAuto,
          em: a.em || null,
        })),
      });
    });
    return out;
  }

  function carregar() {
    try {
      const bruto = localStorage.getItem(CHAVE_LOCAL);
      if (bruto) { DADOS = normalizar(JSON.parse(bruto)); return true; }
    } catch (e) { /* dados corrompidos: começa limpo */ }
    return false;
  }

  function salvar(rerender = true) {
    DADOS.atualizado_em = agora();
    try {
      localStorage.setItem(CHAVE_LOCAL, JSON.stringify(DADOS));
    } catch (e) {
      alert("Não consegui gravar neste navegador. Faça um backup pelo ⚙️ antes de continuar.");
    }
    if (rerender) render();
  }

  const comps = () => DADOS.competicoes;
  const compAtual = () => comps().find((c) => c.id === compId) || null;

  /* ───────────────────────── competições (CRUD) ─────────────────────── */

  function novaCompeticao(nome, data) {
    const c = {
      id: uid("c"),
      nome: C.norm(nome) || "Etapa de " + dataBR(data || hoje()),
      data: data || hoje(),
      regra: DADOS.regraPadrao ? Object.assign({}, DADOS.regraPadrao) : null,
      resultado: ["", "", ""],
      acertos: {},
      apostas: [],
    };
    comps().push(c);
    compId = c.id;
    return c;
  }

  function ordenarComps() {
    comps().sort((a, b) => String(a.data).localeCompare(String(b.data)) || a.nome.localeCompare(b.nome, "pt-BR"));
  }

  /* ───────────────────────────── datalists ──────────────────────────── */

  function nomesConhecidos() {
    const atiradores = new Map(), apostadores = new Map();
    comps().forEach((c) => {
      (c.apostas || []).forEach((a) => {
        if (a.atirador) atiradores.set(C.chave(a.atirador), a.atirador);
        if (a.apostador) apostadores.set(C.chave(a.apostador), a.apostador);
      });
      (c.resultado || []).forEach((n) => { if (n) atiradores.set(C.chave(n), C.norm(n)); });
    });
    const ord = (m) => [...m.values()].sort((a, b) => a.localeCompare(b, "pt-BR"));
    return { atiradores: ord(atiradores), apostadores: ord(apostadores) };
  }

  function renderDatalists() {
    const { atiradores, apostadores } = nomesConhecidos();
    const op = (arr) => arr.map((n) => `<option value="${esc(n)}">`).join("");
    $("dlAtiradores").innerHTML = op(atiradores);
    $("dlApostadores").innerHTML = op(apostadores);
  }

  /* ══════════════════════════════ RENDER ════════════════════════════ */

  function render() {
    ordenarComps();
    if (!compAtual() && comps().length) compId = comps()[comps().length - 1].id;

    renderBarraComp();
    renderDatalists();
    renderAbas();

    const c = compAtual();
    const conta = c ? C.calcular(c) : null;

    if (view === "apostas") renderApostas(c, conta);
    if (view === "resultado") renderResultado(c, conta);
    if (view === "acerto") renderAcerto(c, conta);
    if (view === "temporada") renderTemporada();
    if (view === "ajuda") renderAjustes();

    ["apostas", "resultado", "acerto", "temporada", "ajuda"].forEach((v) => {
      $("view-" + v).hidden = v !== view;
    });
    document.querySelectorAll("#tabs .tab").forEach((t) => {
      t.classList.toggle("active", t.dataset.view === view);
    });
  }

  function renderBarraComp() {
    // o subtítulo mostra a divisão em vigor nesta competição, não um valor fixo
    const c = compAtual();
    $("subtitulo").textContent =
      "Apostas do clube · " +
      (c
        ? C.regraDe(c)
            .premios.map((p, i) => `${String(p).replace(".", ",")}% para o ${C.rotuloPosicao(i)}`)
            .join(" · ")
        : "de tiro");

    const sel = $("compSel");
    if (!comps().length) {
      sel.innerHTML = `<option>— nenhuma competição —</option>`;
      return;
    }
    sel.innerHTML = comps()
      .map((c) => {
        const n = (c.apostas || []).length;
        return `<option value="${esc(c.id)}"${c.id === compId ? " selected" : ""}>${esc(
          rotuloComp(c)
        )} (${n})</option>`;
      })
      .join("");
  }

  function renderAbas() {
    const c = compAtual();
    const nAb = c ? C.calcular(c).apostadores.filter((p) => !p.acertado && p.saldoC !== 0).length : 0;
    const tab = document.querySelector('#tabs .tab[data-view="acerto"]');
    tab.innerHTML = "🤝 Acerto de contas" + (nAb ? ` <span class="pill">${nAb}</span>` : "");
  }

  function kpis(destino, itens) {
    $(destino).innerHTML = itens
      .map((k) => `<div class="kpi ${k.cls || ""}"><div class="v">${k.v}</div><div class="l">${esc(k.l)}</div></div>`)
      .join("");
  }

  /* ─────────────────────────── aba: apostas ─────────────────────────── */

  function renderApostas(c, conta) {
    if (!c) {
      kpis("kpisApostas", []);
      $("tabelaApostas").innerHTML = `<div class="vazio">Crie uma competição para começar.</div>`;
      $("filtroAtiradores").innerHTML = "";
      return;
    }
    const t = conta.totais;
    kpis("kpisApostas", [
      { v: esc(fmt(conta.pote)), l: "Bolo da competição", cls: "a" },
      { v: esc(fmt(t.pagoC)), l: "Já recebido", cls: "g" },
      { v: esc(fmt(t.devendoC)), l: "A receber", cls: t.devendoC ? "b" : "" },
      { v: esc(fmt(t.premiosC)), l: "Em prêmios" },
      { v: `${t.nApostas} <span style="font-size:13px;color:var(--muted)">/ ${t.nApostadores} pess.</span>`, l: "Apostas" },
    ]);

    // filtro por atirador
    const porAtirador = new Map();
    conta.apostas.forEach((a) => {
      const k = C.chave(a.atirador);
      if (!porAtirador.has(k)) porAtirador.set(k, { nome: a.atirador, totalC: 0, n: 0 });
      const g = porAtirador.get(k);
      g.totalC += a.valorC; g.n += 1;
    });
    const lista = [...porAtirador.entries()].sort((a, b) => b[1].totalC - a[1].totalC);
    $("filtroAtiradores").innerHTML = lista.length
      ? `<div style="margin-bottom:10px">
          <button class="chip${filtroAtirador ? "" : " on"}" data-filtro="">Todos (${conta.apostas.length})</button>` +
        lista
          .map(
            ([k, g]) =>
              `<button class="chip${filtroAtirador === k ? " on" : ""}" data-filtro="${esc(k)}">${esc(
                g.nome
              )} · ${esc(fmt(g.totalC))}</button>`
          )
          .join("") +
        `</div>`
      : "";

    const linhas = conta.apostas.filter((a) => !filtroAtirador || C.chave(a.atirador) === filtroAtirador);
    if (!linhas.length) {
      $("tabelaApostas").innerHTML = `<div class="vazio">${
        conta.apostas.length ? "Nenhuma aposta nesse filtro." : "Nenhuma aposta lançada ainda."
      }</div>`;
      return;
    }

    const temPremio = conta.totais.premiosC > 0;
    $("tabelaApostas").innerHTML = `
      <div class="tablewrap"><table>
        <thead><tr>
          <th>Atirador</th><th>Apostador</th><th class="num">Valor</th>
          <th>Pagamento</th>${temPremio ? '<th class="num">Prêmio</th>' : ""}
          <th class="naoimprime"></th>
        </tr></thead>
        <tbody>${linhas
          .map((a) => {
            const venceu = a.premioC > 0;
            return `<tr class="${venceu ? "win" : ""}">
              <td>${esc(a.atirador)}${posicaoTag(conta, a.atirador)}</td>
              <td>${esc(a.apostador)}</td>
              <td class="num">${esc(fmt(a.valorC))}</td>
              <td><button class="tag ${a.pago ? "ok" : "no"}" data-act="pago" data-id="${esc(a.id)}">${
                a.pago ? "✓ pago" : "✗ não pagou"
              }</button></td>
              ${temPremio ? `<td class="num">${a.premioC ? money(a.premioC) : '<span class="tag mut">—</span>'}</td>` : ""}
              <td class="naoimprime"><button class="btn ghost mini" data-act="excluir" data-id="${esc(
                a.id
              )}" title="Excluir aposta">✕</button></td>
            </tr>`;
          })
          .join("")}</tbody>
      </table></div>`;
  }

  function posicaoTag(conta, atirador) {
    const f = conta.faixas.find((x) => x.atirador && !x.repetida && C.chave(x.atirador) === C.chave(atirador));
    if (!f) return "";
    const medalha = ["🥇", "🥈", "🥉"][f.posicao - 1];
    return ` <span class="pos">${medalha}</span>`;
  }

  /* ────────────────────────── aba: resultado ────────────────────────── */

  /** Só o texto da soma dos percentuais — atualizável sem refazer os campos. */
  function atualizarSomaPct(c) {
    const soma = C.regraDe(c).premios.reduce((a, b) => a + b, 0);
    const fecha = Math.abs(soma - 100) <= 0.001;
    let nota = document.querySelector(".somapct");
    if (!nota) {
      nota = document.createElement("div");
      $("podioInputs").after(nota);
    }
    nota.className = "somapct" + (fecha ? "" : " alerta100");
    nota.innerHTML =
      `Soma dos percentuais: <b>${esc(String(Math.round(soma * 100) / 100).replace(".", ","))}%</b>` +
      (fecha ? "" : " — não fecha 100%, mas tudo bem: o bolo é dividido nessa mesma proporção.");
  }

  /** Uma linha por colocação premiada: nome do atirador + % daquela faixa. */
  function renderPodioInputs(c) {
    const regra = C.regraDe(c);
    $("podioInputs").innerHTML = regra.premios
      .map(
        (pct, i) => `<div>
          <label class="lb">${medalha(i)} ${esc(C.rotuloPosicao(i))} lugar</label>
          <div class="colocacao">
            <input id="fPodio${i}" list="dlAtiradores" placeholder="Nome do atirador"
                   value="${esc((c.resultado || [])[i] || "")}">
            <input id="fPct${i}" class="pctbox" inputmode="decimal" title="% do bolo desta colocação"
                   value="${esc(String(pct).replace(".", ","))}">
          </div>
        </div>`
      )
      .join("");
    $("btnMenosColocacao").disabled = regra.premios.length <= 1;
    $("btnMaisColocacao").disabled = regra.premios.length >= C.MAX_COLOCACOES;
    atualizarSomaPct(c);
  }

  const medalha = (i) => ["🥇", "🥈", "🥉"][i] || "🏅";

  function renderResultado(c, conta) {
    if (!c) {
      $("podioInputs").innerHTML = "";
      $("premiacao").innerHTML = `<div class="card"><div class="vazio">Crie uma competição primeiro.</div></div>`;
      $("simulacao").innerHTML = "";
      $("alertasResultado").innerHTML = "";
      return;
    }
    renderPodioInputs(c);
    renderPremiacao(c, conta);
  }

  /**
   * Redesenha só o que depende do resultado — os campos do pódio ficam de pé,
   * senão o campo que a pessoa está preenchendo some no meio da digitação.
   */
  function renderPremiacao(c, conta) {
    $("alertasResultado").innerHTML = conta.alertas.length
      ? `<div class="alerta">⚠️ ${conta.alertas.map(esc).join("<br>")}</div>`
      : "";

    if (!conta.definido) {
      $("premiacao").innerHTML = "";
      renderSimulacao(c, conta);
      return;
    }
    $("simulacao").innerHTML = "";

    $("premiacao").innerHTML = `
      <div class="card">
        <div class="toolbar">
          <h3 style="margin:0">Divisão do bolo — ${esc(fmt(conta.pote))}${
      conta.taxaC ? ` <span style="color:var(--muted);font-weight:400">(taxa do clube: ${esc(fmt(conta.taxaC))})</span>` : ""
    }</h3>
          <span class="sp"></span>
          <button class="btn mini naoimprime" data-act="pdf">📄 Baixar PDF</button>
        </div>
        <div class="podium">${conta.faixas
          .map((f, i) => {
            const corpo = !f.atirador
              ? `<div class="vazio">— sem colocado —</div>`
              : f.repetida
              ? `<div class="vazio">${esc(f.atirador)} já está numa colocação melhor</div>`
              : !f.apostas.length
              ? `<div class="vazio">ninguém apostou nele</div>`
              : `<ul>${f.apostadores
                  .map((p) => `<li><span>${esc(p.nome)}</span><span>${esc(fmt(p.premioC))}</span></li>`)
                  .join("")}</ul>`;
            const pctReal = f.ativa && Math.abs(f.pctEfetivo - f.pct) > 0.01
              ? `${f.pct}% → ${f.pctEfetivo.toFixed(1)}%`
              : `${f.pct}%`;
            return `<div class="pod g${i + 1}">
              <span class="pct">${esc(pctReal)}</span>
              <div class="medal">${medalha(i)} <span style="font-size:13px;color:var(--muted);font-weight:700">${esc(C.rotuloPosicao(i))}</span></div>
              <div class="nm">${esc(f.atirador || "—")}</div>
              <div class="vl">${esc(fmt(f.valorC))}</div>
              ${corpo}
            </div>`;
          })
          .join("")}</div>
      </div>`;
  }

  function renderSimulacao(c, conta) {
    const sim = C.simular(c);
    if (!sim.length) {
      $("simulacao").innerHTML = `<div class="card"><div class="vazio">Lance as apostas para ver a simulação.</div></div>`;
      return;
    }
    $("simulacao").innerHTML = `
      <div class="card">
        <h3>E se ganhar? — prêmio de cada atirador antes do resultado</h3>
        <div class="tablewrap"><table>
          <thead><tr>
            <th>Atirador</th><th class="num">Apostado nele</th><th class="num">Apostadores</th>
            <th class="num">Se for 1º</th><th class="num">Se for 2º</th><th class="num">Se for 3º</th>
            <th class="num">Retorno (1º)</th>
          </tr></thead>
          <tbody>${sim
            .map(
              (s) => `<tr>
                <td>${esc(s.atirador)}</td>
                <td class="num">${esc(fmt(s.apostadoC))}</td>
                <td class="num">${s.nApostadores}</td>
                <td class="num">${esc(fmt(s.premios[0]))}</td>
                <td class="num">${esc(fmt(s.premios[1]))}</td>
                <td class="num">${esc(fmt(s.premios[2]))}</td>
                <td class="num">${s.retorno[0].toFixed(2).replace(".", ",")}×</td>
              </tr>`
            )
            .join("")}</tbody>
        </table></div>
        <div class="note">“Retorno” é quanto volta para cada R$ 1 apostado naquele atirador, se ele
          terminar em 1º. Os valores consideram o bolo de agora e todas as faixas com apostador.</div>
      </div>`;
  }

  /* ──────────────────────────── aba: acerto ─────────────────────────── */

  function renderAcerto(c, conta) {
    if (!c) {
      kpis("kpisAcerto", []);
      $("tabelaAcerto").innerHTML = `<div class="vazio">Crie uma competição primeiro.</div>`;
      $("caixaClube").innerHTML = "";
      return;
    }
    const t = conta.totais;
    kpis("kpisAcerto", [
      { v: esc(fmt(t.aPagarC)), l: "O clube paga", cls: "g" },
      { v: esc(fmt(t.aReceberC)), l: "O clube recebe", cls: "b" },
      { v: esc(fmt(t.aReceberC - t.aPagarC)), l: "Efeito no caixa", cls: "a" },
      { v: String(conta.apostadores.filter((p) => !p.acertado).length), l: "Acertos em aberto" },
    ]);

    if (!conta.apostadores.length) {
      $("tabelaAcerto").innerHTML = `<div class="vazio">Nenhuma aposta lançada ainda.</div>`;
      $("caixaClube").innerHTML = "";
      $("pagamentosComp").innerHTML = "";
      return;
    }
    $("pagamentosComp").innerHTML = cardPagamentos(conta.acerto, "Quem paga quem");

    const linha = (p) => {
      const situacao = p.acertado
        ? `<span class="tag mut">acertado${p.acertadoEm ? " · " + esc(dataBR(p.acertadoEm)) : ""}</span>`
        : p.saldoC > 0
        ? `<span class="tag ok">clube paga</span>`
        : p.saldoC < 0
        ? `<span class="tag no">ele paga</span>`
        : `<span class="tag mut">quite</span>`;
      return `<tr class="${p.acertado ? "quit" : ""}">
        <td>${esc(p.nome)}</td>
        <td class="num">${esc(fmt(p.apostadoC))}</td>
        <td class="num">${p.devendoC ? esc(fmt(p.devendoC)) : "—"}</td>
        <td class="num">${p.premioC ? esc(fmt(p.premioC)) : "—"}</td>
        <td class="num">${money(p.saldoC)}</td>
        <td>${situacao}</td>
        <td class="naoimprime">${
          p.acertado
            ? `<button class="btn ghost mini" data-act="desacertar" data-chave="${esc(p.chave)}">desfazer</button>`
            : `<button class="btn mini" data-act="acertar" data-chave="${esc(p.chave)}">acertar</button>`
        }</td>
      </tr>`;
    };

    $("tabelaAcerto").innerHTML = `
      <div class="tablewrap"><table>
        <thead><tr>
          <th>Apostador</th><th class="num">Apostou</th><th class="num">Deve</th>
          <th class="num">Prêmio</th><th class="num">Saldo</th><th>Situação</th><th class="naoimprime"></th>
        </tr></thead>
        <tbody>${conta.apostadores.map(linha).join("")}</tbody>
      </table></div>`;

    const conf = conta.pote - conta.totais.premiosC - conta.taxaC - conta.sobraClubeC;
    $("caixaClube").innerHTML = `
      <div class="card">
        <h3>Caixa do clube nesta competição</h3>
        <div class="tablewrap"><table style="min-width:auto">
          <tbody>
            <tr><td>Entrou (apostas já pagas)</td><td class="num">${esc(fmt(t.pagoC))}</td></tr>
            <tr><td>Ainda a receber</td><td class="num">${esc(fmt(t.devendoC))}</td></tr>
            <tr><td>Sai em prêmios</td><td class="num">${esc(fmt(t.premiosC))}</td></tr>
            ${conta.taxaC ? `<tr><td>Taxa do clube (${C.regraDe(c).taxaClube}%)</td><td class="num">${esc(fmt(conta.taxaC))}</td></tr>` : ""}
            ${conta.sobraClubeC && conta.definido ? `<tr><td>Fatia sem apostador retida</td><td class="num">${esc(fmt(conta.sobraClubeC))}</td></tr>` : ""}
            <tr><td><b>Fica com o clube no fim</b></td><td class="num"><b>${esc(fmt(conta.definido ? conta.receitaClubeC : 0))}</b></td></tr>
          </tbody>
        </table></div>
        <div class="note">${
          conf === 0
            ? "✓ Conferido: cada centavo do bolo está distribuído."
            : "⚠️ Diferença de " + esc(fmt(conf)) + " — avise o desenvolvedor."
        }</div>
      </div>`;
  }

  /**
   * A lista de "quem paga quem": o menor número de transferências que quita
   * todo mundo. Usada na competição e no acerto geral da temporada.
   */
  function cardPagamentos(acerto, titulo, extras) {
    const lista = (acerto && acerto.pagamentos) || [];
    const o = extras || {};
    if (!lista.length)
      return `<div class="card">
        <h3>${esc(titulo)}</h3>
        <div class="vazio">Ninguém tem nada a pagar nem a receber. Tudo quite.</div>
      </div>`;

    const total = lista.reduce((s, p) => s + p.valorC, 0);
    return `<div class="card">
      <div class="toolbar">
        <h3 style="margin:0">${esc(titulo)} — ${lista.length} pagamento${lista.length > 1 ? "s" : ""}</h3>
        <span class="sp"></span>
        ${o.botoes || ""}
      </div>
      <div class="tablewrap"><table>
        <thead><tr><th>Quem paga</th><th></th><th>Para quem</th><th class="num">Valor</th></tr></thead>
        <tbody>${lista
          .map(
            (p) => `<tr class="win">
              <td>${esc(p.de)}</td>
              <td style="color:var(--muted)">→</td>
              <td>${esc(p.para)}</td>
              <td class="num">${money(p.valorC)}</td>
            </tr>`
          )
          .join("")}</tbody>
      </table></div>
      <div class="note">
        Total de ${esc(fmt(total))} em ${lista.length} pagamento${lista.length > 1 ? "s" : ""}${
      o.avulsos && o.avulsos > lista.length ? `, no lugar de ${o.avulsos} acertos avulsos` : ""
    }. Quem deve paga direto quem tem a receber; o <b>caixa do clube</b> é o dinheiro das apostas
        já pagas, que está com o organizador.
      </div>
    </div>`;
  }

  function resumoTexto() {
    const c = compAtual();
    if (!c) return "";
    const conta = C.calcular(c);
    const linhas = [];
    linhas.push(`🎯 ${rotuloComp(c)}`);
    linhas.push(`Bolo: ${fmt(conta.pote)}`);
    if (conta.definido) {
      conta.faixas.forEach((f, i) => {
        if (!f.atirador) return;
        linhas.push(`${["🥇", "🥈", "🥉"][i]} ${f.atirador} — ${fmt(f.valorC)}`);
      });
    }
    linhas.push("");
    linhas.push("ACERTO:");
    const abertos = conta.apostadores.filter((p) => !p.acertado);
    const receber = abertos.filter((p) => p.saldoC > 0);
    const pagar = abertos.filter((p) => p.saldoC < 0);
    if (receber.length) {
      linhas.push("O clube paga:");
      receber.forEach((p) => linhas.push(`  • ${p.nome}: ${fmt(p.saldoC)}`));
    }
    if (pagar.length) {
      linhas.push("O clube recebe:");
      pagar.forEach((p) => linhas.push(`  • ${p.nome}: ${fmt(-p.saldoC)}`));
    }
    if (!receber.length && !pagar.length) linhas.push("  tudo acertado ✓");
    return linhas.join("\n");
  }

  /* ─────────────────────────── aba: temporada ───────────────────────── */

  function renderTemporada() {
    const t = C.temporada(DADOS);
    kpis("kpisTemporada", [
      { v: String(t.totais.competicoes), l: "Competições" },
      { v: esc(fmt(t.totais.movimentadoC)), l: "Movimentado", cls: "a" },
      { v: esc(fmt(t.totais.premiosC)), l: "Pago em prêmios" },
      { v: esc(fmt(t.totais.aPagarC)), l: "Clube deve", cls: t.totais.aPagarC ? "g" : "" },
      { v: esc(fmt(t.totais.aReceberC)), l: "Clube tem a receber", cls: t.totais.aReceberC ? "b" : "" },
    ]);

    if (!t.apostadores.length) {
      $("rankApostadores").innerHTML = `<div class="card"><div class="vazio">Sem apostas registradas ainda.</div></div>`;
      $("rankAtiradores").innerHTML = "";
      $("listaComps").innerHTML = "";
      $("acertoGeral").innerHTML = "";
      return;
    }

    // acerto geral: junta todas as competições em aberto num pagamento só por pessoa
    const avulsos = t.comps.reduce(
      (s, c) => s + c.conta.apostadores.filter((p) => !p.acertado && p.saldoC !== 0).length,
      0
    );
    $("acertoGeral").innerHTML = cardPagamentos(t.acerto, "Acerto geral do clube", {
      avulsos,
      botoes: `<button class="btn mini naoimprime" data-act="pdfgeral">📄 Baixar PDF do acerto</button>`,
    });

    $("rankApostadores").innerHTML = `
      <div class="card">
        <h3>Apostadores da temporada</h3>
        <div class="tablewrap"><table>
          <thead><tr>
            <th>#</th><th>Apostador</th><th class="num">Apostou</th><th class="num">Ganhou</th>
            <th class="num">Lucro</th><th class="num">Competições</th><th class="num">Pendência</th>
          </tr></thead>
          <tbody>${t.apostadores
            .map(
              (p, i) => `<tr>
                <td class="pos">${i + 1}</td>
                <td>${esc(p.nome)}</td>
                <td class="num">${esc(fmt(p.apostadoC))}</td>
                <td class="num">${esc(fmt(p.premioC))}</td>
                <td class="num">${money(p.lucroC)}</td>
                <td class="num">${p.premiadas}/${p.competicoes}</td>
                <td class="num">${p.pendenteC ? money(p.pendenteC) : "—"}</td>
              </tr>`
            )
            .join("")}</tbody>
        </table></div>
        <div class="note"><b>Lucro</b> = tudo que ganhou menos tudo que apostou na temporada.
          <b>Pendência</b> é o que ainda não foi acertado (positivo: o clube deve a ele).</div>
      </div>`;

    // uma coluna por colocação que a temporada chegou a premiar
    const nCol = Math.max(1, t.maxColocacoes);
    const colunas = Array.from({ length: nCol }, (_, i) => i);
    $("rankAtiradores").innerHTML = `
      <div class="card">
        <h3>Atiradores</h3>
        <div class="tablewrap"><table>
          <thead><tr>
            <th>Atirador</th>
            ${colunas
              .map((i) => `<th class="num" title="${esc(C.rotuloPosicao(i))} lugar">${medalha(i)}${
                i > 2 ? " " + esc(C.rotuloPosicao(i)) : ""
              }</th>`)
              .join("")}
            <th class="num">Apostado nele</th><th class="num">Apostas</th>
          </tr></thead>
          <tbody>${t.atiradores
            .map(
              (s) => `<tr>
                <td>${esc(s.nome)}</td>
                ${colunas.map((i) => `<td class="num">${s.podios[i] || "—"}</td>`).join("")}
                <td class="num">${esc(fmt(s.apostadoC))}</td>
                <td class="num">${s.nApostas}</td>
              </tr>`
            )
            .join("")}</tbody>
        </table></div>
      </div>`;

    $("listaComps").innerHTML = `
      <div class="card">
        <h3>Competições</h3>
        <div class="tablewrap"><table>
          <thead><tr>
            <th>Competição</th><th>Data</th><th>Pódio</th><th class="num">Bolo</th>
            <th class="num">Apostas</th><th>Situação</th>
          </tr></thead>
          <tbody>${t.comps
            .map(({ comp, conta }) => {
              const abertos = conta.apostadores.filter((p) => !p.acertado && p.saldoC !== 0).length;
              const podio = conta.faixas.filter((f) => f.atirador).map((f) => f.atirador).join(" · ");
              return `<tr>
                <td><a href="#" data-act="abrir" data-id="${esc(comp.id)}">${esc(comp.nome)}</a></td>
                <td>${esc(dataBR(comp.data))}</td>
                <td>${esc(podio) || '<span class="tag mut">sem resultado</span>'}</td>
                <td class="num">${esc(fmt(conta.pote))}</td>
                <td class="num">${conta.totais.nApostas}</td>
                <td>${
                  abertos
                    ? `<span class="tag no">${abertos} em aberto</span>`
                    : `<span class="tag ok">acertada</span>`
                }</td>
              </tr>`;
            })
            .join("")}</tbody>
        </table></div>
      </div>`;
  }

  /* ──────────────────────────── ajustes ─────────────────────────────── */

  function renderAjustes() {
    const c = compAtual();
    if (!c) { $("ajustes").innerHTML = ""; return; }
    const r = C.regraDe(c);
    const atual = r.premios.join("/");
    const modelos = [
      [50, 30, 20],
      [60, 40],
      [100],
      [40, 30, 20, 10],
      [40, 25, 15, 12, 8],
      [35, 25, 18, 12, 6, 4],
    ];
    $("ajustes").innerHTML = `
      <h3>Ajustes desta competição — ${esc(c.nome)}</h3>
      <label class="lb">Divisão do bolo por colocação</label>
      <div style="margin-bottom:6px">
        ${modelos
          .map(
            (m) =>
              `<button class="chip${m.join("/") === atual ? " on" : ""}" data-premios="${m.join(",")}">${m
                .map((x) => x + "%")
                .join(" · ")}</button>`
          )
          .join("")}
      </div>
      <div class="hint" style="margin-bottom:16px">Hoje: <b>${esc(
        r.premios.map((x, i) => C.rotuloPosicao(i) + " " + String(x).replace(".", ",") + "%").join(" · ")
      )}</b>. Estes são atalhos — para um valor qualquer, edite direto na aba 🏆 Resultado, onde dá
        para acrescentar ou tirar colocações.</div>
      <div class="formgrid" style="grid-template-columns:repeat(3,1fr);margin-top:12px">
        <div>
          <label class="lb">Divisão dentro da faixa</label>
          <select id="rRateio">
            <option value="proporcional"${r.rateio === "proporcional" ? " selected" : ""}>Proporcional ao valor apostado</option>
            <option value="igual"${r.rateio === "igual" ? " selected" : ""}>Partes iguais entre apostadores</option>
          </select>
        </div>
        <div>
          <label class="lb">Faixa sem apostador</label>
          <select id="rSobra">
            <option value="redistribuir"${r.sobra === "redistribuir" ? " selected" : ""}>Redividir entre as outras</option>
            <option value="clube"${r.sobra === "clube" ? " selected" : ""}>Fica com o clube</option>
          </select>
        </div>
        <div><label class="lb">Taxa do clube (%)</label><input id="rTaxa" inputmode="decimal" value="${r.taxaClube}"></div>
      </div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:16px">
        <button class="btn" id="btnSalvarRegra">Salvar ajustes</button>
        <button class="btn ghost" id="btnRegraPadrao">Usar também nas próximas</button>
      </div>
      <div class="msg" id="msgRegra"></div>`;

    $("btnSalvarRegra").onclick = () => salvarRegra(false);
    $("btnRegraPadrao").onclick = () => salvarRegra(true);
  }

  function salvarRegra(virarPadrao) {
    const c = compAtual();
    if (!c) return;
    const num = (id) => {
      const v = parseFloat(String($(id).value).replace(",", "."));
      return Number.isFinite(v) ? Math.max(0, v) : 0;
    };
    const regra = Object.assign(C.regraDe(c), {
      rateio: $("rRateio").value,
      sobra: $("rSobra").value,
      taxaClube: num("rTaxa"),
    });
    const soma = regra.premios.reduce((a, b) => a + b, 0);
    if (soma <= 0) { msg("msgRegra", "Os percentuais não podem ser todos zero.", "err"); return; }
    c.regra = regra;
    if (virarPadrao) DADOS.regraPadrao = Object.assign({}, regra);
    salvar();
    msg(
      "msgRegra",
      `✅ Ajustes salvos${virarPadrao ? " e adotados como padrão para novas competições" : ""}.` +
        (Math.abs(soma - 100) > 0.001
          ? `<br>Os percentuais somam ${soma}% — o bolo é dividido nessa proporção mesmo assim.`
          : ""),
      "ok"
    );
  }

  /* ══════════════════════════════ AÇÕES ═════════════════════════════ */

  function addAposta(e) {
    e.preventDefault();
    const c = compAtual() || novaCompeticao();
    const atirador = C.norm($("fAtirador").value);
    const apostador = C.norm($("fApostador").value);
    const valorC = C.parseValor($("fValor").value);

    if (!atirador || !apostador) { msg("msgAposta", "Preencha o atirador e o apostador.", "err"); return; }
    if (valorC <= 0) { msg("msgAposta", "Informe um valor maior que zero.", "err"); return; }

    c.apostas.push({
      id: uid("a"),
      atirador,
      apostador,
      valor: C.reais(valorC),
      pago: $("fPago").checked,
      pagoAuto: false,
      em: hoje(),
    });
    salvar();
    msg("msgAposta", `✅ ${esc(apostador)} → ${esc(atirador)} · ${esc(fmt(valorC))}`, "ok");

    // deixa o atirador para lançar várias apostas seguidas nele
    $("fApostador").value = "";
    $("fValor").value = "";
    $("fPago").checked = false;
    $("fPagoWrap").classList.remove("on");
    $("fApostador").focus();
  }

  function acertar(chaveApostador) {
    const c = compAtual();
    if (!c) return;
    const conta = C.calcular(c);
    const p = conta.apostadores.find((x) => x.chave === chaveApostador);
    if (!p) return;
    const texto =
      p.saldoC > 0
        ? `Confirmar: o clube paga ${fmt(p.saldoC)} para ${p.nome}?`
        : p.saldoC < 0
        ? `Confirmar: ${p.nome} paga ${fmt(-p.saldoC)} ao clube?`
        : `${p.nome} está quite. Marcar como acertado?`;
    if (!confirm(texto)) return;

    // as apostas em aberto dela entram no acerto e viram pagas
    c.apostas.forEach((a) => {
      if (C.chave(a.apostador) === chaveApostador && !a.pago) { a.pago = true; a.pagoAuto = true; }
    });
    c.acertos = c.acertos || {};
    c.acertos[chaveApostador] = { em: hoje(), saldo: C.reais(p.saldoC) };
    salvar();
  }

  function desacertar(chaveApostador) {
    const c = compAtual();
    if (!c) return;
    c.apostas.forEach((a) => {
      if (C.chave(a.apostador) === chaveApostador && a.pagoAuto) { a.pago = false; a.pagoAuto = false; }
    });
    if (c.acertos) delete c.acertos[chaveApostador];
    salvar();
  }

  /** Aceita texto ou binário (ArrayBuffer, como o .xlsx sai do gerador). */
  function baixarArquivo(nome, conteudo, tipo) {
    const blob = new Blob([conteudo], { type: tipo || "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nome;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function exportarCSV() {
    const c = compAtual();
    if (!c) return;
    const conta = C.calcular(c);
    const cab = ["Atirador", "Apostador", "Valor", "Pago", "Premio", "Saldo do apostador"];
    const dec = (v) => (v / 100).toFixed(2).replace(".", ",");
    const linhas = conta.apostas.map((a) => {
      const p = conta.apostadores.find((x) => x.chave === C.chave(a.apostador));
      return [a.atirador, a.apostador, dec(a.valorC), a.pago ? "sim" : "nao", dec(a.premioC), dec(p ? p.saldoC : 0)];
    });
    const csv = [cab, ...linhas]
      .map((l) => l.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(";"))
      .join("\r\n");
    baixarArquivo(`apostas-${(c.nome || "competicao").replace(/\W+/g, "-").toLowerCase()}.csv`, "﻿" + csv, "text/csv;charset=utf-8");
  }

  /* ═══════════════════════════════ PDF ══════════════════════════════ */

  /** Nome de arquivo sem acento nem sinal esquisito. */
  function slug(txt) {
    return (
      C.chave(txt)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") || "competicao"
    );
  }

  /** Relatório da competição em PDF: ganhadores, valores e acerto de contas. */
  function gerarPDF() {
    const c = compAtual();
    if (!c) return;
    try {
      const bytes = Pdf.relatorio(c, { geradoEm: agora() });
      baixarArquivo(
        `apostas-${slug(c.nome)}${c.data ? "-" + c.data : ""}.pdf`,
        bytes,
        "application/pdf"
      );
    } catch (err) {
      alert("Não consegui gerar o PDF: " + err.message);
    }
  }

  /** Acerto geral: todas as competições em aberto num roteiro de pagamento. */
  function gerarPDFGeral() {
    try {
      baixarArquivo(
        `acerto-geral-${hoje()}.pdf`,
        Pdf.relatorioGeral(DADOS, { geradoEm: agora() }),
        "application/pdf"
      );
    } catch (err) {
      alert("Não consegui gerar o PDF: " + err.message);
    }
  }

  /* ═════════════════════════════ PLANILHA ═══════════════════════════ */

  /** Carrega o leitor de Excel só quando alguém realmente vai usar. */
  let promessaXLSX = null;
  function carregarXLSX() {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    if (promessaXLSX) return promessaXLSX;
    promessaXLSX = new Promise((res, rej) => {
      const tentar = (src, entaoFalha) => {
        const s = document.createElement("script");
        s.src = src;
        s.onload = () => res(window.XLSX);
        s.onerror = entaoFalha;
        document.head.appendChild(s);
      };
      tentar("assets/vendor/xlsx.full.min.js", () =>
        tentar("https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js", () =>
          rej(new Error("não consegui carregar o leitor de planilhas"))
        )
      );
    });
    return promessaXLSX;
  }

  const LARGURAS = {
    Instruções: [{ wch: 78 }],
    Apostas: [{ wch: 26 }, { wch: 12 }, { wch: 18 }, { wch: 18 }, { wch: 11 }, { wch: 8 }],
    Resultado: [{ wch: 26 }, { wch: 11 }, { wch: 18 }, { wch: 12 }],
    Ajustes: [{ wch: 26 }, { wch: 14 }, { wch: 12 }, { wch: 8 }],
    Acerto: [{ wch: 26 }, { wch: 18 }, { wch: 11 }, { wch: 11 }, { wch: 11 }, { wch: 11 }, { wch: 13 }],
    Temporada: [{ wch: 18 }, { wch: 11 }, { wch: 11 }, { wch: 11 }, { wch: 13 }, { wch: 11 }, { wch: 12 }],
    Atiradores: [{ wch: 18 }],
  };

  /** Monta o arquivo .xlsx a partir das abas em formato linha × coluna. */
  function montarXLSX(XLSX, abas) {
    const wb = XLSX.utils.book_new();
    Object.keys(abas).forEach((nome) => {
      const ws = XLSX.utils.aoa_to_sheet(abas[nome]);
      if (LARGURAS[nome]) ws["!cols"] = LARGURAS[nome];
      XLSX.utils.book_append_sheet(wb, ws, nome.slice(0, 31));
    });
    return XLSX.write(wb, { type: "array", bookType: "xlsx" });
  }

  const MIME_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

  async function baixarModelo() {
    msg("msgPlanilha", "Gerando o modelo…", "info");
    try {
      const XLSX = await carregarXLSX();
      baixarArquivo("modelo-planilha-apostas.xlsx", montarXLSX(XLSX, Planilha.modelo()), MIME_XLSX);
      msg(
        "msgPlanilha",
        "✅ Modelo baixado. Preencha a aba <b>Apostas</b> (e a <b>Resultado</b>, se a prova já acabou) e volte aqui em <b>Importar planilha</b>.",
        "ok"
      );
    } catch (err) {
      msg("msgPlanilha", "Falha ao gerar o modelo: " + esc(err.message), "err");
    }
  }

  async function exportarExcel() {
    msg("msgPlanilha", "Gerando a planilha…", "info");
    try {
      const XLSX = await carregarXLSX();
      baixarArquivo(`the-shooting-pool-${hoje()}.xlsx`, montarXLSX(XLSX, Planilha.exportar(DADOS)), MIME_XLSX);
      msg(
        "msgPlanilha",
        "✅ Planilha baixada com as abas <b>Apostas</b>, <b>Resultado</b>, <b>Ajustes</b>, " +
          "<b>Acerto</b>, <b>Temporada</b> e <b>Atiradores</b>. As três primeiras podem ser " +
          "editadas e importadas de volta.",
        "ok"
      );
    } catch (err) {
      msg("msgPlanilha", "Falha ao exportar: " + esc(err.message), "err");
    }
  }

  async function importarPlanilha(arquivo) {
    msg("msgPlanilha", "Lendo a planilha…", "info");
    try {
      const XLSX = await carregarXLSX();
      const wb = XLSX.read(await arquivo.arrayBuffer(), { type: "array", cellDates: true });
      const abas = {};
      wb.SheetNames.forEach((n) => {
        abas[n] = XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: "" });
      });

      const r = Planilha.importar(abas);
      if (!r.competicoes.length) {
        msg("msgPlanilha", "Não encontrei apostas válidas.<br>" + r.avisos.map(esc).join("<br>"), "err");
        return;
      }

      // competição com mesmo nome e data é atualizada; o resto entra como nova
      const substituir = [], novas = [];
      r.competicoes.forEach((nova) => {
        const igual = comps().find(
          (c) => C.chave(c.nome) === C.chave(nova.nome) && (c.data || "") === (nova.data || "")
        );
        (igual ? substituir : novas).push({ nova, igual });
      });

      const partes = [];
      if (novas.length) partes.push(`${novas.length} competição(ões) nova(s)`);
      if (substituir.length)
        partes.push(`atualizar ${substituir.length}: ${substituir.map((x) => x.igual.nome).join(", ")}`);
      if (
        !confirm(
          `Importar ${r.resumo.apostas} aposta(s)?\n\n` +
            partes.join("\n") +
            (substituir.length ? "\n\nAs apostas das competições atualizadas serão substituídas." : "")
        )
      ) {
        msg("msgPlanilha", "Importação cancelada.", "info");
        return;
      }

      substituir.forEach(({ nova, igual }) => {
        igual.apostas = normalizar({ competicoes: [nova] }).competicoes[0].apostas;
        igual.resultado = nova.resultado;
        if (nova.regra) igual.regra = Object.assign(C.regraDe(igual), nova.regra);
        igual.acertos = {};
      });
      novas.forEach(({ nova }) => {
        const pronta = normalizar({ competicoes: [nova] }).competicoes[0];
        comps().push(pronta);
        compId = pronta.id;
      });

      salvar();
      const avisos = r.avisos.slice(0, 6);
      msg(
        "msgPlanilha",
        `✅ Importado: <b>${r.resumo.apostas}</b> aposta(s) em <b>${r.competicoes.length}</b> competição(ões).` +
          (r.resumo.ignoradas ? `<br>${r.resumo.ignoradas} linha(s) foram puladas:` : "") +
          (avisos.length ? "<br>• " + avisos.map(esc).join("<br>• ") : "") +
          (r.avisos.length > avisos.length ? `<br>…e mais ${r.avisos.length - avisos.length}.` : ""),
        r.resumo.ignoradas ? "info" : "ok"
      );
    } catch (err) {
      msg("msgPlanilha", "Não consegui ler a planilha: " + esc(err.message), "err");
    }
  }

  /* ─────────────────────────── publicação ───────────────────────────── */

  function configPub() {
    try { return JSON.parse(localStorage.getItem(CHAVE_PUB) || "{}"); } catch (e) { return {}; }
  }

  async function publicar() {
    const url = $("admUrl").value.trim();
    const senha = $("admSenha").value.trim();
    if (!url) { msg("msgAdmin", "Informe o endereço do publicador (Worker).", "err"); return; }
    if (!senha) { msg("msgAdmin", "Informe a senha do organizador.", "err"); return; }
    try {
      if ($("admLembrar").checked) localStorage.setItem(CHAVE_PUB, JSON.stringify({ url, senha }));
      else localStorage.removeItem(CHAVE_PUB);
    } catch (e) { /* ignora */ }

    if (!SENHA) { msg("msgAdmin", "Entre com a senha do clube antes de publicar.", "err"); return; }

    msg("msgAdmin", "Fechando o cofre e publicando…", "info");
    try {
      // o que sai daqui já vai cifrado com a senha do clube: o Worker e o
      // repositório só veem um bloco ilegível
      const pacote = await Cofre.cifrar(DADOS, SENHA, { atualizado_em: DADOS.atualizado_em || agora() });
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: senha, dados: pacote }),
      });
      let out = {};
      try { out = await r.json(); } catch (e) { /* resposta sem json */ }
      if (!r.ok || !out.ok) throw new Error(out.error || `HTTP ${r.status}`);
      msg(
        "msgAdmin",
        "✅ Publicado, cifrado com a senha do clube. Em 1 a 2 minutos quem tiver a senha vê os números novos.",
        "ok"
      );
    } catch (err) {
      msg("msgAdmin", "Falha ao publicar: " + esc(err.message), "err");
    }
  }

  async function trazerPublicado() {
    msg("msgAdmin", "Buscando…", "info");
    try {
      const r = await fetch(CAMINHO_DADOS + "?t=" + Date.now(), { cache: "no-store" });
      if (!r.ok) throw new Error("nada publicado ainda (HTTP " + r.status + ")");
      const bruto = await r.json();
      let conteudo = bruto;
      if (Cofre.estaCifrado(bruto)) {
        try {
          conteudo = await Cofre.decifrar(bruto, SENHA);
        } catch (e) {
          throw new Error("o arquivo do clube foi publicado com outra senha");
        }
      }
      const d = normalizar(conteudo);
      if (!d.competicoes.length) throw new Error("o arquivo publicado está vazio");
      if (
        !confirm(
          `Trazer ${d.competicoes.length} competição(ões) publicada(s)?\n\n` +
            `Isso SUBSTITUI o que está neste aparelho. Faça um backup antes se tiver algo só aqui.`
        )
      ) { msg("msgAdmin", "", ""); return; }
      DADOS = d;
      compId = null;
      salvar();
      msg("msgAdmin", "✅ Dados publicados carregados.", "ok");
    } catch (err) {
      msg("msgAdmin", "Não consegui trazer: " + esc(err.message), "err");
    }
  }

  /* ══════════════════════════════ EVENTOS ═══════════════════════════ */

  function ligarEventos() {
    // abas
    document.querySelectorAll("#tabs .tab, .docbtn[data-view]").forEach((b) => {
      b.onclick = () => { view = b.dataset.view; render(); };
    });

    // competição
    $("compSel").onchange = (e) => { compId = e.target.value; filtroAtirador = null; render(); };
    $("btnNova").onclick = () => abrirModalComp(null);
    $("btnEditar").onclick = () => { if (compAtual()) abrirModalComp(compAtual()); };
    $("btnExcluir").onclick = () => {
      const c = compAtual();
      if (!c) return;
      if (!confirm(`Excluir "${c.nome}" e todas as apostas dela? Não dá para desfazer.`)) return;
      DADOS.competicoes = comps().filter((x) => x.id !== c.id);
      compId = null;
      salvar();
    };
    $("btnSalvarComp").onclick = salvarModalComp;

    // apostas
    $("formAposta").onsubmit = addAposta;
    $("fPago").onchange = (e) => $("fPagoWrap").classList.toggle("on", e.target.checked);
    $("btnPagarTodos").onclick = () => {
      const c = compAtual();
      if (!c) return;
      const abertas = c.apostas.filter((a) => !a.pago).length;
      if (!abertas) { alert("Todas as apostas já estão pagas."); return; }
      if (!confirm(`Marcar ${abertas} aposta(s) como pagas?`)) return;
      c.apostas.forEach((a) => { if (!a.pago) { a.pago = true; a.pagoAuto = false; } });
      salvar();
    };
    $("btnCSV").onclick = exportarCSV;

    // planilha
    $("btnModelo").onclick = baixarModelo;
    $("btnExportar").onclick = exportarExcel;
    $("btnImportar").onclick = () => $("fileImportar").click();
    $("fileImportar").onchange = async (e) => {
      const f = e.target.files[0];
      if (f) await importarPlanilha(f);
      e.target.value = "";
    };

    // resultado — os campos nascem de novo a cada render, então ouvimos o pai
    $("podioInputs").addEventListener("change", () => {
      salvarPodio(true); // grava sem refazer os campos…
      const c = compAtual();
      if (!c) return;
      renderPremiacao(c, C.calcular(c)); // …e atualiza só o que mudou
      atualizarSomaPct(c);
      renderBarraComp();
      renderAbas();
    });
    $("btnSalvarPodio").onclick = () => salvarPodio();
    $("btnMaisColocacao").onclick = () => mudarColocacoes(+1);
    $("btnMenosColocacao").onclick = () => mudarColocacoes(-1);
    $("btnLimparPodio").onclick = () => {
      const c = compAtual();
      if (!c) return;
      c.resultado = ["", "", ""];
      salvar();
    };

    // acerto
    $("btnPDF").onclick = gerarPDF;
    $("btnImprimir").onclick = () => window.print();
    $("btnCopiar").onclick = async () => {
      const txt = resumoTexto();
      try {
        await navigator.clipboard.writeText(txt);
        alert("Resumo copiado! É só colar no WhatsApp.");
      } catch (e) {
        prompt("Copie o resumo abaixo:", txt);
      }
    };

    // admin
    $("btnAdmin").onclick = () => {
      const cfg = configPub();
      $("admUrl").value = cfg.url || "";
      $("admSenha").value = cfg.senha || "";
      $("admLembrar").checked = !!cfg.url;
      msg("msgAdmin", "", "");
      $("modalAdmin").hidden = false;
    };
    $("btnBaixar").onclick = () =>
      baixarArquivo(`the-shooting-pool-${hoje()}.json`, JSON.stringify(DADOS, null, 2));
    $("btnRestaurar").onclick = () => $("fileRestaurar").click();
    $("fileRestaurar").onchange = async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      try {
        const d = normalizar(JSON.parse(await f.text()));
        if (!confirm(`Restaurar ${d.competicoes.length} competição(ões)? Isso substitui o que está aqui.`)) return;
        DADOS = d;
        compId = null;
        salvar();
        msg("msgAdmin", "✅ Backup restaurado.", "ok");
      } catch (err) {
        msg("msgAdmin", "Arquivo inválido: " + esc(err.message), "err");
      }
      e.target.value = "";
    };
    $("btnPublicar").onclick = publicar;
    $("btnBaixarRemoto").onclick = trazerPublicado;
    $("btnApagar").onclick = () => {
      if (!confirm("Apagar TODAS as competições deste aparelho? Baixe um backup antes.")) return;
      if (!confirm("Tem certeza mesmo? Não dá para desfazer.")) return;
      DADOS = { versao: 1, atualizado_em: null, regraPadrao: DADOS.regraPadrao, competicoes: [] };
      compId = null;
      try { localStorage.removeItem(CHAVE_LOCAL); } catch (e) { /* ignora */ }
      novaCompeticao();
      salvar();
      msg("msgAdmin", "Tudo apagado.", "ok");
    };

    // fechar modais
    document.querySelectorAll("[data-fechar]").forEach((b) => {
      b.onclick = () => { $(b.dataset.fechar).hidden = true; };
    });
    document.querySelectorAll(".overlay").forEach((o) => {
      o.addEventListener("click", (e) => { if (e.target === o) o.hidden = true; });
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") document.querySelectorAll(".overlay").forEach((o) => (o.hidden = true));
    });

    // cliques nas tabelas e chips (delegação)
    document.addEventListener("click", (e) => {
      const chip = e.target.closest("[data-filtro]");
      if (chip) {
        filtroAtirador = chip.dataset.filtro || null;
        render();
        return;
      }
      const modelo = e.target.closest("[data-premios]");
      if (modelo) {
        const c = compAtual();
        if (!c) return;
        const premios = modelo.dataset.premios.split(",").map(Number);
        const resultado = (c.resultado || []).slice(0, premios.length);
        while (resultado.length < premios.length) resultado.push("");
        c.regra = Object.assign(C.regraDe(c), { premios });
        c.resultado = resultado;
        salvar();
        return;
      }
      const btn = e.target.closest("[data-act]");
      if (!btn) return;
      const c = compAtual();
      const act = btn.dataset.act;

      if (act === "pago" && c) {
        const a = c.apostas.find((x) => x.id === btn.dataset.id);
        if (a) { a.pago = !a.pago; a.pagoAuto = false; salvar(); }
      } else if (act === "excluir" && c) {
        const a = c.apostas.find((x) => x.id === btn.dataset.id);
        if (a && confirm(`Excluir a aposta de ${a.apostador} em ${a.atirador} (${fmt(C.cent(a.valor))})?`)) {
          c.apostas = c.apostas.filter((x) => x.id !== a.id);
          salvar();
        }
      } else if (act === "pdf") {
        gerarPDF();
      } else if (act === "pdfgeral") {
        gerarPDFGeral();
      } else if (act === "acertar") {
        acertar(btn.dataset.chave);
      } else if (act === "desacertar") {
        desacertar(btn.dataset.chave);
      } else if (act === "abrir") {
        e.preventDefault();
        compId = btn.dataset.id;
        view = "apostas";
        render();
      }
    });
  }

  /** Acrescenta ou tira uma colocação premiada da competição atual. */
  function mudarColocacoes(delta) {
    const c = compAtual();
    if (!c) return;
    salvarPodio(true); // não perde o que já está digitado
    const regra = C.regraDe(c);
    const premios = regra.premios.slice();
    const resultado = (c.resultado || []).slice();

    if (delta > 0) {
      if (premios.length >= C.MAX_COLOCACOES) return;
      // sugere metade da última faixa, para o organizador ajustar
      const ultima = premios[premios.length - 1] || 10;
      premios.push(Math.max(1, Math.round(ultima / 2)));
      resultado.push("");
    } else {
      if (premios.length <= 1) return;
      const nome = resultado[premios.length - 1];
      if (nome && !confirm(`Tirar o ${C.rotuloPosicao(premios.length - 1)} lugar (${nome}) da premiação?`)) return;
      premios.pop();
      resultado.pop();
    }
    c.regra = Object.assign({}, regra, { premios });
    c.resultado = resultado;
    salvar();
  }

  function salvarPodio(semRender) {
    const c = compAtual();
    if (!c) return;
    const regra = C.regraDe(c);
    const premios = [];
    const resultado = [];
    regra.premios.forEach((pct, i) => {
      const campoNome = $("fPodio" + i);
      const campoPct = $("fPct" + i);
      resultado.push(campoNome ? C.norm(campoNome.value) : (c.resultado || [])[i] || "");
      const v = campoPct ? parseFloat(String(campoPct.value).replace(",", ".")) : pct;
      premios.push(Number.isFinite(v) && v >= 0 ? v : pct);
    });
    c.resultado = resultado;
    c.regra = Object.assign({}, regra, { premios });
    salvar(!semRender);
  }

  function abrirModalComp(c) {
    $("tituloComp").textContent = c ? "Editar competição" : "Nova competição";
    $("cNome").value = c ? c.nome : "";
    $("cData").value = c ? c.data || hoje() : hoje();
    $("modalComp").dataset.editando = c ? c.id : "";
    msg("msgComp", "", "");
    $("modalComp").hidden = false;
    setTimeout(() => $("cNome").focus(), 50);
  }

  function salvarModalComp() {
    const editando = $("modalComp").dataset.editando;
    const nome = C.norm($("cNome").value);
    const data = $("cData").value;
    if (editando) {
      const c = comps().find((x) => x.id === editando);
      if (c) { c.nome = nome || c.nome; c.data = data; }
    } else {
      novaCompeticao(nome, data);
      view = "apostas";
      filtroAtirador = null;
    }
    $("modalComp").hidden = true;
    salvar();
  }

  /* ══════════════════════════ TELA DE ENTRADA ═══════════════════════ */

  const guardado = (chave) => {
    try { return JSON.parse(localStorage.getItem(chave) || "null"); } catch (e) { return null; }
  };
  const guardar = (chave, valor) => {
    try {
      if (valor === null) localStorage.removeItem(chave);
      else localStorage.setItem(chave, JSON.stringify(valor));
    } catch (e) { /* aparelho sem espaço ou em aba anônima */ }
  };

  /** Busca o arquivo publicado. Devolve null se não houver. */
  async function buscarPublicado() {
    try {
      const r = await fetch(CAMINHO_DADOS + "?t=" + Date.now(), { cache: "no-store" });
      if (!r.ok) return null;
      const j = await r.json();
      if (Cofre.estaCifrado(j)) return j;
      return j && j.competicoes && j.competicoes.length ? j : null;
    } catch (e) {
      return null;
    }
  }

  function mostrarForca(senha, ondeId) {
    const el = $(ondeId);
    if (!el) return;
    if (!senha) { el.className = "forca"; el.textContent = ""; return; }
    const f = Cofre.forca(senha);
    const rotulos = { curta: "curta demais", fraca: "fraca", razoavel: "razoável", boa: "boa" };
    el.className = "forca " + f.nivel;
    el.innerHTML = `<b>Senha ${rotulos[f.nivel]}</b>${f.aviso ? " — " + esc(f.aviso) : ""}`;
  }

  function abrirApp() {
    if (!comps().length) novaCompeticao();
    compId = comps()[comps().length - 1].id;
    $("trava").hidden = true;
    document.querySelector(".wrap").hidden = false;
    $("btnAdmin").hidden = false;
    render();
  }

  /** Decide se a tela pede para criar a senha ou para entrar. */
  async function prepararTrava() {
    if (!window.crypto || !window.crypto.subtle) {
      $("travaTexto").innerHTML =
        "Este navegador só libera a parte de segurança em endereços <b>https</b>. " +
        "Abra o site pelo endereço https (ou por localhost).";
      $("formTrava").hidden = true;
      return;
    }

    const verificador = guardado(CHAVE_TRAVA);
    const publicado = await buscarPublicado();
    const primeiraVez = !verificador && !(publicado && Cofre.estaCifrado(publicado));

    $("travaConfirma").hidden = !primeiraVez;
    $("travaEntrar").textContent = primeiraVez ? "Criar senha e entrar" : "Entrar";
    $("travaTexto").textContent = primeiraVez
      ? "Primeira vez aqui: crie a senha que você e seus amigos vão usar para entrar."
      : "Área do clube — entre com a senha.";
    $("travaRodape").innerHTML = primeiraVez
      ? "Essa senha também fecha o arquivo publicado: sem ela, quem abrir o endereço do site não vê nada. " +
        "Guarde-a — não há como recuperá-la."
      : publicado && publicado.atualizado_em
      ? "Última publicação do clube: " + esc(publicado.atualizado_em)
      : "";

    const lembrada = guardado(CHAVE_LEMBRADA);
    if (lembrada && !primeiraVez) {
      $("travaSenha").value = lembrada;
      $("travaLembrar").checked = true;
      const ok = await tentarEntrar(lembrada, publicado, verificador);
      if (ok) return;
      guardar(CHAVE_LEMBRADA, null); // a senha mudou desde a última vez
      $("travaSenha").value = "";
    }
    setTimeout(() => $("travaSenha").focus(), 60);
  }

  /**
   * Confere a senha contra o verificador local e/ou o arquivo publicado.
   * @returns {Promise<boolean>} true se entrou
   */
  async function tentarEntrar(senha, publicado, verificador) {
    // 1) o aparelho já conhece a senha
    if (verificador && (await Cofre.confere(senha, verificador))) {
      SENHA = senha;
      if (!comps().length && publicado) await adotarPublicado(publicado, senha, true);
      abrirApp();
      return true;
    }
    // 2) senão, vale se abrir o arquivo que o clube publicou
    if (publicado && Cofre.estaCifrado(publicado)) {
      try {
        const dados = await Cofre.decifrar(publicado, senha);
        SENHA = senha;
        guardar(CHAVE_TRAVA, await Cofre.criarVerificador(senha));
        if (!comps().length) {
          DADOS = normalizar(dados);
          salvar(false);
        }
        abrirApp();
        return true;
      } catch (e) { /* senha errada */ }
    }
    return false;
  }

  async function adotarPublicado(publicado, senha, silencioso) {
    try {
      const bruto = Cofre.estaCifrado(publicado) ? await Cofre.decifrar(publicado, senha) : publicado;
      const d = normalizar(bruto);
      if (d.competicoes.length) { DADOS = d; salvar(false); }
      return true;
    } catch (e) {
      if (!silencioso) throw e;
      return false;
    }
  }

  function ligarTrava() {
    $("travaSenha").addEventListener("input", (e) => {
      if (!$("travaConfirma").hidden) mostrarForca(e.target.value, "travaForca");
    });
    $("novaSenha").addEventListener("input", (e) => mostrarForca(e.target.value, "novaForca"));

    $("formTrava").onsubmit = async (e) => {
      e.preventDefault();
      const senha = $("travaSenha").value;
      const criando = !$("travaConfirma").hidden;
      $("travaEntrar").disabled = true;
      try {
        if (criando) {
          const f = Cofre.forca(senha);
          if (!f.ok) { msg("travaMsg", esc(f.aviso), "err"); return; }
          if (senha !== $("travaSenha2").value) { msg("travaMsg", "As duas senhas não são iguais.", "err"); return; }
          SENHA = senha;
          guardar(CHAVE_TRAVA, await Cofre.criarVerificador(senha));
          if ($("travaLembrar").checked) guardar(CHAVE_LEMBRADA, senha);
          abrirApp();
          return;
        }
        msg("travaMsg", "Conferindo…", "info");
        const ok = await tentarEntrar(senha, await buscarPublicado(), guardado(CHAVE_TRAVA));
        if (ok) {
          guardar(CHAVE_LEMBRADA, $("travaLembrar").checked ? senha : null);
          msg("travaMsg", "", "");
        } else {
          msg("travaMsg", "Senha incorreta.", "err");
          $("travaSenha").select();
        }
      } finally {
        $("travaEntrar").disabled = false;
      }
    };

    $("btnTrocarSenha").onclick = async () => {
      const nova = $("novaSenha").value;
      const f = Cofre.forca(nova);
      if (!f.ok) { msg("msgAdmin", esc(f.aviso), "err"); return; }
      if (nova !== $("novaSenha2").value) { msg("msgAdmin", "As duas senhas não são iguais.", "err"); return; }
      SENHA = nova;
      guardar(CHAVE_TRAVA, await Cofre.criarVerificador(nova));
      if (guardado(CHAVE_LEMBRADA)) guardar(CHAVE_LEMBRADA, nova);
      $("novaSenha").value = "";
      $("novaSenha2").value = "";
      mostrarForca("", "novaForca");
      msg(
        "msgAdmin",
        "✅ Senha trocada neste aparelho.<br><b>Publique de novo</b> para que o arquivo do clube passe " +
          "a usar a senha nova — e avise o pessoal.",
        "ok"
      );
    };
  }

  /* ═══════════════════════════════ BOOT ═════════════════════════════ */

  async function boot() {
    ligarEventos();
    ligarTrava();
    carregar(); // a competição em branco só nasce depois de entrar (abrirApp)
    await prepararTrava();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
