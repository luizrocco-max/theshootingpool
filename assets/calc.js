/* ═══════════════════════════════════════════════════════════════════════════
   The Shooting Pool — motor de cálculo
   ───────────────────────────────────────────────────────────────────────────
   Código puro (sem tela, sem internet): recebe uma competição e devolve
   quanto cada apostador ganha e quanto cada um paga/recebe no acerto.

   Regra do clube:
     • O bolo é a soma de TODAS as apostas (pagas e não pagas).
     • 50% vai para quem apostou no 1º colocado, 30% no 2º, 20% no 3º.
     • Dentro de cada faixa o dinheiro é dividido entre os apostadores daquele
       atirador — proporcional ao valor apostado (padrão) ou em partes iguais.
     • Quem não pagou a aposta e ganhou prêmio tem o valor abatido: o acerto é
       sempre líquido (saldo = prêmio − o que ele ainda deve).

   Todo dinheiro circula aqui em CENTAVOS (número inteiro) para nunca dar
   diferença de arredondamento. A soma dos prêmios sempre fecha com o bolo.
═══════════════════════════════════════════════════════════════════════════ */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.Calc = api;
})(typeof self !== "undefined" ? self : globalThis, function () {
  "use strict";

  /* ─────────────────────────────── regra ─────────────────────────────── */

  const REGRA_PADRAO = {
    premios: [50, 30, 20], // % para 1º, 2º e 3º colocado
    rateio: "proporcional", // "proporcional" (por valor apostado) | "igual"
    sobra: "redistribuir", // faixa sem apostador: "redistribuir" | "clube"
    taxaClube: 0, // % do bolo retido pelo clube antes da divisão
  };

  function regraDe(comp) {
    const r = Object.assign({}, REGRA_PADRAO, (comp && comp.regra) || {});
    const p = Array.isArray(r.premios) ? r.premios.slice(0, 3) : [];
    while (p.length < 3) p.push(0);
    r.premios = p.map((x) => Math.max(0, Number(x) || 0));
    r.rateio = r.rateio === "igual" ? "igual" : "proporcional";
    r.sobra = r.sobra === "clube" ? "clube" : "redistribuir";
    r.taxaClube = Math.min(100, Math.max(0, Number(r.taxaClube) || 0));
    return r;
  }

  /* ────────────────────────────── dinheiro ───────────────────────────── */

  /** Reais (número) → centavos (inteiro). */
  function cent(v) {
    const n = Number(v);
    return Number.isFinite(n) ? Math.round(n * 100) : 0;
  }

  /** Centavos → reais (número), para gravar no JSON. */
  function reais(c) {
    return Math.round(c) / 100;
  }

  /** Centavos → "R$ 1.234,56". */
  function fmt(c) {
    const n = Math.round(Number(c) || 0);
    const s = (Math.abs(n) / 100).toFixed(2).replace(".", ",");
    return (n < 0 ? "-R$ " : "R$ ") + s.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  }

  /** Texto digitado ("1.234,56", "1234.56", "50", "R$ 50") → centavos. */
  function parseValor(txt) {
    if (typeof txt === "number") return cent(txt);
    let s = String(txt == null ? "" : txt).trim();
    if (!s) return 0;
    s = s.replace(/[R$\s ]/gi, "");
    const temVirgula = s.includes(",");
    const temPonto = s.includes(".");
    if (temVirgula && temPonto) s = s.replace(/\./g, "").replace(",", ".");
    else if (temVirgula) s = s.replace(",", ".");
    // só ponto: "1.234" é milhar, "12.5" é decimal
    else if (temPonto && /^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
    const n = parseFloat(s);
    return Number.isFinite(n) ? cent(n) : 0;
  }

  /* ─────────────────────────────── nomes ─────────────────────────────── */

  /** Limpa espaços sobrando, mantendo o nome como a pessoa escreveu. */
  function norm(nome) {
    return String(nome == null ? "" : nome).replace(/\s+/g, " ").trim();
  }

  /** Chave de comparação: "João  da Silva" e "joao da silva" são a mesma pessoa. */
  function chave(nome) {
    const s = norm(nome).normalize("NFD");
    let out = "";
    for (const ch of s) {
      const c = ch.codePointAt(0);
      if (c >= 0x300 && c <= 0x36f) continue; // acento solto separado pelo NFD
      out += ch;
    }
    return out.toUpperCase();
  }

  /* ──────────────────────────── rateio exato ─────────────────────────── */

  /**
   * Divide `total` centavos entre `pesos`, sem perder nem inventar centavo.
   * Sobras vão para os maiores restos (método do maior resto).
   */
  function distribuir(total, pesos) {
    const n = pesos.length;
    const out = new Array(n).fill(0);
    if (!n || !total) return out;

    const soma = pesos.reduce((a, b) => a + b, 0);
    if (soma <= 0) {
      // ninguém tem peso: divide igualmente
      const q = Math.floor(total / n);
      let resto = total - q * n;
      for (let i = 0; i < n; i++) out[i] = q + (i < resto ? 1 : 0);
      return out;
    }

    const restos = [];
    let alocado = 0;
    for (let i = 0; i < n; i++) {
      const exato = (total * pesos[i]) / soma;
      const piso = Math.floor(exato);
      out[i] = piso;
      alocado += piso;
      restos.push({ i, resto: exato - piso, peso: pesos[i] });
    }
    restos.sort((a, b) => b.resto - a.resto || b.peso - a.peso || a.i - b.i);
    for (let k = 0, falta = total - alocado; k < falta; k++) out[restos[k % n].i] += 1;
    return out;
  }

  /* ──────────────────────────── apostas ──────────────────────────────── */

  /** Normaliza a lista de apostas e descarta linhas incompletas. */
  function apostasDe(comp) {
    return ((comp && comp.apostas) || [])
      .map((a, i) => ({
        id: a.id || "a" + i,
        atirador: norm(a.atirador),
        apostador: norm(a.apostador),
        valorC: cent(a.valor),
        pago: !!a.pago,
        pagoAuto: !!a.pagoAuto,
        ordem: i,
      }))
      .filter((a) => a.valorC > 0 && a.atirador && a.apostador);
  }

  function agrupar(itens, fn) {
    const mapa = new Map();
    for (const it of itens) {
      const k = fn(it);
      if (!mapa.has(k)) mapa.set(k, []);
      mapa.get(k).push(it);
    }
    return mapa;
  }

  /* ─────────────────────────────── cálculo ───────────────────────────── */

  /**
   * Conta completa de uma competição.
   * @returns {{
   *   pote:number, taxaC:number, poteLiquidoC:number, sobraClubeC:number,
   *   receitaClubeC:number, faixas:Array, apostas:Array, apostadores:Array,
   *   totais:Object, alertas:Array<string>, fecha:boolean
   * }}
   */
  function calcular(comp) {
    const regra = regraDe(comp);
    const apostas = apostasDe(comp);
    const acertos = (comp && comp.acertos) || {};
    const alertas = [];

    const pote = apostas.reduce((s, a) => s + a.valorC, 0);
    const taxaC = Math.floor((pote * regra.taxaClube) / 100);
    const poteLiquidoC = pote - taxaC;

    // ── pódio: uma faixa por colocação ──────────────────────────────────
    const podio = [0, 1, 2].map((i) => norm(((comp && comp.resultado) || [])[i] || ""));
    // um atirador não pode ocupar duas colocações: vale a melhor delas
    const jaNoPodio = new Set();
    const faixas = podio.map((atirador, i) => {
      const repetida = !!atirador && jaNoPodio.has(chave(atirador));
      if (atirador) jaNoPodio.add(chave(atirador));
      const doAtirador =
        atirador && !repetida ? apostas.filter((a) => chave(a.atirador) === chave(atirador)) : [];
      return {
        posicao: i + 1,
        atirador,
        repetida,
        pct: regra.premios[i],
        apostas: doAtirador,
        apostadoC: doAtirador.reduce((s, a) => s + a.valorC, 0),
        ativa: !!atirador && !repetida && doAtirador.length > 0 && regra.premios[i] > 0,
        valorC: 0,
        apostadores: [],
      };
    });

    const definido = podio.some(Boolean);
    for (let i = 0; i < 3; i++) {
      for (let j = i + 1; j < 3; j++) {
        if (podio[i] && chave(podio[i]) === chave(podio[j]))
          alertas.push(
            `${podio[i]} está no ${i + 1}º e no ${j + 1}º lugar ao mesmo tempo — corrija o pódio.`
          );
      }
    }
    if (definido && podio.some((p) => !p))
      alertas.push("Pódio incompleto: falta indicar algum colocado.");
    faixas.forEach((f) => {
      if (f.atirador && !f.repetida && !f.apostas.length)
        alertas.push(
          `Ninguém apostou em ${f.atirador} (${f.posicao}º lugar) — os ${f.pct}% ` +
            (regra.sobra === "clube" ? "ficaram com o clube." : "foram redivididos entre as outras faixas.")
        );
    });

    // ── quanto vai para cada faixa ──────────────────────────────────────
    const ativas = faixas.filter((f) => f.ativa);
    let sobraClubeC = 0;
    if (ativas.length) {
      if (regra.sobra === "redistribuir") {
        const valores = distribuir(poteLiquidoC, ativas.map((f) => f.pct));
        ativas.forEach((f, i) => (f.valorC = valores[i]));
      } else {
        const pctTotal = regra.premios.reduce((a, b) => a + b, 0) || 100;
        let usado = 0;
        ativas.forEach((f) => {
          f.valorC = Math.floor((poteLiquidoC * f.pct) / pctTotal);
          usado += f.valorC;
        });
        sobraClubeC = poteLiquidoC - usado;
      }
    } else {
      sobraClubeC = poteLiquidoC; // sem resultado ainda: nada distribuído
    }
    faixas.forEach((f) => {
      f.pctEfetivo = poteLiquidoC ? (f.valorC / poteLiquidoC) * 100 : 0;
    });

    // ── divisão dentro de cada faixa ────────────────────────────────────
    const premioPorAposta = new Map();
    ativas.forEach((f) => {
      const grupos = [...agrupar(f.apostas, (a) => chave(a.apostador)).values()];
      const pesos = grupos.map((g) =>
        regra.rateio === "igual" ? 1 : g.reduce((s, a) => s + a.valorC, 0)
      );
      const valores = distribuir(f.valorC, pesos);
      grupos.forEach((g, i) => {
        const apostadoC = g.reduce((s, a) => s + a.valorC, 0);
        f.apostadores.push({
          nome: g[0].apostador,
          chave: chave(g[0].apostador),
          apostadoC,
          premioC: valores[i],
        });
        // reparte o prêmio do apostador entre as apostas dele nessa faixa
        const porAposta = distribuir(valores[i], g.map((a) => a.valorC));
        g.forEach((a, k) => premioPorAposta.set(a.ordem, porAposta[k]));
      });
      f.apostadores.sort((a, b) => b.premioC - a.premioC || a.nome.localeCompare(b.nome, "pt-BR"));
    });

    // ── acerto de contas, por apostador ─────────────────────────────────
    const porApostador = new Map();
    apostas.forEach((a) => {
      const k = chave(a.apostador);
      if (!porApostador.has(k))
        porApostador.set(k, {
          nome: a.apostador,
          chave: k,
          apostadoC: 0,
          pagoC: 0,
          devendoC: 0,
          premioC: 0,
          apostas: [],
          acertado: !!acertos[k],
          acertadoEm: acertos[k] && acertos[k].em ? acertos[k].em : null,
        });
      const p = porApostador.get(k);
      const premioC = premioPorAposta.get(a.ordem) || 0;
      p.apostadoC += a.valorC;
      if (a.pago) p.pagoC += a.valorC;
      else p.devendoC += a.valorC;
      p.premioC += premioC;
      p.apostas.push(Object.assign({ premioC }, a));
    });

    const apostadores = [...porApostador.values()].map((p) => {
      p.saldoC = p.premioC - p.devendoC; // + clube paga · − apostador paga
      p.lucroC = p.premioC - p.apostadoC; // resultado da aposta em si
      return p;
    });
    apostadores.sort(
      (a, b) => b.premioC - a.premioC || b.apostadoC - a.apostadoC || a.nome.localeCompare(b.nome, "pt-BR")
    );

    // ── totais ──────────────────────────────────────────────────────────
    const soma = (f) => apostadores.reduce((s, p) => s + f(p), 0);
    const abertos = apostadores.filter((p) => !p.acertado);
    const totais = {
      apostadoC: pote,
      pagoC: soma((p) => p.pagoC),
      devendoC: soma((p) => p.devendoC),
      premiosC: soma((p) => p.premioC),
      aPagarC: abertos.reduce((s, p) => s + Math.max(0, p.saldoC), 0),
      aReceberC: abertos.reduce((s, p) => s + Math.max(0, -p.saldoC), 0),
      nApostas: apostas.length,
      nApostadores: apostadores.length,
      nAtiradores: new Set(apostas.map((a) => chave(a.atirador))).size,
    };
    // caixa do clube ao fim de tudo: taxa + sobras não distribuídas
    const receitaClubeC = taxaC + sobraClubeC * (ativas.length ? 1 : 0);

    // conferência: nada pode sumir nem aparecer do nada
    const fecha = totais.premiosC + taxaC + sobraClubeC === pote;
    if (!fecha) alertas.push("Erro interno de arredondamento — avise o desenvolvedor.");

    return {
      regra,
      pote,
      taxaC,
      poteLiquidoC,
      sobraClubeC,
      receitaClubeC,
      faixas,
      apostas: apostas.map((a) => Object.assign({ premioC: premioPorAposta.get(a.ordem) || 0 }, a)),
      apostadores,
      totais,
      alertas,
      definido,
      fecha,
    };
  }

  /* ─────────────────────────── simulação (odds) ──────────────────────── */

  /**
   * Antes do resultado: quanto os apostadores de cada atirador levariam se ele
   * terminasse em 1º, 2º ou 3º. `retorno` é quanto volta por R$ 1 apostado.
   */
  function simular(comp) {
    const regra = regraDe(comp);
    const apostas = apostasDe(comp);
    const pote = apostas.reduce((s, a) => s + a.valorC, 0);
    const poteLiquidoC = pote - Math.floor((pote * regra.taxaClube) / 100);
    const pctTotal = regra.premios.reduce((a, b) => a + b, 0) || 100;

    const grupos = [...agrupar(apostas, (a) => chave(a.atirador)).values()];
    return grupos
      .map((g) => {
        const apostadoC = g.reduce((s, a) => s + a.valorC, 0);
        const premios = regra.premios.map((pct) => Math.floor((poteLiquidoC * pct) / pctTotal));
        return {
          atirador: g[0].atirador,
          apostadoC,
          nApostas: g.length,
          nApostadores: new Set(g.map((a) => chave(a.apostador))).size,
          premios,
          retorno: premios.map((v) => (apostadoC ? v / apostadoC : 0)),
        };
      })
      .sort((a, b) => b.apostadoC - a.apostadoC || a.atirador.localeCompare(b.atirador, "pt-BR"));
  }

  /* ────────────────────────── visão da temporada ─────────────────────── */

  /** Consolida todas as competições: apostadores, atiradores e pendências. */
  function temporada(dados) {
    const comps = ((dados && dados.competicoes) || []).map((c) => ({
      comp: c,
      conta: calcular(c),
    }));

    const apostadores = new Map();
    const atiradores = new Map();

    comps.forEach(({ comp, conta }) => {
      conta.apostadores.forEach((p) => {
        if (!apostadores.has(p.chave))
          apostadores.set(p.chave, {
            nome: p.nome,
            chave: p.chave,
            apostadoC: 0,
            premioC: 0,
            lucroC: 0,
            pendenteC: 0,
            competicoes: 0,
            premiadas: 0,
          });
        const t = apostadores.get(p.chave);
        t.nome = p.nome;
        t.apostadoC += p.apostadoC;
        t.premioC += p.premioC;
        t.lucroC += p.lucroC;
        t.competicoes += 1;
        if (p.premioC > 0) t.premiadas += 1;
        if (!p.acertado) t.pendenteC += p.saldoC;
      });

      conta.apostas.forEach((a) => {
        const k = chave(a.atirador);
        if (!atiradores.has(k))
          atiradores.set(k, {
            nome: a.atirador,
            chave: k,
            apostadoC: 0,
            nApostas: 0,
            podios: [0, 0, 0],
            competicoes: new Set(),
          });
        const t = atiradores.get(k);
        t.nome = a.atirador;
        t.apostadoC += a.valorC;
        t.nApostas += 1;
        t.competicoes.add(comp.id);
      });
      conta.faixas.forEach((f) => {
        if (!f.atirador) return;
        const k = chave(f.atirador);
        if (!atiradores.has(k))
          atiradores.set(k, {
            nome: f.atirador,
            chave: k,
            apostadoC: 0,
            nApostas: 0,
            podios: [0, 0, 0],
            competicoes: new Set(),
          });
        atiradores.get(k).podios[f.posicao - 1] += 1;
      });
    });

    const listaApostadores = [...apostadores.values()].sort(
      (a, b) => b.lucroC - a.lucroC || b.premioC - a.premioC || a.nome.localeCompare(b.nome, "pt-BR")
    );
    const listaAtiradores = [...atiradores.values()]
      .map((t) => Object.assign({}, t, { competicoes: t.competicoes.size }))
      .sort(
        (a, b) =>
          b.podios[0] - a.podios[0] ||
          b.apostadoC - a.apostadoC ||
          a.nome.localeCompare(b.nome, "pt-BR")
      );

    const totais = {
      competicoes: comps.length,
      movimentadoC: comps.reduce((s, c) => s + c.conta.pote, 0),
      premiosC: comps.reduce((s, c) => s + c.conta.totais.premiosC, 0),
      clubeC: comps.reduce((s, c) => s + c.conta.receitaClubeC, 0),
      aPagarC: comps.reduce((s, c) => s + c.conta.totais.aPagarC, 0),
      aReceberC: comps.reduce((s, c) => s + c.conta.totais.aReceberC, 0),
    };

    return { comps, apostadores: listaApostadores, atiradores: listaAtiradores, totais };
  }

  return {
    REGRA_PADRAO,
    regraDe,
    cent,
    reais,
    fmt,
    parseValor,
    norm,
    chave,
    distribuir,
    calcular,
    simular,
    temporada,
  };
});
