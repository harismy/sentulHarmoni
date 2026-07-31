const API_BASE = '';

const FALLBACK_SLIDES = [
    { id: 1, image: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1800&h=1100&fit=crop', title: 'Bentang alam Sentul' },
    { id: 2, image: 'https://images.unsplash.com/photo-1470770841072-f978cf4d019e?w=1800&h=1100&fit=crop', title: 'Udara pagi di perbukitan' },
    { id: 3, image: 'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=1800&h=1100&fit=crop', title: 'Jalur hijau yang menenangkan' }
];

const TOUR_IMAGES = [
    'https://images.unsplash.com/photo-1426604966848-d7adac402bff?w=900&h=700&fit=crop',
    'https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=900&h=700&fit=crop',
    'https://images.unsplash.com/photo-1533105079780-92b9be482077?w=900&h=700&fit=crop',
    'https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=900&h=700&fit=crop',
    'https://images.unsplash.com/photo-1533130061792-64b345e4a833?w=900&h=700&fit=crop',
    'https://images.unsplash.com/photo-1517825738774-7de9363ef735?w=900&h=700&fit=crop'
];

const FALLBACK_TOURS = [
    { id: 1, name: 'Curug Leuwi Hejo - Curug Cepet', location: 'Sentul', duration: '2-3 jam', price: 150000, category: 'Rute Standar', difficulty: 'Sedang', distance: '4 km', description: 'Trekking menyusuri sungai dan hutan menuju curug berair jernih.', images: [], includes: ['Guide profesional', 'Air mineral', 'Tiket masuk'], excludes: ['Transportasi'], itinerary: [], preparations: [] },
    { id: 2, name: 'Bukit Indah - Curug Bidadari', location: 'Sentul', duration: '1-2 jam', price: 150000, category: 'Rute Ringan', difficulty: 'Mudah', distance: '3 km', description: 'Rute santai untuk pemula dan keluarga.', images: [], includes: ['Guide profesional', 'Air mineral'], excludes: ['Transportasi'], itinerary: [], preparations: [] },
    { id: 3, name: 'Goa Agung Garunggang', location: 'Sentul', duration: '2-3 jam', price: 150000, category: 'Rute Standar', difficulty: 'Sedang', distance: '4,5 km', description: 'Eksplorasi goa alam dan lanskap berbatu yang unik.', images: [], includes: ['Guide profesional', 'Peralatan safety'], excludes: ['Transportasi'], itinerary: [], preparations: [] },
    { id: 4, name: 'Curug Cibingbin - Curug Ngumpet', location: 'Sentul', duration: '2-3 jam', price: 150000, category: 'Rute Standar', difficulty: 'Sedang', distance: '5 km', description: 'Dua curug dalam satu perjalanan hijau.', images: [], includes: ['Guide profesional', 'Tiket masuk'], excludes: ['Transportasi'], itinerary: [], preparations: [] },
    { id: 5, name: 'Offroad Sentul Hambalang', location: 'Hambalang', duration: '2-3 jam', price: 1200000, category: 'Petualangan', difficulty: 'Menantang', distance: 'Menyesuaikan', description: 'Perjalanan jeep 4x4 melintasi jalur Hambalang.', images: [], includes: ['Jeep 4x4', 'Driver profesional'], excludes: ['Makan siang'], itinerary: [], preparations: [] },
    { id: 6, name: 'Trekking Sentul Corporate', location: 'Sentul', duration: '1-2 jam', price: 265000, category: 'Corporate', difficulty: 'Mudah', distance: '3 km', description: 'Program alam untuk membangun kebersamaan tim.', images: [], includes: ['Guide', 'Team building'], excludes: ['Transportasi'], itinerary: [], preparations: [] }
];

const FALLBACK_GALLERY = [
    { id: 'f1', image: 'https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?w=1000&h=900&fit=crop', caption: 'Pagi di perbukitan' },
    { id: 'f2', image: 'https://images.unsplash.com/photo-1551632811-561732d1e306?w=700&h=700&fit=crop', caption: 'Melangkah bersama' },
    { id: 'f3', image: 'https://images.unsplash.com/photo-1464822759023-fed622ff2c3b?w=700&h=700&fit=crop', caption: 'Sampai di ketinggian' },
    { id: 'f4', image: 'https://images.unsplash.com/photo-1445307806294-bff7f67ff225?w=700&h=700&fit=crop', caption: 'Jalur yang tenang' },
    { id: 'f5', image: 'https://images.unsplash.com/photo-1439853949127-fa647821eba0?w=700&h=700&fit=crop', caption: 'Alam yang terbuka' },
    { id: 'f6', image: 'https://images.unsplash.com/photo-1464278533981-50106e6176b1?w=1000&h=700&fit=crop', caption: 'Cerita di setiap langkah' }
];

const REVIEWS = [
    { name: 'Rina Wulandari', initials: 'RW', type: 'Family trip', text: 'Guide sangat sabar mengatur tempo anak-anak. Perjalanan terasa aman, santai, dan tetap seru sampai akhir.' },
    { name: 'Ahmad Fauzi', initials: 'AF', type: 'Private trip', text: 'Semua detail dijelaskan sejak awal. Rutenya bagus, dokumentasinya juga natural. Tinggal datang dan menikmati.' },
    { name: 'Dewi Anggraini', initials: 'DA', type: 'Corporate trip', text: 'Tim kami pulang dengan energi baru. Rundown rapi dan guide bisa membuat seluruh peserta tetap terlibat.' }
];

let slides = [];
let tours = [];
let gallery = [];
let settings = {};
let filteredTours = [];
let visibleTours = 6;
let activeCategory = '';
let heroIndex = 0;
let heroTimer;
let revealObserver;

function escapeHtml(value = '') {
    return String(value).replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

function formatPrice(value) {
    return new Intl.NumberFormat('id-ID').format(Number(value) || 0);
}

function resolveUploadedImage(filename) {
    return filename ? `/uploads/${encodeURIComponent(filename)}` : '';
}

function defaultTourImage(tour, index = 0) {
    const numericId = Number(tour.id) || index + 1;
    return TOUR_IMAGES[(numericId - 1) % TOUR_IMAGES.length];
}

function enrichTour(tour, index) {
    const uploadedImages = Array.isArray(tour.images) ? tour.images.map(resolveUploadedImage) : [];
    const fallback = defaultTourImage(tour, index);
    return {
        ...tour,
        difficulty: tour.difficulty || (/ringan/i.test(tour.category || '') ? 'Mudah' : /hard|petualangan/i.test(tour.category || '') ? 'Menantang' : 'Sedang'),
        distance: tour.distance || '3-5 km',
        meeting_point: tour.meeting_point || `${tour.location || 'Sentul'}, Bogor`,
        resolvedImages: uploadedImages.length ? uploadedImages : [fallback],
        image: uploadedImages[0] || tour.image || fallback
    };
}

async function fetchJson(url) {
    const response = await fetch(API_BASE + url);
    if (!response.ok) throw new Error(`Gagal memuat ${url}`);
    return response.json();
}

async function loadData() {
    try {
        const [tourData, slideData, galleryData, settingData] = await Promise.all([
            fetchJson('/api/tours'),
            fetchJson('/api/slides'),
            fetchJson('/api/gallery'),
            fetchJson('/api/settings')
        ]);
        tours = tourData.map(enrichTour);
        slides = slideData.map(slide => ({ ...slide, image: slide.filename ? resolveUploadedImage(slide.filename) : slide.image })).filter(slide => slide.image);
        gallery = galleryData.map(item => ({ ...item, image: item.filename ? resolveUploadedImage(item.filename) : item.image })).filter(item => item.image);
        settings = settingData || {};
        if (!slides.length) slides = FALLBACK_SLIDES;
    } catch (error) {
        tours = FALLBACK_TOURS.map(enrichTour);
        slides = FALLBACK_SLIDES;
        gallery = FALLBACK_GALLERY;
        settings = {};
    }

    if (!gallery.length) gallery = FALLBACK_GALLERY;
    filteredTours = [...tours];
}

document.addEventListener('DOMContentLoaded', async () => {
    await loadData();
    initRevealObserver();
    initNavbar();
    initHero();
    initFilters();
    renderTours();
    renderGallery();
    renderReviews();
    initFaq();
    applySettings();
    initContactForm();
    renderFooterRoutes();
    initLightbox();
    registerRevealElements();
});

function initNavbar() {
    const navbar = document.getElementById('navbar');
    const menu = document.getElementById('navMenu');
    const toggle = document.getElementById('menuToggle');

    const updateNavbar = () => navbar.classList.toggle('scrolled', window.scrollY > 35);
    updateNavbar();
    window.addEventListener('scroll', updateNavbar, { passive: true });

    toggle.addEventListener('click', () => {
        const open = menu.classList.toggle('open');
        toggle.setAttribute('aria-expanded', String(open));
        toggle.innerHTML = `<i class="${open ? 'ri-close-line' : 'ri-menu-3-line'}"></i>`;
        document.body.classList.toggle('menu-open', open);
    });

    document.querySelectorAll('.nav-menu a').forEach(link => link.addEventListener('click', () => {
        menu.classList.remove('open');
        toggle.setAttribute('aria-expanded', 'false');
        toggle.innerHTML = '<i class="ri-menu-3-line"></i>';
        document.body.classList.remove('menu-open');
    }));

    const sections = [...document.querySelectorAll('main section[id]')];
    const updateActiveLink = () => {
        const current = [...sections].reverse().find(section => window.scrollY >= section.offsetTop - 150)?.id || 'home';
        document.querySelectorAll('.nav-link').forEach(link => link.classList.toggle('active', link.getAttribute('href') === `#${current}`));
    };
    window.addEventListener('scroll', updateActiveLink, { passive: true });
}

function initHero() {
    const slider = document.getElementById('heroSlider');
    slider.innerHTML = slides.map((slide, index) => `
        <div class="hero-slide${index === 0 ? ' active' : ''}" style="background-image:url('${escapeHtml(slide.image)}')"></div>
    `).join('');
    document.getElementById('heroTotal').textContent = String(slides.length).padStart(2, '0');

    const showSlide = index => {
        heroIndex = (index + slides.length) % slides.length;
        slider.querySelectorAll('.hero-slide').forEach((slide, slideIndex) => slide.classList.toggle('active', slideIndex === heroIndex));
        document.getElementById('heroCurrent').textContent = String(heroIndex + 1).padStart(2, '0');
        document.getElementById('heroRouteName').textContent = slides[heroIndex].title || 'Trip tersedia setiap minggu';
    };

    const startTimer = () => {
        clearInterval(heroTimer);
        if (slides.length > 1) heroTimer = setInterval(() => showSlide(heroIndex + 1), 6500);
    };

    document.getElementById('heroPrev').addEventListener('click', () => { showSlide(heroIndex - 1); startTimer(); });
    document.getElementById('heroNext').addEventListener('click', () => { showSlide(heroIndex + 1); startTimer(); });
    document.addEventListener('visibilitychange', () => document.hidden ? clearInterval(heroTimer) : startTimer());

    let pointerStart = 0;
    slider.addEventListener('pointerdown', event => { pointerStart = event.clientX; });
    slider.addEventListener('pointerup', event => {
        const delta = event.clientX - pointerStart;
        if (Math.abs(delta) > 50) { showSlide(heroIndex + (delta < 0 ? 1 : -1)); startTimer(); }
    });

    showSlide(0);
    startTimer();
}

function initFilters() {
    const categorySelect = document.getElementById('filterCategory');
    const locationSelect = document.getElementById('filterLocation');
    const categories = [...new Set(tours.map(tour => tour.category).filter(Boolean))];
    const locations = [...new Set(tours.map(tour => tour.location).filter(Boolean))];

    categorySelect.innerHTML = '<option value="">Semua rute</option>' + categories.map(category => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`).join('');
    locationSelect.innerHTML = '<option value="">Semua lokasi</option>' + locations.map(location => `<option value="${escapeHtml(location)}">${escapeHtml(location)}</option>`).join('');

    const chips = document.getElementById('categoryChips');
    chips.innerHTML = ['Semua', ...categories].map((category, index) => `<button class="filter-chip${index === 0 ? ' active' : ''}" data-category="${index === 0 ? '' : escapeHtml(category)}">${escapeHtml(category)}</button>`).join('');
    chips.addEventListener('click', event => {
        const button = event.target.closest('.filter-chip');
        if (!button) return;
        activeCategory = button.dataset.category;
        categorySelect.value = activeCategory;
        chips.querySelectorAll('.filter-chip').forEach(chip => chip.classList.toggle('active', chip === button));
        applyFilters();
    });

    document.getElementById('btnSearch').addEventListener('click', () => {
        activeCategory = categorySelect.value;
        chips.querySelectorAll('.filter-chip').forEach(chip => chip.classList.toggle('active', chip.dataset.category === activeCategory));
        applyFilters();
        document.getElementById('destinasi').scrollIntoView({ behavior: 'smooth' });
    });

    document.getElementById('btnLoadMore').addEventListener('click', () => {
        visibleTours += 6;
        renderTours();
    });
}

function applyFilters() {
    const category = document.getElementById('filterCategory').value;
    const location = document.getElementById('filterLocation').value;
    const duration = document.getElementById('filterDuration').value;

    filteredTours = tours.filter(tour => {
        if (category && tour.category !== category) return false;
        if (location && tour.location !== location) return false;
        if (duration) {
            const tourHours = Number.parseInt(tour.duration, 10) || 0;
            if (duration === '4+' && tourHours < 4) return false;
            if (duration !== '4+') {
                const [min, max] = duration.split('-').map(Number);
                if (tourHours < min || tourHours > max) return false;
            }
        }
        return true;
    });
    visibleTours = 6;
    renderTours();
}

function renderTours() {
    const grid = document.getElementById('toursGrid');
    const items = filteredTours.slice(0, visibleTours);
    grid.innerHTML = items.map((tour, index) => `
        <article class="tour-card" data-reveal style="transition-delay:${Math.min(index % 3, 2) * 80}ms">
            <a href="/destinasi/${encodeURIComponent(tour.id)}" class="tour-card-image" aria-label="Lihat detail ${escapeHtml(tour.name)}">
                <img src="${escapeHtml(tour.image)}" alt="${escapeHtml(tour.name)}" loading="lazy">
                <span class="tour-badge">${escapeHtml(tour.category || 'Wisata')}</span>
                <span class="tour-photo-count"><i class="ri-camera-line"></i> ${tour.resolvedImages.length} foto</span>
            </a>
            <div class="tour-card-body">
                <span class="tour-location"><i class="ri-map-pin-2-line"></i> ${escapeHtml(tour.location || 'Sentul')}</span>
                <h3>${escapeHtml(tour.name)}</h3>
                <div class="tour-meta">
                    <span title="Durasi"><i class="ri-time-line"></i> ${escapeHtml(tour.duration || '-')}</span>
                    <span title="Kesulitan"><i class="ri-bar-chart-line"></i> ${escapeHtml(tour.difficulty)}</span>
                    <span title="Jarak"><i class="ri-road-map-line"></i> ${escapeHtml(tour.distance)}</span>
                </div>
                <div class="tour-card-footer">
                    <div class="tour-price"><small>Mulai dari</small><strong>Rp ${formatPrice(tour.price)} / pax</strong></div>
                    <a href="/destinasi/${encodeURIComponent(tour.id)}" class="tour-detail-link" aria-label="Buka detail ${escapeHtml(tour.name)}"><i class="ri-arrow-right-line"></i></a>
                </div>
            </div>
        </article>
    `).join('');

    document.getElementById('emptyTours').hidden = filteredTours.length !== 0;
    document.getElementById('btnLoadMore').style.display = filteredTours.length > visibleTours ? 'inline-flex' : 'none';
    registerRevealElements();
}

function renderGallery() {
    const grid = document.getElementById('galleryGrid');
    grid.classList.toggle('gallery-grid-sparse', gallery.length < 4);
    grid.classList.toggle('gallery-grid-single', gallery.length === 1);
    grid.innerHTML = gallery.slice(0, 12).map((item, index) => `
        <button class="gallery-item" data-gallery-index="${index}" data-reveal aria-label="Buka foto ${escapeHtml(item.caption || `Perjalanan ${index + 1}`)}">
            <img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.caption || 'Momen perjalanan Harmoni Trekking')}" loading="lazy">
            <span class="gallery-caption">${escapeHtml(item.caption || 'Harmoni Trekking Sentul')}</span>
        </button>
    `).join('');
    grid.addEventListener('click', event => {
        const item = event.target.closest('.gallery-item');
        if (item) openLightbox(gallery[Number(item.dataset.galleryIndex)]);
    });
}

function renderReviews() {
    document.getElementById('reviewList').innerHTML = REVIEWS.map(review => `
        <article class="review-item" data-reveal>
            <blockquote>"${escapeHtml(review.text)}"</blockquote>
            <div class="review-author">
                <span class="review-person"><span class="review-avatar" aria-hidden="true">${review.initials}</span><strong>${escapeHtml(review.name)}</strong></span>
                <small>${escapeHtml(review.type)}</small>
            </div>
        </article>
    `).join('');
}

function initFaq() {
    document.getElementById('faqList').addEventListener('click', event => {
        const button = event.target.closest('button');
        if (!button) return;
        const item = button.closest('.faq-item');
        const willOpen = !item.classList.contains('open');
        document.querySelectorAll('.faq-item').forEach(faq => {
            faq.classList.remove('open');
            faq.querySelector('button').setAttribute('aria-expanded', 'false');
        });
        item.classList.toggle('open', willOpen);
        button.setAttribute('aria-expanded', String(willOpen));
    });
}

function whatsappNumber() {
    let digits = String(settings.wa || '083857161610').replace(/\D/g, '');
    if (digits.startsWith('0')) digits = `62${digits.slice(1)}`;
    return digits;
}

function applySettings() {
    const wa = whatsappNumber();
    const waDisplay = settings.wa || '0838-5716-1610';
    const instagram = String(settings.ig || 'harmonitrekkingsentul').replace(/^@/, '');
    const address = settings.address || 'Sentul, Bogor, Jawa Barat';

    document.querySelectorAll('[data-wa-link]').forEach(link => link.href = `https://wa.me/${wa}`);
    document.querySelectorAll('[data-wa-display]').forEach(element => element.textContent = waDisplay);
    document.querySelectorAll('[data-ig-link]').forEach(link => link.href = `https://instagram.com/${instagram}`);
    document.querySelectorAll('[data-ig-display]').forEach(element => element.textContent = `@${instagram}`);
    document.querySelectorAll('[data-address]').forEach(element => element.textContent = address);
}

function initContactForm() {
    const destination = document.getElementById('contactDestination');
    destination.innerHTML = '<option value="">Pilih destinasi</option>' + tours.map(tour => `<option value="${escapeHtml(tour.name)}">${escapeHtml(tour.name)}</option>`).join('');
    document.getElementById('contactDate').min = new Date().toISOString().split('T')[0];

    document.getElementById('contactForm').addEventListener('submit', event => {
        event.preventDefault();
        const lines = [
            'Halo Harmoni Trekking, saya ingin konsultasi perjalanan.',
            '',
            `Nama: ${document.getElementById('contactName').value.trim()}`,
            `No. WhatsApp: ${document.getElementById('contactPhone').value.trim()}`,
            `Destinasi: ${destination.value}`,
            `Tanggal: ${document.getElementById('contactDate').value || 'Belum ditentukan'}`,
            `Peserta: ${document.getElementById('contactPax').value || '1'} orang`,
            `Catatan: ${document.getElementById('contactMessage').value.trim() || '-'}`
        ];
        window.open(`https://wa.me/${whatsappNumber()}?text=${encodeURIComponent(lines.join('\n'))}`, '_blank', 'noopener');
    });
}

function renderFooterRoutes() {
    const container = document.getElementById('footerRoutes');
    container.insertAdjacentHTML('beforeend', tours.slice(0, 4).map(tour => `<a href="/destinasi/${encodeURIComponent(tour.id)}">${escapeHtml(tour.name)}</a>`).join(''));
}

function initLightbox() {
    const lightbox = document.getElementById('lightbox');
    document.getElementById('lightboxClose').addEventListener('click', closeLightbox);
    lightbox.addEventListener('click', event => { if (event.target === lightbox) closeLightbox(); });
    document.addEventListener('keydown', event => { if (event.key === 'Escape') closeLightbox(); });
}

function openLightbox(item) {
    if (!item) return;
    document.getElementById('lightboxImage').src = item.image;
    document.getElementById('lightboxCaption').textContent = item.caption || 'Harmoni Trekking Sentul';
    document.getElementById('lightbox').classList.add('open');
    document.getElementById('lightbox').setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
}

function closeLightbox() {
    document.getElementById('lightbox').classList.remove('open');
    document.getElementById('lightbox').setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
}

function initRevealObserver() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    revealObserver = new IntersectionObserver(entries => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('revealed');
                revealObserver.unobserve(entry.target);
            }
        });
    }, { threshold: .12, rootMargin: '0px 0px -45px' });
}

function registerRevealElements() {
    document.querySelectorAll('[data-reveal]:not([data-reveal-bound])').forEach(element => {
        element.dataset.revealBound = 'true';
        if (revealObserver) revealObserver.observe(element);
        else element.classList.add('revealed');
    });
}
