import { showSkeleton } from './skeleton.js';
import { confirmDialog, $, $$, api, h, icon, initNav, loginUrl, reveal, toast } from './core.js';
import { createMasonry } from './masonry.js';
import { openCinema, createAlbumDialog } from './cinema.js';

const me = await initNav('colecoes');
if (!me) location.replace(loginUrl());
else {
reveal();

const view = $('#view');

$$('.tab').forEach((t) => t.addEventListener('click', () => { location.hash = t.dataset.tab; }));
window.addEventListener('hashchange', route);

function setTab(name) {
  $$('.tab').forEach((t) => {
    t.classList.toggle('is-active', t.dataset.tab === name);
    t.setAttribute('aria-selected', String(t.dataset.tab === name));
  });
}

let routeRequest = 0;
route();
async function route() {
  const request = ++routeRequest;
  view.replaceChildren();
  const clearLoading = showSkeleton(view);
  const hash = location.hash.slice(1);
  try {
    if (hash === 'inspiradas') await showInspired(request);
    else {
      const album = hash.match(/^album-(\d+)$/);
      if (album) await showAlbum(Number(album[1]), request);
      else await showAlbums(request);
    }
  } catch(err) { if(request===routeRequest) { view.replaceChildren(h('p',{class:'hint'},'Não foi possível carregar. Tenta novamente.')); toast(err.message,{error:true}); } }
  finally { clearLoading(); }
}

/* ---------- Lista de álbuns ---------- */
async function showAlbums(request) {
  setTab('albuns');
  const { collections } = await api('/collections');
  if(request!==routeRequest)return;
  const grid = h('div', { class: 'albums' },
    h('button', { class: 'album album--new', onclick: createAlbum },
      h('span', { class: 'album__cover' }, icon('album')),
      h('span', { class: 'album__name' }, 'Novo álbum'),
      h('span', { class: 'album__count' }, 'Paisagens, retratos, o que quiseres')),
    collections.map((c) => h('a', { class: 'album', href: `#album-${c.id}` },
      h('span', { class: 'album__cover' }, c.cover && h('img', { src: c.cover, alt: '', loading: 'lazy' })),
      h('span', { class: 'album__name' }, c.name),
      h('span', { class: 'album__count' }, `${c.count} fotografia${c.count === 1 ? '' : 's'}`))));
  view.replaceChildren(grid);
}

function createAlbum() {
  createAlbumDialog((collection) => { location.hash = `album-${collection.id}`; });
}

/* ---------- Um álbum ---------- */
async function showAlbum(id, request) {
  setTab('albuns');
  let data;
  try {
    data = await api(`/collections/${id}`);
  } catch {
    if (request === routeRequest) location.hash = 'albuns';
    return;
  }
  if(request!==routeRequest)return;
  const { collection, photos } = data;
  const title = h('h2', { class: 'page-title', style: 'font-size:clamp(2rem,5vw,3.6rem)' }, collection.name);
  const gridEl = h('div');

  view.replaceChildren(
    h('div', { class: 'album-head' },
      h('div', {}, h('a', { class: 'link-arrow', href: '#albuns' }, '← Todos os álbuns'), h('div', { style: 'height:18px' }), title,
        h('p', { class: 'page-sub' }, `${photos.length} fotografia${photos.length === 1 ? '' : 's'}`)),
      h('div', { class: 'album-head__tools' },
        h('button', {
          class: 'btn btn--ghost btn--small',
          onclick: () => createAlbumDialog((updated) => {
            collection.name = updated.name;
            title.textContent = updated.name;
          }, { id, name: collection.name }),
        }, 'Mudar nome'),
        h('button', {
          class: 'btn btn--danger btn--small',
          onclick: async () => {
            if (!(await confirmDialog({ title: 'Apagar álbum?', message: `O álbum “${collection.name}” será apagado. As fotografias continuam no Descobrir.`, confirmLabel: 'Apagar álbum' }))) return;
            try {
              await api(`/collections/${id}`, { method: 'DELETE' });
              toast('Álbum apagado.');
              location.hash = 'albuns';
            } catch (err) { toast(err.message, { error: true }); }
          },
        }, 'Apagar álbum'))),
    h('div', { class: 'wrap' }, gridEl));
  const share = h('button', { class: 'btn btn--ghost btn--small', onclick: async () => {
    try {
      const { collection: updated } = await api(`/collections/${id}`, { method: 'PATCH', body: { isPublic: !collection.isPublic } });
      collection.isPublic = updated.isPublic;
      share.textContent = collection.isPublic ? 'Tornar privada' : 'Publicar como exposição';
      link.hidden = !collection.isPublic;
      toast(collection.isPublic ? 'Exposição pública. Qualquer pessoa com o link pode ver as fotografias aprovadas.' : 'Colecção privada.');
    } catch (err) { toast(err.message, { error: true }); }
  } }, collection.isPublic ? 'Tornar privada' : 'Publicar como exposição');
  const link = h('a', { href: `/exposicao/${id}`, class: 'link-arrow', hidden: !collection.isPublic }, 'Ver e partilhar exposição');
  $('.album-head__tools', view).append(share, link);

  if (!photos.length) {
    gridEl.append(h('div', { class: 'empty' }, h('strong', {}, 'Álbum vazio'),
      'Abre uma fotografia no Descobrir e usa “Guardar”.', h('br'), h('a', { class: 'btn', href: '/descobrir' }, 'Descobrir')));
    return;
  }
  const grid = createMasonry(gridEl, {
    onOpen: (i) => openCinema(grid.photos, i),
    cardExtras: (p) => h('div', { class: 'pin__tools' },
      h('button', {
        class: 'btn btn--ghost btn--small',
        onclick: async () => {
          await api(`/collections/${id}/photos/${p.id}`, { method: 'DELETE' });
          grid.remove(p.id);
          toast('Retirada do álbum.');
        },
      }, 'Retirar')),
  });
  grid.add(photos);
}

/* ---------- Inspirou-me ---------- */
async function showInspired(request) {
  setTab('inspiradas');
  const { photos } = await api('/me/inspired');
  if(request!==routeRequest)return;
  const gridEl = h('div');
  view.replaceChildren(h('div', { class: 'wrap' }, gridEl));
  if (!photos.length) {
    gridEl.append(h('div', { class: 'empty' }, h('strong', {}, 'Nada por aqui ainda'),
      'Toca no ícone de luz numa fotografia para a guardar aqui.', h('br'), h('a', { class: 'btn', href: '/descobrir' }, 'Descobrir')));
    return;
  }
  const grid = createMasonry(gridEl, { onOpen: (i) => openCinema(grid.photos, i) });
  grid.add(photos);
}

}
