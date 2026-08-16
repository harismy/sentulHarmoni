const http = require('http');
const BASE = 'http://localhost:3000';
let adminToken = '';

function req(method, path, body, contentType) {
  return new Promise((resolve, reject) => {
    const opts = { method, headers: {} };
    if (adminToken && path !== '/api/login') {
      opts.headers.Authorization = 'Bearer ' + adminToken;
    }
    if (body) {
      opts.headers['Content-Type'] = contentType || 'application/json';
      opts.headers['Content-Length'] = Buffer.byteLength(body);
    }
    const r = http.request(BASE + path, opts, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch(e) { resolve({ status: res.statusCode, body: data.substring(0, 200) }); }
      });
    });
    r.on('error', reject);
    if (body) r.write(body);
    r.end();
  });
}

function htmlGet(path) {
  return new Promise((resolve) => {
    http.get(BASE + path, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
  });
}

function buildMultipart(fields, boundary) {
  let body = '';
  for (const [name, value] of Object.entries(fields)) {
    body += '--' + boundary + '\r\n';
    body += 'Content-Disposition: form-data; name="' + name + '"\r\n\r\n';
    body += value + '\r\n';
  }
  body += '--' + boundary + '--\r\n';
  return body;
}

async function run() {
  let pass = 0, fail = 0;
  const results = [];

  async function test(name, fn, expectedStatus = status => status >= 200 && status < 300) {
    try {
      const r = await fn();
      const ok = expectedStatus(r.status);
      const detail = typeof r.body === 'string' ? r.body.substring(0, 100) : JSON.stringify(r.body).substring(0, 100);
      results.push({ name, ok, status: r.status, detail });
      if (ok) pass++; else fail++;
      console.log((ok ? '✅' : '❌') + ' ' + name + ' [' + r.status + ']');
    } catch(e) {
      results.push({ name, ok: false, status: 'ERR', detail: e.message });
      fail++;
      console.log('❌ ' + name + ' [ERR] ' + e.message);
    }
  }

  // ===== AUTH SETUP =====
  console.log('\n--- AUTH SETUP ---');
  await test('POST /api/login (setup)', async () => {
    const r = await req('POST', '/api/login', JSON.stringify({ password: 'admin123' }));
    if (r.body && r.body.token) adminToken = r.body.token;
    return r;
  });
  if (!adminToken) throw new Error('Admin token not received. Check admin password before running route tests.');

  // ===== TOURS =====
  console.log('\n--- TOURS ---');
  await test('GET /api/tours', () => req('GET', '/api/tours'));
  await test('GET /api/tours/1', () => req('GET', '/api/tours/1'));
  await test('GET /api/tours/999 (404)', () => req('GET', '/api/tours/999'), status => status === 404);

  // Create a test tour
  const boundary = '----TestBoundary' + Date.now();
  const createBody = buildMultipart({
    name: 'TEST TOUR API',
    location: 'Sentul',
    duration: '1-2 jam',
    price: '100000',
    category: 'Rute Ringan',
    description: 'Test description from API test',
    difficulty: 'Mudah',
    distance: '3 km',
    meeting_point: 'Test Point',
    itinerary: '["Step 1","Step 2"]',
    preparations: '["Item A","Item B"]',
    includes: '["Test Include 1","Test Include 2"]',
    excludes: '["Test Exclude 1"]',
  }, boundary);

  let createdId = null;
  await test('POST /api/tours (create)', async () => {
    const r = await req('POST', '/api/tours', createBody, 'multipart/form-data; boundary=' + boundary);
    if (r.body && r.body.id) createdId = r.body.id;
    return r;
  });

  if (createdId) {
    // Verify creation
    await test('GET /api/tours/' + createdId + ' (verify create)', async () => {
      const r = await req('GET', '/api/tours/' + createdId);
      if (r.body && r.body.name !== 'TEST TOUR API') throw new Error('Name mismatch: ' + r.body.name);
      if (!Array.isArray(r.body.itinerary)) throw new Error('itinerary not array: ' + typeof r.body.itinerary);
      if (!Array.isArray(r.body.preparations)) throw new Error('preparations not array');
      if (!Array.isArray(r.body.includes) || r.body.includes.length !== 2) throw new Error('includes wrong');
      if (!Array.isArray(r.body.excludes) || r.body.excludes.length !== 1) throw new Error('excludes wrong');
      if (r.body.difficulty !== 'Mudah') throw new Error('difficulty mismatch');
      return r;
    });

    // Update
    const updateBody = buildMultipart({
      name: 'TEST TOUR UPDATED',
      price: '200000',
      includes: '["Updated Include"]',
      excludes: '["Updated Exclude"]',
      difficulty: 'Menantang',
    }, boundary);

    await test('PUT /api/tours/' + createdId + ' (update)', () =>
      req('PUT', '/api/tours/' + createdId, updateBody, 'multipart/form-data; boundary=' + boundary));

    // Verify update
    await test('GET /api/tours/' + createdId + ' (verify update)', async () => {
      const r = await req('GET', '/api/tours/' + createdId);
      if (r.body.name !== 'TEST TOUR UPDATED') throw new Error('Name not updated: ' + r.body.name);
      if (r.body.price !== 200000) throw new Error('Price not updated');
      if (r.body.difficulty !== 'Menantang') throw new Error('Difficulty not updated');
      if (r.body.includes.length !== 1) throw new Error('Includes not updated');
      return r;
    });

    // Delete
    await test('DELETE /api/tours/' + createdId, () => req('DELETE', '/api/tours/' + createdId));

    // Verify delete
    await test('GET /api/tours/' + createdId + ' (verify delete)', () => req('GET', '/api/tours/' + createdId), status => status === 404);
  }

  // ===== SLIDES =====
  console.log('\n--- SLIDES ---');
  await test('GET /api/slides', () => req('GET', '/api/slides'));

  // ===== GALLERY =====
  console.log('\n--- GALLERY ---');
  await test('GET /api/gallery', () => req('GET', '/api/gallery'));

  // ===== SETTINGS =====
  console.log('\n--- SETTINGS ---');
  await test('GET /api/settings', () => req('GET', '/api/settings'));
  await test('PUT /api/settings', () => req('PUT', '/api/settings', JSON.stringify({ test_key: 'test_value' })));

  // ===== AUTH =====
  console.log('\n--- AUTH ---');
  await test('POST /api/login (wrong)', () => req('POST', '/api/login', JSON.stringify({ password: 'wrong' })), status => status === 401);
  await test('POST /api/login (correct)', async () => {
    const r = await req('POST', '/api/login', JSON.stringify({ password: 'admin123' }));
    if (r.body && r.body.token) adminToken = r.body.token;
    return r;
  });

  // ===== PAGES =====
  console.log('\n--- PAGES ---');
  await test('GET / (index.html)', async () => {
    const r = await htmlGet('/');
    const ok = r.status === 200 && r.body.includes('home-page');
    return { status: r.status, body: ok ? 'index.html OK' : 'Wrong page' };
  });
  await test('GET /admin.html', async () => {
    const r = await htmlGet('/admin.html');
    const ok = r.status === 200 && r.body.includes('admin.css');
    return { status: r.status, body: ok ? 'admin.html OK' : 'Wrong page' };
  });
  await test('GET /destinasi/1', async () => {
    const r = await htmlGet('/destinasi/1');
    const ok = r.status === 200 && r.body.includes('destination.css');
    return { status: r.status, body: ok ? 'destination.html OK' : 'Wrong page' };
  });
  await test('GET /destinasi/5 (offroad)', async () => {
    const r = await htmlGet('/destinasi/5');
    const ok = r.status === 200 && r.body.includes('destination.css');
    return { status: r.status, body: ok ? 'destination.html OK' : 'Wrong page' };
  });

  // ===== SUMMARY =====
  console.log('\n========================================');
  console.log('          ROUTE TEST RESULTS');
  console.log('========================================');
  for (const r of results) {
    const icon = r.ok ? '✅' : '❌';
    console.log(icon + ' ' + r.name + ' [' + r.status + ']');
    if (!r.ok) console.log('   ↳ ' + r.detail);
  }
  console.log('----------------------------------------');
  console.log('PASS: ' + pass + ' | FAIL: ' + fail + ' | TOTAL: ' + (pass + fail));
  console.log('========================================');
}

run().catch(e => console.error('FATAL:', e.message));
