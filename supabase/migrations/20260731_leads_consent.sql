-- Prova de consentimento por lead (LGPD): o QUÊ foi aceito, QUANDO.
-- Quem já está na linha: `ip` e `user_agent`.
--
-- `consent` é ANULÁVEL e sem default, de propósito. São três estados, não dois:
--   true  = aceitou
--   false = recusou explicitamente
--   null  = nunca foi perguntado
-- O braço v4 do teste A/B não tem o checkbox e não manda o campo. Com `default false`,
-- todo lead do controle entraria marcado como "recusou", o que é falso.
--
-- `consent_text` guarda a redação aceita, não um booleano solto: se a frase mudar,
-- as linhas antigas preservam o texto que aquela pessoa realmente leu.

alter table public.leads add column if not exists consent boolean;
alter table public.leads add column if not exists consent_text text;
alter table public.leads add column if not exists consent_at timestamptz;

comment on column public.leads.consent is 'true=aceitou, false=recusou, null=não foi perguntado (ex.: versão sem checkbox)';
comment on column public.leads.consent_text is 'Redação exata aceita, congelada no momento do aceite';
comment on column public.leads.consent_at is 'Momento do aceite; null quando consent não é true';
