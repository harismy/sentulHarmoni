/* ============================================
   Harmoni Trekking Sentul — Admin.js
   REST API + File Upload + Multi-Image
   ============================================ */

const API = '';
const DEFAULT_HERO_BACKGROUND = '/uploads/slide-album-curug-leuwi-hejo.webp';

// =============================================
// STATE
// =============================================
let tours = [];
let slides = [];
let gallery = [];
let partners = [];
let settings = {};
let authToken = localStorage.getItem('hts_admin_token') || '';
let isLoggedIn = localStorage.getItem('hts_admin_loggedin') === 'true';

// =============================================
// HELPERS
// =============================================
async function api(url, opts = {}) {
    const headers = { ...(opts.headers || {}) };
    if (authToken && url !== '/api/login') headers.Authorization = `Bearer ${authToken}`;
    const res = await fetch(API + url, { ...opts, headers });
    const data = await res.json();
    if (res.status === 401 && url !== '/api/login') {
        authToken = '';
        isLoggedIn = false;
        localStorage.removeItem('hts_admin_token');
        localStorage.removeItem('hts_admin_loggedin');
        checkLogin();
    }
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
}

function toast(msg, isError = false) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.style.background = isError ? '#dc4c4c' : 'var(--earth-900)';
    el.classList.add('show');
    clearTimeout(el._timeout);
    el._timeout = setTimeout(() => el.classList.remove('show'), 2800);
}

function formatRp(n) { return (n || 0).toLocaleString('id-ID'); }

// =============================================
// LOGIN
// =============================================
const loginOverlay = document.getElementById('loginOverlay');
const adminLayout  = document.getElementById('adminLayout');

function checkLogin() {
    if (isLoggedIn) {
        loginOverlay.classList.add('hidden');
        adminLayout.style.display = 'flex';
    } else {
        loginOverlay.classList.remove('hidden');
        adminLayout.style.display = 'none';
    }
}

document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const pass = document.getElementById('loginPassword').value;
    try {
        const result = await api('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: pass }) });
        authToken = result.token;
        if (!authToken) throw new Error('Token login tidak diterima dari server.');
        isLoggedIn = true;
        localStorage.setItem('hts_admin_token', authToken);
        localStorage.setItem('hts_admin_loggedin', 'true');
        checkLogin();
        await loadAll();
        refreshDashboard();
        toast('Selamat datang, Admin! 🎉');
    } catch (err) {
        toast('Password salah!', true);
    }
});

document.getElementById('btnLogout').addEventListener('click', () => {
    authToken = '';
    isLoggedIn = false;
    localStorage.removeItem('hts_admin_token');
    localStorage.removeItem('hts_admin_loggedin');
    checkLogin();
});

// =============================================
// DATA LOADING
// =============================================
async function loadAll() {
    [tours, slides, gallery, partners] = await Promise.all([
        api('/api/tours').catch(() => []),
        api('/api/slides').catch(() => []),
        api('/api/gallery').catch(() => []),
        api('/api/partners').catch(() => []),
    ]);
    try { settings = await api('/api/settings'); } catch(e) { settings = {}; }
}

async function refreshAll() {
    await loadAll();
    refreshDashboard();
    renderToursTable();
    renderSliderTable();
    renderGalleryTable();
    renderPartnersTable();
}

// =============================================
// INIT
// =============================================
checkLogin();

function tickClock() {
    const el = document.getElementById('adminClock');
    if (el) el.textContent = new Date().toLocaleString('id-ID', { weekday:'short', day:'numeric', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });
}
tickClock();
setInterval(tickClock, 10000);

// =============================================
// SIDEBAR NAVIGATION
// =============================================
const pages = {
    dashboard: document.getElementById('pageDashboard'),
    tours:     document.getElementById('pageTours'),
    slider:    document.getElementById('pageSlider'),
    gallery:   document.getElementById('pageGallery'),
    partners:  document.getElementById('pagePartners'),
    settings:  document.getElementById('pageSettings'),
};

