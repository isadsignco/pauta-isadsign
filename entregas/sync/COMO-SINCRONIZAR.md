# Clientes do Demandas → Entregas (passo a passo da tarefa agendada)

1. Clonar `isadsignco/pauta-isadsign` (raso) e buscar a branch `dados`:
   `git fetch origin dados --depth 1 && git worktree add /tmp/dados origin/dados`
2. Se `/tmp/dados/entregas/chave-publica.json` não existe, o portal ainda não foi publicado: parar aqui sem erro.
3. Ler os clientes do Demandas (`https://claude.ai/code/artifact/bf33e2cc-6c1a-4895-9fa7-70fd8478b76b`) com ArtifactData `list`, coleção `clientes`, `query.limit` 500, `out_dir` = `/tmp/dem` (gera `/tmp/dem/clientes/*.json`).
4. Para cada cliente com `logoAsset`, baixar a logo com Artifact `read` (mesma url, `path` = o `logoAsset`, `out_dir` = `/tmp/logos`). Se uma logo falhar, seguir sem ela.
5. `python3 entregas/sync/cifrar.py --clientes /tmp/dem/clientes --logos /tmp/logos --chave /tmp/dados/entregas/chave-publica.json --saida /tmp/dados/entregas/clientes.enc.json`
6. Na worktree `/tmp/dados`: `git add entregas/clientes.enc.json`, commit "Entregas: clientes do Demandas" e `git push origin HEAD:dados` (se rejeitar, `git pull --rebase origin dados` e tentar de novo uma vez).

Nunca gravar os JSON dos clientes nem as logos sem cifrar no repositório: ele é público.
