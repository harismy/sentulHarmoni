/* ============================================
   Harmoni Trekking Sentul — Server
   Express + SQLite (sql.js) + Multer
   ============================================ */

const express = require('express');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const crypto = require('crypto');
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
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
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
      distance TEXT DEFAULT '3-5 km',
      meeting_point TEXT DEFAULT 'Sentul, Bogor',
      itinerary TEXT DEFAULT '[]',
      preparations TEXT DEFAULT '[]'
    )
  `);

  // Add newer detail fields without replacing an existing database.
  const tourColumns = dbAll('PRAGMA table_info(tours)').map(column => column.name);
  const ensureTourColumn = (name, definition) => {
    if (!tourColumns.includes(name)) db.run(`ALTER TABLE tours ADD COLUMN ${name} ${definition}`);
  };
  ensureTourColumn('difficulty', "TEXT DEFAULT 'Sedang'");
  ensureTourColumn('distance', "TEXT DEFAULT '3-5 km'");
  ensureTourColumn('meeting_point', "TEXT DEFAULT 'Sentul, Bogor'");
  ensureTourColumn('itinerary', "TEXT DEFAULT '[]'");
  ensureTourColumn('preparations', "TEXT DEFAULT '[]'");
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
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    )
  `);

  const detailMigration = dbGet('SELECT value FROM settings WHERE key=?', ['tour_details_v1']);
  if (!detailMigration) {
    db.run("UPDATE tours SET difficulty='Mudah' WHERE category LIKE '%Ringan%'");
    db.run("UPDATE tours SET difficulty='Menantang' WHERE category LIKE '%Hard%' OR name LIKE '%Offroad%'");
    db.run("UPDATE tours SET distance='3 km' WHERE duration LIKE '1-2%'");
    db.run("UPDATE tours SET distance='4-5 km' WHERE duration LIKE '2-3%'");
    db.run("INSERT INTO settings (key, value) VALUES ('tour_details_v1', '1')");
  }
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
  ensureSetting('session_secret', crypto.randomBytes(32).toString('hex'));
  saveDb();

  console.log('✅ Database ready');
}