document.querySelectorAll('.sidebar-link[data-page]').forEach(link => {
    link.addEventListener('click', (e) => {
        e.preventDefault();
        const page = link.dataset.page;
        document.querySelectorAll('.sidebar-link[data-page]').forEach(l => l.classList.remove('active'));
        link.classList.add('active');
        Object.values(pages).forEach(p => p.classList.remove('active'));
        if (pages[page]) pages[page].classList.add('active');
        document.getElementById('pageTitle').textContent = link.textContent.trim();
        if (page === 'dashboard') refreshDashboard();
        if (page === 'tours') renderToursTable();
        if (page === 'slider') renderSliderTable();
        if (page === 'gallery') renderGalleryTable();
        if (page === 'partners') renderPartnersTable();
        if (page === 'settings') loadSettings();
        document.querySelector('.admin-sidebar').classList.remove('open');
    });
});

document.getElementById('sidebarToggle').addEventListener('click', () => {
    document.querySelector('.admin-sidebar').classList.toggle('open');
});

// =============================================
// DASHBOARD
// =============================================
function refreshDashboard() {
    document.getElementById('statTours').textContent = tours.length;
    document.getElementById('statSlides').textContent = slides.length;
    document.getElementById('statGallery').textContent = gallery.length;
    document.getElementById('statLocations').textContent = [...new Set(tours.map(t => t.location))].length;
    renderDashboardHeroBackground();

    const recent = [...tours].reverse().slice(0, 5);
    document.getElementById('dashboardTourTable').innerHTML = recent.map(t => `
        <tr>
            <td><strong>${t.name}</strong></td>
            <td><span class="badge badge-green">${t.category || 'Wisata'}</span></td>
            <td>${t.duration}</td>
            <td>Rp ${formatRp(t.price)}</td>
            <td><button class="btn-icon detail" onclick="editTour(${t.id})"><i class="ri-edit-line"></i></button></td>
        </tr>
    `).join('') || '<tr><td colspan="5" style="text-align:center;color:var(--text-dim);padding:24px;">Belum ada destinasi</td></tr>';
}

function renderDashboardHeroBackground() {
    const preview = document.getElementById('dashboardHeroPreview');
    if (!preview) return;

    const activeSlide = slides.find(s => s.image || s.filename);
    const image = activeSlide ? (activeSlide.image || `/uploads/${activeSlide.filename}`) : DEFAULT_HERO_BACKGROUND;
    preview.style.backgroundImage = `url("${image}")`;
    document.getElementById('dashboardHeroCount').textContent = slides.length ? `${slides.length} slide aktif` : 'Default bawaan';
    document.getElementById('dashboardHeroTitle').textContent = activeSlide?.title || (activeSlide ? 'Slide tanpa judul' : 'Belum ada slide admin');
}

// =============================================
// BACKUP RESTORE
// =============================================
const restoreBackupForm = document.getElementById('restoreBackupForm');
restoreBackupForm?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const fileInput = document.getElementById('backupFileInput');
    const passwordInput = document.getElementById('backupAdminPassword');
    const button = document.getElementById('btnRestoreBackup');
    const status = document.getElementById('backupStatus');
    const file = fileInput.files[0];
    const password = passwordInput.value;

    if (!file) {
        toast('Pilih file backup terlebih dahulu.', true);
        return;
    }

    if (!confirm('Restore backup akan mengganti database dan semua foto upload saat ini. Lanjutkan?')) return;

    const formData = new FormData();
    formData.append('backup', file);

    button.disabled = true;
    button.innerHTML = '<i class="ri-loader-4-line"></i> Memproses...';
    status.textContent = 'Mengupload dan merestore backup...';

    try {
        const result = await api('/api/backups/restore', {
            method: 'POST',
            headers: { 'X-Admin-Password': password },
            body: formData,
        });

        await refreshAll();
        fileInput.value = '';
        passwordInput.value = '';
        status.textContent = `Restore berhasil: ${result.rows?.tours || 0} destinasi, ${result.uploads?.files || 0} file upload`;
        toast('Backup berhasil direstore.');
    } catch (err) {
        status.textContent = 'Restore gagal.';
        toast('Gagal restore: ' + err.message, true);
    } finally {
        button.disabled = false;
        button.innerHTML = '<i class="ri-upload-cloud-2-line"></i> Upload & Restore';
    }
});

