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
       sempre líquido (saldo = prêmio − a cota dele + o que ele pôs).
     • Um lance pode ser rachado entre sócios, com um deles bancando o valor
       inteiro: quem adiantou recebe a diferença de volta no acerto.

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

  const MAX_COLOCACOES = 20;

  const REGRA_PADRAO = {
    // uma porcentagem por colocação premiada — quantas o clube quiser
    premios: [50, 30, 20],
    rateio: "proporcional", // "proporcional" (por valor apostado) | "igual"
    sobra: "redistribuir", // faixa sem apostador: "redistribuir" | "clube"
    taxaClube: 0, // % do bolo retido pelo clube antes da divisão
    // lance com sócios: divide o prêmio pelas cotas de cada um ("cotas") ou
    // entrega tudo a quem bancou o lance ("pagador")
    socios: "cotas",
    // true: quem ganhou e não pagou tem o lance abatido do prêmio (um acerto
    // líquido só). false: paga o lance e recebe o prêmio em movimentos
    // separados, para o caixa registrar as duas coisas.
    abate: true,
  };

  function regraDe(comp) {
    const r = Object.assign({}, REGRA_PADRAO, (comp && comp.regra) || {});
    const p = (Array.isArray(r.premios) ? r.premios : [])
      .slice(0, MAX_COLOCACOES)
      .map((x) => Math.max(0, Number(x) || 0));
    r.premios = p.length ? p : REGRA_PADRAO.premios.slice();
    r.rateio = r.rateio === "igual" ? "igual" : "proporcional";
    r.sobra = r.sobra === "clube" ? "clube" : "redistribuir";
    r.socios = r.socios === "pagador" ? "pagador" : "cotas";
    r.abate = r.abate !== false;
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

  /**
   * Percentual → texto curto: "50", "8,3333", "12,5".
   * Dividir 50% igualmente entre seis colocações dá 8,333333333333334 — o
   * número exato da conta, mas ilegível num relatório. Aqui ele vira
   * "8,3333"; a conta continua sendo feita com o valor cheio.
   */
  function pct(n) {
    const v = Number(n);
    if (!Number.isFinite(v)) return "0";
    return String(Math.round(v * 1e4) / 1e4).replace(".", ",");
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

  /**
   * Quem está dentro de um lance e com quanto.
   *
   * Um lance pode ser de uma pessoa só (o caso comum) ou ter sócios: várias
   * pessoas rachando o mesmo lance, com um deles podendo ter bancado o valor
   * inteiro. Por isso cada participação guarda duas coisas diferentes:
   *   cotaC  — quanto daquele lance é dela (a parte que ela deve)
   *   pagoC  — quanto ela efetivamente pôs do próprio bolso
   * Quem bancou a parte do outro fica com pagoC maior que a cota, e recebe
   * essa diferença de volta no acerto.
   */
  function participacoesDe(a, valorC, modoPadrao) {
    const socios = (Array.isArray(a.socios) ? a.socios : []).filter((s) => s && norm(s.nome));

    if (!socios.length) {
      const nome = norm(a.apostador);
      if (!nome) return []; // lance sem dono: a linha é descartada
      const pagoC = a.pago ? valorC : 0;
      return [{ nome, chave: chave(nome), cotaC: valorC, pagoC, pesoPremioC: valorC }];
    }

    const pesos = socios.map((s) => Math.max(0, Number(s.cota) || 0));
    const cotas = distribuir(valorC, pesos.some((p) => p > 0) ? pesos : socios.map(() => 1));

    let restante = valorC; // o clube nunca recebe mais do que o lance vale
    const partes = socios.map((s, i) => {
      const bruto = s.pagou === true ? cotas[i] : Math.max(0, cent(s.pagou));
      const pagoC = Math.min(bruto, restante);
      restante -= pagoC;
      const nome = norm(s.nome);
      return { nome, chave: chave(nome), cotaC: cotas[i], pagoC };
    });

    const modo = a.premio || modoPadrao;
    const totalPago = partes.reduce((s, p) => s + p.pagoC, 0);
    // um sócio pode ser escolhido para receber o prêmio inteiro
    const escolhido = norm(a.recebedor);
    const temEscolhido = escolhido && partes.some((p) => p.chave === chave(escolhido));
    const concentra = temEscolhido || modo === "pagador";

    // Quando o prêmio vai para uma pessoa só, o lance quitado passa a ser dela
    // nas contas do clube: quem pôs o dinheiro é quem responde por ele. Sem
    // isso, quem bancou ficaria no prejuízo — teria pago sem receber nada.
    // Se o lance ainda não foi quitado, as cotas continuam valendo: a dívida
    // com o clube é de todos os sócios.
    if (concentra && totalPago === valorC && totalPago > 0)
      partes.forEach((p) => { p.cotaC = p.pagoC; });

    // peso do prêmio: o escolhido leva tudo; senão quem pagou; senão a cota
    partes.forEach((p) => {
      p.pesoPremioC = temEscolhido
        ? p.chave === chave(escolhido) ? valorC : 0
        : modo === "pagador" && totalPago > 0
        ? p.pagoC
        : p.cotaC;
    });

    return partes;
  }

  /** Normaliza a lista de apostas e descarta linhas incompletas. */
  function apostasDe(comp, regra) {
    return ((comp && comp.apostas) || [])
      .map((a, i) => {
        const valorC = cent(a.valor);
        const participacoes = participacoesDe(a, valorC, (regra || {}).socios);
        const pagoC = participacoes.reduce((s, p) => s + p.pagoC, 0);
        return {
          id: a.id || "a" + i,
          atirador: norm(a.atirador),
          apostador: norm(a.apostador) || (participacoes[0] || {}).nome || "",
          valorC,
          participacoes,
          pagoC,
          pago: valorC > 0 && pagoC >= valorC,
          parcial: pagoC > 0 && pagoC < valorC,
          temSocios: participacoes.length > 1,
          premio: a.premio === "pagador" || a.premio === "cotas" ? a.premio : null,
          pagoAuto: !!a.pagoAuto,
          ordem: i,
        };
      })
      .filter((a) => a.valorC > 0 && a.atirador && a.participacoes.length);
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
    const apostas = apostasDe(comp, regra);
    const acertos = (comp && comp.acertos) || {};
    const alertas = [];

    const pote = apostas.reduce((s, a) => s + a.valorC, 0);
    const taxaC = Math.floor((pote * regra.taxaClube) / 100);
    const poteLiquidoC = pote - taxaC;

    // ── pódio: uma faixa por colocação ──────────────────────────────────
    const resultado = (comp && comp.resultado) || [];
    const podio = regra.premios.map((_, i) => norm(resultado[i] || ""));
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
    for (let i = 0; i < podio.length; i++) {
      for (let j = i + 1; j < podio.length; j++) {
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
    const premioPorPessoa = new Map(); // chave → centavos
    const somaPremio = (chaveP, valor) =>
      premioPorPessoa.set(chaveP, (premioPorPessoa.get(chaveP) || 0) + valor);

    ativas.forEach((f) => {
      // uma entrada por pessoa dentro de cada lance da faixa
      const partes = [];
      f.apostas.forEach((a) =>
        a.participacoes.forEach((p) => {
          if (p.pesoPremioC > 0) partes.push({ aposta: a, p, peso: p.pesoPremioC });
        })
      );

      let valores;
      if (regra.rateio === "igual") {
        // partes iguais entre as pessoas da faixa, não entre os lances
        const porPessoa = [...agrupar(partes, (x) => x.p.chave).values()];
        const fatias = distribuir(f.valorC, porPessoa.map(() => 1));
        valores = new Array(partes.length).fill(0);
        porPessoa.forEach((grupo, i) => {
          // se a pessoa está em mais de um lance da faixa, divide pela cota
          const dentro = distribuir(fatias[i], grupo.map((x) => x.peso));
          grupo.forEach((x, k) => (valores[partes.indexOf(x)] = dentro[k]));
        });
      } else {
        valores = distribuir(f.valorC, partes.map((x) => x.peso));
      }

      const porPessoaFaixa = new Map();
      partes.forEach((x, i) => {
        const premio = valores[i];
        premioPorAposta.set(x.aposta.ordem, (premioPorAposta.get(x.aposta.ordem) || 0) + premio);
        somaPremio(x.p.chave, premio);
        if (!porPessoaFaixa.has(x.p.chave))
          porPessoaFaixa.set(x.p.chave, { nome: x.p.nome, chave: x.p.chave, apostadoC: 0, premioC: 0 });
        const alvo = porPessoaFaixa.get(x.p.chave);
        alvo.apostadoC += x.p.cotaC;
        alvo.premioC += premio;
      });
      f.apostadores = [...porPessoaFaixa.values()].sort(
        (a, b) => b.premioC - a.premioC || a.nome.localeCompare(b.nome, "pt-BR")
      );
    });

    // ── acerto de contas, por pessoa ────────────────────────────────────
    const porApostador = new Map();
    apostas.forEach((a) => {
      a.participacoes.forEach((part) => {
        const k = part.chave;
        if (!porApostador.has(k))
          porApostador.set(k, {
            nome: part.nome,
            chave: k,
            apostadoC: 0, // a soma das cotas: o que é dela nos lances
            pagoC: 0, // o que ela pôs do bolso
            devendoC: 0, // cota que ainda não pagou
            adiantadoC: 0, // o que pagou além da própria cota
            premioC: 0,
            apostas: [],
            acertado: !!acertos[k],
            acertadoEm: acertos[k] && acertos[k].em ? acertos[k].em : null,
          });
        const p = porApostador.get(k);
        p.apostadoC += part.cotaC;
        p.pagoC += part.pagoC;
        p.apostas.push(
          Object.assign({ cotaC: part.cotaC, pagoPelaPessoaC: part.pagoC }, a, {
            premioC: premioPorAposta.get(a.ordem) || 0,
          })
        );
      });
    });

    const apostadores = [...porApostador.values()].map((p) => {
      p.premioC = premioPorPessoa.get(p.chave) || 0;
      const diferenca = p.apostadoC - p.pagoC;
      p.devendoC = Math.max(0, diferenca); // ainda deve
      p.adiantadoC = Math.max(0, -diferenca); // bancou pelos sócios
      // + o clube (ou outro apostador) paga a ela · − ela paga
      p.saldoC = p.premioC - p.apostadoC + p.pagoC;
      p.lucroC = p.premioC - p.apostadoC; // resultado da aposta em si
      // sócio que ficou de fora das contas do clube (o prêmio do lance foi
      // para outro): não deve nem recebe nada aqui, acerta direto com o sócio
      p.foraDoCaixa =
        p.apostas.length > 0 && p.apostadoC === 0 && p.pagoC === 0 && p.premioC === 0;
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
      adiantadoC: soma((p) => p.adiantadoC),
      premiosC: soma((p) => p.premioC),
      nSocios: apostas.filter((a) => a.temSocios).length,
      aPagarC: abertos.reduce((s, p) => s + Math.max(0, p.saldoC), 0),
      aReceberC: abertos.reduce((s, p) => s + Math.max(0, -p.saldoC), 0),
      // sem abate, cada ponta é um movimento próprio
      brutoPagarC: abertos.reduce((s, p) => s + p.premioC + p.adiantadoC, 0),
      brutoReceberC: abertos.reduce((s, p) => s + p.devendoC, 0),
      nApostas: apostas.length,
      nApostadores: apostadores.length,
      nAtiradores: new Set(apostas.map((a) => chave(a.atirador))).size,
    };
    // caixa do clube ao fim de tudo: taxa + sobras não distribuídas
    const receitaClubeC = taxaC + sobraClubeC * (ativas.length ? 1 : 0);

    // conferência: nada pode sumir nem aparecer do nada
    const fecha = totais.premiosC + taxaC + sobraClubeC === pote;
    if (!fecha) alertas.push("Erro interno de arredondamento — avise o desenvolvedor.");

    // quem paga quem: no menor número de transferências, ou tudo em separado
    const saldosAcerto = saldosEmAberto({ apostadores }, NOME_CAIXA);
    const acerto = regra.abate
      ? pagamentos(saldosAcerto)
      : acertoBruto(apostadores, NOME_CAIXA);

    return {
      saldosAcerto,
      acerto,
      abate: regra.abate,
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

  /* ══════════════════ quem paga quem, no menor número ═══════════════ */

  const NOME_CAIXA = "Caixa do clube";

  /**
   * Recebe saldos que somam zero e devolve a lista de pagamentos que quita
   * todo mundo — procurando o menor número de transferências.
   *
   * Sem isso, cada pessoa acerta com o caixa: são tantas transferências
   * quantas pessoas. Aqui, quem deve paga direto quem tem a receber, e o
   * caixa só entra no que sobrar.
   *
   * O caminho é: primeiro os pares que se anulam exatamente (uma
   * transferência cada, sempre o melhor possível), depois os trios que
   * fecham em zero, e o resto no guloso — o maior devedor paga o maior
   * credor. Cada passo zera pelo menos uma pessoa, então nunca passa de
   * (participantes − 1) pagamentos.
   *
   * @param {Array<{nome:string, saldoC:number}>} saldos
   * @returns {{pagamentos:Array<{de:string,para:string,valorC:number}>,
   *            participantes:number, fecha:boolean}}
   */
  function pagamentos(saldos) {
    const pessoas = (saldos || [])
      .map((s) => ({ nome: norm(s.nome), saldo: Math.round(Number(s.saldoC) || 0) }))
      .filter((p) => p.saldo !== 0 && p.nome);

    const total = pessoas.reduce((s, p) => s + p.saldo, 0);
    if (total !== 0) return { pagamentos: [], participantes: pessoas.length, fecha: false };

    const transferencias = [];
    const quita = (devedor, credor) => {
      const valor = Math.min(-devedor.saldo, credor.saldo);
      if (valor <= 0) return;
      devedor.saldo += valor;
      credor.saldo -= valor;
      transferencias.push({ de: devedor.nome, para: credor.nome, valorC: valor });
    };
    const vivos = () => pessoas.filter((p) => p.saldo !== 0);

    // 1) pares que se anulam: uma transferência resolve os dois
    for (const d of pessoas) {
      if (d.saldo >= 0) continue;
      const c = pessoas.find((x) => x.saldo > 0 && x.saldo === -d.saldo);
      if (c) quita(d, c);
    }

    // 2) trios que fecham em zero: duas transferências resolvem os três
    for (let voltas = 0; voltas < pessoas.length; voltas++) {
      const restantes = vivos();
      let achou = null;
      for (let i = 0; i < restantes.length && !achou; i++)
        for (let j = i + 1; j < restantes.length && !achou; j++)
          for (let k = j + 1; k < restantes.length && !achou; k++)
            if (restantes[i].saldo + restantes[j].saldo + restantes[k].saldo === 0)
              achou = [restantes[i], restantes[j], restantes[k]];
      if (!achou) break;
      const devedores = achou.filter((p) => p.saldo < 0).sort((a, b) => a.saldo - b.saldo);
      const credores = achou.filter((p) => p.saldo > 0).sort((a, b) => b.saldo - a.saldo);
      for (const d of devedores) for (const c of credores) if (d.saldo < 0 && c.saldo > 0) quita(d, c);
    }

    // 3) o que sobrou: o maior devedor paga o maior credor
    for (;;) {
      const restantes = vivos();
      if (!restantes.length) break;
      const devedor = restantes.filter((p) => p.saldo < 0).sort((a, b) => a.saldo - b.saldo)[0];
      const credor = restantes.filter((p) => p.saldo > 0).sort((a, b) => b.saldo - a.saldo)[0];
      if (!devedor || !credor) break; // não deveria acontecer com soma zero
      quita(devedor, credor);
    }

    transferencias.sort((a, b) => b.valorC - a.valorC || a.de.localeCompare(b.de, "pt-BR"));
    return {
      pagamentos: transferencias,
      participantes: (saldos || []).filter((s) => Math.round(Number(s.saldoC) || 0) !== 0).length,
      fecha: !vivos().length,
    };
  }

  /**
   * Monta a lista de acertos em aberto de uma competição, já com o caixa do
   * clube: ele guarda o dinheiro das apostas pagas, então participa do
   * rateio como qualquer um.
   */
  /**
   * Acerto sem abate: em vez de um saldo líquido por pessoa, cada movimento
   * aparece por inteiro — quem deve o lance paga o lance, e recebe o prêmio
   * à parte. Dá mais transferências, mas o caixa registra as duas pontas.
   */
  function acertoBruto(apostadores, nomeCaixa) {
    const caixa = nomeCaixa || NOME_CAIXA;
    const lista = [];
    (apostadores || [])
      .filter((p) => !p.acertado)
      .forEach((p) => {
        if (p.devendoC > 0) lista.push({ de: p.nome, para: caixa, valorC: p.devendoC });
        if (p.adiantadoC > 0) lista.push({ de: caixa, para: p.nome, valorC: p.adiantadoC });
        if (p.premioC > 0) lista.push({ de: caixa, para: p.nome, valorC: p.premioC });
      });
    lista.sort((a, b) => b.valorC - a.valorC || a.de.localeCompare(b.de, "pt-BR"));
    return {
      pagamentos: lista,
      participantes: new Set(lista.flatMap((t) => [t.de, t.para])).size,
      fecha: true,
      bruto: true,
    };
  }

  function saldosEmAberto(conta, nomeCaixa) {
    const abertos = conta.apostadores.filter((p) => !p.acertado && p.saldoC !== 0);
    const soma = abertos.reduce((s, p) => s + p.saldoC, 0);
    const lista = abertos.map((p) => ({ nome: p.nome, chave: p.chave, saldoC: p.saldoC }));
    if (soma !== 0) lista.push({ nome: nomeCaixa || NOME_CAIXA, caixa: true, saldoC: -soma });
    return lista;
  }

  /* ─────────────────────────── simulação (odds) ──────────────────────── */

  /**
   * Antes do resultado: quanto os apostadores de cada atirador levariam se ele
   * terminasse em 1º, 2º ou 3º. `retorno` é quanto volta por R$ 1 apostado.
   */
  function simular(comp) {
    const regra = regraDe(comp);
    const apostas = apostasDe(comp, regra);
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
            emAberto: [],
          });
        const t = apostadores.get(p.chave);
        t.nome = p.nome;
        t.apostadoC += p.apostadoC;
        t.premioC += p.premioC;
        t.lucroC += p.lucroC;
        t.competicoes += 1;
        if (p.premioC > 0) t.premiadas += 1;
        if (!p.acertado) {
          t.pendenteC += p.saldoC;
          if (p.saldoC !== 0)
            t.emAberto.push({ competicao: comp.nome, data: comp.data, saldoC: p.saldoC });
        }
      });

      conta.apostas.forEach((a) => {
        const k = chave(a.atirador);
        if (!atiradores.has(k))
          atiradores.set(k, {
            nome: a.atirador,
            chave: k,
            apostadoC: 0,
            nApostas: 0,
            podios: [],
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
            podios: [],
            competicoes: new Set(),
          });
        const alvo = atiradores.get(k).podios;
        while (alvo.length < f.posicao) alvo.push(0);
        alvo[f.posicao - 1] += 1;
      });
    });

    const listaApostadores = [...apostadores.values()].sort(
      (a, b) => b.lucroC - a.lucroC || b.premioC - a.premioC || a.nome.localeCompare(b.nome, "pt-BR")
    );
    // quantas colocações a temporada chegou a premiar (as competições podem diferir)
    const maxColocacoes = [...atiradores.values()].reduce((m, t) => Math.max(m, t.podios.length), 0);
    const listaAtiradores = [...atiradores.values()]
      .map((t) => {
        const podios = t.podios.slice();
        while (podios.length < maxColocacoes) podios.push(0);
        return Object.assign({}, t, { competicoes: t.competicoes.size, podios });
      })
      .sort(
        (a, b) =>
          (b.podios[0] || 0) - (a.podios[0] || 0) ||
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

    // acerto geral: junta o que está em aberto em todas as competições e
    // resolve tudo de uma vez — quem deve numa e tem a receber noutra acaba
    // com um pagamento só, ou nenhum
    const pendencias = listaApostadores
      .filter((p) => p.pendenteC !== 0)
      .map((p) => ({ nome: p.nome, chave: p.chave, saldoC: p.pendenteC, emAberto: p.emAberto }))
      .sort((a, b) => b.saldoC - a.saldoC || a.nome.localeCompare(b.nome, "pt-BR"));
    const somaPend = pendencias.reduce((s, p) => s + p.saldoC, 0);
    const saldosAcerto = pendencias.map((p) => ({ nome: p.nome, chave: p.chave, saldoC: p.saldoC }));
    if (somaPend !== 0) saldosAcerto.push({ nome: NOME_CAIXA, caixa: true, saldoC: -somaPend });

    return {
      comps,
      apostadores: listaApostadores,
      atiradores: listaAtiradores,
      maxColocacoes,
      pendencias,
      saldosAcerto,
      acerto: pagamentos(saldosAcerto),
      totais,
    };
  }

  /** "1º", "2º", … — rótulo de uma colocação (i começa em 0). */
  function rotuloPosicao(i) {
    return i + 1 + "º";
  }

  return {
    MAX_COLOCACOES,
    NOME_CAIXA,
    REGRA_PADRAO,
    acertoBruto,
    rotuloPosicao,
    pagamentos,
    saldosEmAberto,
    regraDe,
    cent,
    reais,
    fmt,
    pct,
    parseValor,
    norm,
    chave,
    distribuir,
    calcular,
    simular,
    temporada,
  };
});
