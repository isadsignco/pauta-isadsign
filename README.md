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
- **Clientes**: uma pasta por marca, com nome, nicho, descrição breve, cores, link de visualização com código, histórico de pautas com status (rascunho, enviada, aprovada, pediu revisão, reprovada) e botão de excluir cliente.
- **Etiqueta do mês** em cada pauta, nas Salvas e no histórico.
- **Baixar PDF e HTML**, para a isadsign e para o cliente. O PDF tem índice clicável (cada post abre na página dele e volta ao índice); o HTML abre em qualquer navegador, com calendário e índice que levam a cada post.
- **Resposta do cliente**: Aprovar, Pedir revisão ou Reprovar, com comentários. A resposta abre no WhatsApp do cliente pronta para o número da isadsign (configurado na aba Clientes); a isadsign marca o status na pasta.

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

Por que a resposta vai pelo WhatsApp: no claude.ai, quem abre a página de fora da conta da isadsign (com ou sem login) não consegue gravar nada nela. Por isso a aprovação não fica salva sozinha no app: o cliente manda pelo WhatsApp e a isadsign registra o status na pasta. No aparelho do cliente, a página lembra o que ele enviou.

Para os clientes abrirem, o app precisa estar compartilhado como "qualquer pessoa com o link" (Compartilhar, no claude.ai).

## Portal do cliente (site externo)

Site comum, fora do Claude, onde o cliente vê a pauta e responde, e a resposta fica salva para a isadsign. Endereço: `https://isadsignco.github.io/pauta-isadsign/portal/`.

- **Cliente** (`portal/#<token>`): digita o código, vê só as pautas dele (calendário, posts, estratégia), baixa PDF ou HTML, imprime, e responde cada pauta com **Aprovar**, **Pedir revisão** ou **Reprovar**, com comentários. Para pedir revisão ou reprovar, o comentário é obrigatório.
- **Você** recebe um e-mail a cada resposta e vê tudo no **painel** (`portal/painel.html`, com login): respostas novas, publicar pauta, pasta de cada cliente com link, código, pautas e respostas, trocar código, tirar pauta do portal e excluir cliente.
- As pautas continuam sendo geradas no app do Claude. No app, toque em **Arquivo para o portal** e envie o arquivo no painel, em **Publicar pauta**.

Arquivos: `portal/index.html` (cliente), `portal/painel.html` (painel), `portal/comum.js` e `portal/estilo.css` (compartilhados), `portal/config.js` (chaves públicas), `supabase/setup.sql` (banco).

Segurança: o código fica no repositório, que é público; os dados ficam no Supabase. O cliente só lê e responde pelas funções `portal_*`, sempre conferindo token e código no servidor. O painel só abre para e-mails da tabela `admins`.

### Configurar (uma vez)

1. **Supabase** (supabase.com, plano grátis): crie um projeto. Em **SQL Editor**, cole e rode `supabase/setup.sql`.
2. Em **Authentication > Users > Add user**, crie o seu usuário com e-mail e senha (marque "Auto Confirm User"). Depois, no SQL Editor, rode `insert into public.admins (email) values ('seu@email.com');` com o mesmo e-mail.
3. Em **Authentication > Sign In / Providers**, desligue "Allow new users to sign up". Em **Authentication > URL Configuration**, coloque `https://isadsignco.github.io/pauta-isadsign/portal/painel.html` como Site URL (é para onde vai o link de "Esqueci a senha").
4. **Web3Forms** (web3forms.com): digite o e-mail que vai receber as respostas e copie a Access Key que chega.
5. Preencha `portal/config.js` com a Project URL e a chave `anon public` (Supabase > Project Settings > API) e a Access Key do Web3Forms. Ou mande os três para o Claude preencher.
6. **GitHub Pages**: no repositório, **Settings > Pages > Deploy from a branch**, escolha a branch com o portal e a pasta `/ (root)`.

## Como atualizar

Peça ao Claude a mudança. Ele edita o `index.html`, faz o commit aqui e republica a página no mesmo link da Central.
