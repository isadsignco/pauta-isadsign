-- Links importantes no perfil de cada cliente. Rode uma vez no SQL Editor (já está incluído no setup.sql).

create table if not exists public.links (
  id        bigint generated always as identity primary key,
  token     text not null references public.clientes(token) on delete cascade,
  titulo    text not null check (char_length(titulo) between 1 and 120),
  url       text not null check (url ~* '^https?://' and char_length(url) <= 2000),
  tag       text not null default '' check (char_length(tag) <= 40),
  ordem     int  not null default 0,
  criado_em timestamptz not null default now()
);
create index if not exists links_token on public.links (token, ordem, id);

alter table public.links enable row level security;
drop policy if exists painel on public.links;
create policy painel on public.links for all to authenticated using (public.eh_admin()) with check (public.eh_admin());

-- Pautas e links do cliente, só com o código certo
create or replace function public.portal_abrir(p_token text, p_codigo text) returns json
language plpgsql stable security definer set search_path = public as $$
declare c public.clientes;
begin
  select * into c from clientes where token = p_token;
  if not found or cod(c.codigo) <> cod(p_codigo) then
    return null;
  end if;
  return json_build_object(
    'cliente', c.nome,
    'pautas', coalesce((
      select json_agg(json_build_object(
        'id', p.id, 'mes', p.mes, 'ano', p.ano, 'status', p.status, 'dados', p.dados,
        'resposta', (select json_build_object('tipo', r.tipo, 'comentario', r.comentario, 'em', r.criado_em)
                     from respostas r where r.pauta_id = p.id order by r.criado_em desc limit 1)
      ) order by p.ano desc, p.mes desc)
      from pautas p where p.token = p_token), '[]'::json),
    'links', coalesce((
      select json_agg(json_build_object('titulo', l.titulo, 'url', l.url, 'tag', l.tag) order by l.ordem, l.id)
      from links l where l.token = p_token), '[]'::json));
end $$;
