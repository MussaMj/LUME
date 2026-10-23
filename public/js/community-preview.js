import { api, h } from './core.js';

const root = document.getElementById('communityPreview');
api('/community/items').then(({ items }) => {
  const chosen = ['story','spotlight'].map((kind) => items.find((item) => item.kind === kind && item.status === 'published')).filter(Boolean);
  root.replaceChildren(...chosen.map((item) => h('a', {
    class: 'community-card', href: item.kind === 'story' ? `/historia/${item.id}` : `/comunidade#fotografos`,
  }, item.photos?.[0] && h('img', { src: item.photos[0].thumb, alt: item.photos[0].title, width: item.photos[0].width, height: item.photos[0].height, loading: 'lazy' }),
  h('span', { class: 'eyebrow' }, { story: 'História fotográfica', spotlight: 'Fotógrafo em destaque' }[item.kind]),
  h('h3', {}, item.title), h('p', {}, item.intro), h('span', { class: 'community-more' }, 'Descobrir'))));
  if (!chosen.length) root.append(h('p', {}, 'A comunidade está a preparar novas histórias. Partilha o teu olhar sobre Moçambique.'));
}).catch(() => root.replaceChildren(h('a', { href: '/comunidade', class: 'hero__explore' }, 'Descobrir a comunidade'))).finally(() => { root.dataset.layoutReady = 'true'; });
