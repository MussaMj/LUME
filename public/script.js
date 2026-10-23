import { NEW_PHOTOGRAPHERS } from './data/new-photographers.js';
import { ADAIMA_AUTHOR, ADAIMA_PROFILE, ADAIMA_PHOTOS } from './data/adaima-photos.js';
import { lockPageScroll, unlockPageScroll } from './js/scroll-lock.js';
import { getLiveEvents, initNav, toast, api } from './js/core.js';
import { MICHAEL_AUTHOR, MICHAEL_PROFILE, MICHAEL_PHOTOS } from './data/michael-photos.js';

initNav('inicio');

/* ==========================================================
   LUME · O Brilho de Moçambique
   ----------------------------------------------------------
   Fotografias de Maputo por Michael James Khosa e uma selecção
   editorial do Unsplash. Cada imagem mantém o crédito correto.
   ========================================================== */

const CONFIG = {
  // Email para colaborações e impressões. Vazio = o botão abre o Instagram.
  email: '',
  instagram: 'https://www.instagram.com/mainearqvs',
};

const unsplash = (file, w) => `https://images.unsplash.com/${file}?ixlib=rb-4.1.0&auto=format&q=80&w=${w}`;
const perfil = (user) => `https://unsplash.com/@${user}?utm_source=lume&utm_medium=referral`;

// Galeria: tema = baixa | costa | arquitetura
// tamanho = hero | tall | wide | side | sq | pano
let FOTOS = [
  { src: unsplash('photo-1543960366-ef0016e1006b', 1600),  titulo: 'Futebol ao Fim da Tarde', local: 'Maputo',  autor: 'redcharlie',       url: perfil('redcharlie'),     tema: 'baixa',       tamanho: 'hero' },
  { src: unsplash('photo-1734592212133-a65ba7225c68', 1200), titulo: 'Fim de Tarde na Praia', local: 'Maputo',  autor: 'George Swanepoel', url: perfil('geo_swanepoel'),  tema: 'costa',       tamanho: 'tall' },
  { src: unsplash('photo-1684777223784-e54eb8532dee', 1600), titulo: 'Céu sobre Maputo',      local: 'Maputo',  autor: 'SHIU TANG',        url: perfil('shiut'),          tema: 'arquitetura', tamanho: 'wide' },
  { src: unsplash('photo-1721403901773-ce6d56b709d2', 1400), titulo: 'Passeio à Beira-Mar',   local: 'Maputo',  autor: 'Omoniyi David',    url: perfil('mocream_coffee'), tema: 'baixa',       tamanho: 'side' },
  { src: unsplash('photo-1721011838220-b16d86f9d5e5', 1200), titulo: 'Catembe ao Entardecer', local: 'Catembe', autor: 'Omoniyi David',    url: perfil('mocream_coffee'), tema: 'costa',       tamanho: 'sq' },
  { src: unsplash('photo-1692857477588-d024201cdcfa', 1200), titulo: 'Igreja Ortodoxa Grega', local: 'Maputo',  autor: 'Mister Paps',      url: perfil('themisterpaps'),  tema: 'arquitetura', tamanho: 'sq' },
  { src: unsplash('photo-1561070509-1eea70a5a7d3', 1200),  titulo: 'À Sombra da Árvore',    local: 'Maputo',  autor: 'Farah Nabil',      url: perfil('farahnabil1995'), tema: 'baixa',       tamanho: 'sq' },
  { src: unsplash('photo-1620832465790-f12ef048118e', 2400), titulo: 'Baía ao Pôr do Sol',    local: 'Maputo',  autor: 'Valério Maúnde',   url: perfil('vmaunde'),        tema: 'costa',       tamanho: 'pano' },
  { src: unsplash('photo-1705858348972-d4196c414284', 1200), titulo: 'Arcadas e Palmeiras',   local: 'Maputo',  autor: 'Mister Paps',      url: perfil('themisterpaps'),  tema: 'arquitetura', tamanho: 'tall' },
  { src: unsplash('photo-1590084700235-5e5b781e05b7', 1600), titulo: 'Caminho de Casa',       local: 'Maputo',  autor: 'Farah Nabil',      url: perfil('farahnabil1995'), tema: 'baixa',       tamanho: 'hero' },
  { src: unsplash('photo-1650876095496-e01d50a6c874', 1400), titulo: 'Vela na Baía',          local: 'Maputo',  autor: 'Noé Ferrari',      url: perfil('noeferrari'),     tema: 'costa',       tamanho: 'side' },
  { src: unsplash('photo-1705859895792-2ed2b30896ff', 1600), titulo: 'Avenida 25 de Setembro', local: 'Maputo', autor: 'Mister Paps',      url: perfil('themisterpaps'),  tema: 'arquitetura', tamanho: 'wide' },
];

