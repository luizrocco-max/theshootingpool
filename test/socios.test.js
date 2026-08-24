/* Testes do lance com sócios — rode com:  npm test

   O caso que originou tudo: Luiz e João racham um lance de R$ 500 no atirador
   A, mas quem entrega os R$ 500 é o Luiz. O atirador A vence e a faixa paga
   R$ 1.000. Ou o Luiz recebe os 1.000 e acerta com o João por fora, ou o
   sistema já divide: Luiz 750 (500 do prêmio + 250 que adiantou) e João 250
   (500 do prêmio − 250 da parte que devia).                                  */
const test = require("node:test");
const assert = require("node:assert/strict");
const C = require("../assets/calc.js");

const achar = (conta, nome) => conta.apostadores.find((p) => p.chave === C.chave(nome));

/** Luiz e João no atirador A (500, bancado pelo Luiz) + Pedro no B (500). */
const competicao = (extra) =>
  Object.assign(
    {
      id: "c1",
      nome: "Etapa",
      resultado: ["Atirador A"],
      regra: { premios: [100] },
      acertos: {},
      apostas: [
        {
          id: "L1",
          atirador: "Atirador A",
          apostador: "Luiz",
          valor: 500,
          socios: [
            { nome: "Luiz", cota: 50, pagou: 500 },
            { nome: "João", cota: 50, pagou: 0 },
          ],
        },
        { id: "L2", atirador: "Atirador B", apostador: "Pedro", valor: 500, pago: true },
      ],
    },
    extra
  );

/* ═══════════════════ o caso, com os números dele ═════════════════════ */

test("dividindo entre os sócios: Luiz 750 e João 250", () => {
  const conta = C.calcular(competicao());

  assert.equal(conta.pote, 100000); // dois lances de 500
  assert.equal(conta.faixas[0].valorC, 100000); // o 1º leva os 100%

  const luiz = achar(conta, "Luiz");
  const joao = achar(conta, "João");

  assert.equal(luiz.apostadoC, 25000, "a cota do Luiz é metade do lance");
  assert.equal(luiz.pagoC, 50000, "mas ele pôs o lance inteiro");
  assert.equal(luiz.adiantadoC, 25000, "bancou 250 da parte do João");
  assert.equal(luiz.devendoC, 0);
  assert.equal(luiz.premioC, 50000, "metade do prêmio");
  assert.equal(luiz.saldoC, 75000, "recebe 750");

  assert.equal(joao.apostadoC, 25000);
  assert.equal(joao.pagoC, 0);
  assert.equal(joao.devendoC, 25000, "deve os 250 da parte dele");
  assert.equal(joao.premioC, 50000);
  assert.equal(joao.saldoC, 25000, "recebe 250, já descontado o que devia");

  assert.equal(luiz.saldoC + joao.saldoC, 100000, "os dois juntos recebem o prêmio inteiro");
  assert.ok(conta.fecha);
});

test("prêmio para quem pagou: Luiz recebe os 1.000 sozinho", () => {
  const conta = C.calcular(competicao({ regra: { premios: [100], socios: "pagador" } }));

  const luiz = achar(conta, "Luiz");
  const joao = achar(conta, "João");

  assert.equal(luiz.premioC, 100000, "o prêmio inteiro vai para quem bancou");
  assert.equal(luiz.apostadoC, 50000, "e o lance inteiro passa a ser dele");
  assert.equal(luiz.saldoC, 100000, "recebe os 1.000 sozinho");

  // o João sai das contas do clube: ele e o Luiz acertam os 250 por fora
  assert.equal(joao.premioC, 0);
  assert.equal(joao.apostadoC, 0);
  assert.equal(joao.saldoC, 0);
  assert.ok(
    !conta.saldosAcerto.some((s) => s.chave === "JOAO"),
    "o João não entra na lista de pagamentos do clube"
  );
  assert.ok(conta.fecha);
});

test("o modo pode ser escolhido em cada lance, não só na competição", () => {
  const comp = competicao({ regra: { premios: [100], socios: "cotas" } });
  comp.apostas[0].premio = "pagador";
  const conta = C.calcular(comp);
  assert.equal(achar(conta, "Luiz").premioC, 100000, "o lance manda no padrão da competição");
});

