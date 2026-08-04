const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const initSqlJs = require('sql.js');

const ROOT = path.resolve(__dirname, '..');
const ALBUMS_DIR = path.join(ROOT, 'MyAlbums');
const UPLOADS_DIR = path.join(ROOT, 'uploads');
const DB_PATH = path.join(ROOT, 'harmoni.db');

const DEFAULT_INCLUDES = [
  'Guide Profesional',
  'Air Mineral',
  'Dokumentasi Foto',
  'Tiket Masuk',
];

const DEFAULT_EXCLUDES = [
  'Transportasi ke Lokasi',
  'Makan Siang',
  'Asuransi Pribadi',
];

const ALBUMS = [
  {
    folder: 'Curug Cibaliung',
    slug: 'curug-cibaliung',
    tourName: 'Curug Cibaliung',
    cover: 'IMG-20260804-WA0044(1).jpg',
    gallery: 'IMG-20260804-WA0044(1).jpg',
    create: {
      duration: '2-3 jam', price: 150000, category: 'Rute Standar', difficulty: 'Sedang', distance: '4 km',
      description: 'Trekking menuju aliran Curug Cibaliung dengan kolam alami jernih, tebing batu, dan suasana hutan yang sejuk.',
    },
  },
  {
    folder: 'CURUG CIBINGBIN',
    slug: 'curug-cibingbin',
    existingTour: 'Curug Cibingbin',
    cover: 'IMG-20260804-WA0032.jpg',
    gallery: 'IMG-20260804-WA0030.jpg',
  },
  {
    folder: 'curug hordeng',
    slug: 'curug-hordeng',
    tourName: 'Curug Hordeng',
    cover: 'IMG-20260804-WA0070.jpg',
    gallery: 'IMG-20260804-WA0067.jpg',
    create: {
      duration: '2-3 jam', price: 150000, category: 'Rute Standar', difficulty: 'Sedang', distance: '4-5 km',
      description: 'Jalur trekking hijau menuju Curug Hordeng dengan aliran air bertingkat dan kolam alami di tengah hutan Sentul.',
    },
  },
  {
    folder: 'curug leuwi asih',
    slug: 'curug-leuwi-asih',
    tourName: 'Curug Leuwi Asih',
    cover: 'IMG-20260804-WA0072.jpg',
    gallery: 'IMG-20260804-WA0074.jpg',
    create: {
      duration: '1-2 jam', price: 150000, category: 'Rute Ringan', difficulty: 'Mudah', distance: '3 km',
      description: 'Rute ramah keluarga menuju Leuwi Asih melalui area persawahan dan jalur desa dengan tempat bermain air yang menyegarkan.',
    },
  },
  {
    folder: 'CURUG LEWI HEJO',
    slug: 'curug-leuwi-hejo',
    existingTour: 'Curug Leuwi Hejo',
    cover: 'IMG-20260804-WA0019.jpg',
    gallery: 'IMG-20260804-WA0019.jpg',
  },
  {
    folder: 'Curug Love',
    slug: 'curug-love',
    tourName: 'Curug Love',
    cover: 'IMG-20260804-WA0055.jpg',
    gallery: 'IMG-20260804-WA0049.jpg',
    create: {
      duration: '2-3 jam', price: 150000, category: 'Rute Standar', difficulty: 'Sedang', distance: '4 km',
      description: 'Perjalanan melintasi sawah, rumpun bambu, dan jalur hutan menuju Curug Love yang cocok untuk trekking bersama rombongan.',
    },
  },
  {
    folder: 'Offroad hambalang',
    slug: 'offroad-hambalang',
    existingTour: 'Offroad Sentul Hambalang',
    cover: 'IMG-20260804-WA0061.jpg',
    gallery: 'IMG-20260804-WA0061.jpg',
  },
  {
    folder: 'Trekking GoaGarungag',
    slug: 'goa-garunggang',
    existingTour: 'Goa Agung Garunggang',
    cover: 'IMG-20260804-WA0040.jpg',
    gallery: 'IMG-20260804-WA0039.jpg',
  },
];

function rows(db, sql, params = []) {
  const statement = db.prepare(sql);
  statement.bind(params);
  const result = [];
  while (statement.step()) result.push(statement.getAsObject());
  statement.free();
  return result;
}

function row(db, sql, params = []) {
  return rows(db, sql, params)[0] || null;
}

function lastInsertId(db) {
  return row(db, 'SELECT last_insert_rowid() AS id').id;
}

function findTour(db, album) {
  const search = album.existingTour || album.tourName;
  return row(db, 'SELECT * FROM tours WHERE LOWER(name) LIKE LOWER(?) ORDER BY id LIMIT 1', [`%${search}%`]);
}

