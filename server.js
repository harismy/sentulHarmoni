/* ============================================
   Harmoni Trekking Sentul — Server
   Express + SQLite (sql.js) + Multer
   ============================================ */

const express = require('express');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const sharp = require('sharp');
const initSqlJs = require('sql.js');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, 'harmoni.db');
const UPLOADS_DIR = path.join(__dirname, 'uploads');

// ---------- Uploads Dir ----------
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// ---------- Multer ----------
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, 'img-' + Date.now() + '-' + Math.round(Math.random() * 1e6) + ext);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /\.(jpg|jpeg|png|gif|webp|bmp|avif)$/i;
    if (!allowed.test(path.extname(file.originalname))) {
      return cb(new Error('Format file tidak didukung. Gunakan JPG, PNG, WebP, GIF, BMP, atau AVIF.'));
    }
    cb(null, true);
  },
});

// ---------- WebP Converter ----------
async function convertToWebp(inputPath) {
  const webpPath = inputPath.replace(/\.[^.]+$/, '.webp');
  try {
    await sharp(inputPath)
      .webp({ quality: 80, effort: 4 })
      .toFile(webpPath);
    // Delete original if different extension
    if (inputPath !== webpPath) {
      try { fs.unlinkSync(inputPath); } catch(e) {}
    }
    return path.basename(webpPath);
  } catch (err) {
    console.error('WebP conversion failed, keeping original:', err.message);
    // If conversion fails, keep original but rename to .webp by just returning original filename
    return path.basename(inputPath);
  }
}

// Helper: convert all uploaded files to WebP
async function convertFilesToWebp(files) {
  if (!files || files.length === 0) return;
  for (const f of files) {
    const oldPath = path.join(UPLOADS_DIR, f.filename);
    const newName = await convertToWebp(oldPath);
    f.filename = newName;
    f.path = path.join(UPLOADS_DIR, newName);
  }
}

// ---------- Database ----------
let db;

function saveDb() {
  try { fs.writeFileSync(DB_PATH, Buffer.from(db.export())); } catch(e) { console.error('Save DB error:', e.message); }
}

function loadDb(SQL) {
  if (fs.existsSync(DB_PATH)) {
    const buf = fs.readFileSync(DB_PATH);
    return new SQL.Database(buf);
  }
  return new SQL.Database();
}

// Helper: run & get lastInsertRowid
function dbRun(sql, params = []) {
  db.run(sql, params);
  const r = db.exec('SELECT last_insert_rowid() as id');
  return r[0]?.values[0]?.[0] || 0;
}

