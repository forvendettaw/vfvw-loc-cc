(() => {
  'use strict';

  // Install as /assets/app.js with defer on every page. No storage or routing.
  function init() {
    const byId = id => document.getElementById(id);
    const root = document.documentElement;
    const themeButton = byId('theme-toggle');
    const searchTrigger = byId('search-trigger');
    const home = document.querySelector('[data-home-archive]');
    const search = home ? byId('article-search') : null;
    const roles = ['bg', 'fg', 'primary', 'accent', 'surface'];

    function palette(mode) {
      const styles = getComputedStyle(root);
      return roles.map(role => [
        `--seed-${role}`,
        styles.getPropertyValue(`--seed-${mode}-${role}`).trim(),
      ]);
    }

    function isDark() {
      // Resolve the actual seed colour, including any CSS preset the page uses.
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 1;
        canvas.height = 1;
        const context = canvas.getContext('2d');
        if (context) {
          context.fillStyle = getComputedStyle(root).getPropertyValue('--seed-bg').trim();
          context.fillRect(0, 0, 1, 1);
          const [r, g, b] = context.getImageData(0, 0, 1, 1).data;
          return 0.2126 * r + 0.7152 * g + 0.0722 * b < 128;
        }
      } catch (_) {
        // A browser may disable canvas; seed comparison still covers both themes.
      }
      const styles = getComputedStyle(root);
      return styles.getPropertyValue('--seed-bg').trim() ===
        styles.getPropertyValue('--seed-night-bg').trim();
    }

    function updateThemeButton() {
      if (!themeButton) return;
      const available = ['day', 'night'].every(mode => palette(mode).every(([, value]) => value));
      themeButton.hidden = !available;
      if (!available) return;
      const dark = isDark();
      const label = dark ? '切换为日间阅读' : '切换为夜间阅读';
      themeButton.setAttribute('aria-pressed', String(dark));
      themeButton.setAttribute('aria-label', label);
      themeButton.title = label;
      const icon = themeButton.querySelector('use');
      if (icon) icon.setAttribute('href', dark ? '#i-sun' : '#i-moon');
      root.style.colorScheme = dark ? 'dark' : 'light';
    }

    if (themeButton) {
      themeButton.addEventListener('click', () => {
        const next = palette(isDark() ? 'day' : 'night');
        if (next.some(([, value]) => !value)) return;
        next.forEach(([property, value]) => root.style.setProperty(property, value));
        updateThemeButton();
      });
      updateThemeButton();
      window.addEventListener('pageshow', updateThemeButton);
    }

    function focusSearch() {
      if (!search) {
        const homeURL = new URL(searchTrigger ? searchTrigger.href : '/', window.location.href);
        homeURL.hash = 'article-search';
        window.location.assign(homeURL.href);
        return;
      }
      byId('archive').scrollIntoView({ block: 'start', behavior: 'instant' });
      search.focus({ preventScroll: true });
    }

    if (searchTrigger) {
      searchTrigger.addEventListener('click', event => {
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        focusSearch();
      });
    }
    document.addEventListener('keydown', event => {
      if (event.defaultPrevented || event.isComposing || event.altKey) return;
      const target = event.target;
      const editing = target instanceof Element && (
        target.isContentEditable || target.closest('input, textarea, select, [role="textbox"]')
      );
      const shortcut = (event.key === '/' && !event.metaKey && !event.ctrlKey) ||
        (event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey));
      if (shortcut && !editing) {
        event.preventDefault();
        focusSearch();
      }
    });

    // Category/article/404 pages only need the shared navigation and theme logic.
    if (!home || !search) return;
    const grid = byId('article-grid');
    const topics = byId('categories');
    if (!grid || !topics) return;
    const PAGE_SIZE = 6;
    const STATE_KEY = 'vfvwHome';
    const normalize = value => String(value).normalize('NFKC').toLocaleLowerCase().replace(/\s+/g, ' ').trim();
    const cards = Array.from(grid.querySelectorAll('.archive-card')).map(element => ({
      element,
      category: element.dataset.category || '',
      text: normalize(element.dataset.search || element.textContent),
      featured: element.dataset.featured === '1',
    }));

    // Category anchors are real crawlable links without JS, buttons with JS.
    const buttons = Array.from(topics.querySelectorAll('a[data-topic]')).map(link => {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.topic = link.dataset.topic;
      button.setAttribute('aria-controls', 'article-grid');
      Array.from(link.childNodes).forEach(node => button.appendChild(node.cloneNode(true)));
      link.replaceWith(button);
      return button;
    });
    const validTopics = new Set(buttons.map(button => button.dataset.topic));
    let selected = '';
    let limit = PAGE_SIZE;
    let query = '';
    let results = [];
    let saved = null;
    try {
      // History state belongs to this document entry; no browser storage is used.
      saved = window.history.state && window.history.state[STATE_KEY];
    } catch (_) {
      // Filtering remains usable even in hosts that restrict history access.
    }
    if (saved && saved.version === 1) {
      if (validTopics.has(saved.topic)) selected = saved.topic;
      if (Number.isSafeInteger(saved.limit) && saved.limit >= PAGE_SIZE) {
        limit = Math.max(PAGE_SIZE, Math.min(saved.limit, cards.length));
      }
      if (!search.value && typeof saved.query === 'string') search.value = saved.query;
    }
    query = normalize(search.value);

    function remember() {
      try {
        const current = window.history.state;
        // Do not replace another controller's primitive/array state.
        if (current !== null && (typeof current !== 'object' || Array.isArray(current))) return;
        window.history.replaceState({
          ...(current || {}),
          [STATE_KEY]: { version: 1, topic: selected, query: search.value, limit },
        }, '');
      } catch (_) {
        // Native back/BFCache remains the fallback; never change the URL or scrollRestoration.
      }
    }

    function render() {
      query = normalize(search.value);
      const filtering = selected !== '' || query !== '';
      const words = query ? query.split(' ') : [];
      results = cards.filter(card =>
        (filtering || !card.featured) &&
        (!selected || card.category === selected) &&
        words.every(word => card.text.includes(word))
      );
      const shown = new Set(results.slice(0, limit));
      cards.forEach(card => { card.element.hidden = !shown.has(card); });
      const front = byId('front-page');
      if (front) front.hidden = filtering;
      byId('archive-title').textContent = filtering ? (query ? '搜索结果' : `${selected} · 文章`) : '继续探索';
      byId('article-count').textContent = `${cards.length} 篇文章`;
      byId('result-status').textContent = filtering
        ? `找到 ${results.length} 篇${selected ? `「${selected}」` : ''}文章 · 已展示 ${shown.size} 篇`
        : results.length
          ? `还有 ${results.length} 篇值得读 · 已展示 ${shown.size} 篇 · 不重复展示封面与最新文章`
          : cards.length ? '最新文章已在上方展示' : '共 0 篇文章';
      byId('clear-filters').hidden = !filtering;
      byId('archive-order').hidden = filtering;
      byId('clear-search').hidden = search.value.length === 0;
      byId('search-shortcut').hidden = search.value.length > 0;
      byId('empty-state').hidden = results.length > 0 || (!filtering && cards.length > 0);
      byId('reset-empty').hidden = !filtering;
      byId('pagination').hidden = results.length === 0;
      byId('load-more').hidden = shown.size >= results.length;
      byId('pagination-status').textContent = `已展示 ${shown.size} / ${results.length} 篇${shown.size >= results.length ? ' · 已到最后' : ''}`;
      buttons.forEach(button => {
        button.setAttribute('aria-pressed', String(button.dataset.topic === selected));
      });
    }

    function applyQuery() {
      limit = PAGE_SIZE;
      render();
      remember();
    }

    function reset() {
      selected = '';
      search.value = '';
      applyQuery();
    }

    topics.addEventListener('click', event => {
      const button = event.target.closest('button[data-topic]');
      if (!button || !topics.contains(button)) return;
      selected = button.dataset.topic;
      applyQuery();
      button.focus({ preventScroll: true });
    });
    search.addEventListener('input', event => {
      if (!event.isComposing) applyQuery();
    });
    search.addEventListener('compositionend', applyQuery);
    search.addEventListener('search', applyQuery);
    search.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !event.isComposing) {
        event.preventDefault();
        search.value = '';
        applyQuery();
      }
    });
    byId('search-form').addEventListener('submit', event => {
      event.preventDefault();
      applyQuery();
      focusSearch();
    });
    byId('clear-search').addEventListener('click', () => {
      search.value = '';
      applyQuery();
      search.focus({ preventScroll: true });
    });
    byId('clear-filters').addEventListener('click', () => {
      reset();
      if (buttons[0]) buttons[0].focus({ preventScroll: true });
    });
    byId('reset-empty').addEventListener('click', () => {
      reset();
      search.focus({ preventScroll: true });
    });
    byId('load-more').addEventListener('click', () => {
      const previous = Math.min(limit, results.length);
      limit += PAGE_SIZE;
      render();
      remember();
      const firstNewCard = results[previous];
      const link = firstNewCard && firstNewCard.element.querySelector('[data-article-link]');
      if (link) link.focus({ preventScroll: true });
    });

    byId('search-form').hidden = false;
    render();
    window.addEventListener('pageshow', event => {
      // Reapply native-restored input values, keeping BFCache's loaded count and scroll.
      if (normalize(search.value) !== query) limit = PAGE_SIZE;
      render();
      const navigation = window.performance && window.performance.getEntriesByType
        ? window.performance.getEntriesByType('navigation')[0] : null;
      if (!event.persisted && (!navigation || navigation.type !== 'back_forward') &&
          window.location.hash === '#article-search') {
        focusSearch();
      }
    });
    window.addEventListener('pagehide', remember);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();

