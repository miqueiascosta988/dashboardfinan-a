# PDFs FICTÍCIOS de assinaturas/serviços e extratos para os testes (nada é real).
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
import os
OUT = os.path.join(os.path.dirname(__file__), 'fixtures'); W, H = A4
def br(v): return f"{v:,.2f}".replace(',', 'X').replace('.', ',').replace('X', '.')
def doc(name, fn):
    c = canvas.Canvas(os.path.join(OUT, name), pagesize=A4); fn(c); c.save()
def lines(c, rows, y=H-60, x=40, size=10, step=15):
    for r in rows:
        c.setFont('Helvetica-Bold' if r.startswith('#') else 'Helvetica', size + (2 if r.startswith('#') else 0)); c.drawString(x, y, r.lstrip('#')); y -= step
    return y
def netflix(c):
    lines(c, ['#Netflix - Recibo de pagamento', 'Assinatura Netflix Entretenimento Brasil LTDA', 'Plano: Padrão com anúncios', 'Cobrança mensal', 'Data do pagamento: 05/10/2026', 'Próxima cobrança: 05/11/2026',
              'Membro desde: 12/03/2023', 'Forma de pagamento: Visa final 4242', 'Conta: marina.teste@exemplo.com', 'Recibo nº NF8842931077', 'Renovação automática. Cancele a qualquer momento.', 'Total pago: 44,90']); c.showPage()
def spotify(c):
    lines(c, ['#Spotify - Comprovante de assinatura', 'Plano Premium Individual', 'Assinatura mensal', 'Promoção: desconto de R$ 5,00 nos 3 primeiros meses', 'Data da cobrança: 02/10/2026', 'Próxima cobrança: 02/11/2026',
              'Pagamento: Mastercard final 1881', 'Pedido: SPT-20261002-7781', 'Valor cobrado: 23,90']); c.showPage()
def ifoodclube(c):
    lines(c, ['#iFood - Clube iFood', 'Assinatura Clube iFood - plano mensal', 'Plano: Clube iFood', 'Cobrança mensal', 'Data da cobrança: 10/10/2026', 'Próxima renovação: 10/11/2026', 'Pagamento: Pix', 'Total: 9,90']); c.showPage()
def uberone(c):
    lines(c, ['#Uber One - Recibo', 'Assinatura Uber One', 'Plano: Uber One anual', 'Cobrança anual', 'Data de pagamento: 15/09/2026', 'Próxima cobrança: 15/09/2027', 'Cartão Visa final 7766', 'Total: 119,90']); c.showPage()
def ifoodpedido(c):
    y = lines(c, ['#iFood - Resumo do pedido', 'Restaurante: Sabor Caseiro Teste', 'Pedido nº 9912-4455', 'Data do pedido: 08/10/2026', 'Pagamento: cartão Visa final 4242', ''])
    for r in ['2x Marmita executiva|52,00', '1x Suco natural|9,00']:
        d, v = r.split('|'); c.setFont('Helvetica', 10); c.drawString(40, y, d); c.drawRightString(400, y, v); y -= 15
    lines(c, ['Subtotal 61,00', 'Taxa de entrega 7,90', 'Cupom de desconto 10,00', 'Total do pedido: 58,90'], y=y-6); c.showPage()
def extrato1(c):
    y = lines(c, ['#Banco Exemplo - Extrato de conta corrente', 'Agência 0001 Conta 12345-6', 'Período: 01/09/2026 a 30/09/2026', 'Saldo anterior: 1.000,00'], step=14); y -= 6
    c.setFont('Helvetica-Bold', 9); c.drawString(40, y, 'Data'); c.drawString(110, y, 'Histórico'); c.drawRightString(420, y, 'Valor'); c.drawRightString(520, y, 'Saldo'); y -= 14
    saldo = 1000.00
    for d, h, v in [('01/09', 'PIX RECEBIDO MARIA TESTE', 500.00), ('03/09', 'COMPRA CARTAO NETFLIX.COM', -44.90), ('05/09', 'PAGAMENTO BOLETO ENERGIA', -230.15), ('10/09', 'SALARIO ACME TESTE LTDA', 4200.00), ('12/09', 'PIX ENVIADO JOAO TESTE', -150.00), ('15/09', 'UBER *TRIP', -27.40), ('20/09', 'IFOOD *PEDIDO', -58.90)]:
        saldo += v; c.setFont('Helvetica', 9); c.drawString(40, y, d); c.drawString(110, y, h); c.drawRightString(420, y, br(abs(v)) + ('' if v > 0 else '-')); c.drawRightString(520, y, br(saldo)); y -= 13
    y -= 6; c.drawString(40, y, 'Saldo final: ' + br(saldo)); c.showPage()
    return saldo
