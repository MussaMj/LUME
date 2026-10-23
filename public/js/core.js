import { lockPageScroll, unlockPageScroll } from './scroll-lock.js';
import { safeNext, loginDestination } from './navigation.js';
export { safeNext, loginDestination };

/* ==========================================================
   LUME · núcleo partilhado pelas páginas da comunidade
   (partilhado também pela homepage)
   ========================================================== */

/* ---------- API ---------- */
export async function api(path, { method = 'GET', body, form, signal } = {}) {
  const opts = { method, headers: {}, credentials: 'same-origin', signal };
  if (form) opts.body = form;
  else if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(`/api${path}`, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || 'Algo correu mal.');
    err.status = res.status;
    throw err;
  }
  return data;
}

/* ---------- Sessão ---------- */
let mePromise;
export function getMe(force = false) {
  if (!mePromise || force) mePromise = api('/auth/me').then((d) => d.user).catch(() => null);
  return mePromise;
}

export function loginUrl() {
  return `/entrar?next=${encodeURIComponent(location.pathname + location.search + location.hash)}`;
}

// Garante sessão iniciada antes de uma acção; devolve o utilizador ou redireciona
export async function requireLogin(message = 'Entra na tua conta para continuar.') {
  const me = await getMe();
  if (me) return me;
  toast(message, { action: { label: 'Entrar', href: loginUrl() } });
  return null;
}

/* ---------- Utilidades ---------- */
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'html') el.innerHTML = v; // só para SVG estático interno
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(Infinity)) if (c != null && c !== false) el.append(c instanceof Node ? c : String(c));
  return el;
}

export const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso.includes('T') ? iso : `${iso.replace(' ', 'T')}Z`);
  return d.toLocaleDateString('pt-PT', { day: 'numeric', month: 'long', year: 'numeric' });
}

// Nome de quem fez a fotografia (autor externo creditado, ou o membro que a enviou)
export const photographer = (photo) => photo.credit?.name || photo.author.displayName;

export const initials = (name = '') => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

/* ---------- Ícones (traço fino, a condizer com a tipografia) ---------- */
export const ICONS = {
  fullscreen: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3H3v5M16 3h5v5M21 16v5h-5M8 21H3v-5"/></svg>',
  restore: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 8h5V3M21 8h-5V3M16 21v-5h5M8 21v-5H3"/></svg>',
  rotate: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 8a8 8 0 10.3 7M20 3v5h-5"/></svg>',
  // "Inspirou-me": moldura com feixe de luz
  inspired: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect class="fill" x="3.5" y="8.5" width="12" height="12" rx="1"/><path d="M14.5 2.5l.9 3M19.8 4.2l-2 2.3M21.5 9.3l-3 .4"/></svg>',
  album: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 7.5v11a1 1 0 001 1h15a1 1 0 001-1v-9a1 1 0 00-1-1h-7l-2-2h-6a1 1 0 00-1 1z"/><path d="M12 11.5v5M9.5 14h5"/></svg>',
  whatsapp: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20l1.2-3.6A8 8 0 1112 20a8 8 0 01-3.9-1z"/><path d="M9 8.6c0 3 2.4 6.4 6.2 6.6l.9-1.5-1.8-.9-.8.8a4.6 4.6 0 01-2.6-2.6l.8-.8-.9-1.8z" stroke-width="1"/></svg>',
  story: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><circle cx="12" cy="11" r="2.6"/><path d="M9.5 18h5"/></svg>',
  link: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1"/></svg>',
  close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5l14 14M19 5L5 19"/></svg>',
  prev: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 4l-8 8 8 8"/></svg>',
  next: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4l8 8-8 8"/></svg>',
  info: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/></svg>',
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  pin: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-6.5-6.1-6.5-11A6.5 6.5 0 0112 3.5 6.5 6.5 0 0118.5 10c0 4.9-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/></svg>',
  upload: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V4M7 9l5-5 5 5M4.5 15v4a1 1 0 001 1h13a1 1 0 001-1v-4"/></svg>',
};

export const icon = (name, cls = 'icon') => h('span', { class: cls, html: ICONS[name] });