// =============================================
// TOURS TABLE
// =============================================
function renderToursTable() {
    document.getElementById('toursTableBody').innerHTML = tours.map(t => `
        <tr>
            <td>${t.image ? `<img src="${t.image}" class="table-img" alt="">` : '<span style="color:var(--text-dim);">-</span>'}</td>
            <td>
                <strong>${t.name}</strong>
                ${t.images && t.images.length > 0 ? `<br><small style="color:var(--green-500);">${t.images.length} foto</small>` : ''}
            </td>
            <td><span class="badge badge-green">${t.category || 'Wisata'}</span></td>
            <td>${t.location}</td>
            <td>${t.duration}</td>
            <td>Rp ${formatRp(t.price)}</td>
            <td>
                <div style="display:flex;gap:2px;">
                    <button class="btn-icon detail" onclick="viewTourDetail(${t.id})" title="Buka halaman detail"><i class="ri-external-link-line"></i></button>
                    <button class="btn-icon edit" onclick="editTour(${t.id})" title="Edit"><i class="ri-edit-line"></i></button>
                    <button class="btn-icon delete" onclick="deleteTour(${t.id})" title="Hapus"><i class="ri-delete-bin-line"></i></button>
                </div>
            </td>
        </tr>
    `).join('') || '<tr><td colspan="7" style="text-align:center;color:var(--text-dim);padding:24px;">Belum ada destinasi.</td></tr>';
}

// =============================================
// TOUR MODAL — ADD / EDIT
// =============================================
let tempIncludes = [], tempExcludes = [], tempKeepImages = [], tempRemoveImages = [];

const tourModalOverlay = document.getElementById('tourModalOverlay');

document.getElementById('btnAddTour').addEventListener('click', () => openTourModal());
document.getElementById('tourModalClose').addEventListener('click', closeTourModal);
tourModalOverlay.addEventListener('click', (e) => { if (e.target === tourModalOverlay) closeTourModal(); });

function openTourModal(tour = null) {
    tempIncludes = tour ? [...(tour.includes || [])] : [];
    tempExcludes = tour ? [...(tour.excludes || [])] : [];
    tempKeepImages = tour ? [...(tour.images || [])] : [];
    tempRemoveImages = [];

    document.getElementById('tourId').value         = tour ? tour.id : '';
    document.getElementById('tourName').value        = tour ? tour.name : '';
    document.getElementById('tourLocation').value    = tour ? tour.location : '';
    document.getElementById('tourCategory').value    = tour ? (tour.category || '') : '';
    document.getElementById('tourDuration').value    = tour ? tour.duration : '';
    document.getElementById('tourPrice').value       = tour ? (tour.price || '') : '';
    document.getElementById('tourDescription').value = tour ? (tour.description || '') : '';
    document.getElementById('tourDifficulty').value  = tour ? (tour.difficulty || 'Sedang') : 'Sedang';
    document.getElementById('tourDistance').value    = tour ? (tour.distance || '') : '';
    document.getElementById('tourMeetingPoint').value = tour ? (tour.meeting_point || '') : 'Sentul, Bogor';
    document.getElementById('tourItinerary').value   = tour ? (tour.itinerary || []).join('\n') : '';
    document.getElementById('tourPreparations').value = tour ? (tour.preparations || []).join('\n') : '';
    document.getElementById('tourFileInput').value   = '';

    document.getElementById('tourModalTitle').textContent = tour ? 'Edit Destinasi' : 'Tambah Destinasi';

    renderTagLists();
    renderExistingImages();
    tourModalOverlay.classList.add('open');
}

