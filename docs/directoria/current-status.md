# Status atual — SM Financial (2026-11-05)

**Estado do produto:** estável nos testes locais, pronto para venda assistida a poucas dezenas de clientes PF. Para escalar, falta publicar e validar os ciclos 11 a 15, ligar a trava de limites com segurança e coletar feedback real.

**Em correção / aguardando o proprietário:** publicar o patch do ciclo 14 e 15; rodar a migration 029 e decidir quando ligar; confirmar a migration 028 no Supabase.

**Melhorias implementadas (ciclos 8 a 15):** ver implementation-log.md.

**Testes:** ver qa-results.md. Cobertura declarada: 31 de 31 telas abertas sem erro; cerca de 6 de 31 testadas a fundo; 1 módulo de cálculo recalculado de forma independente.

**Pendências:** backlog em improvement-backlog.md (AUD-12, 14 a 17, M2, M4, M7, M8).

**Próximas prioridades sugeridas:**
1. Publicar ciclos 11 a 15 e conferir um clique de teste no CRM.
2. M7 (onboarding em 3 passos), que ataca o maior motivo de desistência simulado.
3. Conversas reais com os 3 a 5 primeiros cadastrados.
4. Reler o CRM em 14 dias e comparar com a base (30 visitas, 9 triagens, 4 apresentações, 1 checkout, 0 contas).

**Validação do Growth sobre o ciclo 14 (olhar do consumidor, hipótese):** a nova pergunta "dá para usar em até 30 dias?" ao cadastrar um ativo é uma etapa a mais; o padrão "Deduzir pelo nome" evita obrigar o cliente. O corte da importação no Basic pode frustrar quem esperava importar tudo; mensagem explica e oferece o Plus. Revisar com clientes reais.
