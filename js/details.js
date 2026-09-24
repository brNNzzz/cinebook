/**
 * CINEBOOK - Controller da Tela Dedicada de Detalhes (detalhes.html)
 * Suporte completo a 11 idiomas, TMDb API, Avaliações SQLite e Watchlist.
 */const GENRES_CONFIG = [
  { key: 'all', pt: 'Todos os Gêneros', en: 'All Genres', es: 'Todos los Géneros', fr: 'Tous les genres', zh: '所有类型', hi: 'सभी शैलियाँ', ar: 'جميع الأنواع', bn: 'সব ধরণ', ru: 'Все жанры', ur: 'تمام انواع', id: 'Semua Genre' },
  { key: 'action', match: ['Ação', 'Ação & Aventura', 'Action', '动作', 'Acción', 'Боевик', 'Aksi'], pt: 'Ação', en: 'Action', es: 'Acción', fr: 'Action', zh: '动作', hi: 'एक्शन', ar: 'حركة', bn: 'অ্যাকশন', ru: 'Боевик', ur: 'ایکشن', id: 'Aksi' },
  { key: 'adventure', match: ['Aventura', 'Adventure', 'Aventure', '冒险', 'Приключения', 'Petualangan', 'Exploração'], pt: 'Aventura', en: 'Adventure', es: 'Aventura', fr: 'Aventure', zh: '冒险', hi: 'साहसिक', ar: 'مغامرة', bn: 'রোমাঞ্চ', ru: 'Приключения', ur: 'ایڈونچر', id: 'Petualangan' },
  { key: 'comedy', match: ['Comédia', 'Comedy', 'Comedia', 'Comédie', '喜剧', 'Комедия', 'Komedi'], pt: 'Comédia', en: 'Comedy', es: 'Comedia', fr: 'Comédie', zh: '喜剧', hi: 'हास्य', ar: 'كوميديا', bn: 'কৌতুক', ru: 'Комедия', ur: 'مزاحیہ', id: 'Komedi' },
  { key: 'drama', match: ['Drama', '剧情', 'Драма', 'Drame'], pt: 'Drama', en: 'Drama', es: 'Drama', fr: 'Drame', zh: '剧情', hi: 'नाटक', ar: 'دراما', bn: 'নাটক', ru: 'Драма', ur: 'ڈراما', id: 'Drama' },
  { key: 'scifi', match: ['Ficção Científica', 'Sci-Fi & Fantasia', 'Sci-Fi', 'Science Fiction', '科幻', 'Научная фантастика', 'Fiksi Ilmiah', 'Ciencia Ficción', 'Distopia', 'Dystopia', 'Cyberpunk', 'Hard Sci-Fi', 'Espaço'], pt: 'Ficção Científica', en: 'Sci-Fi', es: 'Ciencia Ficción', fr: 'Science-Fiction', zh: '科幻', hi: 'विज्ञान कथा', ar: 'خيال علمي', bn: 'বিজ্ঞান কল্পকাহিনী', ru: 'Научная фантастика', ur: 'سائنس فکشن', id: 'Fiksi Ilmiah' },
  { key: 'fantasy', match: ['Fantasia', 'Fantasy', 'Alta Fantasia', '奇幻', 'Fantasía', 'Fantastique', 'Фэнтези', 'Fantasi'], pt: 'Fantasia', en: 'Fantasy', es: 'Fantasía', fr: 'Fantastique', zh: '奇幻', hi: 'काल्पनिक', ar: 'خيالي', bn: 'কল্পনা', ru: 'Фэнтези', ur: 'تصوراتی', id: 'Fantasi' },
  { key: 'horror', match: ['Terror', 'Horror', '恐怖', 'Horreur', 'Ужасы', 'Horor'], pt: 'Terror', en: 'Horror', es: 'Terror', fr: 'Horreur', zh: '恐怖', hi: 'हॉरर', ar: 'رعب', bn: 'হরর', ru: 'Ужасы', ur: 'خوفناک', id: 'Horor' },
  { key: 'suspense', match: ['Suspense', 'Thriller', 'Триллер', '惊悚', 'Sobrevivência'], pt: 'Suspense', en: 'Thriller', es: 'Suspense', fr: 'Thriller', zh: '惊悚', hi: 'थ्रिलर', ar: 'إثارة وتشويق', bn: 'থ্রিলার', ru: 'Триллер', ur: 'سسپنس', id: 'Ketegangan' },
  { key: 'romance', match: ['Romance', '爱情', 'Романтика', 'Romantis'], pt: 'Romance', en: 'Romance', es: 'Romance', fr: 'Romance', zh: '爱情', hi: 'रोमांस', ar: 'رومانسي', bn: 'রোমান্স', ru: 'Мелодрама', ur: 'رومانس', id: 'Romantis' },
  { key: 'animation', match: ['Animação', 'Animation', 'Animación', '动画', 'Мультфильм', 'Animasi'], pt: 'Animação', en: 'Animation', es: 'Animación', fr: 'Animation', zh: '动画', hi: 'एनिमेशन', ar: 'رسوم متحركة', bn: 'অ্যানিমেশন', ru: 'Мультфильм', ur: 'اینیمیشن', id: 'Animasi' },
  { key: 'crime', match: ['Crime', 'Crimen', '犯罪', 'Криминал', 'Kriminal', 'Gangues', 'Policial'], pt: 'Crime', en: 'Crime', es: 'Crimen', fr: 'Crime', zh: '犯罪', hi: 'अपराध', ar: 'جريمة', bn: 'অপরাধ', ru: 'Криминал', ur: 'جرم', id: 'Kriminal' },
  { key: 'mystery', match: ['Mistério', 'Mystery', 'Misterio', 'Mystère', '悬疑', 'Детектив', 'Misteri'], pt: 'Mistério', en: 'Mystery', es: 'Misterio', fr: 'Mystère', zh: '悬疑', hi: 'रहस्य', ar: 'غموض', bn: 'রহস্য', ru: 'Детектив', ur: 'معمہ', id: 'Misteri' },
  { key: 'documentary', match: ['Documentário', 'Documentary', 'Documental', '纪录片', 'Документальный', 'Dokumenter', 'História', 'Cinema TV'], pt: 'Documentário', en: 'Documentary', es: 'Documental', fr: 'Documentaire', zh: '纪录片', hi: 'वृत्तचित्र', ar: 'وثائقي', bn: 'প্রামাণ্যচিত্র', ru: 'Документальный', ur: 'دستاویزی', id: 'Dokumenter' }
];

const DetailsState = {
  currentMedia: null,
  watchlist: JSON.parse(localStorage.getItem('cinebook_watchlist')) || {},
  selectedStars: 0,
  currentUser: (() => {
    try {
      return JSON.parse(localStorage.getItem('cinebook_user')) || null;
    } catch (e) {
      return null;
    }
  })()
};

document.addEventListener('DOMContentLoaded', async () => {
  initAuthUI();
  initStarRating();
  initActions();

  // Pega o ID da URL
  const params = new URLSearchParams(window.location.search);
  const mediaId = params.get('id') || 'm1';

  await loadMediaDetails(mediaId);

  // Reage à mudança de idioma
  window.addEventListener('languageChanged', async (e) => {
    const lang = e.detail?.lang || localStorage.getItem('cinebook_lang') || 'pt';
    await reloadMediaInLanguage(lang);
  });
});

/**
 * Carrega a obra completa do TMDb ou Banco Local
 */
