# Pauta isadsign

Gerador de pauta mensal de Instagram para os clientes da [@isadsign.co](https://instagram.com/isadsign.co).

O app roda no claude.ai, como página da Central isadsign, e usa o Claude da própria conta para escrever o conteúdo. Este repositório guarda o código e o histórico de versões.

## O que ele faz

- **Sobre o cliente**: recebe prints do perfil, fotos, PDF (catálogo, apresentação, cardápio) e uma descrição por escrito. O Claude lê tudo e monta um perfil do cliente (produtos, público, tom, diferenciais, identidade visual), que fica salvo para as próximas pautas.
- **Frequência**: dias da semana em que o feed posta, ou **a cada X dias** (ex.: a cada 2 dias, começando no dia 1).
- **Datas para postar**: calendário do mês para marcar e desmarcar dias. Datas comemorativas aparecem com um ponto.
- **Formatos**: quantidade de Carrossel, Reels, Estático e Stories, ajustada automaticamente às datas escolhidas.
- **Temas**: lista de temas que precisam aparecer no mês.
- **Cada post** sai com descrição completa do conteúdo, como produzir (checklist), direção visual, melhor horário, o que medir, ganchos, slides ou roteiro com minutagem, legenda, CTA e hashtags.
- Pautas salvas por cliente e mês, exportação em Markdown e "Refazer post".
- **Liberar para o cliente**: cada cliente recebe link e código de acesso próprios e vê só as pautas dele.

## Arquivos

- `index.html`: o app inteiro (HTML, CSS e JavaScript em um arquivo).
- `cliente/exemplo.json`: pauta de exemplo (Café Aurora), usada em testes.

## Acesso dos clientes

O mesmo link do app serve para os clientes. Cada cliente recebe o link com um final próprio (`…/artifact/WFtLQrFVMhE7mU7Wr1K7Ut#ousion-k3x9q2`) e um código de acesso próprio (`ABCD-2345`).

- **Quem é da isadsign** (dona do app) abre o link sem final e vê o app completo.
- **O cliente** abre o link dele, digita o código e vê só as pautas dele: calendário, posts completos, estratégia e perfil da marca. Pode marcar "Lembrar neste aparelho". Não vê o gerador, as outras pautas nem as anotações internas do briefing.
- **Quem abre o link sem final** e não é da isadsign vê só um aviso para usar o link recebido.

Para liberar: gere a pauta, toque em **Liberar para o cliente**. Na primeira vez o app cria o link e o código do cliente; nos meses seguintes ele soma o mês novo no mesmo link, com o mesmo código. A aba **Salvas** mostra **Acesso dos clientes**, com o código e botões para copiar o link ou a mensagem pronta.

Como funciona por dentro: as pautas de cada cliente ficam no bloco `#portal` da própria página, criptografadas com o código dele (PBKDF2-SHA256 + AES-GCM). Ao liberar, o app se republica com o bloco atualizado. A coleção `acessos` (só a dona lê) guarda token, código e a mesma cópia criptografada. Quando o Claude republica o `index.html` daqui, o bloco volta vazio; na próxima vez que a dona abre o app, ele repõe tudo a partir de `acessos`. Por isso, ao republicar, o Claude deve carregar o bloco `#portal` da versão no ar.

Para os clientes abrirem, o app precisa estar compartilhado como "qualquer pessoa com o link" (Compartilhar, no claude.ai).

## Como atualizar

Peça ao Claude a mudança. Ele edita o `index.html`, faz o commit aqui e republica a página no mesmo link da Central.
