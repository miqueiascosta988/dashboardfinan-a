const express = require('express');
const { getMercado } = require('../lib/mercado');
const router = express.Router();
router.get('/mercado', async (req, res) => {
  try { const d = await getMercado(); res.set('Cache-Control', 'public, s-maxage=1800, stale-while-revalidate=21600'); res.json(d); }
  catch (e) { res.status(502).json({ error: 'Indicadores indisponíveis agora.' }); }
});
module.exports = router;
