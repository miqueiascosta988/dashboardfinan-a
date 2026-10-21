# PDF FICTÍCIO de fatura de cartão com compras, estorno e encargos (para os testes; nada é real).
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
import os
OUT = os.path.join(os.path.dirname(__file__), 'fixtures'); W, H = A4
def br(v): return f"{v:,.2f}".replace(',', 'X').replace('.', ',').replace('X', '.')
c = canvas.Canvas(os.path.join(OUT, 'Y_fatura_compras.pdf'), pagesize=A4)
y = H - 60
c.setFont('Helvetica-Bold', 12); c.drawString(40, y, 'Nubank - FATURA DO CARTÃO DE CRÉDITO'); y -= 20
c.setFont('Helvetica', 10)
for t in ['Fatura fechada em 05/11/2026', 'Vencimento 12/11/2026', 'Total da fatura: R$ 821,40', 'Pagamento mínimo: 123,21', 'Limite disponível: 2.000,00']:
    c.drawString(40, y, t); y -= 15
y -= 8; c.setFont('Helvetica-Bold', 9); c.drawString(40, y, 'Data'); c.drawString(110, y, 'Lançamentos'); c.drawRightString(420, y, 'Valor'); y -= 14
c.setFont('Helvetica', 9)
rows = [('04/10', 'Pagamento recebido', '-R$ 900,00'), ('10/10', 'Uber *Trip', 'R$ 23,40'), ('12/10', 'Supermercado Pao de Acucar', 'R$ 187,35'), ('15/10', 'Netflix.com', 'R$ 39,90'),
        ('18/10', 'Posto Shell Combustivel', 'R$ 150,00'), ('20/10', 'Drogaria Pacheco', 'R$ 64,80'), ('25/10', 'iFood *Restaurante', 'R$ 78,90'), ('28/10', 'Amazon Marketplace', 'R$ 212,50'),
        ('02/11', 'Cinemark Ingresso', 'R$ 56,00'), ('03/11', 'Estorno Amazon Marketplace', '-R$ 30,00'), ('05/11', 'Juros e encargos rotativo', 'R$ 38,55')]
for d, t, v in rows:
    c.drawString(40, y, d); c.drawString(110, y, t); c.drawRightString(420, y, v); y -= 13
c.showPage(); c.save()
