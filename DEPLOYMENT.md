# Alternativa: backend Docker persistente

**A configuração actual usa Supabase. Consulta [SUPABASE.md](SUPABASE.md).** Este documento mantém a alternativa Express/SQLite num servidor persistente para quem a escolher explicitamente.


## Arquitectura preparada

- Vercel: ficheiros públicos e encaminhamento da mesma origem para o backend, através de Build Output API.
- Backend: Docker/Node 24, Express e SQLite, numa única instância com um volume persistente em `/var/lib/lume`. O fornecedor deve suportar processos permanentes, HTTPS e SSE. Não usar discos efémeros nem várias réplicas deste backend SQLite.
- E-mail: SMTP real com remetente autorizado e TLS. Sem SMTP verificado, não convidar utilizadores: não conseguirão confirmar ou recuperar contas.
- O Hero não foi alterado. Não é uma função nem um slideshow.

A Vercel não executa este backend e não recebe a base de dados. Não colocar SQLite em `/tmp` para tentar contornar os limites das funções: perderia dados. A configuração falha explicitamente se se tentar executar este backend como função Vercel.

## 1. GitHub

Usar um repositório privado e a branch `main`. Estão excluídos `.env`, bases de dados, backups, uploads, fotografias originais (`fotos*`) e a versão antiga. `public/photos` contém as cópias optimizadas e autorizadas para publicação. `public/data/launch-catalog.json` só contém fotografias aprovadas e dados públicos de crédito. Rever este catálogo antes de tornar o repositório público.

```sh
git status --short
git add .
git commit -m "Prepare Lume private beta deployment"
git remote add origin <URL_DO_REPOSITORIO_PRIVADO>
git push -u origin main
```

O workflow GitHub Actions instala Node 24, executa os testes, verifica dependências e valida o build da Vercel. Não publica automaticamente dados ou segredos. Não partilhar `.env` ou snapshots no repositório, mesmo privado.

## 2. Backend persistente

Criar um serviço Docker a partir do repositório e montar um volume gravável em `/var/lib/lume`, pertencente ao UID 1000 (`node`). Configurar uma réplica, política de reinício automático e health check `/api/health`. A porta é `PORT` (8080 por omissão). A imagem corre sem root. O fornecedor deve permitir SMTP de saída e HTTPS de entrada.

Variáveis secretas no painel do backend (valores de exemplo, substituir):

```dotenv
NODE_ENV=production
APP_URL=https://o-teu-site.vercel.app
DB_PATH=/var/lib/lume/data/lume.sqlite
UPLOAD_DIR=/var/lib/lume/uploads
BACKUP_DIR=/var/lib/lume/backups
TRUST_PROXY=1
REQUIRE_EMAIL_VERIFICATION=true
MAIL_FROM=Lume <fotografia@teu-dominio.com>
SMTP_HOST=smtp.teu-fornecedor.com
SMTP_PORT=587
SMTP_USER=definir-no-painel
SMTP_PASS=definir-no-painel
```

`TRUST_PROXY=1` só é correcto quando a ligação directa ao Express vem de um proxy de confiança do fornecedor; adaptar às redes/hops reais. O proxy deve preservar `X-Forwarded-For`/`X-Forwarded-Proto`, cookies e streaming SSE. Não expor a porta interna directamente à internet. `APP_URL` é o endereço do frontend, não o domínio separado do backend. O hostname pode ser conhecido antes do primeiro deploy, usando o nome do projecto Vercel escolhido.

O backend valida a configuração ao arrancar. As origens de escrita são limitadas a `APP_URL` e, se necessário, `ALLOWED_ORIGINS` (lista explícita de origens HTTPS). Não autorizar todos os previews da Vercel: usar um backend/base de dados separados para previews que alteram dados.

### Importar as fotos sem publicar contas locais

No terminal privado do serviço backend:

```sh
npm run catalog:import
LUME_ADMIN_PASSWORD='<palavra-passe-forte>' npm run admin -- admin-lume
```

`catalog:import` é idempotente, não apaga nada e não importa palavras-passe, sessões, álbuns ou e-mails locais. Cria perfis editoriais com credenciais aleatórias e endereços `.invalid`. A conta administrativa é criada separadamente para o e-mail reservado do projecto. Executar `admin` também confirma o e-mail dessa conta provisionada pelo operador.

Para atribuir um perfil editorial ao verdadeiro fotógrafo, após confirmar a identidade fora da aplicação:

```sh
LUME_PROFILE_EMAIL='<email-real-do-autor>' npm run profile:assign -- mussajunior
```

O comando só aceita perfis `.invalid` ainda não reclamados e nunca substitui uma conta real. O autor usa depois **Recuperar palavra-passe** no site, recebe o link e define a sua própria palavra-passe. Não enviar palavras-passe partilhadas.

