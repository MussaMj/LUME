import { showSkeleton } from './skeleton.js';
import { confirmDialog, $, api, h, initNav, reveal, toast, requireLogin } from './core.js';
import { createMasonry } from './masonry.js';
import { openCinema } from './cinema.js';

const username = decodeURIComponent(location.pathname.replace(/^\/@/, '').replace(/\/$/, ''));
initNav('perfil');

$('#gallery').hidden = false;
const clearProfileSkeleton = showSkeleton($('#grid'));
let data;
try {
  data = await api(`/users/${encodeURIComponent(username)}`);
} catch {
  clearProfileSkeleton(); $('#gallery').hidden = true;
  $('#notFound').hidden = false;
  throw new Error('perfil inexistente');
}

clearProfileSkeleton();
const { user, photos, isOwner } = data;
document.title = `${user.displayName} — LUME`;

function renderHeader(u) {
  $('#handle').textContent = `@${u.username}`;
  $('#name').textContent = u.displayName;
  $('#bio').textContent = u.bio;
  $('#links').replaceChildren(
    ...[['Instagram', u.instagram], ['Behance', u.behance]]
      .filter(([, url]) => url)
      .map(([label, url]) => h('a', { href: url, target: '_blank', rel: 'noopener' }, label)),
  );
}

renderHeader(user);
$('#statPhotos').textContent = photos.length;
$('#statRegions').textContent = new Set(photos.map((p) => p.province)).size;
$('#statFeatured').textContent = user.featuredCount;
$('#profile').hidden = false;
reveal();

const followArea = h('div', { class: 'follow-tools' });
$('#profile > div').append(followArea);
const followersLabel = h('span', { class: 'hint' }, `${data.followers} seguidores`);
followArea.append(followersLabel);
if (!isOwner) {
  let following = data.following;
  let notifyEmail = data.notifyEmail;
  const status = h('span', { class: 'follow-email__status', id: 'emailPreferenceStatus', role: 'status', 'aria-live': 'polite' });
  const email = h('button', { type: 'button', class: 'email-switch', role: 'switch',
    'aria-label': 'Receber novidades por e-mail', 'aria-checked': String(notifyEmail), 'aria-describedby': 'emailPreferenceHelp emailPreferenceStatus' },
    h('span', { class: 'email-switch__track', 'aria-hidden': 'true' }, h('span', { class: 'email-switch__thumb' })));
  const label = h('div', { class: 'follow-email' },
    h('div', { class: 'follow-email__copy' }, h('strong', {}, 'Novas fotografias por e-mail'),
      h('p', { id: 'emailPreferenceHelp' }, 'Recebe um aviso quando este fotógrafo publicar uma nova fotografia.'), status), email);
  const paintPreference = () => {
    email.setAttribute('aria-checked', String(notifyEmail));
    label.dataset.enabled = String(notifyEmail);
    status.textContent = notifyEmail ? 'Activadas' : 'Desactivadas';
  };
  paintPreference();
  label.hidden = !following;
  const button = h('button', { class: 'btn btn--ghost btn--small', onclick: async () => {
    if (!(await requireLogin('Entra para seguir este fotógrafo.'))) return;
    button.disabled = email.disabled = true;
    try {
      await api(`/users/${username}/follow`, { method: following ? 'DELETE' : 'POST', ...(following ? {} : { body: { notifyEmail: false } }) });
      following = !following;
      notifyEmail = false;
      paintPreference();
      button.textContent = following ? 'A seguir · Deixar de seguir' : 'Seguir fotógrafo';
      label.hidden = !following;
      data.followers += following ? 1 : -1;
      followersLabel.textContent = `${data.followers} seguidores`;
      toast(following ? 'Vais receber novidades na Comunidade. Podes activar os avisos por e-mail abaixo.' : 'Deixaste de seguir este fotógrafo.');
    } catch (err) { toast(err.message, { error: true }); }
    finally { button.disabled = email.disabled = false; }
  } }, following ? 'A seguir · Deixar de seguir' : 'Seguir fotógrafo');
  email.addEventListener('click', async () => {
    const next = !notifyEmail;
    email.disabled = button.disabled = true;
    label.setAttribute('aria-busy', 'true');
    status.textContent = 'A guardar…';
    try {
      await api(`/users/${username}/follow`, { method: 'POST', body: { notifyEmail: next } });
      notifyEmail = next;
      paintPreference();
      toast(notifyEmail ? 'Avisos por e-mail activados.' : 'Avisos por e-mail desactivados.');
    } catch (err) {
      paintPreference();
      status.textContent = 'Não foi possível guardar. Tenta novamente.';
      toast(err.message, { error: true });
    } finally {
      email.disabled = button.disabled = false;
      label.removeAttribute('aria-busy');
    }
  });
  followArea.append(button, label);
}

