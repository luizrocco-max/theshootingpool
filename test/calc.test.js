/* Testes do motor de cálculo — rode com:  npm test   (ou  node --test test/) */
const test = require("node:test");
const assert = require("node:assert/strict");
const C = require("../assets/calc.js");

/* helpers de teste */
const aposta = (atirador, apostador, valor, pago = true) => ({
  id: `${atirador}-${apostador}-${valor}`,
  atirador,
  apostador,
  valor,
  pago,
});
const comp = (apostas, resultado = [], regra = undefined) => ({
  id: "c1",
  nome: "Teste",
  apostas,
  resultado,
  regra,
});
const premioDe = (conta, nome) =>
  (conta.apostadores.find((p) => p.chave === C.chave(nome)) || {}).premioC;
const saldoDe = (conta, nome) =>
  (conta.apostadores.find((p) => p.chave === C.chave(nome)) || {}).saldoC;

/* ══════════════════════════ a regra 50/30/20 ══════════════════════════ */

test("divide 50/30/20 e rateia proporcional dentro de cada faixa", () => {
  const conta = C.calcular(
    comp(
      [
        aposta("Zé", "Ana", 100),
        aposta("Zé", "Bruno", 300),
        aposta("Rui", "Carla", 200),
        aposta("Kiko", "Davi", 100),
        aposta("Tito", "Elza", 400), // atirador fora do pódio: perde tudo
      ],
      ["Zé", "Rui", "Kiko"]
    )
  );

  assert.equal(conta.pote, 110000); // R$ 1.100,00
  assert.equal(conta.faixas[0].valorC, 55000); // 50%
  assert.equal(conta.faixas[1].valorC, 33000); // 30%
  assert.equal(conta.faixas[2].valorC, 22000); // 20%

  // faixa do 1º: Ana R$100 e Bruno R$300 → 1/4 e 3/4 dos 50%
  assert.equal(premioDe(conta, "Ana"), 13750);
  assert.equal(premioDe(conta, "Bruno"), 41250);
  assert.equal(premioDe(conta, "Carla"), 33000);
  assert.equal(premioDe(conta, "Davi"), 22000);
  assert.equal(premioDe(conta, "Elza"), 0);

  assert.equal(conta.totais.premiosC, conta.pote);
  assert.ok(conta.fecha);
});

test("aposta não paga é abatida do prêmio (acerto líquido)", () => {
  const conta = C.calcular(
    comp(
      [
        aposta("Zé", "Ana", 100, false), // não pagou e ganhou
        aposta("Zé", "Bruno", 300, true),
        aposta("Tito", "Carla", 100, false), // não pagou e perdeu
      ],
      ["Zé", "", ""]
    )
  );

  // pote 500; só a faixa do 1º tem apostador → recebe os 100% (redistribuição)
  assert.equal(conta.pote, 50000);
  assert.equal(conta.faixas[0].valorC, 50000);
  assert.equal(premioDe(conta, "Ana"), 12500); // 1/4 de 500
  assert.equal(premioDe(conta, "Bruno"), 37500);

  // Ana ganhou 125 mas devia 100 → clube paga 25
  assert.equal(saldoDe(conta, "Ana"), 2500);
  // Bruno já tinha pago → recebe o prêmio cheio
  assert.equal(saldoDe(conta, "Bruno"), 37500);
  // Carla não pagou e não ganhou → ela paga 100 ao clube
  assert.equal(saldoDe(conta, "Carla"), -10000);

  assert.equal(conta.totais.aPagarC, 2500 + 37500);
  assert.equal(conta.totais.aReceberC, 10000);
  assert.equal(conta.totais.devendoC, 20000);
  assert.equal(conta.totais.pagoC, 30000);
});

test("mesmo apostador em vários atiradores soma tudo num acerto só", () => {
  const conta = C.calcular(
    comp(
      [
        aposta("Zé", "Ana", 100, false),
        aposta("Rui", "Ana", 100, false),
        aposta("Tito", "Ana", 100, false),
        aposta("Zé", "Bruno", 100, true),
      ],
      ["Zé", "Rui", "Kiko"]
    )
  );

  // pote 400 · faixa 1 = 200 (Ana 100 + Bruno 100 → 100 cada)
  //                faixa 2 = 120 (só Ana) · faixa 3 = 80 sem apostador
  // sobra do 3º redistribuída: pesos 50 e 30 sobre 400 → 250 e 150
  assert.equal(conta.pote, 40000);
  assert.equal(conta.faixas[0].valorC, 25000);
  assert.equal(conta.faixas[1].valorC, 15000);
  assert.equal(conta.faixas[2].valorC, 0);

  assert.equal(premioDe(conta, "Ana"), 12500 + 15000);
  assert.equal(saldoDe(conta, "Ana"), 27500 - 30000); // deve 300, ganhou 275
  assert.equal(conta.apostadores.length, 2);
});

