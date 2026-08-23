/* ═══════════════════════════════════════════════════════════════════════════
   The Shooting Pool — cofre
   ───────────────────────────────────────────────────────────────────────────
   Fecha os dados publicados com a senha do clube.

   Por que isso existe: o site é estático e o repositório é público. Uma tela
   de senha só em JavaScript não esconde nada — quem abrir o código a vê, e
   quem pedir o arquivo de dados direto no navegador baixa tudo. Então o que
   é publicado vai CIFRADO: sem a senha, o arquivo é um bloco ilegível.

   Como: a senha vira uma chave por PBKDF2-SHA256 (310 mil rodadas, sal
   sorteado) e os dados são cifrados com AES-GCM, que além de esconder também
   detecta qualquer alteração no arquivo. Tudo com o WebCrypto do próprio
   navegador — nada de biblioteca de terceiros.

   O limite honesto: como o arquivo cifrado é público, alguém pode tentar
   adivinhar a senha offline. Por isso a senha do clube precisa ser boa —
   o app exige pelo menos 8 caracteres e avisa quando ela é fraca.
═══════════════════════════════════════════════════════════════════════════ */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("node:crypto").webcrypto);
  else root.Cofre = factory(root.crypto);
})(typeof self !== "undefined" ? self : globalThis, function (crypto) {
  "use strict";

  const ITERACOES = 310000; // recomendação atual da OWASP para PBKDF2-SHA256
  const TAM_SAL = 16;
  const TAM_IV = 12;

  /* ───────────────────── base64 nos dois ambientes ───────────────────── */

  function paraBase64(bytes) {
    if (typeof Buffer !== "undefined") return Buffer.from(bytes).toString("base64");
    let bin = "";
    for (const b of bytes) bin += String.fromCharCode(b);
    return btoa(bin);
  }

  function deBase64(txt) {
    if (typeof Buffer !== "undefined") return new Uint8Array(Buffer.from(txt, "base64"));
    const bin = atob(txt);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  const texto = (s) => new TextEncoder().encode(s);
  const deTexto = (b) => new TextDecoder().decode(b);
  const sortear = (n) => crypto.getRandomValues(new Uint8Array(n));

  /* ──────────────────────── senha → chave ────────────────────────────── */

  async function derivar(senha, sal, iteracoes, uso) {
    const base = await crypto.subtle.importKey("raw", texto(senha), "PBKDF2", false, ["deriveBits", "deriveKey"]);
    return crypto.subtle.deriveKey(
      { name: "PBKDF2", salt: sal, iterations: iteracoes, hash: "SHA-256" },
      base,
      { name: "AES-GCM", length: 256 },
      false,
      uso || ["encrypt", "decrypt"]
    );
  }

  /** Só para conferir a senha quando ainda não há nada publicado. */
  async function derivarBits(senha, sal, iteracoes) {
    const base = await crypto.subtle.importKey("raw", texto(senha), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits(
      { name: "PBKDF2", salt: sal, iterations: iteracoes, hash: "SHA-256" },
      base,
      256
    );
    return new Uint8Array(bits);
  }

  /* ═════════════════════════ cifrar / decifrar ═══════════════════════ */

  /**
   * @param {Object} objeto o que será publicado
   * @param {string} senha  a senha do clube
   * @param {{atualizado_em?:string}} extras campos que ficam legíveis de fora
   * @returns {Promise<Object>} o pacote a gravar em data/apostas.json
   */
  async function cifrar(objeto, senha, extras) {
    if (!senha) throw new Error("sem senha não dá para fechar o cofre");
    const sal = sortear(TAM_SAL);
    const iv = sortear(TAM_IV);
    const chave = await derivar(senha, sal, ITERACOES, ["encrypt"]);
    const cru = texto(JSON.stringify(objeto));
    const cifrado = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, chave, cru));

    return Object.assign(
      {
        cofre: 1,
        kdf: "PBKDF2-SHA256",
        iteracoes: ITERACOES,
        sal: paraBase64(sal),
        iv: paraBase64(iv),
        dados: paraBase64(cifrado),
      },
      extras || {}
    );
  }

  /** true se o arquivo lido é um pacote fechado por este cofre. */
  function estaCifrado(pacote) {
    return !!(pacote && pacote.cofre && pacote.dados && pacote.sal && pacote.iv);
  }

  /**
   * @throws {Error} "senha" se a senha estiver errada ou o arquivo alterado
   */
  async function decifrar(pacote, senha) {
    if (!estaCifrado(pacote)) throw new Error("este arquivo não está cifrado");
    const iteracoes = Number(pacote.iteracoes) || ITERACOES;
    const chave = await derivar(senha, deBase64(pacote.sal), iteracoes, ["decrypt"]);
    let cru;
    try {
      cru = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: deBase64(pacote.iv) },
        chave,
        deBase64(pacote.dados)
      );
    } catch (e) {
      // o AES-GCM não distingue senha errada de arquivo adulterado
      const err = new Error("senha");
      err.senhaErrada = true;
      throw err;
    }
    return JSON.parse(deTexto(new Uint8Array(cru)));
  }

  /* ═══════════════════ conferência local da senha ════════════════════ */

  /** Guarda no aparelho o suficiente para conferir a senha, sem guardá-la. */
  async function criarVerificador(senha) {
    const sal = sortear(TAM_SAL);
    const hash = await derivarBits(senha + "|verificador", sal, ITERACOES);
    return { sal: paraBase64(sal), iteracoes: ITERACOES, hash: paraBase64(hash) };
  }

  async function confere(senha, verificador) {
    if (!verificador || !verificador.sal || !verificador.hash) return false;
    const hash = await derivarBits(
      senha + "|verificador",
      deBase64(verificador.sal),
      Number(verificador.iteracoes) || ITERACOES
    );
    const esperado = deBase64(verificador.hash);
    if (hash.length !== esperado.length) return false;
    let dif = 0; // comparação de tempo constante
    for (let i = 0; i < hash.length; i++) dif |= hash[i] ^ esperado[i];
    return dif === 0;
  }

  /* ════════════════════════ força da senha ═══════════════════════════ */

  /**
   * @returns {{ok:boolean, nivel:"curta"|"fraca"|"razoavel"|"boa", aviso:string}}
   */
  function forca(senha) {
    const s = String(senha || "");
    if (s.length < 8)
      return { ok: false, nivel: "curta", aviso: "A senha precisa ter pelo menos 8 caracteres." };

    const comuns = [
      "12345678", "123456789", "1234567890", "senha123", "password", "qwerty123",
      "clube123", "tiro1234", "abcd1234", "11111111",
    ];
    if (comuns.includes(s.toLowerCase()))
      return { ok: true, nivel: "fraca", aviso: "Essa senha é das mais tentadas — troque por outra." };

    let variedade = 0;
    if (/[a-z]/.test(s)) variedade++;
    if (/[A-Z]/.test(s)) variedade++;
    if (/[0-9]/.test(s)) variedade++;
    if (/[^a-zA-Z0-9]/.test(s)) variedade++;

    if (s.length >= 14 || (s.length >= 10 && variedade >= 3))
      return { ok: true, nivel: "boa", aviso: "" };
    if (s.length >= 10 || variedade >= 3)
      return {
        ok: true,
        nivel: "razoavel",
        aviso: "Dá para melhorar: uma frase de 4 palavras é fácil de lembrar e difícil de adivinhar.",
      };
    return {
      ok: true,
      nivel: "fraca",
      aviso: "Senha curta demais para um arquivo público. Use uma frase, tipo “pratoquebrado no domingo”.",
    };
  }

  return { cifrar, decifrar, estaCifrado, criarVerificador, confere, forca, ITERACOES };
});
