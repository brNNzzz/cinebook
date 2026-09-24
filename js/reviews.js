/**
 * CineBook - Avaliações reais
 * ---------------------------------------------------------------------------
 * Só aparecem avaliações que alguém de verdade escreveu:
 *
 *  1. As dos usuários do CineBook (salvas neste navegador; quando houver
 *     contas na nuvem, passam a ser públicas).
 *  2. As dos usuários do TMDB para filmes e séries (API /reviews), com nome,
 *     data, nota e link para a avaliação original. A maioria está em inglês;
 *     quando é o caso, a seção avisa.
 *
 * Antes, o site gerava críticas com nomes e textos inventados para qualquer
 * obra ("Gabriel Moura", "Prof. Henrique Vilela"...). Isso foi removido.
 * Livros não têm fonte pública de resenhas, então mostram só as do CineBook.
 * ---------------------------------------------------------------------------
 */
(function (global) {
  'use strict';

  const LEGACY_STORE_KEY = 'cinebook_reviews';        // { mediaId: [..] } (página inicial)
  const PER_ITEM_PREFIX = 'cinebook_reviews_';        // [..] por obra (página de detalhes)
  const TMDB_REVIEWS_PER_PAGE_SHOWN = 6;
  const PREVIEW_CHARS = 520;

  // Avaliações de exemplo que o site antigo gravava sozinho no navegador.
  const SEEDED_FAKES = [
    { user: 'Pedro Aluno', comment: 'Cinematografia espetacular e trilha sonora imersiva de Hans Zimmer! Obra-prima.' },
    { user: 'Maria Silva', comment: 'Melhor adaptação de videogame da história da televisão.' }
  ];
  const DEFAULT_FAKE_COMMENT = 'Excelente obra recomendada pelo catálogo.';

  function esc(txt) {
    return String(txt == null ? '' : txt).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function tr(key, fallback) {
    return (typeof t === 'function' && t(key) && t(key) !== key) ? t(key) : fallback;
  }

  function readJSON(key, fallback) {
    try {
      const v = JSON.parse(localStorage.getItem(key));
      return v == null ? fallback : v;
    } catch (_) {
      return fallback;
    }
  }

  function isSeededFake(r) {
    const name = r.user || r.userName;
    return SEEDED_FAKES.some(f => f.user === name && f.comment === r.comment);
  }

  /** Converte os dois formatos antigos para um só. */
  function normalizeLocal(r) {
    const comment = r.comment === DEFAULT_FAKE_COMMENT ? '' : (r.comment || '');
    return {
      source: 'cinebook',
      author: r.user || r.userName || r.user_name || tr('review_anonymous', 'Usuário do CineBook'),
      avatar: r.avatar || r.userAvatar || '',
      rating5: typeof r.rating === 'number' ? (r.rating > 5 ? Math.round(r.rating / 2) : r.rating) : null,
      date: r.date || '',
      content: comment,
      url: ''
    };
  }

  /** Avaliações feitas pelos usuários do CineBook neste navegador. */
  function getUserReviews(mediaId) {
    const fromDetails = readJSON(PER_ITEM_PREFIX + mediaId, []);
    const legacy = readJSON(LEGACY_STORE_KEY, {});
    const fromHome = Array.isArray(legacy[mediaId]) ? legacy[mediaId] : [];
    return [...fromDetails, ...fromHome]
      .filter(r => r && !isSeededFake(r))
      .map(normalizeLocal);
  }

  /** Salva uma avaliação do usuário (formato único, por obra). */
  function addUserReview(mediaId, { user, avatar, rating, comment }) {
    const key = PER_ITEM_PREFIX + mediaId;
    const list = readJSON(key, []);
    list.unshift({
      mediaId,
      user: user || tr('review_anonymous', 'Usuário do CineBook'),
      avatar: avatar || '',
      rating,
      comment: String(comment || '').trim().slice(0, 2000),
      date: new Date().toLocaleDateString('pt-BR')
    });
    localStorage.setItem(key, JSON.stringify(list));
  }

  // -------------------------------------------------------------------------
  // TMDB
  // -------------------------------------------------------------------------

  function tmdbAvatar(path) {
    if (!path) return '';
    if (/^\/https?:/i.test(path)) return path.slice(1);
    return `https://image.tmdb.org/t/p/w45${path}`;
  }

  function normalizeTmdb(r) {
    const d = r.author_details || {};
    const created = r.created_at ? new Date(r.created_at) : null;
    return {
      source: 'tmdb',
      author: d.name || d.username || r.author || 'Usuário do TMDB',
      avatar: tmdbAvatar(d.avatar_path),
      rating5: typeof d.rating === 'number' ? Math.max(1, Math.round(d.rating / 2)) : null,
      date: created && !isNaN(created) ? created.toLocaleDateString('pt-BR') : '',
      content: String(r.content || '').replace(/\r\n/g, '\n').trim(),
      url: r.url || ''
    };
  }

  /**
   * Avaliações reais do TMDB. Tenta no idioma do site; se não houver
   * nenhuma, busca as em inglês (a maior parte das avaliações do TMDB).
   * Devolve { reviews, total, language } ou null se a TMDB não respondeu.
   */
  async function fetchTmdbReviews(item) {
    if (!item || !item.tmdbId || item.type === 'book' || typeof TMDB === 'undefined') {
      return { reviews: [], total: 0, language: null };
    }
    const kind = item.type === 'series' ? 'tv' : 'movie';
    const cacheKey = `cinebook_tmdb_reviews_${kind}_${item.tmdbId}`;
    try {
      const cached = JSON.parse(sessionStorage.getItem(cacheKey));
      if (cached) return cached;
    } catch (_) {}

    const siteLang = TMDB.getLanguage();
    let data = await TMDB.fetchTMDB(`/${kind}/${item.tmdbId}/reviews`, { page: 1, language: siteLang });
    if (!data) return null;
    let language = siteLang;
    if ((!data.results || data.results.length === 0) && !/^en/i.test(siteLang)) {
      const en = await TMDB.fetchTMDB(`/${kind}/${item.tmdbId}/reviews`, { page: 1, language: 'en-US' });
      if (en && en.results && en.results.length) {
        data = en;
        language = 'en-US';
      }
    }
    const result = {
      reviews: (data.results || []).map(normalizeTmdb),
      total: data.total_results || (data.results || []).length,
      language
    };
    try { sessionStorage.setItem(cacheKey, JSON.stringify(result)); } catch (_) {}
    return result;
  }

  // -------------------------------------------------------------------------
  // Desenho
  // -------------------------------------------------------------------------

  function initials(name) {
    const parts = String(name || '?').trim().split(/\s+/).filter(Boolean);
    return ((parts[0] || '?')[0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
  }

  function contentHtml(text) {
    return esc(text).replace(/\n{2,}/g, '</p><p>').replace(/\n/g, '<br>');
  }

  function cardHtml(r, compact) {
    const stars = r.rating5 ? `<span class="rv-stars" aria-label="${r.rating5} de 5">${'★'.repeat(r.rating5)}${'☆'.repeat(5 - r.rating5)}</span>` : '';
    const avatar = r.avatar && /^https?:|^data:/.test(r.avatar)
      ? `<img class="rv-avatar" src="${esc(r.avatar)}" alt="" loading="lazy" onerror="this.outerHTML='<span class=&quot;rv-avatar&quot;>${esc(initials(r.author))}</span>'">`
      : `<span class="rv-avatar">${esc(r.avatar && r.avatar.length <= 2 && !/[\u{1F300}-\u{1FAFF}]/u.test(r.avatar) ? r.avatar : initials(r.author))}</span>`;
    const badge = r.source === 'tmdb'
      ? `<span class="rv-badge">${tr('review_badge_tmdb', 'Usuário do TMDB')}</span>`
      : `<span class="rv-badge rv-badge-cb">${tr('review_badge_cinebook', 'CineBook')}</span>`;

    const long = r.content.length > PREVIEW_CHARS;
    const preview = long ? r.content.slice(0, PREVIEW_CHARS).replace(/\s+\S*$/, '') + '…' : r.content;
    const body = r.content
      ? `<div class="rv-body${compact ? ' rv-compact' : ''}"><p>${contentHtml(preview)}</p>${long ? `<div class="rv-full" hidden><p>${contentHtml(r.content)}</p></div>` : ''}</div>`
      : '';
    const actions = [
      long ? `<button type="button" class="rv-more">${tr('review_read_more', 'Ler tudo')}</button>` : '',
      r.url ? `<a class="rv-link" href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">${tr('review_see_on_tmdb', 'Ver no TMDB')} ↗</a>` : ''
    ].filter(Boolean).join('');

    return `
      <article class="rv-card">
        <header class="rv-head">
          ${avatar}
          <div class="rv-who">
            <strong>${esc(r.author)}</strong>
            <small>${badge}${r.date ? ` • ${esc(r.date)}` : ''}</small>
          </div>
          ${stars}
        </header>
        ${body}
        ${actions ? `<footer class="rv-actions">${actions}</footer>` : ''}
      </article>`;
  }

  function bindCardActions(container) {
    container.querySelectorAll('.rv-more').forEach(btn => {
      btn.addEventListener('click', () => {
        const card = btn.closest('.rv-card');
        const full = card.querySelector('.rv-full');
        const first = card.querySelector('.rv-body > p');
        if (!full) return;
        const opening = full.hidden;
        full.hidden = !opening;
        if (first) first.hidden = opening;
        btn.textContent = opening ? tr('review_read_less', 'Mostrar menos') : tr('review_read_more', 'Ler tudo');
      });
    });
  }

  /**
   * Preenche um container com as avaliações da obra: primeiro as do CineBook
   * (na hora), depois as do TMDB (quando chegarem).
   */
  async function render(container, item, { compact = false } = {}) {
    if (!container || !item) return;
    const token = (container._rvToken = (container._rvToken || 0) + 1);
    const own = getUserReviews(item.id);

    const draw = (tmdb, loading) => {
      if (token !== container._rvToken) return;
      const parts = [];
      if (own.length) {
        parts.push(`<h4 class="rv-group-title">${tr('review_group_cinebook', 'Avaliações no CineBook')} <span>${own.length}</span></h4>`);
        parts.push(own.map(r => cardHtml(r, compact)).join(''));
      }
      if (tmdb && tmdb.reviews.length) {
        const shown = tmdb.reviews.slice(0, TMDB_REVIEWS_PER_PAGE_SHOWN);
        const note = tmdb.language === 'en-US' && !/^en/i.test(TMDB.getLanguage())
          ? `<p class="rv-note">${tr('review_note_english', 'Ainda não há avaliações neste idioma — estas estão em inglês.')}</p>`
          : '';
        parts.push(`<h4 class="rv-group-title">${tr('review_group_tmdb', 'Avaliações de usuários do TMDB')} <span>${tmdb.total}</span></h4>${note}`);
        parts.push(shown.map(r => cardHtml(r, compact)).join(''));
      }
      if (!parts.length) {
        parts.push(loading
          ? `<p class="rv-empty">${tr('review_loading', 'Carregando avaliações...')}</p>`
          : `<p class="rv-empty">${tr('review_empty', 'Ninguém avaliou esta obra ainda. Seja a primeira pessoa!')}</p>`);
      }
      container.innerHTML = parts.join('');
      bindCardActions(container);
    };

    const wantsTmdb = item.type !== 'book' && item.tmdbId;
    draw(null, wantsTmdb);
    if (!wantsTmdb) return;
    let tmdb = null;
    try { tmdb = await fetchTmdbReviews(item); } catch (_) {}
    draw(tmdb, false);
  }

  global.CineReviews = { getUserReviews, addUserReview, fetchTmdbReviews, render, esc };
})(typeof window !== 'undefined' ? window : globalThis);