/* ══════════════════════ faixa sem apostador (sobra) ═══════════════════ */

test("faixa sem ninguém: redistribui entre as faixas que têm apostador", () => {
  const conta = C.calcular(
    comp([aposta("Zé", "Ana", 100), aposta("Kiko", "Bruno", 100)], ["Zé", "Rui", "Kiko"])
  );
  // 50% e 20% ativos → 200 dividido em 5/7 e 2/7
  assert.equal(conta.faixas[0].valorC + conta.faixas[2].valorC, 20000);
  assert.equal(conta.faixas[0].valorC, Math.round((20000 * 50) / 70));
  assert.equal(conta.faixas[1].valorC, 0);
  assert.equal(conta.sobraClubeC, 0);
  assert.ok(conta.alertas.some((a) => a.includes("Rui")));
});

test("faixa sem ninguém no modo clube: a parte fica com o clube", () => {
  const conta = C.calcular(
    comp([aposta("Zé", "Ana", 100), aposta("Kiko", "Bruno", 100)], ["Zé", "Rui", "Kiko"], {
      sobra: "clube",
    })
  );
  assert.equal(conta.faixas[0].valorC, 10000); // 50% de 200
  assert.equal(conta.faixas[2].valorC, 4000); // 20% de 200
  assert.equal(conta.sobraClubeC, 6000); // os 30% do 2º
  assert.equal(conta.receitaClubeC, 6000);
  assert.equal(conta.totais.premiosC + conta.sobraClubeC, conta.pote);
});

test("sem resultado lançado ninguém ganha, mas as dívidas continuam", () => {
  const conta = C.calcular(comp([aposta("Zé", "Ana", 100, false), aposta("Rui", "Bruno", 50, true)]));
  assert.equal(conta.totais.premiosC, 0);
  assert.equal(conta.definido, false);
  assert.equal(saldoDe(conta, "Ana"), -10000);
  assert.equal(saldoDe(conta, "Bruno"), 0);
  assert.equal(conta.receitaClubeC, 0); // nada distribuído ainda ≠ lucro do clube
});

/* ═════════════════════════════ rateio igual ══════════════════════════ */

test("rateio igual divide a faixa por apostador, não por valor", () => {
  const conta = C.calcular(
    comp(
      [aposta("Zé", "Ana", 10), aposta("Zé", "Bruno", 90), aposta("Rui", "Carla", 100)],
      ["Zé", "Rui", ""],
      { rateio: "igual" }
    )
  );
  // 3º sem colocado → 50% e 30% viram 5/8 e 3/8 de 200 = 125 e 75
  // a faixa do 1º (125) racha ao meio, mesmo com apostas de 10 e de 90
  assert.equal(premioDe(conta, "Ana"), 6250);
  assert.equal(premioDe(conta, "Bruno"), 6250);
  assert.equal(premioDe(conta, "Carla"), 7500);
});

test("rateio igual não dá prêmio dobrado a quem fez duas apostas no mesmo atirador", () => {
  const conta = C.calcular(
    comp(
      [aposta("Zé", "Ana", 10), aposta("Zé", "Ana", 10), aposta("Zé", "Bruno", 10)],
      ["Zé", "", ""],
      { rateio: "igual" }
    )
  );
  assert.equal(premioDe(conta, "Ana"), premioDe(conta, "Bruno"));
  assert.equal(conta.totais.premiosC, conta.pote);
});

/* ═══════════════════════════ taxa do clube ═══════════════════════════ */

test("taxa do clube sai do bolo antes da divisão", () => {
  const conta = C.calcular(
    comp([aposta("Zé", "Ana", 100), aposta("Rui", "Bruno", 100)], ["Zé", "Rui", ""], {
      taxaClube: 10,
    })
  );
  assert.equal(conta.pote, 20000);
  assert.equal(conta.taxaC, 2000);
  assert.equal(conta.poteLiquidoC, 18000);
  assert.equal(conta.totais.premiosC, 18000);
  assert.equal(conta.receitaClubeC, 2000);
});

/* ═════════════════════════ centavos e nomes ══════════════════════════ */

