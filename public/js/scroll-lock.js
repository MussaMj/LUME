// Fixed-body locking also works on iOS, where overflow:hidden alone leaks touch scroll.
const owners = new Set();
let saved;
export function lockPageScroll(owner) {
  if (owners.has(owner)) return;
  owners.add(owner);
  if (owners.size > 1) return;
  const body = document.body;
  saved = { x: scrollX, y: scrollY, body: body.getAttribute('style'),
    overscroll: document.documentElement.style.overscrollBehavior };
  Object.assign(body.style, { position: 'fixed', top: `-${saved.y}px`, left: `-${saved.x}px`, width: '100%', overflow: 'hidden' });
  document.documentElement.style.overscrollBehavior = 'none';
}
export function unlockPageScroll(owner) {
  if (!owners.delete(owner) || owners.size || !saved) return;
  if (saved.body === null) document.body.removeAttribute('style');
  else document.body.setAttribute('style', saved.body);
  document.documentElement.style.overscrollBehavior = saved.overscroll;
  window.scrollTo({ left: saved.x, top: saved.y, behavior: 'instant' });
  saved = null;
}
