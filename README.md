# 🎯 The Shooting Pool — apostas do clube de tiro

Painel para controlar as apostas nas competições do clube: quem apostou em quem,
quanto, quem já pagou, e — depois do resultado — **quanto cada um recebe ou paga**.

É um site **estático**: HTML + JavaScript, sem servidor e sem banco de dados. O
cálculo roda no próprio navegador e os dados ficam gravados no aparelho de quem
organiza. Publicar para o clube inteiro ver é opcional.

---

## A regra do bolo

O **bolo** é a soma de **todas** as apostas da competição — inclusive as que
ainda não foram pagas. Depois do resultado ele é dividido por colocação. O padrão
do clube é:

| Faixa | Vai para quem apostou no… |
| ----: | ------------------------- |
|  50%  | 🥇 1º colocado            |
|  30%  | 🥈 2º colocado            |
|  20%  | 🥉 3º colocado            |

Dentro de cada faixa o dinheiro é rateado **proporcionalmente ao valor apostado**
(quem pôs mais, leva mais). Dá para trocar para partes iguais nos Ajustes.

### Os percentuais são livres

Isso acima é só o padrão. Na aba **🏆 Resultado** cada colocação tem o seu campo
de percentual, editável na hora, e os botões **+ colocação** / **− colocação**
mudam quantos lugares o clube premia — de só o campeão até 20 colocados.

- Os percentuais **não precisam somar 100%**: o bolo é dividido na proporção que
  estiver escrita (`2 / 1 / 1` paga igual a `50 / 25 / 25`).
- Em **❓ Como funciona → Ajustes** há atalhos prontos: `50/30/20`, `60/40`,
  `100`, `40/30/20/10`, `40/25/15/12/8`, `35/25/18/12/6/4`.
- Cada competição guarda a sua própria divisão — mudar uma não mexe nas antigas.
  O botão **Usar também nas próximas** adota a configuração atual como padrão.

> **Exemplo.** Bolo de R$ 1.000. No 1º colocado apostaram Ana (R$ 100) e Bruno
> (R$ 300) — R$ 400 no total. A faixa do 1º lugar vale R$ 500: Ana entrou com 1/4
> e leva **R$ 125**; Bruno entrou com 3/4 e leva **R$ 375**.

### Quem ainda não pagou a aposta

A aposta entra no bolo mesmo sem estar paga — vira uma dívida da pessoa com o
clube. No acerto, a conta é sempre **líquida**:

- Ana devia R$ 100 e ganhou R$ 125 → **o clube paga R$ 25 a ela**.
- Carla devia R$ 100 e não ganhou nada → **Carla paga R$ 100 ao clube**.

Ao marcar **Acertar** na aba *Acerto de contas*, as apostas em aberto daquela
pessoa passam a constar como pagas e ela sai da lista de pendências.

### Ninguém apostou num dos colocados

Por padrão a fatia dele é **redividida** entre as faixas que têm apostador,
mantendo a proporção entre elas (só 1º e 3º com apostas → 50/70 e 20/70 do bolo).
Em ⚙️ → Ajustes dá para mandar essa sobra para o caixa do clube.

Os percentuais, o tipo de rateio, o destino da sobra e uma taxa opcional do clube
são configuráveis **por competição** — e podem virar o padrão das próximas.

---

## Como usar numa competição

1. **+ Nova competição** — dê um nome (ex.: *Etapa de agosto*) e a data.
2. Aba **💵 Apostas** — lance atirador, apostador e valor, marcando quem já pagou.
   O campo do atirador continua preenchido, para lançar várias apostas seguidas
   no mesmo atirador. Antes do resultado, a aba **🏆 Resultado** mostra a
   simulação: quanto cada atirador pagaria se terminasse em 1º, 2º ou 3º.
3. Terminada a prova, informe o **pódio** na aba 🏆 Resultado.
4. Aba **🤝 Acerto de contas** — a lista de quem o clube paga e de quem o clube
   cobra. Dá para **copiar o resumo** (pronto para colar no WhatsApp) ou
   **imprimir**. Marque cada um como *acertado* conforme for pagando/recebendo.