test("arredondamento nunca perde nem inventa centavo", () => {
  const conta = C.calcular(
    comp(
      [
        aposta("Zé", "Ana", 33.33),
        aposta("Zé", "Bruno", 33.33),
        aposta("Zé", "Carla", 33.34),
        aposta("Rui", "Davi", 0.01),
      ],
      ["Zé", "Rui", ""]
    )
  );
  assert.equal(conta.pote, 10001);
  assert.equal(conta.totais.premiosC + conta.taxaC + conta.sobraClubeC, conta.pote);
  assert.ok(conta.fecha);
});

test("nome com acento ou caixa diferente é a mesma pessoa", () => {
  const conta = C.calcular(
    comp([aposta("Zé", "João", 100, false), aposta("Rui", "joao", 100, true)], ["Zé", "", ""])
  );
  assert.equal(conta.apostadores.length, 1);
  assert.equal(conta.apostadores[0].apostadoC, 20000);
  assert.equal(conta.apostadores[0].devendoC, 10000);
});

test("linha sem valor, sem atirador ou sem apostador é ignorada", () => {
  const conta = C.calcular(
    comp(
      [aposta("Zé", "Ana", 100), aposta("Zé", "", 50), aposta("", "Bruno", 50), aposta("Zé", "Carla", 0)],
      ["Zé", "", ""]
    )
  );
  assert.equal(conta.totais.nApostas, 1);
  assert.equal(conta.pote, 10000);
});

test("pódio com o mesmo atirador em duas posições: vale a melhor, com alerta", () => {
  const conta = C.calcular(
    comp([aposta("Zé", "Ana", 100), aposta("Rui", "Bruno", 100)], ["Zé", "Zé", "Rui"])
  );
  assert.ok(conta.alertas.some((a) => a.includes("ao mesmo tempo")));
  assert.equal(conta.faixas[1].repetida, true);
  assert.equal(conta.faixas[1].valorC, 0); // a repetição não paga de novo
  // sobra do 2º redistribuída entre 1º (50) e 3º (20): 5/7 e 2/7 de 200
  assert.equal(premioDe(conta, "Ana"), Math.round((20000 * 50) / 70));
  assert.equal(conta.totais.premiosC, conta.pote);
  assert.ok(conta.fecha);
});

test("apostas com o mesmo id (JSON editado à mão) não embaralham prêmios", () => {
  const conta = C.calcular(
    comp(
      [
        { id: "x", atirador: "Zé", apostador: "Ana", valor: 100, pago: true },
        { id: "x", atirador: "Zé", apostador: "Bruno", valor: 100, pago: true },
      ],
      ["Zé", "", ""]
    )
  );
  assert.equal(premioDe(conta, "Ana"), 10000);
  assert.equal(premioDe(conta, "Bruno"), 10000);
  assert.equal(conta.totais.premiosC, conta.pote);
});

/* ═══════════════════════════ acerto fechado ══════════════════════════ */

test("apostador marcado como acertado sai das pendências", () => {
  const c = comp([aposta("Zé", "Ana", 100, false)], ["Zé", "", ""]);
  c.acertos = { [C.chave("Ana")]: { em: "2026-08-23" } };
  const conta = C.calcular(c);
  assert.equal(conta.apostadores[0].acertado, true);
  assert.equal(conta.totais.aPagarC, 0);
  assert.equal(conta.totais.aReceberC, 0);
});

/* ═════════════════════════════ simulação ═════════════════════════════ */

test("simulação mostra o retorno por real apostado em cada atirador", () => {
  const sim = C.simular(comp([aposta("Zé", "Ana", 100), aposta("Rui", "Bruno", 300)]));
  const ze = sim.find((s) => s.atirador === "Zé");
  const rui = sim.find((s) => s.atirador === "Rui");
  assert.equal(sim[0].atirador, "Rui"); // mais dinheiro apostado vem primeiro
  assert.equal(ze.premios[0], 20000); // 50% de 400
  assert.equal(ze.retorno[0], 2); // R$ 2 por R$ 1 apostado
  assert.equal(rui.retorno[0], 20000 / 30000);
});

/* ═════════════════════════════ temporada ═════════════════════════════ */

