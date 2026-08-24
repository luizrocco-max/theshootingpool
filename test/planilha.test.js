/* Testes da ponte com a planilha — rode com:  npm test  */
const test = require("node:test");
const assert = require("node:assert/strict");
const C = require("../assets/calc.js");
const P = require("../assets/planilha.js");

/* ═════════════════════════════ o modelo ══════════════════════════════ */

test("o modelo entregue ao clube é importável de volta", () => {
  const r = P.importar(P.modelo());
  assert.equal(r.competicoes.length, 1);
  const c = r.competicoes[0];
  assert.equal(c.apostas.length, 5);
  assert.equal(c.data, "2026-09-01");
  assert.deepEqual(c.resultado, ["Zé", "Rui", "Kiko"]);
  assert.deepEqual(c.regra.premios, [50, 30, 20]);
  assert.equal(c.regra.rateio, "proporcional");

  // e as contas batem com o exemplo do README
  const conta = C.calcular(c);
  assert.equal(conta.pote, 110000);
  assert.equal(conta.faixas[0].valorC, 55000);
  const bruno = conta.apostadores.find((p) => p.chave === "BRUNO");
  assert.equal(bruno.premioC, 41250);
  assert.equal(bruno.saldoC, 41250 - 30000); // não tinha pago os R$ 300

  // o modelo também mostra um lance rachado: Carla e Luiz no Rui, ela bancou
  const lanceRui = c.apostas.find((a) => a.atirador === "Rui");
  assert.equal(lanceRui.socios.length, 2);
  const carla = conta.apostadores.find((p) => p.chave === "CARLA");
  const luiz = conta.apostadores.find((p) => p.chave === "LUIZ");
  assert.equal(carla.apostadoC, 10000, "a cota dela é metade do lance");
  assert.equal(carla.pagoC, 20000, "mas ela pôs os 200");
  assert.equal(carla.premioC, 16500, "metade dos 30% do 2º lugar");
  assert.equal(carla.saldoC, 16500 - 10000 + 20000, "recebe 265");
  assert.equal(luiz.saldoC, 16500 - 10000, "e o Luiz, 65");
  assert.ok(conta.fecha);
});

/* ═══════════════════════ tolerância na leitura ═══════════════════════ */

test("acha o cabeçalho embaixo de linhas soltas e em qualquer ordem", () => {
  const r = P.importar({
    Apostas: [
      ["Planilha do clube — agosto"],
      [],
      ["APOSTADOR", "R$", "Em quem apostou", "Pagou", "Etapa"],
      ["Ana", "100", "Zé", "sim", "Etapa 1"],
      ["Bruno", "50", "Rui", "não", ""],
    ],
  });
  assert.equal(r.competicoes.length, 1);
  assert.equal(r.competicoes[0].nome, "Etapa 1");
  assert.equal(r.competicoes[0].apostas.length, 2);
  assert.equal(r.competicoes[0].apostas[0].atirador, "Zé");
  assert.equal(r.competicoes[0].apostas[0].valor, 100);
  assert.equal(r.competicoes[0].apostas[1].pago, false);
});

test("nome e data da competição escorrem para as linhas em branco", () => {
  const r = P.importar({
    Apostas: [
      ["COMPETICAO", "DATA", "ATIRADOR", "APOSTADOR", "VALOR", "PAGO"],
      ["Etapa A", "01/08/2026", "Zé", "Ana", 100, "sim"],
      ["", "", "Rui", "Bruno", 100, "sim"],
      ["Etapa B", "15/08/2026", "Zé", "Carla", 100, "sim"],
      ["", "", "Tito", "Davi", 100, "não"],
    ],
  });
  assert.equal(r.competicoes.length, 2);
  assert.equal(r.competicoes[0].apostas.length, 2);
  assert.equal(r.competicoes[0].data, "2026-08-01");
  assert.equal(r.competicoes[1].data, "2026-08-15");
  assert.equal(r.competicoes[1].apostas[1].apostador, "Davi");
});

test("entende os jeitos de escrever 'pago'", () => {
  const sim = [true, 1, "sim", "SIM", "S", "x", "X", "ok", "Pago", "verdadeiro"];
  const nao = [false, 0, "", null, "não", "NAO", "n", "-", "pendente"];
  sim.forEach((v) => assert.equal(P.ehSim(v), true, `${JSON.stringify(v)} deveria ser pago`));
  nao.forEach((v) => assert.equal(P.ehSim(v), false, `${JSON.stringify(v)} não deveria ser pago`));
});

