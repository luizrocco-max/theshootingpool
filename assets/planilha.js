/* ═══════════════════════════════════════════════════════════════════════════
   The Shooting Pool — ponte com a planilha
   ───────────────────────────────────────────────────────────────────────────
   Converte entre o formato do painel e tabelas simples (linhas × colunas).
   Não conhece Excel nem navegador: quem lê e grava o .xlsx é o app, usando
   esta camada no meio. Assim a leitura da planilha pode ser testada sozinha.

   Abas do modelo:
     Apostas    COMPETICAO · DATA · ATIRADOR · APOSTADOR · VALOR · PAGO
     Resultado  COMPETICAO · COLOCACAO · ATIRADOR · PERCENTUAL
     Ajustes    COMPETICAO · RATEIO · SOBRA · TAXA
═══════════════════════════════════════════════════════════════════════════ */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./calc.js"));
  else root.Planilha = factory(root.Calc);
})(typeof self !== "undefined" ? self : globalThis, function (C) {
  "use strict";

  /* ─────────────────────── leitura tolerante de célula ───────────────── */

  /** Uppercase sem acento, sem pontuação e sem espaço sobrando. */
  function tituloNorm(v) {
    return C.chave(String(v == null ? "" : v))
      .replace(/[.:%()]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  const SINONIMOS = {
    competicao: ["COMPETICAO", "COMPETICOES", "EVENTO", "ETAPA", "PROVA", "CAMPEONATO"],
    data: ["DATA", "DIA"],
    atirador: ["ATIRADOR", "ATIRADORA", "TIRADOR", "EM QUEM APOSTOU"],
    apostador: ["APOSTADOR", "APOSTADORA", "QUEM APOSTOU", "NOME"],
    valor: ["VALOR", "APOSTA", "R$", "VALOR APOSTADO", "VALOR DA APOSTA"],
    pago: ["PAGO", "PAGOU", "PAGAMENTO", "QUITADO", "JA PAGOU"],
    colocacao: ["COLOCACAO", "POSICAO", "LUGAR", "CLASSIFICACAO"],
    percentual: ["PERCENTUAL", "PERCENTAGEM", "PORCENTAGEM", "PCT", "PREMIO"],
    rateio: ["RATEIO", "DIVISAO", "DIVISAO DA FAIXA"],
    sobra: ["SOBRA", "FAIXA SEM APOSTADOR", "SEM APOSTADOR"],
    taxa: ["TAXA", "TAXA DO CLUBE", "COMISSAO"],
  };

  /** Acha a linha de cabeçalho e devolve {linha, colunas:{campo:índice}}. */
  function acharCabecalho(aoa, obrigatorios) {
    for (let i = 0; i < Math.min(aoa.length, 30); i++) {
      const linha = (aoa[i] || []).map(tituloNorm);
      const colunas = {};
      Object.keys(SINONIMOS).forEach((campo) => {
        const idx = linha.findIndex((t) => t && SINONIMOS[campo].includes(t));
        if (idx >= 0) colunas[campo] = idx;
      });
      if (obrigatorios.every((campo) => colunas[campo] !== undefined)) return { linha: i, colunas };
    }
    return null;
  }

  const texto = (v) => C.norm(v == null ? "" : String(v));

  /** "sim", "x", "ok", true, 1 → pago. Vazio, "não", 0 → não pago. */
  function ehSim(v) {
    if (v === true) return true;
    if (v === false || v == null) return false;
    if (typeof v === "number") return v !== 0;
    const s = C.chave(v).trim();
    return ["SIM", "S", "X", "OK", "TRUE", "VERDADEIRO", "PAGO", "PAGOU", "1"].includes(s);
  }

  /** Aceita número, texto brasileiro ou "R$ 1.234,56" → centavos. */
  function valorCent(v) {
    if (typeof v === "number") return C.cent(v);
    return C.parseValor(v);
  }

  /** Data como texto, Date ou número de série do Excel → "AAAA-MM-DD". */
  function dataISO(v) {
    if (v == null || v === "") return "";
    if (v instanceof Date && !isNaN(v)) {
      const p = (x) => String(x).padStart(2, "0");
      return `${v.getFullYear()}-${p(v.getMonth() + 1)}-${p(v.getDate())}`;
    }
    if (typeof v === "number" && v >= 61 && v < 100000) {
      // série do Excel (a partir de 01/03/1900, depois do bug do ano bissexto)
      const ms = Date.UTC(1899, 11, 30) + Math.round(v) * 86400000;
      return new Date(ms).toISOString().slice(0, 10);
    }
    const s = String(v).trim();
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
    if (m) {
      const ano = m[3].length === 2 ? "20" + m[3] : m[3];
      return `${ano}-${String(m[2]).padStart(2, "0")}-${String(m[1]).padStart(2, "0")}`;
    }
    return "";
  }

  /** Aceita 50, "50", "50%" e 0,5 (formato percentual do Excel) → 50. */
  function percentual(v) {
    if (v == null || v === "") return null;
    let n = typeof v === "number" ? v : parseFloat(String(v).replace("%", "").replace(",", "."));
    if (!Number.isFinite(n) || n < 0) return null;
    if (n > 0 && n <= 1) n = n * 100; // o Excel guarda 50% como 0,5
    return Math.round(n * 1e6) / 1e6;
  }

  /** Procura uma aba pelo nome, ignorando acento e caixa. */
  function pegarAba(abas, nome) {
    const alvo = C.chave(nome);
    const achou = Object.keys(abas || {}).find((k) => C.chave(k) === alvo);
    return achou ? abas[achou] || [] : [];
  }

  /* ══════════════════════════════ IMPORTAR ═══════════════════════════ */

  /**
   * Lê as abas (objeto {nomeDaAba: linhas×colunas}) e monta as competições.
   * @returns {{competicoes:Array, avisos:Array<string>, resumo:Object}}
   */
  function importar(abas) {
    const avisos = [];
    const porNome = new Map(); // chave da competição → competição

    const pegaComp = (nome, data) => {
      const nomeLimpo = texto(nome) || "Competição importada";
      const k = C.chave(nomeLimpo);
      if (!porNome.has(k))
        porNome.set(k, {
          nome: nomeLimpo,
          data: data || "",
          regra: null,
          resultado: [],
          acertos: {},
          apostas: [],
          _percentuais: [],
        });
      const c = porNome.get(k);
      if (!c.data && data) c.data = data;
      return c;
    };

    /* ── apostas ─────────────────────────────────────────────────────── */
    const aoaApostas = pegarAba(abas, "Apostas");
    const cabApostas = acharCabecalho(aoaApostas, ["atirador", "apostador"]);
    if (!cabApostas) {
      avisos.push(
        'Não achei a aba "Apostas" com as colunas ATIRADOR e APOSTADOR. Baixe o modelo em ⚙️ → Planilha.'
      );
      return { competicoes: [], avisos, resumo: { apostas: 0, competicoes: 0 } };
    }

    const col = cabApostas.colunas;
    let ultimaComp = "";
    let ultimaData = "";
    let ignoradas = 0;

    for (let i = cabApostas.linha + 1; i < aoaApostas.length; i++) {
      const linha = aoaApostas[i] || [];
      const celula = (campo) => (col[campo] === undefined ? "" : linha[col[campo]]);

      const atirador = texto(celula("atirador"));
      const apostador = texto(celula("apostador"));
      const valorC = valorCent(celula("valor"));

      // nome e data da competição "escorrem" para baixo quando ficam em branco
      const nomeComp = texto(celula("competicao"));
      if (nomeComp) ultimaComp = nomeComp;
      const dataComp = dataISO(celula("data"));
      if (dataComp) ultimaData = dataComp;

      if (!atirador && !apostador) continue; // linha vazia: pula sem reclamar
      if (!atirador || !apostador || valorC <= 0) {
        ignoradas++;
        avisos.push(
          `Linha ${i + 1} da aba Apostas ignorada: ` +
            (!atirador ? "falta o atirador." : !apostador ? "falta o apostador." : "valor vazio ou zerado.")
        );
        continue;
      }
      const c = pegaComp(ultimaComp, ultimaData);
      c.apostas.push({
        atirador,
        apostador,
        valor: C.reais(valorC),
        pago: ehSim(celula("pago")),
        pagoAuto: false,
      });
    }

    /* ── resultado (pódio + percentuais) ─────────────────────────────── */
    const aoaRes = pegarAba(abas, "Resultado");
    const cabRes = acharCabecalho(aoaRes, ["colocacao", "atirador"]);
    if (cabRes) {
      const c2 = cabRes.colunas;
      let compRes = "";
      for (let i = cabRes.linha + 1; i < aoaRes.length; i++) {
        const linha = aoaRes[i] || [];
        const cel = (campo) => (c2[campo] === undefined ? "" : linha[c2[campo]]);
        const nomeComp = texto(cel("competicao"));
        if (nomeComp) compRes = nomeComp;

        const pos = parseInt(String(cel("colocacao")).replace(/\D/g, ""), 10);
        if (!pos || pos < 1 || pos > C.MAX_COLOCACOES) continue;

        const chaveComp = C.chave(compRes || ultimaComp);
        const c = porNome.get(chaveComp) || pegaComp(compRes || ultimaComp, "");
        while (c.resultado.length < pos) c.resultado.push("");
        while (c._percentuais.length < pos) c._percentuais.push(null);
        c.resultado[pos - 1] = texto(cel("atirador"));
        const pct = percentual(cel("percentual"));
        if (pct !== null) c._percentuais[pos - 1] = pct;
      }
    }

    /* ── ajustes ─────────────────────────────────────────────────────── */
    const aoaAj = pegarAba(abas, "Ajustes");
    const cabAj = acharCabecalho(aoaAj, ["rateio"]) || acharCabecalho(aoaAj, ["taxa"]);
    const ajustes = new Map();
    if (cabAj) {
      const c3 = cabAj.colunas;
      for (let i = cabAj.linha + 1; i < aoaAj.length; i++) {
        const linha = aoaAj[i] || [];
        const cel = (campo) => (c3[campo] === undefined ? "" : linha[c3[campo]]);
        const nome = texto(cel("competicao"));
        const r = {};
        const rat = C.chave(cel("rateio"));
        if (rat.startsWith("IGUAL")) r.rateio = "igual";
        else if (rat.startsWith("PROPORC")) r.rateio = "proporcional";
        const sob = C.chave(cel("sobra"));
        if (sob.startsWith("CLUBE")) r.sobra = "clube";
        else if (sob.startsWith("REDIV") || sob.startsWith("REDIS")) r.sobra = "redistribuir";
        const tx = percentual(cel("taxa"));
        if (tx !== null) r.taxaClube = tx;
        if (Object.keys(r).length) ajustes.set(C.chave(nome), r);
      }
    }

    /* ── monta o resultado final ─────────────────────────────────────── */
    const competicoes = [...porNome.entries()].map(([k, c]) => {
      const regra = Object.assign({}, ajustes.get(k) || {});
      const pcts = c._percentuais.filter((p) => p !== null);
      if (pcts.length) {
        // completa as colocações sem percentual com o padrão, quando existir
        regra.premios = c._percentuais.map((p, i) =>
          p !== null ? p : C.REGRA_PADRAO.premios[i] !== undefined ? C.REGRA_PADRAO.premios[i] : 0
        );
      }
      delete c._percentuais;
      c.regra = Object.keys(regra).length ? regra : null;
      // apara colocações vazias no fim do pódio
      while (c.resultado.length && !c.resultado[c.resultado.length - 1]) c.resultado.pop();
      return c;
    });

    const totalApostas = competicoes.reduce((s, c) => s + c.apostas.length, 0);
    if (!totalApostas) avisos.push("Nenhuma aposta válida encontrada na planilha.");

    return {
      competicoes,
      avisos,
      resumo: { apostas: totalApostas, competicoes: competicoes.length, ignoradas },
    };
  }

  /* ══════════════════════════════ EXPORTAR ═══════════════════════════ */

  const CAB_APOSTAS = ["COMPETICAO", "DATA", "ATIRADOR", "APOSTADOR", "VALOR", "PAGO"];
  const CAB_RESULTADO = ["COMPETICAO", "COLOCACAO", "ATIRADOR", "PERCENTUAL"];
  const CAB_AJUSTES = ["COMPETICAO", "RATEIO", "SOBRA", "TAXA"];

  const dataBR = (iso) => {
    if (!iso) return "";
    const p = String(iso).split("-");
    return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : String(iso);
  };
  const emReais = (c) => Math.round(c) / 100;

  /**
   * Gera as abas de um arquivo com tudo que está no painel — as três de
   * entrada (que voltam a ser importáveis) e as de conferência.
   */
  function exportar(dados) {
    const comps = (dados && dados.competicoes) || [];

    const apostas = [CAB_APOSTAS.slice()];
    const resultado = [CAB_RESULTADO.slice()];
    const ajustes = [CAB_AJUSTES.slice()];
    const acerto = [
      ["COMPETICAO", "APOSTADOR", "APOSTOU", "DEVE", "PREMIO", "SALDO", "SITUACAO"],
    ];

    comps.forEach((comp) => {
      const conta = C.calcular(comp);
      const regra = C.regraDe(comp);

      conta.apostas.forEach((a) => {
        apostas.push([
          comp.nome,
          dataBR(comp.data),
          a.atirador,
          a.apostador,
          emReais(a.valorC),
          a.pago ? "sim" : "não",
        ]);
      });

      regra.premios.forEach((pct, i) => {
        resultado.push([comp.nome, i + 1, (comp.resultado || [])[i] || "", pct]);
      });

      ajustes.push([
        comp.nome,
        regra.rateio === "igual" ? "igual" : "proporcional",
        regra.sobra === "clube" ? "clube" : "redividir",
        regra.taxaClube,
      ]);

      conta.apostadores.forEach((p) => {
        acerto.push([
          comp.nome,
          p.nome,
          emReais(p.apostadoC),
          emReais(p.devendoC),
          emReais(p.premioC),
          emReais(p.saldoC),
          p.acertado ? "acertado" : p.saldoC > 0 ? "clube paga" : p.saldoC < 0 ? "ele paga" : "quite",
        ]);
      });
    });

    const t = C.temporada(dados || { competicoes: [] });
    const temporada = [["APOSTADOR", "APOSTOU", "GANHOU", "LUCRO", "COMPETICOES", "PREMIADAS", "PENDENCIA"]];
    t.apostadores.forEach((p) => {
      temporada.push([
        p.nome,
        emReais(p.apostadoC),
        emReais(p.premioC),
        emReais(p.lucroC),
        p.competicoes,
        p.premiadas,
        emReais(p.pendenteC),
      ]);
    });

    const cabAtir = ["ATIRADOR"];
    for (let i = 0; i < t.maxColocacoes; i++) cabAtir.push(C.rotuloPosicao(i));
    cabAtir.push("APOSTADO NELE", "APOSTAS", "COMPETICOES");
    const atiradores = [cabAtir];
    t.atiradores.forEach((s) => {
      atiradores.push(
        [s.nome]
          .concat(s.podios.slice(0, t.maxColocacoes).map((n) => n || 0))
          .concat([emReais(s.apostadoC), s.nApostas, s.competicoes])
      );
    });

    return {
      Apostas: apostas,
      Resultado: resultado,
      Ajustes: ajustes,
      Acerto: acerto,
      Temporada: temporada,
      Atiradores: atiradores,
    };
  }

  /* ══════════════════════════════ MODELO ═════════════════════════════ */

  /** Planilha em branco (com um exemplo) para o clube preencher e importar. */
  function modelo() {
    const exemplo = "Exemplo — apague estas linhas";
    return {
      Instruções: [
        ["THE SHOOTING POOL — MODELO DE PLANILHA"],
        [],
        ["Preencha a aba APOSTAS: uma linha por aposta."],
        ["  COMPETICAO  nome da etapa. Deixe em branco para repetir o de cima."],
        ["  DATA        dd/mm/aaaa. Também repete o de cima se ficar em branco."],
        ["  ATIRADOR    em quem a pessoa apostou."],
        ["  APOSTADOR   quem apostou."],
        ["  VALOR       em reais (100 ou 100,50)."],
        ["  PAGO        sim / não  (também vale x, ok, 1)."],
        [],
        ["Na aba RESULTADO, informe o pódio e quanto vale cada colocação."],
        ["  COLOCACAO   1, 2, 3… quantas o clube premiar."],
        ["  PERCENTUAL  quanto do bolo vai para aquela colocação (50, 30, 20…)."],
        ["  Pode acrescentar linhas para 4º, 5º lugar — ou usar só 1º e 2º."],
        ["  Os percentuais não precisam somar 100: o bolo é dividido na proporção."],
        [],
        ["A aba AJUSTES é opcional:"],
        ["  RATEIO  proporcional (quem apostou mais leva mais) ou igual."],
        ["  SOBRA   o que fazer com a fatia de um colocado em que ninguém apostou:"],
        ["          redividir (entre as outras faixas) ou clube."],
        ["  TAXA    % do bolo que fica com o clube antes da divisão."],
        [],
        ["Depois é só importar em ⚙️ → Planilha → Importar planilha."],
        ["Os nomes das abas e das colunas podem estar em qualquer ordem."],
      ],
      Apostas: [
        CAB_APOSTAS.slice(),
        [exemplo, "01/09/2026", "Zé", "Ana", 100, "sim"],
        ["", "", "Zé", "Bruno", 300, "não"],
        ["", "", "Rui", "Carla", 200, "sim"],
        ["", "", "Kiko", "Davi", 100, "sim"],
        ["", "", "Tito", "Elza", 400, "não"],
      ],
      Resultado: [
        CAB_RESULTADO.slice(),
        [exemplo, 1, "Zé", 50],
        ["", 2, "Rui", 30],
        ["", 3, "Kiko", 20],
      ],
      Ajustes: [CAB_AJUSTES.slice(), [exemplo, "proporcional", "redividir", 0]],
    };
  }

  return { importar, exportar, modelo, dataISO, percentual, ehSim, valorCent, acharCabecalho };
});
