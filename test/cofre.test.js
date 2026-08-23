/* Testes do cofre — rode com:  npm test  */
const test = require("node:test");
const assert = require("node:assert/strict");
const Cofre = require("../assets/cofre.js");

const dados = {
  versao: 1,
  competicoes: [
    {
      id: "c1",
      nome: "Etapa de agosto",
      data: "2026-08-15",
      apostas: [{ id: "a1", atirador: "Zé", apostador: "Ana", valor: 100, pago: false }],
      resultado: ["Zé"],
    },
  ],
};

/* ═════════════════════════ ida e volta ═══════════════════════════════ */

test("fecha e abre com a senha certa", async () => {
  const pacote = await Cofre.cifrar(dados, "pratoquebrado no domingo");
  assert.equal(pacote.cofre, 1);
  assert.equal(pacote.kdf, "PBKDF2-SHA256");
  assert.ok(pacote.sal && pacote.iv && pacote.dados);

  const volta = await Cofre.decifrar(pacote, "pratoquebrado no domingo");
  assert.deepEqual(volta, dados);
});

test("o arquivo publicado não deixa ler nome nenhum", async () => {
  const pacote = await Cofre.cifrar(dados, "pratoquebrado no domingo");
  const bruto = JSON.stringify(pacote);
  ["Ana", "Zé", "Etapa de agosto", "apostador", "valor"].forEach((palavra) => {
    assert.ok(!bruto.includes(palavra), `vazou "${palavra}" no arquivo cifrado`);
  });
  // e nem nos bytes do conteúdo, onde até um "100" solto seria vazamento
  const conteudo = Buffer.from(pacote.dados, "base64").toString("latin1");
  ["Ana", "Etapa", "apostador", "100", "2026-08-15"].forEach((palavra) => {
    assert.ok(!conteudo.includes(palavra), `vazou "${palavra}" no conteúdo cifrado`);
  });
});

test("senha errada não abre", async () => {
  const pacote = await Cofre.cifrar(dados, "pratoquebrado no domingo");
  await assert.rejects(() => Cofre.decifrar(pacote, "pratoquebrado no sabado"), (e) => e.senhaErrada === true);
  await assert.rejects(() => Cofre.decifrar(pacote, ""), (e) => e.senhaErrada === true);
});

test("arquivo adulterado não abre", async () => {
  const pacote = await Cofre.cifrar(dados, "pratoquebrado no domingo");
  const mexido = Object.assign({}, pacote);
  const b = Buffer.from(pacote.dados, "base64");
  b[10] = b[10] ^ 0xff; // troca um byte no meio do conteúdo
  mexido.dados = b.toString("base64");
  await assert.rejects(() => Cofre.decifrar(mexido, "pratoquebrado no domingo"), (e) => e.senhaErrada === true);
});

test("cada publicação usa sal e iv novos", async () => {
  const a = await Cofre.cifrar(dados, "pratoquebrado no domingo");
  const b = await Cofre.cifrar(dados, "pratoquebrado no domingo");
  assert.notEqual(a.sal, b.sal);
  assert.notEqual(a.iv, b.iv);
  assert.notEqual(a.dados, b.dados); // mesmo conteúdo, arquivo diferente
});

test("campos deixados de fora ficam legíveis, para a tela de entrada", async () => {
  const pacote = await Cofre.cifrar(dados, "pratoquebrado no domingo", {
    atualizado_em: "23/08/2026 20:10",
  });
  assert.equal(pacote.atualizado_em, "23/08/2026 20:10");
});

test("reconhece o que é e o que não é pacote do cofre", async () => {
  assert.equal(Cofre.estaCifrado(await Cofre.cifrar(dados, "pratoquebrado no domingo")), true);
  assert.equal(Cofre.estaCifrado(dados), false);
  assert.equal(Cofre.estaCifrado(null), false);
  assert.equal(Cofre.estaCifrado({ cofre: 1 }), false);
  await assert.rejects(() => Cofre.decifrar(dados, "x"), /não está cifrado/);
});

test("acentos e emojis sobrevivem à ida e volta", async () => {
  const especial = { nome: "Competição · João, Iñaki 🎯", valor: 1.5 };
  const volta = await Cofre.decifrar(await Cofre.cifrar(especial, "pratoquebrado no domingo"), "pratoquebrado no domingo");
  assert.deepEqual(volta, especial);
});

/* ══════════════════ conferência local da senha ═══════════════════════ */

test("o verificador confere a senha sem guardá-la", async () => {
  const v = await Cofre.criarVerificador("pratoquebrado no domingo");
  assert.ok(!JSON.stringify(v).includes("pratoquebrado"));
  assert.equal(await Cofre.confere("pratoquebrado no domingo", v), true);
  assert.equal(await Cofre.confere("outra senha qualquer", v), false);
  assert.equal(await Cofre.confere("pratoquebrado no domingo", null), false);
  assert.equal(await Cofre.confere("pratoquebrado no domingo", { sal: "x" }), false);
});

/* ═══════════════════════ força da senha ══════════════════════════════ */

test("recusa senha curta e avisa sobre as fracas", () => {
  assert.equal(Cofre.forca("1234").ok, false);
  assert.equal(Cofre.forca("clube12").ok, false); // 7 caracteres
  assert.equal(Cofre.forca("clube123").nivel, "fraca");
  assert.equal(Cofre.forca("12345678").nivel, "fraca");
  assert.equal(Cofre.forca("Tiro2026!").nivel, "razoavel");
  assert.equal(Cofre.forca("pratoquebrado no domingo").nivel, "boa");
  assert.equal(Cofre.forca("Clube2026!x").nivel, "boa");
  assert.ok(Cofre.forca("1234").aviso.includes("8 caracteres"));
});

/* ═══════════════════════════ parâmetros ══════════════════════════════ */

test("usa PBKDF2 com o número de rodadas recomendado", async () => {
  assert.ok(Cofre.ITERACOES >= 300000, "poucas rodadas facilitam adivinhar a senha");
  const pacote = await Cofre.cifrar(dados, "pratoquebrado no domingo");
  assert.equal(pacote.iteracoes, Cofre.ITERACOES);
  assert.equal(Buffer.from(pacote.sal, "base64").length, 16);
  assert.equal(Buffer.from(pacote.iv, "base64").length, 12);
});

test("abre pacote gravado com outro número de rodadas", async () => {
  // arquivos antigos precisam continuar abrindo se o padrão mudar
  const pacote = await Cofre.cifrar(dados, "pratoquebrado no domingo");
  const guardado = JSON.parse(JSON.stringify(pacote));
  assert.deepEqual(await Cofre.decifrar(guardado, "pratoquebrado no domingo"), dados);
});
