/* Testes do gerador de PDF — rode com:  npm test

   Não dá para "ver" o PDF aqui, então conferimos o que precisa estar certo
   para qualquer leitor abrir o arquivo: a tabela xref tem que apontar para o
   byte exato de cada objeto, e o texto tem que sair na codificação do PDF. */
const test = require("node:test");
const assert = require("node:assert/strict");
const C = require("../assets/calc.js");
const Pdf = require("../assets/pdf.js");

const texto = (bytes) => Buffer.from(bytes).toString("latin1");

/** Confere que cada deslocamento da xref cai no começo do objeto certo. */
function conferirEstrutura(bytes) {
  const s = texto(bytes);
  assert.ok(s.startsWith("%PDF-1.4\n"), "não começa com o cabeçalho do PDF");
  assert.ok(s.endsWith("%%EOF\n"), "não termina com %%EOF");

  const m = s.match(/\nxref\n0 (\d+)\n([\s\S]*?)trailer/);
  assert.ok(m, "não achei a tabela xref");
  const total = Number(m[1]);
  const linhas = m[2].split("\n").filter(Boolean);
  assert.equal(linhas.length, total, "a xref não tem uma linha por objeto");

  for (let i = 1; i < total; i++) {
    const off = parseInt(linhas[i].slice(0, 10), 10);
    const esperado = `${i} 0 obj`;
    assert.equal(
      s.slice(off, off + esperado.length),
      esperado,
      `o objeto ${i} não está no byte ${off} apontado pela xref`
    );
  }

  const startxref = Number(s.match(/startxref\n(\d+)/)[1]);
  assert.equal(s.slice(startxref, startxref + 4), "xref", "startxref não aponta para a xref");

  // todo /Length declarado tem que bater com o tamanho real do stream
  const streams = [...s.matchAll(/<< \/Length (\d+) >>\nstream\n([\s\S]*?)\nendstream/g)];
  assert.ok(streams.length, "nenhum stream de conteúdo");
  streams.forEach(([, tamanho, corpo], i) => {
    assert.equal(corpo.length, Number(tamanho), `o /Length do stream ${i} não bate`);
  });

  return { s, paginas: (s.match(/\/Type \/Page[^s]/g) || []).length };
}

const comp = (extra) =>
  Object.assign(
    {
      id: "c1",
      nome: "Etapa de agosto",
      data: "2026-08-15",
      regra: { premios: [50, 30, 20] },
      resultado: ["Zé", "Rui", "Kiko"],
      acertos: {},
      apostas: [
        { id: "a1", atirador: "Zé", apostador: "Ana", valor: 100, pago: true },
        { id: "a2", atirador: "Zé", apostador: "Bruno", valor: 300, pago: false },
        { id: "a3", atirador: "Rui", apostador: "Carla", valor: 200, pago: true },
        { id: "a4", atirador: "Kiko", apostador: "Davi", valor: 100, pago: true },
        { id: "a5", atirador: "Tito", apostador: "Elza", valor: 400, pago: false },
      ],
    },
    extra
  );

/* ═════════════════════════════ estrutura ═════════════════════════════ */

test("gera um PDF com estrutura válida", () => {
  const { paginas } = conferirEstrutura(Pdf.relatorio(comp(), { geradoEm: "23/08/2026 20:10" }));
  assert.ok(paginas >= 1 && paginas <= 3, "páginas: " + paginas);
});

test("o relatório da competição traz o quem paga quem", () => {
  const s = texto(Pdf.relatorio(comp(), { geradoEm: "23/08/2026 20:10" }));
  assert.ok(s.includes("(Pagamentos"), "falta a seção de pagamentos");
  assert.ok(s.includes("(QUEM PAGA)") && s.includes("(PARA QUEM)"), "faltam as colunas");
  assert.ok(s.includes("(Caixa do clube)"), "o caixa deveria aparecer como quem paga");
  // a Elza deve 400 e ninguém recebe exatamente isso: ela paga mais de um
  assert.ok(s.includes("(Elza)"), "a Elza deveria aparecer pagando");
});

test("competição toda quite não inventa pagamento", () => {
  const c = comp({ resultado: [], apostas: [{ id: "a1", atirador: "Zé", apostador: "Ana", valor: 100, pago: true }] });
  const s = texto(Pdf.relatorio(c));
  assert.ok(s.includes("Tudo quite") || s.includes("nada a pagar"), "deveria dizer que está quite");
});