// Helper: query all
function dbAll(sql, params = []) {
  const stmt = db.prepare(sql);
  if (params.length) stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

// Helper: query one
function dbGet(sql, params = []) {
  const rows = dbAll(sql, params);
  return rows[0] || null;
}

// ---------- Init ----------
async function init() {
  const SQL = await initSqlJs();
  db = loadDb(SQL);

  // Create tables
  db.run(`
    CREATE TABLE IF NOT EXISTS tours (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      location TEXT DEFAULT 'Sentul',
      duration TEXT DEFAULT '2-3 jam',
      price INTEGER DEFAULT 0,
      category TEXT DEFAULT 'Wisata',
      description TEXT DEFAULT '',
      difficulty TEXT DEFAULT 'Sedang',
      distance TEXT DEFAULT '',
      meeting_point TEXT DEFAULT 'Sentul, Bogor',
      itinerary TEXT DEFAULT '[]',
      preparations TEXT DEFAULT '[]'
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS tour_images (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tour_id INTEGER NOT NULL,
      filename TEXT NOT NULL,
      sort_order INTEGER DEFAULT 0,
      FOREIGN KEY (tour_id) REFERENCES tours(id) ON DELETE CASCADE
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS tour_includes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tour_id INTEGER NOT NULL,
      item TEXT NOT NULL,
      FOREIGN KEY (tour_id) REFERENCES tours(id) ON DELETE CASCADE
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS tour_excludes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tour_id INTEGER NOT NULL,
      item TEXT NOT NULL,
      FOREIGN KEY (tour_id) REFERENCES tours(id) ON DELETE CASCADE
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS slides (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL,
      title TEXT DEFAULT ''
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS gallery (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL,
      caption TEXT DEFAULT ''
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS partners (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      filename TEXT DEFAULT '',
      url TEXT DEFAULT '',
      sort_order INTEGER DEFAULT 0
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    )
  `);
  saveDb();

  // Seed default data
  const count = dbGet('SELECT COUNT(*) as c FROM tours');
  if (!count || count.c === 0) {
    seedData();
  }

  // Ensure settings
  const ensureSetting = (key, val) => {
    const s = dbGet('SELECT value FROM settings WHERE key=?', [key]);
    if (!s) db.run('INSERT INTO settings (key, value) VALUES (?,?)', [key, val]);
  };
  ensureSetting('wa', '083857161610');
  ensureSetting('ig', 'harmonitrekkingsentul');
  ensureSetting('address', 'Kp. Cibingbin Rt 001/006, Desa Bojongkoneng, Kec. Babakanmadang, Kab. Bogor, Jawa Barat');
  ensureSetting('admin_password', 'admin123');
  saveDb();

  console.log('✅ Database ready');
}

function seedData() {
  // Standardized include/exclude lists
  const REGULAR_INCLUDES = [
    'Tiket masuk wisata',
    'Tiket Parkir Kendaraan',
    'Air mineral',
    'Memandu',
    'P3K',
    'Foto Dokumentasi melalui smartphone',
    'Tongkat pendakian (dipinjamkan)',
    'Jalur Trekking',
    'Jas Hujan (Apabila terjadi hujan)',
  ];

  const REGULAR_EXCLUDES = [
    'Perlengkapan pribadi',
    'Obat obatan pribadi',
    'Transportasi dari Rumah masing-masing',
    'Panduan Tips',
  ];

  const OFFROAD_INCLUDES = [
    'Unit Offroad 4x4 Kapasitas 4 org',
    'Durasi 2 sd 3 Jam',
    'Driver',
    'BBM',
    'Air Mineral',
    'Tiket Jalur Offroad',
    'snack',
  ];

  const OFFROAD_EXCLUDES = [
    'Makan Siang',
    'Parkir Kendaraan Pribadi',
  ];

  const tours = [
    { name:'Curug Leuwi Hejo — Curug Cepet', location:'Sentul', duration:'2-3 jam', price:150000, category:'Rute Standar',
      description:'Trekking menyusuri curug terindah di Sentul. Melewati hutan tropis, sungai alami, dan pemandangan perbukitan yang memukau.',
      includes: REGULAR_INCLUDES,
      excludes: REGULAR_EXCLUDES },
    { name:'Bukit Indah — Curug Bidadari', location:'Sentul', duration:'1-2 jam', price:150000, category:'Rute Ringan',
      description:'Rute santai cocok untuk pemula dan keluarga. Melewati pemukiman warga, persawahan, perkebunan, bukit, dan sungai.',
      includes: REGULAR_INCLUDES,
      excludes: REGULAR_EXCLUDES },
    { name:'Goa Agung Garunggang', location:'Sentul', duration:'2-3 jam', price:150000, category:'Rute Standar',
      description:'Eksplorasi goa alam yang menakjubkan dengan stalaktit dan stalakmit alami.',
      includes: REGULAR_INCLUDES,
      excludes: REGULAR_EXCLUDES },
    { name:'Curug Cibingbin — Curug Ngumpet', location:'Sentul', duration:'2-3 jam', price:150000, category:'Rute Standar',
      description:'Jelajahi dua curug sekaligus dalam satu perjalanan.',
      includes: REGULAR_INCLUDES,
      excludes: REGULAR_EXCLUDES },
    { name:'Wisata Offroad Sentul Hambalang', location:'Sentul', duration:'2-3 jam', price:1200000, category:'Rute Hard',
      description:'Sensasi offroad menggunakan jeep 4x4 menyusuri jalur ekstrem Sentul.',
      includes: OFFROAD_INCLUDES,
      excludes: OFFROAD_EXCLUDES },
    { name:'Trekking Sentul Corporate', location:'Sentul', duration:'1-2 jam', price:265000, category:'Rute Ringan',
      description:'Program team building di alam terbuka. Cocok untuk acara kantor atau gathering.',
      includes: REGULAR_INCLUDES,
      excludes: REGULAR_EXCLUDES },
  ];

  for (const t of tours) {
    const id = dbRun('INSERT INTO tours (name, location, duration, price, category, description) VALUES (?,?,?,?,?,?)',
      [t.name, t.location, t.duration, t.price, t.category, t.description]);
    for (const item of t.includes) dbRun('INSERT INTO tour_includes (tour_id, item) VALUES (?,?)', [id, item]);
    for (const item of t.excludes) dbRun('INSERT INTO tour_excludes (tour_id, item) VALUES (?,?)', [id, item]);
  }
  saveDb();
  console.log('✅ Default tours seeded');
}

// ---------- Middleware ----------
app.use(express.json());
app.use(express.static(__dirname));
app.use('/uploads', express.static(UPLOADS_DIR));

// =============================================
// API ROUTES
// =============================================

// --- TOURS ---
function enrichTour(t) {
  t.images = dbAll('SELECT filename FROM tour_images WHERE tour_id=? ORDER BY sort_order, id', [t.id]).map(r => r.filename);
  t.includes = dbAll('SELECT item FROM tour_includes WHERE tour_id=? ORDER BY id', [t.id]).map(r => r.item);
  t.excludes = dbAll('SELECT item FROM tour_excludes WHERE tour_id=? ORDER BY id', [t.id]).map(r => r.item);
  t.image = t.images.length > 0 ? '/uploads/' + t.images[0] : '';
  // Parse JSON fields
  try { t.itinerary = JSON.parse(t.itinerary || '[]'); } catch(e) { t.itinerary = []; }
  try { t.preparations = JSON.parse(t.preparations || '[]'); } catch(e) { t.preparations = []; }
  return t;
}

app.get('/api/tours', (req, res) => {
  const tours = dbAll('SELECT * FROM tours ORDER BY id DESC');
  res.json(tours.map(enrichTour));
});

app.get('/api/tours/:id', (req, res) => {
  const t = dbGet('SELECT * FROM tours WHERE id=?', [parseInt(req.params.id)]);
  if (!t) return res.status(404).json({ error: 'Not found' });
  res.json(enrichTour(t));
});

app.post('/api/tours', upload.array('images', 10), async (req, res) => {
  const { name, location, duration, price, category, description, difficulty, distance, meeting_point, itinerary, preparations } = req.body;
  let includes = []; try { includes = JSON.parse(req.body.includes || '[]'); } catch(e){}
  let excludes = []; try { excludes = JSON.parse(req.body.excludes || '[]'); } catch(e){}

  // Convert uploaded images to WebP
  await convertFilesToWebp(req.files);

  const id = dbRun(
    'INSERT INTO tours (name, location, duration, price, category, description, difficulty, distance, meeting_point, itinerary, preparations) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
    [name||'', location||'Sentul', duration||'2-3 jam', parseInt(price)||0, category||'Wisata', description||'', difficulty||'Sedang', distance||'', meeting_point||'Sentul, Bogor', itinerary||'[]', preparations||'[]']
  );

  if (req.files) {
    req.files.forEach((f, i) => dbRun('INSERT INTO tour_images (tour_id, filename, sort_order) VALUES (?,?,?)', [id, f.filename, i]));
  }
  for (const item of includes) dbRun('INSERT INTO tour_includes (tour_id, item) VALUES (?,?)', [id, item]);
  for (const item of excludes) dbRun('INSERT INTO tour_excludes (tour_id, item) VALUES (?,?)', [id, item]);

  saveDb();
  res.json({ success: true, id });
});

app.put('/api/tours/:id', upload.array('images', 10), async (req, res) => {
  const tourId = parseInt(req.params.id);
  const existing = dbGet('SELECT * FROM tours WHERE id=?', [tourId]);
  if (!existing) return res.status(404).json({ error: 'Not found' });

  const { name, location, duration, price, category, description, difficulty, distance, meeting_point, itinerary, preparations } = req.body;
  let includes = []; try { includes = JSON.parse(req.body.includes || '[]'); } catch(e){}
  let excludes = []; try { excludes = JSON.parse(req.body.excludes || '[]'); } catch(e){}

  // Convert new uploaded images to WebP
  await convertFilesToWebp(req.files);

  // Use existing values as fallback for fields not sent in request
  db.run('UPDATE tours SET name=?, location=?, duration=?, price=?, category=?, description=?, difficulty=?, distance=?, meeting_point=?, itinerary=?, preparations=? WHERE id=?',
    [
      name ?? existing.name,
      location ?? existing.location,
      duration ?? existing.duration,
      parseInt(price) || existing.price || 0,
      category ?? existing.category,
      description ?? existing.description,
      difficulty ?? existing.difficulty,
      distance ?? existing.distance,
      meeting_point ?? existing.meeting_point,
      itinerary ?? existing.itinerary,
      preparations ?? existing.preparations,
      tourId
    ]);

  // Remove deleted images
  if (req.body.removeImages) {
    const removeList = JSON.parse(req.body.removeImages);
    for (const filename of removeList) {
      const fp = path.join(UPLOADS_DIR, filename);
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
      db.run('DELETE FROM tour_images WHERE tour_id=? AND filename=?', [tourId, filename]);
    }
  }

  // Add new images
  if (req.files && req.files.length > 0) {
    const maxOrder = dbGet('SELECT MAX(sort_order) as m FROM tour_images WHERE tour_id=?', [tourId]);
    let order = (maxOrder?.m || 0) + 1;
    req.files.forEach(f => dbRun('INSERT INTO tour_images (tour_id, filename, sort_order) VALUES (?,?,?)', [tourId, f.filename, order++]));
  }

  // Replace includes/excludes
  db.run('DELETE FROM tour_includes WHERE tour_id=?', [tourId]);
  db.run('DELETE FROM tour_excludes WHERE tour_id=?', [tourId]);
  for (const item of includes) dbRun('INSERT INTO tour_includes (tour_id, item) VALUES (?,?)', [tourId, item]);
  for (const item of excludes) dbRun('INSERT INTO tour_excludes (tour_id, item) VALUES (?,?)', [tourId, item]);

  saveDb();
  res.json({ success: true });
});

app.delete('/api/tours/:id', (req, res) => {
  const tourId = parseInt(req.params.id);
  const images = dbAll('SELECT filename FROM tour_images WHERE tour_id=?', [tourId]);
  for (const img of images) {
    const fp = path.join(UPLOADS_DIR, img.filename);
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
  }
  db.run('DELETE FROM tours WHERE id=?', [tourId]);
  saveDb();
  res.json({ success: true });
});

// --- SLIDES ---
app.get('/api/slides', (req, res) => {
  const slides = dbAll('SELECT * FROM slides ORDER BY id');
  res.json(slides.map(s => ({ ...s, image: s.filename ? '/uploads/' + s.filename : '' })));
});

app.post('/api/slides', upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Pilih gambar untuk slide.' });

  let filename = '';
  if (req.file) {
    filename = await convertToWebp(path.join(UPLOADS_DIR, req.file.filename));
  }
  const title = req.body.title || '';
  const id = dbRun('INSERT INTO slides (filename, title) VALUES (?,?)', [filename, title]);
  saveDb();
  res.json({ success: true, id });
});

