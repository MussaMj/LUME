import { lockPageScroll, unlockPageScroll } from './scroll-lock.js';
import { $, api, formatDate, h, icon, initials, photographer, requireLogin, toast, pulse, getLiveEvents } from './core.js';

/* ==========================================================
   Cinema Lightbox — fotografia em ecrã inteiro + ficha técnica,
   autor, "Inspirou-me", álbuns e partilha direta.
   ========================================================== */

let state = { list: [], index: 0, onClose: null };
let root;
let entry = null;
let historyRequest = 0;
let immersive = false;
let zoomed = false;
let rotated = false;
let tapTimer;
let suppressClickUntil = 0;
let pan = { x: 0, y: 0 };
let photoTransition = null;
let transitionRequest = 0;
let transitioning = false;
let pagePhotos = [];
let viewTimer;
const viewed = new Set();
const isWidescreen = (photo) => photo && Number(photo.height) > 0 && Math.abs(Number(photo.width) / Number(photo.height) - 16 / 9) < .02;

function setInfo(open) {
  root.classList.toggle('is-info-open', open);
  $('.cinema__panel', root).inert = !open;
  $('.cinema__panel', root).setAttribute('aria-hidden', String(!open));
  $('.cinema__info-toggle', root).setAttribute('aria-expanded', String(open));
  if (open) $('.cinema__panel-close', root).focus();
}

function setImmersive(on) {
  immersive = on;
  if (on) setInfo(false);
  root.classList.toggle('is-immersive', on);
  $('.cinema__toolbar', root).inert = on;
  if (!on) rotated = false;
  updateImageTransform();
  updateControls();
}

function updateControls() {
  const photo = state.list[state.index];
  $('.cinema__heading', root).textContent = photo.title;
  $('.cinema__basic-title', root).textContent = photo.title;
  const author = $('.cinema__basic-author', root);
  author.textContent = photographer(photo);
  author.href = `/@${photo.author.username}`;
  $('.cinema__basic-place', root).textContent = [photo.city, photo.provinceName].filter(Boolean).join(' · ');
  $('.cinema__gesture-hint', root).hidden = state.list.length < 2;
  $('.cinema__counter', root).textContent = `${state.index + 1} / ${state.list.length}`;
  $('.cinema__rotate', root).hidden = !immersive || !isWidescreen(state.list[state.index]);
  $('.cinema__rotate', root).setAttribute('aria-pressed', String(rotated));
}

function updateImageTransform() {
  if (!root) return;
  const image = $('.cinema__img', root);
  image.style.transform = `translate(${pan.x}px, ${pan.y}px) rotate(${rotated ? 90 : 0}deg) scale(${zoomed ? 2 : 1})`;
  root.classList.toggle('is-zoomed', zoomed);
  image.setAttribute('aria-label', zoomed ? 'Fotografia ampliada. Duplo toque para reduzir.' : 'Fotografia. Toque para alternar o modo imersivo; duplo toque para ampliar.');
  if (rotated) {
    const stage = $('.cinema__stage', root);
    const ratio = state.list[state.index].width / state.list[state.index].height;
    const width = Math.min(stage.clientHeight, stage.clientWidth * ratio);
    image.style.width = `${width}px`; image.style.height = `${width / ratio}px`;
  } else { image.style.removeProperty('width'); image.style.removeProperty('height'); }
}

