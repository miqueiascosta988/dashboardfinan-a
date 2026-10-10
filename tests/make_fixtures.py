# Gera holerites FICTÍCIOS (nomes, CPF e CNPJ inventados) para os testes automatizados.
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader
from PIL import Image, ImageDraw
import os
OUT = os.path.join(os.path.dirname(__file__), 'fixtures')
W, H = A4
def br(v): return f"{v:,.2f}".replace(',', 'X').replace('.', ',').replace('X', '.')

def layout_colunas(c, top, d, via=None):
    """Layout A: tabela com colunas Cód | Descrição | Referência | Vencimentos | Descontos."""
    y = top
    c.setFont('Helvetica-Bold', 11); c.drawString(40, y, 'RECIBO DE PAGAMENTO DE SALÁRIO'); 
    if via: c.setFont('Helvetica', 8); c.drawRightString(555, y, via)
    y -= 16; c.setFont('Helvetica', 9)
    c.drawString(40, y, 'Empresa: ' + d['emp']); c.drawString(330, y, 'CNPJ: ' + d['cnpj']); y -= 12
    c.drawString(40, y, 'Competência: ' + d['comp_txt']); c.drawString(330, y, 'Cargo: Analista'); y -= 12
    c.drawString(40, y, 'Nome: ' + d['nome']); c.drawString(330, y, 'CPF: ' + d['cpf']); y -= 12
    c.drawString(40, y, 'Admissão: 01/03/2021'); c.drawString(330, y, 'CBO: 2521-05'); y -= 18
    c.setFont('Helvetica-Bold', 8)
    c.drawString(40, y, 'Cód'); c.drawString(80, y, 'Descrição'); c.drawCentredString(300, y, 'Referência'); c.drawCentredString(400, y, 'Vencimentos'); c.drawCentredString(490, y, 'Descontos'); y -= 4
    c.line(40, y, 555, y); y -= 11; c.setFont('Helvetica', 8.5)
    for cod, desc, ref, v, dk in d['rows']:
        c.drawString(40, y, cod); c.drawString(80, y, desc)
        if ref is not None: c.drawRightString(320, y, br(ref))
        c.drawRightString(425 if dk == 'v' else 515, y, br(v)); y -= 11
    y -= 4; c.line(40, y, 555, y); y -= 12; c.setFont('Helvetica-Bold', 8)
    c.drawString(330, y, 'Total Vencimentos'); c.drawString(450, y, 'Total Descontos'); y -= 11
    c.setFont('Helvetica', 8.5); c.drawString(330, y, br(d['tv'])); c.drawString(450, y, br(d['td'])); y -= 13
    c.setFont('Helvetica-Bold', 9); c.drawString(330, y, 'Líquido a Receber'); c.drawString(450, y, br(d['liq'])); y -= 16
    c.setFont('Helvetica', 8)
    c.drawString(40, y, 'Salário Base: ' + br(d['sal'])); c.drawString(160, y, 'Base INSS: ' + br(d['binss'])); c.drawString(280, y, 'Base FGTS: ' + br(d['bfgts'])); c.drawString(400, y, 'FGTS do Mês: ' + br(d['fgts'])); y -= 11
    c.drawString(160, y, 'Base IRRF: ' + br(d['birrf'])); c.drawString(280, y, 'Faixa IRRF: 22,5%')
    return y

def base(nome='MARIA APARECIDA DA SILVA TESTE', cpf='123.456.789-09', comp='09/2026', comp_txt='09/2026', emp='ACME COMERCIO TESTE LTDA', cnpj='12.345.678/0001-95', extra=None, sal=5000.00):
    rows = [('001', 'SALÁRIO MENSAL', 30.0, sal, 'v')]
    rows += [('012', 'HORAS EXTRAS 50%', 10.0, 450.00, 'v'), ('018', 'DSR SOBRE HORAS EXTRAS', None, 90.00, 'v')] if extra is None else extra
    tv = sum(r[3] for r in rows if r[4] == 'v')
    inss = round(tv * 0.11, 2) if tv < 7000 else 951.62
    irrf = 380.45
    vt = round(sal * 0.06, 2)
    rows += [('101', 'INSS', 11.0, inss, 'd'), ('102', 'IRRF', 22.5, irrf, 'd'), ('150', 'VALE TRANSPORTE 6%', 6.0, vt, 'd')]
    td = round(inss + irrf + vt, 2)
    return dict(nome=nome, cpf=cpf, comp=comp, comp_txt=comp_txt, emp=emp, cnpj=cnpj, rows=rows, tv=round(tv, 2), td=td, liq=round(tv - td, 2),
                sal=sal, binss=round(tv, 2), bfgts=round(tv, 2), fgts=round(tv * 0.08, 2), birrf=round(tv - inss, 2))

