/*
 * Dados iniciais para desenvolvimento local.
 *   npm run seed            → cria contas e fotografias (se ainda não existirem)
 *   npm run seed -- --reset → apaga a base de dados e recria
 *
 * As fotografias são reais, de Moçambique, publicadas no Unsplash (licença Unsplash:
 * uso livre, incluindo comercial). Ficam na conta da curadoria e cada uma credita
 * o autor original. Local, câmara e dimensões vêm da própria ficha no Unsplash.
 *
 * Credenciais de desenvolvimento (NUNCA usar em produção):
 */
export const DEV_ADMIN = { username: 'admin', email: 'admin@lume.test', password: process.env.LUME_DEV_PASSWORD || crypto.randomBytes(24).toString('base64url') };

import crypto from 'node:crypto';
import { db, tx } from '../server/db.js';
import { hashPassword } from '../server/auth.js';

if (process.env.NODE_ENV === 'production') throw new Error('O seed de demonstração está desactivado em produção. Usa catalog:import e admin.');

if (process.argv.includes('--reset')) {
  db.exec('DELETE FROM featured; DELETE FROM collection_items; DELETE FROM collections; DELETE FROM inspired; DELETE FROM photos; DELETE FROM sessions; DELETE FROM users;');
}

const CURATOR = { username: 'lume.curadoria', display: 'Curadoria LUME' };