;(() => {
  'use strict';

  const article = document.getElementById('reading-article');
  if (!article || article.dataset.readerReady === 'true') return;
  const body = article.querySelector('#reading-body');
  if (!body) return;
  article.dataset.readerReady = 'true';

  const hasBody = body.dataset.readerEmpty !== 'true';
  const isBrief = Boolean(article.closest('.reader-brief'));
  const progress = article.querySelector('#reader-progress');
  const progressLabel = article.querySelector('#reader-progress-label');
  const progressTrack = article.querySelector('.reader-progress-track');
  const toolbar = article.querySelector('.reader-toolbar');
  const fontDown = article.querySelector('#reader-font-down');
  const fontUp = article.querySelector('#reader-font-up');
  const fontLabel = article.querySelector('#reader-font-label');
  const topbar = document.querySelector('.site-header');
  document.body.classList.add('reading-mode');
  if (isBrief) document.body.classList.add('reading-brief');
  const toolbarHost = document.querySelector('.nav-tools');
  if (toolbar && toolbarHost) toolbarHost.prepend(toolbar);
  const toc = article.querySelector('.reader-toc');
  const tocDetails = toc && toc.querySelector('details');
  const tocLinks = toc ? Array.from(toc.querySelectorAll('a[href^="#section-"]')) : [];
  const sections = tocLinks.map((link) => ({
    link,
    heading: document.getElementById(link.getAttribute('href').slice(1)),
  })).filter(({ heading }) => heading && body.contains(heading));
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const compactViewport = window.matchMedia('(max-width: 900px)');
  const root = document.documentElement;
  const originalScrollBehavior = root.style.scrollBehavior;
  const originalProgressTransition = progress ? progress.style.transition : '';
  let currentSection = null;
  let framePending = false;

  const clamp = (number, min, max) => Math.min(max, Math.max(min, number));
  const listenToMedia = (media, listener) => {
    if (typeof media.addEventListener === 'function') media.addEventListener('change', listener);
    else if (typeof media.addListener === 'function') media.addListener(listener);
  };

  function syncMotion() {
    // Native hash links remain native; override any sitewide smooth scrolling
    // only while the reader's reduced-motion preference requires it.
    root.style.scrollBehavior = reducedMotion.matches ? 'auto' : originalScrollBehavior;
    if (progress) progress.style.transition = reducedMotion.matches ? 'none' : originalProgressTransition;
  }

  function viewportHeight() {
    return Math.max(1, window.innerHeight || root.clientHeight);
  }

  function topInset() {
    if (!topbar) return 0;
    const position = window.getComputedStyle(topbar).position;
    if (position !== 'sticky' && position !== 'fixed') return 0;
    return clamp(topbar.getBoundingClientRect().bottom, 0, viewportHeight() - 1);
  }

  function syncTocLayout() {
    if (tocDetails) tocDetails.open = !compactViewport.matches;
    scheduleUpdate();
  }

  function updateCurrentSection(inset, height, bodyRect) {
    const readingLine = inset + Math.min(100, (height - inset) * 0.18);
    let active = null;
    if (bodyRect.top < height) {
      for (const section of sections) {
        if (section.heading.getBoundingClientRect().top <= readingLine) active = section;
        else break;
      }
      // Before the first section reaches the reading line, identify it only
      // when it is actually on screen, not while the cover is being viewed.
      if (!active && sections.length) {
        const first = sections[0];
        const rect = first.heading.getBoundingClientRect();
        if (rect.top < height && rect.bottom > inset) active = first;
      }
    }
    if (active === currentSection) return;
    for (const section of sections) {
      if (section === active) section.link.setAttribute('aria-current', 'location');
      else section.link.removeAttribute('aria-current');
    }
    currentSection = active;
  }

  function updateReadingPosition() {
    framePending = false;
    const rect = body.getBoundingClientRect();
    const height = viewportHeight();
    const inset = topInset();
    article.style.setProperty('--reader-scroll-offset', `${inset + 24}px`);
    if (hasBody && progress && !isBrief) {
      const visibleHeight = height - inset;
      const travel = rect.height - visibleHeight;
      // For a long body: 0 at its top reading edge, 100 when its end is visible.
      // For a short body: count its visible extent, reaching 100 once all fits.
      // Headers, covers, source links and recommendations never extend this range.
      const fraction = travel > 1
        ? (inset - rect.top) / travel
        : (height - rect.top) / Math.max(1, rect.height);
      const percent = clamp(fraction * 100, 0, 100);
      const rounded = Math.round(percent);
      progress.style.width = `${percent.toFixed(2)}%`;
      progress.setAttribute('aria-valuenow', String(rounded));
      if (progressLabel) progressLabel.textContent = `${rounded}%`;
    }
    updateCurrentSection(inset, height, rect);
  }

  function scheduleUpdate() {
    if (framePending) return;
    framePending = true;
    window.requestAnimationFrame(updateReadingPosition);
  }

  if (hasBody) {
    if (toolbar) toolbar.hidden = false;
    // Briefs keep font controls but omit the long-form progress indicator.
    if (progressTrack) progressTrack.hidden = isBrief;
    let fontSize = clamp(Math.round(parseFloat(window.getComputedStyle(body).fontSize) || 18), 16, 22);
    function applyFontSize(commit = true) {
      if (commit) article.style.setProperty('--reader-font-size', `${fontSize}px`);
      if (fontDown) fontDown.disabled = fontSize <= 16;
      if (fontUp) fontUp.disabled = fontSize >= 22;
      if (fontLabel) fontLabel.textContent = `${fontSize}px`;
      scheduleUpdate();
    }
    if (fontDown) fontDown.addEventListener('click', () => {
      fontSize = clamp(fontSize - 1, 16, 22);
      applyFontSize();
    });
    if (fontUp) fontUp.addEventListener('click', () => {
      fontSize = clamp(fontSize + 1, 16, 22);
      applyFontSize();
    });
    applyFontSize(false);
  }

  article.querySelectorAll('button[data-copy-code]').forEach((button) => {
    const code = document.getElementById(button.dataset.copyCode);
    const status = document.getElementById(button.getAttribute('aria-describedby'));
    if (!code || code.tagName !== 'CODE' || !body.contains(code) || !status || !article.contains(status)) return;
    const originalLabel = button.getAttribute('aria-label') || '复制代码';
    button.hidden = false;
    button.addEventListener('click', () => {
      if (button.disabled) return;
      button.disabled = true;
      button.setAttribute('aria-busy', 'true');
      button.setAttribute('aria-label', originalLabel);
      button.textContent = '复制中';
      status.textContent = '正在复制代码…';
      const finish = () => {
        button.disabled = false;
        button.removeAttribute('aria-busy');
      };
      const fail = (message) => {
        button.textContent = '重试复制';
        button.setAttribute('aria-label', `${originalLabel}，上次复制失败，可重试`);
        status.textContent = message;
        finish();
      };
      if (!window.isSecureContext || !navigator.clipboard || typeof navigator.clipboard.writeText !== 'function') {
        const helper = document.createElement('textarea');
        helper.value = code.textContent;
        helper.setAttribute('aria-hidden', 'true');
        helper.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
        const previousFocus = document.activeElement;
        let copied = false;
        try {
          document.body.appendChild(helper);
          helper.select();
          copied = document.execCommand('copy');
        } catch (_) {
          copied = false;
        } finally {
          helper.remove();
          if (previousFocus && typeof previousFocus.focus === 'function') previousFocus.focus({ preventScroll: true });
        }
        if (copied) {
          button.textContent = '已复制';
          button.setAttribute('aria-label', `${originalLabel}，复制成功，可再次复制`);
          status.textContent = '代码已复制。';
          finish();
        } else {
          const selection = window.getSelection();
          if (selection) { const range = document.createRange(); range.selectNodeContents(code); selection.removeAllRanges(); selection.addRange(range); }
          fail('浏览器未允许自动复制，代码已选中，请按 ⌘C 或 Ctrl+C 复制。');
        }
        return;
      }
      // Invoke writeText within the click activation. Both synchronous failures
      // and permission-denied promise rejections produce an announced result.
      try {
        Promise.resolve(navigator.clipboard.writeText(code.textContent))
          .then(() => {
            button.textContent = '已复制';
            button.setAttribute('aria-label', `${originalLabel}，复制成功，可再次复制`);
            status.textContent = '代码已复制。';
            finish();
          })
          .catch(() => {
            fail('复制失败：浏览器未授权剪贴板访问，请选中代码手动复制。');
          });
      } catch (error) {
        fail('复制失败：浏览器无法访问剪贴板，请选中代码手动复制。');
      }
    });
  });

  // Do not cancel clicks or replace the URL: anchors, history and deep links
  // keep working with JavaScript disabled and with keyboard navigation.
  article.querySelectorAll('a[href^="#"]').forEach((link) => {
    const target = document.getElementById(link.getAttribute('href').slice(1));
    if (!target) return;
    link.addEventListener('click', (event) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      if (toc && toc.contains(link) && tocDetails && compactViewport.matches) tocDetails.open = false;
      window.requestAnimationFrame(() => {
        if (target.hasAttribute('tabindex')) target.focus({ preventScroll: true });
        scheduleUpdate();
      });
    });
  });

  function focusHashTarget() {
    const id = window.location.hash.slice(1);
    const target = document.getElementById(id);
    if (target && (body.contains(target) || id === 'reader-top') && target.hasAttribute('tabindex')) {
      target.focus({ preventScroll: true });
    }
    scheduleUpdate();
  }

  if (sections.length && 'IntersectionObserver' in window) {
    // The observer detects section entry; the scroll geometry also covers long
    // stretches between headings and fast jumps that skip the observation band.
    const observer = new window.IntersectionObserver(scheduleUpdate, {
      rootMargin: '-12% 0px -70% 0px',
      threshold: 0,
    });
    sections.forEach(({ heading }) => observer.observe(heading));
  }
  if ('ResizeObserver' in window) {
    const resizeObserver = new window.ResizeObserver(scheduleUpdate);
    resizeObserver.observe(body);
    resizeObserver.observe(article);
    if (topbar) resizeObserver.observe(topbar);
  }
  article.querySelectorAll('img').forEach((image) => {
    image.addEventListener('load', scheduleUpdate, { once: true });
    image.addEventListener('error', scheduleUpdate, { once: true });
  });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(scheduleUpdate).catch(() => {});
  window.addEventListener('scroll', scheduleUpdate, { passive: true });
  window.addEventListener('resize', scheduleUpdate, { passive: true });
  window.addEventListener('hashchange', focusHashTarget);
  window.addEventListener('pageshow', scheduleUpdate);
  listenToMedia(reducedMotion, syncMotion);
  listenToMedia(compactViewport, syncTocLayout);
  syncMotion();
  syncTocLayout();
  scheduleUpdate();
})();
