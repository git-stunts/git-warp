(function () {
  const THEME_KEY = 'git-stunts-theme';

  function applyTheme(theme) {
    const link = document.getElementById('theme-link');
    if (!link) {
      return;
    }
    const href = theme === 'light' ? 'assets/theme-light.css' : 'assets/theme-dark.css';
    link.setAttribute('href', href);
    document.documentElement.dataset.theme = theme;
    window.dispatchEvent(new CustomEvent('themechange', { detail: { theme } }));
  }

  function initThemeToggle() {
    const stored = localStorage.getItem(THEME_KEY);
    const initial = stored === 'light' ? 'light' : 'dark';
    applyTheme(initial);

    const button = document.getElementById('theme-toggle');
    if (!button) {
      return;
    }

    const updateLabel = (theme) => {
      button.textContent = theme === 'light' ? 'Dark Mode' : 'Light Mode';
    };

    updateLabel(initial);

    button.addEventListener('click', () => {
      const next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
      applyTheme(next);
      updateLabel(next);
      localStorage.setItem(THEME_KEY, next);
    });
  }

  function animateMastheadLogo() {
    const logoContainer = document.getElementById('masthead-logo');
    if (!logoContainer || !window.gsap) {
      return;
    }

    const svg = logoContainer.querySelector('svg');
    if (!svg) {
      return;
    }

    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '100%');

    const drawables = Array.from(svg.querySelectorAll('.logo-path'));
    if (!drawables.length) {
      return;
    }

    drawables.forEach((el) => {
      const length = el.getTotalLength();
      el.style.fill = 'transparent';
      el.dataset.filled = '0';
      el.style.strokeDasharray = length;
      el.style.strokeDashoffset = length;
      el.style.transformBox = 'fill-box';
      el.style.transformOrigin = 'center';
    });

    const tl = window.gsap.timeline();
    tl.to(drawables, {
      strokeDashoffset: 0,
      duration: 1.3,
      ease: 'power2.out',
      stagger: 0.05,
    });
    tl.to(
      drawables,
      {
        fill: 'var(--logo-fill)',
        duration: 0.6,
        ease: 'power2.out',
        stagger: 0.02,
      },
      '-=0.5'
    ).eventCallback('onComplete', () => {
      drawables.forEach((el) => {
        el.dataset.filled = '1';
        el.style.fill = 'var(--logo-fill)';
        el.style.strokeDasharray = 'none';
        el.style.strokeDashoffset = '0';
      });
    });

    window.gsap.to(drawables, {
      y: (i) => (i % 2 === 0 ? 2 : -2),
      rotation: (i) => (i % 2 === 0 ? 1 : -1),
      duration: 2.6,
      ease: 'sine.inOut',
      repeat: -1,
      yoyo: true,
      stagger: { each: 0.1, from: 'random' },
    });
  }

  function highlightActiveNav() {
    const links = Array.from(document.querySelectorAll('.menu-links a[href]'));
    if (!links.length) {
      return;
    }
    const current = window.location.pathname.split('/').pop();
    links.forEach((link) => {
      const href = link.getAttribute('href');
      if (href === current) {
        link.classList.add('is-active');
        link.setAttribute('aria-current', 'page');
      }
    });
  }

  function initMenuToggle() {
    const menu = document.getElementById('menu-fab');
    const button = document.getElementById('menu-button');
    const panel = document.getElementById('menu-panel');
    if (!menu || !button) {
      return;
    }

    const closeMenu = () => {
      menu.classList.remove('is-open');
      button.setAttribute('aria-expanded', 'false');
    };

    button.addEventListener('click', (event) => {
      event.stopPropagation();
      const isOpen = menu.classList.toggle('is-open');
      button.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    });

    if (panel) {
      panel.addEventListener('click', (event) => {
        if (!event.target.closest('.menu-panel-content')) {
          closeMenu();
        }
      });
    }

    document.addEventListener('click', (event) => {
      if (!menu.contains(event.target)) {
        closeMenu();
      }
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        closeMenu();
      }
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    initThemeToggle();
    animateMastheadLogo();
    highlightActiveNav();
    initMenuToggle();
  });
})();