async function loadMediaDetails(mediaId) {
  let item = null;

  const idStr = String(mediaId || '').trim();
  const cleanNumericId = idStr.replace(/^tmdb_(?:movie_|tv_|series_)?/i, '').replace(/^[msb]_2026_|^[msb]_/i, '').replace(/^tmdb_/i, '');

  // 1. Procura na base local por ID exato ou por tmdbId correspondente
  if (typeof MEDIA_DATABASE !== 'undefined') {
    item = MEDIA_DATABASE.find(m => m.id === idStr);
    if (!item && cleanNumericId) {
      item = MEDIA_DATABASE.find(m => String(m.tmdbId) === cleanNumericId);
    }
  }

  // 1.1 Livro do Google Books (id "gb_...") ou destaque local de livro
  if (!item && /^(gb|ol)_/i.test(idStr) && typeof GoogleBooks !== 'undefined') {
    item = await GoogleBooks.getVolume(idStr);
    if (!item) {
      document.getElementById('detailsMainTitle').textContent = 'Livro não encontrado';
      return;
    }
  } else if (item && item.type === 'book' && typeof GoogleBooks !== 'undefined') {
    await GoogleBooks.enrichLocalBook(item);
  }

  // 2. Se for TMDb ou não estiver na base local
  if (!item && typeof TMDB !== 'undefined') {
    const isTv = idStr.toLowerCase().includes('tv') || idStr.toLowerCase().includes('series') || idStr.startsWith('s_');
    item = await TMDB.getDetails(idStr, isTv ? 'series' : 'movie');
  } else if (item && item.tmdbId && typeof TMDB !== 'undefined') {
    // Enriquece item local com dados completos do TMDb. A TMDB é a fonte de
    // verdade pra elenco, trailer e onde assistir — nunca cai de volta pro
    // dado cadastrado à mão localmente só porque a TMDB não confirmou nada,
    // senão um trailer/streaming de exemplo (fictício) sobrevive escondido.
    // Se a TMDB falhar (rede, bloqueio, limite de requisições), o item local
    // já vem com o status de lançamento calculado pela data cadastrada em
    // data.js — então um filme não lançado continua sem nota/avaliações/
    // onde assistir mesmo sem a TMDB responder.
    const full = await TMDB.getDetails(item.tmdbId, item.type);
    if (full) {
      item = {
        ...item,
        cast: (full.cast && full.cast.length > 0) ? full.cast : item.cast,
        trailerUrl: full.trailerUrl || '',
        whereToWatch: full.whereToWatch || [],
        backdrop: item.backdrop || full.backdrop,
        poster: item.poster || full.poster,
        rating: full.rating,
        year: full.year || item.year,
        releaseDateFull: full.releaseDateFull || item.releaseDateFull,
        notReleasedYet: full.notReleasedYet,
        inTheaters: full.inTheaters,
        _tmdbDetailed: true
      };
    }
  }

  if (!item) {
    document.getElementById('detailsMainTitle').textContent = 'Obra não encontrada';
    return;
  }

  DetailsState.currentMedia = item;

  // Aplica localização se necessário
  const currentL = localStorage.getItem('cinebook_lang') || 'pt';
  await reloadMediaInLanguage(currentL);
}

/**
 * Atualiza todas as seções da página com o idioma ativo
 */
async function reloadMediaInLanguage(lang) {
  const item = DetailsState.currentMedia;
  if (!item) return;

  // 1. Traduz item do TMDb ou Livro Local
  if (typeof TMDB !== 'undefined') {
    await TMDB.enrichLocalizedPosters([item], lang);
  }

  renderDetailsUI(item, lang);
  renderReviews(item.id);
  loadRecommendations(item);
}

/**
 * Retorna logo HD oficial da plataforma de streaming
 */
function getProviderLogo(providerName, fallbackLogo = null) {
  if (fallbackLogo && fallbackLogo.trim() !== '') return fallbackLogo;

  const name = (providerName || '').toLowerCase();
  if (name.includes('netflix')) {
    return 'https://image.tmdb.org/t/p/original/pbpMk2JmcoNnQwx5JGpXngfoWtp.jpg';
  }
  if (name.includes('max') || name.includes('hbo')) {
    return 'https://image.tmdb.org/t/p/original/6uhKBfmtzFqOcLoul1Xm12E7Z06.jpg';
  }
  if (name.includes('prime') || name.includes('amazon')) {
    return 'https://image.tmdb.org/t/p/original/emthp39XA2vAHQI9YjWhBqzPQzV.jpg';
  }
  if (name.includes('disney')) {
    return 'https://image.tmdb.org/t/p/original/7rwgEs55tOXyYStJ12saA88OxQq.jpg';
  }
  if (name.includes('apple')) {
    return 'https://image.tmdb.org/t/p/original/2E03q9ObNzVv7s0zCqIeQ4TjK0E.jpg';
  }
  if (name.includes('claro') || name.includes('now')) {
    return 'https://image.tmdb.org/t/p/original/x881v10oT1N4rSvdz22qGqLzGv7.jpg';
  }
  if (name.includes('globo') || name.includes('telecine')) {
    return 'https://image.tmdb.org/t/p/original/2K3n2tqN24QxVz9uR7c.jpg';
  }
  if (name.includes('paramount')) {
    return 'https://image.tmdb.org/t/p/original/fi83B1oztoS47xxcemFdPMhIzK.jpg';
  }
  if (name.includes('star+')) {
    return 'https://image.tmdb.org/t/p/original/7rwgEs55tOXyYStJ12saA88OxQq.jpg';
  }
  if (name.includes('youtube') || name.includes('google')) {
    return 'https://image.tmdb.org/t/p/original/peURlLlr8jggOwK53fJ5wdQl05y.jpg';
  }
  return 'https://image.tmdb.org/t/p/original/6uhKBfmtzFqOcLoul1Xm12E7Z06.jpg';
}

/**
 * Constrói link direto e preciso para assistir a obra no streaming selecionado
 */
function getProviderDirectLink(providerName, itemTitle, fallbackLink = null, itemType = 'movie') {
  const name = (providerName || '').toLowerCase();
  const cleanTitle = (itemTitle || '').replace(/[^\w\s\u00C0-\u017F]/gi, ' ').trim();
  const titleEnc = encodeURIComponent(cleanTitle);

  if (itemType === 'book') {
    return `https://www.amazon.com.br/s?k=${titleEnc}+livro`;
  }

  if (name.includes('netflix')) {
    return `https://www.netflix.com/search?q=${titleEnc}`;
  }
  if (name.includes('max') || name.includes('hbo')) {
    return `https://play.max.com/search?q=${titleEnc}`;
  }
  if (name.includes('prime') || name.includes('amazon')) {
    return `https://www.primevideo.com/search/ref=atv_nb_sr?phrase=${titleEnc}`;
  }
  if (name.includes('disney')) {
    return `https://www.disneyplus.com/search?q=${titleEnc}`;
  }
  if (name.includes('apple')) {
    return `https://tv.apple.com/search?term=${titleEnc}`;
  }
  if (name.includes('claro') || name.includes('now')) {
    return `https://www.clarotvmais.com.br/busca?q=${titleEnc}`;
  }
  if (name.includes('globo') || name.includes('telecine')) {
    return `https://globoplay.globo.com/busca/?q=${titleEnc}`;
  }
  if (name.includes('paramount')) {
    return `https://www.paramountplus.com/search/?q=${titleEnc}`;
  }
  if (name.includes('star+')) {
    return `https://www.starplus.com/search?q=${titleEnc}`;
  }
  if (name.includes('youtube') || name.includes('google')) {
    return `https://www.youtube.com/results?search_query=${titleEnc}+filme+completo+dublado`;
  }
  if (fallbackLink) {
    return fallbackLink;
  }
  return `https://www.google.com/search?q=${encodeURIComponent('Assistir ' + cleanTitle + ' ' + (providerName || ''))}`;
}

/**
 * Renderiza todo o DOM da página de detalhes
 */
