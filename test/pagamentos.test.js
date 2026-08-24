/* Testes do "quem paga quem" — rode com:  npm test  */
const test = require("node:test");
const assert = require("node:assert/strict");
const C = require("../assets/calc.js");

const saldos = (obj) => Object.entries(obj).map(([nome, saldoC]) => ({ nome, saldoC }));

/** Confere que os pagamentos zeram todo mundo, sem inventar dinheiro. */
function conferir(lista, resultado) {
  const posicao = new Map(lista.map((s) => [s.nome, s.saldoC]));
  resultado.pagamentos.forEach((t) => {
    assert.ok(t.valorC > 0, "pagamento de valor zero ou negativo");
    posicao.set(t.de, posicao.get(t.de) + t.valorC);
    posicao.set(t.para, posicao.get(t.para) - t.valorC);
  });
  posicao.forEach((v, nome) => assert.equal(v, 0, `${nome} não ficou quite (${v})`));
  assert.ok(resultado.fecha);
}

/* ═══════════════════════════ o básico ════════════════════════════════ */

test("dois participantes: um pagamento", () => {
  const lista = saldos({ Elza: -40000, Bruno: 40000 });
  const r = C.pagamentos(lista);
  assert.equal(r.pagamentos.length, 1);
  assert.deepEqual(r.pagamentos[0], { de: "Elza", para: "Bruno", valorC: 40000 });
  conferir(lista, r);
});

test("valores que se anulam viram um pagamento direto, sem passar pelo caixa", () => {
  // Elza deve 400; Carla tem 400 a receber; o caixa fecha o resto
  const lista = saldos({ Elza: -40000, "Caixa do clube": -20000, Carla: 40000, Davi: 20000 });
  const r = C.pagamentos(lista);
  assert.equal(r.pagamentos.length, 2, "deveriam bastar 2 pagamentos");
  assert.ok(
    r.pagamentos.some((p) => p.de === "Elza" && p.para === "Carla" && p.valorC === 40000),
    "Elza devia pagar a Carla direto: " + JSON.stringify(r.pagamentos)
  );
  conferir(lista, r);
});

test("um devedor para vários credores", () => {
  const lista = saldos({ Elza: -60000, Ana: 10000, Bruno: 20000, Carla: 30000 });
  const r = C.pagamentos(lista);
  assert.equal(r.pagamentos.length, 3);
  assert.ok(r.pagamentos.every((p) => p.de === "Elza"));
  conferir(lista, r);
});

test("ignora quem já está quite", () => {
  const lista = saldos({ Ana: 0, Elza: -10000, Bruno: 10000, Davi: 0 });
  const r = C.pagamentos(lista);
  assert.equal(r.pagamentos.length, 1);
  assert.equal(r.participantes, 2);
});

test("lista vazia ou toda zerada não gera pagamento", () => {
  assert.deepEqual(C.pagamentos([]).pagamentos, []);
  assert.equal(C.pagamentos([]).fecha, true);
  assert.deepEqual(C.pagamentos(saldos({ Ana: 0, Bruno: 0 })).pagamentos, []);
});

test("saldos que não somam zero são recusados em vez de gerar conta errada", () => {
  const r = C.pagamentos(saldos({ Ana: 10000, Bruno: -5000 }));
  assert.equal(r.fecha, false);
  assert.deepEqual(r.pagamentos, []);
});

test("nunca passa de (participantes − 1) pagamentos", () => {
  const lista = saldos({ a: -1000, b: -2000, c: -3000, d: 1500, e: 2500, f: 2000 });
  const r = C.pagamentos(lista);
  assert.ok(r.pagamentos.length <= 5, "saíram " + r.pagamentos.length);
  conferir(lista, r);
});

/* ══════════════════ comparação com a força bruta ═════════════════════ */

/**
 * Mínimo real de transferências: n menos o maior número de grupos que
 * fecham em zero (programação dinâmica sobre subconjuntos). Só serve para
 * conjuntos pequenos — é aqui no teste, para saber se o algoritmo do app
 * está achando o mínimo mesmo.
 */