// [id Unsplash, ficheiro, largura, altura, autor, @autor, título, província, cidade, câmara, telemóvel, estado]
const PHOTOS = [
  ['LbhNj3qARcM', 'photo-1526998758291-f87c4c1a8fff', 5221, 3462, 'Rohan Reddy', 'rofotoqoto', 'Contemplação', 'maputo-cidade', 'Maputo', 'Canon EOS 5D Mark II', ''],
  ['cGmVDaKt-bU', 'photo-1543960366-ef0016e1006b', 4928, 3264, 'redcharlie', 'redcharlie', 'Futebol ao Fim da Tarde', 'maputo-cidade', 'Maputo', 'Nikon D7000', ''],
  ['K7yZkRFqBpo', 'photo-1620832465790-f12ef048118e', 4032, 2603, 'Valério Maúnde', 'vmaunde', 'Baía ao Pôr do Sol', 'maputo-cidade', 'Maputo', '', 'iPhone 11'],
  ['kZIieXwRMDQ', 'photo-1747173588094-f14c00f7705e', 6000, 4000, 'Sergio Martins', 'smartins20', 'A Ponte ao Longe', 'maputo-cidade', 'Maputo', 'Canon EOS R8', ''],
  ['sHxMvHv0tSY', 'photo-1709016038902-e77ff1a34744', 6763, 10432, 'Mister Paps', 'themisterpaps', 'Mural dos Combatentes', 'maputo-cidade', 'Maputo', '', 'Samsung SM-G998U'],
  ['jazQPGgTiNk', 'photo-1692857477588-d024201cdcfa', 9000, 12000, 'Mister Paps', 'themisterpaps', 'Igreja Ortodoxa Grega', 'maputo-cidade', 'Maputo', '', 'Samsung SM-G998U'],
  ['_CE8WkkfaKU', 'photo-1721403901773-ce6d56b709d2', 6000, 4000, 'Omoniyi David', 'mocream_coffee', 'Passeio à Beira-Mar', 'maputo-cidade', 'Maputo', 'Nikon D5300', ''],
  ['SDWOguO1lh4', 'photo-1734592212133-a65ba7225c68', 6960, 4640, 'George Swanepoel', 'geo_swanepoel', 'Fim de Tarde na Praia', 'maputo-cidade', 'Maputo', 'Canon EOS 90D', ''],
  ['YstG5_GgXdY', 'photo-1721011837154-82cd57a106b5', 5839, 3893, 'Omoniyi David', 'mocream_coffee', 'Baía de Maputo', 'maputo-cidade', 'Maputo', 'Nikon D5300', ''],
  ['lFXjTiYcGDA', 'photo-1721011838220-b16d86f9d5e5', 5888, 3926, 'Omoniyi David', 'mocream_coffee', 'Catembe ao Entardecer', 'maputo-cidade', 'Catembe', 'Nikon D5300', ''],
  ['bcNcpCvZ8Vo', 'photo-1705858348972-d4196c414284', 6299, 10078, 'Mister Paps', 'themisterpaps', 'Arcadas e Palmeiras', 'maputo-cidade', 'Maputo', '', 'Samsung SM-G998U'],
  ['0_32AIxy1Hk', 'photo-1517584623449-78bf7667d0f6', 4961, 3508, 'Wynand Uys', 'wynand_uys', 'Golfinhos da Ponta do Ouro', 'maputo-provincia', 'Ponta do Ouro', 'Canon EOS 6D', ''],
  ['_kOcZHXqkdA', 'photo-1517584346828-d6e40a916aee', 4961, 3508, 'Wynand Uys', 'wynand_uys', 'Onda Vista de Cima', 'maputo-provincia', 'Ponta do Ouro', 'Canon EOS 6D', ''],
  ['MrwvwP3tYRg', 'photo-1551523577-51f7c17957cc', 2912, 3640, 'Sebastian Staines', 'seabas', 'Tofo em Turquesa', 'inhambane', 'Tofo', 'Hasselblad L1D-20c', ''],
  ['t4F3L78nhUk', 'photo-1721419951438-b1dd99f1a1b0', 6000, 4000, 'Omoniyi David', 'mocream_coffee', 'Tuk-tuks à Sombra', 'inhambane', 'Inhambane', 'Nikon D5300', ''],
  ['7ceIQgpS74k', 'photo-1721011794324-087ac0078792', 6000, 4000, 'Omoniyi David', 'mocream_coffee', 'Palmeiras de Maxixe', 'inhambane', 'Maxixe', 'Nikon D5300', ''],
  ['m3lB7oNL67A', 'photo-1721403955571-d08f55482f3c', 5635, 3756, 'Omoniyi David', 'mocream_coffee', 'Surf no Tofo', 'inhambane', 'Tofo', 'Nikon D5300', ''],
  ['iu1N8Ojoo-U', 'photo-1605383249718-4c4d08607e6c', 3264, 1836, 'Kyle Petzer', 'kylepetzer', 'Dhow em Inhambane', 'inhambane', 'Inhambane', '', 'iPhone 6'],
  ['bWFvE_zq_Rs', 'photo-1567452340395-718b7a94a1c8', 11750, 3702, 'Hugh Brown', 'hughbee', 'Vilankulo em Panorama', 'inhambane', 'Vilankulo', '', 'iPhone 8 Plus'],
  ['RvmKPvXHGpA', 'photo-1565104165703-0777aab1b278', 6000, 4000, 'Dan Maisey', 'dwm12', 'Benguerra Verde', 'inhambane', 'Ilha de Benguerra', 'Canon EOS 800D', ''],
  ['Fhx_SD9N7ew', 'photo-1666778439853-540bae64fa9f', 2592, 1944, 'Pat Sakellari', 'patsakellari', 'Arquipélago de Bazaruto', 'inhambane', 'Bazaruto', 'Sony DSC-T500', ''],
  ['ta2Jr08B5rU', 'photo-1706788477561-aebc58c132a4', 4096, 2304, 'Laxmish Nayak', 'thelaxmishnayak', 'Barcos de Nacala', 'nampula', 'Nacala', '', ''],
  ['zwfoM0PBB5g', 'photo-1706176162488-3fb8bcff10fa', 3110, 2073, 'Claudia Salamone', 'claudia_74', 'Ruína na Ilha', 'nampula', 'Ilha de Moçambique', 'Canon EOS 6D', ''],
  ['PAtPsdTUOYo', 'photo-1757421392145-11edc7759684', 2921, 2936, 'Mister Paps', 'themisterpaps', 'Sé Catedral de Nampula', 'nampula', 'Nampula', '', ''],
  ['D3ZojRFM8rI', 'photo-1595761033910-f8993636082d', 3393, 2545, 'Dimitry B', 'dimitry_b', 'Regresso no Ibo', 'cabo-delgado', 'Ilha do Ibo', '', 'Samsung SM-G950F'],
  ['gO3uzl86USU', 'photo-1625646152196-12e94cba4ec0', 3944, 2629, 'Dimitry B', 'dimitry_b', 'Dhow no Ibo', 'cabo-delgado', 'Ilha do Ibo', 'Fujifilm X-T3', ''],
  ['TWv8kWuiEJk', 'photo-1574622858722-df7d9efe1cce', 3781, 2836, 'Dimitry B', 'dimitry_b', 'Ilha das Rolas', 'cabo-delgado', 'Ilha das Rolas', '', 'Samsung SM-G950F'],
  ['WPXyNNIIJ44', 'photo-1790873033103-a39b7bc40c7d', 5184, 3456, 'Betti S', 'bundlofjoy', 'Estrela-do-Mar', 'cabo-delgado', 'Pemba', 'Canon EOS Rebel T3i', ''],
  ['JEAx7PIrZuI', 'photo-1660247270900-4a7629eb8404', 3024, 4032, 'Eric Correia', 'orefiel', 'Torre na Beira', 'sofala', 'Beira', '', 'iPhone XS Max'],
  ['jvJ2iBZBJp4', 'photo-1577915121188-e539c76bb3f9', 4592, 3064, 'Bilderboken', 'bilderboken', 'Berma da Estrada', 'sofala', 'Beira', 'Panasonic DMC-GX80', ''],
  ['pIvTB2-8fDk', 'photo-1605534230346-e8f221e99ae0', 3229, 2422, 'Kyle Petzer', 'kylepetzer', 'Muro Vermelho', 'gaza', 'Bilene', '', 'iPhone 6'],
  ['gWSdPEzVKCs', 'photo-1664048636048-46d757b7a930', 1944, 2592, 'Gervasio Da Silva', 'gervasio07', 'Flor de Chimoio', 'manica', 'Chimoio', '', 'Xiaomi M2101K6I'],
  // Exemplos à espera de curadoria (para testar /bastidores)
  ['Hvvm3Iqtyo0', 'photo-1658872181467-d041dc3b5cf5', 4640, 6960, 'Zeke Tucker', 'zeketucker', 'Estrada de Gumbane', 'inhambane', 'Gumbane', 'Canon EOS 90D', '', 'pending'],
  ['CJ1HMIqeKzc', 'photo-1639309527384-02fec9eff92a', 2864, 3818, 'Dimitry B', 'dimitry_b', 'Arimba Vista do Céu', 'cabo-delgado', 'Arimba', '', 'Samsung SM-G950F', 'pending'],
  ['JTTYNn49SzM', 'photo-1761205930684-d8de865e6886', 5472, 3648, 'Nathalie Lays', 'nath_lays', 'Maré Baixa em Vilankulo', 'inhambane', 'Vilankulo', 'Sony DSC-RX10M4', '', 'pending'],
];