// Four editorial replacements; the remaining supplied photographs extend the gallery.
const michaelGallery = MICHAEL_PHOTOS.map((photo) => ({
  src: photo.src, thumb: photo.thumb, titulo: photo.title, local: 'Maputo', autor: MICHAEL_AUTHOR,
  url: MICHAEL_PROFILE, tema: photo.theme, tamanho: photo.size, source: 'Michael',
}));
[0, 1, 5, 3].forEach((index, i) => { FOTOS[index] = michaelGallery[i]; });
FOTOS.push(...michaelGallery.slice(4));
FOTOS.push(...ADAIMA_PHOTOS.map(photo => ({
  src: photo.src, thumb: photo.thumb, titulo: photo.title, local: photo.city, autor: ADAIMA_AUTHOR,
  url: ADAIMA_PROFILE, tema: photo.theme, tamanho: photo.size, source: 'Adaíma',
})));

NEW_PHOTOGRAPHERS.forEach(({ author, username, photos }) => {
  FOTOS.push(...photos.map(photo => ({
    src: photo.src, thumb: photo.thumb, titulo: photo.title, local: photo.city,
    autor: author, url: `/@${username}`, tema: photo.theme, tamanho: photo.size, source: author,
  })));
});

// A Experiência: uma travessia de um dia pela cidade
const VIAGEM = [
  { src: unsplash('photo-1747173588094-f14c00f7705e', 1400), hora: '07:00', local: 'A Ponte ao Longe',     autor: 'Sergio Martins', nota: 'A ponte e o perfil da cidade, ao longe, sobre a água.' },
  { src: unsplash('photo-1694373869571-60241c9a1dd8', 1600), hora: '10:00', local: 'Rua da Imprensa',      autor: 'Mister Paps',    nota: 'Letreiros, varandas e o ritmo do centro.' },
  { src: unsplash('photo-1709016038902-e77ff1a34744', 1200), hora: '12:30', local: 'Mural dos Combatentes', autor: 'Mister Paps',   nota: 'A memória da cidade, pintada em altura.' },
  { src: unsplash('photo-1785509934494-ea093e22d398', 1400), hora: '14:30', local: 'Rua de Maputo',        autor: 'Jaehee Park',    nota: 'Um carro, uma banca, a tarde a passar devagar.' },
  { src: unsplash('photo-1554893814-598f52fca25e', 1400),  hora: '16:30', local: 'Avenida da Marginal',  autor: 'Rohan Reddy',    nota: 'Balões, petiscos e a cidade virada para o mar.' },
  { src: unsplash('photo-1684777310153-ad0dd480203c', 1400), hora: '18:00', local: 'Maputo ao Entardecer', autor: 'SHIU TANG',      nota: 'O sol desce e os prédios ganham ouro.' },
  { src: unsplash('photo-1684777310127-e6236ba55abd', 1400), hora: '19:30', local: 'Maputo ao Anoitecer',  autor: 'SHIU TANG',      nota: 'As primeiras luzes acendem-se na cidade.' },
];

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const isMobile = () => window.matchMedia('(max-width: 720px)').matches;