5. Aba **📊 Temporada** — o consolidado: lucro de cada apostador, pódios de cada
   atirador e as competições com pendência em aberto.

---

## Lance rachado entre sócios

Um lance pode ser de duas ou mais pessoas, com **um deles bancando o valor
inteiro**. Cada sócio tem duas coisas separadas:

- a **cota** — quanto daquele lance é dele (a parte que ele deve);
- o **pagou** — quanto ele pôs do próprio bolso.

Quem bancou a parte do outro recebe a diferença de volta no acerto.

> **O caso típico.** Luiz e João racham meio a meio um lance de **R$ 500** no
> atirador A, mas quem entregou os R$ 500 foi o Luiz. O atirador A vence e a
> faixa paga **R$ 1.000**.

Daí saem dois jeitos de acertar, escolhidos em **👥** no próprio lance (ou nos
ajustes, valendo para a competição toda):

| Modo | O que acontece |
| --- | --- |
| **Dividir entre os sócios** (padrão) | Luiz recebe **R$ 750** (R$ 500 do prêmio + os R$ 250 que adiantou) e João recebe **R$ 250** (R$ 500 do prêmio − os R$ 250 da cota dele). Cada um já sai quite. |
| **Tudo para quem bancou** | Luiz recebe os **R$ 1.000** sozinho e acerta com o João por fora. O João aparece no acerto como *acerta com o sócio*, sem entrar nas contas do clube. |
| **Tudo para um sócio escolhido** | O mesmo, mas nomeando quem recebe. Escolhendo o João, ele leva os **R$ 1.000** e o **Luiz sai quite** — o lance que ele bancou passa a ser dele nas contas, para ele não ficar no prejuízo por ter pago sem receber. |

O botão 👥 fica em cada linha da tabela de lances. Ao abrir, ele já traz quem
lançou na primeira linha; é só acrescentar o sócio, ajustar a cota (tudo `1` =
partes iguais) e escrever quanto cada um pôs. O resumo embaixo mostra ao vivo a
cota de cada um em reais e quem adiantou ou ainda deve.

Na planilha, isso vive na aba **`Socios`**: `COMPETICAO · ATIRADOR · SOCIO ·
COTA · PAGOU · QUEM LEVA`, uma linha por pessoa, ligada ao lance pelo atirador.

---

## Abater o lance do prêmio, ou não

Quem ganhou e ainda não pagou o lance pode acertar de dois jeitos. A escolha
fica nos Ajustes, ou num atalho na própria aba 🤝 Acerto de contas.

> Luiz devia **R$ 500** do lance e ganhou **R$ 1.000**.

| Modo | O que acontece |
| --- | --- |
| **Abater** (padrão) | Um acerto só: o clube paga **R$ 500** a ele e está quite. |
| **Cobrar e pagar em separado** | Dois movimentos: o Luiz paga os **R$ 500** do lance e recebe os **R$ 1.000** do prêmio. Dá mais transferências, mas o caixa registra as duas pontas. |

O saldo líquido é o mesmo nos dois casos — muda só como o dinheiro anda. Sem
abate, quem adiantou pelo sócio também recebe esse adiantamento à parte.

---

## Quem paga quem

Acertar as contas passando tudo pelo caixa dá uma transferência por pessoa, em
cada competição. O painel calcula a lista **mínima** de pagamentos: quem deve
paga direto quem tem a receber.

> Elza não pagou os R$ 400 da aposta e perdeu; Carla tem R$ 130 a receber.
> Em vez de a Elza pagar o clube e o clube pagar a Carla, **a Elza paga a Carla**.

O **caixa do clube** entra na lista quando o organizador está com dinheiro de
apostas já pagas — esse dinheiro também precisa sair.

Aparece em dois lugares:

- **🤝 Acerto de contas** — os pagamentos daquela competição;
- **📊 Temporada → Acerto geral** — junta **todas as competições em aberto**.
  Quem ficou devendo numa etapa e ganhou em outra entra com a diferença, e sai
  um pagamento só (ou nenhum) no lugar de vários. O botão **📄 Baixar PDF do
  acerto** gera a folha com a lista, um quadradinho para ir marcando o que já
  foi pago, a posição de cada um com a origem de cada saldo, e o resumo da
  temporada.