function closeTourModal() {
    tourModalOverlay.classList.remove('open');
}

// --- Existing Images Preview ---
function renderExistingImages() {
    const container = document.getElementById('existingImages');
    container.innerHTML = tempKeepImages.map(f => `
        <div class="existing-img">
            <img src="/uploads/${f}" alt="">
            <button class="existing-img-remove" data-file="${f}" title="Hapus">&times;</button>
        </div>
    `).join('');

    container.querySelectorAll('.existing-img-remove').forEach(btn => {
        btn.addEventListener('click', () => {
            const file = btn.dataset.file;
            tempKeepImages = tempKeepImages.filter(f => f !== file);
            tempRemoveImages.push(file);
            renderExistingImages();
        });
    });
}

// --- Tag Lists ---
function addIncludeItem(value) {
    if (!value) return;
    tempIncludes.push(value);
    renderTagLists();
}
function addExcludeItem(value) {
    if (!value) return;
    tempExcludes.push(value);
    renderTagLists();
}

function renderTagLists() {
    document.getElementById('includeList').innerHTML = tempIncludes.map((item, i) =>
        `<div class="tag-list-item">
            <span class="tag-text">${item}</span>
            <button type="button" class="tag-remove" data-idx="${i}" data-type="include" title="Hapus"><i class="ri-close-line"></i></button>
        </div>`
    ).join('');
    document.getElementById('excludeList').innerHTML = tempExcludes.map((item, i) =>
        `<div class="tag-list-item exclude-item">
            <span class="tag-text">${item}</span>
            <button type="button" class="tag-remove" data-idx="${i}" data-type="exclude" title="Hapus"><i class="ri-close-line"></i></button>
        </div>`
    ).join('');

    document.querySelectorAll('#includeList .tag-remove').forEach(btn => {
        btn.addEventListener('click', () => { tempIncludes.splice(parseInt(btn.dataset.idx), 1); renderTagLists(); });
    });
    document.querySelectorAll('#excludeList .tag-remove').forEach(btn => {
        btn.addEventListener('click', () => { tempExcludes.splice(parseInt(btn.dataset.idx), 1); renderTagLists(); });
    });
}

// Include input: Enter key
document.getElementById('includeInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        const v = e.target.value.trim();
        if (v) { addIncludeItem(v); e.target.value = ''; }
    }
});
// Include input: Add button
document.getElementById('btnAddInclude').addEventListener('click', () => {
    const input = document.getElementById('includeInput');
    const v = input.value.trim();
    if (v) { addIncludeItem(v); input.value = ''; input.focus(); }
});

// Exclude input: Enter key
document.getElementById('excludeInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        const v = e.target.value.trim();
        if (v) { addExcludeItem(v); e.target.value = ''; }
    }
});
// Exclude input: Add button
document.getElementById('btnAddExclude').addEventListener('click', () => {
    const input = document.getElementById('excludeInput');
    const v = input.value.trim();
    if (v) { addExcludeItem(v); input.value = ''; input.focus(); }
});

