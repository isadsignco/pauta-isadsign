-- Portal isadsign: rode uma vez no Supabase, em SQL Editor > New query > Run.
-- Depois troque SEU_EMAIL no fim do arquivo pelo e-mail que você usa para entrar no painel e rode só essa linha.
--
-- Quem pode o quê:
--   cliente (sem login): só pelas funções portal_*, e sempre com token + código de acesso;
--   painel (login de um e-mail da tabela admins): lê e altera tudo.

create table if not exists public.admins (
  email text primary key
);

create table if not exists public.clientes (
  token     text primary key check (token ~ '^[a-z0-9-]{6,80}$'),
  nome      text not null check (char_length(nome) between 1 and 120),
  codigo    text not null check (char_length(codigo) between 8 and 12),
  criado_em timestamptz not null default now()
);

create table if not exists public.pautas (
  id            text primary key,
  token         text not null references public.clientes(token) on delete cascade,
  mes           int  not null check (mes between 0 and 11),
  ano           int  not null check (ano between 2020 and 2100),
  dados         jsonb not null,
  status        text not null default 'enviada' check (status in ('enviada','aprovada','revisao','reprovada')),
  atualizado_em timestamptz not null default now(),
  unique (token, mes, ano)
);

create table if not exists public.respostas (
  id         bigint generated always as identity primary key,
  pauta_id   text not null references public.pautas(id) on delete cascade,
  token      text not null references public.clientes(token) on delete cascade,
  tipo       text not null check (tipo in ('aprovada','revisao','reprovada')),
  comentario text not null default '' check (char_length(comentario) <= 2000),
  lida       boolean not null default false,
  criado_em  timestamptz not null default now()
);
create index if not exists respostas_pauta on public.respostas (pauta_id, criado_em desc);

-- ---------- Acesso do painel ----------
create or replace function public.eh_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from admins where lower(email) = lower(auth.jwt() ->> 'email'))
$$;

alter table public.admins    enable row level security;
alter table public.clientes  enable row level security;
alter table public.pautas    enable row level security;
alter table public.respostas enable row level security;

drop policy if exists painel on public.clientes;
drop policy if exists painel on public.pautas;
drop policy if exists painel on public.respostas;
create policy painel on public.clientes  for all to authenticated using (public.eh_admin()) with check (public.eh_admin());
create policy painel on public.pautas    for all to authenticated using (public.eh_admin()) with check (public.eh_admin());
create policy painel on public.respostas for all to authenticated using (public.eh_admin()) with check (public.eh_admin());

-- ---------- Acesso do cliente ----------
-- Compara códigos ignorando hífen, espaço e maiúsculas
create or replace function public.cod(t text) returns text
language sql immutable as $$ select upper(regexp_replace(coalesce(t, ''), '[^A-Za-z0-9]', '', 'g')) $$;

-- Nome do cliente para a tela do código (não revela nada além do nome)
create or replace function public.portal_nome(p_token text) returns text
language sql stable security definer set search_path = public as $$
  select nome from clientes where token = p_token
$$;

-- Pautas do cliente, só com o código certo
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
      from pautas p where p.token = p_token), '[]'::json));
end $$;

-- Resposta do cliente: grava e atualiza o status da pauta
create or replace function public.portal_responder(p_token text, p_codigo text, p_pauta text, p_tipo text, p_comentario text)
returns json language plpgsql volatile security definer set search_path = public as $$
declare c public.clientes;
begin
  select * into c from clientes where token = p_token;
  if not found or cod(c.codigo) <> cod(p_codigo) then raise exception 'codigo_invalido'; end if;
  if not exists (select 1 from pautas where id = p_pauta and token = p_token) then raise exception 'pauta_invalida'; end if;
  if p_tipo not in ('aprovada','revisao','reprovada') then raise exception 'tipo_invalido'; end if;
  insert into respostas (pauta_id, token, tipo, comentario) values (p_pauta, p_token, p_tipo, left(coalesce(p_comentario, ''), 2000));
  update pautas set status = p_tipo, atualizado_em = now() where id = p_pauta;
  return json_build_object('ok', true, 'cliente', c.nome);
end $$;

revoke all on function public.portal_nome(text)                           from public;
revoke all on function public.portal_abrir(text, text)                    from public;
revoke all on function public.portal_responder(text, text, text, text, text) from public;
grant execute on function public.portal_nome(text)                           to anon, authenticated;
grant execute on function public.portal_abrir(text, text)                    to anon, authenticated;
grant execute on function public.portal_responder(text, text, text, text, text) to anon, authenticated;
grant execute on function public.eh_admin() to authenticated;

-- ---------- Seu acesso ao painel ----------
-- Troque SEU_EMAIL pelo seu e-mail e rode esta linha:
-- insert into public.admins (email) values ('SEU_EMAIL') on conflict do nothing;
