/* Gera o modelo-planilha-apostas.xlsx que fica versionado no repositório.
   Rode depois de mexer no formato das abas:  npm run modelo                  */
const fs = require("node:fs");
const path = require("node:path");
const XLSX = require("../assets/vendor/xlsx.full.min.js");
const Planilha = require("../assets/planilha.js");

const LARGURAS = {
  Instruções: [{ wch: 78 }],
  Apostas: [{ wch: 26 }, { wch: 12 }, { wch: 18 }, { wch: 18 }, { wch: 11 }, { wch: 8 }],
  Resultado: [{ wch: 26 }, { wch: 11 }, { wch: 18 }, { wch: 12 }],
  Ajustes: [{ wch: 26 }, { wch: 14 }, { wch: 12 }, { wch: 8 }],
};

const abas = Planilha.modelo();
const wb = XLSX.utils.book_new();
Object.keys(abas).forEach((nome) => {
  const ws = XLSX.utils.aoa_to_sheet(abas[nome]);
  if (LARGURAS[nome]) ws["!cols"] = LARGURAS[nome];
  XLSX.utils.book_append_sheet(wb, ws, nome.slice(0, 31));
});

// o pacote embutido é a versão de navegador: geramos o buffer e gravamos aqui
const destino = path.resolve(__dirname, "..", "modelo-planilha-apostas.xlsx");
fs.writeFileSync(destino, XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
console.log("Modelo gravado em", destino, "—", fs.statSync(destino).size, "bytes");