test("entende número, texto brasileiro e R$ na coluna de valor", () => {
  assert.equal(P.valorCent(100), 10000);
  assert.equal(P.valorCent(100.5), 10050);
  assert.equal(P.valorCent("1.234,56"), 123456);
  assert.equal(P.valorCent("R$ 100"), 10000);
  assert.equal(P.valorCent(""), 0);
});

test("entende data em texto, objeto Date e série do Excel", () => {
  assert.equal(P.dataISO("01/09/2026"), "2026-09-01");
  assert.equal(P.dataISO("1/9/26"), "2026-09-01");
  assert.equal(P.dataISO("2026-09-01"), "2026-09-01");
  assert.equal(P.dataISO(new Date(2026, 8, 1)), "2026-09-01");
  assert.equal(P.dataISO(46266), "2026-09-01"); // série do Excel
  assert.equal(P.dataISO(""), "");
});

test("percentual aceita 50, '50%' e o 0,5 do formato percentual do Excel", () => {
  assert.equal(P.percentual(50), 50);
  assert.equal(P.percentual("30%"), 30);
  assert.equal(P.percentual("12,5"), 12.5);
  assert.equal(P.percentual(0.5), 50);
  assert.equal(P.percentual(""), null);
  assert.equal(P.percentual("abc"), null);
});

/* ══════════════════ percentuais e colocações livres ══════════════════ */

test("aceita cinco colocações premiadas com percentuais próprios", () => {
  const r = P.importar({
    Apostas: [
      ["COMPETICAO", "ATIRADOR", "APOSTADOR", "VALOR", "PAGO"],
      ["Etapa 5 lugares", "A", "Ana", 100, "sim"],
      ["", "B", "Bruno", 100, "sim"],
      ["", "C", "Carla", 100, "sim"],
      ["", "D", "Davi", 100, "sim"],
      ["", "E", "Elza", 100, "sim"],
    ],
    Resultado: [
      ["COMPETICAO", "COLOCACAO", "ATIRADOR", "PERCENTUAL"],
      ["Etapa 5 lugares", 1, "A", 40],
      ["", 2, "B", 25],
      ["", 3, "C", 15],
      ["", 4, "D", 12],
      ["", 5, "E", 8],
    ],
  });
  const c = r.competicoes[0];
  assert.deepEqual(c.regra.premios, [40, 25, 15, 12, 8]);
  const conta = C.calcular(c);
  assert.equal(conta.faixas.length, 5);
  assert.equal(conta.faixas[0].valorC, 20000); // 40% de 500
  assert.equal(conta.faixas[4].valorC, 4000); // 8% de 500
  assert.equal(conta.totais.premiosC, conta.pote);
});

test("aceita premiar só o primeiro lugar", () => {
  const r = P.importar({
    Apostas: [
      ["COMPETICAO", "ATIRADOR", "APOSTADOR", "VALOR", "PAGO"],
      ["Só o campeão", "A", "Ana", 100, "sim"],
      ["", "B", "Bruno", 100, "sim"],
    ],
    Resultado: [["COMPETICAO", "COLOCACAO", "ATIRADOR", "PERCENTUAL"], ["Só o campeão", 1, "A", 100]],
  });
  const conta = C.calcular(r.competicoes[0]);
  assert.equal(conta.faixas.length, 1);
  assert.equal(conta.apostadores.find((p) => p.chave === "ANA").premioC, 20000);
});

test("lê os ajustes: rateio igual, sobra do clube e taxa", () => {
  const r = P.importar({
    Apostas: [
      ["COMPETICAO", "ATIRADOR", "APOSTADOR", "VALOR", "PAGO"],
      ["Etapa X", "A", "Ana", 100, "sim"],
    ],
    Ajustes: [["COMPETICAO", "RATEIO", "SOBRA", "TAXA"], ["Etapa X", "igual", "clube", 10]],
  });
  const regra = C.regraDe(r.competicoes[0]);
  assert.equal(regra.rateio, "igual");
  assert.equal(regra.sobra, "clube");
  assert.equal(regra.taxaClube, 10);
});

/* ═══════════════════════════ linhas ruins ════════════════════════════ */

