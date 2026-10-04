// ============ DOM Elements ============
const header       = document.querySelector('.header');
const burgerBtn    = document.getElementById('burgerBtn');
const mainNav      = document.getElementById('mainNav');
const navLinks     = document.querySelectorAll('.nav__link');
const langSelector = document.getElementById('langSelector');
const langBtn      = document.getElementById('langBtn');
const langCurrent  = langBtn.querySelector('.lang-selector__current');
const langOptions  = document.querySelectorAll('.lang-selector__option');
const scrollHint   = document.querySelector('.hero__scroll');

// ============ 1. Header background on scroll + hero parallax ============
const heroSlides = document.querySelector('.hero__slides');
const hero       = document.querySelector('.hero');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let parallaxQueued = false;

function applyParallax() {
    parallaxQueued = false;
    if (!heroSlides || reduceMotion) return;

    const scrollY = window.scrollY;
    // Background scrolls up slower than content (classic parallax)
    if (scrollY <= hero.offsetHeight) {
        heroSlides.style.transform = `translate3d(0, ${scrollY * 0.35}px, 0)`;
    }
}

function onScroll() {
    header.classList.toggle('header--scrolled', window.scrollY > 40);

    if (!parallaxQueued) {
        parallaxQueued = true;
        requestAnimationFrame(applyParallax);
    }
}

window.addEventListener('scroll', onScroll, { passive: true });
onScroll();

// ============ 2. Language dropdown ============
function toggleLangDropdown(force) {
    const isOpen = typeof force === 'boolean'
        ? force
        : !langSelector.classList.contains('open');
    langSelector.classList.toggle('open', isOpen);
    langBtn.setAttribute('aria-expanded', isOpen);
}

langBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleLangDropdown();
});

langOptions.forEach((option) => {
    option.addEventListener('click', () => {
        // Update selected language
        langCurrent.textContent = option.dataset.lang;

        // Mark selected option
        langOptions.forEach((o) => o.classList.remove('selected'));
        option.classList.add('selected');

        toggleLangDropdown(false);

        // Here you can trigger real language switching (i18n)
        console.log('Language changed to:', option.dataset.lang);
    });
});

// Close dropdown on outside click
document.addEventListener('click', (e) => {
    if (!langSelector.contains(e.target)) {
        toggleLangDropdown(false);
    }
});

// Close dropdown on Escape
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        toggleLangDropdown(false);
        closeMobileMenu();
    }
});

// ============ 3. Mobile burger menu ============
function closeMobileMenu() {
    burgerBtn.classList.remove('open');
    mainNav.classList.remove('open');
    document.body.style.overflow = '';
}

burgerBtn.addEventListener('click', () => {
    const isOpen = mainNav.classList.toggle('open');
    burgerBtn.classList.toggle('open', isOpen);
    // Prevent background scrolling while menu is open
    document.body.style.overflow = isOpen ? 'hidden' : '';
});

// ============ 4. Active nav link ============
navLinks.forEach((link) => {
    link.addEventListener('click', () => {
        navLinks.forEach((l) => l.classList.remove('active'));
        link.classList.add('active');
        closeMobileMenu();
    });
});

// ============ 5. Scroll hint ============
if (scrollHint) {
    scrollHint.addEventListener('click', () => {
        const story = document.querySelector('#story') || document.querySelector('section + section');
        if (story) {
            story.scrollIntoView({ behavior: 'smooth' });
        } else {
            window.scrollBy({ top: window.innerHeight, behavior: 'smooth' });
        }
    });
}

// ============ 6. Close mobile menu on resize to desktop ============
window.addEventListener('resize', () => {
    if (window.innerWidth > 860) {
        closeMobileMenu();
    }
});

// ============ 7. About gallery (desktop: stacked cards, mobile: carousel) ============
const aboutGallery = document.querySelector('.about__gallery');
const aboutSlides  = document.querySelectorAll('.about__slide');
const aboutDots    = document.querySelectorAll('.about-dot');
const aboutNextBtn = document.querySelector('.about__next');
let aboutCurrent   = 0;

function renderAboutGallery() {
    const total = aboutSlides.length;
    aboutSlides.forEach((slide, i) => {
        const depth = (i - aboutCurrent + total) % total;
        slide.dataset.depth = depth;
        slide.setAttribute('aria-hidden', depth > 2);
    });
    aboutDots.forEach((dot, i) => {
        dot.classList.toggle('about-dot--active', i === aboutCurrent);
    });
}

// Arrow switches to the next screenshot (swipe right goes back)
function aboutStep(direction) {
    const total = aboutSlides.length;
    aboutCurrent = (aboutCurrent + direction + total) % total;
    renderAboutGallery();
}