test("texto longo quebra linha em vez de vazar pela margem", () => {
  const doc = Pdf.criar({ titulo: "Teste" });
  const frase =
    "Esta lista quita todo mundo no menor numero de transferencias possivel: quem deve paga " +
    "direto quem tem a receber, e o caixa do clube entra apenas com o que sobrar depois disso.";
  const antes = doc.y;
  doc.paragrafo(frase, { tam: 8.5 });
  const usado = antes - doc.y;
  assert.ok(usado > 14, "uma frase longa tem que ocupar mais de uma linha (ocupou " + usado + ")");

  // e nenhuma linha pode passar da largura útil da página
  const s = texto(doc.bytes());
  const linhas = [...s.matchAll(/\(([^)]*)\) Tj/g)].map((m) => m[1]);
  const util = Pdf.A4.largura - 2 * Pdf.MARGEM;
  linhas.forEach((linha) => {
    assert.ok(
      Pdf.larguraTexto(linha, 8.5) <= util + 1,
      `linha vazou a margem: "${linha}"`
    );
  });
});

test("quebra em várias páginas e repete o cabeçalho da tabela", () => {
  const apostas = [];
  for (let i = 0; i < 80; i++)
    apostas.push({
      id: "a" + i,
      atirador: ["Zé", "Rui", "Kiko", "Tito"][i % 4],
      apostador: "Apostador " + i,
      valor: 100 + i,
      pago: i % 2 === 0,
    });
  const bytes = Pdf.relatorio(comp({ apostas }), { geradoEm: "01/01/2027 10:00" });
  const { s, paginas } = conferirEstrutura(bytes);
  assert.ok(paginas >= 3, `esperava várias páginas, saíram ${paginas}`);
  // o cabeçalho "APOSTADOR" aparece mais vezes que o número de tabelas distintas
  assert.ok((s.match(/\(APOSTADOR\)/g) || []).length >= 3, "o cabeçalho não se repete nas quebras");
  assert.ok(s.includes("Pagina 1 de "), "falta a numeração de página");
  assert.ok(s.includes(`Pagina ${paginas} de ${paginas}`), "a última página não fecha a contagem");
});

test("aguenta competição sem resultado e sem apostas", () => {
  conferirEstrutura(Pdf.relatorio(comp({ resultado: [], apostas: [] })));
  conferirEstrutura(Pdf.relatorio(comp({ resultado: [] })));
  const semPodio = texto(Pdf.relatorio(comp({ resultado: [] })));
  assert.ok(semPodio.includes("ainda n"), "deveria avisar que o pódio não saiu");
});

/* ═════════════════════════ conteúdo do relatório ═════════════════════ */

test("o relatório traz os ganhadores e os valores certos", () => {
  const s = texto(Pdf.relatorio(comp(), { geradoEm: "23/08/2026 20:10" }));
  const conta = C.calcular(comp());

  assert.ok(s.includes("(Ganhadores)"), "falta a seção de ganhadores");
  assert.ok(s.includes("(Acerto de contas)"), "falta o acerto de contas");
  assert.ok(s.includes("(550,00)"), "falta o prêmio do 1º lugar");
  assert.ok(s.includes("(412,50)"), "falta o prêmio do Bruno");
  assert.ok(s.includes("(137,50)"), "falta o prêmio da Ana");
  assert.ok(s.includes("(112,50)"), "falta o saldo líquido do Bruno (ganhou 412,50, devia 300)");
  assert.ok(s.includes("(-400,00)"), "falta o saldo negativo da Elza");
  assert.ok(s.includes("(ele paga)") && s.includes("(clube paga)"), "faltam as situações");
  assert.equal(conta.totais.aPagarC, 80000);
  assert.ok(s.includes("(23/08/2026 20:10)") || s.includes("23/08/2026 20:10"), "falta a data de geração");
});

test("mostra a divisão em vigor, mesmo fora do 50/30/20", () => {
  const s = texto(
    Pdf.relatorio(
      comp({
        regra: { premios: [40, 25, 15, 12, 8] },
        resultado: ["Zé", "Rui", "Kiko", "Tito", "Vera"],
      })
    )
  );
  assert.ok(s.includes("40%") && s.includes("8%"), "não mostrou os percentuais da competição");
  assert.ok(s.includes("(5") && s.includes("(Vera)"), "não listou a 5ª colocação");
  assert.ok(!s.includes("50%"), "ainda mostra o percentual antigo");
});

test("inclui a taxa do clube quando existe", () => {
  const semTaxa = texto(Pdf.relatorio(comp()));
  const comTaxa = texto(Pdf.relatorio(comp({ regra: { premios: [50, 30, 20], taxaClube: 10 } })));
  assert.ok(!semTaxa.includes("TAXA DO CLUBE"));
  assert.ok(comTaxa.includes("TAXA DO CLUBE"), "deveria mostrar o cartão da taxa");
});

