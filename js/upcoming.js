/**
 * CineBook - "Em breve": calendário de estreias nos cinemas do Brasil
 * ---------------------------------------------------------------------------
 * Fonte: TMDB (/discover/movie com região BR e lançamento em cinema) e, para
 * cada filme, a data de estreia BRASILEIRA (/movie/{id}/release_dates) — a
 * data "principal" da TMDB costuma ser a dos EUA. Quando o filme ainda não
 * tem data no Brasil, aparece a data mundial, com aviso.
 *
 * Os destaques cadastrados no site (data.js > LOCAL_RELEASE_DATES) entram
 * junto, e a página continua funcionando com eles se a TMDB não responder.
 *
 * Cada estreia pode ir para a agenda: Google Agenda (link) ou arquivo .ics
 * (Outlook, Apple Calendar e outros).
 * ---------------------------------------------------------------------------
 */
(function () {
  'use strict';

  const PERIODS = [30, 90, 180, 365];
  const PAGES_TO_LOAD = 3;          // 20 filmes por página na TMDB
  const MAX_DATE_LOOKUPS = 45;      // filmes que ganham a data brasileira exata
  const CACHE_PREFIX = 'cinebook_br_release_';
  const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

  const state = { days: 90, sort: 'date', items: [], loading: false, error: false };

  const tr = (key, fallback) => (typeof t === 'function' && t(key) && t(key) !== key) ? t(key) : fallback;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function locale() {
    const lang = localStorage.getItem('cinebook_lang') || 'pt';
    return (typeof TMDB_CONFIG !== 'undefined' && TMDB_CONFIG.LANG_MAP[lang]) || 'pt-BR';
  }

  function todayISO() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return toISO(d);
  }

  function toISO(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function addDays(iso, n) {
    const d = new Date(`${iso}T00:00:00`);
    d.setDate(d.getDate() + n);
    return toISO(d);
  }

  function daysUntil(iso) {
    const a = new Date(`${todayISO()}T00:00:00`);
    const b = new Date(`${iso}T00:00:00`);
    return Math.round((b - a) / 86400000);
  }

  // -------------------------------------------------------------------------
  // Dados
  // -------------------------------------------------------------------------

  /** Data de estreia no Brasil (cinema), com cache de 1 dia. */
  async function brReleaseDate(tmdbId) {
    const key = CACHE_PREFIX + tmdbId;
    try {
      const cached = JSON.parse(localStorage.getItem(key));
      if (cached && Date.now() - cached.ts < CACHE_TTL_MS) return cached.date;
    } catch (_) {}
    const data = await TMDB.fetchTMDB(`/movie/${tmdbId}/release_dates`);
    if (!data || !Array.isArray(data.results)) return undefined; // falhou: não grava
    const br = data.results.find(r => r.iso_3166_1 === 'BR');
    let date = null;
    if (br && Array.isArray(br.release_dates)) {
      const theatrical = br.release_dates.filter(r => r.type === 3 || r.type === 2)
        .map(r => String(r.release_date || '').slice(0, 10))
        .filter(Boolean)
        .sort();
      date = theatrical[0] || null;
    }
    try { localStorage.setItem(key, JSON.stringify({ ts: Date.now(), date })); } catch (_) {}
    return date;
  }

  async function mapLimit(list, limit, fn) {
    let i = 0;
    const worker = async () => {
      while (i < list.length) {
        const idx = i++;
        try { await fn(list[idx], idx); } catch (_) {}
      }
    };
    await Promise.all(Array.from({ length: Math.min(limit, list.length) }, worker));
  }

  function formatTmdbMovie(raw) {
    const base = TMDB.formatItem(raw, 'movie');
    return {
      id: base.id,
      tmdbId: raw.id,
      title: base.title,
      originalTitle: base.originalTitle,
      poster: raw.poster_path ? `${TMDB_CONFIG.IMAGE_BASE_URL}${raw.poster_path}` : '',
      genres: base.genres,
      synopsis: raw.overview || '',
      popularity: raw.popularity || 0,
      date: raw.release_date || null,
      dateIsBR: false
    };
  }

  function localUpcoming(fromISO, toISOStr) {
    if (typeof MEDIA_DATABASE === 'undefined') return [];
    return MEDIA_DATABASE
      .filter(m => m.type === 'movie' && m.releaseDate && m.releaseDate >= fromISO && m.releaseDate <= toISOStr)
      .map(m => ({
        id: m.id,
        tmdbId: m.tmdbId,
        title: typeof getMediaTitle === 'function' ? getMediaTitle(m) : m.title,
        originalTitle: m.originalTitle,
        poster: m.poster,
        genres: m.genres || [],
        synopsis: m.synopsis || '',
        popularity: 1000, // destaque da casa
        date: m.releaseDate,
        dateIsBR: true
      }));
  }

  async function load() {
    const from = todayISO();
    const to = addDays(from, state.days);
    state.loading = true;
    state.error = false;
    render();

    let tmdbItems = [];
    if (typeof TMDB !== 'undefined') {
      const pages = await Promise.all(Array.from({ length: PAGES_TO_LOAD }, (_, p) =>
        TMDB.fetchTMDB('/discover/movie', {
          region: 'BR',
          with_release_type: '2|3',
          'release_date.gte': from,
          'release_date.lte': to,
          sort_by: 'popularity.desc',
          include_adult: 'false',
          page: p + 1
        })
      ));
      if (pages.every(p => !p)) state.error = true;
      const seen = new Set();
      pages.forEach(p => (p && p.results || []).forEach(r => {
        if (!seen.has(r.id) && r.poster_path) {
          seen.add(r.id);
          tmdbItems.push(formatTmdbMovie(r));
        }
      }));

      // Data brasileira exata para os mais populares.
      await mapLimit(tmdbItems.slice(0, MAX_DATE_LOOKUPS), 6, async (item) => {
        const br = await brReleaseDate(item.tmdbId);
        if (br) {
          item.date = br;
          item.dateIsBR = true;
        }
      });
    }

    // Junta com os destaques da casa (sem repetir o mesmo filme).
    const locals = localUpcoming(from, to);
    const byTmdb = new Map(tmdbItems.map(i => [String(i.tmdbId), i]));
    locals.forEach(l => {
      const dup = l.tmdbId && byTmdb.get(String(l.tmdbId));
      if (dup) {
        dup.id = l.id; // abre a página do destaque local
      } else {
        tmdbItems.push(l);
      }
    });

    state.items = tmdbItems.filter(i => i.date && i.date >= from && i.date <= to);
    state.loading = false;
    render();
  }

  // -------------------------------------------------------------------------
  // Agenda
  // -------------------------------------------------------------------------

  function compact(iso) { return iso.replace(/-/g, ''); }

  function eventText(item) {
    const detailsUrl = new URL(`detalhes.html?id=${encodeURIComponent(item.id)}`, location.href).href;
    const title = `${tr('upcoming_event_prefix', 'Estreia')}: ${item.title}`;
    const desc = `${item.synopsis ? item.synopsis.slice(0, 400) + '\n\n' : ''}${tr('upcoming_event_more', 'Detalhes no CineBook')}: ${detailsUrl}`;
    return { title, desc, detailsUrl };
  }

  function googleCalendarUrl(item) {
    const { title, desc } = eventText(item);
    const params = new URLSearchParams({
      action: 'TEMPLATE',
      text: title,
      dates: `${compact(item.date)}/${compact(addDays(item.date, 1))}`,
      details: desc,
      location: tr('upcoming_event_location', 'Cinemas')
    });
    return `https://calendar.google.com/calendar/render?${params.toString()}`;
  }

  function icsEscape(s) {
    return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  }

  /** Quebra linhas longas do .ics (limite de 75 caracteres da especificação). */
  function icsFold(line) {
    const out = [];
    let rest = line;
    while (rest.length > 74) {
      out.push(rest.slice(0, 74));
      rest = ' ' + rest.slice(74);
    }
    out.push(rest);
    return out.join('\r\n');
  }

  function buildIcs(item) {
    const { title, desc, detailsUrl } = eventText(item);
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    return [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//CineBook//Estreias//PT',
      'CALSCALE:GREGORIAN',
      'BEGIN:VEVENT',
      `UID:cinebook-${item.id}-${compact(item.date)}@cinebook`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${compact(item.date)}`,
      `DTEND;VALUE=DATE:${compact(addDays(item.date, 1))}`,
      icsFold(`SUMMARY:${icsEscape(title)}`),
      icsFold(`DESCRIPTION:${icsEscape(desc)}`),
      icsFold(`URL:${detailsUrl}`),
      'TRANSP:TRANSPARENT',
      'END:VEVENT',
      'END:VCALENDAR',
      ''
    ].join('\r\n');
  }

  function downloadIcs(item) {
    const blob = new Blob([buildIcs(item)], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `estreia-${String(item.title).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'filme'}.ics`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  // -------------------------------------------------------------------------
  // Tela
  // -------------------------------------------------------------------------

  function countdown(iso) {
    const n = daysUntil(iso);
    if (n <= 0) return tr('upcoming_today', 'Estreia hoje');
    if (n === 1) return tr('upcoming_tomorrow', 'Amanhã');
    return tr('upcoming_in_days', 'Em {n} dias').replace('{n}', n);
  }

  function render() {
    const list = document.getElementById('upcomingList');
    const count = document.getElementById('upcomingCount');
    if (!list) return;

    document.querySelectorAll('[data-period]').forEach(btn => {
      const active = Number(btn.getAttribute('data-period')) === state.days;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    document.querySelectorAll('[data-sort]').forEach(btn => {
      const active = btn.getAttribute('data-sort') === state.sort;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });

    if (state.loading) {
      if (count) count.textContent = '';
      list.innerHTML = `<p class="up-empty">${tr('upcoming_loading', 'Buscando as próximas estreias...')}</p>`;
      return;
    }

    const items = [...state.items].sort((a, b) => state.sort === 'popular'
      ? (b.popularity - a.popularity) || a.date.localeCompare(b.date)
      : a.date.localeCompare(b.date) || (b.popularity - a.popularity));

    if (count) {
      count.textContent = tr('upcoming_count', '{n} estreias').replace('{n}', items.length);
    }

    const notice = state.error
      ? `<p class="up-notice">${tr('upcoming_offline', 'Não foi possível consultar a TMDB agora. Mostrando só os destaques do CineBook.')}</p>`
      : '';

    if (!items.length) {
      list.innerHTML = notice + `<p class="up-empty">${tr('upcoming_empty', 'Nenhuma estreia encontrada neste período.')}</p>`;
      return;
    }

    const loc = locale();
    const monthFmt = new Intl.DateTimeFormat(loc, { month: 'long', year: 'numeric' });
    const dayFmt = new Intl.DateTimeFormat(loc, { weekday: 'short' });
    const fullFmt = new Intl.DateTimeFormat(loc, { day: '2-digit', month: '2-digit', year: 'numeric' });

    const renderRow = (item) => {
      const d = new Date(`${item.date}T00:00:00`);
      const genres = (item.genres || []).filter(g => g && g !== 'Cinema' && g !== 'Destaque').slice(0, 3).join(' • ');
      return `
        <article class="up-row">
          <div class="up-date" aria-hidden="true">
            <span class="up-day">${d.getDate()}</span>
            <span class="up-weekday">${esc(dayFmt.format(d).replace('.', ''))}</span>
          </div>
          <a class="up-poster" href="detalhes.html?id=${encodeURIComponent(item.id)}" tabindex="-1">
            ${item.poster ? `<img src="${esc(item.poster)}" alt="" loading="lazy" onerror="this.remove()">` : ''}
          </a>
          <div class="up-info">
            <h3><a href="detalhes.html?id=${encodeURIComponent(item.id)}">${esc(item.title)}</a></h3>
            ${item.originalTitle && item.originalTitle !== item.title ? `<p class="up-original">${esc(item.originalTitle)}</p>` : ''}
            <p class="up-meta">
              <span class="up-when">📅 ${esc(fullFmt.format(d))}</span>
              <span class="up-countdown">${esc(countdown(item.date))}</span>
              ${item.dateIsBR ? '' : `<span class="up-flag" title="${esc(tr('upcoming_world_date_hint', 'Ainda sem data confirmada no Brasil'))}">${esc(tr('upcoming_world_date', 'data mundial'))}</span>`}
            </p>
            ${genres ? `<p class="up-genres">${esc(genres)}</p>` : ''}
          </div>
          <div class="up-actions">
            <a class="up-btn up-btn-primary" href="${esc(googleCalendarUrl(item))}" target="_blank" rel="noopener noreferrer">${esc(tr('upcoming_add_google', 'Google Agenda'))}</a>
            <button type="button" class="up-btn" data-ics="${esc(item.id)}">${esc(tr('upcoming_add_ics', 'Outlook / Apple (.ics)'))}</button>
          </div>
        </article>`;
    };

    let html = notice;
    if (state.sort === 'popular') {
      html += `<div class="up-group">${items.map(renderRow).join('')}</div>`;
    } else {
      let current = '';
      items.forEach(item => {
        const month = item.date.slice(0, 7);
        if (month !== current) {
          if (current) html += '</div></section>';
          current = month;
          const label = monthFmt.format(new Date(`${item.date}T00:00:00`));
          html += `<section class="up-month"><h2>${esc(label.charAt(0).toUpperCase() + label.slice(1))}</h2><div class="up-group">`;
        }
        html += renderRow(item);
      });
      if (current) html += '</div></section>';
    }
    list.innerHTML = html;

    list.querySelectorAll('[data-ics]').forEach(btn => {
      btn.addEventListener('click', () => {
        const item = state.items.find(i => i.id === btn.getAttribute('data-ics'));
        if (item) downloadIcs(item);
      });
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-period]').forEach(btn => {
      btn.addEventListener('click', () => {
        const days = Number(btn.getAttribute('data-period'));
        if (PERIODS.includes(days) && days !== state.days) {
          state.days = days;
          load();
        }
      });
    });
    document.querySelectorAll('[data-sort]').forEach(btn => {
      btn.addEventListener('click', () => {
        state.sort = btn.getAttribute('data-sort');
        render();
      });
    });
    // Recarrega só quando o idioma realmente muda (o i18n também dispara o
    // evento uma vez ao abrir a página).
    let lastLang = localStorage.getItem('cinebook_lang') || 'pt';
    window.addEventListener('languageChanged', (e) => {
      const lang = (e.detail && e.detail.lang) || localStorage.getItem('cinebook_lang') || 'pt';
      if (lang === lastLang) return;
      lastLang = lang;
      load();
    });
    load();
  });

  // Exposto para testes
  window.CineUpcoming = { state, buildIcs, googleCalendarUrl, load };
})();