test("temporada soma competições, lucro por apostador e pendências", () => {
  const dados = {
    competicoes: [
      comp(
        [aposta("Zé", "Ana", 100), aposta("Rui", "Bruno", 100), aposta("Kiko", "Carla", 100)],
        ["Zé", "Rui", "Kiko"]
      ),
      comp(
        [aposta("Zé", "Ana", 100, false), aposta("Rui", "Bruno", 100), aposta("Kiko", "Carla", 100)],
        ["Rui", "Zé", "Kiko"]
      ),
    ],
  };
  dados.competicoes[1].id = "c2";
  const t = C.temporada(dados);

  assert.equal(t.totais.competicoes, 2);
  assert.equal(t.totais.movimentadoC, 60000); // 2 × R$ 300
  assert.equal(t.totais.premiosC, 60000);

  const ana = t.apostadores.find((p) => p.chave === "ANA");
  // comp1: apostou 100, ganhou 150 (1º) · comp2: apostou 100, ganhou 90 (2º)
  assert.equal(ana.apostadoC, 20000);
  assert.equal(ana.premioC, 24000);
  assert.equal(ana.lucroC, 4000);
  assert.equal(ana.premiadas, 2);
  // pendência = tudo que ainda não foi acertado: os R$ 150 da 1ª competição
  // mais o saldo da 2ª (ganhou 90, deve 100 → −10)
  assert.equal(ana.pendenteC, 15000 - 1000);

  // depois de acertar a 1ª competição, sobra só o saldo da segunda
  dados.competicoes[0].acertos = { ANA: { em: "2026-08-23" } };
  const ana2 = C.temporada(dados).apostadores.find((p) => p.chave === "ANA");
  assert.equal(ana2.pendenteC, -1000);

  const carla = t.apostadores.find((p) => p.chave === "CARLA");
  assert.equal(carla.lucroC, -8000); // apostou 200, levou 120 (3º nas duas)

  const ze = t.atiradores.find((s) => s.chave === "ZE");
  assert.deepEqual(ze.podios, [1, 1, 0]);
  assert.equal(ze.competicoes, 2);
  assert.equal(ze.apostadoC, 20000);
});

/* ═══════════════════════ teste aleatório (fuzz) ══════════════════════ */

test("o bolo sempre fecha: 200 competições aleatórias", () => {
  let semente = 42;
  const rnd = () => ((semente = (semente * 1103515245 + 12345) % 2147483648) / 2147483648);
  const nomes = ["Ana", "Bruno", "Carla", "Davi", "Elza", "Fábio"];
  const tiros = ["Zé", "Rui", "Kiko", "Tito", "Vera"];

  for (let n = 0; n < 200; n++) {
    const apostas = [];
    const qtd = 1 + Math.floor(rnd() * 12);
    for (let i = 0; i < qtd; i++) {
      apostas.push(
        aposta(
          tiros[Math.floor(rnd() * tiros.length)],
          nomes[Math.floor(rnd() * nomes.length)],
          Math.round(rnd() * 50000) / 100, // até R$ 500,00 com centavos
          rnd() < 0.6
        )
      );
      apostas[i].id = "a" + i;
    }
    const resultado = [0, 1, 2].map(() =>
      rnd() < 0.85 ? tiros[Math.floor(rnd() * tiros.length)] : ""
    );
    const regra = {
      rateio: rnd() < 0.5 ? "igual" : "proporcional",
      sobra: rnd() < 0.5 ? "clube" : "redistribuir",
      taxaClube: [0, 0, 5, 10, 7.5][Math.floor(rnd() * 5)],
    };
    const conta = C.calcular(comp(apostas, resultado, regra));

    assert.equal(
      conta.totais.premiosC + conta.taxaC + conta.sobraClubeC,
      conta.pote,
      `competição ${n}: o total distribuído não fecha com o bolo`
    );
    assert.ok(conta.fecha, `competição ${n}: fecha=false`);
    // ninguém recebe prêmio negativo, e a soma das faixas bate com os prêmios
    conta.apostadores.forEach((p) => assert.ok(p.premioC >= 0));
    assert.equal(
      conta.faixas.reduce((s, f) => s + f.valorC, 0),
      conta.totais.premiosC
    );
    // cada faixa distribui exatamente o que recebeu
    conta.faixas.forEach((f) =>
      assert.equal(f.apostadores.reduce((s, p) => s + p.premioC, 0), f.valorC)
    );
  }
});

/* ═══════════════════════════ valores digitados ═══════════════════════ */

test("aceita o jeito brasileiro de escrever dinheiro", () => {
  assert.equal(C.parseValor("R$ 1.234,56"), 123456);
  assert.equal(C.parseValor("1234,56"), 123456);
  assert.equal(C.parseValor("1234.56"), 123456);
  assert.equal(C.parseValor("50"), 5000);
  assert.equal(C.parseValor("1.000"), 100000);
  assert.equal(C.parseValor("0,05"), 5);
  assert.equal(C.parseValor(""), 0);
  assert.equal(C.parseValor("abc"), 0);
});