function build() {
  root = h('div', { class: 'cinema', id: 'cinema', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Visualizador de fotografias', 'aria-hidden': 'true' },
    h('header', { class: 'cinema__toolbar' },
      h('div', { class: 'cinema__summary' }, h('span', { class: 'cinema__heading' }), h('span', { class: 'cinema__counter', 'aria-live': 'polite' })),
      h('button', { class: 'cinema__btn cinema__info-toggle', 'aria-label': 'Informação da fotografia', 'aria-controls': 'cinema-details', 'aria-expanded': 'false', onclick: () => setInfo(!root.classList.contains('is-info-open')) }, icon('info')),
      h('button', { class: 'cinema__btn cinema__close', 'aria-label': 'Fechar (Esc)', onclick: closeCinema }, icon('close'))),
    h('div', { class: 'cinema__stage' }, h('img', { class: 'cinema__img', alt: '', tabindex: '0', role: 'button', draggable: false }), h('div', { class: 'cinema__loader' })),
    h('footer', { class: 'cinema__basic' },
      h('strong', { class: 'cinema__basic-title' }),
      h('div', { class: 'cinema__basic-meta' }, h('a', { class: 'cinema__basic-author' }), h('span', { class: 'cinema__basic-place' })),
      h('small', { class: 'cinema__gesture-hint' }, 'Desliza para cima ou para baixo para ver mais fotografias')),
    h('button', { class: 'cinema__btn cinema__prev', 'aria-label': 'Anterior', onclick: () => step(-1) }, icon('prev')),
    h('button', { class: 'cinema__btn cinema__next', 'aria-label': 'Seguinte', onclick: () => step(1) }, icon('next')),
    h('button', { class: 'cinema__btn cinema__rotate', hidden: true, 'aria-label': 'Rodar fotografia 16:9', onclick: () => { rotated = !rotated; zoomed = false; pan = { x: 0, y: 0 }; updateImageTransform(); updateControls(); } }, icon('rotate')),
    h('button', { class: 'cinema__scrim', 'aria-label': 'Fechar informação', tabindex: '-1', onclick: () => setInfo(false) }),
    h('aside', { class: 'cinema__panel', id: 'cinema-details', 'aria-label': 'Informação da fotografia', 'aria-hidden': 'true', inert: true }));
  document.body.append(root);
  new ResizeObserver(updateImageTransform).observe($('.cinema__stage', root));
  const image = $('.cinema__img', root);
  image.draggable = false;
  image.addEventListener('dragstart', (e) => e.preventDefault());
  $('.cinema__stage', root).addEventListener('click', () => {
    if (Date.now() < suppressClickUntil) return;
    if (tapTimer) {
      clearTimeout(tapTimer); tapTimer = null;
      zoomed = !zoomed; pan = { x: 0, y: 0 }; updateImageTransform();
    } else tapTimer = setTimeout(() => { tapTimer = null; setImmersive(!immersive); }, 280);
  });
  image.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setImmersive(!immersive); }
    if (e.key.toLowerCase() === 'z') { zoomed = !zoomed; pan = { x: 0, y: 0 }; updateImageTransform(); }
  });
  document.addEventListener('keydown', (e) => {
    if (!root.classList.contains('is-open') || e.target.matches('input, textarea')) return;
    if (e.key === 'Escape') {
      if (root.classList.contains('is-info-open')) { setInfo(false); $('.cinema__info-toggle', root).focus(); }
      else if (zoomed) { zoomed = false; pan = { x: 0, y: 0 }; updateImageTransform(); }
      else if (immersive) { setImmersive(false); $('.cinema__close', root).focus(); }
      else closeCinema();
    }
    if (e.key === 'ArrowLeft') step(-1);
    if (e.key === 'ArrowRight') step(1);
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); step(e.key === 'ArrowDown' ? 1 : -1); }
    if (e.key.toLowerCase() === 'i') { setImmersive(false); setInfo(!root.classList.contains('is-info-open')); }
  });
  let drag = null;
  const stage = $('.cinema__stage', root);
  root.addEventListener('pointerdown', (e) => {
    if (!e.target.closest('.cinema__stage, .cinema__basic') || e.target.closest('a, button')) return;
    if (e.isPrimary === false) return;
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
    stage.setPointerCapture(e.pointerId);
  });
  root.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id || !zoomed) return;
    const limitX = stage.clientWidth / 2, limitY = stage.clientHeight / 2;
    pan = { x: Math.max(-limitX, Math.min(limitX, drag.panX + e.clientX - drag.x)), y: Math.max(-limitY, Math.min(limitY, drag.panY + e.clientY - drag.y)) };
    updateImageTransform();
  });
  root.addEventListener('pointerup', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (Math.hypot(dx, dy) > 12) {
      suppressClickUntil = Date.now() + 400; clearTimeout(tapTimer); tapTimer = null;
      if (!zoomed && Math.abs(dy) > 50 && Math.abs(dy) > Math.abs(dx) * 1.3) step(dy < 0 ? 1 : -1);
    }
    drag = null;
  });
  root.addEventListener('pointercancel', () => { drag = null; });
  let wheelDistance = 0, lastWheel = 0, wheelChangedAt = 0;
  root.addEventListener('wheel', (e) => {
    if (!e.target.closest('.cinema__stage, .cinema__basic')) return;
    if (zoomed || e.ctrlKey || state.list.length < 2) return;
    e.preventDefault();
    const now = Date.now();
    if (now - wheelChangedAt < 650) return;
    if (now - lastWheel > 180 || Math.sign(e.deltaY) !== Math.sign(wheelDistance)) wheelDistance = 0;
    lastWheel = now;
    wheelDistance += e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? stage.clientHeight : 1);
    if (Math.abs(wheelDistance) >= 60) { step(wheelDistance > 0 ? 1 : -1); wheelDistance = 0; wheelChangedAt = now; }
  }, { passive: false });
}