function seedData() {
  const tours = [
    { name:'Curug Leuwi Hejo — Curug Cepet', location:'Sentul', duration:'2-3 jam', price:150000, category:'Rute Standar',
      description:'Trekking menyusuri curug terindah di Sentul. Melewati hutan tropis, sungai alami, dan pemandangan perbukitan yang memukau.',
      includes:['Guide Profesional','Air Mineral','Dokumentasi Foto','Tiket Masuk','Snack Ringan'],
      excludes:['Transportasi ke Lokasi','Makan Siang','Asuransi Pribadi'] },
    { name:'Bukit Indah — Curug Bidadari', location:'Sentul', duration:'1-2 jam', price:150000, category:'Rute Ringan',
      description:'Rute santai cocok untuk pemula dan keluarga. Melewati pemukiman warga, persawahan, perkebunan, bukit, dan sungai.',
      includes:['Guide Profesional','Air Mineral','Dokumentasi Foto','Tiket Masuk'],
      excludes:['Transportasi ke Lokasi','Makan Siang'] },
    { name:'Goa Agung Garunggang', location:'Sentul', duration:'2-3 jam', price:150000, category:'Rute Standar',
      description:'Eksplorasi goa alam yang menakjubkan dengan stalaktit dan stalakmit alami.',
      includes:['Guide Profesional','Air Mineral','Dokumentasi Foto','Tiket Masuk','Peralatan Safety'],
      excludes:['Transportasi ke Lokasi','Makan Siang','Asuransi Pribadi'] },
    { name:'Curug Cibingbin — Curug Ngumpet', location:'Sentul', duration:'2-3 jam', price:150000, category:'Rute Standar',
      description:'Jelajahi dua curug sekaligus dalam satu perjalanan.',
      includes:['Guide Profesional','Air Mineral','Dokumentasi Foto','Tiket Masuk'],
      excludes:['Transportasi ke Lokasi','Makan Siang','Asuransi Pribadi'] },
    { name:'Wisata Offroad Sentul Hambalang', location:'Sentul', duration:'2-3 jam', price:1200000, category:'Rute Hard',
      description:'Sensasi offroad menggunakan jeep 4x4 menyusuri jalur ekstrem Sentul.',
      includes:['Driver Profesional','Jeep 4x4','Air Mineral','Dokumentasi Foto','Snack'],
      excludes:['Makan Siang','Asuransi Kendaraan','Biaya Tol & Parkir'] },
    { name:'Trekking Sentul Corporate', location:'Sentul', duration:'1-2 jam', price:265000, category:'Rute Ringan',
      description:'Program team building di alam terbuka. Cocok untuk acara kantor atau gathering.',
      includes:['Guide Profesional','Air Mineral','Dokumentasi Foto','Permainan Team Building','Snack & Coffee Break'],
      excludes:['Transportasi Peserta','Makan Siang','Seragam/T-shirt'] },
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
app.use('/assets', express.static(path.join(__dirname, 'assets')));
app.use('/uploads', express.static(UPLOADS_DIR));

// Serve only the public pages. Never expose the project root because it also
// contains the database, server source, and package metadata.
app.get(['/', '/index.html'], (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});
app.get('/admin.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});
app.get('/destination.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'destination.html'));
});

// =============================================
// API ROUTES
// =============================================

// --- TOURS ---
function enrichTour(t) {
  t.images = dbAll('SELECT filename FROM tour_images WHERE tour_id=? ORDER BY sort_order, id', [t.id]).map(r => r.filename);
  t.includes = dbAll('SELECT item FROM tour_includes WHERE tour_id=? ORDER BY id', [t.id]).map(r => r.item);
  t.excludes = dbAll('SELECT item FROM tour_excludes WHERE tour_id=? ORDER BY id', [t.id]).map(r => r.item);
  try { t.itinerary = JSON.parse(t.itinerary || '[]'); } catch (e) { t.itinerary = []; }
  try { t.preparations = JSON.parse(t.preparations || '[]'); } catch (e) { t.preparations = []; }
  if (!Array.isArray(t.itinerary)) t.itinerary = [];
  if (!Array.isArray(t.preparations)) t.preparations = [];
  t.image = t.images.length > 0 ? '/uploads/' + t.images[0] : '';
  return t;
}

function adminTokenSecret() {
  const secret = dbGet('SELECT value FROM settings WHERE key=?', ['session_secret'])?.value || 'harmoni-session';
  const password = dbGet('SELECT value FROM settings WHERE key=?', ['admin_password'])?.value || 'admin123';
  return `${secret}:${password}`;
}

function signAdminToken(expiresAt) {
  return crypto.createHmac('sha256', adminTokenSecret()).update(String(expiresAt)).digest('base64url');
}

function createAdminToken() {
  const expiresAt = Date.now() + (12 * 60 * 60 * 1000);
  return `${expiresAt}.${signAdminToken(expiresAt)}`;
}

function verifyAdminToken(token) {
  try {
    const [expiresAt, signature] = String(token || '').split('.');
    if (!expiresAt || !signature || Number(expiresAt) < Date.now()) return false;
    const expected = signAdminToken(expiresAt);
    const actualBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);
    return actualBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(actualBuffer, expectedBuffer);
  } catch (error) {
    return false;
  }
}

function requireAdmin(req, res, next) {
  const authorization = req.get('authorization') || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!verifyAdminToken(token)) return res.status(401).json({ error: 'Sesi admin tidak valid atau sudah berakhir.' });
  next();
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

app.post('/api/tours', requireAdmin, upload.array('images', 10), async (req, res) => {
  const { name, location, duration, price, category, description, difficulty, distance, meeting_point } = req.body;
  let includes = []; try { includes = JSON.parse(req.body.includes || '[]'); } catch(e){}
  let excludes = []; try { excludes = JSON.parse(req.body.excludes || '[]'); } catch(e){}
  let itinerary = []; try { itinerary = JSON.parse(req.body.itinerary || '[]'); } catch(e){}
  let preparations = []; try { preparations = JSON.parse(req.body.preparations || '[]'); } catch(e){}

  // Convert uploaded images to WebP
  await convertFilesToWebp(req.files);

  const id = dbRun(
    `INSERT INTO tours
      (name, location, duration, price, category, description, difficulty, distance, meeting_point, itinerary, preparations)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    [name, location, duration, parseInt(price)||0, category||'Wisata', description||'', difficulty||'Sedang', distance||'3-5 km', meeting_point||'Sentul, Bogor', JSON.stringify(itinerary), JSON.stringify(preparations)]
  );

  if (req.files) {
    req.files.forEach((f, i) => dbRun('INSERT INTO tour_images (tour_id, filename, sort_order) VALUES (?,?,?)', [id, f.filename, i]));
  }
  for (const item of includes) dbRun('INSERT INTO tour_includes (tour_id, item) VALUES (?,?)', [id, item]);
  for (const item of excludes) dbRun('INSERT INTO tour_excludes (tour_id, item) VALUES (?,?)', [id, item]);

  saveDb();
  res.json({ success: true, id });
});

app.put('/api/tours/:id', requireAdmin, upload.array('images', 10), async (req, res) => {
  const tourId = parseInt(req.params.id);
  const existing = dbGet('SELECT * FROM tours WHERE id=?', [tourId]);
  if (!existing) return res.status(404).json({ error: 'Not found' });

  const { name, location, duration, price, category, description, difficulty, distance, meeting_point } = req.body;
  let includes = []; try { includes = JSON.parse(req.body.includes || '[]'); } catch(e){}
  let excludes = []; try { excludes = JSON.parse(req.body.excludes || '[]'); } catch(e){}
  let itinerary = []; try { itinerary = JSON.parse(req.body.itinerary || '[]'); } catch(e){}
  let preparations = []; try { preparations = JSON.parse(req.body.preparations || '[]'); } catch(e){}

  // Convert new uploaded images to WebP
  await convertFilesToWebp(req.files);

  db.run(`UPDATE tours SET
      name=?, location=?, duration=?, price=?, category=?, description=?, difficulty=?, distance=?, meeting_point=?, itinerary=?, preparations=?
      WHERE id=?`,
    [name, location, duration, parseInt(price)||0, category||'Wisata', description||'', difficulty||'Sedang', distance||'3-5 km', meeting_point||'Sentul, Bogor', JSON.stringify(itinerary), JSON.stringify(preparations), tourId]);

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

app.delete('/api/tours/:id', requireAdmin, (req, res) => {
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

app.post('/api/slides', requireAdmin, upload.single('image'), async (req, res) => {
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

app.put('/api/slides/:id', requireAdmin, upload.single('image'), async (req, res) => {
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

app.delete('/api/slides/:id', requireAdmin, (req, res) => {
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

app.post('/api/gallery', requireAdmin, upload.single('image'), async (req, res) => {
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

app.delete('/api/gallery/:id', requireAdmin, (req, res) => {
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

// --- SETTINGS ---
app.get('/api/settings', (req, res) => {
  const rows = dbAll("SELECT * FROM settings WHERE key NOT IN ('admin_password', 'session_secret', 'tour_details_v1')");
  const settings = {};
  for (const r of rows) settings[r.key] = r.value;
  res.json(settings);
});

app.put('/api/settings', requireAdmin, (req, res) => {
  for (const [key, value] of Object.entries(req.body)) {
    db.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?,?)', [key, String(value)]);
  }
  saveDb();
  res.json({ success: true, token: req.body.admin_password ? createAdminToken() : undefined });
});

// --- AUTH ---
app.post('/api/login', (req, res) => {
  const { password } = req.body;
  const row = dbGet('SELECT value FROM settings WHERE key=?', ['admin_password']);
  const correctPass = row ? row.value : 'admin123';
  if (password === correctPass) {
    res.json({ success: true, token: createAdminToken() });
  } else {
    res.status(401).json({ error: 'Password salah' });
  }
});

app.get('/api/admin/session', requireAdmin, (req, res) => {
  res.json({ success: true });
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

// --- SPA Fallback ---
app.get('/destinasi/:id', (req, res) => {
  res.sendFile(path.join(__dirname, 'destination.html'));
});

app.get('*', (req, res) => {
  if (req.path.startsWith('/api/') || req.path.startsWith('/uploads/')) return res.status(404).json({ error: 'Not found' });
  if (path.extname(req.path)) return res.status(404).send('Not found');
  res.sendFile(path.join(__dirname, 'index.html'));
});

// --- Error Handler (Multer, dll) ---
app.use((err, req, res, next) => {
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'File terlalu besar. Maksimal 20MB.' });
  }
  if (err.message && err.message.includes('Format file')) {
    return res.status(400).json({ error: err.message });
  }
  console.error('Server error:', err);
  res.status(500).json({ error: 'Terjadi kesalahan server.' });
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