/* ---------- Navegação ---------- */
const nav = document.getElementById('nav');
/* ---------- Galeria bento ---------- */
const bento = document.getElementById('bento');

function renderEditorial() {
  bento.replaceChildren();
  FOTOS.forEach((foto, i) => {
    const tile = document.createElement('button');
    tile.className = `tile tile--${foto.tamanho}`;
    tile.dataset.tema = foto.tema; tile.dataset.index = i;
    tile.setAttribute('aria-label', `${foto.titulo}, ${foto.local}, de ${foto.autor}`);
    const img = document.createElement('img');
    img.loading = 'lazy'; img.decoding = 'async'; img.alt = `${foto.titulo}, ${foto.local}`; img.src = foto.thumb || foto.src;
    const cap = document.createElement('span'); cap.className = 'tile__caption';
    const title = document.createElement('span'); title.className = 'tile__title'; title.textContent = foto.titulo;
    const place = document.createElement('span'); place.className = 'tile__place'; place.textContent = foto.local;
    cap.append(title, place); tile.append(img, cap);
    tile.addEventListener('click', () => openLightbox(i)); bento.appendChild(tile); io.observe(tile);
    const filter = document.querySelector('.filter.is-active')?.dataset.filter || 'todas';
    tile.classList.toggle('is-hidden', filter !== 'todas' && filter !== foto.tema);
  });
  bento.setAttribute('aria-busy', 'false');
  bento.dataset.layoutReady='true';
}
const localFallback = FOTOS.filter(photo => photo.source);
let editorialPending = false, editorialAgain = false;
async function loadEditorial() {
  if (lb.classList.contains('is-open')) { editorialAgain = true; return; }
  if (editorialPending) { editorialAgain = true; return; }
  editorialPending = true;
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),5000);
  try {
    const {photos} = await api('/photos?limit=8&sort=popular',{signal:controller.signal});
    const dynamic = photos.map(photo => ({id: photo.id, src:photo.src, thumb:photo.thumb, titulo:photo.title,
      local:[photo.city,photo.provinceName].filter(Boolean).join(' · '), autor:photo.credit?.name || photo.author.displayName,
      url:`/@${photo.author.username}`, source:'Comunidade', tema:photo.category === 'Arquitetura' ? 'arquitetura' : photo.category === 'Paisagem' ? 'costa' : 'baixa',
      tamanho:photo.width > photo.height ? 'wide' : 'tall'}));
    if (lb.classList.contains('is-open')) { editorialAgain = true; return; }
    const sources = new Set(dynamic.map(photo => photo.src));
    FOTOS = [...dynamic,...localFallback.filter(photo=>!sources.has(photo.src)).slice(0,Math.max(0,8-dynamic.length))];
  } catch {
    if (lb.classList.contains('is-open')) { editorialAgain=true; return; }
    if (!FOTOS.some(photo=>photo.id)) FOTOS = localFallback.slice(0,8);
  }
  finally {
    clearTimeout(timeout);
    editorialPending = false;
    if (!lb.classList.contains('is-open')) {
      const signature=JSON.stringify(FOTOS);
      if(bento.dataset.signature!==signature) { renderEditorial(); bento.dataset.signature=signature; }
      editorialAgain=false;
    } else editorialAgain = true;
  }
}

/* ---------- Filtros ---------- */
document.querySelectorAll('.filter').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter').forEach((b) => {
      b.classList.toggle('is-active', b === btn);
      b.setAttribute('aria-selected', String(b === btn));
    });
    const tema = btn.dataset.filter;
    bento.querySelectorAll('.tile').forEach((tile, i) => {
      const show = tema === 'todas' || tile.dataset.tema === tema;
      tile.classList.remove('is-in');
      tile.classList.toggle('is-hidden', !show);
      if (show) setTimeout(() => tile.classList.add('is-in'), 40 + i * 50);
    });
  });
});