test("no modo pagador, lance que ninguém pagou volta a valer pelas cotas", () => {
  const comp = competicao({ regra: { premios: [100], socios: "pagador" } });
  comp.apostas[0].socios = [
    { nome: "Luiz", cota: 50, pagou: 0 },
    { nome: "João", cota: 50, pagou: 0 },
  ];
  const conta = C.calcular(comp);
  assert.equal(achar(conta, "Luiz").premioC, 50000, "sem pagador, divide pela cota");
  assert.equal(achar(conta, "João").premioC, 50000);
  assert.ok(conta.fecha);
});

/* ═══════════════════════════ cotas ═══════════════════════════════════ */

test("cotas desiguais dividem o lance e o prêmio na mesma proporção", () => {
  const comp = competicao();
  comp.apostas[0].socios = [
    { nome: "Luiz", cota: 70, pagou: 500 },
    { nome: "João", cota: 30, pagou: 0 },
  ];
  const conta = C.calcular(comp);
  const luiz = achar(conta, "Luiz");
  const joao = achar(conta, "João");

  assert.equal(luiz.apostadoC, 35000); // 70% de 500
  assert.equal(joao.apostadoC, 15000); // 30% de 500
  assert.equal(luiz.premioC, 70000); // 70% de 1.000
  assert.equal(joao.premioC, 30000);
  assert.equal(luiz.saldoC, 70000 - 35000 + 50000); // 850
  assert.equal(joao.saldoC, 30000 - 15000); // 150
  assert.equal(luiz.saldoC + joao.saldoC, 100000);
});

test("sócios sem cota informada rachan o lance em partes iguais", () => {
  const comp = competicao();
  comp.apostas[0].socios = [
    { nome: "Luiz", pagou: 500 },
    { nome: "João" },
    { nome: "Pedro" },
  ];
  const conta = C.calcular(comp);
  // o Pedro também tem o lance dele de 500 no atirador B
  const cotas = [achar(conta, "Luiz").apostadoC, achar(conta, "João").apostadoC, achar(conta, "Pedro").apostadoC - 50000];
  assert.equal(cotas[0] + cotas[1] + cotas[2], 50000, "as três cotas somam o lance");
  // 500 dividido por 3 não é exato: os centavos que sobram vão para os primeiros
  assert.ok(Math.max(...cotas) - Math.min(...cotas) <= 1, "as cotas diferem no máximo um centavo");
  assert.deepEqual(cotas.slice().sort((a, b) => b - a), [16667, 16667, 16666]);
});

test("três sócios em que dois pagaram: cada um recebe o que é dele", () => {
  const comp = competicao();
  comp.apostas[0].socios = [
    { nome: "Luiz", cota: 1, pagou: 300 },
    { nome: "João", cota: 1, pagou: 200 },
    { nome: "Ana", cota: 1, pagou: 0 },
  ];
  const conta = C.calcular(comp);
  const somaCotas = ["Luiz", "João", "Ana"].reduce((s, n) => s + achar(conta, n).apostadoC, 0);
  assert.equal(somaCotas, 50000, "as três cotas somam o lance");
  assert.equal(achar(conta, "Ana").devendoC, 16666 + 1 - 1 || achar(conta, "Ana").apostadoC);
  assert.equal(achar(conta, "Luiz").adiantadoC, 30000 - achar(conta, "Luiz").apostadoC);
  const total = ["Luiz", "João", "Ana"].reduce((s, n) => s + achar(conta, n).saldoC, 0);
  assert.equal(total, 100000, "juntos recebem o prêmio inteiro");
  assert.ok(conta.fecha);
});

test("pagamento além do lance não é aceito, para o caixa não inflar", () => {
  const comp = competicao();
  comp.apostas[0].socios = [
    { nome: "Luiz", cota: 50, pagou: 900 },
    { nome: "João", cota: 50, pagou: 300 },
  ];
  const conta = C.calcular(comp);
  const recebidoNoLance = achar(conta, "Luiz").pagoC + achar(conta, "João").pagoC;
  assert.equal(recebidoNoLance, 50000, "o clube não recebe mais que o lance");
  assert.ok(conta.fecha);
});

