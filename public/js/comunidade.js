import { $, api, h, initNav, loginUrl, toast } from './core.js';
import { openCinema, setCinemaPhotos } from './cinema.js';
import { createMasonry } from './masonry.js';

const me = await initNav('comunidade');
const view = $('#communityView');
const paintView = (...nodes) => view.replaceChildren(...nodes.filter((node) => node != null && typeof node !== 'boolean'));
const names = { story: 'História fotográfica', spotlight: 'Fotógrafo em destaque', event: 'Encontro' };
let requestId = 0;
const report = (err) => toast(err.message || 'Não foi possível carregar. Tenta novamente.', { error: true });
const authLink = () => h('a', { class: 'btn', href: loginUrl() }, 'Entrar para participar');
const date = (value) => new Date(value).toLocaleString('pt-PT', { timeZone: 'Africa/Maputo', dateStyle: 'medium', timeStyle: 'short' });
const profile = (author) => h('a', { href: `/@${author.username}` }, author.displayName);

window.addEventListener('hashchange', render);
render();

async function render() {
  const request = ++requestId;
  try {
    const storyId = location.pathname.match(/^\/historia\/(\d+)/)?.[1];
    const exhibitionId = location.pathname.match(/^\/exposicao\/(\d+)/)?.[1];
    if (storyId) {
      const { item } = await api(`/community/items/${storyId}`);
      if (item.kind !== 'story') throw new Error('História não encontrada.');
      if (request !== requestId) return;
      document.title = `${item.title} — LUME`;
      setCinemaPhotos(item.photos);
      paintView(h('a', { class: 'link-arrow', href: '/comunidade#historias' }, '← Histórias'),
        h('header', { class: 'story-header' }, h('p', { class: 'eyebrow' }, 'História fotográfica'), h('h2', {}, item.title),
          profile(item.author), h('p', {}, item.intro), item.status !== 'published' && h('p', {}, 'Esta história está em curadoria.')),
        h('div', { class: 'story-sequence' }, item.photos.map((photo, index) => h('figure', {},
          h('button', { 'aria-label': `Abrir ${photo.title}`, onclick: () => openCinema(item.photos, index) }, h('img', { src: photo.src, alt: photo.title, loading: 'lazy' })),
          h('figcaption', {}, `${String(index + 1).padStart(2, '0')} · ${photo.caption || photo.title}`, h('br'), profile(photo.author))))));
      return;
    }
    if (exhibitionId) {
      const { collection, photos } = await api(`/community/exhibitions/${exhibitionId}`);
      if (request !== requestId) return;
      setCinemaPhotos(photos);
      const grid = h('div');
      document.title = `${collection.name} — LUME`;
      paintView(h('a', { href: '/comunidade#exposicoes', class: 'link-arrow' }, '← Exposições'),
        h('header', { class: 'story-header' }, h('h2', {}, collection.name), profile({ username: collection.username, displayName: collection.display_name }),
          h('p', {}, 'Uma selecção pública da comunidade. Cada fotografia mantém o crédito do seu autor.')), grid);
      if (photos.length) { const masonry = createMasonry(grid, { onOpen: (i) => openCinema(masonry.photos, i) }); masonry.add(photos); }
      else grid.append(h('p', { class: 'hint' }, 'Ainda sem fotografias publicadas nesta exposição.'));
      return;
    }
    const tab = location.hash.slice(1) || 'historias';
    document.querySelectorAll('.community-tabs a').forEach((link) => link.classList.toggle('is-current', link.hash === `#${tab}`));
    if (tab === 'criar') { await editor(); return; }
    if (tab === 'novidades') { await notifications(); return; }
    if (tab === 'exposicoes') {
      const { exhibitions } = await api('/community/exhibitions');
      if (request !== requestId) return;
      paintView(h('h2', {}, 'Exposições da comunidade'), h('p', { class: 'hint' }, 'Colecções partilhadas pelos seus curadores.'),
        h('div', { class: 'community-grid' }, exhibitions.map((item) => h('a', { class: 'community-card', href: `/exposicao/${item.id}` },
          item.cover && h('img', { src: item.cover, alt: '', loading: 'lazy' }), h('h3', {}, item.name), h('p', {}, `Selecção de ${item.display_name}`)))),
        !exhibitions.length && h('p', { class: 'hint' }, 'Ainda não há exposições. Podes publicar uma colecção a partir dos teus álbuns.'),
        h('div', { class: 'community-actions' }, h('a', { class: 'btn btn--ghost', href: '/colecoes' }, 'As minhas colecções')));
      return;
    }
    const manage = tab === 'gestao' && me?.role === 'admin';
    const { items } = await api(`/community/items${manage ? '?manage=1' : ''}`);
    if (request !== requestId) return;
    const kind = { historias: 'story', fotografos: 'spotlight', encontros: 'event' }[tab] || 'story';
    const visible = manage ? items : items.filter((item) => item.kind === kind);
    paintView(h('h2', {}, manage ? 'Curadoria da comunidade' : { story: 'Histórias para percorrer', spotlight: 'Conhece quem fotografa', event: 'Do ecrã para a cidade' }[kind]),
      me?.role === 'admin' && h('div', { class: 'community-actions' },
        h('button', { class: 'btn', onclick: () => editor() }, 'Criar conteúdo'), h('a', { class: 'link-arrow', href: '/comunidade#gestao' }, 'Gerir publicações')),
      !visible.length && h('div', { class: 'empty' }, h('strong', {}, 'Novos olhares a caminho'),
        kind === 'event' ? 'Os próximos passeios serão anunciados aqui quando houver datas e locais confirmados.' : 'Ainda não há conteúdo publicado nesta área.'),
      h('div', { class: 'community-grid' }, visible.map((item) => card(item, manage))));
  } catch (err) {
    if (request !== requestId) return;
    paintView(h('div', { class: 'empty' }, h('strong', {}, err.message), h('a', { href: '/comunidade', class: 'btn' }, 'Voltar à comunidade')));
  }
}