test("avisa sobre linhas incompletas em vez de inventar dados", () => {
  const r = P.importar({
    Apostas: [
      ["COMPETICAO", "ATIRADOR", "APOSTADOR", "VALOR", "PAGO"],
      ["Etapa", "Zé", "Ana", 100, "sim"],
      ["", "", "Bruno", 50, "sim"], // sem atirador
      ["", "Rui", "", 50, "sim"], // sem apostador
      ["", "Rui", "Carla", "", "sim"], // sem valor
      [], // linha vazia: ignorada em silêncio
    ],
  });
  assert.equal(r.competicoes[0].apostas.length, 1);
  assert.equal(r.resumo.ignoradas, 3);
  assert.equal(r.avisos.length, 3);
  assert.ok(r.avisos[0].includes("falta o atirador"));
  assert.ok(r.avisos[1].includes("falta o apostador"));
  assert.ok(r.avisos[2].includes("valor"));
});

test("planilha sem as colunas obrigatórias avisa e não quebra", () => {
  const r = P.importar({ Apostas: [["NOME DO CARA", "GRANA"], ["Ana", 100]] });
  assert.equal(r.competicoes.length, 0);
  assert.ok(r.avisos[0].includes("Apostas"));
});

test("planilha totalmente vazia não quebra", () => {
  const r = P.importar({});
  assert.equal(r.competicoes.length, 0);
  assert.ok(r.avisos.length);
});

/* ═══════════════════════════ ida e volta ═════════════════════════════ */

test("exportar e importar de volta preserva tudo que importa", () => {
  const dados = {
    competicoes: [
      {
        id: "c1",
        nome: "Etapa de agosto",
        data: "2026-08-15",
        regra: { premios: [45, 35, 20], rateio: "igual", sobra: "clube", taxaClube: 5 },
        resultado: ["Zé", "Rui", "Kiko"],
        acertos: {},
        apostas: [
          { id: "a1", atirador: "Zé", apostador: "Ana", valor: 100, pago: true },
          { id: "a2", atirador: "Zé", apostador: "Bruno", valor: 300.5, pago: false },
          { id: "a3", atirador: "Rui", apostador: "Carla", valor: 200, pago: true },
        ],
      },
    ],
  };

  const abas = P.exportar(dados);
  const volta = P.importar(abas).competicoes[0];

  assert.equal(volta.nome, "Etapa de agosto");
  assert.equal(volta.data, "2026-08-15");
  assert.deepEqual(volta.resultado, ["Zé", "Rui", "Kiko"]);
  assert.deepEqual(volta.regra.premios, [45, 35, 20]);
  assert.equal(volta.regra.rateio, "igual");
  assert.equal(volta.regra.sobra, "clube");
  assert.equal(volta.regra.taxaClube, 5);
  assert.equal(volta.apostas.length, 3);
  assert.equal(volta.apostas[1].valor, 300.5);
  assert.equal(volta.apostas[1].pago, false);

  // e as contas dão exatamente o mesmo
  const antes = C.calcular(dados.competicoes[0]);
  const depois = C.calcular(volta);
  assert.equal(antes.pote, depois.pote);
  assert.equal(antes.totais.premiosC, depois.totais.premiosC);
  assert.deepEqual(
    antes.apostadores.map((p) => [p.nome, p.saldoC]),
    depois.apostadores.map((p) => [p.nome, p.saldoC])
  );
});

test("lance com sócios sobrevive à ida e volta pela planilha", () => {
  const dados = {
    competicoes: [
      {
        id: "c1",
        nome: "Etapa do leilão",
        data: "2026-08-15",
        regra: { premios: [100] },
        resultado: ["Atirador A"],
        acertos: {},
        apostas: [
          {
            id: "L1",
            atirador: "Atirador A",
            apostador: "Luiz",
            valor: 500,
            premio: "cotas",
            socios: [
              { nome: "Luiz", cota: 1, pagou: 500 },
              { nome: "João", cota: 1, pagou: 0 },
            ],
          },
          { id: "L2", atirador: "Atirador B", apostador: "Pedro", valor: 500, pago: true },
        ],
      },
    ],
  };

  const volta = P.importar(P.exportar(dados)).competicoes[0];
  const lance = volta.apostas.find((a) => a.atirador === "Atirador A");
  assert.equal(lance.socios.length, 2, "os sócios voltaram");
  assert.deepEqual(lance.socios.map((s) => s.nome), ["Luiz", "João"]);
  assert.equal(lance.socios[0].pagou, 500, "e quem bancou o lance");
  assert.equal(lance.socios[1].pagou, 0);
  assert.equal(lance.premio, "cotas");

  // e a conta dá o mesmo dos dois lados
  const antes = C.calcular(dados.competicoes[0]);
  const depois = C.calcular(volta);
  assert.deepEqual(
    antes.apostadores.map((p) => [p.nome, p.saldoC]).sort(),
    depois.apostadores.map((p) => [p.nome, p.saldoC]).sort()
  );
  assert.equal(depois.apostadores.find((p) => p.chave === "LUIZ").saldoC, 75000);
  assert.equal(depois.apostadores.find((p) => p.chave === "JOAO").saldoC, 25000);
});