test("pagou: true quer dizer que o sócio pôs a parte dele", () => {
  const comp = competicao();
  comp.apostas[0].socios = [
    { nome: "Luiz", cota: 50, pagou: true },
    { nome: "João", cota: 50, pagou: true },
  ];
  const conta = C.calcular(comp);
  assert.equal(achar(conta, "Luiz").devendoC, 0);
  assert.equal(achar(conta, "João").devendoC, 0);
  assert.equal(achar(conta, "Luiz").saldoC, 50000, "cada um só recebe o prêmio");
});

/* ════════════════ escolher quem dos sócios recebe ════════════════════ */

test("dá para escolher qual sócio recebe o prêmio inteiro", () => {
  const comp = competicao();
  comp.apostas[0].recebedor = "João"; // quem recebe é o João, mas quem pagou foi o Luiz
  const conta = C.calcular(comp);

  const luiz = achar(conta, "Luiz");
  const joao = achar(conta, "João");

  assert.equal(joao.premioC, 100000, "o prêmio inteiro vai para o escolhido");
  assert.equal(joao.saldoC, 100000, "e ele recebe os 1.000");
  assert.equal(luiz.premioC, 0);
  assert.equal(
    luiz.saldoC,
    0,
    "o Luiz não fica no prejuízo: o lance que ele bancou passou a ser dele nas contas"
  );
  assert.ok(conta.fecha);
});

test("o escolhido recebe mesmo sem ter posto dinheiro", () => {
  const comp = competicao();
  comp.apostas[0].socios = [
    { nome: "Luiz", cota: 50, pagou: 500 },
    { nome: "João", cota: 50, pagou: 0 },
    { nome: "Ana", cota: 0, pagou: 0 },
  ];
  comp.apostas[0].recebedor = "Ana";
  const conta = C.calcular(comp);
  assert.equal(achar(conta, "Ana").premioC, 100000);
  assert.equal(achar(conta, "Luiz").saldoC, 0, "quem bancou sai quite");
  assert.equal(achar(conta, "Ana").saldoC, 100000);
  assert.ok(conta.fecha);
});

test("escolhido que não é sócio do lance é ignorado", () => {
  const comp = competicao();
  comp.apostas[0].recebedor = "Fulano de Tal";
  const conta = C.calcular(comp);
  assert.equal(achar(conta, "Luiz").saldoC, 75000, "volta a valer a divisão por cotas");
  assert.equal(achar(conta, "João").saldoC, 25000);
});

test("com o lance ainda em aberto, escolher quem recebe não muda quem deve", () => {
  const comp = competicao();
  comp.apostas[0].socios = [
    { nome: "Luiz", cota: 50, pagou: 0 },
    { nome: "João", cota: 50, pagou: 0 },
  ];
  comp.apostas[0].recebedor = "João";
  const conta = C.calcular(comp);
  assert.equal(achar(conta, "Luiz").devendoC, 25000, "cada um continua devendo a cota");
  assert.equal(achar(conta, "João").devendoC, 25000);
  assert.equal(achar(conta, "João").premioC, 100000, "mas o prêmio vai todo para o João");
  assert.equal(achar(conta, "Luiz").saldoC, -25000);
  assert.equal(achar(conta, "João").saldoC, 75000);
  assert.ok(conta.fecha);
});

/* ══════════════════ abater ou não o lance do prêmio ══════════════════ */

const soLuiz = (regra) => ({
  id: "c1",
  nome: "Etapa",
  resultado: ["Atirador A"],
  regra,
  acertos: {},
  apostas: [
    { id: "L1", atirador: "Atirador A", apostador: "Luiz", valor: 500, pago: false },
    { id: "L2", atirador: "Atirador B", apostador: "Pedro", valor: 500, pago: true },
  ],
});

test("com abate (padrão): um acerto líquido só", () => {
  const conta = C.calcular(soLuiz({ premios: [100] }));
  assert.equal(conta.abate, true);
  assert.equal(achar(conta, "Luiz").saldoC, 50000, "ganhou 1.000 e devia 500");
  assert.equal(conta.acerto.pagamentos.length, 1);
  assert.deepEqual(conta.acerto.pagamentos[0], {
    de: C.NOME_CAIXA,
    para: "Luiz",
    valorC: 50000,
  });
});

