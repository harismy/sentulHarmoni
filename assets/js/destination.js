const DETAIL_TOUR_IMAGES = [
    '/uploads/album-curug-leuwi-hejo-01.webp',
    '/uploads/album-goa-garunggang-01.webp',
    '/uploads/album-curug-cibingbin-01.webp',
    '/uploads/album-offroad-hambalang-01.webp',
    '/uploads/album-curug-cibaliung-01.webp',
    '/uploads/album-curug-hordeng-01.webp',
    '/uploads/album-curug-leuwi-asih-01.webp',
    '/uploads/album-curug-love-01.webp'
];

const DETAIL_SUPPORT_IMAGES = [
    '/uploads/gallery-album-curug-leuwi-hejo.webp',
    '/uploads/gallery-album-curug-cibingbin.webp',
    '/uploads/gallery-album-curug-love.webp',
    '/uploads/gallery-album-goa-garunggang.webp'
];

const DEFAULT_ITINERARY = [
    'Bertemu di titik yang telah disepakati dan registrasi peserta',
    'Briefing keselamatan, pemanasan, dan pengecekan perlengkapan',
    'Mulai trekking mengikuti jalur bersama guide lokal',
    'Istirahat dan menikmati destinasi utama serta dokumentasi',
    'Perjalanan kembali menuju titik temu dan penutupan'
];

const DEFAULT_PREPARATIONS = [
    'Sepatu trekking atau sandal gunung',
    'Pakaian ringan dan baju ganti',
    'Jas hujan atau ponco',
    'Obat-obatan pribadi',
    'Tas kecil dan pelindung ponsel',
    'Semangat untuk menjelajah'
];

let currentTour = null;
let allTours = [];
let detailSettings = {};
let detailImages = [];
let lightboxIndex = 0;
let guestCount = 2;
let revealObserver;

window.addEventListener('error', event => {
    const status = document.querySelector('#detailLoading strong');
    if (status) status.textContent = `Gagal memuat halaman: ${event.message}`;
});

window.addEventListener('unhandledrejection', event => {
    const status = document.querySelector('#detailLoading strong');
    if (status) status.textContent = `Gagal memuat halaman: ${event.reason?.message || 'kesalahan tidak dikenal'}`;
});