def save(name, fn):
    c = canvas.Canvas(os.path.join(OUT, name), pagesize=A4); fn(c); c.save()

setembro = base()
# A) holerite simples, uma via
def a(c): layout_colunas(c, H - 60, setembro); c.showPage()
save('A_holerite_colunas.pdf', a)
# B) duas vias na mesma página (empregador e empregado)
def b(c):
    layout_colunas(c, H - 50, setembro, via='1ª VIA – EMPREGADOR')
    c.setDash(2, 3); c.line(30, H / 2 - 20, 565, H / 2 - 20); c.setDash()
    layout_colunas(c, H / 2 - 40, setembro, via='2ª VIA – EMPREGADO'); c.showPage()
save('B_duas_vias_na_pagina.pdf', b)
# C) PDF com a mesma página repetida
def cc(c):
    for _ in range(2): layout_colunas(c, H - 60, setembro); c.showPage()
save('C_paginas_repetidas.pdf', cc)
# D) layout em seções (Proventos / Descontos), valor numa coluna só
def d(c):
    c.setFont('Helvetica-Bold', 12); c.drawString(40, H - 60, 'DEMONSTRATIVO DE PAGAMENTO'); c.setFont('Helvetica', 9)
    c.drawString(40, H - 76, 'Razão Social: BETA SERVICOS TESTE S/A'); c.drawString(40, H - 88, 'CNPJ 98.765.432/0001-10')
    c.drawString(40, H - 100, 'Referente a: Setembro/2026'); c.drawString(40, H - 112, 'Funcionário: JOAO PEDRO SOUZA TESTE'); c.drawString(300, H - 112, 'CPF 987.654.321-00')
    y = H - 140; c.setFont('Helvetica-Bold', 9); c.drawString(40, y, 'PROVENTOS'); y -= 13; c.setFont('Helvetica', 9)
    for dsc, v in [('Salário', 3200.00), ('Comissões', 800.00), ('Adicional Noturno', 160.00)]:
        c.drawString(40, y, dsc); c.drawRightString(300, y, br(v)); y -= 12
    y -= 6; c.setFont('Helvetica-Bold', 9); c.drawString(40, y, 'DESCONTOS'); y -= 13; c.setFont('Helvetica', 9)
    for dsc, v in [('INSS', 421.30), ('IRRF', 150.12), ('Empréstimo Consignado', 320.00)]:
        c.drawString(40, y, dsc); c.drawRightString(300, y, br(v)); y -= 12
    y -= 8; c.drawString(40, y, 'Total de Proventos'); c.drawRightString(300, y, br(4160.00)); y -= 12
    c.drawString(40, y, 'Total de Descontos'); c.drawRightString(300, y, br(891.42)); y -= 12
    c.setFont('Helvetica-Bold', 9); c.drawString(40, y, 'Valor Líquido'); c.drawRightString(300, y, br(3268.58)); y -= 16; c.setFont('Helvetica', 8.5)
    c.drawString(40, y, 'Base de Cálculo do FGTS'); c.drawRightString(300, y, br(4160.00)); y -= 11
    c.drawString(40, y, 'FGTS do Mês'); c.drawRightString(300, y, br(332.80)); y -= 11
    c.showPage()
save('D_layout_secoes.pdf', d)
# E) 13º salário (tipo diferente, mesmo trabalhador e mês de referência)
e13 = base(comp='12/2026', comp_txt='Dezembro/2026', extra=[], sal=2500.00)
def e(c):
    layout_colunas(c, H - 60, e13); c.showPage()
    # reescreve título para 13º
