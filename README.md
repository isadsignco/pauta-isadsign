# Pauta isadsign

Gerador de pauta mensal de Instagram para os clientes da [@isadsign.co](https://instagram.com/isadsign.co).

O app roda no claude.ai, como página da Central isadsign, e usa o Claude da própria conta para escrever o conteúdo. Este repositório guarda o código e o histórico de versões.

## O que ele faz

- **Sobre o cliente**: recebe prints do perfil, fotos, PDF (catálogo, apresentação, cardápio) e uma descrição por escrito. O Claude lê tudo e monta um perfil do cliente (produtos, público, tom, diferenciais, identidade visual), que fica salvo para as próximas pautas.
- **Frequência**: dias da semana em que o feed posta.
- **Datas para postar**: calendário do mês para marcar e desmarcar dias. Datas comemorativas aparecem com um ponto.
- **Formatos**: quantidade de Carrossel, Reels, Estático e Stories, ajustada automaticamente às datas escolhidas.
- **Temas**: lista de temas que precisam aparecer no mês.
- **Cada post** sai com descrição completa do conteúdo, como produzir (checklist), direção visual, melhor horário, o que medir, ganchos, slides ou roteiro com minutagem, legenda, CTA e hashtags.
- Pautas salvas por cliente e mês, exportação em Markdown e "Refazer post".

## Arquivos

- `index.html`: o app inteiro (HTML, CSS e JavaScript em um arquivo).

## Como atualizar

Peça ao Claude a mudança. Ele edita o `index.html`, faz o commit aqui e republica a página no mesmo link da Central.

## Aprovações do portal → app no Claude

Quando o cliente responde no portal (`portal/`), a pauta no app do Claude também muda de status, e a pauta aprovada mostra **Gerar calendário**.

1. O workflow `.github/workflows/aprovacoes.yml` roda a cada 10 minutos, chama a função `portal_status` do Supabase e grava `aprovacoes.json` na branch `dados` (só o id da pauta em SHA-256, o status e a data; nada de nome, código ou comentário).
2. A tarefa agendada "Aprovações do portal → Pauta isadsign" (8h23, 12h23, 16h23, 20h23, e toda vez que a Isa abre o app) lê esse arquivo e marca a pauta do app como aprovada, pediu revisão ou reprovada.

Configurar uma vez: no Supabase, SQL Editor, rode `supabase/status-sync.sql`.