app.put('/api/slides/:id', upload.single('image'), async (req, res) => {
  const id = parseInt(req.params.id);
  const existing = dbGet('SELECT * FROM slides WHERE id=?', [id]);
  if (!existing) return res.status(404).json({ error: 'Not found' });

  let filename = existing.filename;
  if (req.file) {
    if (existing.filename) {
      const oldPath = path.join(UPLOADS_DIR, existing.filename);
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    }
    filename = await convertToWebp(path.join(UPLOADS_DIR, req.file.filename));
  }
  const title = req.body.title || '';
  db.run('UPDATE slides SET filename=?, title=? WHERE id=?', [filename, title, id]);
  saveDb();
  res.json({ success: true });
});

app.delete('/api/slides/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const existing = dbGet('SELECT * FROM slides WHERE id=?', [id]);
  if (existing && existing.filename) {
    const fp = path.join(UPLOADS_DIR, existing.filename);
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
  }
  db.run('DELETE FROM slides WHERE id=?', [id]);
  saveDb();
  res.json({ success: true });
});

// --- GALLERY ---
app.get('/api/gallery', (req, res) => {
  const items = dbAll('SELECT * FROM gallery ORDER BY id');
  res.json(items.map(g => ({ ...g, image: g.filename ? '/uploads/' + g.filename : '' })));
});

