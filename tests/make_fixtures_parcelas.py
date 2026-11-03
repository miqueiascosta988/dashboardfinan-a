# Fatura fictícia com compras parceladas (3 jeitos de escrever). Rodar: python3 tests/make_fixtures_parcelas.py
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
import os
OUT = os.path.join(os.path.dirname(__file__), 'fixtures'); W, H = A4
def make(name, rows, total, venc, fech):
    c = canvas.Canvas(os.path.join(OUT, name), pagesize=A4); y = H - 60
    c.setFont('Helvetica-Bold', 12); c.drawString(40, y, 'Nubank - FATURA DO CARTÃO DE CRÉDITO'); y -= 20; c.setFont('Helvetica', 10)
    for t in [f'Fatura fechada em {fech}', f'Vencimento {venc}', f'Total da fatura: R$ {total}']:
        c.drawString(40, y, t); y -= 15
    y -= 8; c.setFont('Helvetica-Bold', 9); c.drawString(40, y, 'Data'); c.drawString(110, y, 'Lançamentos'); c.drawRightString(420, y, 'Valor'); y -= 14; c.setFont('Helvetica', 9)
    for d, t, v in rows:
        c.drawString(40, y, d); c.drawString(110, y, t); c.drawRightString(420, y, v); y -= 13
    c.showPage(); c.save()
make('Z_fatura_parcelas_nov.pdf', [('10/10', 'Mercado Extra', 'R$ 100,00'), ('12/10', 'Seguro automóvel 2 de 12', 'R$ 399,00'), ('15/10', 'Magazine Luiza PARC 04/10', 'R$ 150,00')], '649,00', '12/11/2026', '05/11/2026')
make('Z_fatura_parcelas_set.pdf', [('10/08', 'Padaria', 'R$ 40,00'), ('12/08', 'Seguro automóvel 1 de 12', 'R$ 399,00')], '439,00', '12/09/2026', '05/09/2026')