/* ---------- Avisos discretos ---------- */
let confirmationId = 0;
export function confirmDialog({ title, message, confirmLabel = 'Apagar', danger = true }) {
  return new Promise((resolve) => {
    const id = `confirmation-${++confirmationId}`;
    const previousFocus = document.activeElement;
    const cancel = h('button', { class: 'btn btn--ghost', type: 'button', onclick: () => finish(false) }, 'Cancelar');
    const accept = h('button', { class: 'btn confirmation-dialog__accept', type: 'button', onclick: () => finish(true) }, confirmLabel);
    const modal = h('div', { class: 'modal confirmation-dialog', role: 'alertdialog', 'aria-modal': 'true', 'aria-labelledby': `${id}-title`, 'aria-describedby': `${id}-message` },
      h('div', { class: 'modal__card' },
        h('div', { class: 'modal__head' }, h('h3', { id: `${id}-title` }, title),
          h('button', { class: 'modal__close', type: 'button', 'aria-label': 'Fechar', onclick: () => finish(false) }, icon('close'))),
        h('p', { class: 'modal__sub', id: `${id}-message` }, message),
        h('div', { class: 'confirmation-dialog__actions' }, accept, cancel)));
    let finished = false;
    function finish(confirmed) {
      if (finished) return;
      finished = true;
      modal.remove(); unlockPageScroll(id);
      document.removeEventListener('keydown', onKey, true);
      previousFocus?.isConnected && previousFocus.focus();
      resolve(confirmed);
    }
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); finish(false); }
      if (e.key === 'Tab') {
        const buttons = [...modal.querySelectorAll('button')];
        const first = buttons[0], last = buttons.at(-1);
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }
    modal.addEventListener('click', (e) => { if (e.target === modal) finish(false); });
    document.body.append(modal); lockPageScroll(id);
    document.addEventListener('keydown', onKey, true);
    requestAnimationFrame(() => { if (!finished) { modal.classList.add('is-open'); cancel.focus(); } });
  });
}

let toastTimer;
export function toast(message, { action, error = false, duration = 3800 } = {}) {
  let el = $('#toast');
  if (!el) {
    el = h('div', { id: 'toast', class: 'toast', role: 'status', 'aria-live': 'polite' });
    document.body.append(el);
  }
  el.replaceChildren(
    h('span', { class: 'toast__symbol', 'aria-hidden': 'true' }, icon(error ? 'info' : 'check')),
    h('span', { class: 'toast__message' }, message));
  if (action) el.append(h('a', { href: action.href, class: 'toast__action' }, action.label));
  el.append(h('button', { class: 'toast__dismiss', 'aria-label': 'Fechar aviso', onclick: () => { clearTimeout(toastTimer); el.classList.remove('is-visible'); } }, icon('close')));
  el.classList.toggle('toast--error', error);
  el.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('is-visible'), duration);
}

/* ---------- Navegação ---------- */
let navPromise;
export function initNav(active) {
  if (navPromise) return navPromise;
  navPromise = setupNav(active);
  return navPromise;
}