/* ---------- A Experiência ---------- */
const journey = document.getElementById('experiencia');
const track = document.getElementById('journeyTrack');
const journeyBar = document.getElementById('journeyBar');

VIAGEM.forEach((stop, i) => {
  const el = document.createElement('article');
  el.className = 'stop';
  el.innerHTML = `
    <div class="stop__frame"><img loading="lazy" alt=""></div>
    <div class="stop__text">
      <span class="stop__time"></span>
      <h3 class="stop__place"></h3>
      <p class="stop__note"></p>
    </div>`;
  const img = el.querySelector('img');
  img.alt = stop.local;
  img.src = stop.src;
  el.querySelector('.stop__time').textContent = stop.hora;
  el.querySelector('.stop__place').textContent = stop.local;
  el.querySelector('.stop__note').textContent = `${stop.nota} Foto: ${stop.autor} / Unsplash.`;
  track.appendChild(el);
});

let trackDistance = 0;
function sizeJourney() {
  if (isMobile()) {
    journey.style.height = '';
    return;
  }
  trackDistance = Math.max(0, track.scrollWidth - window.innerWidth);
  journey.style.height = `${trackDistance + window.innerHeight}px`;
}

/* ---------- Manifesto: palavras acendem com o scroll ---------- */
const statement = document.querySelector('.reveal-words');
const words = statement.textContent.trim().split(/\s+/).map((w) => {
  const s = document.createElement('span');
  s.className = 'word';
  s.textContent = w;
  return s;
});
statement.textContent = '';
words.forEach((w, i) => {
  statement.appendChild(w);
  if (i < words.length - 1) statement.append(' ');
});

/* ---------- Revelações ao entrar no ecrã ---------- */
const io = new IntersectionObserver(
  (entries) =>
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      e.target.classList.add('is-in');
      io.unobserve(e.target);
    }),
  { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
);
document.querySelectorAll('.reveal, .tile').forEach((el) => io.observe(el));

/* ---------- Loop de scroll: parallax, viagem, manifesto ---------- */
const parallaxEls = [...document.querySelectorAll('[data-parallax]')];
let ticking = false;

function update() {
  ticking = false;
  const vh = window.innerHeight;
  const vw = window.innerWidth;

  nav.classList.toggle('is-scrolled', window.scrollY > 40);

  if (!reduceMotion) {
    parallaxEls.forEach((el) => {
      const rect = el.closest('section').getBoundingClientRect();
      if (rect.bottom < 0 || rect.top > vh) return;
      const offset = rect.top + rect.height / 2 - vh / 2;
      el.style.transform = `translate3d(0, ${-offset * parseFloat(el.dataset.parallax)}px, 0)`;
    });
  }

  // Manifesto
  const sRect = statement.getBoundingClientRect();
  const sProgress = Math.min(1, Math.max(0, (vh * 0.85 - sRect.top) / (sRect.height + vh * 0.35)));
  const lit = Math.round(sProgress * words.length);
  words.forEach((w, i) => w.classList.toggle('is-lit', i < lit));

  // Viagem horizontal
  if (!isMobile()) {
    const jRect = journey.getBoundingClientRect();
    const total = journey.offsetHeight - vh;
    const p = total > 0 ? Math.min(1, Math.max(0, -jRect.top / total)) : 0;
    track.style.transform = `translate3d(${-p * trackDistance}px, 0, 0)`;
    journeyBar.style.transform = `scaleX(${p})`;

    if (!reduceMotion) {
      track.querySelectorAll('.stop__frame').forEach((frame) => {
        const r = frame.getBoundingClientRect();
        if (r.right < 0 || r.left > vw) return;
        const shift = ((r.left + r.width / 2 - vw / 2) / vw) * 10;
        frame.firstElementChild.style.transform = `translate3d(${-11.5 + shift}%, 0, 0)`;
      });
    }
  }
}

