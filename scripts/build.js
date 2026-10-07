// Gera dist/ a partir de public/: copia os arquivos e minifica o JavaScript embutido no index.html
// (dificulta a leitura e a cópia do código). Uso: npm run build   (requer: npm i -D terser)
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..'), SRC = path.join(ROOT, 'public'), OUT = path.join(ROOT, 'dist');
const BANNER = '/*! © 2026 360 Suítes. Todos os direitos reservados. Proibida a cópia, reprodução ou engenharia reversa. */\n';

(async () => {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.cpSync(SRC, OUT, { recursive: true });
  let terser = null;
  try { terser = require('terser'); } catch (e) { console.warn('⚠️  terser não instalado: dist/ foi copiado SEM minificar (rode: npm i -D terser)'); }
  const file = path.join(OUT, 'index.html');
  let html = fs.readFileSync(file, 'utf8'), n = 0;
  if (terser) {
    const re = /<script>([\s\S]*?)<\/script>/g, parts = []; let last = 0, m;
    while ((m = re.exec(html))) {
      parts.push(html.slice(last, m.index));
      const r = await terser.minify(m[1], { compress: { passes: 2 }, mangle: true, format: { comments: false } }); // sem mangle de nomes globais: os onclick="..." dependem deles
      if (r.error || !r.code) throw new Error('Falha ao minificar um bloco de script');
      parts.push('<script>' + BANNER + r.code + '</script>'); last = m.index + m[0].length; n++;
    }
    parts.push(html.slice(last)); html = parts.join('');
    html = html.replace(/<!--(?!\[if)[\s\S]*?-->/g, ''); // remove comentários HTML
  }
  fs.writeFileSync(file, html);
  console.log('dist/ pronto' + (terser ? ' (' + n + ' script(s) minificado(s))' : ' (sem minificação)'));
})().catch(e => { console.error(e); process.exit(1); });
