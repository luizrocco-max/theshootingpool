/**
 * The Shooting Pool — Worker de publicação (Cloudflare)
 * ────────────────────────────────────────────────────────────────────────────
 * Recebe do site { password, dados } e, se a senha bater, grava
 * data/apostas.json no repositório do GitHub. O token do GitHub fica escondido
 * aqui dentro — nunca no site, nunca no celular de ninguém.
 *
 * Variáveis (painel do Worker → Settings → Variables and Secrets):
 *   ADMIN_PASSWORD  (Secret) — senha do organizador
 *   GITHUB_TOKEN    (Secret) — token fine-grained com Contents: Read and write
 *   GITHUB_REPO     (Text)   — luizrocco-max/theshootingpool
 *   ALLOW_ORIGINS   (Text)   — opcional: endereços do site, separados por vírgula
 */

const DATA_PATH = "data/apostas.json";
const ORIGENS_PADRAO = ["https://luizrocco-max.github.io"];

function origensPermitidas(env) {
  const extra = String(env.ALLOW_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return extra.length ? extra : ORIGENS_PADRAO;
}

function corsHeaders(origin, env) {
  const permitidas = origensPermitidas(env);
  const allow = permitidas.includes(origin) ? origin : permitidas[0];
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...cors },
  });
}

function b64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

/** Confere senha sem vazar o tempo de comparação. */
function senhaConfere(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let dif = 0;
  for (let i = 0; i < a.length; i++) dif |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return dif === 0;
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const cors = corsHeaders(origin, env);

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (request.method !== "POST") return json({ ok: false, error: "Método não permitido" }, 405, cors);

    let body;
    try {
      body = await request.json();
    } catch (e) {
      return json({ ok: false, error: "JSON inválido" }, 400, cors);
    }

    const { password, dados } = body || {};
    if (!senhaConfere(password, env.ADMIN_PASSWORD))
      return json({ ok: false, error: "Senha incorreta" }, 401, cors);

    // o painel manda o conteúdo cifrado com a senha do clube (cofre), mas
    // arquivos antigos, em texto puro, continuam aceitos
    const cifrado = dados && dados.cofre && dados.dados && dados.sal && dados.iv;
    const puro = dados && Array.isArray(dados.competicoes);
    if (!cifrado && !puro) return json({ ok: false, error: "Dados inválidos" }, 400, cors);

    const repo = env.GITHUB_REPO;
    const url = `https://api.github.com/repos/${repo}/contents/${DATA_PATH}`;
    const ghHeaders = {
      Authorization: `token ${env.GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "shooting-pool-publish-worker",
    };

    // o sha atual é obrigatório para sobrescrever um arquivo existente
    let sha = null;
    const getR = await fetch(url, { headers: ghHeaders });
    if (getR.ok) sha = (await getR.json()).sha;

    const putBody = {
      message: `apostas: ${dados.atualizado_em || "atualização"}`,
      content: b64(JSON.stringify(dados, null, 2)),
    };
    if (sha) putBody.sha = sha;

    const putR = await fetch(url, {
      method: "PUT",
      headers: ghHeaders,
      body: JSON.stringify(putBody),
    });
    if (!putR.ok) {
      let detalhe = "";
      try {
        detalhe = (await putR.json()).message || "";
      } catch (e) {}
      return json({ ok: false, error: `GitHub: ${putR.status} ${detalhe}` }, 502, cors);
    }
    return json({ ok: true }, 200, cors);
  },
};