function minimoReal(valores) {
  const n = valores.length;
  if (!n) return 0;
  const soma = new Array(1 << n).fill(0);
  for (let m = 1; m < 1 << n; m++) {
    const b = 31 - Math.clz32(m & -m);
    soma[m] = soma[m ^ (1 << b)] + valores[b];
  }
  const dp = new Array(1 << n).fill(-1);
  dp[0] = 0;
  for (let m = 1; m < 1 << n; m++) {
    if (soma[m] !== 0) continue;
    const menor = m & -m;
    for (let s = m; s > 0; s = (s - 1) & m) {
      if (!(s & menor) || soma[s] !== 0 || dp[m ^ s] < 0) continue;
      dp[m] = Math.max(dp[m], 1 + dp[m ^ s]);
    }
  }
  return n - dp[(1 << n) - 1];
}

test("acha o mínimo de pagamentos em 300 casos aleatórios", () => {
  let semente = 7;
  const rnd = () => ((semente = (semente * 1103515245 + 12345) % 2147483648) / 2147483648);
  const nomes = "abcdefghij".split("");

  let iguaisAoMinimo = 0, piores = 0, piorDiferenca = 0, total = 0;

  for (let caso = 0; caso < 300; caso++) {
    const n = 2 + Math.floor(rnd() * 7); // de 2 a 8 participantes
    const valores = [];
    for (let i = 0; i < n - 1; i++) valores.push(Math.round((rnd() - 0.5) * 20) * 5000);
    valores.push(-valores.reduce((a, b) => a + b, 0));
    if (valores.some((v) => v === 0)) continue;

    const lista = valores.map((v, i) => ({ nome: nomes[i], saldoC: v }));
    const r = C.pagamentos(lista);
    conferir(lista, r);

    const minimo = minimoReal(valores);
    total++;
    if (r.pagamentos.length === minimo) iguaisAoMinimo++;
    else {
      piores++;
      piorDiferenca = Math.max(piorDiferenca, r.pagamentos.length - minimo);
    }
    assert.ok(r.pagamentos.length >= minimo, "menos que o mínimo teórico é impossível");
  }

  // registra o desempenho de fato, em vez de prometer otimalidade sem provar
  console.log(
    `      pagamentos: ${iguaisAoMinimo}/${total} casos no mínimo exato` +
      (piores ? ` · ${piores} com até ${piorDiferenca} pagamento(s) a mais` : "")
  );
  assert.ok(iguaisAoMinimo / total >= 0.95, `só ${iguaisAoMinimo}/${total} no mínimo`);
});

/* ═════════════════ integração com a competição ═══════════════════════ */

const aposta = (id, atirador, apostador, valor, pago) => ({ id, atirador, apostador, valor, pago });

test("na competição, o caixa entra como participante do acerto", () => {
  const comp = {
    id: "c1",
    nome: "Etapa",
    resultado: ["Zé", "Rui", "Kiko"],
    regra: { premios: [50, 30, 20] },
    acertos: {},
    apostas: [
      aposta("a1", "Zé", "Ana", 100, true),
      aposta("a2", "Zé", "Bruno", 300, false),
      aposta("a3", "Rui", "Carla", 200, true),
      aposta("a4", "Kiko", "Davi", 100, true),
      aposta("a5", "Tito", "Elza", 400, false),
    ],
  };
  const conta = C.calcular(comp);

  // o caixa recebeu 400 em apostas pagas e precisa distribuir
  const caixa = conta.saldosAcerto.find((s) => s.caixa);
  assert.equal(caixa.saldoC, -40000);
  assert.equal(conta.saldosAcerto.reduce((s, x) => s + x.saldoC, 0), 0);

  conferir(conta.saldosAcerto, conta.acerto);
  assert.ok(
    conta.acerto.pagamentos.length <= conta.saldosAcerto.length - 1,
    "mais pagamentos que o necessário"
  );
});

test("quando ninguém pagou a aposta, o caixa nem entra e sobra um pagamento a menos", () => {
  const comp = {
    id: "c1",
    nome: "Etapa",
    resultado: ["Zé", "Rui", "Kiko"],
    regra: { premios: [50, 30, 20] },
    acertos: {},
    apostas: [
      aposta("a1", "Zé", "Ana", 100, false),
      aposta("a2", "Zé", "Bruno", 300, false),
      aposta("a3", "Rui", "Carla", 200, false),
      aposta("a4", "Kiko", "Davi", 100, false),
      aposta("a5", "Tito", "Elza", 400, false),
    ],
  };
  const conta = C.calcular(comp);
  // o clube não recebeu nada, então não tem nada a distribuir: some do acerto
  assert.ok(!conta.saldosAcerto.some((s) => s.caixa), "o caixa não devia entrar");
  assert.equal(conta.saldosAcerto.length, 5);
  conferir(conta.saldosAcerto, conta.acerto);
  // pelo caixa seriam 5 acertos; direto entre eles, 4
  assert.equal(conta.acerto.pagamentos.length, 4);
  assert.ok(
    conta.acerto.pagamentos.every((p) => p.de === "Elza"),
    "só a Elza deve: ela paga os outros direto"
  );
});

