/* Servidor local mínimo (sem dependências) — use com:  npm start
   Serve os arquivos da pasta do projeto em http://localhost:8000            */
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const RAIZ = path.resolve(__dirname, "..");
const PORTA = Number(process.env.PORT) || 8000;

const TIPOS = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".pdf": "application/pdf",
};

http
  .createServer((req, res) => {
    const pedido = decodeURIComponent(req.url.split("?")[0]);
    const alvo = path.join(RAIZ, pedido === "/" ? "index.html" : pedido);

    // nunca sair da pasta do projeto
    if (!alvo.startsWith(RAIZ)) {
      res.writeHead(403).end("403");
      return;
    }
    fs.readFile(alvo, (err, buf) => {
      if (err) {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("404 — não achei " + pedido);
        return;
      }
      res.writeHead(200, {
        "Content-Type": TIPOS[path.extname(alvo).toLowerCase()] || "application/octet-stream",
        "Cache-Control": "no-store",
      });
      res.end(buf);
    });
  })
  .listen(PORTA, () => {
    console.log(`The Shooting Pool rodando em http://localhost:${PORTA}`);
    console.log("Para parar: Ctrl+C");
  });
