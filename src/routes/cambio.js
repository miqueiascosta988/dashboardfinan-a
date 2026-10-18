const express = require('express');
const { getCambio } = require('../lib/cambio');
const router = express.Router();
router.get('/cambio', async (req, res) => {
  try {
    const d = await getCambio();
    res.set('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=21600');
    res.json(d);
  } catch (e) { res.status(502).json({ error: 'Cotações indisponíveis agora.' }); }
});
module.exports = router;
