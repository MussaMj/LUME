# LUME — O Brilho de Moçambique

**Publicação actual: Vercel + Supabase.** Segue [SUPABASE.md](SUPABASE.md) para o backend já publicado, configuração do site e e-mails. O modo Express/SQLite continua disponível para desenvolvimento local.


Plataforma colaborativa de fotografia artística de Moçambique. A homepage parallax (`public/index.html`) partilha a navbar e a sessão com a comunidade, que inclui envios
moderados, perfis, mapa por província, feed Masonry, inspirações, álbuns privados e Foto da Semana.

## Arrancar

Requer **Node 24.x** (usa o SQLite incorporado `node:sqlite`, sem dependências nativas).

```bash
npm install
npm run seed     # contas e fotografias de demonstração (opcional)
npm run dev      # http://localhost:8080
```

O único e-mail administrativo é **`innovateiv.crtf@gmail.com`**. Após login, essa conta
vai por omissão para **`/admin`**; as restantes vão por omissão para a galeria.
Um `next` interno válido tem prioridade para ambas as funções.
As roles internas mantêm os valores `admin` e `user` do esquema existente.
`/admin`, `/admin.html` e os aliases antigos `/bastidores` estão protegidos no servidor:
visitantes vão para `/entrar?next=...&notice=admin-login`; utilizadores comuns
regressam ao início com **Acesso Negado**. A API devolve 403.
O HTML administrativo está fora da pasta pública.

A confirmação de e-mail é obrigatória em produção. O endereço administrativo continua
reservado no registo público. Para criar a conta, executa no servidor (sem expor a palavra-passe
nos argumentos nem a guardar em ficheiros versionados):

```bash
read -s LUME_ADMIN_PASSWORD
export LUME_ADMIN_PASSWORD
npm run admin -- curador
unset LUME_ADMIN_PASSWORD
```

Usa uma palavra-passe com pelo menos 12 caracteres. Se a conta desse e-mail já existe, o comando
preserva a palavra-passe. Contas de outros e-mails não recebem acesso, mesmo com uma role antiga
`admin` na base de dados. O script antigo de promoção arbitrária foi substituído por este fluxo.

## Estrutura

```
server.js                 Express: API, páginas, /media protegido, /foto/:id com Open Graph
server/
  db.js                   Esquema SQLite + função mix() para o feed aleatório paginável
  auth.js                 scrypt, sessões em cookie httpOnly, CSRF por Origin, rate limit
  provinces.js            As 11 províncias
  util.js                 Validação, formato das respostas, erros
  routes/
    auth.js               /api/auth   registo, login, logout, editar perfil
    photos.js             /api/photos feed, stats, Foto da Semana, envio, "Inspirou-me"
    users.js              /api/users/:username (perfil público), /api/me/*
    collections.js        /api/collections álbuns privados
    admin.js              /api/admin  fila, aprovar/rejeitar, publicadas, Foto da Semana
scripts/
  seed.js                 Dados de demonstração (npm run seed [-- --reset])
  make-admin.js           Promove uma conta a admin
  build-map.py            Gera o mapa a partir do geoBoundaries
server/mail.js            Notificações SMTP e novas tentativas
server/events.js          Sinais SSE para revalidar a galeria
server/views/admin.html   Dashboard protegido
public/
  index.html style.css script.js   Homepage original (só ganhou o link “Descobrir”)
  descobrir.html          Foto da Semana (parallax máximo) + mapa + feed Masonry
  enviar.html             Formulário com ficha técnica
  entrar.html             Entrar / criar conta
  perfil.html             /@username
  colecoes.html           Álbuns e “Inspirou-me” (privado)
  # O HTML administrativo está em server/views/admin.html
  css/app.css             Componentes da comunidade (herda tokens de style.css)
  js/core.js              API, sessão, nav, avisos, parallax, ícones
  js/masonry.js           Grelha Masonry (coluna mais baixa, proporções reais)
  js/cinema.js            Cinema Lightbox, “Inspirou-me”, álbuns, partilha
  data/mapa-mocambique.json  Mapa vetorial das 11 províncias
data/                     Base de dados SQLite (ignorada pelo git)
uploads/                  Fotografias enviadas (ignorada pelo git)
```

## Como funciona