function card(item, manage) {
  const image = item.photos?.[0];
  const card = h('article', { class: 'community-card' },
    image && h('img', { src: image.thumb, alt: image.title, loading: 'lazy' }),
    h('span', { class: 'eyebrow' }, names[item.kind]), h('h3', {}, item.title), h('p', {}, item.intro),
    item.status !== 'published' && h('span', { class: 'pin__badge' }, item.status === 'pending' ? 'Em curadoria' : 'Arquivada'));
  if (item.kind === 'story') card.append(profile(item.author), h('a', { href: `/historia/${item.id}`, class: 'link-arrow' }, 'Percorrer a história'));
  if (item.kind === 'spotlight' && item.photographer) card.append(profile(item.photographer), h('p', {}, item.photographer.bio),
    h('a', { class: 'btn btn--ghost btn--small', href: `/@${item.photographer.username}` }, 'Conhecer e seguir'));
  if (item.kind === 'event') {
    card.append(h('p', {}, `${date(item.payload.date)} · hora de Moçambique`), h('p', {}, item.payload.location),
      h('p', {}, `${item.attendees} / ${item.payload.capacity} participantes`));
    const ended = new Date(item.payload.date) <= new Date();
    card.append(me ? h('button', { class: 'btn btn--small', disabled: ended || (!item.joined && item.attendees >= item.payload.capacity),
      onclick: () => changeParticipation(item, item.joined ? 'DELETE' : 'POST', {}) }, item.joined ? 'Cancelar presença' : ended ? 'Encontro terminado' : 'Confirmar presença') : authLink());
  }
  if (manage) card.append(h('div', { class: 'community-actions' },
    h('button', { class: 'btn btn--ghost btn--small', onclick: () => editor(item) }, 'Editar'),
    h('button', { class: 'btn btn--small', onclick: async () => {
      try { await api(`/community/items/${item.id}`, { method: 'PATCH', body: { status: item.status === 'published' ? 'archived' : 'published' } }); toast('Estado actualizado.'); render(); }
      catch (err) { report(err); }
    } }, item.status === 'published' ? 'Arquivar' : 'Publicar')));
  return card;
}

async function changeParticipation(item, method, body) {
  try { await api(`/community/items/${item.id}/participate`, { method, body }); toast(method === 'DELETE' ? 'Participação retirada.' : 'Participação confirmada.'); render(); }
  catch (err) { report(err); }
}

async function notifications() {
  if (!me) { paintView(h('div', { class: 'empty' }, h('strong', {}, 'Acompanha os teus fotógrafos'), authLink())); return; }
  const started = requestId;
  const { notifications } = await api('/community/notifications');
  if (started !== requestId) return;
  paintView(h('h2', {}, 'Novidades dos fotógrafos que segues'),
    h('p', { class: 'hint' }, 'Segue um fotógrafo a partir do perfil para receber as suas novas publicações.'),
    h('div', { class: 'notification-list' }, notifications.map((item) => h('a', { href: `/foto/${item.photo_id}`, class: !item.read_at ? 'unread' : '' }, `${item.display_name} publicou “${item.title}”`))),
    !notifications.length && h('p', { class: 'hint' }, 'Ainda sem novas publicações.'),
    h('div', { class: 'community-actions' }, h('a', { href: '/descobrir?following=1', class: 'btn btn--ghost' }, 'Ver quem sigo')));
  if (notifications.some((item) => !item.read_at)) {
    await api('/community/notifications/read', { method: 'POST', body: {} });
    const link = document.querySelector('.nav__links [data-page=comunidade]');
    if (link) { link.textContent = 'Comunidade'; link.href = '/comunidade'; }
  }
}