// --- Form Submit ---
document.getElementById('tourForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const editId = document.getElementById('tourId').value;
    const fileInput = document.getElementById('tourFileInput');

    const formData = new FormData();
    formData.append('name', document.getElementById('tourName').value.trim());
    formData.append('location', document.getElementById('tourLocation').value.trim());
    formData.append('category', document.getElementById('tourCategory').value.trim() || 'Wisata');
    formData.append('duration', document.getElementById('tourDuration').value.trim());
    formData.append('price', document.getElementById('tourPrice').value);
    formData.append('description', document.getElementById('tourDescription').value.trim());
    formData.append('difficulty', document.getElementById('tourDifficulty').value);
    formData.append('distance', document.getElementById('tourDistance').value.trim());
    formData.append('meeting_point', document.getElementById('tourMeetingPoint').value.trim());
    formData.append('itinerary', JSON.stringify(document.getElementById('tourItinerary').value.split('\n').map(item => item.trim()).filter(Boolean)));
    formData.append('preparations', JSON.stringify(document.getElementById('tourPreparations').value.split('\n').map(item => item.trim()).filter(Boolean)));
    formData.append('includes', JSON.stringify(tempIncludes));
    formData.append('excludes', JSON.stringify(tempExcludes));

    if (editId) {
        formData.append('removeImages', JSON.stringify(tempRemoveImages));
    }

    // Attach new files
    if (fileInput.files.length > 0) {
        for (const f of fileInput.files) formData.append('images', f);
    }

    try {
        const url = editId ? `/api/tours/${editId}` : '/api/tours';
        const method = editId ? 'PUT' : 'POST';
        await api(url, { method, body: formData });
        closeTourModal();
        await refreshAll();
        toast(editId ? 'Destinasi diperbarui! ✅' : 'Destinasi ditambahkan! 🎉');
    } catch (err) {
        toast('Gagal: ' + err.message, true);
    }
});

function editTour(id) {
    const t = tours.find(t => t.id === id);
    if (t) {
        document.querySelector('.sidebar-link[data-page="tours"]').click();
        setTimeout(() => openTourModal(t), 200);
    }
}

async function deleteTour(id) {
    if (!confirm('Hapus destinasi ini?')) return;
    await api('/api/tours/' + id, { method: 'DELETE' });
    await refreshAll();
    toast('Destinasi dihapus.');
}

// --- Detail View ---
function viewTourDetail(id) {
    window.open(`/destinasi/${id}`, '_blank', 'noopener');
}

function viewTourDetailModal(id) {
    const t = tours.find(t => t.id === id);
    if (!t) return;

    const overlay = document.getElementById('simpleModalOverlay');
    document.getElementById('simpleModalTitle').textContent = t.name;

    const imageGallery = (t.images && t.images.length > 0)
        ? `<div class="detail-gallery" id="detailGallery">
            ${t.images.map(f => `<img src="/uploads/${f}" alt="${t.name}" onclick="this.parentElement.querySelector('.active')?.classList.remove('active');this.classList.add('active');" ${t.images[0] === f ? 'class="active"' : ''}>`).join('')}
           </div>`
        : '';

    document.getElementById('simpleModalBody').innerHTML = `
        ${imageGallery}
        <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px;">
            <span class="badge badge-green">${t.category || 'Wisata'}</span>
            <span style="font-size:.85rem;color:var(--text-dim);"><i class="ri-map-pin-line"></i> ${t.location}</span>
            <span style="font-size:.85rem;color:var(--text-dim);"><i class="ri-time-line"></i> ${t.duration}</span>
            <span style="font-size:.85rem;font-weight:700;color:var(--earth-800);">Rp ${formatRp(t.price)} / pax</span>
        </div>
        ${t.description ? `<p style="font-size:.88rem;color:var(--text-dim);margin-bottom:16px;line-height:1.7;">${t.description}</p>` : ''}
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
            <div>
                <h4 style="font-size:.9rem;margin-bottom:8px;color:#3a7248;">✅ Termasuk</h4>
                <ul style="list-style:none;font-size:.82rem;">${(t.includes||[]).length ? t.includes.map(i => `<li style="padding:4px 0;">${i}</li>`).join('') : '<li style="color:var(--text-dim);">-</li>'}</ul>
            </div>
            <div>
                <h4 style="font-size:.9rem;margin-bottom:8px;color:#dc4c4c;">❌ Mengecualikan</h4>
                <ul style="list-style:none;font-size:.82rem;">${(t.excludes||[]).length ? t.excludes.map(i => `<li style="padding:4px 0;">${i}</li>`).join('') : '<li style="color:var(--text-dim);">-</li>'}</ul>
            </div>
        </div>
        <div style="margin-top:16px;display:flex;gap:8px;">
            <button class="btn btn-primary btn-sm" onclick="editTour(${t.id});document.getElementById('simpleModalOverlay').classList.remove('open');">✏️ Edit</button>
            <button class="btn btn-sm btn-outline" onclick="document.getElementById('simpleModalOverlay').classList.remove('open');">Tutup</button>
        </div>
    `;
    overlay.classList.add('open');
}