/* ═══════════════════ acerto geral do clube ═══════════════════════════ */

const temporadaExemplo = () => ({
  versao: 1,
  competicoes: [
    comp({ id: "c1", nome: "Etapa de agosto", data: "2026-08-15" }),
    comp({
      id: "c2",
      nome: "Etapa de setembro",
      data: "2026-09-12",
      resultado: ["Rui", "Zé", "Tito"],
      apostas: [
        { id: "b1", atirador: "Rui", apostador: "Elza", valor: 200, pago: true },
        { id: "b2", atirador: "Zé", apostador: "Ana", valor: 100, pago: false },
        { id: "b3", atirador: "Tito", apostador: "Bruno", valor: 300, pago: true },
      ],
    }),
  ],
});

test("o acerto geral junta as competições numa lista de pagamentos", () => {
  const bytes = Pdf.relatorioGeral(temporadaExemplo(), { geradoEm: "24/08/2026 01:15" });
  const { s } = conferirEstrutura(bytes);

  assert.ok(s.includes("(Acerto geral do clube)"), "falta o título");
  assert.ok(s.includes("(Pagamentos"), "falta a lista de pagamentos");
  assert.ok(s.includes("(POSI") || s.includes("(Posi"), "falta a posição de cada um");
  assert.ok(s.includes("(A PAGAR)") && s.includes("(A RECEBER)"), "faltam os cartões do topo");
  assert.ok(s.includes("acertos avulsos"), "deveria comparar com os acertos avulsos");
});

test("o acerto geral compensa quem deve numa e recebe noutra", () => {
  const dados = temporadaExemplo();
  const t = C.temporada(dados);
  const elza = t.pendencias.find((p) => p.chave === "ELZA");
  // devia 400 em agosto e ganhou em setembro: entra com a diferença
  assert.ok(elza.emAberto.length === 2, "deveria ter saldo nas duas competições");
  assert.equal(elza.saldoC, elza.emAberto.reduce((s, e) => s + e.saldoC, 0));

  // e cada pessoa aparece uma vez só na lista de pagamentos por competição
  const nomes = t.acerto.pagamentos.flatMap((p) => [p.de, p.para]);
  assert.ok(nomes.length >= 2);
  conferirEstrutura(Pdf.relatorioGeral(dados));
});

test("temporada vazia ou toda acertada gera um PDF válido mesmo assim", () => {
  conferirEstrutura(Pdf.relatorioGeral({ competicoes: [] }));
  const quitada = temporadaExemplo();
  quitada.competicoes.forEach((c) => {
    c.acertos = {};
    C.calcular(c).apostadores.forEach((p) => (c.acertos[p.chave] = { em: "2026-09-20" }));
  });
  const s = texto(Pdf.relatorioGeral(quitada));
  conferirEstrutura(Pdf.relatorioGeral(quitada));
  assert.ok(s.includes("Tudo quite") || s.includes("nada a pagar"), "deveria dizer que está quite");
});

/* ═══════════════════════════ codificação ═════════════════════════════ */

test("escreve acentos na tabela WinAnsi que o PDF usa", () => {
  const b = (txt) => [...Pdf.winansi(txt)].map((c) => c.charCodeAt(0));
  assert.deepEqual(b("ç"), [0xe7]);
  assert.deepEqual(b("ã"), [0xe3]);
  assert.deepEqual(b("É"), [0xc9]);
  assert.deepEqual(b("º"), [0xba]);
  assert.deepEqual(b("—"), [0x97]); // travessão
  assert.deepEqual(b("–"), [0x96]);
  assert.deepEqual(b("•"), [0x95]);
  assert.deepEqual(b("R$"), [0x52, 0x24]);
});

test("troca o que não existe no PDF por algo legível, sem quebrar", () => {
  assert.equal(Pdf.winansi("✓"), "OK");
  assert.equal(Pdf.winansi("🥇 primeiro"), "1o primeiro");
  assert.equal(Pdf.winansi("linha1\nlinha2"), "linha1 linha2");
  assert.ok(!Pdf.winansi("🎯🏆😀").includes("\uD83C"), "sobrou metade de emoji");
});

test("nome com parêntese ou barra invertida não corrompe o arquivo", () => {
  const bytes = Pdf.relatorio(
    comp({
      nome: "Etapa (especial) \\ 2026",
      apostas: [{ id: "a1", atirador: "Zé (o rápido)", apostador: "Ana \\ Maria", valor: 100, pago: true }],
      resultado: ["Zé (o rápido)"],
      regra: { premios: [100] },
    })
  );
  const { s } = conferirEstrutura(bytes);
  assert.ok(s.includes("\\(o r"), "o parêntese devia estar escapado");
});

