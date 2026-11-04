# Entregas isadsign

Portal de arquivos para os clientes da @isadsign.co, no estilo Google Drive:

- **Painel da Isa** (`/painel`, visual do Demandas): uma pasta por cliente, envio de reels, posts e PDFs de qualquer tamanho, subpastas (ex.: "Novembro"), link e código de cada cliente, mensagem pronta para mandar.
- **Pasta do cliente** (`/p/<nome-do-cliente>`): abre com o código, na identidade visual do cliente (cores, fontes e logo do Demandas). Vê, filtra (Reels, Posts, PDFs) e baixa um por um ou tudo em .zip.
- **Limpeza**: cada arquivo some 30 dias depois de enviado. No painel dá para dar "mais 30 dias" a um arquivo.
- **Clientes do Demandas**: todo dia o Claude lê os clientes do painel Demandas (nome, status, paleta, fontes, logo, submarcas) e o portal cria ou atualiza as pastas. O botão **Demandas** no painel puxa na hora.

Roda na Cloudflare (Worker + R2). O R2 é grátis até 10 GB guardados e não cobra download.

## Configurar uma vez

1. Crie uma conta em [dash.cloudflare.com](https://dash.cloudflare.com).
2. Em **Workers & Pages**, abra uma vez e escolha seu subdomínio `workers.dev` (ex.: `isadsign`).
3. Em **R2 Object Storage**, ative o R2. A Cloudflare pede um cartão, mas até 10 GB não cobra.
4. Em **My Profile → API Tokens → Create Token**, use o modelo **Edit Cloudflare Workers** e acrescente a permissão **Account → Workers R2 Storage → Edit**. Copie o token.
5. Copie o **Account ID** (aparece na lateral direita da página inicial de Workers & Pages).
6. No GitHub, em `isadsignco/pauta-isadsign` → **Settings → Secrets and variables → Actions → New repository secret**, crie:
   - `CLOUDFLARE_API_TOKEN`: o token do passo 4
   - `CLOUDFLARE_ACCOUNT_ID`: o ID do passo 5
   - `ENTREGAS_SENHA`: a senha que você quer usar no painel
7. Em **Actions → Entregas (Cloudflare) → Run workflow**. Quando terminar, o resumo mostra o endereço do painel (`https://entregas-isadsign.<seu-subdominio>.workers.dev/painel`).

Depois disso, qualquer mudança em `entregas/` publica sozinha.

## Como os clientes do Demandas chegam aqui

O Demandas vive no claude.ai e não pode ser lido de fora. Então a tarefa agendada **"Clientes do Demandas → Entregas"** faz assim, todo dia:

1. lê os clientes do Demandas e baixa as logos;
2. roda `sync/cifrar.py`, que junta só o que o portal usa e **cifra** com a chave pública do portal (`entregas/chave-publica.json` na branch `dados`);
3. grava `entregas/clientes.enc.json` na branch `dados`.

O Worker lê esse arquivo a cada 6 horas (ou quando você toca em **Demandas** no painel) e só ele tem a chave para abrir. No GitHub público fica só texto cifrado: nenhum nome, cor ou logo legível.

Se você ajustar a identidade de uma pasta no painel, o ajuste fica valendo e o Demandas não sobrescreve. "Voltar ao que está no Demandas" desfaz.

## Arquivos

- `src/worker.js`: o servidor (API, envio em partes, links assinados, limpeza, sincronização)
- `public/painel.html`: painel da Isa
- `public/pasta.html`: página do cliente
- `public/tema.js`: monta as cores e fontes de cada pasta a partir da identidade do cliente
- `sync/cifrar.py`: prepara e cifra os clientes do Demandas
- `teste/`: simulador do R2 e testes (`node teste/testar.mjs <pasta com os clientes do Demandas>`)

## Segurança

- Cada cliente só abre a própria pasta, com o código dele. Trocar o código desconecta quem já entrou.
- Os links de download são assinados e valem 6 horas; a página do cliente renova sozinha.
- Esconder uma pasta fecha o link sem apagar nada.
- O painel usa a senha do segredo `ENTREGAS_SENHA`. Trocar a senha desconecta todos os acessos ao painel.