// =============================================
// SLIDER
// =============================================
document.getElementById('btnAddSlide').addEventListener('click', () => openSimpleModal('slider'));
document.getElementById('btnDashboardAddSlide')?.addEventListener('click', () => openSimpleModal('slider'));
document.getElementById('btnDashboardManageSlider')?.addEventListener('click', () => {
    document.querySelector('.sidebar-link[data-page="slider"]').click();
});

function renderSliderTable() {
    document.getElementById('sliderTableBody').innerHTML = slides.map(s => `
        <tr>
            <td>${s.image ? `<img src="${s.image}" class="table-img" alt="">` : '-'}</td>
            <td>${s.title || '<em style="color:var(--text-dim);">Tanpa judul</em>'}</td>
            <td>
                <button class="btn-icon edit" onclick="editSlide(${s.id})"><i class="ri-edit-line"></i></button>
                <button class="btn-icon delete" onclick="deleteSlide(${s.id})"><i class="ri-delete-bin-line"></i></button>
            </td>
        </tr>
    `).join('') || '<tr><td colspan="3" style="text-align:center;color:var(--text-dim);padding:24px;">Belum ada slide.</td></tr>';
}

function editSlide(id) {
    const s = slides.find(s => s.id === id);
    if (!s) return;
    document.querySelector('.sidebar-link[data-page="slider"]').click();
    setTimeout(() => openSimpleModal('slider', s), 200);
}

async function deleteSlide(id) {
    if (!confirm('Hapus slide ini?')) return;
    await api('/api/slides/' + id, { method: 'DELETE' });
    await refreshAll();
    toast('Slide dihapus.');
}

// =============================================
// GALLERY
// =============================================
document.getElementById('btnAddGallery').addEventListener('click', () => openSimpleModal('gallery'));

function renderGalleryTable() {
    document.getElementById('galleryTableBody').innerHTML = gallery.map(g => `
        <tr>
            <td>${g.image ? `<img src="${g.image}" class="table-img" alt="">` : '-'}</td>
            <td>${g.caption || '<em style="color:var(--text-dim);">Tanpa caption</em>'}</td>
            <td>
                <button class="btn-icon delete" onclick="deleteGallery(${g.id})"><i class="ri-delete-bin-line"></i></button>
            </td>
        </tr>
    `).join('') || '<tr><td colspan="3" style="text-align:center;color:var(--text-dim);padding:24px;">Belum ada gambar.</td></tr>';
}

async function deleteGallery(id) {
    if (!confirm('Hapus gambar ini?')) return;
    await api('/api/gallery/' + id, { method: 'DELETE' });
    await refreshAll();
    toast('Gambar dihapus.');
}

// =============================================
// PARTNERS
// =============================================
document.getElementById('btnAddPartner').addEventListener('click', () => openPartnerModal());

function renderPartnersTable() {
    document.getElementById('partnersTableBody').innerHTML = partners.map(p => `
        <tr>
            <td>${p.image ? `<img src="${p.image}" class="table-img" alt="">` : '<span style="color:var(--text-dim);">-</span>'}</td>
            <td><strong>${p.name || '<em style="color:var(--text-dim);">Tanpa nama</em>'}</strong></td>
            <td>${p.url ? `<a href="${p.url}" target="_blank" rel="noopener" style="color:#0ea5e9;">${p.url}</a>` : '<em style="color:var(--text-dim);">-</em>'}</td>
            <td>
                <button class="btn-icon edit" onclick="openPartnerModal(partners.find(p => p.id === ${p.id}))"><i class="ri-edit-line"></i></button>
                <button class="btn-icon delete" onclick="deletePartner(${p.id})"><i class="ri-delete-bin-line"></i></button>
            </td>
        </tr>
    `).join('') || '<tr><td colspan="4" style="text-align:center;color:var(--text-dim);padding:24px;">Belum ada partner.</td></tr>';
}