function requestUpdate() {
  if (!ticking) {
    ticking = true;
    requestAnimationFrame(update);
  }
}

window.addEventListener('scroll', requestUpdate, { passive: true });
window.addEventListener('resize', () => {
  sizeJourney();
  requestUpdate();
});
window.addEventListener('load', () => {
  sizeJourney();
  update();
});
sizeJourney();
update();

/* ---------- Lightbox ---------- */
const lb = document.getElementById('lightbox');
const lbImg = document.getElementById('lbImg');
const lbTitle = document.getElementById('lbTitle');
const lbPlace = document.getElementById('lbPlace');
const lbCredit = document.getElementById('lbCredit');
let lbList = [];
let lbPos = 0;
let lbChanging = false;
let lbRequest = 0;
let lbAnimation;
const lbCounter = document.createElement('span');
lbCounter.className = 'lightbox__counter';
lbCounter.setAttribute('aria-live', 'polite');
lb.querySelector('figcaption').append(lbCounter);

function showInLightbox() {
  const tile = lbList[lbPos];
  const foto = FOTOS[tile.dataset.index];
  lbImg.src = foto.src;
  lbImg.alt = `${foto.titulo}, ${foto.local}`;
  lbTitle.textContent = foto.titulo;
  lbPlace.textContent = foto.local;
  lbCredit.textContent = `Foto: ${foto.autor}${foto.source ? '' : ' / Unsplash'}`;
  lbCredit.href = foto.url;
  lbCredit.target = foto.source ? '_self' : '_blank';
  if (foto.id) void api(`/photos/${foto.id}/view`, {method:'POST', body:{}}).catch(()=>{});
  lbCounter.textContent = `${lbPos + 1} / ${lbList.length}`;
}

function openLightbox(index) {
  lbList = [...bento.querySelectorAll('.tile:not(.is-hidden)')];
  lbPos = lbList.findIndex((t) => Number(t.dataset.index) === index);
  showInLightbox();
  lb.classList.add('is-open');
  lb.setAttribute('aria-hidden', 'false');
  lockPageScroll('lightbox');
  document.getElementById('lbClose').focus();
}

function closeLightbox() {
  lbRequest++; lbChanging = false; lbAnimation?.cancel();
  lb.classList.remove('is-open');
  lb.setAttribute('aria-hidden', 'true');
  unlockPageScroll('lightbox');
  lbList[lbPos]?.focus();
  if (editorialAgain) { editorialAgain = false; void loadEditorial(); }
}

async function step(dir) {
  if (lbChanging || lbList.length < 2) return;
  lbChanging = true;
  const request = ++lbRequest;
  const pos = (lbPos + dir + lbList.length) % lbList.length;
  const photo = FOTOS[lbList[pos].dataset.index];
  const ready = await new Promise(resolve => {
    const image = new Image();
    const timer = setTimeout(() => finish(false), 5000);
    function finish(ok) { clearTimeout(timer); image.onload = image.onerror = null; resolve(ok); }
    image.onload = () => finish(true); image.onerror = () => finish(false); image.src = photo.src;
  });
  if (request !== lbRequest) return;
  if (!ready) { lbChanging = false; toast('Não foi possível carregar a fotografia. Tenta novamente.', { error: true }); return; }
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  try {
    if (!reduced) {
      lbAnimation = lbImg.animate([{ translate: '0 0', opacity: 1 }, { translate: `0 ${-dir * 48}px`, opacity: 0 }], { duration: 200, easing: 'ease-in-out', fill: 'forwards' });
      await lbAnimation.finished;
    }
    if (request !== lbRequest) return;
    lbPos = pos; showInLightbox(); lbAnimation?.cancel();
    if (!reduced) {
      lbAnimation = lbImg.animate([{ translate: `0 ${dir * 64}px`, opacity: 0 }, { translate: '0 0', opacity: 1 }], { duration: 380, easing: 'cubic-bezier(.22,.61,.36,1)' });
      await lbAnimation.finished;
    }
  } catch {} finally { if (request === lbRequest) lbChanging = false; }
}

