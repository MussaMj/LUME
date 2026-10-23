import { getLiveEvents, $, api, h, initNav, initParallax, PROVINCES, reveal, toast, requireLogin } from './core.js';
import { createMasonry } from './masonry.js';
import { openCinema } from './cinema.js';

initNav('descobrir');
initParallax();
reveal();

const params = new URLSearchParams(location.search);
const state = {
  province: PROVINCES.some((p) => p.id === params.get('provincia')) ? params.get('provincia') : '',
  category: params.get('category') || '', mood: params.get('mood') || '', following: params.get('following') === '1',
  page: 0,
  hasMore: true,
  loading: false,
  // A mistura muda a cada visita, mas mantém-se estável durante a sessão
  seed: Number(sessionStorage.getItem('lume-seed')) || (() => {
    const s = Math.floor(Math.random() * 1e6) + 1;
    try { sessionStorage.setItem('lume-seed', s); } catch {}
    return s;
  })(),
};
let feedGeneration = 0;
let counts = {};
let mapPreviews = {};
let mapPreviewTimer;
let mapPreviewFrame;

/* ---------- Foto da Semana ---------- */
async function loadFeatured() {
  const { photo, note } = await api('/photos/featured');
  if (!photo) {
    $('#featured').classList.add('featured--empty');
    $('#featuredOpen').hidden = true;
    $('#featuredImg').removeAttribute('src');
    $('#featuredTitle').textContent = '';
    $('#featuredBy').replaceChildren();
    $('#featuredNote').textContent = '';
    $('#featuredPlace').textContent = '';
    $('.featured__badge').textContent = 'LUME · O Brilho de Moçambique';
    return;
  }
  $('#featured').classList.remove('featured--empty');
  $('.featured__badge').textContent = 'Foto da Semana';
  const img = $('#featuredImg');
  img.addEventListener('load', () => img.classList.add('is-loaded'), { once: true });
  if (photo.width > 640 && photo.thumb !== photo.src) {
    img.srcset = `${photo.thumb} 640w, ${photo.src} ${photo.width}w`;
    img.sizes = '(max-width: 700px) 100vw, 65vw';
  } else { img.removeAttribute('srcset'); img.removeAttribute('sizes'); }
  img.src = photo.src;
  img.alt = `${photo.title}, ${photo.city}`;
  $('#featuredTitle').textContent = photo.title;
  $('#featuredBy').replaceChildren('por ', h('a', { href: `/@${photo.author.username}` }, photo.author.displayName),
    photo.credit ? ` · Fotografia: ${photo.credit.name} / Unsplash` : '');
  $('#featuredNote').textContent = note;
  $('#featuredPlace').textContent = `${photo.city} · ${photo.provinceName}`;
  const btn = $('#featuredOpen');
  btn.hidden = false;
  btn.onclick = () => openCinema([photo, ...masonry.photos.filter((item) => item.id !== photo.id)], 0);
}

/* ---------- Mapa ---------- */
const tip = $('#mapTip');
const countLabel = (n = 0) => `${n} fotografia${n === 1 ? '' : 's'}`;

async function buildMap() {
  const [map, stats, previews] = await Promise.all([fetch('/data/mapa-mocambique.json').then((r) => r.json()), api('/photos/stats'), api('/photos/map-preview')]);
  mapPreviews = previews.provinces;
  counts = stats;
  const svg = $('#map');
  svg.setAttribute('viewBox', map.viewBox);
  const NS = 'http://www.w3.org/2000/svg';
  const el = (tag, attrs) => {
    const node = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    return node;
  };

  const labels = el('g', { 'aria-hidden': 'true' });
  map.provinces.forEach((p) => {
    const n = counts[p.id] || 0;
    const isCity = p.id === 'maputo-cidade';
    const path = el('path', {
      d: p.d,
      class: `map__province${n ? '' : ' is-empty'}`,
      'data-id': p.id,
      tabindex: isCity ? '-1' : '0',
      role: 'button',
      'aria-label': `${p.name}, ${countLabel(n)}`,
    });
    svg.append(path);

    if (isCity) {
      // A cidade é minúscula à escala do país: marcador clicável
      const dot = el('circle', { cx: p.cx, cy: p.cy, r: 5, class: 'map__city', 'data-id': p.id, tabindex: '0', role: 'button', 'aria-label': `${p.name}, ${countLabel(n)}` });
      labels.append(el('line', { x1: p.cx + 5, y1: p.cy, x2: p.cx + 22, y2: p.cy, stroke: 'rgba(236,232,225,0.4)', 'stroke-width': 0.6 }));
      const t = el('text', { x: p.cx + 26, y: p.cy + 3, class: 'map__label', 'data-label': p.id });
      t.textContent = 'Maputo Cidade';
      labels.append(t);
      svg.append(dot);
    } else {
      const dy = p.id === 'maputo-provincia' ? -14 : 3;
      const t = el('text', { x: p.cx, y: p.cy + dy, 'text-anchor': 'middle', class: 'map__label', 'data-label': p.id });
      t.textContent = p.name.replace(' Província', '');
      labels.append(t);
    }
  });
  svg.append(labels);

  svg.addEventListener('click', (e) => {
    const id = e.target.dataset?.id;
    if (id) { select(state.province === id ? '' : id); showMapPreview(id,e.target); }
  });
  svg.addEventListener('keydown', (e) => {
    const id = e.target.dataset?.id;
    if (id && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      select(state.province === id ? '' : id);
    }
  });
  svg.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') return;
    const id = e.target.dataset?.id;
    if (!id) return hideMapPreview();
    cancelAnimationFrame(mapPreviewFrame);
    const target=e.target, point={x:e.clientX,y:e.clientY};
    mapPreviewFrame=requestAnimationFrame(()=>showMapPreview(id,target,point));
  });
  svg.addEventListener('pointerleave', hideMapPreview);
  svg.addEventListener('focusin', e => { const id=e.target.dataset?.id; if(id) showMapPreview(id,e.target); });
  svg.addEventListener('focusout', hideMapPreview);
  svg.addEventListener('keydown',e=>{if(e.key==='Escape')hideMapPreview();});

  const chips = $('#chips');
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  chips.append(
    h('button', { class: 'chip', dataset: { id: '' }, onclick: () => select('') }, 'Todo o país', h('small', {}, total)),
    ...PROVINCES.map((p) => h('button', { class: 'chip', dataset: { id: p.id }, onclick: () => select(state.province === p.id ? '' : p.id) },
      p.name, h('small', {}, counts[p.id] || 0))),
  );
  paintSelection();
}

