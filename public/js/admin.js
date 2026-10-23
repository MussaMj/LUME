import { getLiveEvents, confirmDialog, $, $$, api, formatDate, h, initNav, photographer, toast, loginUrl } from './core.js';
import { openCinema } from './cinema.js';

const me = await initNav('admin');
if (me?.role !== 'admin') {
  location.replace(me ? '/?error=access-denied' : `${loginUrl()}&notice=admin-login`);
} else {
$('#app').hidden = false;

const view = $('#view');

async function refreshStats() {
  const s = await api('/admin/stats');
  $('#sPending').textContent = s.pending;
  $('#sApproved').textContent = s.approved;
  $('#sRejected').textContent = s.rejected;
  $('#sUsers').textContent = s.users;
  $('#tPending').textContent = s.pending || '';
}

$$('.tab').forEach((t) => t.addEventListener('click', () => { location.hash = t.dataset.tab; }));
window.addEventListener('hashchange', route);
refreshStats().catch(reportError);
route();

function reportError(err) { toast(err.message || 'Falha de rede. Tenta novamente.', { error: true }); }
const updates = getLiveEvents();
const refreshButton = h('button', { class: 'btn btn--ghost btn--small', hidden: true,
  onclick: () => { refreshButton.hidden = true; route(); } }, 'Actualizar lista');
$('.page-head').append(refreshButton);
updates.addEventListener('photos', () => {
  refreshStats().catch(reportError);
  refreshButton.hidden = false;
});
window.addEventListener('focus', () => refreshStats().catch(reportError));

function route() {
  const tab = location.hash.slice(1) || 'fila';
  $$('.tab').forEach((t) => {
    t.classList.toggle('is-active', t.dataset.tab === tab);
    t.setAttribute('aria-selected', String(t.dataset.tab === tab));
  });
  ({ fila: showQueue, semana: showFeatured, publicadas: () => showList('approved'), rejeitadas: () => showList('rejected') }[tab] || showQueue)().catch(reportError);
}

const sheetOf = (p) => h('dl', { class: 'sheet' },
  [['Autor', p.credit ? `${p.credit.name} (Unsplash)` : `${p.author.displayName} (@${p.author.username})`],
    ['Enviada por', p.credit ? `${p.author.displayName} (@${p.author.username})` : ''],
    ['E-mail', p.author.email], ['Categoria', p.categoryLabel || p.category],
    ['Local', `${p.city}, ${p.provinceName}`],
    ['Câmara', p.gear.camera], ['Objectiva', p.gear.lens], ['Telemóvel', p.gear.phone],
    ['Dimensões', `${p.width} × ${p.height}`],
    ['Enviada', formatDate(p.createdAt)]]
    .filter(([, v]) => v)
    .map(([k, v]) => [h('dt', {}, k), h('dd', {}, v)]));

/* ---------- Fila de moderação ---------- */
async function showQueue() {
  const { photos } = await api('/admin/queue');
  if (!photos.length) {
    view.replaceChildren(h('div', { class: 'wrap', style: 'padding-bottom:120px' },
      h('div', { class: 'empty' }, h('strong', {}, 'Fila vazia'), 'Nenhuma fotografia à espera de curadoria.')));
    return;
  }
  const selected = new Set();
  const count = h('span', { class: 'hint', 'aria-live': 'polite' }, '0 seleccionadas');
  const reason = h('textarea', { maxlength: 300, placeholder: 'Justificação para rejeição em lote (opcional)', 'aria-label': 'Justificação de rejeição em lote' });
  const approve = h('button', { class: 'btn btn--small', disabled: true, onclick: () => batch('approve') }, 'Aprovar seleccionadas');
  const reject = h('button', { class: 'btn btn--danger btn--small', disabled: true, onclick: () => batch('reject') }, 'Rejeitar seleccionadas');
  const update = () => { count.textContent = `${selected.size} seleccionadas`; approve.disabled = reject.disabled = !selected.size; };
  const select = (id, checked) => { checked ? selected.add(id) : selected.delete(id); update(); };
  const cards = photos.map((p, i) => reviewCard(p, photos, i, select));
  view.replaceChildren(
    h('div', { class: 'batch-tools wrap' }, count, approve, reject, reason),
    h('div', { class: 'queue' }, cards));
  async function batch(action) {
    approve.disabled = reject.disabled = true;
    try {
      await api('/admin/review-batch', { method: 'POST', body: { ids: [...selected], action, reason: reason.value.trim() } });
      toast(action === 'approve' ? 'Fotografias publicadas.' : 'Fotografias rejeitadas.');
      await Promise.all([showQueue(), refreshStats()]);
    } catch (err) { reportError(err); update(); }
  }
}

function reviewCard(p, list, index, select) {
  const reason = h('textarea', { maxlength: 300, placeholder: 'Motivo (opcional, visível para o autor), ex.: resolução baixa, imagem tremida…' });
  const rejectBox = h('div', { class: 'review__reject' }, reason,
    h('div', { class: 'review__actions' },
      h('button', { class: 'btn btn--danger btn--small', onclick: () => decide('reject') }, 'Confirmar rejeição'),
      h('button', { class: 'btn btn--ghost btn--small', onclick: () => rejectBox.classList.remove('is-open') }, 'Cancelar')));

  const card = h('article', { class: 'review' },
    h('button', { class: 'review__img', 'aria-label': 'Ver em ecrã inteiro', onclick: () => openCinema(list, index) },
      h('img', { src: p.src, alt: p.title, loading: 'lazy' })),
    h('div', { class: 'review__body' },
      h('label', { class: 'review__select' }, h('input', { type: 'checkbox', onchange: (e) => select(p.id, e.target.checked) }), 'Seleccionar fotografia'),
      h('p', { class: 'eyebrow' }, p.provinceName),
      h('h2', { class: 'review__title' }, p.title),
      p.description && h('p', { class: 'cinema__desc' }, p.description),
      sheetOf(p),
      h('div', { class: 'review__actions' },
        h('button', { class: 'btn', onclick: () => decide('approve') }, 'Aprovar e publicar'),
        h('button', { class: 'btn btn--ghost', onclick: () => { rejectBox.classList.add('is-open'); reason.focus(); } }, 'Rejeitar')),
      rejectBox));

  let busy = false;
  async function decide(action) {
    if (busy) return;
    busy = true;
    const buttons = $$('button', card);
    buttons.forEach((b) => b.disabled = true);
    try {
      await api(`/admin/photos/${p.id}/${action}`, { method: 'POST', body: action === 'reject' ? { reason: reason.value.trim() } : {} });
      select(p.id, false);
      $('input[type=checkbox]', card).disabled = true;
      card.classList.add('is-leaving');
      setTimeout(() => {
        card.remove();
        if (!$('.review')) showQueue().catch(reportError);
      }, 450);
      toast(action === 'approve' ? `“${p.title}” publicada.` : `“${p.title}” rejeitada.`);
      await refreshStats();
    } catch (err) { reportError(err); }
    finally { busy = false; buttons.forEach((b) => b.disabled = false); }
  }
  return card;
}

/* ---------- Publicadas / Rejeitadas ---------- */
async function showList(status) {
  const search = h('input', { type: 'search', placeholder: 'Procurar título, cidade ou autor…', 'aria-label': 'Procurar' });
  const grid = h('div', { class: 'picker' });
  view.replaceChildren(h('div', { class: 'toolbar' }, search), grid);

  let timer;
  search.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => load().catch(reportError), 250); });

  async function load() {
    const { photos } = await api(`/admin/photos?status=${status}&q=${encodeURIComponent(search.value.trim())}`);
    grid.replaceChildren(...(photos.length ? photos.map((p, i) => h('div', {},
      h('button', { class: 'picker__item', onclick: () => openCinema(photos, i) },
        h('img', { src: p.thumb, alt: '', loading: 'lazy' }), h('span', {}, p.title)),
      h('div', { class: 'pin__tools' },
        status === 'approved'
          ? h('button', { class: 'btn btn--ghost btn--small', onclick: () => moderate(p, 'reject').catch(reportError) }, 'Despublicar')
          : h('button', { class: 'btn btn--ghost btn--small', onclick: () => moderate(p, 'approve').catch(reportError) }, 'Publicar'),
        h('button', {
          class: 'btn btn--danger btn--small',
          onclick: async () => {
            if (!(await confirmDialog({ title: 'Apagar fotografia?', message: `“${p.title}” será apagada definitivamente. Esta acção não pode ser desfeita.`, confirmLabel: 'Apagar fotografia' }))) return;
            try {
              await api(`/admin/photos/${p.id}`, { method: 'DELETE' });
              toast('Apagada.');
              await Promise.all([refreshStats(), load()]);
            } catch (err) { reportError(err); }
          },
        }, 'Apagar')),
      status === 'rejected' && p.rejectReason && h('p', { class: 'pin__reason' }, p.rejectReason)))
      : [h('p', { class: 'hint' }, 'Sem resultados.')]));
  }

  async function moderate(p, action) {
    await api(`/admin/photos/${p.id}/${action}`, { method: 'POST', body: {} });
    toast(action === 'approve' ? 'Publicada.' : 'Despublicada.');
    await Promise.all([refreshStats(), load()]);
  }
  load().catch(reportError);
}

