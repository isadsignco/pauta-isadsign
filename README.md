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
- `cliente/pagina.html`: modelo da página que o cliente abre para ver a pauta dele.
- `cliente/gerar.mjs`: tranca as pautas de um cliente com o código de acesso e gera a página dele.
- `cliente/exemplo.json`: pauta de exemplo (Café Aurora).

## Página do cliente

Cada cliente tem uma página própria no claude.ai, com link próprio e código de acesso próprio. A página só contém as pautas daquele cliente, criptografadas com o código dele (PBKDF2 + AES-GCM): sem o código, ninguém lê, nem quem tiver o link. O cliente digita o código uma vez e pode marcar "Lembrar neste aparelho". Quando há mais de um mês, ele escolhe o mês no topo.

Para publicar ou atualizar, peça ao Claude: "publica a pauta da [cliente]". O Claude:

1. lê a pauta salva no app;
2. roda `node cliente/gerar.mjs --cliente "Nome" --codigo XXXX-XXXX --saida pagina.html pauta1.json pauta2.json`;
3. publica a página no link daquele cliente (o mesmo link todo mês) e mantém o código;
4. registra cliente, link, código e meses na coleção `acessos` do app.

No app, a aba **Salvas** mostra **Acesso dos clientes**, com o código e botões para copiar o link ou a mensagem pronta para mandar ao cliente.

Antes de mandar o link, abra a página no claude.ai, toque em **Compartilhar** e libere para "qualquer pessoa com o link". Sem isso, o cliente não consegue abrir.

## Como atualizar

Peça ao Claude a mudança. Ele edita o `index.html`, faz o commit aqui e republica a página no mesmo link da Central.
