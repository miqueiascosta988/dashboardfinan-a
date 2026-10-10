const { DI, pdfPages, fx } = require('./helpers');
(async () => {
  for (const f of process.argv.slice(2)) {
    const pages = await pdfPages(fx(f));
    const res = DI.analyzePages(pages);
    console.log('==', f, 'páginas:', pages.length, 'holerites:', res.length);
    res.forEach(r => { const p = r.payslip; console.log(JSON.stringify({ pages: r.pages, copies: r.copies, comp: p.competencia, tipo: p.tipo, w: p.worker, e: p.employer, tot: p.totals, bases: p.bases, conf: p.confidence, st: p.status, bad: p.checks.filter(c => !c.ok).map(c => c.id) })); p.rows.forEach(x => console.log('   ', x.kind, x.kindSource, x.cat, x.desc, x.ref, x.valor)); });
  }
})();
