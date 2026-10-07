// Área INTERNA (equipe): Auditoria Fiscal de empresas clientes.
// - Só entra quem estiver na tabela `staff` (verificado no servidor com o token do próprio usuário).
// - Os dados dos clientes são lidos com o token da equipe, sob RLS (policies em 009_staff_auditoria.sql). Nenhuma chave de serviço é usada.
// - O motor de auditoria roda aqui; o navegador só recebe o relatório pronto e a interface é entregue apenas a quem passou na checagem.
// - Cada auditoria é registrada em `staff_audit_log` (quem auditou qual cliente e quando).
const express = require('express');
const fs = require('fs');
const path = require('path');
const { audit } = require('../audit/engine');

const router = express.Router();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const hits = new Map();
function limiter(max, windowMs) {
  return (req, res, next) => {
    const now = Date.now(), k = req.ip, arr = (hits.get(k) || []).filter(t => now - t < windowMs);
    if (arr.length >= max) return res.status(429).json({ error: 'Muitas requisições. Aguarde um instante.' });
    arr.push(now); hits.set(k, arr); next();
  };
}
setInterval(() => { const now = Date.now(); for (const [k, v] of hits) { const f = v.filter(t => now - t < 60000); if (f.length) hits.set(k, f); else hits.delete(k); } }, 60000).unref();

async function staffOnly(req, res, next) {
  res.set('Cache-Control', 'no-store');
  const h = req.headers.authorization || '', token = h.startsWith('Bearer ') ? h.slice(7) : '';
  if (!token) return res.status(401).json({ error: 'Entre com a sua conta da equipe.' });
  const base = process.env.SUPABASE_URL, key = process.env.SUPABASE_ANON_KEY;
  if (!base || !key) return res.status(503).json({ error: 'Serviço indisponível.' });
  try {
    const headers = { apikey: key, Authorization: 'Bearer ' + token };
    const u = await fetch(base + '/auth/v1/user', { headers });
    if (!u.ok) return res.status(401).json({ error: 'Sessão expirada. Entre novamente.' });
    const user = await u.json();
    const s = await fetch(base + '/rest/v1/staff?user_id=eq.' + encodeURIComponent(user.id) + '&select=role', { headers });
    const rows = s.ok ? await s.json() : [];
    if (!Array.isArray(rows) || !rows[0]) return res.status(403).json({ error: 'Acesso restrito à equipe.' });
    req.staff = { id: user.id, email: user.email, role: rows[0].role, headers };
    next();
  } catch (e) { res.status(503).json({ error: 'Serviço de autenticação indisponível.' }); }
}

async function rest(req, p, init) {
  const r = await fetch(process.env.SUPABASE_URL + '/rest/v1/' + p, Object.assign({ headers: req.staff.headers }, init || {}));
  return r;
}
const maskDoc = (t, n) => !n ? '' : t === 'cpf' ? '•••.•••.•••-' + n.slice(-2) : n.length === 14 ? n.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : n;

// Interface (HTML) — entregue só depois da checagem de equipe
router.get('/ui', limiter(30, 60000), staffOnly, (req, res) => {
  res.type('html').send(fs.readFileSync(path.join(__dirname, '..', 'internal', 'ui.html'), 'utf8'));
});

// Lista de empresas (PJ) para escolher
router.get('/clients', limiter(60, 60000), staffOnly, async (req, res) => {
  try {
    const q = String(req.query.q || '').trim().slice(0, 60);
    let filter = '&or=(company_type.not.is.null,profile_type.eq.PJ)';
    const digits = q.replace(/\D/g, '');
    if (digits.length >= 4) filter += '&document_number=ilike.*' + encodeURIComponent(digits) + '*';
    else if (q) filter += '&cnpj_data->>razao_social=ilike.*' + encodeURIComponent(q.replace(/[*%(),]/g, ' ')) + '*';
    const r = await rest(req, 'profiles?select=id,plan,company_type,pj_activity,document_type,document_number,cnpj_data' + filter + '&limit=50');
    if (!r.ok) return res.status(502).json({ error: 'Não foi possível listar as empresas.' });
    const rows = await r.json();
    res.json({ clients: rows.map(p => ({ id: p.id, razao: (p.cnpj_data && p.cnpj_data.razao_social) || null, tipo: p.company_type, atividade: p.pj_activity, plano: p.plan, doc: maskDoc(p.document_type, p.document_number) })) });
  } catch (e) { res.status(502).json({ error: 'Não foi possível listar as empresas.' }); }
});

// Roda a auditoria de uma empresa
router.post('/audit', limiter(20, 60000), staffOnly, express.json({ limit: '5kb' }), async (req, res) => {
  const id = String((req.body && req.body.clientId) || '');
  if (!UUID.test(id)) return res.status(400).json({ error: 'Empresa inválida.' });
  try {
    const since = new Date(); since.setMonth(since.getMonth() - 14); const d0 = since.toISOString().slice(0, 10);
    const [pr, tr, dr] = await Promise.all([
      rest(req, 'profiles?id=eq.' + id + '&select=plan,company_type,pj_activity,document_type,document_number,cnpj_data&limit=1'),
      rest(req, 'transactions?user_id=eq.' + id + '&date=gte.' + d0 + '&select=type,description,category,amount,date,profile&limit=5000'),
      rest(req, 'documents?user_id=eq.' + id + '&select=name,type,category,amount&limit=2000'),
    ]);
    if (!pr.ok) return res.status(502).json({ error: 'Não foi possível ler os dados da empresa.' });
    const prof = await pr.json();
    if (!Array.isArray(prof) || !prof[0]) return res.status(404).json({ error: 'Empresa não encontrada.' });
    const tx = tr.ok ? await tr.json() : [], docs = dr.ok ? await dr.json() : [];
    const report = audit(prof[0], Array.isArray(tx) ? tx : [], Array.isArray(docs) ? docs : []);
    // trilha de auditoria (LGPD): quem consultou qual empresa
    try { await rest(req, 'staff_audit_log', { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }, req.staff.headers), body: JSON.stringify({ staff_id: req.staff.id, client_id: id, action: 'audit', score: report.score }) }); } catch (e) {}
    res.set('Cache-Control', 'no-store').json({ report });
  } catch (e) { res.status(500).json({ error: 'Não foi possível concluir a auditoria.' }); }
});

module.exports = router;
