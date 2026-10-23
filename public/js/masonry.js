import { showSkeleton } from './skeleton.js';
import { h, icon, initials } from './core.js';
import { toggleInspired } from './cinema.js';

/*
 * Grelha Masonry estilo Pinterest.
 * Cada foto vai para a coluna mais baixa, usando as proporções reais
 * (largura/altura guardadas na base de dados) para não haver saltos de layout.
 */
export function createMasonry(container, { onOpen, cardExtras, minColumn = 260 } = {}) {
  container.classList.add('masonry');
  let photos = [];
  let columns = [];
  let heights = [];
  let count = 0;
  let clearLoading;

  const io = new IntersectionObserver(
    (entries) => entries.forEach((e) => {
      if (!e.isIntersecting) return;
      e.target.classList.add('is-in');
      io.unobserve(e.target);
    }),
    { rootMargin: '0px 0px -30px 0px' },
  );

  function columnCount() {
    const w = container.clientWidth || window.innerWidth;
    return Math.max(2, Math.min(5, Math.floor(w / minColumn)));
  }

  function build() {
    count = columnCount();
    io.disconnect();
    container.replaceChildren();
    columns = Array.from({ length: count }, () => container.appendChild(h('div', { class: 'masonry__col' })));
    heights = new Array(count).fill(0);
  }

  function card(photo, index) {
    const img = h('img', {
      src: photo.thumb,
      alt: `${photo.title}, ${photo.city}`,
      loading: 'lazy',
      decoding: 'async',
      width: photo.width,
      height: photo.height,
    });
    img.addEventListener('load', () => img.classList.add('is-loaded'), { once: true });
    if (img.complete && img.naturalWidth) img.classList.add('is-loaded');

    const inspireBtn = h('button', {
      class: `pin__inspire${photo.inspired ? ' is-on' : ''}`,
      'aria-label': 'Inspirou-me',
      'aria-pressed': String(!!photo.inspired),
      dataset: { inspire: photo.id },
      onclick: (e) => {
        e.stopPropagation();
        toggleInspired(photo);
      },
    }, icon('inspired'), h('span', { class: 'pin__inspire-count', dataset: { inspireCount: photo.id } }, String(photo.inspiredCount || 0)));

    const el = h('article', { class: 'pin', dataset: { id: photo.id } },
      h('button', {
        class: 'pin__open',
        style: `aspect-ratio: ${photo.width} / ${photo.height}`,
        'aria-label': `Abrir ${photo.title}, de ${photo.author.displayName}`,
        onclick: () => onOpen?.(index),
      }, img),
      h('div', { class: 'pin__meta' },
        h('div', { class: 'pin__text' },
          h('span', { class: 'pin__title' }, photo.title),
          h('span', { class: 'pin__place' }, `${photo.city} · ${photo.provinceName}`),
          h('a', { class: 'pin__author', href: `/@${photo.author.username}`, 'aria-label': `Ver perfil de ${photo.author.displayName}` },
            h('span', { class: 'pin__avatar', 'aria-hidden': 'true' }, initials(photo.author.displayName)),
            h('span', {}, photo.author.displayName))),
        (!photo.status || photo.status === 'approved') && inspireBtn),
      cardExtras?.(photo));
    el.style.transitionDelay = `${(index % count) * 60}ms`;
    return el;
  }

  function place(photo, index) {
    const col = heights.indexOf(Math.min(...heights));
    columns[col].append(card(photo, index));
    heights[col] += photo.height / photo.width + 0.18; // + legenda
    io.observe(columns[col].lastElementChild);
  }

  function relayout() {
    if (columnCount() === count) return;
    build();
    photos.forEach(place);
  }

  let resizeTimer;
  const ro = new ResizeObserver(() => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(relayout, 120);
  });
  ro.observe(container);
  build();

  return {
    setLoading(loading) {
      clearLoading?.(); clearLoading = null;
      if (loading) clearLoading = showSkeleton(container, photos.length ? 3 : 6, { append: true });
    },
    get photos() { return photos; },
    add(list) {
      list.forEach((p) => place(p, photos.push(p) - 1));
    },
    set(list) {
      photos = [];
      build();
      this.add(list);
    },
    remove(id) {
      photos = photos.filter((p) => p.id !== id);
      build();
      photos.forEach(place);
    },
  };
}