export function openCinema(list, index = 0, { onClose, restore = false } = {}) {
  if (!list[index]) return;
  if (list.length === 1 && pagePhotos.length > 1) {
    const contextIndex = pagePhotos.findIndex(photo => photo.id === list[index].id);
    if (contextIndex !== -1) { list = pagePhotos; index = contextIndex; }
  }
  if (!root) build();
  if (!root.classList.contains('is-open')) {
    if (restore) entry = history.state?.lumeCinema || { scrollY: window.scrollY, scrollX: window.scrollX };
    else {
      const base = new URL(location.href);
      base.searchParams.delete('foto');
      entry = { scrollY: window.scrollY, scrollX: window.scrollX };
      // A direct photo link also gets a same-page base entry so Back closes the modal.
      if (location.search !== base.search) history.replaceState(history.state, '', base);
      const url = new URL(base);
      url.searchParams.set('foto', list[index].id);
      history.pushState({ ...history.state, lumeCinema: { ...entry, photoId: list[index].id } }, '', url);
    }
  }
  state = { list: [...list], index, onClose };
  root.classList.add('is-open');
  root.setAttribute('aria-hidden', 'false');
  lockPageScroll('cinema');
  root.classList.toggle('is-single', list.length < 2);
  render();
  $('.cinema__close', root).focus();
}

// Preserve the story/exhibition sequence when opening or refreshing a shared photo URL.
export function setCinemaPhotos(photos) {
  pagePhotos = photos;
  if (!root?.classList.contains('is-open')) return;
  const index = photos.findIndex(photo => photo.id === state.list[state.index]?.id);
  if (index !== -1) { state.list = [...photos]; state.index = index; root.classList.toggle('is-single', photos.length < 2); render(); }
}

function hideCinema() {
  if (!root?.classList.contains('is-open')) return;
  clearTimeout(viewTimer);
  transitionRequest++; transitioning = false; photoTransition?.cancel();
  clearTimeout(tapTimer); tapTimer = null; setImmersive(false); setInfo(false);
  root.classList.remove('is-open');
  root.setAttribute('aria-hidden', 'true');
  unlockPageScroll('cinema');
  if (entry) window.scrollTo({ left: entry.scrollX, top: entry.scrollY, behavior: 'instant' });
  state.onClose?.();
}

export function closeCinema() {
  if (!root?.classList.contains('is-open')) return;
  hideCinema();
  if (history.state?.lumeCinema) history.back();
  else {
    const url = new URL(location.href);
    url.searchParams.delete('foto');
    history.replaceState(history.state, '', url);
  }
}

window.addEventListener('popstate', async () => {
  const request = ++historyRequest;
  const id = Number(new URLSearchParams(location.search).get('foto'));
  if (!id || !history.state?.lumeCinema) { hideCinema(); return; }
  const index = state.list.findIndex((photo) => photo.id === id);
  if (index !== -1) openCinema(state.list, index, { restore: true });
  else {
    try {
      const { photo } = await api(`/photos/${id}`);
      if (request === historyRequest) openCinema([photo], 0, { restore: true });
    } catch (err) { hideCinema(); toast(err.message, { error: true }); }
  }
});