test("aba de sócios escrita à mão, com cotas desiguais", () => {
  const r = P.importar({
    Apostas: [
      ["COMPETICAO", "ATIRADOR", "APOSTADOR", "VALOR", "PAGO"],
      ["Etapa", "Atirador A", "Luiz", 500, "sim"],
    ],
    Socios: [
      ["COMPETICAO", "ATIRADOR", "SOCIO", "COTA", "PAGOU", "QUEM LEVA"],
      ["Etapa", "Atirador A", "Luiz", 70, 500, "pagador"],
      ["", "", "João", 30, 0, ""],
    ],
    Resultado: [["COMPETICAO", "COLOCACAO", "ATIRADOR", "PERCENTUAL"], ["Etapa", 1, "Atirador A", 100]],
  });
  const lance = r.competicoes[0].apostas[0];
  assert.equal(lance.socios.length, 2);
  assert.equal(lance.socios[0].cota, 70);
  assert.equal(lance.premio, "pagador");
  // no modo pagador, o Luiz bancou tudo e leva tudo
  const conta = C.calcular(r.competicoes[0]);
  assert.equal(conta.apostadores.find((p) => p.chave === "LUIZ").saldoC, 50000);
});

test("um sócio só na aba não vira lance rachado", () => {
  const r = P.importar({
    Apostas: [
      ["COMPETICAO", "ATIRADOR", "APOSTADOR", "VALOR", "PAGO"],
      ["Etapa", "Atirador A", "Luiz", 500, "sim"],
    ],
    Socios: [["COMPETICAO", "ATIRADOR", "SOCIO", "COTA", "PAGOU"], ["Etapa", "Atirador A", "Luiz", 1, 500]],
  });
  assert.equal(r.competicoes[0].apostas[0].socios, undefined, "menos de dois: fica como estava");
});

test("a exportação traz as abas de conferência", () => {
  const abas = P.exportar({
    competicoes: [
      {
        id: "c1",
        nome: "Etapa",
        data: "2026-08-15",
        resultado: ["Zé", "", ""],
        apostas: [{ id: "a1", atirador: "Zé", apostador: "Ana", valor: 100, pago: false }],
      },
    ],
  });
  assert.deepEqual(Object.keys(abas), [
    "Apostas", "Socios", "Resultado", "Ajustes", "Acerto", "Temporada", "Atiradores",
  ]);

  const acerto = abas.Acerto;
  assert.equal(acerto[1][1], "Ana");
  assert.equal(acerto[1][5], 0); // ganhou 100, devia 100 → saldo zero
  assert.equal(acerto[1][6], "quite");

  const temporada = abas.Temporada;
  assert.equal(temporada[1][0], "Ana");
  assert.equal(temporada[1][2], 100); // ganhou

  const atiradores = abas.Atiradores;
  assert.equal(atiradores[0][1], "1º");
  assert.equal(atiradores[1][0], "Zé");
  assert.equal(atiradores[1][1], 1);
});

/* ══════════════ arquivo .xlsx de verdade (ida e volta) ═══════════════ */

test("gera e lê um .xlsx de verdade", () => {
  const XLSX = require("../assets/vendor/xlsx.full.min.js");
  const modelo = P.modelo();

  const wb = XLSX.utils.book_new();
  Object.keys(modelo).forEach((nome) => {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(modelo[nome]), nome.slice(0, 31));
  });
  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  assert.ok(buffer.length > 1000, "o arquivo saiu vazio");

  const lido = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const abas = {};
  lido.SheetNames.forEach((n) => {
    abas[n] = XLSX.utils.sheet_to_json(lido.Sheets[n], { header: 1, raw: true, defval: "" });
  });

  const r = P.importar(abas);
  assert.equal(r.competicoes.length, 1);
  assert.equal(r.competicoes[0].apostas.length, 5);
  assert.deepEqual(r.competicoes[0].regra.premios, [50, 30, 20]);
  assert.equal(C.calcular(r.competicoes[0]).pote, 110000);
});
