import { $, $$, ICONS, initNav, loginUrl, PROVINCES, reveal } from './core.js';

const MAX_EDGE = 2560;   // versão completa
const THUMB_EDGE = 900;  // versão para a grelha
const MIN_EDGE = 1200;
const PHONE_MAKERS = /apple|samsung|google|xiaomi|huawei|oppo|vivo|oneplus|motorola|tecno|infinix|itel|realme|honor|nokia/i;

$$('[data-icon]').forEach((el) => { el.innerHTML = ICONS[el.dataset.icon]; });
reveal();

const me = await initNav('enviar');
if (!me) {
  location.replace(loginUrl());
} else {
  $('#uploadForm').hidden = false;

const select = $('#province');
PROVINCES.forEach((p) => select.append(new Option(p.name, p.id)));

/* ---------- Escolha da imagem ---------- */
let bitmap = null;
const drop = $('#drop');
const fileInput = $('#file');
const error = $('#error');

fileInput.addEventListener('change', () => fileInput.files[0] && useFile(fileInput.files[0]));
['dragenter', 'dragover'].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add('is-over'); }));
['dragleave', 'drop'].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.remove('is-over'); }));
drop.addEventListener('drop', (e) => e.dataTransfer.files[0] && useFile(e.dataTransfer.files[0]));

async function useFile(file) {
  error.textContent = '';
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
    error.textContent = 'Formato não suportado. Usa JPG, PNG ou WebP.';
    return;
  }
  if (file.size > 40 * 1024 * 1024) {
    error.textContent = 'Ficheiro demasiado grande.';
    return;
  }
  try {
    // createImageBitmap aplica a orientação EXIF → a imagem fica sempre direita
    bitmap = await createImageBitmap(file);
  } catch {
    error.textContent = 'Não foi possível ler esta imagem.';
    return;
  }
  if (Math.max(bitmap.width, bitmap.height) < MIN_EDGE) {
    error.textContent = `A imagem é pequena demais (${bitmap.width}×${bitmap.height}). Mínimo ${MIN_EDGE} px no lado maior.`;
    bitmap = null;
    return;
  }
  const preview = $('#preview');
  URL.revokeObjectURL(preview.src);
  preview.src = URL.createObjectURL(file);
  drop.classList.add('has-image');

  if (file.type === 'image/jpeg') fillGear(await readExif(file));
  if (!$('#title').value) $('#title').focus();
}

function fillGear(exif) {
  if (!exif) return;
  const make = (exif.make || '').trim();
  let model = (exif.model || '').trim();
  if (make && !model.toLowerCase().startsWith(make.split(' ')[0].toLowerCase())) model = `${make} ${model}`.trim();
  const set = (id, v) => { if (v && !$(id).value) $(id).value = v.slice(0, 80); };
  if (PHONE_MAKERS.test(make)) set('#phone', model);
  else set('#camera', model);
  set('#lens', exif.lens);
}

/* ---------- EXIF mínimo: Make, Model, LensModel ---------- */
async function readExif(file) {
  try {
    const view = new DataView(await file.slice(0, 256 * 1024).arrayBuffer());
    if (view.getUint16(0) !== 0xffd8) return null;
    let off = 2;
    while (off < view.byteLength - 4) {
      const marker = view.getUint16(off);
      const size = view.getUint16(off + 2);
      if (marker === 0xffe1 && view.getUint32(off + 4) === 0x45786966) return parseTiff(view, off + 10);
      off += 2 + size;
    }
  } catch { /* sem EXIF legível */ }
  return null;
}

function parseTiff(view, start) {
  const little = view.getUint16(start) === 0x4949;
  const u16 = (o) => view.getUint16(start + o, little);
  const u32 = (o) => view.getUint32(start + o, little);
  const ascii = (entry) => {
    const count = u32(entry + 4);
    const at = count > 4 ? u32(entry + 8) : entry + 8;
    let s = '';
    for (let i = 0; i < count - 1; i++) s += String.fromCharCode(view.getUint8(start + at + i));
    return s.replace(/\0/g, '').trim();
  };
  const out = {};
  const readIfd = (ifd) => {
    const n = u16(ifd);
    for (let i = 0; i < n; i++) {
      const e = ifd + 2 + i * 12;
      const tag = u16(e);
      if (tag === 0x010f) out.make = ascii(e);
      if (tag === 0x0110) out.model = ascii(e);
      if (tag === 0xa434) out.lens = ascii(e);
      if (tag === 0x8769) readIfd(u32(e + 8));
    }
  };
  readIfd(u32(4));
  return out;
}

/* ---------- Redimensionar (remove também todos os metadados, incluindo GPS) ---------- */
function resized(edge, quality) {
  const scale = Math.min(1, edge / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
}

/* ---------- Envio ---------- */
$('#uploadForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  error.textContent = '';
  if (!bitmap) return (error.textContent = 'Escolhe uma fotografia.');
  for (const [id, label] of [['#title', 'o título'], ['#province', 'a província'], ['#city', 'a cidade ou localidade']]) {
    if (!$(id).value.trim()) {
      error.textContent = `Falta ${label}.`;
      $(id).focus();
      return;
    }
  }

  const submit = $('#submit');
  submit.disabled = true;
  submit.textContent = 'A preparar…';

  const form = new FormData();
  form.append('image', await resized(MAX_EDGE, 0.9), 'foto.jpg');
  form.append('thumb', await resized(THUMB_EDGE, 0.82), 'thumb.jpg');
  for (const name of ['behindNote', 'mood', 'title', 'category', 'province', 'city', 'description', 'camera', 'lens', 'phone']) {
    form.append(name, $(`#${name}`).value.trim());
  }

  const progress = $('.progress');
  progress.hidden = false;
  submit.textContent = 'A enviar…';

  const xhr = new XMLHttpRequest();
  xhr.open('POST', '/api/photos');
  xhr.upload.onprogress = (ev) => {
    if (ev.lengthComputable) $('#progressBar').style.width = `${(ev.loaded / ev.total) * 100}%`;
  };
  xhr.onload = () => {
    let data = {};
    try { data = JSON.parse(xhr.responseText); } catch {}
    if (xhr.status === 201) {
      $('#uploadForm').hidden = true;
      $('.page-head').hidden = true;
      $('#profileLink').href = `/@${me.username}#envios`;
      $('#success').hidden = false;
      window.scrollTo({ top: 0 });
    } else {
      fail(data.error || 'Não foi possível enviar.');
    }
  };
  xhr.onerror = () => fail('Sem ligação. Tenta outra vez.');
  xhr.send(form);

  function fail(msg) {
    error.textContent = msg;
    submit.disabled = false;
    submit.textContent = 'Enviar para curadoria';
    progress.hidden = true;
  }
});

}