// Restore photo links on every page using Cinema, including profiles and collections.
const initialPhotoId = Number(new URLSearchParams(location.search).get('foto'));
if (initialPhotoId) {
  api(`/photos/${initialPhotoId}`).then(({ photo }) => {
    if (Number(new URLSearchParams(location.search).get('foto')) === initialPhotoId) openCinema([photo]);
  }).catch(() => {});
}

async function step(dir, targetIndex) {
  if (state.list.length < 2 || transitioning) return;
  const request = ++transitionRequest;
  transitioning = true;
  const index = targetIndex ?? (state.index + dir + state.list.length) % state.list.length;
  // Load before moving the current photograph so a slow connection never leaves an empty frame.
  const preload = new Image();
  const loaded = await new Promise((resolve) => {
    const timeout = setTimeout(() => finish(false), 5000);
    function finish(ok) { clearTimeout(timeout); preload.onload = preload.onerror = null; resolve(ok); }
    preload.onload = () => finish(true);
    preload.onerror = () => finish(false);
    preload.src = state.list[index].src;
  });
  if (request !== transitionRequest || !root.classList.contains('is-open')) return;
  if (!loaded) {
    transitioning = false;
    toast('Esta fotografia está a demorar a carregar. Tenta novamente.', { error: true });
    return;
  }
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!reduced) {
    photoTransition = $('.cinema__img', root).animate([
      { translate: '0 0', opacity: 1 },
      { translate: `0 ${-dir * 48}px`, opacity: 0 },
    ], { duration: 200, easing: 'ease-in-out', fill: 'forwards' });
    try { await photoTransition.finished; } catch { return; }
  }
  if (request !== transitionRequest) return;
  state.index = index;
  render(reduced ? 0 : dir);
}

function render(direction = 0) {
  const request = ++transitionRequest;
  photoTransition?.cancel();
  transitioning = !!direction;
  const photo = state.list[state.index];
  const img = $('.cinema__img', root);
  rotated = false; zoomed = false; pan = { x: 0, y: 0 };
  updateImageTransform(); updateControls();
  root.classList.add('is-loading');
  img.classList.remove('is-ready');

  const next = new Image();
  next.onload = next.onerror = () => {
    if (state.list[state.index] !== photo) return;
    photo.width = next.naturalWidth || photo.width;
    photo.height = next.naturalHeight || photo.height;
    updateControls();
    img.src = photo.src;
    img.alt = `${photo.title}, ${photo.city}, ${photo.provinceName}`;
    root.classList.remove('is-loading');
    requestAnimationFrame(() => {
      if (request !== transitionRequest || !root.classList.contains('is-open')) return;
      img.classList.add('is-ready');
      clearTimeout(viewTimer);
      if (!viewed.has(photo.id) && (!photo.status || photo.status === 'approved')) viewTimer = setTimeout(() => {
        if (request !== transitionRequest || !root.classList.contains('is-open')) return;
        viewed.add(photo.id);
        api(`/photos/${photo.id}/view`, { method:'POST', body:{} }).catch(()=>viewed.delete(photo.id));
      }, 800);
      if (!direction) return;
      photoTransition = img.animate([
        { translate: `0 ${direction * 64}px`, opacity: 0 },
        { translate: '0 0', opacity: 1 },
      ], { duration: 380, easing: 'cubic-bezier(.22,.61,.36,1)' });
      photoTransition.finished.finally(() => { if (request === transitionRequest) transitioning = false; }).catch(() => {});
    });
  };
  next.src = photo.src;

  // Pré-carrega a seguinte
  const after = state.list[(state.index + 1) % state.list.length];
  if (after && after !== photo) new Image().src = after.src;

  const url = new URL(location.href);
  url.searchParams.set('foto', photo.id);
  history.replaceState({ ...history.state, lumeCinema: { ...entry, photoId: photo.id } }, '', url);

  $('.cinema__panel', root).replaceChildren(panel(photo));
  if (direction) $('.cinema__panel', root).scrollTop = 0;
  if (!photo.status || photo.status === 'approved') void loadRelated(photo, request);
}

