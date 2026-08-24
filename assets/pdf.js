/* ═══════════════════════════════════════════════════════════════════════════
   The Shooting Pool — gerador de PDF
   ───────────────────────────────────────────────────────────────────────────
   Escreve um PDF 1.4 na mão, sem biblioteca externa: só texto, retângulos e
   as fontes que todo leitor de PDF já tem (Helvetica e Courier). Os nomes vão
   em Helvetica; o dinheiro, em Courier, que tem todos os dígitos da mesma
   largura — assim as colunas de valores ficam alinhadas no centavo.

   Duas partes:
     criar()      → a folha em branco (texto, tabela, quebra de página…)
     relatorio()  → o relatório da competição: ganhadores, valores e acerto
═══════════════════════════════════════════════════════════════════════════ */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./calc.js"));
  else root.Pdf = factory(root.Calc);
})(typeof self !== "undefined" ? self : globalThis, function (C) {
  "use strict";

  /* ─────────────────────── texto → bytes do PDF ─────────────────────── */

  // O PDF usa WinAnsi: igual ao Latin-1, menos a faixa 0x80–0x9F, que tem
  // sinais de pontuação. Mapeado por código Unicode (e não pelo caractere
  // escrito aqui) para não depender de como o arquivo foi salvo.
  const WINANSI = {
    0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85,
    0x2020: 0x86, 0x2021: 0x87, 0x02c6: 0x88, 0x2030: 0x89, 0x0160: 0x8a,
    0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91, 0x2019: 0x92,
    0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97,
    0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b, 0x0153: 0x9c,
    0x017e: 0x9e, 0x0178: 0x9f,
  };
  // O que não existe no WinAnsi (emoji, símbolos) vira um equivalente simples.
  const TROCAS = {
    "✓": "OK", "✗": "x", "⚠": "!", "🥇": "1o", "🥈": "2o", "🥉": "3o", "🏅": "-",
    "🎯": "", "≥": ">=", "≤": "<=", "×": "x", "→": "->", "·": "-", "\t": " ",
  };

  /** Texto em JS → string de bytes (1 caractere = 1 byte) na tabela WinAnsi. */
  function winansi(txt) {
    let out = "";
    for (const ch of String(txt == null ? "" : txt)) {
      if (TROCAS[ch] !== undefined) { out += TROCAS[ch]; continue; }
      const cp = ch.codePointAt(0);
      if (cp === 10 || cp === 13) { out += " "; continue; }
      if (cp >= 32 && cp <= 126) { out += ch; continue; }
      if (WINANSI[cp] !== undefined) { out += String.fromCharCode(WINANSI[cp]); continue; }
      if (cp >= 160 && cp <= 255) { out += ch; continue; } // Latin-1 = WinAnsi aqui
      out += "?";
    }
    return out;
  }

  /** Escapa o que tem significado dentro de uma string de PDF. */
  const escPdf = (txt) => winansi(txt).replace(/[\\()]/g, (m) => "\\" + m);

  /**
   * Texto do dicionário Info (título, autor). Ali o PDF não usa WinAnsi, e sim
   * PDFDocEncoding — então vai como string hexadecimal em UTF-16BE, que todo
   * leitor entende e aceita qualquer acento.
   */
  function textoUTF16(txt) {
    let hex = "FEFF";
    const s = String(txt == null ? "" : txt);
    for (let i = 0; i < s.length; i++) {
      hex += s.charCodeAt(i).toString(16).padStart(4, "0").toUpperCase();
    }
    return "<" + hex + ">";
  }

  /* ───────────────────────────── medidas ────────────────────────────── */

  const A4 = { largura: 595.28, altura: 841.89 };
  const MARGEM = 42;

  // Courier: todo caractere ocupa 0,6 em. É o que garante o alinhamento exato.
  const larguraMono = (txt, tam) => winansi(txt).length * tam * 0.6;

  // Helvetica varia por caractere. Estas são as larguras do próprio formato,
  // em milésimos de em; letra acentuada ocupa o mesmo que a letra sem acento.
  const HELV = {};
  (function () {
    const por = (largura, caracteres) => {
      for (const ch of caracteres) HELV[ch] = largura;
    };
    por(278, " !,.:;/[]|it");
    por(191, "'");
    por(355, '"');
    por(556, "#$0123456789?_abdeghnopqsu");
    por(889, "%");
    por(667, "&ABEKRSXY");
    por(333, "()-`rk{}");
    por(389, "*");
    por(584, "+<=>~");
    por(1015, "@");
    por(722, "CDHNOQRUwZ");
    por(778, "GO");
    por(611, "FTZ");
    por(500, "JcksvxyzL");
    por(833, "Mm");
    por(944, "W");
    por(222, "jl");
    por(469, "^");
    por(260, "|");
    // ajustes onde a lista acima se sobrepôs
    Object.assign(HELV, {
      L: 556, R: 722, S: 667, Z: 611, O: 778, w: 722, k: 500, r: 333,
      G: 778, C: 722, D: 722, U: 722, T: 611, F: 611, J: 500,
    });
  })();

  /** Largura real de um texto em Helvetica, em pontos. */
  function larguraHelv(txt, tam, forte) {
    let mil = 0;
    for (const ch of winansi(txt)) {
      const base = HELV[ch];
      mil += base === undefined ? 556 : base;
    }
    // o negrito é um pouco mais largo que o normal
    return (mil / 1000) * tam * (forte ? 1.07 : 1);
  }

  const larguraAprox = (txt, tam) => larguraHelv(txt, tam, false);

  /** Corta o texto com reticências para caber na largura dada. */
  function caber(txt, tam, largura, mono) {
    const medir = mono ? larguraMono : larguraAprox;
    let s = String(txt == null ? "" : txt);
    if (medir(s, tam) <= largura) return s;
    while (s.length > 1 && medir(s + "…", tam, mono) > largura) s = s.slice(0, -1);
    return s + "…";
  }

  const FONTES = { normal: "F1", forte: "F2", mono: "F3", monoForte: "F4" };

  /* ═══════════════════════════ a folha ═══════════════════════════════ */

  /**
   * @param {{titulo?:string, autor?:string}} opcoes
   */
  function criar(opcoes) {
    const op = opcoes || {};
    const paginas = [];
    let pagina = null;
    let y = 0;

    function novaPagina() {
      pagina = [];
      paginas.push(pagina);
      y = A4.altura - MARGEM;
      return pagina;
    }
    novaPagina();

    const cor = (c) => `${c[0]} ${c[1]} ${c[2]} rg`;
    const corTraco = (c) => `${c[0]} ${c[1]} ${c[2]} RG`;

    /** Garante espaço na página; abre outra se não couber. */
    function garantir(altura) {
      if (y - altura < MARGEM + 26) {
        novaPagina();
        return true;
      }
      return false;
    }

    function texto(txt, x, tam, estilo) {
      const e = estilo || {};
      const fonte = FONTES[e.fonte || "normal"];
      const c = e.cor || [0.11, 0.13, 0.1];
      pagina.push(
        `${cor(c)}`,
        `BT /${fonte} ${tam} Tf 1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm (${escPdf(txt)}) Tj ET`
      );
    }

    function retangulo(x, yTopo, largura, altura, c) {
      pagina.push(
        `${cor(c)}`,
        `${x.toFixed(2)} ${(yTopo - altura).toFixed(2)} ${largura.toFixed(2)} ${altura.toFixed(2)} re f`
      );
    }

    /** Quadradinho vazio, para ir marcando o que já foi pago. */
    function caixaVazia(x, yTopo, lado) {
      pagina.push(
        `${corTraco([0.55, 0.58, 0.54])}`,
        "0.8 w",
        `${x.toFixed(2)} ${(yTopo - lado).toFixed(2)} ${lado} ${lado} re S`
      );
    }

    function linhaHorizontal(x1, x2, yy, c, espessura) {
      pagina.push(
        `${corTraco(c || [0.85, 0.85, 0.82])}`,
        `${(espessura || 0.6).toFixed(2)} w`,
        `${x1.toFixed(2)} ${yy.toFixed(2)} m ${x2.toFixed(2)} ${yy.toFixed(2)} l S`
      );
    }

    const api = {
      get y() { return y; },
      set y(v) { y = v; },
      largura: A4.largura - 2 * MARGEM,
      margem: MARGEM,
      novaPagina() { novaPagina(); return api; },

      espaco(px) { y -= px; return api; },

      /** Faixa colorida com o nome do documento. */
      capa(titulo, subtitulo, cordeFundo) {
        const altura = 62;
        retangulo(0, A4.altura, A4.largura, altura, cordeFundo || [0.89, 0.34, 0.18]);
        y = A4.altura - 26;
        texto(titulo, MARGEM, 17, { fonte: "forte", cor: [1, 1, 1] });
        if (subtitulo) {
          y = A4.altura - 44;
          texto(subtitulo, MARGEM, 10, { cor: [1, 0.93, 0.89] });
        }
        y = A4.altura - altura - 26;
        return api;
      },

      titulo(txt, tam) {
        garantir(30);
        texto(txt, MARGEM, tam || 13, { fonte: "forte" });
        y -= 6;
        linhaHorizontal(MARGEM, A4.largura - MARGEM, y, [0.88, 0.72, 0.24], 1);
        y -= 14;
        return api;
      },

      /** Quebra o texto em linhas que cabem na página, sem cortar palavra. */
      paragrafo(txt, estilo) {
        const e = estilo || {};
        const tam = e.tam || 9.5;
        const forte = e.fonte === "forte" || e.fonte === "monoForte";
        const disponivel = A4.largura - 2 * MARGEM;
        const alturaLinha = e.altura || tam * 1.45;

        const palavras = String(txt == null ? "" : txt).split(/\s+/).filter(Boolean);
        const linhas = [];
        let atual = "";
        palavras.forEach((palavra) => {
          const tentativa = atual ? atual + " " + palavra : palavra;
          if (atual && larguraHelv(tentativa, tam, forte) > disponivel) {
            linhas.push(atual);
            atual = palavra;
          } else {
            atual = tentativa;
          }
        });
        if (atual) linhas.push(atual);
        if (!linhas.length) linhas.push("");

        linhas.forEach((linha) => {
          garantir(alturaLinha + 4);
          texto(linha, MARGEM, tam, e);
          y -= alturaLinha;
        });
        y -= 4;
        return api;
      },

      /** Blocos "rótulo / valor" lado a lado, para o resumo do topo. */
      cartoes(itens) {
        const n = itens.length;
        const larg = (A4.largura - 2 * MARGEM - (n - 1) * 8) / n;
        garantir(46);
        const topo = y;
        itens.forEach((it, i) => {
          const x = MARGEM + i * (larg + 8);
          retangulo(x, topo, larg, 42, [0.96, 0.96, 0.94]);
          y = topo - 15;
          texto(caber(it.valor, 12, larg - 14, true), x + 7, 12, { fonte: "monoForte" });
          y = topo - 30;
          texto(caber(String(it.rotulo).toUpperCase(), 7, larg - 14), x + 7, 7, {
            cor: [0.42, 0.45, 0.4],
          });
        });
        y = topo - 42 - 14;
        return api;
      },

      /**
       * @param {{colunas:Array<{titulo:string,largura:number,dir?:boolean,mono?:boolean}>,
       *          linhas:Array<Array<string>>, destaques?:Array<boolean>}} t
       */
      tabela(t) {
        const colunas = t.colunas;
        const alturaLinha = 17;

        const cabecalho = () => {
          garantir(alturaLinha * 2);
          const topo = y;
          retangulo(MARGEM, topo, A4.largura - 2 * MARGEM, alturaLinha, [0.93, 0.93, 0.9]);
          let x = MARGEM;
          colunas.forEach((col) => {
            y = topo - 12;
            const titulo = String(col.titulo).toUpperCase();
            if (col.dir) texto(titulo, x + col.largura - 6 - larguraMono(titulo, 7), 7, {
              fonte: "monoForte", cor: [0.35, 0.38, 0.34],
            });
            else texto(caber(titulo, 7, col.largura - 8), x + 6, 7, {
              fonte: "forte", cor: [0.35, 0.38, 0.34],
            });
            x += col.largura;
          });
          y = topo - alturaLinha;
        };

        cabecalho();
        t.linhas.forEach((linha, idx) => {
          if (garantir(alturaLinha)) cabecalho();
          const topo = y;
          const destacada = t.destaques && t.destaques[idx];
          if (destacada) retangulo(MARGEM, topo, A4.largura - 2 * MARGEM, alturaLinha, [1, 0.96, 0.85]);
          else if (idx % 2) retangulo(MARGEM, topo, A4.largura - 2 * MARGEM, alturaLinha, [0.98, 0.98, 0.97]);

          let x = MARGEM;
          colunas.forEach((col, i) => {
            if (col.caixa) {
              caixaVazia(x + 6, topo - 4, 9);
              x += col.largura;
              return;
            }
            const valor = linha[i] == null ? "" : String(linha[i]);
            y = topo - 12;
            const estilo = {
              fonte: col.mono || col.dir ? (destacada ? "monoForte" : "mono") : destacada ? "forte" : "normal",
              cor: valor.startsWith("-") && col.dir ? [0.75, 0.24, 0.14] : [0.11, 0.13, 0.1],
            };
            const tam = 9;
            if (col.dir) {
              const t2 = caber(valor, tam, col.largura - 12, true);
              texto(t2, x + col.largura - 6 - larguraMono(t2, tam), tam, estilo);
            } else {
              texto(caber(valor, tam, col.largura - 12, !!col.mono), x + 6, tam, estilo);
            }
            x += col.largura;
          });
          y = topo - alturaLinha;
          linhaHorizontal(MARGEM, A4.largura - MARGEM, y);
        });
        y -= 16;
        return api;
      },

      /** Fecha o documento e devolve os bytes do arquivo. */
      bytes() {
        return montar(paginas, op);
      },
    };

    return api;
  }

  /* ───────────────────── montagem do arquivo PDF ─────────────────────── */

  function montar(paginas, op) {
    const total = paginas.length;
    const rodape = op.rodape || "";

    // numeração no pé de cada página (só dá para escrever sabendo o total)
    const conteudos = paginas.map((ops, i) => {
      const partes = ops.slice();
      const txt = `${rodape}${rodape ? "   |   " : ""}Pagina ${i + 1} de ${total}`;
      partes.push(
        "0.45 0.48 0.44 rg",
        `BT /F1 7.5 Tf 1 0 0 1 ${MARGEM} ${(MARGEM - 8).toFixed(2)} Tm (${escPdf(txt)}) Tj ET`
      );
      return partes.join("\n");
    });

    const objetos = [];
    const add = (corpo) => { objetos.push(corpo); return objetos.length; }; // devolve o número do objeto

    const nCatalogo = add(null); // 1 — preenchido no fim
    const nPaginas = add(null); // 2
    const fontes = [
      add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"),
      add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>"),
      add("<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>"),
      add("<< /Type /Font /Subtype /Type1 /BaseFont /Courier-Bold /Encoding /WinAnsiEncoding >>"),
    ];
    const recursos =
      `<< /Font << /F1 ${fontes[0]} 0 R /F2 ${fontes[1]} 0 R ` +
      `/F3 ${fontes[2]} 0 R /F4 ${fontes[3]} 0 R >> >>`;

    const idsPagina = [];
    conteudos.forEach((conteudo) => {
      const nConteudo = add(`<< /Length ${conteudo.length} >>\nstream\n${conteudo}\nendstream`);
      const nPagina = add(
        `<< /Type /Page /Parent ${nPaginas} 0 R /MediaBox [0 0 ${A4.largura} ${A4.altura}] ` +
          `/Resources ${recursos} /Contents ${nConteudo} 0 R >>`
      );
      idsPagina.push(nPagina);
    });

    objetos[nCatalogo - 1] = `<< /Type /Catalog /Pages ${nPaginas} 0 R >>`;
    objetos[nPaginas - 1] =
      `<< /Type /Pages /Kids [${idsPagina.map((n) => n + " 0 R").join(" ")}] /Count ${idsPagina.length} >>`;

    let info = "<< /Producer (The Shooting Pool)";
    if (op.titulo) info += ` /Title ${textoUTF16(op.titulo)}`;
    if (op.autor) info += ` /Author ${textoUTF16(op.autor)}`;
    info += " >>";
    const nInfo = add(info);

    // corpo, guardando o deslocamento de cada objeto para a tabela xref
    let arquivo = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";
    const offsets = [];
    objetos.forEach((corpo, i) => {
      offsets[i] = arquivo.length;
      arquivo += `${i + 1} 0 obj\n${corpo}\nendobj\n`;
    });

    const inicioXref = arquivo.length;
    let xref = `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`;
    offsets.forEach((o) => { xref += String(o).padStart(10, "0") + " 00000 n \n"; });
    arquivo +=
      xref +
      `trailer\n<< /Size ${objetos.length + 1} /Root ${nCatalogo} 0 R /Info ${nInfo} 0 R >>\n` +
      `startxref\n${inicioXref}\n%%EOF\n`;

    const bytes = new Uint8Array(arquivo.length);
    for (let i = 0; i < arquivo.length; i++) bytes[i] = arquivo.charCodeAt(i) & 0xff;
    return bytes;
  }

  /* ═══════════════════ o relatório da competição ═════════════════════ */

  const fmt = (c) => C.fmt(c).replace("R$ ", "").replace("-R$ ", "-");

  const dataBR = (iso) => {
    if (!iso) return "";
    const p = String(iso).split("-");
    return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : String(iso);
  };

  /**
   * Quem entrou no lance de um sócio e pagou a parte dele.
   *
   * Num lance rachado, é comum um dos sócios bancar o valor inteiro na hora do
   * leilão e o outro entrar só na cota. Quem lê o relatório precisa enxergar
   * isso de cara: o dinheiro saiu do bolso de um, mas o lance é dos dois.
   * Sem esta seção o adiantamento só aparecia diluído no saldo.
   */
  function secaoBancados(doc, conta, larg) {
    const linhas = [];
    conta.apostas.forEach((a) => {
      if (!a.temSocios) return;
      a.participacoes.forEach((p) => {
        const adiantouC = p.pagoC - p.cotaC;
        if (adiantouC <= 0) return;
        // por quem: os sócios do mesmo lance que ficaram devendo a própria cota
        const por = a.participacoes
          .filter((x) => x.chave !== p.chave && x.pagoC < x.cotaC)
          .map((x) => x.nome)
          .join(", ");
        linhas.push([
          p.nome,
          a.atirador,
          fmt(a.valorC),
          fmt(p.pagoC),
          fmt(adiantouC),
          por || "-",
        ]);
      });
    });
    if (!linhas.length) return;

    doc.espaco(10);
    doc.titulo("Quem bancou lance de sócio");
    // nome de atirador é longo ("Alexandre P. Scachetti"): as duas colunas de
    // nome levam a folga, e as de dinheiro ficam com o que basta
    const c1 = larg * 0.19, c2 = larg * 0.21, cv = 68;
    doc.tabela({
      colunas: [
        { titulo: "Bancou", largura: c1 },
        { titulo: "Lance no atirador", largura: c2 },
        { titulo: "Lance R$", largura: cv, dir: true },
        { titulo: "Pôs R$", largura: cv, dir: true },
        { titulo: "Adiantou R$", largura: cv, dir: true },
        { titulo: "Pela cota de", largura: larg - c1 - c2 - 3 * cv },
      ],
      linhas,
      destaques: linhas.map(() => true),
    });
    doc.paragrafo(
      "Estes sócios puseram mais do que a própria cota: pagaram a parte do outro na hora do " +
        "leilão. O que adiantaram já volta para eles no acerto, e sai do saldo de quem não pôs.",
      { cor: [0.42, 0.45, 0.4], tam: 8.5 }
    );
  }

  /**
   * A lista de "quem paga quem", com quadradinho para ir marcando.
   * É a seção que serve de roteiro na hora de acertar as contas.
   */
  function secaoPagamentos(doc, acerto, larg, opcoes) {
    const o = opcoes || {};
    const lista = (acerto && acerto.pagamentos) || [];
    doc.titulo(`Pagamentos${lista.length ? " — " + lista.length + " no total" : ""}`);

    if (!lista.length) {
      doc.paragrafo("Ninguém tem nada a pagar nem a receber. Tudo quite.", {
        cor: [0.21, 0.55, 0.31],
        fonte: "forte",
      });
      doc.espaco(6);
      return;
    }

    const colValor = 96;
    doc.tabela({
      colunas: [
        { titulo: "", largura: 22, caixa: true },
        { titulo: "Quem paga", largura: (larg - 22 - colValor) / 2 },
        { titulo: "Para quem", largura: (larg - 22 - colValor) / 2 },
        { titulo: "Valor R$", largura: colValor, dir: true },
      ],
      linhas: lista.map((p) => ["", p.de, p.para, fmt(p.valorC)]),
      destaques: lista.map(() => true),
    });

    const total = lista.reduce((s, p) => s + p.valorC, 0);
    doc.paragrafo(
      `Total movimentado: R$ ${fmt(total)} em ${lista.length} pagamento(s)` +
        (o.avulsos && o.avulsos > lista.length
          ? `, no lugar de ${o.avulsos} acertos avulsos.`
          : "."),
      { fonte: "forte", tam: 10 }
    );
    doc.paragrafo(
      'Esta lista quita todo mundo no menor número de transferências: quem deve paga direto ' +
        'quem tem a receber. "Caixa do clube" é o dinheiro das apostas já pagas, que está com o ' +
        "organizador.",
      { cor: [0.42, 0.45, 0.4], tam: 8.5 }
    );
  }

  /**
   * Relatório de uma competição: ganhadores, valores e acerto de contas.
   * @param {Object} comp competição
   * @param {{geradoEm?:string, apostas?:boolean}} opcoes
   * @returns {Uint8Array}
   */
  function relatorio(comp, opcoes) {
    const o = opcoes || {};
    const conta = C.calcular(comp);
    const regra = conta.regra;
    const larg = A4.largura - 2 * MARGEM;

    const doc = criar({
      titulo: `${comp.nome || "Competição"} — apostas`,
      autor: "The Shooting Pool",
      rodape: `${comp.nome || ""}${comp.data ? " - " + dataBR(comp.data) : ""}${
        o.geradoEm ? "   |   Gerado em " + o.geradoEm : ""
      }`,
    });

    doc.capa(
      "The Shooting Pool",
      `${comp.nome || "Competição"}${comp.data ? "  ·  " + dataBR(comp.data) : ""}`
    );

    /* ── resumo ───────────────────────────────────────────────────────── */
    const cartoes = [
      { rotulo: "Bolo da competição", valor: "R$ " + fmt(conta.pote) },
      { rotulo: "Apostas", valor: String(conta.totais.nApostas) },
      { rotulo: "Apostadores", valor: String(conta.totais.nApostadores) },
      { rotulo: "Em prêmios", valor: "R$ " + fmt(conta.totais.premiosC) },
    ];
    if (conta.taxaC) cartoes.push({ rotulo: "Taxa do clube", valor: "R$ " + fmt(conta.taxaC) });
    doc.cartoes(cartoes);

    doc.paragrafo(
      "Divisão do bolo: " +
        regra.premios.map((p, i) => `${C.rotuloPosicao(i)} ${C.pct(p)}%`).join("  ·  ") +
        "   |   Rateio " +
        (regra.rateio === "igual" ? "em partes iguais entre os apostadores" : "proporcional ao valor apostado"),
      { cor: [0.42, 0.45, 0.4], tam: 9 }
    );
    doc.espaco(6);

    /* ── ganhadores ───────────────────────────────────────────────────── */
    if (conta.definido) {
      doc.titulo("Ganhadores");
      const linhas = [];
      const destaques = [];
      conta.faixas.forEach((f, i) => {
        const posicao = C.rotuloPosicao(i);
        if (!f.atirador) {
          linhas.push([posicao, "— sem colocado —", "", "", ""]);
          destaques.push(false);
          return;
        }
        if (!f.ativa) {
          linhas.push([
            posicao,
            f.atirador,
            f.repetida ? "já premiado acima" : "ninguém apostou nele",
            C.pct(f.pct) + "%",
            fmt(0),
          ]);
          destaques.push(false);
          return;
        }
        linhas.push([posicao, f.atirador, "", C.pct(f.pct) + "%", fmt(f.valorC)]);
        destaques.push(true);
        f.apostadores.forEach((p) => {
          linhas.push(["", "", p.nome, "", fmt(p.premioC)]);
          destaques.push(false);
        });
      });

      doc.tabela({
        colunas: [
          { titulo: "Lugar", largura: 46 },
          { titulo: "Atirador", largura: larg * 0.26 },
          { titulo: "Apostador", largura: larg * 0.34 },
          { titulo: "Faixa", largura: 54, dir: true },
          { titulo: "Prêmio R$", largura: larg - 46 - larg * 0.26 - larg * 0.34 - 54, dir: true },
        ],
        linhas,
        destaques,
      });
    } else {
      doc.titulo("Resultado");
      doc.paragrafo("O pódio ainda não foi lançado — nenhum prêmio foi apurado.", {
        cor: [0.55, 0.3, 0.1],
      });
      doc.espaco(8);
    }

    /* ── acerto de contas ─────────────────────────────────────────────── */
    doc.titulo("Acerto de contas");
    // 92pt na última coluna: "acerta com o sócio" não cabia em 78 e saía cortado
    const colValor = (larg - larg * 0.26 - 92) / 4;
    doc.tabela({
      colunas: [
        { titulo: "Apostador", largura: larg * 0.26 },
        { titulo: "Apostou R$", largura: colValor, dir: true },
        { titulo: "Deve R$", largura: colValor, dir: true },
        { titulo: "Prêmio R$", largura: colValor, dir: true },
        { titulo: "Saldo R$", largura: colValor, dir: true },
        { titulo: "Situação", largura: 92 },
      ],
      linhas: conta.apostadores.map((p) => [
        p.nome,
        fmt(p.apostadoC),
        // negativo aqui é o contrário de dever: bancou a parte de um sócio
        p.devendoC ? fmt(p.devendoC) : p.adiantadoC ? fmt(-p.adiantadoC) : "-",
        p.premioC ? fmt(p.premioC) : "-",
        fmt(p.saldoC),
        p.foraDoCaixa
          ? "acerta com o sócio"
          : p.acertado
          ? "acertado"
          : p.saldoC > 0
          ? "clube paga"
          : p.saldoC < 0
          ? "ele paga"
          : "quite",
      ]),
      // marca quem o clube tem de cobrar — é o que exige providência
      destaques: conta.apostadores.map((p) => !p.acertado && p.saldoC < 0),
    });

    // quem ainda precisa mover dinheiro: quem está quite não é acerto pendente
    const abertos = conta.apostadores.filter((p) => !p.acertado && p.saldoC !== 0);
    doc.paragrafo(
      `O clube paga R$ ${fmt(conta.totais.aPagarC)}  ·  o clube recebe R$ ${fmt(
        conta.totais.aReceberC
      )}  ·  ${abertos.length} acerto(s) em aberto`,
      { fonte: "forte", tam: 10 }
    );
    doc.paragrafo(
      "Saldo = prêmio ganho menos as apostas que a pessoa ainda não pagou. Positivo, o clube paga; negativo, ela paga o clube.",
      { cor: [0.42, 0.45, 0.4], tam: 8.5 }
    );

    /* ── quem bancou lance de sócio ───────────────────────────────────── */
    secaoBancados(doc, conta, larg);

    /* ── quem paga quem ───────────────────────────────────────────────── */
    doc.espaco(10);
    secaoPagamentos(doc, conta.acerto, larg);

    /* ── todas as apostas ─────────────────────────────────────────────── */
    if (o.apostas !== false && conta.apostas.length) {
      doc.espaco(10);
      doc.titulo("Apostas lançadas");
      const c1 = larg * 0.26, c2 = larg * 0.26, c3 = 70;

      // um lance rachado ganha uma linha por sócio logo abaixo, com a cota de
      // cada um e quem pôs o dinheiro: sem isso o relatório mostraria só o
      // nome de quem bancou, e o sócio sumiria da lista
      const linhasApostas = { linhas: [], destaques: [] };
      conta.apostas.forEach((a) => {
        linhasApostas.linhas.push([
          a.atirador,
          a.temSocios ? a.participacoes.map((p) => p.nome).join(" + ") : a.apostador,
          fmt(a.valorC),
          a.premioC ? fmt(a.premioC) : "-",
          a.pago ? "pago" : a.parcial ? "em parte" : "em aberto",
        ]);
        linhasApostas.destaques.push(!a.pago);
        if (!a.temSocios) return;
        a.participacoes.forEach((p) => {
          linhasApostas.linhas.push([
            "",
            p.nome,
            fmt(p.cotaC),
            "",
            // quem pôs o lance inteiro bancou a parte do outro
            p.pagoC >= a.valorC && a.valorC > 0
              ? "bancou tudo"
              : p.pagoC
              ? "pôs " + fmt(p.pagoC)
              : "não pôs nada",
          ]);
          linhasApostas.destaques.push(false);
        });
      });

      doc.tabela({
        colunas: [
          { titulo: "Atirador", largura: c1 },
          { titulo: "Apostador", largura: c2 },
          { titulo: "Valor R$", largura: (larg - c1 - c2 - c3) / 2, dir: true },
          { titulo: "Prêmio R$", largura: (larg - c1 - c2 - c3) / 2, dir: true },
          { titulo: "Pagamento", largura: c3 },
        ],
        linhas: linhasApostas.linhas,
        destaques: linhasApostas.destaques,
      });
      if (conta.totais.nSocios)
        doc.paragrafo(
          "Nos lances rachados, a linha do lance é o total; abaixo dela vem a cota de cada sócio e " +
            "quanto cada um pôs. Quem bancou a parte do outro recebe essa diferença de volta no acerto.",
          { cor: [0.42, 0.45, 0.4], tam: 8.5 }
        );
    }

    return doc.bytes();
  }

  /* ═════════════ acerto geral: todas as competições juntas ═══════════ */

  /**
   * O relatório que serve de roteiro de pagamento do clube: junta o que está
   * em aberto em todas as competições, compensa quem deve numa e tem a
   * receber noutra, e fecha na menor lista de pagamentos possível.
   *
   * @param {Object} dados o arquivo inteiro do painel
   * @param {{geradoEm?:string, clube?:string}} opcoes
   * @returns {Uint8Array}
   */
  function relatorioGeral(dados, opcoes) {
    const o = opcoes || {};
    const t = C.temporada(dados || { competicoes: [] });
    const larg = A4.largura - 2 * MARGEM;

    const doc = criar({
      titulo: "Acerto geral do clube",
      autor: "The Shooting Pool",
      rodape: `Acerto geral${o.geradoEm ? "   |   Gerado em " + o.geradoEm : ""}`,
    });

    const emAberto = t.comps.filter((c) =>
      c.conta.apostadores.some((p) => !p.acertado && p.saldoC !== 0)
    );

    doc.capa(
      "Acerto geral do clube",
      o.clube ? o.clube : `${t.totais.competicoes} competição(ões) na temporada`
    );

    const aPagar = t.pendencias.filter((p) => p.saldoC > 0).reduce((s, p) => s + p.saldoC, 0);
    const aReceber = t.pendencias.filter((p) => p.saldoC < 0).reduce((s, p) => s - p.saldoC, 0);
    doc.cartoes([
      { rotulo: "A pagar", valor: "R$ " + fmt(aPagar) },
      { rotulo: "A receber", valor: "R$ " + fmt(aReceber) },
      { rotulo: "Pessoas envolvidas", valor: String(t.pendencias.length) },
      { rotulo: "Pagamentos", valor: String(t.acerto.pagamentos.length) },
      { rotulo: "Competições", valor: String(emAberto.length) },
    ]);

    /* ── a lista de pagamentos, primeiro: é para isso que serve a folha ── */
    // quantos acertos seriam sem juntar as competições: um por pessoa, em cada uma
    const avulsos = emAberto.reduce(
      (s, c) => s + c.conta.apostadores.filter((p) => !p.acertado && p.saldoC !== 0).length,
      0
    );
    secaoPagamentos(doc, t.acerto, larg, { avulsos });

    /* ── posição de cada um ───────────────────────────────────────────── */
    if (t.pendencias.length) {
      doc.espaco(8);
      doc.titulo("Posição de cada um");

      const linhas = [];
      const destaques = [];
      t.pendencias.forEach((p) => {
        linhas.push([
          p.nome,
          p.saldoC > 0 ? "tem a receber" : "deve",
          fmt(p.saldoC),
          p.emAberto.length === 1 ? "1 competição" : p.emAberto.length + " competições",
        ]);
        destaques.push(true);
        // de onde vem o saldo, quando não é de uma competição só
        if (p.emAberto.length > 1)
          p.emAberto.forEach((e) => {
            linhas.push(["", e.competicao + (e.data ? "  " + dataBR(e.data) : ""), fmt(e.saldoC), ""]);
            destaques.push(false);
          });
      });

      doc.tabela({
        colunas: [
          { titulo: "Apostador", largura: larg * 0.26 },
          { titulo: "Situação", largura: larg * 0.34 },
          { titulo: "Saldo R$", largura: 100, dir: true },
          { titulo: "Origem", largura: larg - larg * 0.26 - larg * 0.34 - 100 },
        ],
        linhas,
        destaques,
      });
      doc.paragrafo(
        "Saldo positivo: o clube (ou outro apostador) paga a essa pessoa. Negativo: ela paga. " +
          "Quem ficou devendo numa competição e ganhou em outra já entra aqui com a diferença.",
        { cor: [0.42, 0.45, 0.4], tam: 8.5 }
      );
    }

    /* ── competições com pendência ────────────────────────────────────── */
    if (emAberto.length) {
      doc.espaco(10);
      doc.titulo("Competições em aberto");
      doc.tabela({
        colunas: [
          { titulo: "Competição", largura: larg * 0.34 },
          { titulo: "Data", largura: 74 },
          { titulo: "Bolo R$", largura: 92, dir: true },
          { titulo: "Em aberto R$", largura: 96, dir: true },
          { titulo: "Pessoas", largura: larg - larg * 0.34 - 74 - 92 - 96, dir: true },
        ],
        linhas: emAberto.map(({ comp, conta }) => {
          const gente = conta.apostadores.filter((p) => !p.acertado && p.saldoC !== 0);
          const total = gente.reduce((s, p) => s + Math.abs(p.saldoC), 0);
          return [comp.nome, dataBR(comp.data), fmt(conta.pote), fmt(total), String(gente.length)];
        }),
      });
    }

    /* ── a temporada inteira, para conferência ────────────────────────── */
    if (t.apostadores.length) {
      doc.espaco(10);
      doc.titulo("Temporada");
      doc.tabela({
        colunas: [
          { titulo: "Apostador", largura: larg * 0.3 },
          { titulo: "Apostou R$", largura: (larg - larg * 0.3 - 78) / 3, dir: true },
          { titulo: "Ganhou R$", largura: (larg - larg * 0.3 - 78) / 3, dir: true },
          { titulo: "Lucro R$", largura: (larg - larg * 0.3 - 78) / 3, dir: true },
          { titulo: "Premiadas", largura: 78, dir: true },
        ],
        linhas: t.apostadores.map((p) => [
          p.nome,
          fmt(p.apostadoC),
          fmt(p.premioC),
          fmt(p.lucroC),
          `${p.premiadas}/${p.competicoes}`,
        ]),
      });
      doc.paragrafo(
        `Movimentado na temporada: R$ ${fmt(t.totais.movimentadoC)}  ·  pago em prêmios: R$ ${fmt(
          t.totais.premiosC
        )}  ·  ficou com o clube: R$ ${fmt(t.totais.clubeC)}`,
        { fonte: "forte", tam: 9.5 }
      );
    }

    return doc.bytes();
  }

  return {
    criar,
    relatorio,
    relatorioGeral,
    winansi,
    larguraMono,
    larguraTexto: larguraHelv,
    A4,
    MARGEM,
  };
});