async function deletePartner(id) {
    if (!confirm('Hapus partner ini?')) return;
    await api('/api/partners/' + id, { method: 'DELETE' });
    await refreshAll();
    toast('Partner dihapus.');
}

function openPartnerModal(existing = null) {
    const overlay = document.getElementById('simpleModalOverlay');
    const title   = document.getElementById('simpleModalTitle');
    const body    = document.getElementById('simpleModalBody');

    title.textContent = existing ? 'Edit Partner' : 'Tambah Partner';
    body.innerHTML = `
        <form id="simpleForm" class="form" enctype="multipart/form-data">
            <input type="hidden" id="simpleId" value="${existing ? existing.id : ''}">
            <div class="form-group">
                <label>Upload Logo ${existing ? '(biarkan kosong jika tidak diganti)' : '*'}</label>
                <input type="file" id="simpleFile" accept=".jpg,.jpeg,.png,.webp,.gif,.bmp,.avif" ${existing ? '' : 'required'}>
                ${existing && existing.image ? `<img src="${existing.image}" style="width:100%;max-height:110px;object-fit:contain;border-radius:8px;margin-top:8px;background:var(--cream);padding:8px;">` : ''}
                <small>Logo PNG dengan latar transparan paling bagus.</small>
            </div>
            <div class="form-group">
                <label>Nama Partner</label>
                <input type="text" id="simpleName" value="${existing ? (existing.name || '') : ''}" placeholder="Contoh: Sentul Adventure" required>
            </div>
            <div class="form-group">
                <label>Link Website / Sosmed (opsional)</label>
                <input type="text" id="simpleUrl" value="${existing ? (existing.url || '') : ''}" placeholder="https://...">
            </div>
            <button type="submit" class="btn btn-primary btn-full">Simpan</button>
        </form>
    `;

    body.querySelector('#simpleForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
            const editId = body.querySelector('#simpleId').value;
            const fileInput = body.querySelector('#simpleFile');
            const formData = new FormData();
            if (fileInput.files[0]) formData.append('logo', fileInput.files[0]);
            formData.append('name', body.querySelector('#simpleName').value.trim());
            formData.append('url', body.querySelector('#simpleUrl').value.trim());

            if (!editId && !fileInput.files[0]) {
                toast('Pilih file logo dulu.', true);
                return;
            }

            const url = editId ? `/api/partners/${editId}` : '/api/partners';
            await api(url, { method: editId ? 'PUT' : 'POST', body: formData });
            overlay.classList.remove('open');
            await refreshAll();
            toast(editId ? 'Partner diperbarui!' : 'Partner ditambahkan!');
        } catch (err) {
            toast('Gagal: ' + err.message, true);
        }
    });

    overlay.classList.add('open');
}