async function loadRelated(photo, request) {
  try {
    const { label, photos } = await api(`/photos/${photo.id}/related`);
    if (request !== transitionRequest || !root.classList.contains('is-open') || !photos.length) return;
    $('.cinema__info', root).append(h('section', {class:'cinema__related'}, h('h3',{},label),
      h('div',{class:'cinema__related-grid'}, photos.map(item=>h('button', {
        'aria-label':`Ver ${item.title}, de ${item.author.displayName}`, onclick:()=>{
          if (transitioning) return;
          let index=state.list.findIndex(p=>p.id===item.id);
          if(index===-1) { index=state.list.length; state.list.push(item); root.classList.remove('is-single'); }
          void step(1,index);
        },
      },h('img',{src:item.thumb,alt:item.title,loading:'lazy',decoding:'async'}))))));
  } catch { /* Recommendations never block the photograph or its details. */ }
}

function panel(photo) {
  const { author, gear } = photo;
  const sheet = [
    ['Local', `${photo.city}, ${photo.provinceName}`],
    ['Câmara', gear.camera],
    ['Objectiva', gear.lens],
    ['Telemóvel', gear.phone],
    ['Publicada', formatDate(photo.createdAt)],
  ].filter(([, v]) => v);

  const published = !photo.status || photo.status === 'approved';

  return h('div', { class: 'cinema__info' },
    h('button', { class: 'cinema__btn cinema__panel-close', 'aria-label': 'Fechar informação', onclick: () => { setInfo(false); $('.cinema__info-toggle', root).focus(); } }, icon('close')),
    h('p', { class: 'eyebrow' }, icon('pin', 'icon icon--inline'), ` ${photo.provinceName}`),
    h('h2', { class: 'cinema__title' }, photo.title),
    photo.description && h('p', { class: 'cinema__desc' }, photo.description),
    photo.behindNote && h('details', { class: 'behind-photo', open: true },
      h('summary', {}, 'Por trás desta fotografia'), h('p', {}, photo.behindNote)),

    // Profile navigation always stays inside Lume; external attribution is a separate link.
    h('a', { class: 'artist', href: `/@${author.username}` },
      h('span', { class: 'artist__avatar' }, initials(author.displayName)),
      h('span', { class: 'artist__text' },
        h('span', { class: 'artist__name' }, author.displayName),
        h('span', { class: 'artist__handle' }, `@${author.username}`))),
    photo.credit && h('div', { class: 'artist__social' },
      h('a', { href: photo.credit.url, target: '_blank', rel: 'noopener' }, `Fotografia: ${photo.credit.name} (Unsplash)`),
      h('a', { href: photo.credit.sourceUrl, target: '_blank', rel: 'noopener' }, 'Ver original')),
    !photo.credit && (author.instagram || author.behance) && h('div', { class: 'artist__social' },
      author.instagram && h('a', { href: author.instagram, target: '_blank', rel: 'noopener' }, 'Instagram'),
      author.behance && h('a', { href: author.behance, target: '_blank', rel: 'noopener' }, 'Behance')),

    h('dl', { class: 'sheet' }, sheet.map(([k, v]) => [h('dt', {}, k), h('dd', {}, v)])),

    published && h('div', { class: 'cinema__actions' },
      inspireButton(photo, true),
      h('button', { class: 'action', onclick: (e) => { pulse(e.currentTarget); void openSaveSheet(photo); } }, icon('album'), h('span', {}, 'Guardar'), h('span',{class:'action__count',dataset:{savedCount:photo.id}},String(photo.savedCount || 0)))),
    published && h('div', { class: 'cinema__actions cinema__share' },
      h('span', { class: 'label' }, 'Partilhar'),
      h('span', { class: 'cinema__divider' }),
      h('button', { class: 'action action--icon', 'aria-label': 'Partilhar no WhatsApp', title: 'WhatsApp', onclick: () => shareWhatsApp(photo) }, icon('whatsapp')),
      h('button', { class: 'action action--icon', 'aria-label': 'Copiar link', title: 'Copiar link', onclick: () => copyLink(photo) }, icon('link'))),

    state.list.length > 1 && h('p', { class: 'cinema__count' }, `${state.index + 1} / ${state.list.length}`));
}