function renderDetailsUI(item, lang) {
  const tr = (key, fallback) => (typeof t === 'function' && t(key) && t(key) !== key) ? t(key) : fallback;
  // Título da Aba do Navegador
  document.title = `${item.title} (${item.year}) • CineBook`;

  const backTextEl = document.getElementById('backCatalogText');
  if (backTextEl) {
    const backTranslations = {
      pt: 'Voltar ao Catálogo',
      en: 'Back to Catalog',
      es: 'Volver al Catálogo',
      fr: 'Retour au Catalogue',
      zh: '返回目录',
      ru: 'Назад в каталог',
      hi: 'कैटलॉग पर वापस जाएं',
      ar: 'العودة إلى الدليل',
      bn: 'ক্যাটালগে ফিরে যান',
      ur: 'کیٹلاگ پر واپس جائیں',
      id: 'Kembali ke Katalog'
    };
    backTextEl.textContent = backTranslations[lang] || 'Voltar ao Catálogo';
  }

  const hero = document.getElementById('detailsHero');
  const posterImg = document.getElementById('detailsPosterImg');
  const typeTag = document.getElementById('detailsTypeTag');
  const mainTitle = document.getElementById('detailsMainTitle');
  const originalTitle = document.getElementById('detailsOriginalTitle');
  const tagline = document.getElementById('detailsTagline');
  const yearEl = document.getElementById('detailsYear');
  const durationEl = document.getElementById('detailsDuration');
  const genresEl = document.getElementById('detailsGenres');
  const scoreCircle = document.getElementById('detailsScoreCircle');
  const scoreText = document.getElementById('detailsScoreText');

  // Backdrop e Pôster
  if (hero) hero.style.backgroundImage = `url('${item.backdrop || item.poster}')`;
  if (posterImg) {
    posterImg.src = item.poster;
    posterImg.alt = item.title;
  }

  // Categoria
  const typeKey = item.type === 'movie' ? 'nav_movies' : (item.type === 'series' ? 'nav_series' : 'nav_books');
  const rawType = typeof t === 'function' ? t(typeKey) : (item.type === 'movie' ? 'Filme' : (item.type === 'series' ? 'Série' : 'Livro'));
  const cleanType = rawType.replace(/^[^\w\s\u00C0-\u017F\u0400-\u04FF\u4E00-\u9FFF\u0900-\u097F\u0600-\u06FF\u0980-\u09FF]+/g, '').trim().toUpperCase();
  if (typeTag) {
    typeTag.className = `details-type-tag ${item.type}`;
    typeTag.textContent = cleanType;

    // Remove badge anterior se existir
    const prevBadge = document.getElementById('detailsMatchBadge');
    if (prevBadge) prevBadge.remove();

    // Verifica match com gostos favoritos do usuário
    try {
      const user = JSON.parse(localStorage.getItem('cinebook_user'));
      if (user && user.preferredCategories && Array.isArray(user.preferredCategories) && user.preferredCategories.length > 0 && item.genres) {
        const isMatched = item.genres.some(g => {
          const found = GENRES_CONFIG.find(c => c.match && c.match.some(m => m.toLowerCase() === g.toLowerCase()));
          return found && user.preferredCategories.includes(found.key);
        });
        if (isMatched) {
          const matchBadge = document.createElement('span');
          matchBadge.id = 'detailsMatchBadge';
          matchBadge.style.cssText = 'display: inline-flex; align-items: center; gap: 0.35rem; font-size: 0.75rem; font-weight: 800; background: linear-gradient(135deg, rgba(168, 85, 247, 0.35) 0%, rgba(56, 189, 248, 0.35) 100%); border: 1px solid rgba(168, 85, 247, 0.5); padding: 0.25rem 0.65rem; border-radius: 9999px; color: #fff; margin-left: 0.5rem; letter-spacing: 0.5px;';
          matchBadge.textContent = typeof t === 'function' ? t('tag_match_taste') : 'Combina com seus gostos';
          typeTag.parentElement.insertBefore(matchBadge, typeTag.nextSibling);
        }
      }
    } catch (e) {}
  }

  const currentDisplayTitle = typeof getMediaTitle === 'function' ? getMediaTitle(item, lang) : (item.title || '');
  if (mainTitle) mainTitle.textContent = currentDisplayTitle;
  if (originalTitle) originalTitle.textContent = item.originalTitle && item.originalTitle !== currentDisplayTitle ? `(${item.originalTitle})` : '';
  if (tagline) tagline.textContent = item.tagline || '';
  if (yearEl) yearEl.textContent = item.year || 2024;

  // Duração / Páginas / Temporadas Localizadas
  let durText = item.duration || '120 min';
  if (item.type === 'book') {
    const pageCount = durText.replace(/\D/g, '');
    if (pageCount) {
      const pagesMap = {
        en: 'pages', pt: 'páginas', es: 'páginas', fr: 'pages',
        zh: '页', hi: 'पृष्ठ', ar: 'صفحة', bn: 'পৃষ্ঠা',
        ru: 'страниц', ur: 'صفحات', id: 'halaman'
      };
      durText = `${pageCount} ${pagesMap[lang] || 'páginas'}`;
    }
  } else if (durText.includes('Temporada') || durText.includes('Temp')) {
    const seasonNum = durText.match(/\d+/)?.[0] || '1';
    const seasonMap = {
      en: seasonNum === '1' ? '1 Season' : `${seasonNum} Seasons`,
      pt: seasonNum === '1' ? '1 Temporada' : `${seasonNum} Temporadas`,
      es: seasonNum === '1' ? '1 Temporada' : `${seasonNum} Temporadas`,
      fr: seasonNum === '1' ? '1 Saison' : `${seasonNum} Saisons`,
      zh: `${seasonNum} 季`,
      ru: seasonNum === '1' ? '1 сезон' : `${seasonNum} сезона`,
      hi: `${seasonNum} सीज़न`,
      ar: `${seasonNum} مواسم`,
      bn: `${seasonNum} সিজন`,
      ur: `${seasonNum} سیزن`,
      id: `${seasonNum} Musim`
    };
    durText = seasonMap[lang] || durText;
  }
  if (durationEl) durationEl.textContent = durText;

  // Gêneros Localizados
  const rawGenres = (item.genres || []).map(g => {
    const found = GENRES_CONFIG.find(c => c.match && c.match.some(m => m.toLowerCase() === g.toLowerCase()));
    return found ? (found[lang] || found.pt || g) : g;
  });
  const translatedGenres = [...new Set(rawGenres)];
  if (genresEl) genresEl.textContent = (translatedGenres.length > 0 ? translatedGenres : ['Cinema']).join(', ');

  // Avaliação do Público — obra não lançada não tem nota de público (ninguém
  // assistiu ainda). No lugar aparece a data de estreia.
  const scoreLabel = document.querySelector('.details-score-label');
  const scoreBadge = scoreCircle ? scoreCircle.closest('.score-badge') : null;
  if (item.notReleasedYet) {
    const dateTxt = typeof formatReleaseDateBR === 'function' ? formatReleaseDateBR(item.releaseDateFull) : '';
    if (scoreBadge) scoreBadge.style.display = 'none';
    if (scoreLabel) {
      scoreLabel.textContent = dateTxt
        ? `📅 ${tr('lbl_premiere', 'Estreia')}: ${dateTxt}`
        : `📅 ${tr('status_coming_soon', 'Em breve')}`;
    }
  } else if (!item.rating) {
    if (scoreBadge) scoreBadge.style.display = 'none';
    if (scoreLabel) scoreLabel.textContent = tr('lbl_no_ratings_yet', 'Sem avaliações ainda');
  } else {
    const ratingScore = item.rating;
    if (scoreBadge) scoreBadge.style.display = '';
    if (scoreCircle) {
      const strokeColor = ratingScore >= 80 ? '#1ed5a9' : (ratingScore >= 60 ? '#f59e0b' : '#ef4444');
      scoreCircle.setAttribute('stroke', strokeColor);
      scoreCircle.setAttribute('stroke-dasharray', `${ratingScore}, 100`);
    }
    if (scoreText) scoreText.innerHTML = `${ratingScore}<sup>%</sup>`;
    if (scoreLabel) scoreLabel.textContent = tr('lbl_user_score', 'Avaliação do Público');
  }

  // Atualiza rótulos dos botões de Watchlist
  const favEl = document.getElementById('lblActionFavorite');
  const watchEl = document.getElementById('lblActionWatching');
  const planEl = document.getElementById('lblActionPlan');
  const doneEl = document.getElementById('lblActionWatched');
  if (favEl) favEl.textContent = typeof t === 'function' ? t('watchlist_btn_favorite') : 'Favorito';
  if (watchEl) watchEl.textContent = typeof t === 'function' ? t('watchlist_btn_watching') : 'Assistindo / Lendo';
  if (planEl) planEl.textContent = typeof t === 'function' ? t('watchlist_btn_plan') : 'Quero Ver / Ler';
  if (doneEl) doneEl.textContent = typeof t === 'function' ? t('watchlist_btn_watched') : 'Já Vi / Já Li';

  // Sinopse
  const synopsisEl = document.getElementById('detailsSynopsisText');
  const synopsisTitle = document.getElementById('titleSynopsis');
  const currentDisplaySynopsis = typeof getMediaSynopsis === 'function' ? getMediaSynopsis(item, lang) : (item.synopsis || '');
  if (synopsisTitle) synopsisTitle.innerHTML = `<span>📖</span> ${typeof t === 'function' ? t('details_synopsis_title') : 'Sinopse Oficial'}`;
  if (synopsisEl) synopsisEl.textContent = currentDisplaySynopsis || (typeof t === 'function' ? t('hero_subtitle') : 'Sem sinopse disponível.');

  // Trailer Oficial ou Trecho de Leitura — sem trailer confirmado pela TMDB,
  // a seção inteira some (nada de placeholder "Trailer não disponível").
  const trailerBlock = document.getElementById('detailsMediaPreviewBlock');
  const trailerTitle = document.getElementById('titleTrailer');
  const trailerContainer = document.getElementById('detailsTrailerContainer');
  if (item.type === 'book') {
    // Livro: mostra o trecho real (quando a API devolve) e o botão de amostra
    // grátis do Google Books. Sem nenhum dos dois, a seção some — nada de
    // citação genérica inventada.
    const escHtml = (txt) => String(txt || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const hasSnippet = !!(item.sampleSnippet && item.sampleSnippet.trim());
    const hasPreview = !!item.previewUrl;
    if (!hasSnippet && !hasPreview) {
      if (trailerBlock) trailerBlock.style.display = 'none';
      if (trailerContainer) trailerContainer.innerHTML = '';
    } else {
      if (trailerBlock) trailerBlock.style.display = '';
      const sampleTitle = hasPreview ? tr('book_free_sample', 'Amostra grátis') : (typeof t === 'function' ? t('modal_sample') : 'Trecho de Leitura');
      if (trailerTitle) trailerTitle.innerHTML = `<span>📑</span> ${sampleTitle}`;
      if (trailerContainer) {
        trailerContainer.innerHTML = `
          ${hasSnippet ? `<div style="background: rgba(255,255,255,0.03); padding: 1.5rem; border-radius: var(--radius-md); border-left: 4px solid var(--color-book); font-style: italic; color: #cbd5e1; line-height: 1.8; font-size: 1.05rem;">“${escHtml(item.sampleSnippet)}”</div>` : ''}
          ${hasPreview ? `<a class="book-preview-btn" href="${escHtml(item.previewUrl)}" target="_blank" rel="noopener noreferrer">📖 ${tr('book_read_sample', 'Ler as primeiras páginas no Google Books')} ↗</a>` : ''}
        `;
      }
    }
  } else if (item.trailerUrl) {
    if (trailerBlock) trailerBlock.style.display = '';
    // Extrai o ID do vídeo do YouTube
    const match = item.trailerUrl.match(/(?:embed\/|v=|vi\/|youtu\.be\/|\/v\/|watch\?v=|\&v=)([^#\&\?]*).*/);
    const videoId = (match && match[1] && match[1].length === 11) ? match[1] : null;
    const directWatchUrl = videoId ? `https://www.youtube.com/watch?v=${videoId}` : item.trailerUrl;
    const backdropUrl = item.backdrop || item.poster || 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?auto=format&fit=crop&w=1200&q=80';
    const trTitleText = typeof t === 'function' ? t('details_trailer_title') : 'Trailer Oficial';
    const watchActionText = typeof t === 'function' ? t('action_watch') : 'Assistir';

    if (trailerTitle) {
      trailerTitle.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: space-between; width: 100%;">
          <span><span>🎬</span> ${trTitleText}</span>
          <a href="${directWatchUrl}" target="_blank" rel="noopener noreferrer" style="font-size: 0.8rem; font-weight: 600; color: #ef4444; text-decoration: none; display: inline-flex; align-items: center; gap: 0.35rem; background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.25); padding: 0.25rem 0.65rem; border-radius: 9999px; transition: all 0.2s;">
            <span>▶</span> YouTube ↗
          </a>
        </div>
      `;
    }

    if (trailerContainer) {
      trailerContainer.innerHTML = `
        <a href="${directWatchUrl}" target="_blank" rel="noopener noreferrer" class="trailer-cinematic-card" style="background-image: url('${backdropUrl}');" title="${trTitleText}">
          <div class="trailer-cinematic-overlay"></div>
          
          <div class="trailer-badge-top">
            <span style="color: #ef4444;">●</span> <span>HD 1080p • ${trTitleText}</span>
          </div>

          <div class="trailer-play-center">
            <span>▶</span>
          </div>

          <div class="trailer-info-bottom">
            <div>
              <div class="trailer-bottom-title">${item.title} — ${trTitleText}</div>
              <div class="trailer-bottom-sub">YouTube HD</div>
            </div>
            <div style="background: rgba(239, 68, 68, 0.9); color: #fff; padding: 0.45rem 1rem; border-radius: 8px; font-weight: 700; font-size: 0.84rem; display: flex; align-items: center; gap: 0.4rem; box-shadow: 0 4px 14px rgba(0,0,0,0.5);">
              ${watchActionText} ↗
            </div>
          </div>
        </a>
      `;
    }
  } else {
    if (trailerBlock) trailerBlock.style.display = 'none';
    if (trailerContainer) trailerContainer.innerHTML = '';
  }

  // Elenco e Equipe
  const castTitle = document.getElementById('titleCast');
  const castGrid = document.getElementById('detailsCastGrid');
  if (castTitle) {
    castTitle.innerHTML = item.type === 'book'
      ? `<span>✍️</span> ${tr('details_authors_title', 'Autoria')}`
      : `<span>👥</span> ${typeof t === 'function' ? t('details_cast_title') : 'Elenco Principal & Produção'}`;
  }
  if (castGrid) {
    castGrid.innerHTML = '';
    const castList = item.cast && item.cast.length > 0 ? item.cast : [
      { name: item.director || 'Direção', role: item.type === 'book' ? 'Autor' : 'Diretor', photo: '' }
    ];

    castList.forEach(person => {
      const card = document.createElement('div');
      card.className = 'cast-card';
      card.setAttribute('tabindex', '0');
      card.setAttribute('role', 'button');
      card.setAttribute('title', `${person.name}`);
      
      const photoSrc = person.photo && person.photo.trim() !== ''
        ? person.photo
        : initialsAvatar(person.name);
      
      card.innerHTML = `
        <div class="cast-photo-wrapper">
          <img src="${photoSrc}" alt="${person.name}" class="cast-photo" onerror="this.onerror=null; this.src=initialsAvatar(this.alt);"/>
        </div>
        <div class="cast-name">${person.name}</div>
        <div class="cast-role">${person.role || 'Elenco'}</div>
        <div class="cast-hint-badge">↗</div>
      `;

      card.addEventListener('click', () => {
        openPersonModal(person);
      });

      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openPersonModal(person);
        }
      });

      castGrid.appendChild(card);
    });
  }

  // Comprar Ingresso — só para filmes realmente em cartaz agora (calculado
  // a partir da data de lançamento real da TMDB, nunca por suposição).
  const buyTicketBtn = document.getElementById('btnBuyTicket');
  if (buyTicketBtn) {
    if (item.type === 'movie' && item.inTheaters) {
      buyTicketBtn.href = `https://www.ingresso.com/busca/resultado?q=${encodeURIComponent(item.title)}`;
      buyTicketBtn.style.display = 'inline-flex';
    } else {
      buyTicketBtn.style.display = 'none';
    }
  }

  // Onde Assistir / Plataformas (Cards Clicáveis Premium com Link Direto)
  // Obra ainda não lançada não tem onde assistir/ler de verdade, então a
  // seção inteira some em vez de mostrar um chute.
  const providersBlock = document.getElementById('detailsProvidersBlock');
  if (providersBlock) providersBlock.style.display = item.notReleasedYet ? 'none' : '';

  const providersTitle = document.getElementById('titleProviders');
  const providersList = document.getElementById('detailsProvidersList');
  if (!item.notReleasedYet && providersTitle) {
    providersTitle.innerHTML = item.type === 'book'
      ? `<span>📖</span> ${typeof t === 'function' ? t('details_where_to_read_title') : 'Onde Encontrar / Ler'}`
      : `<span>📺</span> ${typeof t === 'function' ? t('details_where_to_watch_title') : 'Onde Assistir / Ler'}`;
  }
  if (providersList) {
    providersList.innerHTML = '';
    providersList.className = 'details-providers-container';

    if (item.whereToWatch && item.whereToWatch.length > 0) {
      item.whereToWatch.forEach(prov => {
        const directUrl = item.type === 'book' && prov.link
          ? prov.link
          : getProviderDirectLink(prov.name, item.title, prov.link, item.type);
        const logoUrl = item.type === 'book' ? (prov.logo || null) : getProviderLogo(prov.name, prov.logo);
        const actionLabel = item.type === 'book' 
          ? (typeof t === 'function' ? t('action_buy_read') : 'Comprar / Ler')
          : (prov.type?.includes('Aluguel') || prov.type?.includes('Rent')
              ? (typeof t === 'function' ? t('action_rent') : 'Alugar')
              : (typeof t === 'function' ? t('action_watch') : 'Assistir'));

        const card = document.createElement('a');
        card.className = 'provider-premium-card';
        card.href = directUrl;
        card.target = '_blank';
        card.rel = 'noopener noreferrer';
        card.setAttribute('title', `${actionLabel} ${item.title} no ${prov.name}`);
        card.innerHTML = `
          <div class="provider-logo-wrapper">
            ${logoUrl ? `<img 
              src="${logoUrl}" 
              class="provider-logo-img" 
              alt="${prov.name}" 
              loading="lazy" 
              onerror="this.onerror=null; this.parentElement.innerHTML='${prov.icon || (item.type === 'book' ? '📖' : '📺')}';"
            />` : `<span style="font-size: 1.35rem;">${prov.icon || '📖'}</span>`}
          </div>
          <div class="provider-info-wrap">
            <div class="provider-brand-name">${prov.name}</div>
            <div class="provider-type-tag">${item.type === 'book' && prov.type ? prov.type : (typeof t === 'function' ? t('action_available_online') : (prov.type || 'Disponível Online'))}</div>
          </div>
          <div class="provider-watch-btn">
            <span>${actionLabel}</span>
            <span class="provider-arrow">↗</span>
          </div>
        `;
        providersList.appendChild(card);
      });
    } else {
      providersList.innerHTML = `<span style="color: var(--text-muted); font-size: 0.9rem;">Informações de streaming/distribuição não cadastradas.</span>`;
    }
  }

  // Ficha Técnica (Sidebar)
  const techTitle = document.getElementById('titleTechInfo');
  const techLblTitle = document.getElementById('lblTechTitle');
  const techLblDir = document.getElementById('lblTechDirector');
  const techLblRel = document.getElementById('lblTechRelease');
  const techLblSt = document.getElementById('lblTechStatus');
  const techLblDur = document.getElementById('lblTechDuration');

  if (techTitle) techTitle.innerHTML = `<span>ℹ️</span> ${typeof t === 'function' ? t('tech_info_title') : 'Ficha Técnica'}`;
  if (techLblTitle) techLblTitle.textContent = typeof t === 'function' ? t('tech_original_title') : 'Título Original';
  if (techLblDir) techLblDir.textContent = typeof t === 'function' ? t('tech_director_author') : 'Direção / Autor';
  if (techLblRel) techLblRel.textContent = typeof t === 'function' ? t('tech_release_year') : 'Ano de Lançamento';
  if (techLblSt) techLblSt.textContent = typeof t === 'function' ? t('tech_status') : 'Status';
  if (techLblDur) techLblDur.textContent = typeof t === 'function' ? t('tech_duration_format') : 'Duração / Formato';

  document.getElementById('techOriginalTitle').textContent = item.originalTitle || item.title || '-';
  document.getElementById('techDirector').textContent = item.type === 'book'
    ? ([item.director, item.publisher].filter(Boolean).join(' • ') || '-')
    : (item.director || item.publisher || '-');
  document.getElementById('techReleaseYear').textContent = item.year || '-';
  document.getElementById('techStatus').textContent = item.notReleasedYet
    ? tr('tech_status_upcoming', 'Ainda não lançado')
    : (item.inTheaters ? tr('tech_status_in_theaters', 'Em cartaz nos cinemas') : tr('tech_status_released', 'Lançado / Disponível'));
  document.getElementById('techDurationFormat').textContent = durText;

  // Seção de Avaliações e Recomendações (Títulos e Formulário)
  const reviewsTitle = document.getElementById('titleReviews');
  const writeReviewTitle = document.getElementById('lblWriteReview');
  const yourRatingLabel = document.getElementById('lblYourRating');
  const ratingTextLabel = document.getElementById('ratingTextLabel');
  const reviewCommentInput = document.getElementById('detailsReviewComment');
  const btnPublish = document.getElementById('btnPublishReview');
  const recsTitle = document.getElementById('titleRecommendations');

  if (reviewsTitle) reviewsTitle.innerHTML = `<span>⭐</span> ${typeof t === 'function' ? t('details_reviews_title') : 'Avaliações & Críticas da Comunidade'}`;
  if (writeReviewTitle) writeReviewTitle.textContent = typeof t === 'function' ? t('review_leave_title') : 'Deixe sua Avaliação';
  if (yourRatingLabel) yourRatingLabel.textContent = typeof t === 'function' ? t('review_your_rating') : 'Sua Nota:';
  if (ratingTextLabel && DetailsState.selectedStars === 0) ratingTextLabel.textContent = typeof t === 'function' ? t('review_select_stars') : 'Selecione as estrelas';
  if (reviewCommentInput) reviewCommentInput.placeholder = typeof t === 'function' ? t('review_placeholder') : 'Compartilhe o que você achou desta obra...';
  if (btnPublish) btnPublish.textContent = typeof t === 'function' ? t('review_btn_publish') : 'Publicar Avaliação';
  if (recsTitle) recsTitle.textContent = typeof t === 'function' ? t('details_recommendations_title') : 'Obras Semelhantes Recomendadas';

  // Atualiza estado dos botões da Watchlist
  updateWatchlistButtons(item.id);
}

/**
 * Abre o Modal de Detalhes da Pessoa / Artista com Biografia e Filmografia TMDb
 */
async function openPersonModal(person) {
  const modal = document.getElementById('personModal');
  if (!modal) return;

  const currentL = localStorage.getItem('cinebook_lang') || 'pt';
  const nameEl = document.getElementById('personModalName');
  const depEl = document.getElementById('personModalDepartment');
  const photoEl = document.getElementById('personModalPhoto');
  const heroEl = document.getElementById('personModalHero');
  const birthEl = document.getElementById('personModalBirth');
  const placeEl = document.getElementById('personModalPlace');
  const popEl = document.getElementById('personModalPopularity');
  const bioEl = document.getElementById('personModalBio');
  const creditsGrid = document.getElementById('personModalCreditsGrid');

  const departmentTranslations = {
    'Acting': { pt: 'Atuação', en: 'Acting', es: 'Actuación', fr: 'Interprétation', zh: '表演', hi: 'अभिनय', ar: 'تمثيل', bn: 'অভিনয়', ru: 'Актёрское искусство', ur: 'اداکاری', id: 'Akting' },
    'Directing': { pt: 'Direção', en: 'Directing', es: 'Dirección', fr: 'Réalisation', zh: '导演', hi: 'निर्देशन', ar: 'إخراج', bn: 'পরিচালনা', ru: 'Режиссура', ur: 'ہدایت کاری', id: 'Penyutradaraan' },
    'Writing': { pt: 'Roteiro & Escrita', en: 'Writing', es: 'Guion', fr: 'Écriture', zh: '编剧', hi: 'लेखन', ar: 'تأليف', bn: 'চিত্রনাট্য', ru: 'Сценарий', ur: 'تحریر', id: 'Penulisan' },
    'Production': { pt: 'Produção', en: 'Production', es: 'Producción', fr: 'Production', zh: '制片', hi: 'निर्माण', ar: 'إنتاج', bn: 'প্রযোজনা', ru: 'Продюсирование', ur: 'پروڈکشن', id: 'Produksi' },
    'Sound': { pt: 'Trilha Sonora', en: 'Soundtrack', es: 'Banda Sonora', fr: 'Bande Sonore', zh: '配乐', hi: 'संगीत', ar: 'موسيقى تصويرية', bn: 'সঙ্গীত', ru: 'Музыка', ur: 'ساؤنڈ ٹریک', id: 'Musik' },
    'Camera': { pt: 'Fotografia & Câmera', en: 'Cinematography', es: 'Fotografía', fr: 'Photographie', zh: '摄影', hi: 'छायांकन', ar: 'تصوير سينمائي', bn: 'চিত্রগ্রহণ', ru: 'Операторская работа', ur: 'سنیماٹوگرافی', id: 'Sinematografi' },
    'Author': { pt: 'Autor(a)', en: 'Author', es: 'Autor(a)', fr: 'Auteur(e)', zh: '作者', hi: 'लेखक', ar: 'مؤلف', bn: 'লেখক', ru: 'Автор', ur: 'مصنف', id: 'Penulis' }
  };

  const getLocalizedDepartment = (depKey) => {
    if (!depKey) return 'Cinema & TV';
    const cleanKey = depKey.trim();
    const entry = departmentTranslations[cleanKey];
    if (entry) return entry[currentL] || entry['pt'] || entry['en'] || cleanKey;
    return cleanKey;
  };

  const labelBirth = { pt: 'Nasc.', en: 'Born', es: 'Nac.', fr: 'Né(e)', zh: '出生', hi: 'जन्म', ar: 'الميلاد', bn: 'জন্ম', ru: 'Рожд.', ur: 'پیدائش', id: 'Lahir' }[currentL] || 'Nasc.';
  const labelPop = { pt: 'Popularidade', en: 'Popularity', es: 'Popularidad', fr: 'Popularité', zh: '热度', hi: 'लोकप्रियता', ar: 'شعبية', bn: 'জনপ্রিয়তা', ru: 'Популярность', ur: 'مقبولیت', id: 'Popularitas' }[currentL] || 'Popularidade';
  const labelLoadingBio = { pt: 'Carregando biografia oficial do TMDb...', en: 'Loading official biography from TMDb...', es: 'Cargando biografía oficial de TMDb...', fr: 'Chargement de la biographie TMDb...', zh: '正在加载 TMDb 官方传记...', hi: 'टीएमडीबी से जीवनी लोड हो रही है...', ar: 'جاري تحميل السيرة الذاتية...', bn: 'জীবনী লোড হচ্ছে...', ru: 'Загрузка биографии TMDb...', ur: 'سوانح حیات لوڈ ہو رہی ہے...', id: 'Memuat biografi resmi TMDb...' }[currentL] || 'Carregando biografia...';

  const personName = typeof person === 'string' ? person : (person.name || 'Artista');
  let personPhoto = person.photo || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=500&q=80';
  let personRole = person.role || 'Atuação';

  if (nameEl) nameEl.textContent = personName;
  if (depEl) depEl.textContent = `${getLocalizedDepartment(personRole)} • Cinema & TV`;
  if (photoEl) {
    photoEl.src = personPhoto;
    photoEl.alt = personName;
  }
  if (heroEl) {
    heroEl.style.backgroundImage = `url('${personPhoto}')`;
  }
  if (birthEl) birthEl.textContent = `🎂 ${labelBirth}: —`;
  if (placeEl) placeEl.textContent = '📍 —';
  if (popEl) popEl.textContent = `🔥 85 ${labelPop}`;
  if (bioEl) bioEl.textContent = labelLoadingBio;

  if (creditsGrid) {
    creditsGrid.innerHTML = '<div style="color: #94a3b8; font-size: 0.9rem; padding: 1rem 0;">Buscando filmografia oficial...</div>';
  }

  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');

  // Busca dados na API TMDb
  if (typeof TMDB !== 'undefined') {
    try {
      let tmdbPersonId = person.personId || person.id;
      
      // Se não tiver ID numérico direto, busca pelo nome no TMDb
      if (!tmdbPersonId || isNaN(Number(tmdbPersonId))) {
        const searchResults = await TMDB.searchPeople(personName);
        if (searchResults && searchResults.length > 0) {
          tmdbPersonId = searchResults[0].personId || searchResults[0].id;
        }
      }

      if (tmdbPersonId) {
        const cleanId = String(tmdbPersonId).replace('person_', '').replace('tmdb_', '');
        const details = await TMDB.getPersonDetails(cleanId);
        
        if (details) {
          if (nameEl && details.name) nameEl.textContent = details.displayName || details.name;
          if (depEl && details.known_for_department) {
            depEl.textContent = `${getLocalizedDepartment(details.known_for_department)} • Cinema & TV`;
          }
          if (photoEl && details.profile_path) {
            photoEl.src = `${TMDB_CONFIG.IMAGE_BASE_URL}${details.profile_path}`;
          }
          if (birthEl && details.birthday) {
            birthEl.textContent = `🎂 ${labelBirth}: ${details.birthday}`;
          }
          if (placeEl && details.place_of_birth) {
            placeEl.textContent = `📍 ${details.place_of_birth}`;
          }
          if (popEl && details.popularity) {
            popEl.textContent = `🔥 ${Math.round(details.popularity)} ${labelPop}`;
          }

          const bioText = details.localizedBiography || details.biography;
          if (bioEl) {
            if (bioText && bioText.trim()) {
              bioEl.textContent = bioText.trim();
            } else {
              const noBioMsg = {
                pt: 'Biografia ainda não cadastrada neste idioma no TMDb.',
                en: 'Biography not available in this language on TMDb.',
                es: 'Biografía no disponible en este idioma en TMDb.',
                fr: 'Biographie non disponible dans cette langue sur TMDb.',
                zh: '该语言的传记暂未录入 TMDb。',
                hi: 'इस भाषा में जीवनी अभी उपलब्ध नहीं है।',
                ar: 'السيرة الذاتية غير متوفرة بهذه اللغة حالياً.',
                bn: 'এই ভাষায় জীবনী এখনও উপলব্ধ নয়।',
                ru: 'Биография на этом языке пока не добавлена в TMDb.',
                ur: 'اس زبان میں سوانح حیات فی الحال دستیاب نہیں ہے۔',
                id: 'Biografi belum tersedia dalam bahasa ini di TMDb.'
              }[currentL] || 'Biografia não disponível.';
              bioEl.textContent = noBioMsg;
            }
          }

          // Filmografia (Deduplicada por chave e por título)
          const castCredits = (details.combined_credits?.cast || []).filter(c => c.poster_path);
          const crewCredits = (details.combined_credits?.crew || []).filter(c => c.poster_path && (c.job === 'Director' || c.department === 'Directing' || c.job === 'Writer'));
          
          const allCredits = [...castCredits, ...crewCredits];
          const uniqueCredits = [];
          const seenKeys = new Set();
          const seenTitles = new Set();

          allCredits.forEach(c => {
            const mediaType = c.media_type || (c.first_air_date ? 'tv' : 'movie');
            const title = (c.title || c.name || '').trim();
            const normTitle = title.toLowerCase().replace(/[:\-–—\s]+/g, ' ').trim();
            const key = `${mediaType}_${c.id}`;

            if (!seenKeys.has(key) && (!normTitle || !seenTitles.has(normTitle))) {
              seenKeys.add(key);
              if (normTitle) seenTitles.add(normTitle);
              uniqueCredits.push({
                ...c,
                detectedMediaType: mediaType,
                displayTitle: title
              });
            }
          });

          uniqueCredits.sort((a, b) => (b.vote_count || b.popularity || 0) - (a.vote_count || a.popularity || 0));

          if (creditsGrid) {
            creditsGrid.innerHTML = '';
            if (uniqueCredits.length === 0) {
              creditsGrid.innerHTML = '<div style="color: #94a3b8; font-size: 0.9rem;">Nenhuma obra com pôster cadastrado.</div>';
            } else {
              uniqueCredits.slice(0, 15).forEach(cr => {
                const workCard = document.createElement('div');
                workCard.className = 'person-credit-item';
                workCard.setAttribute('tabindex', '0');
                workCard.setAttribute('title', cr.displayTitle || cr.title || cr.name);
                
                const title = cr.displayTitle || cr.title || cr.name || 'Obra';
                const year = (cr.release_date || cr.first_air_date || '').substring(0, 4);
                const role = cr.character ? `como ${cr.character}` : (cr.job || (cr.detectedMediaType === 'tv' ? 'Série' : 'Filme'));

                workCard.innerHTML = `
                  <img 
                    src="${TMDB_CONFIG.IMAGE_BASE_URL}${cr.poster_path}" 
                    alt="${title}" 
                    class="person-credit-poster" 
                    loading="lazy" 
                    onerror="this.onerror=null; this.src='https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?auto=format&fit=crop&w=300&q=80';"
                  />
                  <div class="person-credit-body">
                    <div class="person-credit-title">${title}</div>
                    <div class="person-credit-role">${year ? `${year} • ` : ''}${role}</div>
                  </div>
                `;

                workCard.addEventListener('click', () => {
                  closePersonModal();
                  const mType = cr.detectedMediaType === 'tv' ? 'tv' : 'movie';
                  window.location.href = `detalhes.html?id=tmdb_${mType}_${cr.id}`;
                });

                creditsGrid.appendChild(workCard);
              });
            }
          }
        }
      }
    } catch (err) {
      console.warn("Erro ao buscar detalhes da pessoa no TMDb:", err);
      if (bioEl) bioEl.textContent = 'Informações biográficas detalhadas não disponíveis offline.';
    }
  }
}
function closePersonModal() {
  const modal = document.getElementById('personModal');
  if (modal) {
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
  }
}

/**
 * Gerencia os botões de Watchlist e Ações de Navegação
 */
function initActions() {
  // Botão Voltar ao Catálogo e Logo com navegação garantida
  document.getElementById('btnBackCatalog')?.addEventListener('click', (e) => {
    e.preventDefault();
    window.location.href = 'index.html';
  });

  document.getElementById('brandBtn')?.addEventListener('click', (e) => {
    e.preventDefault();
    window.location.href = 'index.html';
  });

  // Fechamento do Person Modal
  document.getElementById('personModalCloseBtn')?.addEventListener('click', closePersonModal);
  document.getElementById('personModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'personModal') closePersonModal();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closePersonModal();
    }
  });

  document.querySelectorAll('.details-btn-action[data-status]').forEach(btn => {
    btn.addEventListener('click', () => {
      const item = DetailsState.currentMedia;
      if (!item) return;

      const status = btn.getAttribute('data-status');
      toggleWatchlist(item.id, status);
      updateWatchlistButtons(item.id);
    });
  });
}

function toggleWatchlist(mediaId, status) {
  const item = DetailsState.currentMedia;
  const title = item ? item.title : 'Obra';

  const currentStatus = DetailsState.watchlist[mediaId]?.status || (typeof DetailsState.watchlist[mediaId] === 'string' ? DetailsState.watchlist[mediaId] : null);

  if (currentStatus === status) {
    delete DetailsState.watchlist[mediaId];
    const remMsg = typeof t === 'function' ? t('toast_removed_watchlist') : 'removido da sua estante.';
    showToast(`"${title}" ${remMsg}`);
  } else {
    DetailsState.watchlist[mediaId] = {
      id: mediaId,
      status: status,
      title: item ? item.title : title,
      originalTitle: item ? (item.originalTitle || item.title) : title,
      year: item ? item.year : 2024,
      poster: item ? item.poster : '',
      backdrop: item ? (item.backdrop || item.poster) : '',
      type: item ? item.type : 'movie',
      rating: item ? (item.rating || 0) : 0,
      addedAt: new Date().toISOString()
    };
    const statusMsg = status === 'favorite' 
      ? (typeof t === 'function' ? t('toast_added_favorite') : 'adicionado aos Favoritos! ❤️') 
      : (status === 'completed' || status === 'watched' 
          ? (typeof t === 'function' ? t('toast_marked_watched') : 'marcado como Assistido/Lido! ✅') 
          : (typeof t === 'function' ? t('toast_added_plan') : 'adicionado à sua lista Quero Ver! ➕'));
    showToast(`"${title}" ${statusMsg}`);
  }
  localStorage.setItem('cinebook_watchlist', JSON.stringify(DetailsState.watchlist));
}

function updateWatchlistButtons(mediaId) {
  const current = DetailsState.watchlist[mediaId];
  document.querySelectorAll('.details-btn-action[data-status]').forEach(btn => {
    const status = btn.getAttribute('data-status');
    const isThis = current && current.status === status;
    btn.classList.toggle('active-favorite', isThis && status === 'favorite');
    btn.classList.toggle('active-watched', isThis && status !== 'favorite');
  });
}

/**
 * Inicializador do seletor de 5 estrelas (Suave e sem travamentos)
 */
function initStarRating() {
  const container = document.getElementById('detailsStarRating');
  if (!container) return;

  const stars = container.querySelectorAll('.star-btn');
  const countDisplay = document.getElementById('detailsStarCount');
  const labelDisplay = document.getElementById('ratingTextLabel');

  const getStarLabel = (r) => {
    const map = {
      1: typeof t === 'function' ? t('star_label_1') : '1/5 • Ruim',
      2: typeof t === 'function' ? t('star_label_2') : '2/5 • Regular',
      3: typeof t === 'function' ? t('star_label_3') : '3/5 • Bom',
      4: typeof t === 'function' ? t('star_label_4') : '4/5 • Muito Bom',
      5: typeof t === 'function' ? t('star_label_5') : '5/5 • Excelente!'
    };
    return map[r] || `${r}/5`;
  };

  stars.forEach(star => {
    const rating = parseInt(star.getAttribute('data-star'), 10);

    // Efeito de hover suave
    star.addEventListener('pointerenter', () => {
      stars.forEach(s => {
        const val = parseInt(s.getAttribute('data-star'), 10);
        if (val <= rating) {
          s.classList.add('hovered');
        } else {
          s.classList.remove('hovered');
        }
      });
      if (labelDisplay) labelDisplay.textContent = getStarLabel(rating);
    });

    // Clique para fixar nota
    star.addEventListener('click', () => {
      DetailsState.selectedStars = rating;
      if (countDisplay) countDisplay.textContent = `${rating}/5`;
      if (labelDisplay) labelDisplay.textContent = getStarLabel(rating);

      stars.forEach(s => {
        const val = parseInt(s.getAttribute('data-star'), 10);
        if (val <= rating) {
          s.classList.add('active');
        } else {
          s.classList.remove('active');
        }
      });
    });

    // Acessibilidade por teclado
    star.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        star.click();
      }
    });
  });

  // Limpa o hover apenas ao sair de toda a área de estrelas
  container.addEventListener('pointerleave', () => {
    stars.forEach(s => s.classList.remove('hovered'));
    if (labelDisplay) {
      labelDisplay.textContent = DetailsState.selectedStars > 0 
        ? getStarLabel(DetailsState.selectedStars) 
        : (typeof t === 'function' ? t('review_select_stars') : 'Selecione as estrelas');
    }
  });

  document.getElementById('btnPublishReview')?.addEventListener('click', saveReview);
}