lbImg.draggable = false;
let lbTouch;
const lbFigure = lb.querySelector('figure');
lbFigure.addEventListener('pointerdown', e => {
  if (!e.isPrimary || e.target.closest('a')) return;
  lbTouch = { id: e.pointerId, x: e.clientX, y: e.clientY };
  lbFigure.setPointerCapture(e.pointerId);
});
lbFigure.addEventListener('pointerup', e => {
  if (!lbTouch || e.pointerId !== lbTouch.id) return;
  const dx = e.clientX - lbTouch.x, dy = e.clientY - lbTouch.y;
  lbTouch = null;
  if (Math.abs(dy) > 50 && Math.abs(dy) > Math.abs(dx) * 1.3) step(dy < 0 ? 1 : -1);
});
lbFigure.addEventListener('pointercancel', () => { lbTouch = null; });
let lbWheel = 0, lbWheelAt = 0;
lb.addEventListener('wheel', e => {
  if (!lb.classList.contains('is-open') || e.ctrlKey) return;
  e.preventDefault();
  if (lbChanging) return;
  const now = Date.now();
  if (now - lbWheelAt > 180 || Math.sign(lbWheel) !== Math.sign(e.deltaY)) lbWheel = 0;
  lbWheelAt = now;
  lbWheel += e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? innerHeight : 1);
  if (Math.abs(lbWheel) >= 60) { step(lbWheel > 0 ? 1 : -1); lbWheel = 0; }
}, { passive: false });

document.getElementById('lbClose').addEventListener('click', closeLightbox);
document.getElementById('lbPrev').addEventListener('click', () => step(-1));
document.getElementById('lbNext').addEventListener('click', () => step(1));
lb.addEventListener('click', (e) => { if (e.target === lb) closeLightbox(); });
document.addEventListener('keydown', (e) => {
  if (!lb.classList.contains('is-open')) return;
  if (e.key === 'Escape') closeLightbox();
  if (e.key === 'ArrowLeft') step(-1);
  if (e.key === 'ArrowRight') step(1);
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); step(e.key === 'ArrowDown' ? 1 : -1); }
});

/* ---------- Contacto ---------- */
const contactLink = document.getElementById('contactEmail');
if (CONFIG.email) {
  contactLink.href = `mailto:${CONFIG.email}?subject=${encodeURIComponent('Colaboração / Impressões — LUME')}`;
} else {
  contactLink.href = CONFIG.instagram;
  contactLink.target = '_blank';
  contactLink.rel = 'noopener';
}
document.getElementById('year').textContent = new Date().getFullYear();

// Feedback do bloqueio de uma rota administrativa.
if (new URLSearchParams(location.search).get('error') === 'access-denied') {
  const alert = document.createElement('div');
  alert.className = 'access-denied';
  alert.setAttribute('role', 'alert');
  alert.textContent = 'Acesso Negado';
  document.body.append(alert);
  const url = new URL(location.href);
  url.searchParams.delete('error');
  history.replaceState(null, '', url);
  setTimeout(() => alert.remove(), 6000);
}

// Only the editorial grid consumes live community photos. The signature Hero remains static.
bento.setAttribute('aria-busy','true');
for (let i=0;i<8;i++) { const skeleton=document.createElement('div'); skeleton.className='editorial-skeleton'; bento.append(skeleton); }
void loadEditorial();
const editorialLive = getLiveEvents();
let editorialTimer;
editorialLive.addEventListener('photos', () => { clearTimeout(editorialTimer); editorialTimer=setTimeout(loadEditorial,250); });
window.addEventListener('focus',()=>void loadEditorial());

editorialLive.addEventListener('engagement', () => {
  clearTimeout(editorialTimer); editorialTimer=setTimeout(loadEditorial,800);
});

setInterval(()=>{if(!document.hidden)void loadEditorial();},60000);