function hideMapPreview() {
  cancelAnimationFrame(mapPreviewFrame);
  clearTimeout(mapPreviewTimer); tip.classList.remove('is-visible'); tip.setAttribute('aria-hidden','true');
}
function showMapPreview(id, target, point) {
  const province=PROVINCES.find(p=>p.id===id);
  if(!province)return;
  const data=mapPreviews[id];
  if(tip.dataset.province!==id) {
    tip.dataset.province=id;
    tip.replaceChildren(...[
      data?.photo && h('img',{src:data.photo.thumb,alt:data.photo.title,decoding:'async'}),
      h('strong',{},province.name), h('small',{},countLabel(counts[id])),
      data?.photo ? h('small',{},`${data.photo.title} · ${data.photo.author.displayName}`) : h('small',{},'Ainda sem fotografias aprovadas.'),
    ].filter(Boolean));
  }
  target.setAttribute('aria-describedby','mapTip');
  tip.classList.add('map-tip','is-visible'); tip.setAttribute('role','tooltip'); tip.setAttribute('aria-hidden','false');
  const box=target.getBoundingClientRect();
  const x=point?.x ?? box.right, y=point?.y ?? box.top;
  tip.style.left=`${Math.max(8,Math.min(innerWidth-226,x+14))}px`;
  tip.style.top=`${Math.max(8,Math.min(innerHeight-tip.offsetHeight-8,y+14))}px`;
  clearTimeout(mapPreviewTimer);
  if(!matchMedia('(hover: hover)').matches)mapPreviewTimer=setTimeout(hideMapPreview,4000);
}
window.addEventListener('scroll',hideMapPreview,{passive:true});

function paintSelection() {
  const id = state.province;
  const svg = $('#map');
  svg.classList.toggle('has-active', !!id);
  svg.querySelectorAll('[data-id]').forEach((n) => {
    n.classList.toggle('is-active', n.dataset.id === id);
    n.setAttribute('aria-pressed', String(n.dataset.id === id));
  });
  svg.querySelectorAll('[data-label]').forEach((n) => n.classList.toggle('is-active', n.dataset.label === id && id !== 'maputo-cidade'));
  document.querySelectorAll('.chip').forEach((c) => c.classList.toggle('is-active', c.dataset.id === id));
  const name = PROVINCES.find((p) => p.id === id)?.name;
  $('#activeName').textContent = name || 'Todo o país';
  const n = id ? counts[id] || 0 : Object.values(counts).reduce((a, b) => a + b, 0);
  $('#activeCount').textContent = countLabel(n);
}

/* ---------- Feed Masonry ---------- */
const masonry = createMasonry($('#feed'), {
  onOpen: (index) => openCinema(masonry.photos, index),
  minColumn: 250,
});