// =============================================
// SIMPLE MODAL (Slider & Gallery)
// =============================================
function openSimpleModal(type, existing = null) {
    const overlay = document.getElementById('simpleModalOverlay');
    const title   = document.getElementById('simpleModalTitle');
    const body    = document.getElementById('simpleModalBody');

    if (type === 'slider') {
        title.textContent = existing ? 'Edit Slide' : 'Tambah Slide';
        body.innerHTML = `
            <form id="simpleForm" class="form" enctype="multipart/form-data">
                <input type="hidden" id="simpleId" value="${existing ? existing.id : ''}">
                <div class="form-group">
                    <label>Upload Gambar ${existing ? '(biarkan kosong jika tidak diganti)' : '*'}</label>
                    <input type="file" id="simpleFile" accept=".jpg,.jpeg,.png,.webp,.gif,.bmp,.avif" ${existing ? '' : 'required'}>
                    ${existing && existing.image ? `<img src="${existing.image}" style="width:100%;max-height:150px;object-fit:cover;border-radius:8px;margin-top:8px;">` : ''}
                </div>
                <div class="form-group">
                    <label>Judul Slide</label>
                    <input type="text" id="simpleTitle" value="${existing ? (existing.title || '') : ''}" placeholder="Opsional">
                </div>
                <button type="submit" class="btn btn-primary btn-full">Simpan</button>
            </form>
        `;
        body.querySelector('#simpleForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            try {
                const editId = body.querySelector('#simpleId').value;
                const formData = new FormData();
                if (body.querySelector('#simpleFile').files[0]) formData.append('image', body.querySelector('#simpleFile').files[0]);
                formData.append('title', body.querySelector('#simpleTitle').value.trim());

                const url = editId ? `/api/slides/${editId}` : '/api/slides';
                await api(url, { method: editId ? 'PUT' : 'POST', body: formData });
                overlay.classList.remove('open');
                await refreshAll();
                toast(editId ? 'Slide diperbarui!' : 'Slide ditambahkan!');
            } catch (err) {
                toast('Gagal: ' + err.message, true);
            }
        });
    } else if (type === 'gallery') {
        title.textContent = 'Tambah Gambar Galeri';
        body.innerHTML = `
            <form id="simpleForm" class="form" enctype="multipart/form-data">
                <div class="form-group">
                    <label>Upload Gambar *</label>
                    <input type="file" id="simpleFile" accept=".jpg,.jpeg,.png,.webp,.gif,.bmp,.avif" required>
                </div>
                <div class="form-group">
                    <label>Caption</label>
                    <input type="text" id="simpleCaption" placeholder="Opsional">
                </div>
                <button type="submit" class="btn btn-primary btn-full">Tambah</button>
            </form>
        `;
        body.querySelector('#simpleForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            try {
                const file = body.querySelector('#simpleFile').files[0];
                if (!file) {
                    toast('Pilih gambar dulu.', true);
                    return;
                }

                const formData = new FormData();
                formData.append('image', file);
                formData.append('caption', body.querySelector('#simpleCaption').value.trim());
                await api('/api/gallery', { method: 'POST', body: formData });
                overlay.classList.remove('open');
                await refreshAll();
            toast('Gambar ditambahkan! 🖼️');
            } catch (err) {
                toast('Gagal: ' + err.message, true);
            }
        });
    }
    overlay.classList.add('open');
}

// Simple modal close
document.getElementById('simpleModalClose').addEventListener('click', () => {
    document.getElementById('simpleModalOverlay').classList.remove('open');
});
document.getElementById('simpleModalOverlay').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) e.currentTarget.classList.remove('open');
});

// =============================================
// SETTINGS
// =============================================
function loadSettings() {
    document.getElementById('setWa').value      = settings.wa || '';
    document.getElementById('setIg').value      = settings.ig || '';
    document.getElementById('setAddress').value = settings.address || '';
    document.getElementById('setPassword').value = '';
}

document.getElementById('settingsForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const newPass = document.getElementById('setPassword').value.trim();
    const data = {
        wa: document.getElementById('setWa').value.trim(),
        ig: document.getElementById('setIg').value.trim(),
        address: document.getElementById('setAddress').value.trim(),
    };
    if (newPass) data.admin_password = newPass;
    const result = await api('/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    if (result.token) {
        authToken = result.token;
        localStorage.setItem('hts_admin_token', authToken);
    }
    settings = { ...settings, ...data };
    toast('Pengaturan disimpan! ⚙️');
    document.getElementById('setPassword').value = '';
});

// =============================================
// INITIAL LOAD
// =============================================
if (isLoggedIn) {
    api('/api/admin/session')
        .then(() => loadAll())
        .then(() => refreshDashboard())
        .catch(() => toast('Sesi admin berakhir. Silakan masuk kembali.', true));
}