/**
 * Salva uma nova avaliação (1 a 5 estrelas)
 */
async function saveReview() {
  const item = DetailsState.currentMedia;
  if (!item || item.notReleasedYet) return;

  const commentInput = document.getElementById('detailsReviewComment');
  const comment = (commentInput?.value || '').trim();

  if (DetailsState.selectedStars === 0) {
    showToast(typeof t === 'function' ? t('toast_select_stars') : 'Por favor, selecione de 1 a 5 estrelas.');
    return;
  }

  const userName = DetailsState.currentUser ? DetailsState.currentUser.name : 'Usuário Anônimo';
  const userAvatar = DetailsState.currentUser ? (DetailsState.currentUser.avatar || '🍿') : '🍿';

  const reviewObj = {
    mediaId: item.id,
    user: userName,
    avatar: userAvatar,
    rating: DetailsState.selectedStars,
    comment: comment || 'Excelente obra recomendada pelo catálogo.',
    date: new Date().toLocaleDateString('pt-BR')
  };

  // Salva no localStorage
  const key = `cinebook_reviews_${item.id}`;
  const existing = JSON.parse(localStorage.getItem(key)) || [];
  existing.unshift(reviewObj);
  localStorage.setItem(key, JSON.stringify(existing));

  // Tenta sincronizar com o backend em segundo plano
  try {
    const apiBase = window.location.origin.includes('localhost:8000') || window.location.origin.includes('127.0.0.1:8000') 
      ? window.location.origin 
      : 'http://localhost:8000';
    await fetch(`${apiBase}/api/reviews`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        media_id: item.id,
        user_name: userName,
        rating: DetailsState.selectedStars * 2,
        comment: reviewObj.comment
      })
    });
  } catch (e) {}

  // Reseta o formulário
  if (commentInput) commentInput.value = '';
  DetailsState.selectedStars = 0;
  const countDisplay = document.getElementById('detailsStarCount');
  const labelDisplay = document.getElementById('ratingTextLabel');
  if (countDisplay) countDisplay.textContent = '0/5';
  if (labelDisplay) labelDisplay.textContent = typeof t === 'function' ? t('review_select_stars') : 'Selecione as estrelas';
  document.querySelectorAll('#detailsStarRating .star-btn').forEach(s => {
    s.classList.remove('active', 'hovered');
  });

  showToast(typeof t === 'function' ? t('toast_review_published') : 'Sua avaliação foi publicada com sucesso! 🌟');
  renderReviews(item.id);
}

