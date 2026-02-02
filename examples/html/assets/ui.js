(function () {
  const THEME_MODE_KEY = 'git-stunts-theme-mode';
  const THEME_NAME_KEY = 'git-stunts-theme-name';
  const THEMES = [
    {
      id: 'ember',
      label: 'Ember',
      colors: ['#d51300', '#fe5949', '#fdb2aa', '#feebea', '#ffffff'],
    },
    {
      id: 'saffron',
      label: 'Saffron',
      colors: ['#d58d00', '#fec149', '#fde1aa', '#fef7ea', '#ffffff'],
    },
    {
      id: 'signal',
      label: 'Signal',
      colors: ['#6b6b6b', '#748687', '#6dacaf', '#5ad2d8', '#3af6ff'],
    },
    {
      id: 'matrix',
      label: 'Matrix',
      colors: ['#000000', '#42bc07', '#a2e97f', '#e9f3e4', '#ffffff'],
    },
    {
      id: 'velvet-tide',
      label: 'Velvet Tide',
      colors: ['#624060', '#ce7885', '#aeb0a8', '#55d8c6', '#b3dfc3'],
    },
    {
      id: 'dune-bloom',
      label: 'Dune Bloom',
      colors: ['#3b5c5b', '#86c9c9', '#9ae5bc', '#e8c5cd', '#eee0ed'],
    },
    {
      id: 'stone-guardians',
      label: 'Stone Guardians',
      colors: ['#8f855b', '#ada176', '#bdaf86', '#c3b58d', '#c5b58f'],
    },
    {
      id: 'stay-the-night',
      label: 'Stay the Night',
      colors: ['#182012', '#304660', '#5d5939', '#8f855b', '#ada176'],
    },
    {
      id: 'cinder-cream',
      label: 'Cinder Cream',
      colors: ['#252422', '#403d39', '#eb5e28', '#ccc5b9', '#fffcf2'],
    },
  ];

  function hexToRgb(hex) {
    const clean = hex.replace('#', '');
    const value = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
    const num = parseInt(value, 16);
    return {
      r: (num >> 16) & 255,
      g: (num >> 8) & 255,
      b: num & 255,
    };
  }

  function rgba(hex, alpha) {
    const { r, g, b } = hexToRgb(hex);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  function setVar(name, value) {
    document.documentElement.style.setProperty(name, value);
  }

  function applyPalette(colors, mode) {
    const [c1, c2, c3, c4, c5] = colors;

    setVar('--theme-1', c1);
    setVar('--theme-2', c2);
    setVar('--theme-3', c3);
    setVar('--theme-4', c4);
    setVar('--theme-5', c5);

    setVar('--color-dark', c1);
    setVar('--color-deep', c2);
    setVar('--color-mid', c3);
    setVar('--color-accent', c4);
    setVar('--color-light', c5);

    if (mode === 'light') {
      setVar('--page-bg', `radial-gradient(circle at 12% 15%, ${rgba(c5, 0.85)} 0%, ${rgba(c4, 0.7)} 45%, ${rgba(c3, 0.55)} 100%)`);
      setVar('--card-bg', rgba(c5, 0.18));
      setVar('--card-border', rgba(c1, 0.3));
      setVar('--accent', c4);
      setVar('--accent-2', c3);
      setVar('--ink', c1);
      setVar('--muted', rgba(c1, 0.72));
      setVar('--shadow', `0 18px 45px ${rgba(c1, 0.2)}`);
      setVar('--chrome-bg', c1);
      setVar('--chrome-border', c2);
      setVar('--chrome-ink', c5);
      setVar('--chrome-muted', rgba(c5, 0.8));
      setVar('--panel-bg', rgba(c5, 0.94));
      setVar('--panel-border', rgba(c1, 0.28));
      setVar('--panel-ink', c1);
      setVar('--panel-muted', rgba(c1, 0.65));
      setVar('--panel-control-bg', rgba(c1, 0.08));
      setVar('--panel-control-border', rgba(c1, 0.22));
      setVar('--logo-fill', 'var(--ink)');
      setVar('--logo-stroke', 'var(--accent)');
      setVar('--logo-stroke-width', 'clamp(1.4px, 0.4vw, 3px)');
    } else {
      setVar('--page-bg', `radial-gradient(circle at 18% 18%, ${rgba(c1, 0.95)} 0%, ${rgba(c2, 0.8)} 50%, ${rgba(c3, 0.6)} 100%)`);
      setVar('--card-bg', rgba(c1, 0.6));
      setVar('--card-border', rgba(c5, 0.3));
      setVar('--accent', c4);
      setVar('--accent-2', c3);
      setVar('--ink', c5);
      setVar('--muted', rgba(c5, 0.7));
      setVar('--shadow', `0 18px 45px ${rgba('#000000', 0.35)}`);
      setVar('--chrome-bg', c5);
      setVar('--chrome-border', c4);
      setVar('--chrome-ink', c1);
      setVar('--chrome-muted', rgba(c2, 0.7));
      setVar('--panel-bg', rgba(c1, 0.9));
      setVar('--panel-border', rgba(c5, 0.28));
      setVar('--panel-ink', c5);
      setVar('--panel-muted', rgba(c5, 0.7));
      setVar('--panel-control-bg', rgba(c5, 0.08));
      setVar('--panel-control-border', rgba(c5, 0.28));
      setVar('--logo-fill', 'var(--theme-5)');
      setVar('--logo-stroke', 'var(--theme-3)');
      setVar('--logo-stroke-width', 'clamp(1.8px, 0.55vw, 4px)');
    }
  }

  function applyTheme(themeId, mode) {
    const theme = THEMES.find((entry) => entry.id === themeId) || THEMES[0];
    applyPalette(theme.colors, mode);
    document.documentElement.dataset.theme = mode;
    window.dispatchEvent(
      new CustomEvent('themechange', {
        detail: {
          theme: mode,
          palette: theme.id,
        },
      })
    );
  }

  function initThemeToggle() {
    const storedMode = localStorage.getItem(THEME_MODE_KEY);
    const storedTheme = localStorage.getItem(THEME_NAME_KEY);
    const initialMode = storedMode === 'light' ? 'light' : 'dark';
    const initialTheme = THEMES.some((entry) => entry.id === storedTheme) ? storedTheme : THEMES[0].id;

    applyTheme(initialTheme, initialMode);

    const button = document.getElementById('theme-toggle');
    if (!button) {
      return;
    }

    const updateLabel = (mode) => {
      button.textContent = mode === 'light' ? 'Dark Mode' : 'Light Mode';
    };

    updateLabel(initialMode);

    button.addEventListener('click', () => {
      const nextMode = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
      const currentTheme = localStorage.getItem(THEME_NAME_KEY) || initialTheme;
      applyTheme(currentTheme, nextMode);
      updateLabel(nextMode);
      localStorage.setItem(THEME_MODE_KEY, nextMode);
    });
  }

  function initThemeSelect() {
    const select = document.getElementById('theme-select');
    if (!select) {
      return;
    }

    select.innerHTML = '';
    THEMES.forEach((theme) => {
      const option = document.createElement('option');
      option.value = theme.id;
      option.textContent = theme.label;
      select.appendChild(option);
    });

    const storedTheme = localStorage.getItem(THEME_NAME_KEY);
    const currentTheme = THEMES.some((entry) => entry.id === storedTheme) ? storedTheme : THEMES[0].id;
    select.value = currentTheme;

    select.addEventListener('change', (event) => {
      const nextTheme = event.target.value;
      const mode = document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
      applyTheme(nextTheme, mode);
      localStorage.setItem(THEME_NAME_KEY, nextTheme);
    });
  }

  function animateMastheadLogo() {
    const logoContainer = document.getElementById('masthead-logo');
    if (!logoContainer || !window.gsap) {
      return;
    }
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
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
    initThemeSelect();
    animateMastheadLogo();
    highlightActiveNav();
    initMenuToggle();
  });
})();