/* ---------- "Inspirou-me" ---------- */
function inspireButton(photo, withCount = false) {
  return h('button', {
    class: `action action--inspire${photo.inspired ? ' is-on' : ''}`,
    'aria-pressed': String(!!photo.inspired),
    dataset: { inspire: photo.id },
    onclick: () => toggleInspired(photo),
  }, icon('inspired'), h('span', {}, 'Inspirou-me'),
  withCount && h('span', { class: 'action__count', dataset: { inspireCount: photo.id } }, photo.inspiredCount || ''));
}

const inspirePending = new Set();
const inspireState = new Map();
export async function toggleInspired(photo) {
  if (inspirePending.has(photo.id)) return;
  inspirePending.add(photo.id);
  try {
    if (!(await requireLogin('Entra na tua conta para guardar o que te inspira.'))) return;
    const previous = inspireState.get(photo.id) || { on:!!photo.inspired, count:Number(photo.inspiredCount)||0 };
    const on = !previous.on;
    sync(photo,on,previous.count+(on?1:-1));
    document.querySelectorAll(`[data-inspire="${photo.id}"]`).forEach(pulse);
    try {
      const res = await api(`/photos/${photo.id}/inspired`, {method:on?'POST':'DELETE'});
      sync(photo,res.inspired,res.inspiredCount);
      if(on) toast('Guardada nas tuas inspirações.',{action:{label:'Ver',href:'/colecoes#inspiradas'}});
    } catch(err) { sync(photo,previous.on,previous.count); toast(err.message,{error:true}); }
  } finally { inspirePending.delete(photo.id); }
}

function sync(photo, on, count) {
  inspireState.set(photo.id,{on,count});
  photo.inspired = on;
  photo.inspiredCount = Math.max(0, count);
  document.querySelectorAll(`[data-inspire="${photo.id}"]`).forEach((b) => {
    b.classList.toggle('is-on', on);
    b.setAttribute('aria-pressed', String(on));
  });
  document.querySelectorAll(`[data-inspire-count="${photo.id}"]`).forEach((c) => { c.textContent = String(photo.inspiredCount); });
}

/* ---------- Guardar em álbum privado ---------- */
export function createAlbumDialog(onCreated, album = null) {
  const editing = !!album;
  const input = h('input', { id: 'album-name', type: 'text', placeholder: 'Ex.: Luz de Moçambique', maxlength: 60, required: true, autocomplete: 'off' });
  input.value = album?.name || '';
  const submitLabel = editing ? 'Guardar alterações' : 'Criar álbum';
  const submit = h('button', { class: 'btn', type: 'submit' }, submitLabel);
  const modal = h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': editing ? 'Mudar nome do álbum' : 'Novo álbum' },
    h('div', { class: 'modal__card' },
      h('div', { class: 'modal__head' }, h('h3', {}, editing ? 'Mudar nome do álbum' : 'Novo álbum'), h('button', { class: 'modal__close', 'aria-label': 'Fechar', onclick: close }, icon('close'))),
      h('p', { class: 'modal__sub' }, 'Dá um nome à tua selecção de fotografias.'),
      h('form', { class: 'album-form', onsubmit: async (e) => {
        e.preventDefault(); if (!input.value.trim()) { input.focus(); return; }
        submit.disabled = true; submit.textContent = editing ? 'A guardar…' : 'A criar…';
        try { const { collection } = await api(editing ? `/collections/${album.id}` : '/collections', { method: editing ? 'PATCH' : 'POST', body: { name: input.value.trim() } }); close(); onCreated(collection || { ...album, name: input.value.trim() }); toast(editing ? 'Nome do álbum actualizado.' : 'Álbum criado.'); }
        catch (err) { toast(err.message, { error: true }); }
        finally { submit.disabled = false; submit.textContent = submitLabel; }
      } }, h('label', { for: 'album-name' }, 'Nome do álbum'), input, h('small', {}, 'Até 60 caracteres. Podes alterar o nome mais tarde.'), submit)));
  const focus = document.activeElement;
  function close() { modal.remove(); unlockPageScroll('album-create'); document.removeEventListener('keydown', key, true); focus?.focus(); }
  function key(e) { if(e.key === 'Escape') { e.stopImmediatePropagation(); close(); } }
  modal.addEventListener('click', e => { if(e.target === modal) close(); });
  document.body.append(modal); lockPageScroll('album-create');
  document.addEventListener('keydown', key, true);
  requestAnimationFrame(() => { modal.classList.add('is-open'); input.focus(); });
}