/**
 * Renderiza as avaliações específicas da obra (customizadas e exclusivas por filme/livro)
 */
function renderReviews(mediaId) {
  const container = document.getElementById('detailsReviewsList');
  if (!container) return;

  const item = DetailsState.currentMedia || (typeof MEDIA_DATABASE !== 'undefined' ? MEDIA_DATABASE.find(m => m.id === mediaId) : null) || { id: mediaId, title: 'Esta Obra' };

  // Obra ainda não lançada: some com a seção inteira (avaliações existentes
  // + formulário de nova avaliação), não só filtra a lista.
  const reviewsBlock = document.getElementById('detailsReviewsBlock');
  if (reviewsBlock) reviewsBlock.style.display = item.notReleasedYet ? 'none' : '';
  if (item.notReleasedYet) {
    container.innerHTML = '';
    return;
  }
  const key = `cinebook_reviews_${mediaId}`;
  const userSavedReviews = JSON.parse(localStorage.getItem(key)) || [];

  // Pega as avaliações específicas e autênticas da obra
  const curatedReviews = (typeof getCuratedReviewsForMedia === 'function') 
    ? getCuratedReviewsForMedia(item) 
    : [];

  // Combina as resenhas do usuário logado no topo com as resenhas exclusivas da obra
  const allReviews = [...userSavedReviews, ...curatedReviews];

  container.innerHTML = '';
  if (allReviews.length === 0) {
    container.innerHTML = `<div style="text-align: center; padding: 1.5rem; color: var(--text-muted); font-size: 0.9rem;">Nenhuma avaliação registrada ainda. Seja o primeiro a avaliar!</div>`;
    return;
  }

  allReviews.forEach(rev => {
    const card = document.createElement('div');
    card.className = 'review-card';
    card.style.background = 'rgba(15, 23, 42, 0.65)';
    card.style.border = '1px solid rgba(255, 255, 255, 0.08)';
    card.style.borderRadius = '14px';
    card.style.padding = '1.3rem';
    card.style.marginBottom = '1rem';
    card.style.backdropFilter = 'blur(12px)';
    card.style.boxShadow = '0 4px 20px rgba(0, 0, 0, 0.2)';

    const starsNum = rev.rating <= 5 ? rev.rating : Math.min(5, Math.max(1, Math.round(rev.rating / 2)));
    const starsHtml = '★'.repeat(starsNum) + '☆'.repeat(5 - starsNum);
    
    // Iniciais estilizadas e modernas (sem emojis)
    const initials = rev.avatar && rev.avatar.length <= 3 && !/^\p{Emoji}/u.test(rev.avatar)
      ? rev.avatar 
      : (rev.user ? rev.user.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase() : 'U');

    card.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.75rem; flex-wrap: wrap; gap: 0.5rem;">
        <div style="display: flex; align-items: center; gap: 0.75rem;">
          <div style="width: 38px; height: 38px; border-radius: 50%; background: linear-gradient(135deg, rgba(3, 180, 228, 0.25) 0%, rgba(30, 213, 169, 0.3) 100%); border: 1px solid rgba(56, 189, 248, 0.4); display: flex; align-items: center; justify-content: center; font-size: 0.82rem; font-weight: 700; color: #38bdf8; letter-spacing: 0.5px; box-shadow: 0 0 10px rgba(56, 189, 248, 0.2);">
            ${initials}
          </div>
          <div>
            <strong style="color: #ffffff; font-size: 0.95rem; display: block; font-weight: 700;">${rev.user}</strong>
            <small style="color: var(--text-muted); font-size: 0.78rem;">${rev.date}</small>
          </div>
        </div>
        <div style="display: flex; align-items: center; gap: 0.45rem;">
          <span style="color: #f59e0b; font-weight: bold; font-size: 1.05rem; letter-spacing: 2px;">${starsHtml}</span>
          <span style="color: #cbd5e1; font-size: 0.82rem; font-weight: 700; background: rgba(245, 158, 11, 0.15); border: 1px solid rgba(245, 158, 11, 0.3); padding: 0.15rem 0.45rem; border-radius: 6px;">(${starsNum}/5)</span>
        </div>
      </div>
      <p style="color: #cbd5e1; font-size: 0.95rem; line-height: 1.65; margin: 0; font-weight: 400;">${rev.comment}</p>
    `;
    container.appendChild(card);
  });
}

/**
 * Carrega recomendações inteligentes
 */
async function loadRecommendations(item) {
  const container = document.getElementById('detailsRecsGrid');
  if (!container || typeof MEDIA_DATABASE === 'undefined') return;

  const currentL = localStorage.getItem('cinebook_lang') || 'pt';

  let recs = MEDIA_DATABASE
    .filter(m => m.id !== item.id && m.type === item.type)
    .slice(0, 4);

  // Livros: parecidos de verdade (mesmo gênero/autor) pelo Google Books.
  if (item.type === 'book' && typeof GoogleBooks !== 'undefined') {
    try {
      const similar = await GoogleBooks.getSimilar(item, 4);
      if (similar.length >= 2) recs = similar;
    } catch (_) {}
  }

  container.innerHTML = '';
  recs.forEach(rec => {
    const card = document.createElement('article');
    card.className = 'media-card';
    card.style.cursor = 'pointer';

    const rawGenres = (rec.genres || []).map(g => {
      const found = GENRES_CONFIG.find(c => c.match && c.match.some(m => m.toLowerCase() === g.toLowerCase()));
      return found ? (found[currentL] || found.pt || g) : g;
    });
    const translatedGenres = [...new Set(rawGenres)];

    card.innerHTML = `
      <div class="poster-wrapper">
        <span class="poster-type-badge ${rec.type}">${rec.type}</span>
        <img src="${rec.poster}" alt="${rec.title}" class="poster-img" loading="lazy" onerror="this.onerror=null; this.src='${rec.type === 'book' && typeof generateBookCover === 'function' ? generateBookCover(rec.title, rec.director) : 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?auto=format&fit=crop&w=500&q=80'}';"/>
      </div>
      <div class="card-content" style="padding: 0.9rem;">
        <h4 class="card-title" style="font-size: 0.9rem;">${rec.title}</h4>
        <div class="card-meta" style="font-size: 0.78rem;">${rec.year} • ${rec.director || ''}</div>
        <div class="card-genres">${translatedGenres.slice(0, 2).join(' • ')}</div>
      </div>
    `;

    card.addEventListener('click', () => {
      window.location.href = `detalhes.html?id=${encodeURIComponent(rec.id)}`;
    });

    container.appendChild(card);
  });
}

/**
 * Toast de Feedback
 */
function showToast(message) {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerHTML = `<span>🍿</span> <span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('fade-out');
    setTimeout(() => toast.remove(), 400);
  }, 2500);
}