O método é: primeiro os pares que se anulam exatamente, depois os trios que
fecham em zero, e o resto no guloso — o maior devedor paga o maior credor. Num
teste com 300 conjuntos aleatórios de saldos, isso bateu o **mínimo exato**
(calculado por força bruta) em **225 dos 227 casos válidos**; nos outros dois
saiu um pagamento a mais. Nunca passa de *pessoas − 1* pagamentos.

---

## PDF dos ganhadores

O botão **📄 Baixar PDF** — nas abas 🏆 Resultado e 🤝 Acerto de contas — gera o
relatório da competição em A4:

- cabeçalho com o nome da competição e a data;
- resumo: bolo, nº de apostas, apostadores, total em prêmios e taxa do clube;
- a divisão em vigor (`1º 50% · 2º 30% · 3º 20%`, ou o que estiver configurado);
- **Ganhadores**: cada colocação com o atirador, a faixa e quanto cada apostador leva;
- **Acerto de contas**: apostou, deve, prêmio, saldo e situação de cada um, com
  quem o clube precisa cobrar em destaque;
- **Apostas lançadas** para conferência, marcando as que estão em aberto;
- **Pagamentos** — a lista de quem paga quem, com quadradinho para ir marcando.

O arquivo é gerado no próprio navegador, sem enviar nada para lugar nenhum, e
quebra em várias páginas repetindo o cabeçalho das tabelas quando a lista é longa.

---

## Lançar por planilha

Dá para trabalhar pelo painel, pela planilha, ou pelos dois — a seção
**Planilha**, na aba 💵 Apostas, tem três botões:

| Botão                        | O que faz                                                                   |
| ---------------------------- | --------------------------------------------------------------------------- |
| **⬇️ Baixar modelo**         | Excel com as colunas certas, instruções e um exemplo preenchido              |
| **⬆️ Importar planilha**     | Lê a planilha e cria (ou atualiza) as competições                            |
| **⬇️ Exportar tudo (Excel)** | Gera as apostas, o resultado, os ajustes, o acerto de contas e a temporada    |

O modelo também está versionado aqui: [`modelo-planilha-apostas.xlsx`](modelo-planilha-apostas.xlsx).

### Como a planilha é organizada

**Aba `Apostas`** — uma linha por aposta:

| COMPETICAO       | DATA       | ATIRADOR | APOSTADOR | VALOR | PAGO |
| ---------------- | ---------- | -------- | --------- | ----: | ---- |
| Etapa de agosto  | 15/08/2026 | Zé       | Ana       |   100 | sim  |
|                  |            | Zé       | Bruno     |   300 | não  |

`COMPETICAO` e `DATA` em branco repetem o valor da linha de cima.

**Aba `Resultado`** — o pódio **e os percentuais**, uma linha por colocação:

| COMPETICAO      | COLOCACAO | ATIRADOR | PERCENTUAL |
| --------------- | --------: | -------- | ---------: |
| Etapa de agosto |         1 | Zé       |         50 |
|                 |         2 | Rui      |         30 |
|                 |         3 | Kiko     |         20 |

É aqui que se premia 4º, 5º lugar: basta acrescentar linhas. Para premiar só o
campeão, deixe uma linha com `100`.

**Aba `Ajustes`** (opcional) — `RATEIO` (`proporcional` ou `igual`), `SOBRA`
(`redividir` ou `clube`) e `TAXA` (% do clube).

A leitura é tolerante: as colunas podem estar em qualquer ordem, aceitam
sinônimos (`ETAPA`, `EM QUEM APOSTOU`, `QUEM APOSTOU`, `R$`, `PAGOU`…), o valor
pode vir como número ou como `R$ 1.234,56`, a data como texto ou data do Excel, e
o pagamento como `sim/não`, `x`, `ok`, `1`. Linhas incompletas são puladas com
aviso, em vez de virarem dados errados.