**Envio e curadoria.** O navegador redimensiona a foto (2560 px + miniatura de 900 px) e
remove todos os metadados (incluindo GPS) antes de enviar; câmara, objectiva e telemóvel são
pré-preenchidos a partir do EXIF. O servidor valida o tipo real do ficheiro. Cada envio entra
como `pending`. Os ficheiros pendentes ou rejeitados só são servidos ao autor e aos admins.

**Feed Descobrir.** `ORDER BY mix(id, seed)` dá uma mistura aleatória estável por visita,
o que permite scroll infinito sem repetições. O filtro por província é partilhável
(`/descobrir?provincia=sofala`).

**Partilha.** Cada foto tem um link próprio, `/foto/:id`, com Open Graph para a pré-visualização
no WhatsApp. O botão Stories gera um cartão 1080×1920. No telemóvel abre a folha de partilha
nativa (Instagram → Stories). No computador, descarrega a imagem. O Instagram não permite
publicar Stories diretamente a partir da web.

**Foto da Semana.** O admin escolhe uma fotografia aprovada em Bastidores. A mais recente
fica no topo de `/descobrir`, em ecrã inteiro.

## Publicação da versão de testes

Segue [SUPABASE.md](SUPABASE.md) para a publicação actual Vercel + Supabase. [DEPLOYMENT.md](DEPLOYMENT.md) descreve a alternativa anterior com um servidor Docker persistente.

## Antes de pôr em produção

- `NODE_ENV=production` (cookies `Secure`) atrás de HTTPS.
- Guarda `data/` e `uploads/` num volume persistente com cópias de segurança. Para escalar,
  muda `uploads/` para armazenamento de objetos (S3, R2…).
- Recuperação de palavra-passe e confirmação de e-mail implementadas; testar entrega SMTP real antes dos convites.
- Os limites de pedidos persistem no SQLite. Esta beta usa uma instância; várias réplicas exigem outra estratégia de dados/eventos.
- As fotografias iniciais (homepage e `scripts/seed.js`) são fotografias reais de Moçambique
  do Unsplash, servidas a partir do CDN do Unsplash e creditadas aos autores. A palavra-passe
  de admin em `scripts/seed.js` é só para desenvolvimento. Em produção não corras o seed: cria a tua
  conta administrativa pelo terminal, conforme descrito acima.

