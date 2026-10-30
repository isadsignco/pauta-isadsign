-- Portal isadsign: várias pautas no mesmo mês para o mesmo cliente.
-- Rode uma vez no Supabase: SQL Editor > New query > cole tudo > Run.
--
-- Antes, cada cliente só podia ter uma pauta por mês (a nova substituía a anterior).
-- Agora cada pauta do app vira uma linha própria, com a sua própria aprovação.
-- Não apaga nem muda nenhuma pauta ou resposta que já existe.

do $$
declare r record;
begin
  for r in
    select conname from pg_constraint
    where conrelid = 'public.pautas'::regclass and contype = 'u'
  loop
    execute format('alter table public.pautas drop constraint %I', r.conname);
  end loop;
end $$;

create index if not exists pautas_token_mes on public.pautas (token, ano, mes);
