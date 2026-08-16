const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const initSqlJs = require('sql.js');

const ROOT = path.resolve(__dirname, '..');
const DB_PATH = path.join(ROOT, 'harmoni.db');
const UPLOADS_DIR = path.join(ROOT, 'uploads');
const BACKUPS_DIR = path.join(ROOT, 'backups');

const TABLES = [
  'tours',
  'tour_images',
  'tour_includes',
  'tour_excludes',
  'slides',
  'gallery',
  'settings',
];

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

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function humanBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let size = bytes / 1024;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }
  return `${size.toFixed(size >= 10 ? 1 : 2)} ${units[index]}`;
}

function queryRows(db, sql, params = []) {
  const statement = db.prepare(sql);
  if (params.length) statement.bind(params);
  const result = [];
  while (statement.step()) result.push(statement.getAsObject());
  statement.free();
  return result;
}

function getIntegrityStatus(db) {
  const rows = queryRows(db, 'PRAGMA integrity_check');
  const first = rows[0] || {};
  return Object.values(first)[0];
}

function uniqueBackupDir(baseName) {
  let name = baseName;
  let dir = path.join(BACKUPS_DIR, name);
  let counter = 2;
  while (fs.existsSync(dir)) {
    name = `${baseName}-${pad(counter)}`;
    dir = path.join(BACKUPS_DIR, name);
    counter += 1;
  }
  return { name, dir };
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

async function copyDatabaseWithRetry(SQL, destination) {
  let lastError = null;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      fs.copyFileSync(DB_PATH, destination);
      const db = new SQL.Database(fs.readFileSync(destination));
      const integrity = getIntegrityStatus(db);

      if (integrity !== 'ok') {
        db.close();
        throw new Error(`SQLite integrity_check failed: ${integrity}`);
      }

      return db;
    } catch (error) {
      lastError = error;
      if (attempt < 3) await sleep(300);
    }
  }

  throw new Error(`Database backup failed after 3 attempts: ${lastError.message}`);
}

function exportTables(db) {
  const tables = {};
  for (const table of TABLES) {
    tables[table] = queryRows(db, `SELECT * FROM ${table}`);
  }
  return tables;
}

function writeRestoreNote(backupDir) {
  const note = [
    'Manual restore Harmoni Trekking Sentul',
    '',
    '1. Stop aplikasi Node/PM2 dulu.',
    '2. Dari folder project, ganti harmoni.db dengan file harmoni.db dari backup ini.',
    '3. Ganti folder uploads dengan folder uploads dari backup ini.',
    '4. Start aplikasi lagi.',
    '',
    'Backup ini berisi data admin/settings, database wisata, include/exclude, slide, galeri, dan semua file upload.',
    'Simpan file ini di tempat privat, jangan di public_html dan jangan commit ke git.',
    '',
  ].join('\n');

  fs.writeFileSync(path.join(backupDir, 'RESTORE.txt'), note);
}

function archiveBackup(backupDir) {
  if (process.argv.includes('--no-archive')) {
    return { archivePath: null, warning: 'Archive skipped because --no-archive was used.' };
  }

  const archivePath = `${backupDir}.tar.gz`;
  const result = spawnSync('tar', [
    '-czf',
    archivePath,
    '-C',
    path.dirname(backupDir),
    path.basename(backupDir),
  ], { encoding: 'utf8' });

  if (result.error || result.status !== 0) {
    const detail = result.error ? result.error.message : (result.stderr || result.stdout || 'unknown tar error').trim();
    return {
      archivePath: null,
      warning: `Could not create .tar.gz archive: ${detail}`,
    };
  }

  return { archivePath, warning: null };
}

async function main() {
  if (!fs.existsSync(DB_PATH)) {
    throw new Error('harmoni.db not found. Start the application once before making a backup.');
  }

  fs.mkdirSync(BACKUPS_DIR, { recursive: true });

  const backupBaseName = `harmoni-backup-${timestamp()}`;
  const { name: backupName, dir: backupDir } = uniqueBackupDir(backupBaseName);
  fs.mkdirSync(backupDir, { recursive: true });

  const SQL = await initSqlJs();
  const dbDestination = path.join(backupDir, 'harmoni.db');
  const db = await copyDatabaseWithRetry(SQL, dbDestination);

  try {
    const tables = exportTables(db);
    const uploads = copyDirectory(UPLOADS_DIR, path.join(backupDir, 'uploads'));
    const dbSize = fs.statSync(dbDestination).size;

    const summary = {
      backupName,
      createdAt: new Date().toISOString(),
      database: {
        file: 'harmoni.db',
        bytes: dbSize,
      },
      uploads,
      rows: Object.fromEntries(TABLES.map(table => [table, tables[table].length])),
    };

    fs.writeFileSync(
      path.join(backupDir, 'data-export.json'),
      JSON.stringify({ summary, tables }, null, 2),
    );
    fs.writeFileSync(
      path.join(backupDir, 'manifest.json'),
      JSON.stringify(summary, null, 2),
    );
    writeRestoreNote(backupDir);

    const archive = archiveBackup(backupDir);
    fs.writeFileSync(path.join(BACKUPS_DIR, 'latest.txt'), `${backupName}\n`);

    console.log(`Backup created: ${backupDir}`);
    if (archive.archivePath) console.log(`Archive created: ${archive.archivePath}`);
    if (archive.warning) console.warn(archive.warning);
    console.log(`Database: ${humanBytes(dbSize)}`);
    console.log(`Uploads: ${uploads.files} files, ${humanBytes(uploads.bytes)}`);
    console.log(`Rows: ${JSON.stringify(summary.rows)}`);
  } finally {
    db.close();
  }
}

main().catch(error => {
  console.error(`Backup failed: ${error.message}`);
  process.exit(1);
});