export async function openSaveSheet(photo) {
  if (!(await requireLogin('Entra na tua conta para criar álbuns.'))) return;
  const selected = new Set(), original = new Set();
  let collections = [], busy = false;
  const list = h('ul', { class: 'sheet-list' });
  const confirm = h('button', { class: 'btn', disabled: true, onclick: async () => {
    if (busy) return;
    busy = true; confirm.disabled = true; confirm.textContent = 'A guardar…';
    try {
      for (const c of collections) {
        const on = selected.has(c.id);
        if (on === original.has(c.id)) continue;
        await api(`/collections/${c.id}/photos${on ? '' : `/${photo.id}`}`, { method: on ? 'POST' : 'DELETE', ...(on ? { body: { photoId: photo.id } } : {}) });
        c.count = Math.max(0, (c.count || 0) + (on ? 1 : -1));
        if (on) original.add(c.id); else original.delete(c.id);
      }
      toast('Selecção de álbuns guardada.'); busy = false; close();
    } catch (err) { toast(err.message, { error: true }); }
    finally { busy = false; confirm.textContent = 'Confirmar'; update(); }
  } }, 'Confirmar');
  const modal = h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Guardar em álbum' },
    h('div', { class: 'modal__card' },
      h('div', { class: 'modal__head' }, h('h3', {}, 'Guardar em álbum'), h('button', { class: 'modal__close', 'aria-label': 'Fechar', onclick: close }, icon('close'))),
      h('p', { class: 'modal__sub' }, 'Selecciona os álbuns e confirma para guardar. Os teus álbuns são privados.'), list,
      h('button', { class: 'btn btn--ghost album-create-link', onclick: () => createAlbumDialog((collection) => { collections.push({ ...collection, count: 0 }); selected.add(collection.id); paint(); }) }, 'Criar novo álbum'),
      h('div', { class: 'album-save-actions' }, h('button', { class: 'btn btn--ghost', onclick: close }, 'Cancelar'), confirm)));
  const focus = document.activeElement;
  function close() { if (busy) return; modal.remove(); unlockPageScroll('album-save'); document.removeEventListener('keydown', key, true); focus?.focus(); }
  function key(e) { if (e.key === 'Escape') { e.stopImmediatePropagation(); close(); } }
  function update() { confirm.disabled = busy || !collections.length || (selected.size === original.size && [...selected].every(id => original.has(id))); }
  function paint() {
    list.replaceChildren(...(collections.length ? collections.map(c => h('li', {}, h('button', {
      class: `sheet-list__item${selected.has(c.id) ? ' is-on' : ''}`, dataset:{album:c.id}, 'aria-pressed': String(selected.has(c.id)), disabled: busy,
      onclick: () => { if(busy) return; if(selected.has(c.id)) selected.delete(c.id); else selected.add(c.id); paint(); pulse(list.querySelector(`[data-album="${c.id}"]`)); },
    }, c.cover ? h('img', { src: c.cover, alt: '' }) : h('span', { class: 'sheet-list__empty' }, icon('album')),
    h('span', { class: 'sheet-list__name' }, c.name, h('small', {}, `${(c.count || 0) + Number(selected.has(c.id)) - Number(original.has(c.id))} fotografias`)), icon('check', 'icon sheet-list__check')))) : [h('li', { class: 'sheet-list__none' }, 'Cria o teu primeiro álbum para guardar esta fotografia.')]));
    update();
  }
  modal.addEventListener('click', e => { if(e.target === modal) close(); });
  document.body.append(modal); lockPageScroll('album-save'); document.addEventListener('keydown', key, true);
  requestAnimationFrame(() => modal.classList.add('is-open'));
  try { ({ collections } = await api(`/collections?photo=${photo.id}`)); for(const c of collections) if(c.hasPhoto) { selected.add(c.id); original.add(c.id); } paint(); }
  catch(err) { toast(err.message, { error: true }); }
}

