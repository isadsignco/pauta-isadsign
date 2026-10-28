-- Portal isadsign → app Pauta isadsign (no Claude)
-- Rode uma vez no Supabase: SQL Editor > New query > cole tudo > Run.
--
-- Cria a função que o GitHub usa para saber quais pautas o cliente já respondeu no portal.
-- Ela devolve só três coisas por pauta: o id da pauta do app em SHA-256 (não dá para saber
-- o cliente por ele), o status (aprovada, revisao ou reprovada) e a data da resposta.
-- Nada de nome, código, comentário ou conteúdo da pauta.

create or replace function public.portal_status() returns json
language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(json_build_object(
           'h',  encode(sha256(convert_to(p.dados->>'id', 'UTF8')), 'hex'),
           's',  p.status,
           'em', coalesce((select max(r.criado_em) from respostas r where r.pauta_id = p.id), p.atualizado_em)
         ) order by p.id), '[]'::json)
  from pautas p
  where p.dados ? 'id' and p.status <> 'enviada'
$$;

revoke all on function public.portal_status() from public;
grant execute on function public.portal_status() to anon, authenticated;