Não executar `seed` em produção. Para manter contas existentes em vez de criar a instalação limpa, usar uma transferência privada de snapshot verificado e uploads, com a aplicação parada; nunca passar esses dados pelo GitHub. Rever as contas de demonstração e os endereços antes de permitir acessos.

## 3. Vercel

Importar o repositório GitHub. Usar a raiz do projecto, **Framework Preset: Other** e Node **24.x**. O `vercel.json` define o comando `npm run build:vercel`; não configurar outra Output Directory. O build gera `.vercel/output/config.json` e `.vercel/output/static` (Build Output API v3).

Definir no painel da Vercel:

```dotenv
BACKEND_ORIGIN=https://endereco-https-do-backend
```

Não definir credenciais SMTP, passwords de administração ou DB_PATH na Vercel. `BACKEND_ORIGIN` não é um segredo e não pode conter caminhos, query strings ou credenciais. O build recusa uma origem inválida.

As rotas `/api/*`, `/media/*`, `/@username`, `/foto/*`, `/historia/*`, `/exposicao/*` e os aliases de administração são encaminhados para Express. Isto mantém cookies e pedidos da aplicação na origem da Vercel, sem CORS aberto e sem expor o HTML administrativo como ficheiro estático. As imagens enviadas pelos utilizadores continuam protegidas no backend e não são colocadas no CDN público do frontend.

Após mudar o domínio, actualizar `APP_URL` no backend, reiniciar e voltar a testar login, CSRF e links de e-mail. Não partilhar o endereço separado da API como endereço do site.

## 4. Antes de convidar os testadores

1. Confirmar que GitHub Actions passou e que `/api/health` responde através do domínio da Vercel.
2. Registar uma conta com qualquer endereço válido. Com `REQUIRE_EMAIL_VERIFICATION=true`, confirmar a entrega real e abrir o link; com `false`, verificar a entrada imediata.
3. Entrar, sair e recuperar a palavra-passe. O link usado não pode ser reutilizado; a alteração deve terminar as sessões anteriores.
4. Enviar uma foto; verificar privacidade enquanto pendente, recepção do aviso administrativo e recepção da aprovação pelo autor.
5. Testar perfil, álbuns, Cinema, mapa e menu em PC, Android e Safari/iPhone reais. A animação e a rotação física têm limitações próprias dos browsers.
6. Reiniciar e voltar a fazer deploy do backend: a foto, o álbum e a conta têm de continuar presentes.
7. Criar e verificar um backup, restaurá-lo num ambiente isolado e confirmar contagens e ficheiros. Configurar alertas de indisponibilidade para `/api/health`, de falhas SMTP/backup e de disco cheio no fornecedor.
8. Partilhar o URL HTTPS da Vercel. Os registos e as fotografias aprovadas são públicos.

## 5. Backups e restauro

O backend cria snapshots no arranque e diariamente, conservando os sete mais recentes. Os snapshots contêm dados privados e credenciais sob hash: não os servir por HTTP, não os colocar no GitHub e copiar regularmente para armazenamento externo cifrado com retenção própria. Uma cópia no mesmo volume não protege contra perda desse volume.

```sh
npm run backup
npm run backup:verify -- /var/lib/lume/backups/lume-<data>-<id>
```

Cada snapshot contém `database.sqlite`, os uploads referenciados e um manifesto SHA-256. A verificação testa os ficheiros e o `PRAGMA integrity_check`. Para restaurar: parar o serviço, guardar os dados actuais, copiar `database.sqlite` para `DB_PATH` e os ficheiros de `uploads/` para `UPLOAD_DIR`, garantir permissões do UID 1000 e reiniciar. Não sobrepor uma base de dados aberta ou deixar ficheiros `-wal`/`-shm` de outra base de dados; mover todo o conjunto antigo para uma pasta de segurança antes de restaurar. Testar o restauro numa instalação isolada antes de precisar dele em produção.

## Limites e operação desta beta

- Upload: dois ficheiros de até 6 MB, máximo de 40 megapixels, dois pedidos processados em simultâneo, 20 envios por conta/dia e 500 MB de uploads por conta.
- Limites de pedidos persistem no SQLite. Isto continua a ser uma arquitectura de uma única instância; várias réplicas exigem outra estratégia de base de dados, pub/sub e armazenamento.
- Links de confirmação: 24 horas; recuperação: 30 minutos. Tokens de uso único, armazenados sob hash; os e-mails ainda não enviados contêm o link em payload privado, removido após envio.
- Logs de erro vão para stdout/stderr do serviço. Não registam palavras-passe, tokens ou o corpo dos pedidos. Configurar alertas no fornecedor; não foi criada uma conta externa de monitorização.
- SMTP com remetente/domínio verificado, entregabilidade, volumes, DNS, HTTPS e recuperação real do fornecedor precisam de ser confirmados após a publicação. Testes locais não comprovam esses serviços.
