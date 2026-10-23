import { h } from './core.js';
export function showSkeleton(container, count = 6, { append = false } = {}) {
  const skeleton = h('div', { class:'skeleton-grid', role:'status', 'aria-label':'A carregar fotografias' },
    Array.from({length:count},(_,i)=>h('div',{class:'skeleton-card','aria-hidden':'true'},
      h('div',{class:'skeleton-block',style:`aspect-ratio:${i%3===0?'3 / 4':'4 / 3'}`}),h('div',{class:'skeleton-line'}),h('div',{class:'skeleton-line skeleton-line--short'}))));
  container.setAttribute('aria-busy','true');
  if (append) container.after(skeleton); else container.append(skeleton);
  return () => { skeleton.remove(); container.setAttribute('aria-busy','false'); };
}