test("sem abate: paga o lance e recebe o prêmio em separado", () => {
  const conta = C.calcular(soLuiz({ premios: [100], abate: false }));
  assert.equal(conta.abate, false);
  assert.equal(conta.acerto.bruto, true);
  assert.equal(conta.acerto.pagamentos.length, 2, "duas pontas, não uma");

  const recebe = conta.acerto.pagamentos.find((p) => p.para === "Luiz");
  const paga = conta.acerto.pagamentos.find((p) => p.de === "Luiz");
  assert.equal(recebe.valorC, 100000, "recebe o prêmio inteiro");
  assert.equal(paga.valorC, 50000, "e paga o lance que devia");

  // o líquido continua o mesmo: só muda como o dinheiro anda
  assert.equal(recebe.valorC - paga.valorC, achar(conta, "Luiz").saldoC);
  assert.equal(conta.totais.brutoPagarC, 100000);
  assert.equal(conta.totais.brutoReceberC, 50000);
});

test("sem abate, quem já pagou o lance só recebe", () => {
  const comp = soLuiz({ premios: [100], abate: false });
  comp.apostas[0].pago = true;
  const conta = C.calcular(comp);
  assert.equal(conta.acerto.pagamentos.length, 1);
  assert.equal(conta.acerto.pagamentos[0].para, "Luiz");
  assert.equal(conta.acerto.pagamentos[0].valorC, 100000);
});

test("sem abate, quem adiantou pelo sócio recebe o adiantamento à parte", () => {
  const conta = C.calcular(competicao({ regra: { premios: [100], abate: false } }));
  const doLuiz = conta.acerto.pagamentos.filter((p) => p.de === "Luiz" || p.para === "Luiz");
  const valores = doLuiz.map((p) => p.valorC).sort((a, b) => b - a);
  assert.deepEqual(valores, [50000, 25000], "prêmio de 500 e os 250 que adiantou");
  assert.equal(
    doLuiz.reduce((s, p) => s + (p.para === "Luiz" ? p.valorC : -p.valorC), 0),
    75000,
    "somando, dá os mesmos 750"
  );
});

test("quem já acertou fica de fora, com ou sem abate", () => {
  const comp = soLuiz({ premios: [100], abate: false });
  comp.acertos = { LUIZ: { em: "2026-08-16" } };
  const conta = C.calcular(comp);
  assert.equal(conta.acerto.pagamentos.length, 0);
});

/* ═══════════════ conversa com o resto do sistema ═════════════════════ */

test("o lance com sócios continua sendo um lance só na tabela", () => {
  const conta = C.calcular(competicao());
  assert.equal(conta.totais.nApostas, 2, "dois lances");
  assert.equal(conta.totais.nApostadores, 3, "três pessoas");
  assert.equal(conta.totais.nSocios, 1, "um dos lances tem sócios");
  const lance = conta.apostas.find((a) => a.id === "L1");
  assert.equal(lance.valorC, 50000);
  assert.equal(lance.premioC, 100000, "o prêmio do lance inteiro");
  assert.equal(lance.pago, true, "foi pago por inteiro, mesmo que por um só");
});

test("lance pago pela metade aparece como parcial", () => {
  const comp = competicao();
  comp.apostas[0].socios = [
    { nome: "Luiz", cota: 50, pagou: 250 },
    { nome: "João", cota: 50, pagou: 0 },
  ];
  const conta = C.calcular(comp);
  const lance = conta.apostas.find((a) => a.id === "L1");
  assert.equal(lance.pago, false);
  assert.equal(lance.parcial, true);
  assert.equal(conta.totais.pagoC, 25000 + 50000, "o caixa recebeu 250 + os 500 do Pedro");
});