const img = (file, w) => `https://images.unsplash.com/${file}?ixlib=rb-4.1.0&auto=format&q=80&w=${w}`;
const utm = 'utm_source=lume&utm_medium=referral';

tx(() => {
  const existing = db.prepare('SELECT id FROM users WHERE username = ?');
  const insertUser = db.prepare(`INSERT INTO users (username, display_name, email, password_hash, bio, instagram, behance, role)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);

  if (!existing.get(DEV_ADMIN.username)) {
    insertUser.run(DEV_ADMIN.username, 'Equipa LUME', DEV_ADMIN.email, hashPassword(DEV_ADMIN.password),
      'Curadoria do LUME.', 'https://www.instagram.com/mainearqvs', '', 'admin');
  }
  // Conta sem palavra-passe utilizável: só serve para agrupar as fotografias curadas
  const curatorId = existing.get(CURATOR.username)?.id ?? insertUser.run(
    CURATOR.username, CURATOR.display, 'curadoria@lume.test', hashPassword(crypto.randomBytes(32).toString('hex')),
    'Fotografias de Moçambique seleccionadas pela LUME. Cada imagem credita o seu autor original.',
    'https://www.instagram.com/mainearqvs', '', 'user',
  ).lastInsertRowid;

  if (db.prepare('SELECT COUNT(*) AS n FROM photos').get().n > 0) {
    console.log('Já existem fotografias — nada a fazer. Usa --reset para recriar.');
    return;
  }

  const adminId = existing.get(DEV_ADMIN.username).id;
  const insertPhoto = db.prepare(`INSERT INTO photos
      (user_id, title, province, city, camera, phone, src, thumb, width, height, status,
       credit_name, credit_url, source_url, created_at, reviewed_at, reviewed_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', ?), ?, ?)`);

  PHOTOS.forEach(([id, file, w, h, name, username, title, province, city, camera, phone, status = 'approved'], i) => {
    insertPhoto.run(
      curatorId, title, province, city, camera, phone, img(file, 2400), img(file, 800), w, h, status,
      name, `https://unsplash.com/@${username}?${utm}`, `https://unsplash.com/photos/${id}?${utm}`,
      `-${PHOTOS.length - i} hours`,
      status === 'approved' ? new Date().toISOString() : null, status === 'approved' ? adminId : null,
    );
  });

  const week = db.prepare("SELECT id FROM photos WHERE title = 'Golfinhos da Ponta do Ouro'").get();
  db.prepare('INSERT INTO featured (photo_id, note, featured_by) VALUES (?, ?, ?)')
    .run(week.id, 'Seis golfinhos nas águas calmas da Ponta do Ouro, vistos de cima.', adminId);

  console.log(`Criadas ${PHOTOS.length} fotografias reais (Unsplash) e 2 contas.`);
});
