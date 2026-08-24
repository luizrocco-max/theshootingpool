/* Grava um data/apostas.json vazio, já cifrado com a senha do clube.
 *
 * Para que serve: enquanto nada foi publicado, quem abre o site cai na tela
 * de "criar senha" e cada pessoa acaba com uma senha própria no aparelho
 * dela — a trava não confere nada. Com o arquivo semeado, todo mundo cai na
 * tela de "entrar" e só a senha do clube abre.
 *
 * Também serve para trocar a senha sem depender do publicador: rode de novo
 * com a senha nova e publique o arquivo.
 *
 * Uso:  node scripts/semear-cofre.js "a senha do clube"
 *       node scripts/semear-cofre.js            (pergunta sem exibir na tela)
 *
 * A senha NÃO fica gravada em lugar nenhum: só o arquivo cifrado é gerado.
 * Passando por argumento, ela fica no histórico do terminal — para evitar
 * isso, rode sem argumento e digite quando for pedido.
 */
const fs = require("node:fs");
const path = require("node:path");
const readline = require("node:readline");
const Cofre = require("../assets/cofre.js");

const DESTINO = path.resolve(__dirname, "..", "data", "apostas.json");

function agora() {
  const n = new Date();
  const p = (x) => String(x).padStart(2, "0");
  return `${p(n.getDate())}/${p(n.getMonth() + 1)}/${n.getFullYear()} ${p(n.getHours())}:${p(n.getMinutes())}`;
}

/** Pergunta a senha sem mostrar o que está sendo digitado. */
function perguntar() {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const saida = process.stdout;
    const escrever = rl._writeToOutput;
    rl._writeToOutput = function (txt) {
      if (rl.stdoutMuted) saida.write("");
      else escrever.call(rl, txt);
    };
    rl.question("Senha do clube: ", (resposta) => {
      rl.stdoutMuted = false;
      saida.write("\n");
      rl.close();
      resolve(resposta);
    });
    rl.stdoutMuted = true;
  });
}

(async () => {
  const senha = process.argv[2] || (await perguntar());

  const forca = Cofre.forca(senha);
  if (!forca.ok) {
    console.error("Senha recusada:", forca.aviso);
    process.exit(1);
  }
  if (forca.nivel !== "boa") console.warn("Atenção:", forca.aviso);

  // parte de um arquivo vazio: as competições entram pelo painel
  const vazio = { versao: 1, atualizado_em: agora(), regraPadrao: null, competicoes: [] };
  const pacote = await Cofre.cifrar(vazio, senha, { atualizado_em: vazio.atualizado_em });

  fs.writeFileSync(DESTINO, JSON.stringify(pacote, null, 2) + "\n");
  console.log("Cofre semeado em", DESTINO);
  console.log("Força da senha:", forca.nivel);
  console.log("\nA partir de agora, quem abrir o site cai na tela de entrar.");
  console.log("Só quem tiver a senha passa dali.");
})();