async function loadMore() {
  if (state.loading || !state.hasMore) return;
  const generation = feedGeneration;
  state.loading = true;
  masonry.setLoading(true);
  let loaded = false;
  const q = new URLSearchParams({ page: state.page, seed: state.seed, limit: 24 });
  if (state.province) q.set('province', state.province);
  try {
    if (state.category) q.set('category', state.category);
    if (state.mood) q.set('mood', state.mood);
    if (state.following) q.set('following', '1');
    const { photos, hasMore } = await api(`/photos?${q}`);
    if (generation !== feedGeneration) return;
    loaded = true;
    masonry.add(photos);
    state.page += 1;
    state.hasMore = hasMore;
    const end = $('#feedEnd');
    if (!masonry.photos.length) {
      $('#feed').append(h('div', { class: 'empty' },
        h('strong', {}, 'Ainda sem fotografias aqui'),
        'Sê a primeira pessoa a mostrar esta região.',
        h('br'),
        h('a', { class: 'btn', href: '/enviar' }, 'Enviar fotografia')));
      end.hidden = true;
    } else {
      end.hidden = hasMore;
      end.textContent = 'Chegaste ao fim. Por agora.';
    }
  } catch (err) {
    toast(err.message, { error: true });
  } finally {
    masonry.setLoading(false);
    state.loading = false;
    if (refreshPending) scheduleRefresh();
    else if (loaded && state.hasMore && $('#sentinel').getBoundingClientRect().top < innerHeight + 800) setTimeout(loadMore,0);
  }
}

async function select(id) {
  if (id === state.province) return;
  state.province = id;
  feedGeneration++;
  const url = new URL(location.href);
  if (id) url.searchParams.set('provincia', id);
  else url.searchParams.delete('provincia');
  history.replaceState(null, '', url);
  paintSelection();

  const feed = $('#feed');
  feed.classList.add('is-switching');
  await new Promise((r) => setTimeout(r, matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 200));
  if (state.province !== id) return;
  if (state.loading) { refreshPending = true; feed.classList.remove('is-switching'); return; }
  state.page = 0;
  state.hasMore = true;
  masonry.set([]);
  await loadMore();
  requestAnimationFrame(() => feed.classList.remove('is-switching'));

  const top = $('.discover').getBoundingClientRect().top + window.scrollY - 90;
  if (window.scrollY > top && matchMedia('(hover: hover)').matches) window.scrollTo({ top, behavior: 'smooth' });
}

new IntersectionObserver((entries) => {
  if (entries[0].isIntersecting) loadMore();
}, { rootMargin: '800px 0px' }).observe($('#sentinel'));

// Revalidate mounted gallery data when moderation changes in another tab/session.
let refreshPending = false;
let refreshTimer;
function scheduleRefresh() {
  feedGeneration++;
  refreshPending = true;
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(async () => {
    if (state.loading) return;
    refreshPending = false;
    state.page = 0;
    state.hasMore = true;
    masonry.set([]);
    await loadMore();
    try {
      const [stats, previews] = await Promise.all([api('/photos/stats'),api('/photos/map-preview')]);
      counts=stats; mapPreviews=previews.provinces; delete tip.dataset.province;
      document.querySelectorAll('.chip').forEach((chip) => {
        const id = chip.dataset.id;
        chip.querySelector('small').textContent = id ? counts[id] || 0 : Object.values(counts).reduce((a, b) => a + b, 0);
      });
      document.querySelectorAll('.map__province').forEach((node) => node.classList.toggle('is-empty', !counts[node.dataset.id]));
      paintSelection();
      await loadFeatured();
    } catch (err) { toast(err.message, { error: true }); }
  }, 150);
}
// Give the first gallery request priority over auxiliary map and live requests.
const initialFeed = loadMore();
initialFeed.then(() => {
  const live = getLiveEvents();
  live.addEventListener('photos', scheduleRefresh);
  return buildMap();
}).catch((err) => toast(err.message, { error: true }));
window.addEventListener('focus', scheduleRefresh);

loadFeatured().catch((err) => toast(err.message, { error: true }));


$('#categoryFilter').value = state.category;
$('#moodFilter').value = state.mood;
$('#followingFilter').checked = state.following;
$('#discoveryFilters').addEventListener('submit', (event) => event.preventDefault());
$('#discoveryFilters').addEventListener('change', async () => {
  if ($('#followingFilter').checked && !(await requireLogin('Entra para ver os fotógrafos que segues.'))) { $('#followingFilter').checked = false; return; }
  state.category = $('#categoryFilter').value;
  state.mood = $('#moodFilter').value;
  state.following = $('#followingFilter').checked;
  const url = new URL(location.href);
  for (const [key, value] of [['category',state.category],['mood',state.mood],['following',state.following ? '1' : '']]) {
    if (value) url.searchParams.set(key,value); else url.searchParams.delete(key);
  }
  history.replaceState(history.state,'',url);
  scheduleRefresh();
});
$('#resetFilters').addEventListener('click', () => {
  $('#categoryFilter').value = $('#moodFilter').value = '';
  $('#followingFilter').checked = false;
  $('#discoveryFilters').dispatchEvent(new Event('change'));
});

// Renew a mounted page across the weekly boundary without a full reload.
setInterval(() => { if (!document.hidden) loadFeatured().catch(()=>{}); }, 60000);
