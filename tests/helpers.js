// Extrai texto posicionado de PDFs com o MESMO pdf.js usado no navegador (build legacy, Node).
const path = require('path'), fs = require('fs'), crypto = require('crypto');
const DI = require('../public/docintel.js');
let pdfjs;
async function load() {
  if (!pdfjs) pdfjs = await import(path.join(process.env.PDFJS_DIR || '/home/claude/.npm-global/lib/node_modules/pdfjs-dist', 'legacy/build/pdf.mjs'));
  return pdfjs;
}
async function pdfPages(file) {
  const lib = await load();
  const data = new Uint8Array(fs.readFileSync(file));
  const pdf = await lib.getDocument({ data, useSystemFonts: true, verbosity: 0 }).promise;
  const pages = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const tc = await (await pdf.getPage(p)).getTextContent();
    pages.push(DI.buildLines(tc.items.map(it => ({ s: it.str, x: it.transform[4], y: it.transform[5], w: it.width }))));
  }
  return pages;
}
const sha = f => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const fx = n => path.join(__dirname, 'fixtures', n);
module.exports = { DI, pdfPages, sha, fx };
