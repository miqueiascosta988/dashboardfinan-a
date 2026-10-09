// Fixa a versão exata e adiciona verificação de integridade (SRI) nos scripts de CDN.
// Uso (na pasta do projeto, com internet):   node scripts/sri.js
// Reescreve public/index.html e public/interno/index.html. Rode de novo ao atualizar uma biblioteca.
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const files = ['public/index.html', 'public/interno/index.html'].map(f => path.join(__dirname, '..', f));
const TAG = /<script\b([^>]*?)\ssrc="(https:\/\/cdn\.jsdelivr\.net\/npm\/(@?[^\/@"]+(?:\/[^\/@"]+)?)@([^\/"]+)(\/[^"]*)?)"([^>]*)><\/script>/g;
async function resolve(pkg, range) {
  if (/^\d+\.\d+\.\d+$/.test(range)) return range;
  const r = await fetch('https://data.jsdelivr.com/v1/package/resolve/npm/' + pkg + '@' + range);
  if (!r.ok) throw new Error('não resolveu ' + pkg + '@' + range);
  return (await r.json()).version;
}
(async () => {
  for (const file of files) {
    if (!fs.existsSync(file)) continue;
    let html = fs.readFileSync(file, 'utf8'), out = html, m; const seen = [];
    TAG.lastIndex = 0;
    while ((m = TAG.exec(html))) seen.push(m);
    for (const m of seen) {
      const [full, pre, , pkg, range, sub = '', post] = m;
      const ver = await resolve(pkg, range);
      const url = 'https://cdn.jsdelivr.net/npm/' + pkg + '@' + ver + sub;
      const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
      const hash = 'sha384-' + crypto.createHash('sha384').update(buf).digest('base64');
      const clean = (pre + post).replace(/\s(integrity|crossorigin)="[^"]*"/g, '');
      out = out.replace(full, '<script' + clean + ' src="' + url + '" integrity="' + hash + '" crossorigin="anonymous"></script>');
      console.log(path.basename(path.dirname(file)) + '/' + path.basename(file), pkg + '@' + ver, hash.slice(0, 24) + '…');
    }
    fs.writeFileSync(file, out);
  }
  console.log('Pronto. Teste o login e o leitor de PDF antes de publicar. Atualize a versão do pdf.worker (index.html) igual à do pdf.min.js.');
})().catch(e => { console.error('Falhou:', e.message); process.exit(1); });