app.post('/api/gallery', upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Pilih gambar untuk galeri.' });

  let filename = '';
  if (req.file) {
    filename = await convertToWebp(path.join(UPLOADS_DIR, req.file.filename));
  }
  const caption = req.body.caption || '';
  const id = dbRun('INSERT INTO gallery (filename, caption) VALUES (?,?)', [filename, caption]);
  saveDb();
  res.json({ success: true, id });
});

app.delete('/api/gallery/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const existing = dbGet('SELECT * FROM gallery WHERE id=?', [id]);
  if (existing && existing.filename) {
    const fp = path.join(UPLOADS_DIR, existing.filename);
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
  }
  db.run('DELETE FROM gallery WHERE id=?', [id]);
  saveDb();
  res.json({ success: true });
});

// --- PARTNERS ---
app.get('/api/partners', (req, res) => {
  const items = dbAll('SELECT * FROM partners ORDER BY sort_order, id');
  res.json(items.map(p => ({ ...p, image: p.filename ? '/uploads/' + p.filename : '' })));
});

app.post('/api/partners', upload.single('logo'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Pilih file logo partner.' });

  const filename = await convertToWebp(path.join(UPLOADS_DIR, req.file.filename));
  const name = req.body.name || '';
  const url = req.body.url || '';
  const maxOrder = dbGet('SELECT MAX(sort_order) as m FROM partners');
  const sortOrder = (maxOrder?.m ?? 0) + 1;
  const id = dbRun('INSERT INTO partners (name, filename, url, sort_order) VALUES (?,?,?,?)', [name, filename, url, sortOrder]);
  saveDb();
  res.json({ success: true, id });
});