async function setupNav(active) {
  const nav = $('#nav');
  const links = $('.nav__links', nav);
  const toggle = $('#navToggle');
  const mobile = matchMedia('(max-width: 1100px)');
  let menuBackground = [];
  const placeholder = document.createComment('mobile menu portal');
  links.before(placeholder);
  const closeMenu = () => {
    toggle?.setAttribute('aria-expanded', 'false');
    links.classList.remove('is-open');
    nav.classList.remove('is-menu-open');
    document.body.classList.remove('menu-open');
    menuBackground.forEach(({ element, inert }) => { element.inert = inert; });
    menuBackground = [];
    unlockPageScroll('menu');
    if (links.parentNode !== nav) placeholder.after(links);
  };
  const paint = (me) => {
    const items = me ? [
      ['Início', '/', 'inicio'], ['Descobrir', '/descobrir', 'descobrir'], ['Comunidade', '/comunidade', 'comunidade'], ['Enviar', '/enviar', 'enviar'],
      ['Perfil', `/@${me.username}`, 'perfil'], ['Colecções', '/colecoes', 'colecoes'],
      ...(me.role === 'admin' && me.email?.toLowerCase() === 'innovateiv.crtf@gmail.com'
        ? [['Administração', '/admin', 'admin']] : []),
    ] : [
      ['Galeria', '/#galeria', 'galeria'], ['Experiência', '/#experiencia', 'experiencia'],
      ['Sobre', '/#sobre', 'sobre'], ['Entrar', '/entrar', 'entrar'],
    ];
    links.replaceChildren(...items.map(([label, href, page]) => h('a', {
      href, 'data-page': page, class: page === active ? 'is-current' : '',
      'aria-current': page === active ? 'page' : null,
    }, label)));
    if (me) links.append(h('a', { href: '/', onclick: async (event) => {
      event.preventDefault();
      const button = event.currentTarget;
      if (button.getAttribute('aria-disabled') === 'true') return;
      button.setAttribute('aria-disabled', 'true');
      try {
        await api('/auth/logout', { method: 'POST' });
        mePromise = undefined;
        location.replace('/');
      } catch (err) {
        button.removeAttribute('aria-disabled');
        toast(err.message, { error: true });
      }
    } }, 'Sair'));
    if (me) api('/community/notifications').then(({ notifications }) => {
      const unread = notifications.filter((item) => !item.read_at).length;
      const community = links.querySelector('[data-page=comunidade]');
      if (community && unread) { community.textContent = `Comunidade (${unread})`; community.href = '/comunidade#novidades'; }
    }).catch(() => {});
    links.hidden = false;
    if (toggle) { toggle.hidden = false; toggle.disabled = false; }
  };
  const me = await getMe();
  paint(me);
  toggle?.addEventListener('click', () => {
    const open = toggle.getAttribute('aria-expanded') === 'true';
    if (open) closeMenu();
    else {
      if (!mobile.matches) return;
      document.body.append(links);
      menuBackground = [...document.body.children].filter((element) => element !== nav && element !== links)
        .map((element) => ({ element, inert: element.inert }));
      menuBackground.forEach(({ element }) => { element.inert = true; });
      document.body.classList.add('menu-open');
      lockPageScroll('menu');
      nav.classList.add('is-menu-open');
      toggle.setAttribute('aria-expanded', 'true');
      links.classList.add('is-open');
      links.querySelector('a')?.focus({ preventScroll: true });
    }
  });
  const measureNav = () => document.documentElement.style.setProperty('--nav-offset', `${Math.ceil(nav.getBoundingClientRect().height) + 16}px`);
  new ResizeObserver(measureNav).observe(nav);
  measureNav();
  let anchorNavigation = 0;
  const waitForSectionLayout = async () => {
    const ready = [$('#communityPreview'), $('#bento')].filter(Boolean).map(root => {
      if(root.dataset.layoutReady === 'true')return Promise.resolve();
      return new Promise(resolve => {
        const observer=new MutationObserver(()=>{
          if(root.dataset.layoutReady === 'true') { observer.disconnect(); resolve(); }
        });
        observer.observe(root,{attributes:true,attributeFilter:['data-layout-ready']});
      });
    });
    await Promise.all([...ready, document.fonts.ready]);
    await new Promise(requestAnimationFrame);
  };
  const goToSection = async (target, url, initial = false) => {
    const request = ++anchorNavigation;
    await waitForSectionLayout();
    if (request !== anchorNavigation) return;
    measureNav();
    if (!initial && location.hash !== url.hash) history.pushState(history.state, '', url);
    target.scrollIntoView({ block: 'start', behavior: initial || reduceMotion ? 'instant' : 'smooth' });
  };
  const cancelPendingAnchor = () => { anchorNavigation++; };
  window.addEventListener('wheel', cancelPendingAnchor, { passive: true });
  window.addEventListener('touchstart', cancelPendingAnchor, { passive: true });
  links.addEventListener('click', (event) => {
    const link = event.target.closest('a');
    if (!link) return;
    closeMenu();
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const url = new URL(link.href);
    const target = url.hash && document.getElementById(url.hash.slice(1));
    if (active === 'inicio' && url.origin === location.origin && url.pathname === '/' && target) {
      event.preventDefault();
      void goToSection(target, url);
    }
  }, { capture: true });
  if (active === 'inicio' && location.hash) {
    const target = document.getElementById(location.hash.slice(1));
    if (target) void goToSection(target, new URL(location.href), true);
  }
  $('.nav__logo', nav)?.addEventListener('click', closeMenu);
  document.addEventListener('keydown', (event) => {
    if (toggle?.getAttribute('aria-expanded') !== 'true') return;
    if (event.key === 'Escape') { closeMenu(); toggle.focus({ preventScroll: true }); }
    if (event.key === 'Tab') {
      const targets = [$('.nav__logo', nav), toggle, ...links.querySelectorAll('a')].filter(Boolean);
      const index = targets.indexOf(document.activeElement);
      event.preventDefault();
      targets[(index + (event.shiftKey ? -1 : 1) + targets.length) % targets.length].focus();
    }
  });
  mobile.addEventListener('change', closeMenu);
  const onScroll = () => nav.classList.toggle('is-scrolled', window.scrollY > 40);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
  // Recheck when returning to a tab or restoring a page from the back/forward cache.
  const refresh = async () => {
    const current = await getMe(true);
    closeMenu();
    paint(current);
    if (!current && ['enviar', 'colecoes', 'admin'].includes(active)) {
      location.replace(loginUrl() + (active === 'admin' ? '&notice=admin-login' : ''));
    }
  };
  window.addEventListener('focus', refresh);
  window.addEventListener('pageshow', (event) => { if (event.persisted) void refresh(); });
  return me;
}

