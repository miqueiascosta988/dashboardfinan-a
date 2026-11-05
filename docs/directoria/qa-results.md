# Resultados de QA
Atualizado: 2026-11-05. Só números efetivamente medidos.

- Bateria PF (6 testes): passa.
- Testes novos do ciclo 14 e 15 (saúde estável, acessibilidade, Stripe com login, limites de plano): passam.
- Migration 029 testada em PostgreSQL 16 temporário com esquema mínimo, 9 cenários: comportamento esperado.
- axe-core (WCAG 2.1 A e AA): 0 violações de contraste e de rótulo em 26 telas × 3 perfis; só desktop.
- Sem rolagem horizontal a 360 px em 17 telas × 3 perfis.
- `npm audit --omit=dev`: 0 vulnerabilidades.
- Falhas já existentes antes das alterações: 6 testes (ver technical-audit.md). Arquivo `guia-ui` travou a suíte e ficou de fora.
- **Não testado:** produção, Hotmart, Supabase real, leitor de tela, celular físico, rede móvel.