app.put('/api/partners/:id', upload.single('logo'), async (req, res) => {
  const id = parseInt(req.params.id);
  const existing = dbGet('SELECT * FROM partners WHERE id=?', [id]);
  if (!existing) return res.status(404).json({ error: 'Not found' });

  let filename = existing.filename;
  if (req.file) {
    if (existing.filename) {
      const oldPath = path.join(UPLOADS_DIR, existing.filename);
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    }
    filename = await convertToWebp(path.join(UPLOADS_DIR, req.file.filename));
  }
  const name = req.body.name ?? existing.name;
  const url = req.body.url ?? existing.url;
  db.run('UPDATE partners SET name=?, filename=?, url=? WHERE id=?', [name, filename, url, id]);
  saveDb();
  res.json({ success: true });
});

app.delete('/api/partners/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const existing = dbGet('SELECT * FROM partners WHERE id=?', [id]);
  if (existing && existing.filename) {
    const fp = path.join(UPLOADS_DIR, existing.filename);
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
  }
  db.run('DELETE FROM partners WHERE id=?', [id]);
  saveDb();
  res.json({ success: true });
});

// --- SETTINGS ---
app.get('/api/settings', (req, res) => {
  const rows = dbAll('SELECT * FROM settings');
  const settings = {};
  for (const r of rows) settings[r.key] = r.value;
  res.json(settings);
});

app.put('/api/settings', (req, res) => {
  for (const [key, value] of Object.entries(req.body)) {
    db.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?,?)', [key, String(value)]);
  }
  saveDb();
  res.json({ success: true });
});

// --- AUTH ---
app.post('/api/login', (req, res) => {
  const { password } = req.body;
  const row = dbGet('SELECT value FROM settings WHERE key=?', ['admin_password']);
  const correctPass = row ? row.value : 'admin123';
  if (password === correctPass) {
    res.json({ success: true });
  } else {
    res.status(401).json({ error: 'Password salah' });
  }
});

// --- UPLOAD ERRORS ---
app.use((err, req, res, next) => {
  if (!err) return next();
  if (req.path.startsWith('/api/')) {
    const isUploadError = err instanceof multer.MulterError || err.message?.startsWith('Format file tidak didukung');
    const status = isUploadError ? 400 : 500;
    return res.status(status).json({ error: err.message || 'Upload gagal' });
  }
  next(err);
});

// --- Destination Detail Page ---
app.get('/destinasi/:id', (req, res) => {
  res.sendFile(path.join(__dirname, 'destination.html'));
});

// --- SPA Fallback ---
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/') || req.path.startsWith('/uploads/')) return res.status(404).json({ error: 'Not found' });
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ---------- Start ----------
init().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 Server running: http://localhost:${PORT}`);
    console.log(`🔐 Admin: http://localhost:${PORT}/admin.html`);
  });
}).catch(err => {
  console.error('Init error:', err);
  process.exit(1);
});