function detailEscape(value = '') {
    return String(value).replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

function detailPrice(value) {
    return new Intl.NumberFormat('id-ID').format(Number(value) || 0);
}

function tourIdFromUrl() {
    const segments = window.location.pathname.split('/').filter(Boolean);
    return segments[0] === 'destinasi' ? segments[1] : new URLSearchParams(window.location.search).get('id');
}

async function detailFetch(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(response.status === 404 ? 'not-found' : 'request-failed');
    return response.json();
}

function fallbackImageIndex(tour, offset = 0) {
    const base = Math.max((Number(tour.id) || 1) - 1, 0);
    return (base + offset) % DETAIL_TOUR_IMAGES.length;
}

function resolveDetailImages(tour) {
    const uploaded = Array.isArray(tour.images) ? tour.images.filter(Boolean).map(file => `/uploads/${encodeURIComponent(file)}`) : [];
    if (uploaded.length) return uploaded;
    return [
        DETAIL_TOUR_IMAGES[fallbackImageIndex(tour)],
        DETAIL_SUPPORT_IMAGES[fallbackImageIndex(tour, 1) % DETAIL_SUPPORT_IMAGES.length],
        DETAIL_SUPPORT_IMAGES[fallbackImageIndex(tour, 2) % DETAIL_SUPPORT_IMAGES.length]
    ];
}

function enrichDetailTour(tour, index = 0) {
    const numericId = Number(tour.id) || index + 1;
    const images = Array.isArray(tour.images) && tour.images.length ? tour.images.map(file => `/uploads/${encodeURIComponent(file)}`) : [];
    return {
        ...tour,
        difficulty: tour.difficulty || (/ringan/i.test(tour.category || '') ? 'Mudah' : /hard|petualangan/i.test(tour.category || '') ? 'Menantang' : 'Sedang'),
        distance: tour.distance || '3-5 km',
        image: images[0] || DETAIL_TOUR_IMAGES[(numericId - 1) % DETAIL_TOUR_IMAGES.length]
    };
}

document.addEventListener('DOMContentLoaded', async () => {
    initDetailNav();
    initDetailLightbox();
    initDetailReveal();

    const id = tourIdFromUrl();
    if (!id) return showDetailError();

    try {
        const [tour, tours, settings] = await Promise.all([
            detailFetch(`/api/tours/${encodeURIComponent(id)}`),
            detailFetch('/api/tours'),
            detailFetch('/api/settings').catch(() => ({}))
        ]);
        currentTour = tour;
        allTours = tours.map(enrichDetailTour);
        detailSettings = settings || {};
        detailImages = resolveDetailImages(currentTour);
        renderDetailPage();
    } catch (error) {
        showDetailError();
    }
});

function initDetailNav() {
    const menu = document.getElementById('navMenu');
    const toggle = document.getElementById('menuToggle');
    toggle.addEventListener('click', () => {
        const open = menu.classList.toggle('open');
        toggle.setAttribute('aria-expanded', String(open));
        toggle.innerHTML = `<i class="${open ? 'ri-close-line' : 'ri-menu-3-line'}"></i>`;
        document.body.classList.toggle('menu-open', open);
    });
}

function renderDetailPage() {
    const tour = currentTour;
    document.title = `${tour.name} | Harmoni Trekking Sentul`;
    document.querySelector('meta[name="description"]').content = tour.description || `Detail perjalanan ${tour.name} bersama Harmoni Trekking Sentul.`;

    document.getElementById('breadcrumbName').textContent = tour.name;
    document.getElementById('detailCategory').textContent = tour.category || 'Wisata';
    document.getElementById('detailName').textContent = tour.name;
    document.getElementById('detailLocation').textContent = `${tour.location || 'Sentul'}, Bogor`;
    document.getElementById('detailDuration').textContent = tour.duration || '-';
    document.getElementById('detailDistance').textContent = tour.distance || '3-5 km';
    document.getElementById('detailDifficulty').textContent = tour.difficulty || 'Sedang';
    document.getElementById('detailMeetingPoint').textContent = tour.meeting_point || `${tour.location || 'Sentul'}, Bogor`;
    document.getElementById('detailDescription').textContent = tour.description || `Nikmati perjalanan menuju ${tour.name} bersama guide lokal yang berpengalaman. Ritme perjalanan disesuaikan dengan kondisi peserta agar tetap aman dan menyenangkan.`;

    renderDetailGallery();
    renderAudience();
    renderItinerary();
    renderIncludes();
    renderPreparations();
    renderRelatedTours();
    applyDetailSettings();
    initBooking();
    initShare();
    renderDetailFooterRoutes();

    document.getElementById('beginnerAnswer').textContent = tour.difficulty === 'Menantang'
        ? 'Rute ini lebih cocok untuk peserta dengan kondisi fisik yang baik. Konsultasikan pengalaman trekking Anda sebelum memesan.'
        : 'Bisa. Guide akan menyesuaikan ritme perjalanan dengan kondisi peserta, termasuk bagi pemula.';

    document.getElementById('detailLoading').hidden = true;
    document.getElementById('detailContent').hidden = false;
    observeDetailReveal();
}

function renderDetailGallery() {
    const stage = document.getElementById('detailGalleryStage');
    const visible = detailImages.slice(0, 3);
    stage.className = `detail-gallery-stage${visible.length === 1 ? ' single' : visible.length === 2 ? ' two' : ''}`;
    stage.innerHTML = visible.map((image, index) => `
        <button class="detail-gallery-item${index === 0 ? ' gallery-main' : ''}" data-image-index="${index}" aria-label="Buka foto ${index + 1}">
            <img src="${detailEscape(image)}" alt="${detailEscape(currentTour.name)} - foto ${index + 1}">
            ${index === visible.length - 1 && detailImages.length > 3 ? `<span class="detail-gallery-more"><i class="ri-gallery-line"></i> +${detailImages.length - 3} foto</span>` : ''}
        </button>
    `).join('');
    stage.addEventListener('click', event => {
        const button = event.target.closest('[data-image-index]');
        if (button) openDetailLightbox(Number(button.dataset.imageIndex));
    });
}

function renderAudience() {
    const difficulty = currentTour.difficulty || 'Sedang';
    const audiences = difficulty === 'Mudah'
        ? [['ri-seedling-line', 'Cocok untuk pemula'], ['ri-parent-line', 'Ramah keluarga'], ['ri-camera-line', 'Banyak spot foto']]
        : difficulty === 'Menantang'
            ? [['ri-run-line', 'Butuh fisik prima'], ['ri-mountain-line', 'Medan menantang'], ['ri-group-line', 'Guide wajib']]
            : [['ri-footprint-line', 'Pengalaman dasar'], ['ri-group-line', 'Cocok untuk kelompok'], ['ri-landscape-line', 'Panorama beragam']];
    document.getElementById('routeAudience').innerHTML = audiences.map(([icon, label]) => `<span><i class="${icon}"></i> ${detailEscape(label)}</span>`).join('');
}

function renderItinerary() {
    const itinerary = Array.isArray(currentTour.itinerary) && currentTour.itinerary.length ? currentTour.itinerary : DEFAULT_ITINERARY;
    document.getElementById('itineraryList').innerHTML = itinerary.map((item, index) => `
        <div class="itinerary-item">
            <span class="itinerary-number">${String(index + 1).padStart(2, '0')}</span>
            <div><h3>${detailEscape(item)}</h3><p>${index === 0 ? 'Waktu mengikuti kesepakatan dan kondisi perjalanan.' : 'Didampingi oleh guide Harmoni Trekking.'}</p></div>
        </div>
    `).join('');
}

function listMarkup(items, emptyText) {
    const values = Array.isArray(items) && items.length ? items : [emptyText];
    return values.map(item => `<li>${detailEscape(item)}</li>`).join('');
}

function renderIncludes() {
    document.getElementById('includesList').innerHTML = listMarkup(currentTour.includes, 'Guide lokal profesional');
    document.getElementById('excludesList').innerHTML = listMarkup(currentTour.excludes, 'Transportasi menuju titik temu');
}

function renderPreparations() {
    const preparations = Array.isArray(currentTour.preparations) && currentTour.preparations.length ? currentTour.preparations : DEFAULT_PREPARATIONS;
    const icons = ['ri-footprint-line', 'ri-t-shirt-line', 'ri-umbrella-line', 'ri-capsule-line', 'ri-briefcase-4-line', 'ri-heart-pulse-line'];
    document.getElementById('preparationList').innerHTML = preparations.map((item, index) => `<div class="preparation-item"><i class="${icons[index % icons.length]}"></i><span>${detailEscape(item)}</span></div>`).join('');
}

function renderRelatedTours() {
    const related = allTours
        .filter(tour => Number(tour.id) !== Number(currentTour.id))
        .sort((a, b) => Number(b.category === currentTour.category) - Number(a.category === currentTour.category))
        .slice(0, 3);

    document.getElementById('relatedTours').innerHTML = related.map(tour => `
        <a href="/destinasi/${encodeURIComponent(tour.id)}" class="related-card" data-detail-reveal>
            <img src="${detailEscape(tour.image)}" alt="${detailEscape(tour.name)}" loading="lazy">
            <div class="related-card-body">
                <span>${detailEscape(tour.category || 'Wisata')}</span>
                <h3>${detailEscape(tour.name)}</h3>
                <div class="related-card-meta"><strong>Rp ${detailPrice(tour.price)} / pax</strong><i class="ri-arrow-right-line"></i></div>
            </div>
        </a>
    `).join('');
}

function detailWhatsappNumber() {
    let digits = String(detailSettings.wa || '083857161610').replace(/\D/g, '');
    if (digits.startsWith('0')) digits = `62${digits.slice(1)}`;
    return digits;
}

function applyDetailSettings() {
    const instagram = String(detailSettings.ig || 'harmonitrekkingsentul').replace(/^@/, '');
    document.querySelectorAll('[data-wa-link]').forEach(link => link.href = `https://wa.me/${detailWhatsappNumber()}`);
    document.querySelectorAll('[data-ig-link]').forEach(link => link.href = `https://instagram.com/${instagram}`);
}

function initBooking() {
    const unitPrice = Number(currentTour.price) || 0;
    const dateInput = document.getElementById('bookingDate');
    dateInput.min = new Date().toISOString().split('T')[0];
    document.getElementById('bookingPrice').textContent = `Rp ${detailPrice(unitPrice)}`;
    document.getElementById('mobilePrice').textContent = `Rp ${detailPrice(unitPrice)} / pax`;

    const updateGuests = () => {
        document.getElementById('guestCount').textContent = guestCount;
        document.getElementById('bookingTotal').textContent = `Rp ${detailPrice(unitPrice * guestCount)}`;
        document.getElementById('decreaseGuests').disabled = guestCount <= 1;
        document.getElementById('increaseGuests').disabled = guestCount >= 50;
    };
    document.getElementById('decreaseGuests').addEventListener('click', () => { guestCount = Math.max(1, guestCount - 1); updateGuests(); });
    document.getElementById('increaseGuests').addEventListener('click', () => { guestCount = Math.min(50, guestCount + 1); updateGuests(); });
    document.getElementById('bookingButton').addEventListener('click', () => {
        const message = [
            'Halo Harmoni Trekking, saya ingin mengecek ketersediaan trip.',
            '',
            `Destinasi: ${currentTour.name}`,
            `Tanggal: ${dateInput.value || 'Belum ditentukan'}`,
            `Jumlah peserta: ${guestCount} orang`,
            `Estimasi: Rp ${detailPrice(unitPrice * guestCount)}`,
            `Link: ${window.location.href}`
        ].join('\n');
        window.open(`https://wa.me/${detailWhatsappNumber()}?text=${encodeURIComponent(message)}`, '_blank', 'noopener');
    });
    updateGuests();
}

function initShare() {
    document.getElementById('shareButton').addEventListener('click', async () => {
        const payload = { title: currentTour.name, text: `Lihat paket ${currentTour.name} dari Harmoni Trekking Sentul.`, url: window.location.href };
        try {
            if (navigator.share) await navigator.share(payload);
            else {
                await navigator.clipboard.writeText(window.location.href);
                showCopyToast();
            }
        } catch (error) {
            if (error.name !== 'AbortError') showCopyToast('Tidak dapat membagikan tautan');
        }
    });
}

function renderDetailFooterRoutes() {
    document.getElementById('footerRoutes').insertAdjacentHTML('beforeend', allTours.slice(0, 4).map(tour => `<a href="/destinasi/${encodeURIComponent(tour.id)}">${detailEscape(tour.name)}</a>`).join(''));
}

function initDetailLightbox() {
    document.getElementById('detailLightboxClose').addEventListener('click', closeDetailLightbox);
    document.getElementById('detailLightboxPrev').addEventListener('click', () => moveDetailLightbox(-1));
    document.getElementById('detailLightboxNext').addEventListener('click', () => moveDetailLightbox(1));
    document.getElementById('detailLightbox').addEventListener('click', event => { if (event.target === event.currentTarget) closeDetailLightbox(); });
    document.addEventListener('keydown', event => {
        if (!document.getElementById('detailLightbox').classList.contains('open')) return;
        if (event.key === 'Escape') closeDetailLightbox();
        if (event.key === 'ArrowLeft') moveDetailLightbox(-1);
        if (event.key === 'ArrowRight') moveDetailLightbox(1);
    });
}

function openDetailLightbox(index) {
    lightboxIndex = index;
    renderDetailLightbox();
    document.getElementById('detailLightbox').classList.add('open');
    document.getElementById('detailLightbox').setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
}

function moveDetailLightbox(direction) {
    if (!detailImages.length) return;
    lightboxIndex = (lightboxIndex + direction + detailImages.length) % detailImages.length;
    renderDetailLightbox();
}

function renderDetailLightbox() {
    document.getElementById('detailLightboxImage').src = detailImages[lightboxIndex];
    document.getElementById('detailLightboxCount').textContent = `${lightboxIndex + 1} / ${detailImages.length}`;
    const hasMultiple = detailImages.length > 1;
    document.getElementById('detailLightboxPrev').style.display = hasMultiple ? 'grid' : 'none';
    document.getElementById('detailLightboxNext').style.display = hasMultiple ? 'grid' : 'none';
}

function closeDetailLightbox() {
    document.getElementById('detailLightbox').classList.remove('open');
    document.getElementById('detailLightbox').setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
}

function showCopyToast(message = 'Tautan berhasil disalin') {
    const toast = document.getElementById('copyToast');
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => toast.classList.remove('show'), 2200);
}

function initDetailReveal() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    revealObserver = new IntersectionObserver(entries => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('revealed');
                revealObserver.unobserve(entry.target);
            }
        });
    }, { threshold: .12, rootMargin: '0px 0px -40px' });
}

function observeDetailReveal() {
    document.querySelectorAll('[data-detail-reveal]').forEach(element => revealObserver ? revealObserver.observe(element) : element.classList.add('revealed'));
}

function showDetailError() {
    document.getElementById('detailLoading').hidden = true;
    document.getElementById('detailContent').hidden = true;
    document.getElementById('detailError').hidden = false;
}
