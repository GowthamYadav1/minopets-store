function initHeroSlider() {
    const slides = document.querySelectorAll('.hero-slide');
    if (!slides.length) return;
    AppState.currentSlide = 0;
    if (AppState.route.view === 'home') manageHeroVideo(0);
    startSlider();
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) pauseHeroVideo();
        else if (AppState.route.view === 'home' && AppState.currentSlide === 0 && !AppState.sliderPaused) playHeroVideo();
    });
}

function prefersReducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function manageHeroVideo(slideIndex) {
    if (AppState.route.view === 'home' && slideIndex === 0 && !prefersReducedMotion()) {
        playHeroVideo();
    } else {
        pauseHeroVideo();
    }
}

function playHeroVideo() {
    const video = document.getElementById('hero-video');
    if (!video || prefersReducedMotion()) return;

    const startPlayback = () => {
        if (!video.src) {
            video.src = video.dataset.src || '/assets/Gold-fish-vid.mp4';
            video.load();
        }
        const playPromise = video.play();
        if (playPromise) playPromise.catch(() => {});
    };

    if (!video.dataset.deferred) {
        video.dataset.deferred = '1';
        if ('requestIdleCallback' in window) {
            requestIdleCallback(startPlayback, { timeout: 2000 });
        } else {
            setTimeout(startPlayback, 600);
        }
        return;
    }
    startPlayback();
}

function pauseHeroVideo() {
    const video = document.getElementById('hero-video');
    if (!video) return;
    video.pause();
}

function goToSlide(index) {
    const slides = document.querySelectorAll('.hero-slide');
    const dots = document.querySelectorAll('.hero-dot');
    if (!slides.length || index < 0 || index >= slides.length) return;

    slides.forEach((slide, i) => slide.classList.toggle('is-active', i === index));
    dots.forEach((dot, i) => dot.classList.toggle('is-active', i === index));
    AppState.currentSlide = index;
    manageHeroVideo(index);
    if (!AppState.sliderPaused) resetSliderInterval();
}

function nextSlide() {
    const slides = document.querySelectorAll('.hero-slide');
    if (!slides.length) return;
    goToSlide((AppState.currentSlide + 1) % slides.length);
}

function startSlider() {
    AppState.sliderInterval = setInterval(() => {
        if (!AppState.sliderPaused && AppState.route.view === 'home') nextSlide();
    }, 5000);
}

function resetSliderInterval() {
    clearInterval(AppState.sliderInterval);
    startSlider();
}

function toggleSliderPause() {
    AppState.sliderPaused = !AppState.sliderPaused;
    document.getElementById('pause-icon')?.classList.toggle('hidden', AppState.sliderPaused);
    document.getElementById('play-icon')?.classList.toggle('hidden', !AppState.sliderPaused);
    if (AppState.sliderPaused) pauseHeroVideo();
    else if (AppState.currentSlide === 0 && AppState.route.view === 'home') playHeroVideo();
}