**Reimportar a mesma competição** — mesmo nome e mesma data — substitui as
apostas dela em vez de duplicar. Outras competições entram como novas.

As abas `Apostas`, `Resultado` e `Ajustes` da exportação voltam a ser importadas:
dá para exportar, mexer no Excel e trazer de volta.

---

## Onde ficam os dados

No **navegador do aparelho** que está usando o painel (`localStorage`). Não sai
dali sozinho — nada é enviado para lugar nenhum sem você mandar.

Isso quer dizer que:

- Cada aparelho tem a sua cópia. Se você lançar no celular, o notebook não sabe.
- Limpar os dados do navegador apaga tudo.

Por isso: **faça backup**. ⚙️ → *Baixar backup (.json)*. Para levar para outro
aparelho, use ⚙️ → *Restaurar backup* lá. O backup sai **sem senha**, para você
conseguir recuperar os dados mesmo se esquecer a do clube — guarde-o num lugar
seu, não no grupo do WhatsApp.

---

## A senha do clube

O site pede uma **senha única**, a mesma para você e para os amigos. Sem ela, a
tela de entrada não sai do lugar.

### Por que a senha é levada a sério aqui

Num site estático em repositório público, uma tela de senha só em JavaScript
**não protege nada**: quem abre o código-fonte a encontra, e quem pede
`data/apostas.json` direto no navegador baixa tudo sem passar pela tela.

Por isso o que é publicado vai **cifrado com a senha do clube**: a senha vira
uma chave (PBKDF2-SHA256, 310 mil rodadas, sal sorteado) e os dados são fechados
com AES-GCM, usando o WebCrypto do próprio navegador. Quem baixar o arquivo sem
a senha encontra só um bloco ilegível — nem nome, nem valor, nem quem está
devendo. O AES-GCM ainda detecta se alguém alterou o arquivo.

### O que a senha protege — e o que não protege

| Protege                                                  | Não protege                                                     |
| -------------------------------------------------------- | --------------------------------------------------------------- |
| Os dados publicados, para quem não tem a senha            | O código do site, que é público (e não tem nada de secreto)      |
| O arquivo contra alteração por terceiros (AES-GCM)        | A cópia local no seu aparelho, gravada em texto — proteja o aparelho |
| A entrada no painel, em qualquer aparelho                 | Um backup `.json` que você mesmo compartilhe                     |

Como o arquivo cifrado é público, alguém pode tentar **adivinhar a senha
offline**. É por isso que o app exige no mínimo 8 caracteres e avisa quando a
senha é fraca. Use uma **frase**: `pratoquebrado no domingo` é fácil de lembrar,
fácil de passar no grupo e inviável de adivinhar. Evite `clube123` e parentes.

### Detalhes práticos

- **Não há recuperação de senha.** Perdeu, perdeu — restaure de um backup.
- **Trocar a senha:** ⚙️ → *Senha do clube*. Vale para todos só depois de
  **publicar de novo** (o arquivo antigo continua fechado com a senha antiga).
- **Lembrar neste aparelho** guarda a senha naquele navegador para não digitar
  toda vez. Deixe desmarcado em aparelho compartilhado.
- A **senha do clube** (todo mundo, para ver) é diferente da **senha do
  organizador** (só você, que autoriza publicar no Worker). Podem ser iguais,
  mas não devem: quem publica pode sobrescrever tudo.

---

## Publicar para o clube (opcional)

Serve para todo mundo ver os números pelo link, sem instalar nada.

### 1. Ligar o GitHub Pages

**Settings → Pages → Source: Deploy from a branch → `main` / `(root)` → Save.**
Em ~1 minuto sai a URL, tipo `https://luizrocco-max.github.io/theshootingpool/`.

> Em conta gratuita o Pages só funciona em repositório **público** — o endereço
> do site e o código ficam abertos. Tudo bem: o que é publicado vai cifrado com a
> senha do clube (veja acima), então quem chegar sem a senha não vê nome nem
> valor nenhum. O HTTPS do Pages também é necessário para a parte de segurança
> funcionar: o navegador só libera o WebCrypto em `https` (ou em `localhost`).