test("quem já acertou fica de fora da lista de pagamentos", () => {
  const comp = {
    id: "c1",
    nome: "Etapa",
    resultado: ["Zé", "", ""],
    regra: { premios: [100] },
    acertos: { ANA: { em: "2026-08-16" } },
    apostas: [
      aposta("a1", "Zé", "Ana", 100, true),
      aposta("a2", "Zé", "Bruno", 100, false),
    ],
  };
  const conta = C.calcular(comp);
  assert.ok(!conta.saldosAcerto.some((s) => s.chave === "ANA"), "Ana não devia aparecer");
  conferir(conta.saldosAcerto, conta.acerto);
});

test("competição sem nada em aberto não gera pagamento", () => {
  const comp = {
    id: "c1",
    nome: "Etapa",
    resultado: [],
    apostas: [aposta("a1", "Zé", "Ana", 100, true)],
    acertos: {},
  };
  const conta = C.calcular(comp);
  // Ana pagou 100 e não ganhou nada: o clube ficou com o dinheiro
  assert.equal(conta.acerto.pagamentos.length, 0);
});

/* ═══════════════════ acerto geral da temporada ═══════════════════════ */

test("a temporada compensa quem deve numa competição e recebe noutra", () => {
  const comp = (id, nome, apostas, resultado) => ({
    id,
    nome,
    data: "2026-08-15",
    regra: { premios: [100] },
    resultado,
    acertos: {},
    apostas,
  });
  const dados = {
    competicoes: [
      // Ana ganha 200 (apostou 100 pago); Bruno deve 100
      comp("c1", "Etapa 1", [
        aposta("a1", "Zé", "Ana", 100, true),
        aposta("a2", "Rui", "Bruno", 100, false),
      ], ["Zé"]),
      // agora inverte: Bruno ganha 200, Ana deve 100
      comp("c2", "Etapa 2", [
        aposta("b1", "Rui", "Bruno", 100, true),
        aposta("b2", "Zé", "Ana", 100, false),
      ], ["Rui"]),
    ],
  };
  const t = C.temporada(dados);

  const ana = t.pendencias.find((p) => p.chave === "ANA");
  const bruno = t.pendencias.find((p) => p.chave === "BRUNO");
  // Ana: +200 na primeira, −100 na segunda → +100
  assert.equal(ana.saldoC, 10000);
  assert.equal(bruno.saldoC, 10000);
  assert.equal(ana.emAberto.length, 2, "guarda a origem de cada saldo");

  // as duas competições juntas: o caixa deve 200 e cada um recebe 100
  conferir(t.saldosAcerto, t.acerto);
  assert.equal(t.acerto.pagamentos.length, 2);
});

test("quem se anula entre competições some do acerto geral", () => {
  const dados = {
    competicoes: [
      {
        // Ana aposta sem pagar no vencedor: leva o bolo de 200, devia 100 → +100
        id: "c1", nome: "Etapa 1", data: "2026-08-01", regra: { premios: [100] },
        resultado: ["Zé"], acertos: {},
        apostas: [aposta("a1", "Zé", "Ana", 100, false), aposta("a2", "Rui", "Bruno", 100, true)],
      },
      {
        // agora Ana aposta sem pagar no perdedor → −100, e zera no somatório
        id: "c2", nome: "Etapa 2", data: "2026-09-01", regra: { premios: [100] },
        resultado: ["Rui"], acertos: {},
        apostas: [aposta("b1", "Zé", "Ana", 100, false), aposta("b2", "Rui", "Bruno", 100, true)],
      },
    ],
  };
  const t = C.temporada(dados);
  const ana = t.pendencias.find((p) => p.chave === "ANA");
  assert.equal(ana, undefined, "Ana está quite no somatório e não devia aparecer");
  conferir(t.saldosAcerto, t.acerto);
});