/* ---------- Parallax (mesma lógica da homepage) ---------- */
export function initParallax() {
  if (reduceMotion) return;
  let ticking = false;
  const update = () => {
    ticking = false;
    const vh = window.innerHeight;
    $$('[data-parallax]').forEach((el) => {
      const rect = el.closest('section').getBoundingClientRect();
      if (rect.bottom < 0 || rect.top > vh) return;
      const offset = rect.top + rect.height / 2 - vh / 2;
      const scale = el.dataset.parallaxScale ? 1 + Math.min(Math.abs(offset) / vh, 1) * Number(el.dataset.parallaxScale) : 1;
      el.style.transform = `translate3d(0, ${-offset * Number(el.dataset.parallax)}px, 0) scale(${scale})`;
    });
  };
  const request = () => {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(update);
    }
  };
  window.addEventListener('scroll', request, { passive: true });
  window.addEventListener('resize', request);
  update();
  return request;
}

/* ---------- Revelações ao entrar no ecrã ---------- */
const revealer = new IntersectionObserver(
  (entries) => entries.forEach((e) => {
    if (!e.isIntersecting) return;
    e.target.classList.add('is-in');
    revealer.unobserve(e.target);
  }),
  { threshold: 0.12, rootMargin: '0px 0px -40px 0px' },
);
export const reveal = (root = document) => $$('.reveal:not(.is-in)', root).forEach((el) => revealer.observe(el));

export const PROVINCES = [
  ['niassa', 'Niassa'], ['cabo-delgado', 'Cabo Delgado'], ['nampula', 'Nampula'], ['zambezia', 'Zambézia'],
  ['tete', 'Tete'], ['manica', 'Manica'], ['sofala', 'Sofala'], ['inhambane', 'Inhambane'], ['gaza', 'Gaza'],
  ['maputo-provincia', 'Maputo Província'], ['maputo-cidade', 'Maputo Cidade'],
].map(([id, name]) => ({ id, name }));

export function pulse(element) {
  if (!element || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  element.classList.remove('is-pulsing');
  requestAnimationFrame(() => element.classList.add('is-pulsing'));
  setTimeout(() => element.classList.remove('is-pulsing'),400);
}

let liveEvents;
export function getLiveEvents() {
  if (!liveEvents) liveEvents = new EventSource('/api/events');
  return liveEvents;
}