if (aboutNextBtn) {
    aboutNextBtn.addEventListener('click', () => aboutStep(1));
}

aboutDots.forEach((dot, i) => {
    dot.addEventListener('click', () => {
        aboutCurrent = i;
        renderAboutGallery();
    });
});

// ---------------------------------------------------------------------------
// Hero carousel — fade between slides, drive the dots, auto-advance.
// ---------------------------------------------------------------------------
(function heroCarousel() {
    const slides = Array.from(document.querySelectorAll('.hero__slide'));
    const dots = Array.from(document.querySelectorAll('.hero__dots .dot'));
    const nextBtn = document.querySelector('.hero__next');

    if (slides.length === 0) return;

    const AUTOPLAY_MS = 8000;
    let current = slides.findIndex((s) => s.classList.contains('is-active'));
    if (current < 0) current = 0;
    let timer = null;

    function goTo(index) {
        const target = (index + slides.length) % slides.length;
        if (target === current) return;

        slides[current].classList.remove('is-active');
        if (dots[current]) dots[current].classList.remove('is-active');

        current = target;

        slides[current].classList.add('is-active');
        if (dots[current]) dots[current].classList.add('is-active');
    }

    // Any interaction resets the countdown, so the viewer never
    // loses a slide mid-transition.
    function restartAutoplay() {
        clearInterval(timer);
        timer = setInterval(() => goTo(current + 1), AUTOPLAY_MS);
    }

    function interact(fn) {
        return (event) => {
            fn(event);
            restartAutoplay();
        };
    }

    if (nextBtn) {
        nextBtn.addEventListener('click', interact(() => goTo(current + 1)));
    }

    dots.forEach((dot, index) => {
        dot.addEventListener('click', interact(() => goTo(index)));
    });

    document.addEventListener('keydown', (event) => {
        // Skip while the user is typing; target may be document/window.
        if (event.target instanceof Element &&
            event.target.matches('input, textarea, [contenteditable]')) return;
        if (event.key === 'ArrowRight') {
            goTo(current + 1);
            restartAutoplay();
        } else if (event.key === 'ArrowLeft') {
            goTo(current - 1);
            restartAutoplay();
        }
    });

    // Swipe the hero to change slides (touch devices)
    const hero = document.querySelector('.hero');
    if (hero) {
        let startX = 0;
        let startY = 0;

        hero.addEventListener('touchstart', (e) => {
            startX = e.touches[0].clientX;
            startY = e.touches[0].clientY;
        }, { passive: true });

        hero.addEventListener('touchend', (e) => {
            const deltaX = e.changedTouches[0].clientX - startX;
            const deltaY = e.changedTouches[0].clientY - startY;

            // Ignore short swipes and mostly-vertical gestures
            if (Math.abs(deltaX) < 40 || Math.abs(deltaX) < Math.abs(deltaY)) return;

            goTo(deltaX < 0 ? current + 1 : current - 1);
            restartAutoplay();
        }, { passive: true });
    }

    // Do not burn through slides while the tab is hidden.
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            clearInterval(timer);
        } else {
            restartAutoplay();
        }
    });

    restartAutoplay();
})();

// ============ 8. Newsletter form ============
const newsletterForm = document.querySelector('.newsletter__form');

if (newsletterForm) {
    const emailInput = newsletterForm.querySelector('.newsletter__input');
    const field = newsletterForm.querySelector('.newsletter__field');
    const caption = field.querySelector('.newsletter__caption');
    const captionText = caption.textContent;
    const isValid = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);

    newsletterForm.addEventListener('submit', (e) => {
        e.preventDefault();

        const valid = isValid(emailInput.value.trim());
        field.classList.toggle('newsletter__field--error', !valid);
        caption.textContent = valid ? 'Thank you, check your mailbox' : 'Please enter a valid email address';

        if (valid) {
            emailInput.value = '';
        } else {
            emailInput.focus();
        }
    });

    // The caption goes back to its original text while typing
    emailInput.addEventListener('input', () => {
        field.classList.remove('newsletter__field--error');
        caption.textContent = captionText;
    });
}

// Swipe the card to switch screenshots (touch devices)
if (aboutGallery) {
    let startX = 0;
    let startY = 0;

    aboutGallery.addEventListener('touchstart', (e) => {
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
    }, { passive: true });

    aboutGallery.addEventListener('touchend', (e) => {
        const deltaX = e.changedTouches[0].clientX - startX;
        const deltaY = e.changedTouches[0].clientY - startY;

        // Ignore short swipes and mostly-vertical gestures
        if (Math.abs(deltaX) < 40 || Math.abs(deltaX) < Math.abs(deltaY)) return;

        aboutStep(deltaX < 0 ? 1 : -1);
    }, { passive: true });
}

renderAboutGallery();