save('E_13o_salario.pdf', lambda c: (c.setFont('Helvetica', 8), layout_colunas(c, H - 60, dict(e13, rows=[('050', '13º SALÁRIO', 12.0, 2500.00, 'v')] + [r for r in e13['rows'] if r[4] == 'd'], tv=2500.00, td=e13['td'], liq=round(2500 - e13['td'], 2), binss=2500.00, bfgts=2500.00, fgts=200.00, birrf=2000.00)), c.showPage()))
# F) mês seguinte, mesmo trabalhador (outubro) com valores diferentes
outubro = base(comp='10/2026', comp_txt='10/2026', extra=[('012', 'HORAS EXTRAS 50%', 20.0, 900.00, 'v'), ('018', 'DSR SOBRE HORAS EXTRAS', None, 180.00, 'v')])
save('F_outubro.pdf', lambda c: (layout_colunas(c, H - 60, outubro), c.showPage()))
# G) mesmo mês/trabalhador com valores diferentes (correção / folha complementar)
corr = base(extra=[('012', 'HORAS EXTRAS 50%', 12.0, 540.00, 'v'), ('018', 'DSR SOBRE HORAS EXTRAS', None, 108.00, 'v')])
save('G_setembro_corrigido.pdf', lambda c: (layout_colunas(c, H - 60, corr), c.showPage()))
# H) parcialmente ilegível: sem competência, sem totais e sem líquido
def h(c):
    c.setFont('Helvetica-Bold', 11); c.drawString(40, H - 60, 'HOLERITE'); c.setFont('Helvetica', 9)
    c.drawString(40, H - 80, 'Nome: CARLOS TESTE'); c.drawString(40, H - 100, 'SALÁRIO'); c.drawRightString(300, H - 100, br(3000.00))
    c.drawString(40, H - 112, 'INSS'); c.drawRightString(300, H - 112, br(300.00)); c.showPage()
save('H_parcial.pdf', h)
# I) PDF só de imagem (digitalizado) — não tem camada de texto
img = Image.new('RGB', (900, 400), 'white'); dr = ImageDraw.Draw(img); dr.text((30, 30), 'RECIBO DE PAGAMENTO  Liquido 4.238,52', fill='black')
img.save(os.path.join(OUT, 'I_digitalizado.png'))
def i(c): c.drawImage(ImageReader(os.path.join(OUT, 'I_digitalizado.png')), 40, H - 300, 500, 222); c.showPage()
save('I_digitalizado.pdf', i)
# J) boleto (não é holerite), K) fatura
def j(c):
    c.setFont('Helvetica', 10); c.drawString(40, H - 60, 'BOLETO DE COBRANÇA'); c.drawString(40, H - 80, 'Beneficiário: LOJA TESTE LTDA'); c.drawString(40, H - 100, 'Linha digitável: 34191.79001 01043.510047 91020.150008 5 91070026000')
    c.drawString(40, H - 120, 'Valor do documento: 260,00'); c.drawString(40, H - 140, 'Vencimento 10/10/2026'); c.showPage()
save('J_boleto.pdf', j)
def k(c):
    c.setFont('Helvetica', 10); c.drawString(40, H - 60, 'FATURA DO CARTÃO DE CRÉDITO'); c.drawString(40, H - 80, 'Pagamento mínimo: 150,00'); c.drawString(40, H - 100, 'Limite disponível: 2.000,00'); c.drawString(40, H - 120, 'Vencimento 15/10/2026'); c.showPage()
save('K_fatura.pdf', k)
# L) outro trabalhador no mesmo mês (distinto), M) sem CPF (identidade fraca) igual ao A
l = base(nome='ANA CLARA TESTE', cpf='111.222.333-96', sal=4000.00)
save('L_outro_trabalhador.pdf', lambda c: (layout_colunas(c, H - 60, l), c.showPage()))
import json
json.dump({'A': setembro, 'F': outubro, 'G': corr, 'L': l, 'E': e13}, open(os.path.join(OUT, 'esperado.json'), 'w'), ensure_ascii=False, indent=1)
print('ok', sorted(os.listdir(OUT)))
