# Backend Lume no Supabase

O backend foi migrado para o projecto **Lume**, referência pública `ikwdegtaawgjkrhomvlk`.

- API: `https://ikwdegtaawgjkrhomvlk.supabase.co/functions/v1/lume-api`
- Saúde: `https://ikwdegtaawgjkrhomvlk.supabase.co/functions/v1/lume-api/api/health`
- PostgreSQL: esquema privado `lume`, RLS activa e sem permissões para `anon`/`authenticated`.
- Uploads: bucket privado `lume-uploads`. A API verifica a sessão, autoria e estado de aprovação antes de entregar uma imagem. Inclusive respostas 404 têm `no-store`.
- Autenticação: preserva as contas e as regras Express do Lume; as palavras-passe continuam sob scrypt e as sessões HttpOnly/Secure sob hash. Esta versão **não usa Supabase Auth** nem entrega uma service-role key ao browser.
- A cópia SQLite local foi preservada. As sessões antigas e os tokens temporários não foram migrados; é necessário entrar novamente na versão publicada.

## Vercel

O build lê `supabase/deployment.json`, que contém apenas o URL e a referência públicos. Já não é obrigatório preencher `BACKEND_ORIGIN` manualmente. Se houver uma variável antiga, removê-la ou substituí-la por:

```dotenv
BACKEND_ORIGIN=https://ikwdegtaawgjkrhomvlk.supabase.co/functions/v1/lume-api
```

Usar Framework **Other**, Node **24.x**, comando `npm run build:vercel` e nenhuma Output Directory personalizada. A Build Output API gera os ficheiros estáticos e uma pequena função Vercel para entregar o HTML administrativo só após validar a sessão, e para gerar os previews de partilha. PostgreSQL, sessões, uploads, API e fila de e-mail correm no Supabase. O Hero continua estático e inalterado.

`/api/*` e `/media/*` são encaminhados para a Edge Function. Perfis e comunidade usam os HTMLs existentes. Isto mantém os cookies no domínio da Vercel, sem guardar sessões em localStorage e sem abrir CORS.

## Configuração que falta completar no serviço

Em **Supabase → Project Settings → Edge Functions → Secrets**, configurar:

```dotenv
APP_URL=https://URL-REAL-DO-SITE.vercel.app
BETA_EMAILS=email-real-do-primeiro-testador,email-real-do-segundo-testador
SMTP_HOST=hostname-do-fornecedor
SMTP_PORT=465
SMTP_USER=configurar-no-painel
SMTP_PASS=configurar-no-painel
MAIL_FROM=Lume <remetente-autorizado@dominio-real>
```

Os valores acima são exemplos a substituir, não endereços prontos para usar. `APP_URL` deve ser o URL **do frontend**, sem caminhos. Actualmente está limitado à origem da API para os testes técnicos; pedidos de escrita do frontend ficam bloqueados até esta variável ser corrigida. A lista inicial de convites está restrita ao e-mail administrativo reservado. Para convidar pessoas, adicionar os endereços reais a `BETA_EMAILS`.

As Edge Functions bloqueiam as portas SMTP 25 e 587. Usar SMTP com TLS na porta **465** ou adaptar o envio para um fornecedor HTTP. Não copiar a configuração 587 da alternativa Docker. É necessário confirmar a entrega real antes de abrir novos registos: sem o fornecedor de e-mail, os pedidos ficam na fila e os utilizadores não conseguem confirmar/recuperar a conta.

O endpoint de saúde informa `emailConfigured` e `frontendConfigured` sem revelar segredos. Estes indicadores verificam presença de configuração, não substituem um teste real de entrega ou de navegação.

**Nunca publicar** `.env.supabase*`, a ligação PostgreSQL, palavras-passe, service-role key ou SQL com dados privados no GitHub. Estes ficheiros locais estão ignorados pelo Git e têm permissões restritas. A referência do projecto e o URL da função são públicos e podem estar no repositório.

## Actualizar o backend

```sh
npm ci
npm run build:supabase
npm test
supabase functions deploy lume-api --project-ref ikwdegtaawgjkrhomvlk --no-verify-jwt --use-api
```

`verify_jwt=false` é intencional: os endpoints públicos são públicos e a autenticação privada é feita pelas sessões do Lume, com verificação de utilizador/administrador dentro do Express. Não remover essas verificações. Os módulos em `supabase/functions/lume-api/_server` são gerados a partir de `server/` por `scripts/build-supabase.js`; não editar as cópias geradas à mão. A adaptação assíncrona usa PostgreSQL transaccional e Storage. As rotas e as permissões são partilhadas com a versão local, testada com SQLite.

O script `supabase-schema.js` gera apenas o esquema, sem dados. `supabase-data.js` produz SQL privado de migração em `.env.supabase-data.sql`, nunca num ficheiro público. Não reexecutar uma migração de dados sobre uma instalação com novas contas/IDs sem rever colisões e dependências. A migração inicial já foi aplicada; novas alterações de esquema precisam de migrações próprias revistas.

## Tarefas e operação

- `lume-mail-retries`: tarefa pg_cron que chama o worker privado de e-mails a cada minuto. A chave está no Vault/Secrets e não no código. A função também tenta enviar em background após novos pedidos. Os lotes são reduzidos para respeitar o limite de execução das Edge Functions.
- `lume-private-retention`: remove eventos de tempo real antigos, erros técnicos antigos, limites expirados e tokens expirados.
- SSE usa eventos persistidos no PostgreSQL e Last-Event-ID para recuperar alterações entre workers/reconexões. A reconexão não limpa automaticamente a grelha Descobrir.
- Diagnósticos ficam nos logs da função e na tabela privada `lume.runtime_errors`. Não existe endpoint público para os consultar.
- Não se deve activar a tarefa de backup local SQLite na Edge Function. As cópias de segurança da base PostgreSQL e dos objectos Storage são separadas. A disponibilidade/retenção de backups geridos depende do plano Supabase; confirmar no painel e configurar exportação externa cifrada antes de tratar esta beta como produção definitiva. A base SQLite e os uploads locais originais continuam preservados como cópia da migração inicial.

## Validação antes de partilhar

1. Confirmar `APP_URL`, convites e fornecedor de e-mail.
2. Novo deploy Vercel com o commit mais recente; testar `/api/health` no domínio da Vercel.
3. Confirmar cookies Secure/HttpOnly, login/logout, confirmação de e-mail e recuperação real.
4. Enviar uma foto pendente: terceiros não a devem conseguir abrir. Aprovar e verificar galeria e e-mail do autor.
5. Criar/renomear/apagar álbuns, testar perfis, mapa, fotos relacionadas e scroll no telefone.
6. Verificar que `/admin`, `/admin.html` e os aliases antigos não entregam o HTML a visitantes ou utilizadores comuns.

Referências oficiais: [routing Express nas Edge Functions](https://supabase.com/docs/guides/functions/routing), [limites da plataforma](https://supabase.com/docs/guides/functions/limits), [Build Output API da Vercel](https://vercel.com/docs/build-output-api/configuration).
