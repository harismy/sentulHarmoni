/* ============================================
   Harmoni Trekking Sentul — Server
   Express + SQLite (sql.js) + Multer
   ============================================ */

const express = require('express');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const zlib = require('zlib');
const crypto = require('crypto');
const sharp = require('sharp');
const initSqlJs = require('sql.js');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, 'harmoni.db');
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const BACKUPS_DIR = path.join(__dirname, 'backups');
const RESTORE_TMP_DIR = path.join(__dirname, '.tmp', 'restore');

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

const restoreStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    fs.mkdirSync(RESTORE_TMP_DIR, { recursive: true });
    cb(null, RESTORE_TMP_DIR);
  },
  filename: (req, file, cb) => {
    cb(null, 'restore-' + Date.now() + '-' + Math.round(Math.random() * 1e6) + path.extname(file.originalname).toLowerCase());
  },
});

const restoreUpload = multer({
  storage: restoreStorage,
  limits: { fileSize: 500 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const name = file.originalname.toLowerCase();
    if (!name.endsWith('.tar.gz') && !name.endsWith('.tgz')) {
      return cb(new Error('File backup harus berformat .tar.gz atau .tgz.'));
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
let SQL;
let db;
const adminSessions = new Map();
const ADMIN_SESSION_TTL_MS = 12 * 60 * 60 * 1000;

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

function queryRows(database, sql, params = []) {
  const stmt = database.prepare(sql);
  if (params.length) stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

function pad(value) {
  return String(value).padStart(2, '0');
}

function timestamp(date = new Date()) {
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join('') + '-' + [
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join('');
}

function userError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function getAdminPassword() {
  const row = dbGet('SELECT value FROM settings WHERE key=?', ['admin_password']);
  return row ? row.value : 'admin123';
}

function createAdminToken() {
  const token = crypto.randomBytes(32).toString('hex');
  adminSessions.set(token, Date.now() + ADMIN_SESSION_TTL_MS);
  return token;
}

function getBearerToken(req) {
  const header = req.get('authorization') || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : '';
}

function isValidAdminToken(token) {
  const expiresAt = adminSessions.get(token);
  if (!expiresAt) return false;
  if (expiresAt <= Date.now()) {
    adminSessions.delete(token);
    return false;
  }
  adminSessions.set(token, Date.now() + ADMIN_SESSION_TTL_MS);
  return true;
}

function requireAdmin(req, res, next) {
  if (!isValidAdminToken(getBearerToken(req))) {
    return res.status(401).json({ error: 'Sesi admin berakhir. Silakan login ulang.' });
  }
  next();
}

function requireAdminPassword(req, res, next) {
  const password = req.get('x-admin-password') || '';
  if (!password || password !== getAdminPassword()) {
    return res.status(401).json({ error: 'Password admin salah.' });
  }
  next();
}

function copyDirectory(source, destination) {
  if (!fs.existsSync(source)) return { files: 0, bytes: 0 };

  fs.mkdirSync(destination, { recursive: true });
  let files = 0;
  let bytes = 0;

  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const sourcePath = path.join(source, entry.name);
    const destinationPath = path.join(destination, entry.name);

    if (entry.isDirectory()) {
      const nested = copyDirectory(sourcePath, destinationPath);
      files += nested.files;
      bytes += nested.bytes;
      continue;
    }

    if (!entry.isFile()) continue;

    const stat = fs.statSync(sourcePath);
    fs.copyFileSync(sourcePath, destinationPath);
    files += 1;
    bytes += stat.size;
  }

  return { files, bytes };
}

function assertProjectChild(targetPath, expectedName) {
  const resolved = path.resolve(targetPath);
  const root = path.resolve(__dirname);
  if (path.basename(resolved) !== expectedName || path.dirname(resolved) !== root) {
    throw new Error(`Unsafe project path: ${resolved}`);
  }
}

function parseTarString(buffer, start, length) {
  const slice = buffer.subarray(start, start + length);
  const zero = slice.indexOf(0);
  return slice.subarray(0, zero >= 0 ? zero : slice.length).toString('utf8').trim();
}

function parseTarSize(buffer) {
  const raw = parseTarString(buffer, 124, 12).replace(/\0/g, '').trim();
  if (!raw) return 0;
  const size = parseInt(raw, 8);
  if (!Number.isFinite(size) || size < 0) throw userError('Ukuran file backup tidak valid.');
  return size;
}

function safeArchiveName(entryName) {
  let normalized = entryName.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '');
  if (!normalized || normalized === '.') return '';
  if (normalized.startsWith('/') || /^[a-zA-Z]:/.test(normalized)) {
    throw userError('Isi backup memiliki path absolut yang tidak aman.');
  }
  const parts = normalized.split('/');
  if (parts.some(part => !part || part === '.' || part === '..')) {
    throw userError('Isi backup memiliki path tidak aman.');
  }
  return parts.join('/');
}

function writeArchiveEntry(destination, entryName, type, data) {
  const safeName = safeArchiveName(entryName);
  if (!safeName) return;

  const targetPath = path.resolve(destination, safeName);
  const root = path.resolve(destination);
  if (targetPath !== root && !targetPath.startsWith(root + path.sep)) {
    throw userError('Isi backup mencoba menulis keluar folder restore.');
  }

  if (type === '5') {
    fs.mkdirSync(targetPath, { recursive: true });
    return;
  }

  if (type !== '0' && type !== '') {
    if (type === 'x' || type === 'g' || type === 'L') return;
    throw userError('Isi backup memiliki tipe file yang tidak didukung.');
  }

  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, data);
}

function extractTarGz(archivePath, destination) {
  const tarBuffer = zlib.gunzipSync(fs.readFileSync(archivePath));
  let offset = 0;
  let files = 0;

  while (offset + 512 <= tarBuffer.length) {
    const header = tarBuffer.subarray(offset, offset + 512);
    if (header.every(byte => byte === 0)) break;

    const name = parseTarString(header, 0, 100);
    const prefix = parseTarString(header, 345, 155);
    const entryName = prefix ? `${prefix}/${name}` : name;
    const size = parseTarSize(header);
    const type = parseTarString(header, 156, 1);
    const dataStart = offset + 512;
    const dataEnd = dataStart + size;

    if (dataEnd > tarBuffer.length) throw userError('File backup tidak lengkap atau rusak.');
    writeArchiveEntry(destination, entryName, type, tarBuffer.subarray(dataStart, dataEnd));
    if (type === '0' || type === '') files += 1;

    offset = dataStart + Math.ceil(size / 512) * 512;
  }

  if (!files) throw userError('File backup tidak berisi data yang bisa direstore.');
  return files;
}

function findRestoreRoot(extractedDir) {
  const candidates = [];

  function walk(current, depth = 0) {
    if (depth > 5) return;
    if (fs.existsSync(path.join(current, 'harmoni.db'))) candidates.push(current);

    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (entry.isDirectory()) walk(path.join(current, entry.name), depth + 1);
    }
  }

  walk(extractedDir);
  if (!candidates.length) throw userError('Backup tidak berisi harmoni.db.');

  return candidates.find(dir => {
    const uploadsDir = path.join(dir, 'uploads');
    return fs.existsSync(uploadsDir) && fs.statSync(uploadsDir).isDirectory();
  }) || candidates[0];
}

function validateBackupDatabase(dbPath) {
  const restoreDb = new SQL.Database(fs.readFileSync(dbPath));
  const requiredTables = ['tours', 'tour_images', 'tour_includes', 'tour_excludes', 'slides', 'gallery', 'settings'];

  try {
    const integrityRow = queryRows(restoreDb, 'PRAGMA integrity_check')[0] || {};
    const integrity = Object.values(integrityRow)[0];
    if (integrity !== 'ok') throw userError(`Database backup rusak: ${integrity}`);

    const tableRows = queryRows(restoreDb, "SELECT name FROM sqlite_master WHERE type='table'");
    const tableSet = new Set(tableRows.map(row => row.name));
    const missing = requiredTables.filter(table => !tableSet.has(table));
    if (missing.length) throw userError(`Database backup tidak lengkap: ${missing.join(', ')}`);

    const rows = {};
    for (const table of requiredTables) {
      rows[table] = queryRows(restoreDb, `SELECT COUNT(*) AS count FROM ${table}`)[0].count;
    }
    return rows;
  } finally {
    restoreDb.close();
  }
}

function createPreRestoreBackup() {
  fs.mkdirSync(BACKUPS_DIR, { recursive: true });
  const backupDir = path.join(BACKUPS_DIR, `pre-restore-${timestamp()}`);
  fs.mkdirSync(backupDir, { recursive: true });

  const manifest = {
    createdAt: new Date().toISOString(),
    reason: 'Automatic backup before admin restore',
  };

  if (fs.existsSync(DB_PATH)) {
    fs.copyFileSync(DB_PATH, path.join(backupDir, 'harmoni.db'));
    manifest.databaseBytes = fs.statSync(DB_PATH).size;
  }
  manifest.uploads = copyDirectory(UPLOADS_DIR, path.join(backupDir, 'uploads'));
  fs.writeFileSync(path.join(backupDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  return backupDir;
}

function replaceUploadsFrom(sourceUploadsDir) {
  assertProjectChild(UPLOADS_DIR, 'uploads');
  fs.rmSync(UPLOADS_DIR, { recursive: true, force: true });
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  return copyDirectory(sourceUploadsDir, UPLOADS_DIR);
}

function reloadDatabaseFromDisk() {
  const previous = db;
  db = loadDb(SQL);
  try {
    if (previous && typeof previous.close === 'function') previous.close();
  } catch (_) {}
}

function restoreBackupPackage(restoreRoot) {
  const restoreDbPath = path.join(restoreRoot, 'harmoni.db');
  const restoreUploadsDir = path.join(restoreRoot, 'uploads');
  const preparedUploadsDir = path.join(RESTORE_TMP_DIR, 'prepared-uploads-' + timestamp() + '-' + Math.round(Math.random() * 1e6));

  if (!fs.existsSync(restoreUploadsDir) || !fs.statSync(restoreUploadsDir).isDirectory()) {
    throw userError('Backup tidak berisi folder uploads.');
  }

  const rows = validateBackupDatabase(restoreDbPath);
  let preRestoreBackup = '';

  try {
    copyDirectory(restoreUploadsDir, preparedUploadsDir);
    preRestoreBackup = createPreRestoreBackup();
    fs.copyFileSync(restoreDbPath, DB_PATH);
    const uploads = replaceUploadsFrom(preparedUploadsDir);
    reloadDatabaseFromDisk();
    return { preRestoreBackup, rows, uploads };
  } catch (error) {
    if (preRestoreBackup) {
      try {
        const previousDbPath = path.join(preRestoreBackup, 'harmoni.db');
        const previousUploadsDir = path.join(preRestoreBackup, 'uploads');
        if (fs.existsSync(previousDbPath)) fs.copyFileSync(previousDbPath, DB_PATH);
        if (fs.existsSync(previousUploadsDir)) replaceUploadsFrom(previousUploadsDir);
        reloadDatabaseFromDisk();
      } catch (rollbackError) {
        error.message += ` Rollback gagal: ${rollbackError.message}`;
      }
    }
    throw error;
  } finally {
    cleanupPath(preparedUploadsDir);
  }
}

function cleanupPath(targetPath) {
  if (!targetPath) return;
  try {
    fs.rmSync(targetPath, { recursive: true, force: true });
  } catch (_) {}
}

// ---------- Init ----------
async function init() {
  SQL = await initSqlJs();
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

app.post('/api/tours', requireAdmin, upload.array('images', 10), async (req, res) => {
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

app.put('/api/tours/:id', requireAdmin, upload.array('images', 10), async (req, res) => {
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
  const rows = dbAll('SELECT * FROM settings');
  const settings = {};
  for (const r of rows) {
    if (r.key !== 'admin_password') settings[r.key] = r.value;
  }
  res.json(settings);
});

app.put('/api/settings', requireAdmin, (req, res) => {
  const passwordChanged = Object.prototype.hasOwnProperty.call(req.body, 'admin_password');
  for (const [key, value] of Object.entries(req.body)) {
    db.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?,?)', [key, String(value)]);
  }
  saveDb();
  if (passwordChanged) {
    adminSessions.clear();
    return res.json({ success: true, token: createAdminToken() });
  }
  res.json({ success: true });
});

// --- AUTH ---
app.post('/api/login', (req, res) => {
  const { password } = req.body;
  if (password === getAdminPassword()) {
    res.json({ success: true, token: createAdminToken() });
  } else {
    res.status(401).json({ error: 'Password salah' });
  }
});

app.get('/api/admin/session', requireAdmin, (req, res) => {
  res.json({ success: true });
});

// --- BACKUP RESTORE ---
app.post('/api/backups/restore', requireAdmin, requireAdminPassword, restoreUpload.single('backup'), (req, res) => {
  const uploadedPath = req.file?.path;
  const extractDir = path.join(RESTORE_TMP_DIR, 'extract-' + timestamp() + '-' + Math.round(Math.random() * 1e6));

  try {
    if (!req.file) throw userError('Pilih file backup terlebih dahulu.');
    fs.mkdirSync(extractDir, { recursive: true });
    extractTarGz(uploadedPath, extractDir);
    const restoreRoot = findRestoreRoot(extractDir);
    const result = restoreBackupPackage(restoreRoot);

    res.json({
      success: true,
      message: 'Backup berhasil direstore.',
      ...result,
    });
  } catch (error) {
    const status = error.statusCode || 500;
    res.status(status).json({ error: error.message || 'Restore backup gagal.' });
  } finally {
    cleanupPath(uploadedPath);
    cleanupPath(extractDir);
  }
});

// --- UPLOAD ERRORS ---
app.use((err, req, res, next) => {
  if (!err) return next();
  if (req.path.startsWith('/api/')) {
    const isUploadError = err instanceof multer.MulterError
      || err.message?.startsWith('Format file tidak didukung')
      || err.message?.startsWith('File backup harus');
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