/* ---------- Foto da Semana ---------- */
async function showFeatured() {
  const [{ photos }, currentFeature] = await Promise.all([api('/admin/photos?status=approved&q='), api('/photos/featured')]);
  const current = currentFeature.photo ? currentFeature : null;
  const note = h('textarea', { maxlength: 280, placeholder: 'Nota curatorial (opcional), aparece por baixo do título.' });
  let chosen = null;
  const chosenLabel = h('p', { class: 'hint' }, 'Escolhe uma fotografia abaixo.');
  const confirmBtn = h('button', {
    class: 'btn', disabled: true,
    onclick: async () => {
      try {
        await api('/admin/featured', { method: 'POST', body: { photoId: chosen.id, note: note.value.trim() } });
        toast(`“${chosen.title}” é a nova Foto da Semana.`, { action: { label: 'Ver', href: '/descobrir' } });
        showFeatured();
      } catch (err) { toast(err.message, { error: true }); }
    },
  }, 'Definir como Foto da Semana');

  const search = h('input', { type: 'search', placeholder: 'Procurar…', 'aria-label': 'Procurar fotografias aprovadas' });
  const grid = h('div', { class: 'picker' });
  const paint = (list) => grid.replaceChildren(...list.map((p) => h('button', {
    class: `picker__item${current?.photo?.id === p.id ? ' is-current' : ''}`,
    onclick: (e) => {
      chosen = p;
      $$('.picker__item', grid).forEach((b) => b.style.outline = '');
      e.currentTarget.style.outline = '2px solid var(--text)';
      chosenLabel.textContent = `Seleccionada: “${p.title}” de ${photographer(p)}`;
      confirmBtn.disabled = false;
      confirmBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
    },
  }, h('img', { src: p.thumb, alt: '', loading: 'lazy' }), h('span', {}, `${p.title} · ${photographer(p)}`))));
  search.addEventListener('input', () => {
    const q = search.value.trim().toLowerCase();
    paint(photos.filter((p) => `${p.title} ${p.city} ${photographer(p)} ${p.provinceName}`.toLowerCase().includes(q)));
  });
  paint(photos);

  view.replaceChildren(
    current
      ? h('div', { class: 'feature-now' },
          h('img', { src: current.photo.thumb, alt: '' }),
          h('div', {},
            h('p', { class: 'label' }, `${current.source === 'automatic' ? 'Automática' : 'Escolha editorial'} · desde ${formatDate(current.featuredAt)}`),
            h('h2', { class: 'review__title', style: 'margin:10px 0' }, current.photo.title),
            h('p', { class: 'hint' }, `${photographer(current.photo)} · ${current.photo.city}, ${current.photo.provinceName}`),
            current.note && h('p', { class: 'cinema__desc', style: 'margin-top:12px' }, current.note)))
      : h('div', { class: 'wrap', style: 'padding-bottom:40px' }, h('p', { class: 'hint' }, 'Ainda não há Foto da Semana.')),
    h('div', { class: 'wrap', style: 'display:flex;flex-direction:column;gap:18px;max-width:720px;padding-bottom:40px' },
      h('p', { class: 'label' }, 'Nova escolha'), h('p', {class:'hint'}, 'A escolha editorial tem prioridade durante sete dias. Depois, a selecção automática volta a funcionar.'), chosenLabel, note, h('div', {}, confirmBtn)),
    h('div', { class: 'toolbar' }, search),
    grid);
}

}
