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
- `site/index.html`: página do cliente, só de leitura, para ele ver a pauta do mês.
- `site/pautas/*.json`: uma pauta por arquivo. `exemplo.json` é a do Café Aurora.

## Página do cliente

O cliente abre `site/?c=<arquivo>` e vê a pauta de `site/pautas/<arquivo>.json`: resumo do mês, próximo post, calendário, posts (com filtro por formato e pilar), estratégia e perfil da marca. Cada post abre com descrição, o que produzir, slides ou roteiro, legenda e CTA, com botões de copiar. "Salvar PDF" imprime a pauta inteira com todos os posts abertos. Sem `?c=`, a página mostra o exemplo.

Para publicar a pauta de um cliente:

1. No app, abra a pauta e toque em **Arquivo do site**. Sai um `.json` com o nome do cliente e do mês (ex.: `ousion-dezembro-2026.json`).
2. Coloque o arquivo em `site/pautas/` e faça o commit.
3. Envie ao cliente o link `.../site/?c=ousion-dezembro-2026`.

A pasta `site/` é estática: funciona no GitHub Pages ou em qualquer hospedagem simples. O link não é listado em lugar nenhum e a página pede para não ser indexada, mas quem tiver o link consegue abrir.

## Como atualizar

Peça ao Claude a mudança. Ele edita o `index.html`, faz o commit aqui e republica a página no mesmo link da Central.