/* ---------- Partilha ---------- */
const photoUrl = (photo) => `${location.origin}/foto/${photo.id}`;

export function shareWhatsApp(photo) {
  const text = `“${photo.title}” por ${photographer(photo)}, ${photo.city} (${photo.provinceName})\n${photoUrl(photo)}`;
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
}

export async function copyLink(photo) {
  try {
    await navigator.clipboard.writeText(photoUrl(photo));
    toast('Link copiado.');
  } catch {
    toast(photoUrl(photo));
  }
}

// Cria um cartão vertical 1080×1920 pronto para as Stories do Instagram
async function storyCard(photo) {
  const W = 1080, H = 1920;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#0d0d0c';
  ctx.fillRect(0, 0, W, H);

  const img = await new Promise((resolve, reject) => {
    const i = new Image();
    i.crossOrigin = 'anonymous';
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = photo.src;
  });

  // Fotografia: ocupa a largura com margens, sem cortar
  const pad = 90;
  const maxW = W - pad * 2, maxH = 1300;
  const r = Math.min(maxW / img.width, maxH / img.height);
  const w = img.width * r, hgt = img.height * r;
  const x = (W - w) / 2, y = 260 + (maxH - hgt) / 2;
  ctx.drawImage(img, x, y, w, hgt);

  await document.fonts.ready;
  ctx.fillStyle = '#ece8e1';
  ctx.font = '600 44px "Inter Tight", sans-serif';
  ctx.letterSpacing = '18px';
  ctx.fillText('LUME', pad, 170);
  ctx.letterSpacing = '0px';
  ctx.font = '200 26px "Inter Tight", sans-serif';
  ctx.fillStyle = '#8f8a82';
  ctx.fillText('O Brilho de Moçambique', pad, 215);

  ctx.font = '300 30px Manrope, sans-serif';
  ctx.fillStyle = '#d4a373';
  ctx.fillText(`${photo.city.toUpperCase()} · ${photo.provinceName.toUpperCase()}`, pad, 1660);
  ctx.fillStyle = '#ece8e1';
  ctx.font = '200 76px "Inter Tight", sans-serif';
  ctx.fillText(photo.title, pad, 1750, W - pad * 2);
  ctx.fillStyle = '#8f8a82';
  ctx.font = '300 32px Manrope, sans-serif';
  ctx.fillText(photo.credit ? `por ${photo.credit.name} · Unsplash` : `por ${photo.author.displayName} · @${photo.author.username}`, pad, 1810, W - pad * 2);

  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
}

export async function shareStory(photo) {
  toast('A preparar a imagem para Stories…', { duration: 8000 });
  try {
    const blob = await storyCard(photo);
    const file = new File([blob], `lume-${photo.id}-story.jpg`, { type: 'image/jpeg' });
    // No telemóvel abre a folha de partilha nativa → Instagram → Stories
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: photo.title, text: photoUrl(photo) });
      toast('Escolhe Instagram → Stories.');
      return;
    }
    const a = h('a', { href: URL.createObjectURL(blob), download: file.name });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    toast('Imagem para Stories descarregada. Publica-a a partir do Instagram no telemóvel.', { duration: 6000 });
  } catch (err) {
    if (err?.name === 'AbortError') return;
    toast('Não foi possível preparar a imagem.', { error: true });
  }
}

getLiveEvents().addEventListener('engagement', event => {
  try {
    const {photoId,inspiredCount,savedCount} = JSON.parse(event.data);
    document.querySelectorAll(`[data-saved-count="${photoId}"]`).forEach(node=>{node.textContent=String(savedCount || 0);});
    state.list.filter(photo=>photo.id===photoId).forEach(photo=>{photo.savedCount=savedCount || 0;});
    if(inspirePending.has(photoId))return;
    document.querySelectorAll(`[data-inspire-count="${photoId}"]`).forEach(node=>{node.textContent=String(inspiredCount);});
    const known=inspireState.get(photoId);
    if(known)inspireState.set(photoId,{...known,count:inspiredCount});
    state.list.filter(photo=>photo.id===photoId).forEach(photo=>{photo.inspiredCount=inspiredCount;});
  } catch { /* Reconnect will revalidate data on the next gallery load. */ }
});