Mapa: limites administrativos do [geoBoundaries](https://www.geoboundaries.org)
(© colaboradores do OpenStreetMap, ODbL 1.0). A Cidade de Maputo vem do nível ADM2.


## Notificações por e-mail

Copia `.env.example` para `.env` e configura `APP_URL` com o endereço público do site,
`MAIL_FROM` com um remetente autorizado e `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`
com as credenciais do teu fornecedor. `npm start` e `npm run dev` carregam `.env` automaticamente.
Não coloques credenciais em JavaScript do navegador nem no controlo de versões.

O envio usa [Nodemailer SMTP](https://nodemailer.com/smtp): porta 465 para TLS imediato ou
587 para STARTTLS; em produção o TLS é obrigatório. Reinicia o servidor após configurar.
O destinatário é sempre `innovateiv.crtf@gmail.com` e o assunto é
`[Lume] Nova foto pendente de aprovação!`. O corpo inclui nome/e-mail do remetente,
título, categoria e link absoluto para `/admin`. O link é construído a partir de `APP_URL`,
nunca do cabeçalho Host do pedido.

Cada upload grava a fotografia pendente e a notificação na mesma transação SQLite.
Um worker tenta enviar imediatamente e verifica a fila a cada 30 segundos, com recuo
progressivo até uma hora entre tentativas. Sem SMTP configurado ou durante uma falha,
o upload continua válido e o e-mail fica em `email_outbox`, incluindo após reinícios.
A entrega é pelo menos uma vez: uma interrupção após aceitação SMTP mas antes da confirmação
na base pode causar duplicação. `sent_at` indica aceitação pelo fornecedor, não entrega na caixa de entrada.

## Dashboard e actualizações

O painel mostra métricas, cards com fotografia expansível, categoria, descrição, nome e e-mail
do autor. Permite aprovar, rejeitar com motivo opcional e seleccionar até 100 fotos por acção em lote.
As acções em lote são atómicas: uma selecção desactualizada não altera parte do lote.
E-mails de autores só aparecem em respostas administrativas.

A moderação actualiza os cards e as métricas sem recarregar a página. `/descobrir` usa SSE para
revalidar a galeria e a Foto da Semana quando os estados mudam. O painel assinala alterações
remotas com “Actualizar lista”, preservando selecções e justificações em edição. O proxy de produção
deve permitir ligações SSE sem buffering. O mecanismo actual destina-se a uma única instância;
para várias instâncias, partilha os sinais por Redis ou equivalente.

## Verificação

```bash
npm test
```

Os testes usam SQLite e uploads temporários e um servidor SMTP local simulado, sem enviar
mensagens reais. Cobrem RBAC, aliases HTML, registo reservado, uploads pendentes, privacidade,
aprovação, rejeição, lote atómico, sinais SSE e novas tentativas após falha SMTP.


### Confirmação ao autor após aprovação

Quando uma fotografia passa a `approved`, o autor recebe um e-mail com o assunto
`[Lume] A tua fotografia foi aprovada!`, o título e um link direto para `/foto/:id`.
Funciona na aprovação individual e em lote. A confirmação é guardada na mesma transação
da aprovação e usa a mesma configuração SMTP e política de novas tentativas.
Cada fotografia tem uma única confirmação de aprovação, evitando mensagens repetidas em
pedidos duplicados ou republicações. A migração preserva as notificações de upload existentes.
Sem SMTP configurado, as confirmações ficam na fila até o serviço estar disponível.


## Navegação e sessão unificadas

Todas as navbars são preenchidas por `initNav()` em `public/js/core.js`, incluindo a homepage.
O menu e o botão móvel começam ocultos até terminar a consulta a `/api/auth/me`.
Visitantes veem Galeria, Experiência, Sobre e Entrar; contas autenticadas veem Início,
Descobrir, Enviar, Perfil, Colecções e Sair. Administração só aparece para a conta administrativa.
O menu móvel fecha ao escolher um link e a sessão é revalidada ao regressar à janela ou ao
restaurar uma página do histórico.

Enviar e Colecções redirecionam visitantes no frontend, preservando caminho, query e fragmento
em `next`. Administração faz o controlo inicial no servidor. `public/js/navigation.js` valida
os destinos locais e impede destinos externos ou retorno à página de autenticação.
Login e registo respeitam `next`; sem destino válido, usam `/admin` ou `/descobrir` conforme a função.

Os cards e o Cinema ligam o avatar/nome ao perfil público do membro. Créditos externos são
apresentados separadamente. O Cinema cria uma entrada no histórico ao abrir, actualiza-a ao
mudar de fotografia e fecha com Voltar, preservando filtros e scroll. Avançar volta a abri-lo.
Links com `?foto=ID` são restaurados nas páginas que usam o Cinema, incluindo perfis e colecções.


## Fotografias de Michael James Khosa

As 11 fotografias de Maputo fornecidas em `fotos/` estão publicadas na galeria editorial,
no Descobrir e no perfil `/@michael.james.khosa`, com crédito a Michael James Khosa.
Quatro imagens editoriais do Unsplash foram substituídas e sete foram acrescentadas;
a imagem de abertura da homepage e a Foto da Semana existente foram preservadas.

Os originais permanecem em `fotos/`. As cópias web JPEG (lado maior até 2400 px) e miniaturas
(até 900 px), incluindo conversões dos três HEIC, estão em `public/photos/michael-james-khosa/`.
As cópias publicadas não contêm EXIF/GPS. O manifesto é `public/data/michael-photos.js`.

Para importar as fotografias noutra base de dados, depois do seed opcional:

```bash
npm run import:photos
```

A importação é idempotente e não reinicia a base de dados. Substitui até quatro fotografias
aprovadas específicas do Unsplash, exceto imagens presentes no histórico da Foto da Semana;
as restantes são adicionadas. Cria um perfil editorial de Michael sem credenciais de login
partilhadas nem e-mail real conhecido; não envia notificações de upload/aprovação.


## Comunidade: histórias e encontros

`/comunidade` reúne Histórias, Fotógrafos, Exposições, Encontros e Novidades.
A homepage mantém a fotografia de abertura e inclui uma ligação “Explorar Moçambique” e
pré-visualizações da comunidade. O menu autenticado dá acesso direto à Comunidade.

- **Histórias:** membros seleccionam 5–10 fotografias próprias já aprovadas, ordenam-nas e
  acrescentam legendas. Entram em curadoria; o administrador publica ou arquiva em
  `/comunidade#gestao`, acessível também pelo dashboard. `/historia/:id` apresenta a sequência.
- **Fotógrafos em destaque:** a curadoria escolhe um perfil e escreve a apresentação.
  Não são geradas entrevistas ou citações em nome dos fotógrafos.
- **Exposições:** os álbuns continuam privados por omissão. O proprietário pode publicá-los
  nas Colecções; `/exposicao/:id` e a listagem pública mostram apenas imagens aprovadas.
  Tornar privado remove imediatamente o acesso público à API.
- **Encontros:** o administrador publica data/hora de Maputo, ponto de encontro, descrição
  e capacidade. Membros confirmam ou cancelam presença. O servidor verifica vagas e datas;
  não são criados encontros fictícios.
- **Seguir:** perfis permitem seguir fotógrafos; as próximas aprovações criam notificações
  em `/comunidade#novidades`. E-mails são opcionais, através de uma opção explícita no perfil,
  e usam o SMTP existente, com novas tentativas. Deixar de seguir/desactivar e-mails interrompe
  os envios ainda pendentes. A entrega SMTP é pelo menos uma vez.
- **Descoberta:** filtros de tema e ambiente combinam-se com província e “quem sigo”, com
  estado no URL. Os ambientes são classificados no envio, não inferidos por inteligência artificial.
- **Por trás da fotografia:** notas opcionais no envio e edição pelo autor no próprio perfil;
  o Cinema apresenta-as separadamente da descrição.

```bash
npm run seed:community
```

O seed é idempotente: prepara uma história de Michael com as fotografias importadas,
e o seu destaque. Não cria datas de encontros nem palavras em nome do fotógrafo.
Os desafios foram retirados da interface e da API; registos antigos ficam arquivados.

Os dados novos usam migrações aditivas no SQLite. Não é necessário reset da base de dados.
Os testes de integração cobrem publicação/moderação, propriedade, privacidade das colecções,
participação, capacidade de encontros, filtros e notificações de seguidores.

### Destaque automático e galerias dinâmicas

O Hero da homepage mantém a imagem e a estrutura originais. Apenas a grelha editorial abaixo do Hero consulta `/api/photos?limit=8&sort=popular`, com fallback local até completar oito imagens. Alterações de moderação são revalidadas por SSE; a grelha não é substituída enquanto o lightbox estiver aberto.

A Foto da Semana dá prioridade à última escolha editorial aprovada durante sete dias. Sem escolha activa, calcula a soma de “Inspirou-me”, guardados em álbuns e visualizações nos sete dias anteriores à selecção. O resultado fica guardado em `weekly_featured` para a semana UTC que começa à segunda-feira; na primeira consulta da semana seguinte é recalculado. Uma foto despublicada é substituída imediatamente. Empates usam data de publicação e ID. A página Descobrir verifica o destaque a cada minuto enquanto está visível. Não é necessário um cron externo.

As visualizações são registadas apenas ao abrir uma fotografia, nunca ao carregar thumbnails: uma por foto e visitante em cada dia UTC. O identificador anónimo usa um cookie HttpOnly e fica guardado na base de dados sob hash; utilizadores autenticados são deduplicados por conta. Não existe histórico de visualizações anterior à implementação. Guardados privados só contribuem para a contagem agregada: nomes de álbuns e identidades não são expostos.

O Cinema consulta sugestões aprovadas do mesmo fotógrafo (ou da província quando não existem outras fotos desse autor). O mapa usa `/api/photos/map-preview` para contagens e a fotografia mais recente, com preview por rato, foco de teclado ou toque. As grelhas usam skeletons, entrada progressiva e animações compatíveis com `prefers-reduced-motion`.

### Segurança e operação da beta

A configuração de produção exige HTTPS, caminhos persistentes, SMTP e uma lista `BETA_EMAILS`. A criação de contas é limitada aos convidados. A recuperação de palavra-passe revoga as sessões existentes e utiliza links de uso único. `npm run check:production` valida a configuração e a ligação SMTP, sem enviar mensagens. `npm run backup` cria um snapshot privado; `backup:verify` verifica a integridade. Os backups locais devem também ser copiados para armazenamento externo cifrado.

Os novos limites de upload são 6 MB por ficheiro, 40 megapixels, dois envios simultâneos, 20 pedidos por conta/dia e 500 MB de uploads por conta. Fotos e uploads privados não fazem parte do repositório. O catálogo de lançamento contém apenas fotografias aprovadas, sem palavras-passe, sessões ou e-mails privados. As configurações de publicação e os testes não alteram o Hero.