/**
 * Renderiza o avatar do usuário com suporte a Imagem (Base64/URL), Emoji ou Iniciais
 */
function renderUserAvatar(avatarElement, avatarData, userName) {
  if (!avatarElement) return;

  if (avatarData && (avatarData.startsWith('data:image') || avatarData.startsWith('http') || avatarData.startsWith('blob:'))) {
    avatarElement.innerHTML = `<img src="${avatarData}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;display:block;" alt="Avatar">`;
  } else if (avatarData && avatarData.trim().length > 0 && avatarData.length <= 2) {
    avatarElement.textContent = avatarData;
  } else if (userName && userName.trim().length > 0) {
    avatarElement.textContent = userName.substring(0, 2).toUpperCase();
  } else {
    avatarElement.textContent = '🍿';
  }
}

/**
 * Perfil / Autenticação
 */
function initAuthUI() {
  const authButtonsGroup = document.getElementById('authButtonsGroup');
  const userProfileContainer = document.getElementById('userProfileContainer');
  const headerUserAvatar = document.getElementById('headerUserAvatar');
  const headerUserName = document.getElementById('headerUserName');
  const dropdownUserName = document.getElementById('dropdownUserName');
  const dropdownUserEmail = document.getElementById('dropdownUserEmail');
  const userProfileChip = document.getElementById('userProfileChip');
  const userProfileDropdown = document.getElementById('userProfileDropdown');
  const btnLogoutHeader = document.getElementById('btnLogoutHeader');

  let savedUser = null;
  try {
    savedUser = JSON.parse(localStorage.getItem('cinebook_user'));
  } catch (e) {}

  if (savedUser && (savedUser.name || savedUser.email)) {
    if (authButtonsGroup) authButtonsGroup.style.display = 'none';
    if (userProfileContainer) userProfileContainer.style.display = 'flex';
    
    // Renderiza avatar com suporte a Imagem, Emoji e Iniciais
    renderUserAvatar(headerUserAvatar, savedUser.avatar, savedUser.name);
    
    // Nome do Usuário
    const rawName = savedUser.name || savedUser.username || (savedUser.email ? savedUser.email.split('@')[0] : 'Usuário');
    const firstName = rawName.split(' ')[0];
    if (headerUserName) {
      headerUserName.textContent = firstName;
      headerUserName.style.display = 'inline-block';
    }
    if (dropdownUserName) dropdownUserName.textContent = rawName;
    if (dropdownUserEmail) dropdownUserEmail.textContent = savedUser.email || '';
  } else {
    if (authButtonsGroup) authButtonsGroup.style.display = 'flex';
    if (userProfileContainer) userProfileContainer.style.display = 'none';
  }

  if (userProfileChip && userProfileDropdown) {
    userProfileChip.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      userProfileDropdown.classList.toggle('open');
    };
    document.addEventListener('click', (e) => {
      if (!userProfileDropdown.contains(e.target) && !userProfileChip.contains(e.target)) {
        userProfileDropdown.classList.remove('open');
      }
    });
  }

  if (btnLogoutHeader) {
    btnLogoutHeader.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      localStorage.removeItem('cinebook_user');
      window.location.reload();
    };
  }
}


/**
 * Avatar com as iniciais do nome, para quem não tem foto cadastrada — em vez
 * de uma foto de banco de imagens de uma pessoa qualquer.
 */
function initialsAvatar(name) {
  const parts = String(name || '?').trim().split(/\s+/).filter(Boolean);
  const initials = ((parts[0] || '?')[0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200"><rect width="200" height="200" fill="#1e293b"/><text x="100" y="118" text-anchor="middle" font-family="Arial, sans-serif" font-size="64" font-weight="700" fill="#1ed5a9">${initials.replace(/[<>&"]/g, '')}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