/* ---------- Portefólio (aprovadas) ---------- */
$('#gallery').hidden = false;
if (photos.length) {
  const grid = createMasonry($('#grid'), { onOpen: (i) => openCinema(grid.photos, i), minColumn: 280,
    cardExtras: (photo) => isOwner && h('button', { class: 'btn btn--ghost btn--small', onclick: () => {
      const note = h('textarea', { maxlength: 1200, 'aria-label': 'Por trás da fotografia' }); note.value = photo.behindNote || '';
      const dialog = h('dialog', { class: 'note-dialog' }, h('h2', {}, 'Por trás desta fotografia'), note,
        h('button', { class: 'btn', onclick: async () => {
          try { await api(`/photos/${photo.id}/story`, { method: 'PATCH', body: { behindNote: note.value } }); photo.behindNote = note.value; dialog.close(); toast('Nota guardada.'); }
          catch (err) { toast(err.message, { error: true }); }
        } }, 'Guardar'), h('button', { class: 'btn btn--ghost', onclick: () => dialog.close() }, 'Cancelar'));
      dialog.addEventListener('close', () => dialog.remove()); document.body.append(dialog); dialog.showModal();
    } }, 'Contar este momento') });
  grid.add(photos);
} else {
  $('#grid').append(h('div', { class: 'empty' },
    h('strong', {}, 'Ainda sem fotografias publicadas'),
    isOwner ? 'As tuas fotografias aparecem aqui depois da curadoria.' : 'Volta em breve.',
    isOwner && h('br'), isOwner && h('a', { class: 'btn', href: '/enviar' }, 'Enviar fotografia')));
}

/* ---------- Área do dono ---------- */
if (isOwner) {
  $('#ownerTools').hidden = false;
  const panel = $('#editPanel');
  $('#editToggle').addEventListener('click', () => {
    panel.classList.toggle('is-open');
    if (panel.classList.contains('is-open')) $('#fName').focus();
  });

  const me = await api('/auth/me').then((d) => d.user);
  $('#fName').value = me.displayName;
  $('#fBio').value = me.bio;
  $('#fInstagram').value = me.instagram;
  $('#fBehance').value = me.behance;

  $('#editForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('#editError').textContent = '';
    try {
      const { user: updated } = await api('/auth/me', {
        method: 'PATCH',
        body: {
          displayName: $('#fName').value.trim(),
          bio: $('#fBio').value.trim(),
          instagram: $('#fInstagram').value.trim(),
          behance: $('#fBehance').value.trim(),
        },
      });
      renderHeader(updated);
      $('#fInstagram').value = updated.instagram;
      $('#fBehance').value = updated.behance;
      panel.classList.remove('is-open');
      toast('Perfil actualizado.');
    } catch (err) {
      $('#editError').textContent = err.message;
    }
  });

  // Envios em todos os estados (pendente / aprovada / rejeitada)
  const { photos: mine } = await api('/me/photos');
  const notPublic = mine.filter((p) => p.status !== 'approved');
  if (notPublic.length) {
    $('#envios').hidden = false;
    const pending = notPublic.filter((p) => p.status === 'pending').length;
    $('#pendingInfo').textContent = pending ? `${pending} em curadoria` : '';
    const LABEL = { pending: 'Em curadoria', rejected: 'Não aprovada', approved: 'Publicada' };
    const grid = createMasonry($('#mine'), {
      onOpen: (i) => openCinema(grid.photos, i),
      minColumn: 220,
      cardExtras: (p) => h('div', {},
        h('span', { class: `pin__badge pin__badge--${p.status}` }, LABEL[p.status]),
        p.rejectReason && h('p', { class: 'pin__reason' }, p.rejectReason),
        h('div', { class: 'pin__tools' },
          h('button', {
            class: 'btn btn--danger btn--small',
            onclick: async () => {
              if (!(await confirmDialog({ title: 'Apagar fotografia?', message: `“${p.title}” será apagada. Esta acção não pode ser desfeita.`, confirmLabel: 'Apagar fotografia' }))) return;
              try {
                await api(`/photos/${p.id}`, { method: 'DELETE' });
                grid.remove(p.id);
                toast('Envio apagado.');
              } catch (err) { toast(err.message, { error: true }); }
            },
          }, 'Apagar'))),
    });
    grid.add(notPublic);
    if (location.hash === '#envios') $('#envios').scrollIntoView();
  }
}
