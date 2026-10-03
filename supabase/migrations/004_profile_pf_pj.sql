-- ═══════════════════════════════════════════════════════════════
-- Migração: segregação PF / PJ
-- Adiciona a coluna `profile` nas tabelas usadas pelo App Finança,
-- para que cada lançamento guarde se é visível só no Pessoal (PF),
-- só na Empresa (PJ) ou em Ambos os perfis.
--
-- Como rodar:
-- 1. Abra seu projeto no https://supabase.com
-- 2. Vá em "SQL Editor" (menu lateral)
-- 3. Cole todo este arquivo e clique em "Run"
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE transactions   ADD COLUMN IF NOT EXISTS profile text DEFAULT 'ambos';
ALTER TABLE goals          ADD COLUMN IF NOT EXISTS profile text DEFAULT 'ambos';
ALTER TABLE debts          ADD COLUMN IF NOT EXISTS profile text DEFAULT 'ambos';
ALTER TABLE assets         ADD COLUMN IF NOT EXISTS profile text DEFAULT 'ambos';
ALTER TABLE liabilities    ADD COLUMN IF NOT EXISTS profile text DEFAULT 'ambos';
ALTER TABLE subscriptions  ADD COLUMN IF NOT EXISTS profile text DEFAULT 'ambos';

-- Garante que registros já existentes (criados antes dessa coluna existir)
-- fiquem marcados como 'ambos' — ou seja, continuam aparecendo tanto no
-- perfil Pessoal quanto no Empresa, sem fazer nenhum dado "desaparecer".
UPDATE transactions  SET profile = 'ambos' WHERE profile IS NULL;
UPDATE goals         SET profile = 'ambos' WHERE profile IS NULL;
UPDATE debts          SET profile = 'ambos' WHERE profile IS NULL;
UPDATE assets         SET profile = 'ambos' WHERE profile IS NULL;
UPDATE liabilities    SET profile = 'ambos' WHERE profile IS NULL;
UPDATE subscriptions  SET profile = 'ambos' WHERE profile IS NULL;

-- (Opcional, mas recomendado) Restringe os valores aceitos na coluna,
-- para evitar que algum valor inválido seja gravado por engano.
-- Usamos blocos DO para que seja seguro rodar este script mais de uma vez
-- (o Postgres não aceita "ADD CONSTRAINT IF NOT EXISTS").
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'transactions_profile_check') THEN
    ALTER TABLE transactions ADD CONSTRAINT transactions_profile_check CHECK (profile IN ('PF','PJ','ambos'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'goals_profile_check') THEN
    ALTER TABLE goals ADD CONSTRAINT goals_profile_check CHECK (profile IN ('PF','PJ','ambos'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'debts_profile_check') THEN
    ALTER TABLE debts ADD CONSTRAINT debts_profile_check CHECK (profile IN ('PF','PJ','ambos'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'assets_profile_check') THEN
    ALTER TABLE assets ADD CONSTRAINT assets_profile_check CHECK (profile IN ('PF','PJ','ambos'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'liabilities_profile_check') THEN
    ALTER TABLE liabilities ADD CONSTRAINT liabilities_profile_check CHECK (profile IN ('PF','PJ','ambos'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'subscriptions_profile_check') THEN
    ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_profile_check CHECK (profile IN ('PF','PJ','ambos'));
  END IF;
END $$;