async function editor(existing) {
  if (!me) { paintView(h('div', { class: 'empty' }, h('strong', {}, 'Entra para contar a tua história'), authLink())); return; }
  const admin = me.role === 'admin';
  const kind = h('select', { disabled: !!existing, 'aria-label': 'Tipo de conteúdo' },
    (admin ? Object.entries(names) : [['story', names.story]]).map(([value, name]) => h('option', { value }, name)));
  kind.value = existing?.kind || 'story';
  const title = h('input', { type: 'text', required: true, maxlength: 120 }); title.value = existing?.title || '';
  const intro = h('textarea', { maxlength: 1600 }); intro.value = existing?.intro || '';
  const fields = h('div', { class: 'community-editor' });
  const button = h('button', { type: 'submit', class: 'btn' }, existing ? 'Guardar alterações' : admin ? 'Publicar' : 'Enviar história para curadoria');
  const form = h('form', { class: 'community-editor' }, h('label', {}, 'Tipo', kind), h('label', {}, 'Título', title),
    h('label', {}, 'Introdução / apresentação', intro), fields, h('p', { class: 'hint' }, admin ? 'Publica apenas informações e datas confirmadas.' : 'Escolhe 5–10 fotografias próprias já aprovadas. A história será revista antes de aparecer publicamente.'), button);
  let photos = [], inputs = {};
  let frameLoad = 0;
  async function paintFields() {
    const version = ++frameLoad;
    const payload = existing?.payload || {};
    fields.replaceChildren(); inputs = {}; button.disabled = true;
    const input = (key, label, type = 'text', value = '') => {
      const node = h('input', { type, required: true }); node.value = value; inputs[key] = node; fields.append(h('label', {}, label, node)); return node;
    };
    if (kind.value === 'story') {
      try {
        photos = (await api(admin ? '/admin/photos?status=approved' : '/me/photos')).photos.filter((photo) => !photo.status || photo.status === 'approved');
        if (version !== frameLoad) return;
        if (!photos.length) fields.append(h('p', {}, 'Ainda não tens fotografias aprovadas.'), h('a', { class: 'btn btn--ghost', href: '/enviar' }, 'Enviar fotografia'));
        fields.append(h('p', { class: 'hint' }, 'Selecciona as imagens e indica a ordem e a legenda de cada uma.'),
          h('div', { class: 'frame-picker' }, photos.map((photo, index) => {
            const oldIndex = (payload.frames || []).findIndex((frame) => frame.photoId === photo.id);
            const old = payload.frames?.[oldIndex];
            const check = h('input', { type: 'checkbox', checked: !!old });
            const order = h('input', { type: 'number', min: 1, max: 100, value: old ? oldIndex + 1 : index + 1, 'aria-label': `Ordem: ${photo.title}` });
            const caption = h('textarea', { maxlength: 400, placeholder: 'Legenda (opcional)', 'aria-label': `Legenda: ${photo.title}` }); caption.value = old?.caption || '';
            inputs[photo.id] = { check, order, caption };
            return h('div', { class: 'frame-choice' }, h('img', { src: photo.thumb, alt: photo.title, loading: 'lazy' }), h('label', { class: 'frame-check' }, check, photo.title), order, caption);
          })));
      } catch (err) { report(err); return; }
    } else if (kind.value === 'event') {
      input('date', 'Data e hora de Moçambique (UTC+2)', 'datetime-local', payload.date ? new Date(new Date(payload.date).getTime() + 7200000).toISOString().slice(0,16) : '');
      input('location', 'Ponto de encontro', 'text', payload.location || ''); input('capacity', 'Vagas', 'number', payload.capacity || 20).min = 1;
    } else input('username', 'Username do fotógrafo', 'text', payload.username || '');
    button.disabled = false;
  }
  kind.addEventListener('change', paintFields);
  form.addEventListener('submit', async (event) => {
    event.preventDefault(); button.disabled = true;
    let payload;
    if (kind.value === 'story') payload = { frames: photos.filter((photo) => inputs[photo.id]?.check.checked)
      .sort((a,b) => Number(inputs[a.id].order.value) - Number(inputs[b.id].order.value))
      .map((photo) => ({ photoId: photo.id, caption: inputs[photo.id].caption.value })) };
    else { payload = Object.fromEntries(Object.entries(inputs).map(([key,node]) => [key,node.value])); if (kind.value === 'event') payload.date += '+02:00'; }
    try {
      await api(`/community/items${existing ? '/' + existing.id : ''}`, { method: existing ? 'PATCH' : 'POST', body: { kind: kind.value, title: title.value, intro: intro.value, payload } });
      toast(admin ? 'Conteúdo guardado.' : 'História enviada para curadoria.');
      location.hash = admin ? 'gestao' : 'historias'; render();
    } catch (err) { report(err); button.disabled = false; }
  });
  paintView(h('h2', {}, existing ? 'Editar publicação' : 'Partilha uma história'), form);
  await paintFields();
}