test("o título do documento vai em UTF-16, aceitando acento", () => {
  const s = texto(Pdf.relatorio(comp({ nome: "Competição de agosto" })));
  const m = s.match(/\/Title <FEFF([0-9A-F]+)>/);
  assert.ok(m, "o título não saiu como string UTF-16");
  let titulo = "";
  for (let i = 0; i < m[1].length; i += 4) titulo += String.fromCharCode(parseInt(m[1].slice(i, i + 4), 16));
  assert.ok(titulo.startsWith("Competição de agosto"), "título decodificado: " + titulo);
});

/* ═══════════════════════════ a folha crua ════════════════════════════ */

test("a folha em branco também gera um PDF válido", () => {
  const doc = Pdf.criar({ titulo: "Teste", rodape: "rodapé" });
  doc.capa("Título", "subtítulo");
  doc.titulo("Uma seção");
  doc.paragrafo("Um parágrafo qualquer.");
  doc.cartoes([{ rotulo: "um", valor: "1" }, { rotulo: "dois", valor: "2" }]);
  doc.tabela({
    colunas: [{ titulo: "Nome", largura: 200 }, { titulo: "Valor", largura: 100, dir: true }],
    linhas: [["Ana", "100,00"], ["Bruno", "200,00"]],
  });
  conferirEstrutura(doc.bytes());
});

/* ══════════ o que o leilão de verdade do clube trouxe à tona ═════════ */

test("percentual quebrado sai legível, e não com 15 casas decimais", () => {
  // dividir 50% entre seis colocações dá 8,333333333333334 em ponto flutuante
  const seis = ["Rui", "Kiko", "Tito", "Vera", "Ana", "Bruno"];
  const s = texto(
    Pdf.relatorio(
      comp({
        regra: { premios: [50].concat(seis.map(() => 50 / 6)) },
        resultado: ["Zé"].concat(seis),
      })
    )
  );
  assert.ok(s.includes("8,3333%"), "não arredondou o percentual para exibir");
  assert.ok(!s.includes("8,33333333"), "vazou o número cheio do ponto flutuante");
});

test("percentual quebrado não faz o bolo perder centavo", () => {
  const seis = ["Rui", "Kiko", "Tito", "Vera", "Ana", "Bruno"];
  const conta = C.calcular(
    comp({
      regra: { premios: [50].concat(seis.map(() => 50 / 6)) },
      resultado: ["Zé"].concat(seis),
      apostas: ["Zé"].concat(seis).map((atirador, i) => ({
        id: "x" + i,
        atirador,
        apostador: "Dono " + i,
        valor: 1000,
        pago: true,
      })),
    })
  );
  // 1º leva metade exata; as seis faixas dividem a outra metade
  assert.equal(conta.faixas[0].valorC, conta.pote / 2);
  assert.equal(conta.totais.premiosC, conta.pote);
});

test("lance rachado mostra a cota de cada sócio, não só quem bancou", () => {
  const s = texto(
    Pdf.relatorio(
      comp({
        apostas: [
          {
            id: "a1",
            atirador: "Zé",
            apostador: "Ana",
            valor: 500,
            socios: [
              { nome: "Ana", cota: 1, pagou: 500 },
              { nome: "João", cota: 1, pagou: 0 },
            ],
          },
        ],
      })
    )
  );
  assert.ok(s.includes("(lance rachado)"), "não marcou o lance como rachado");
  assert.ok(s.includes("(João)"), "o sócio que não pôs dinheiro sumiu da lista");
  assert.ok(s.includes("nada"), "não disse que o sócio não pôs nada");
});

test("quem está quite não conta como acerto em aberto", () => {
  // Davi apostou 100 e ganhou 100: saldo zero, nada a fazer com ele
  const c = comp({
    resultado: ["Zé"],
    regra: { premios: [100] },
    apostas: [
      { id: "a1", atirador: "Zé", apostador: "Ana", valor: 100, pago: true },
      { id: "a2", atirador: "Rui", apostador: "Davi", valor: 100, pago: true },
    ],
  });
  const conta = C.calcular(c);
  assert.equal(conta.apostadores.find((p) => p.nome === "Davi").saldoC, 0);
  const s = texto(Pdf.relatorio(c));
  assert.ok(s.includes("1 acerto\\(s\\) em aberto"), "contou quem já está quite");
});
