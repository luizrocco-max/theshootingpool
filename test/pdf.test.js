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

test("gera um PDF de uma página com estrutura válida", () => {
  const { paginas } = conferirEstrutura(Pdf.relatorio(comp(), { geradoEm: "23/08/2026 20:10" }));
  assert.equal(paginas, 1);
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