test("o quem paga quem já sai com os sócios acertados", () => {
  const comp = competicao();
  // ninguém pagou nada: o caixa sai da conta e o João paga o Luiz direto
  comp.apostas[0].socios = [
    { nome: "Luiz", cota: 50, pagou: 0 },
    { nome: "João", cota: 50, pagou: 0 },
  ];
  comp.apostas[1].pago = false;
  const conta = C.calcular(comp);
  assert.ok(!conta.saldosAcerto.some((s) => s.caixa), "sem dinheiro no caixa, ele não entra");
  const soma = conta.saldosAcerto.reduce((s, x) => s + x.saldoC, 0);
  assert.equal(soma, 0);
  assert.ok(conta.acerto.fecha);
  // Pedro deve 500 e perdeu; Luiz e João têm 250 a receber cada um
  assert.equal(achar(conta, "Pedro").saldoC, -50000);
  assert.equal(achar(conta, "Luiz").saldoC, 25000);
  assert.equal(achar(conta, "João").saldoC, 25000);
});

test("temporada e lucro contam a cota, não o lance inteiro", () => {
  const t = C.temporada({ competicoes: [competicao()] });
  const luiz = t.apostadores.find((p) => p.chave === "LUIZ");
  assert.equal(luiz.apostadoC, 25000, "só a parte dele");
  assert.equal(luiz.premioC, 50000);
  assert.equal(luiz.lucroC, 25000, "lucro de 250 na competição");
});

/* ══════════════════════ o bolo continua fechando ═════════════════════ */

test("com sócios, o bolo fecha no centavo em 200 competições aleatórias", () => {
  let semente = 99;
  const rnd = () => ((semente = (semente * 1103515245 + 12345) % 2147483648) / 2147483648);
  const gente = ["Ana", "Bruno", "Carla", "Davi", "Elza", "Luiz", "João"];
  const tiros = ["A", "B", "C", "D", "E"];

  for (let n = 0; n < 200; n++) {
    const apostas = [];
    const quantos = 1 + Math.floor(rnd() * 6);
    for (let i = 0; i < quantos; i++) {
      const valor = Math.round(rnd() * 80000) / 100;
      const a = { id: "a" + i, atirador: tiros[Math.floor(rnd() * tiros.length)], valor };
      if (rnd() < 0.5) {
        // lance com sócios, com pagamentos repartidos de qualquer jeito
        const nSocios = 2 + Math.floor(rnd() * 3);
        a.socios = [];
        let sobra = valor;
        for (let s = 0; s < nSocios; s++) {
          const paga = rnd() < 0.4 ? Math.round(rnd() * sobra * 100) / 100 : 0;
          sobra = Math.max(0, sobra - paga);
          a.socios.push({
            nome: gente[Math.floor(rnd() * gente.length)],
            cota: 1 + Math.floor(rnd() * 5),
            pagou: paga,
          });
        }
      } else {
        a.apostador = gente[Math.floor(rnd() * gente.length)];
        a.pago = rnd() < 0.6;
      }
      apostas.push(a);
    }
    const comp = {
      id: "c",
      nome: "x",
      apostas,
      resultado: [0, 1, 2].map(() => (rnd() < 0.85 ? tiros[Math.floor(rnd() * tiros.length)] : "")),
      regra: {
        premios: [50, 30, 20],
        rateio: rnd() < 0.5 ? "igual" : "proporcional",
        sobra: rnd() < 0.5 ? "clube" : "redistribuir",
        socios: rnd() < 0.5 ? "pagador" : "cotas",
        taxaClube: [0, 0, 5, 10][Math.floor(rnd() * 4)],
      },
      acertos: {},
    };
    const conta = C.calcular(comp);

    assert.equal(
      conta.totais.premiosC + conta.taxaC + conta.sobraClubeC,
      conta.pote,
      `competição ${n}: o bolo não fecha`
    );
    assert.ok(conta.fecha, `competição ${n}`);
    // a soma das cotas de todo mundo é exatamente o bolo
    assert.equal(
      conta.apostadores.reduce((s, p) => s + p.apostadoC, 0),
      conta.pote,
      `competição ${n}: as cotas não somam o bolo`
    );
    // e o acerto sempre fecha em zero
    assert.equal(conta.saldosAcerto.reduce((s, x) => s + x.saldoC, 0), 0, `competição ${n}`);
    assert.ok(conta.acerto.fecha, `competição ${n}: o acerto não fecha`);
  }
});
