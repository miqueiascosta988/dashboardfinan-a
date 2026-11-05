# Contexto do produto — SM Financial
Atualizado: 2026-11-05 (responsável: CTO e Growth)

- **O que é:** planejador financeiro pessoal (foco atual: PF). O modo Empresa (PJ) existe no código, mas **não está à venda**; ignorar PJ em decisões de produto e de campanha.
- **Marca:** SM Financial é uma marca separada da 360 Suítes. Nunca associar uma à outra.
- **Stack:** frontend em página única (`public/index.html`, cerca de 8,6 mil linhas) + módulos `public/*.js`; backend Express (`src/server.js`); Supabase (Postgres, Auth, RLS); Vercel. **Pagamento: só Hotmart** (Stripe não é usado).
- **Planos:** Free (15 lançamentos/mês, 1 documento/mês, bônus de 3 documentos em 48 h para conta nova), Basic (60 lançamentos/mês, 1 importação de extrato/mês), Plus e acima (sem teto). Teste de 7 dias do Basic por R$ 5; depois R$ 8/mês.
- **Meta comercial (revisável):** R$ 5.000 brutos/mês; verba de anúncios abaixo de R$ 200/mês; Meta Ads primeiro, Google como reserva; produção feita pelo proprietário com ferramentas de IA; sem CNPJ.
- **Restrições de comunicação:** nunca inventar dados, depoimentos ou resultados; rotular fato e hipótese; feedback de cliente simulado é sempre ficção.