### 2. Ligar o publicador (para atualizar pelo próprio site)

O painel manda os dados para um **Cloudflare Worker**, que confere a senha do
organizador e grava `data/apostas.json` no repositório. O token do GitHub fica
guardado no Worker — nunca no site nem no celular.

1. Crie um Worker novo em <https://dash.cloudflare.com> e cole o conteúdo de
   [`cloudflare-worker.js`](cloudflare-worker.js).
2. Em **Settings → Variables and Secrets**, crie:
   - `ADMIN_PASSWORD` *(Secret)* — a senha do organizador;
   - `GITHUB_TOKEN` *(Secret)* — token fine-grained com **Contents: Read and write**
     neste repositório (<https://github.com/settings/tokens?type=beta>);
   - `GITHUB_REPO` *(Text)* — `luizrocco-max/theshootingpool`;
   - `ALLOW_ORIGINS` *(Text)* — o endereço do site, ex.:
     `https://luizrocco-max.github.io`.
3. No painel, ⚙️ → cole o endereço do Worker e a senha → **💾 Publicar**.

Sem Worker também dá: ⚙️ → *Baixar backup* e suba o arquivo como
`data/apostas.json` no repositório.

Quem abrir o site pela primeira vez digita a senha do clube e carrega o que está
publicado. Quem já tem dados no aparelho continua com os seus — para trocar, use
⚙️ → *Trazer o que está publicado* (isso substitui a cópia local, então baixe um
backup antes).

---

## Rodar no seu computador

Node é usado só para o servidorzinho local e para os testes — **não há build nem
dependências para instalar**.

```bash
npm start     # abre em http://localhost:8000
npm test      # roda os testes do cálculo e da leitura de planilha
npm run modelo  # regera o modelo-planilha-apostas.xlsx
```

Sem Node, qualquer servidor estático serve (`python3 -m http.server 8000`). Abrir
o `index.html` direto pelo `file://` não funciona bem, porque o navegador bloqueia
a leitura de `data/apostas.json`.

---

## Estrutura

```
index.html                     # a interface (HTML + CSS) e a tela de entrada
assets/calc.js                 # motor de cálculo: faixas, rateio, acerto, temporada
assets/cofre.js                # senha do clube: cifra o que é publicado (WebCrypto)
assets/planilha.js             # leitura e escrita das abas da planilha
assets/pdf.js                  # gerador de PDF (sem biblioteca externa)
assets/app.js                  # as telas, a gravação local e a publicação
assets/vendor/xlsx.full.min.js # SheetJS, para ler e gravar .xlsx (carregado sob demanda)
data/apostas.json              # dados publicados para o clube (opcional)
modelo-planilha-apostas.xlsx   # modelo entregue ao clube
test/calc.test.js              # testes do cálculo
test/cofre.test.js             # testes da senha e da cifragem
test/planilha.test.js          # testes da planilha, incluindo um .xlsx de verdade
test/pdf.test.js               # testes do PDF (estrutura, xref, acentuação)
test/pagamentos.test.js        # testes do quem paga quem, contra a força bruta
scripts/serve.js               # servidor local sem dependências (npm start)
scripts/gerar-modelo.js        # regera o modelo (npm run modelo)
cloudflare-worker.js           # publicador com senha (opcional)
.nojekyll                      # serve o site sem processamento Jekyll
```

Todo o dinheiro é calculado em **centavos inteiros**, com sobras distribuídas pelo
método do maior resto — a soma dos prêmios sempre fecha exatamente com o bolo, sem
centavo sumindo no arredondamento, com qualquer combinação de percentuais. A aba
*Acerto de contas* mostra essa conferência.

O PDF é escrito à mão (`assets/pdf.js`, PDF 1.4 com as fontes que todo leitor já
tem), sem biblioteca. O único código de terceiros no projeto é o
[SheetJS](https://sheetjs.com) (`xlsx` 0.18.5, licença Apache-2.0), embutido em
`assets/vendor/` para o site funcionar sem depender de CDN — e carregado só
quando alguém usa a planilha.