def extrato2(c):
    y = lines(c, ['#Banco Fictício S.A. - Extrato', 'Período: 01/10/2026 a 31/10/2026', 'Saldo anterior: 2.000,00'], step=14); y -= 6
    c.setFont('Helvetica-Bold', 9); c.drawString(40, y, 'Data'); c.drawString(100, y, 'Descrição'); c.drawCentredString(380, y, 'Créditos'); c.drawCentredString(460, y, 'Débitos'); c.drawCentredString(540, y, 'Saldo'); y -= 14
    s = 2000.00
    for d, h, v in [('02/10/2026', 'DEPOSITO EM CONTA', 300.00), ('04/10/2026', 'SPOTIFY BRASIL', -23.90), ('07/10/2026', 'SAQUE CAIXA 24H', -200.00)]:
        s += v; c.setFont('Helvetica', 9); c.drawString(40, y, d); c.drawString(100, y, h); c.drawRightString(400 if v > 0 else 480, y, br(abs(v))); c.drawRightString(560, y, br(s)); y -= 13
    c.drawString(40, y - 8, 'Saldo final: ' + br(s)); c.showPage()
def extrato3(c):
    y = lines(c, ['#Extrato da conta', 'Período: 01/10/2026 a 31/10/2026'], step=14); y -= 8
    for dh, rows in [('05 OUT 2026', [('Transferência recebida pelo Pix - Fulano Teste', '+ R$ 800,00'), ('Compra no débito - Mercado Bairro', '- R$ 96,35')]), ('06 OUT 2026', [('Pagamento de fatura', '- R$ 1.250,00'), ('Uber Uber *Trip', '- R$ 18,70')])]:
        c.setFont('Helvetica-Bold', 10); c.drawString(40, y, dh); y -= 15
        for d, v in rows: c.setFont('Helvetica', 9); c.drawString(50, y, d); c.drawRightString(540, y, v); y -= 13
        y -= 6
    c.showPage()
for n, f in [('X1_netflix.pdf', netflix), ('X2_spotify.pdf', spotify), ('X3_ifood_clube.pdf', ifoodclube), ('X4_uber_one.pdf', uberone), ('X5_ifood_pedido.pdf', ifoodpedido), ('X6_extrato_saldo.pdf', extrato1), ('X7_extrato_colunas.pdf', extrato2), ('X8_extrato_datas.pdf', extrato3)]: doc(n, f)
def extrato4(c):
    y = lines(c, ['#Cooperativa Teste - Extrato', 'Período: 01/11/2026 a 30/11/2026', 'Saldo anterior: 500,00'], step=14); y -= 6
    c.setFont('Helvetica-Bold', 9); c.drawString(40, y, 'Data'); c.drawString(110, y, 'Lançamento'); c.drawRightString(420, y, 'Valor'); c.drawRightString(520, y, 'Saldo'); y -= 14
    s = 500.00
    for d, h, v in [('03/11', 'SALARIO EMPRESA TESTE', 3000.00), ('04/11', 'DISNEY PLUS 11/11', -33.90), ('06/11', 'MERCADO CENTRAL', -310.20)]:
        s += v; c.setFont('Helvetica', 9); c.drawString(40, y, d); c.drawString(110, y, h); c.drawRightString(420, y, br(abs(v))); c.drawRightString(520, y, br(s)); y -= 13
    c.drawString(40, y - 8, 'Saldo final: ' + br(s)); c.showPage()
doc('X9_extrato_sem_sinal.pdf', extrato4)