function createTour(db, album) {
  const details = album.create;
  const itinerary = JSON.stringify([
    'Bertemu dengan guide dan briefing perjalanan',
    'Trekking menyusuri jalur alam menuju destinasi',
    'Istirahat, bermain air, dan dokumentasi',
    'Kembali menuju titik pertemuan',
  ]);
  const preparations = JSON.stringify([
    'Gunakan sepatu atau sandal trekking yang tidak licin',
    'Bawa pakaian ganti dan perlindungan dari hujan',
    'Pastikan kondisi tubuh sehat sebelum perjalanan',
  ]);

  db.run(
    `INSERT INTO tours
      (name, location, duration, price, category, description, difficulty, distance, meeting_point, itinerary, preparations)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    [album.tourName, 'Sentul', details.duration, details.price, details.category, details.description,
      details.difficulty, details.distance, 'Sentul, Bogor', itinerary, preparations],
  );
  const tourId = lastInsertId(db);
  DEFAULT_INCLUDES.forEach(item => db.run('INSERT INTO tour_includes (tour_id, item) VALUES (?,?)', [tourId, item]));
  DEFAULT_EXCLUDES.forEach(item => db.run('INSERT INTO tour_excludes (tour_id, item) VALUES (?,?)', [tourId, item]));
  return row(db, 'SELECT * FROM tours WHERE id=?', [tourId]);
}

async function optimize(source, destination, maxSize = 1600) {
  await sharp(source)
    .rotate()
    .resize({ width: maxSize, height: maxSize, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 80, effort: 4 })
    .toFile(destination);
}

async function replaceTourImages(db, album, tourId) {
  const albumDir = path.join(ALBUMS_DIR, album.folder);
  if (!fs.existsSync(albumDir)) throw new Error(`Album not found: ${album.folder}`);

  const sourceFiles = fs.readdirSync(albumDir)
    .filter(file => /\.(jpe?g|png|webp|avif|gif)$/i.test(file))
    .sort((a, b) => a.localeCompare(b));
  if (!sourceFiles.includes(album.cover)) throw new Error(`Cover not found: ${album.folder}/${album.cover}`);

  const orderedFiles = [album.cover, ...sourceFiles.filter(file => file !== album.cover)];
  const oldImages = rows(db, 'SELECT filename FROM tour_images WHERE tour_id=? AND filename LIKE ?', [tourId, `album-${album.slug}-%`]);
  oldImages.forEach(image => {
    const filePath = path.join(UPLOADS_DIR, image.filename);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  });
  db.run('DELETE FROM tour_images WHERE tour_id=? AND filename LIKE ?', [tourId, `album-${album.slug}-%`]);

  for (let index = 0; index < orderedFiles.length; index += 1) {
    const filename = `album-${album.slug}-${String(index + 1).padStart(2, '0')}.webp`;
    await optimize(path.join(albumDir, orderedFiles[index]), path.join(UPLOADS_DIR, filename));
    db.run('INSERT INTO tour_images (tour_id, filename, sort_order) VALUES (?,?,?)', [tourId, filename, index]);
  }
  return orderedFiles.length;
}

async function replaceGalleryImages(db) {
  const previous = rows(db, 'SELECT filename FROM gallery');
  previous.forEach(image => {
    const references = row(db,
      'SELECT (SELECT COUNT(*) FROM tour_images WHERE filename=?) + (SELECT COUNT(*) FROM slides WHERE filename=?) AS count',
      [image.filename, image.filename]);
    const filePath = path.join(UPLOADS_DIR, image.filename);
    if (!references.count && fs.existsSync(filePath)) fs.unlinkSync(filePath);
  });
  db.run('DELETE FROM gallery');

  for (const album of ALBUMS) {
    const filename = `gallery-album-${album.slug}.webp`;
    await optimize(path.join(ALBUMS_DIR, album.folder, album.gallery), path.join(UPLOADS_DIR, filename), 1400);
    db.run('INSERT INTO gallery (filename, caption) VALUES (?,?)', [filename, album.tourName || album.existingTour]);
  }
}

async function main() {
  if (!fs.existsSync(DB_PATH)) throw new Error('harmoni.db not found. Start the application once before importing albums.');
  if (!fs.existsSync(ALBUMS_DIR)) throw new Error('MyAlbums directory not found.');
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });

  const SQL = await initSqlJs();
  const db = new SQL.Database(fs.readFileSync(DB_PATH));

  try {
    db.run('BEGIN');
    for (const album of ALBUMS) {
      let tour = findTour(db, album);
      if (!tour) {
        if (!album.create) throw new Error(`Destination not found for album: ${album.folder}`);
        tour = createTour(db, album);
        console.log(`Created destination: ${tour.name}`);
      }
      const count = await replaceTourImages(db, album, tour.id);
      console.log(`Imported ${count} photos: ${tour.name}`);
    }
    await replaceGalleryImages(db);
    db.run('COMMIT');
    fs.writeFileSync(DB_PATH, Buffer.from(db.export()));
    console.log(`Gallery updated with ${ALBUMS.length} selected photos.`);
  } catch (error) {
    try { db.run('ROLLBACK'); } catch (_) {}
    throw error;
  } finally {
    db.close();
  }
}

main().catch(error => {
  console.error(`Album import failed: ${error.message}`);
  process.exit(1);
});
