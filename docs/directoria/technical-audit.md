# Auditoria técnica
Atualizado: 2026-11-05 (responsável: CTO). Detalhe completo: relatório "SM Financial — Auditoria Técnica, Funcional e Estratégica" (Claude Docs).

## Verificado por teste (reproduzido)
- Entradas de valor, data e duplicidade protegidas; injeção de script em 5 tipos de campo sem execução; 31 telas × 3 perfis sem erro de JavaScript.
- Nota de saúde variava com o período (97 contra 81) e reserva contava imóvel → corrigido no ciclo 14.
- Contraste, rótulos de campo, teclado e overflow do orçamento a 360 px → corrigido no ciclo 14 (axe-core: 0 violações nessas regras em 26 telas × 3 perfis).

## Por análise estática (não testado na prática)
- Limites de plano só no navegador → trava no servidor criada (migration 029), **desligada por padrão** até o proprietário ligar.
- CSP com `'unsafe-inline'` (AUD-14); `index.html` monolítico de 924 KB (AUD-16); pastas e arquivos de deploy duplicados (AUD-15).

## Não verificável neste ambiente
Site em produção, pagamento Hotmart, login e sincronização reais no Supabase, holerites reais, rede móvel, memória, celulares físicos e leitores de tela.

## Testes que já falhavam antes das alterações (causa não investigada)
consultor-ui (2), crm-ui funil/triagem (2), cron semanal (1), OCR de boleto/fatura em imagem (1). A suíte também travou ao chegar em guia-ui.
