/**
 * CineBook - Gerenciador Principal da Aplicação (Full Stack: JS + Python + SQLite)
 * Suporte a cadastro de clientes, login, perfil, modo híbrido e algoritmos de recomendação.
 */


// ==========================================
// 1. ESTADO GLOBAL DA APLICAÇÃO
// ==========================================
const AppState = {
  backendOnline: false,
  apiBaseUrl: window.location.origin.includes('localhost:8000') || window.location.origin.includes('127.0.0.1:8000')
    ? window.location.origin
    : 'http://localhost:8000',

  activeTab: 'movie', // 'movie', 'series', 'book', 'people', 'all', 'watchlist'
  tmdbMoviePage: 1,
  tmdbSeriesPage: 1,
  tmdbAllPage: 1,
  tmdbPeoplePage: 1,
  isLoadingMore: false,
  searchQuery: '',
  peopleSearchQuery: '',
  peopleSortBy: 'popularity',
  selectedGenre: 'Todos os Gêneros',
  selectedGenreKey: 'all',
  sortBy: 'popularity',
  watchlistSubFilter: 'all',
  currentModalMedia: null,
  selectedReviewStars: 0,
  selectedAvatar: '🍿',
  peopleList: [],

  // Usuário Autenticado (Salvo na sessão local)
  currentUser: (() => {
    try {
      return JSON.parse(localStorage.getItem('cinebook_user')) || null;
    } catch (e) {
      return null;
    }
  })(),

  // Base de mídias ativa
  mediaList: typeof MEDIA_DATABASE !== 'undefined' ? [...MEDIA_DATABASE] : [],

  // Watchlist pessoal (persiste estritamente as escolhas do usuário)
  watchlist: (() => {
    try {
      const raw = localStorage.getItem('cinebook_watchlist');
      if (raw !== null) {
        const parsed = JSON.parse(raw);
        if (typeof parsed === 'object' && parsed !== null) return parsed;
      }
    } catch (e) { }
    return {};
  })(),

  // Avaliações feitas na página inicial (formato antigo). As novas ficam
  // por obra — ver js/reviews.js.
  reviews: (() => {
    try { return JSON.parse(localStorage.getItem('cinebook_reviews')) || {}; } catch (e) { return {}; }
  })()
};

// ==========================================
// 2. INICIALIZAÇÃO DA APLICAÇÃO
// ==========================================
document.addEventListener('DOMContentLoaded', async () => {
  try {
    const urlParams = new URLSearchParams(window.location.search);
    const initialTab = urlParams.get('tab');
    if (initialTab && ['movie', 'series', 'book', 'people', 'all', 'watchlist'].includes(initialTab)) {
      AppState.activeTab = initialTab;
      document.querySelectorAll('.cine-nav-item[data-tab], .nav-tab-btn[data-tab]').forEach(b => {
        b.classList.toggle('active', b.getAttribute('data-tab') === initialTab);
      });
    }
  } catch (e) {
    console.warn("Erro ao processar URL:", e);
  }

  try { initGenrePills(); } catch (e) { console.warn(e); }
  try { initAuthUI(); } catch (e) { console.warn(e); }
  try { initEventListeners(); } catch (e) { console.warn(e); }
  try { initInfiniteScroll(); } catch (e) { console.warn(e); }
  try { updateWatchlistCounter(); } catch (e) { console.warn(e); }

  // 1. Renderiza IMEDIATAMENTE o Hero Banner e o Grid
  try { initHeroBanner(); } catch (e) { console.warn("Erro no HeroBanner:", e); }
  try { renderGrid(); } catch (e) { console.warn("Erro no renderGrid:", e); }

  // Reage à mudança de idioma
  window.addEventListener('languageChanged', async (e) => {
    const lang = e.detail?.lang || localStorage.getItem('cinebook_lang') || 'pt';
    
    // Atualização instantânea da roleta, grid e categorias no novo idioma
    HeroCarousel.updateItems();
    HeroCarousel.renderDashes();
    HeroCarousel.renderCurrentSlide();
    initGenrePills();
    renderGrid();
    renderUserRecommendationsBanner();

    // Em segundo plano, busca eventuais pôsteres e dados adicionais no TMDb
    try {
      if (typeof TMDB !== 'undefined') {
        await TMDB.enrichLocalizedPosters(AppState.mediaList, lang);
      }
      await loadTMDBTrendsForTab();
      renderGrid();
      HeroCarousel.updateItems();
      HeroCarousel.renderDashes();
      HeroCarousel.renderCurrentSlide();
    } catch (err) {
      console.warn("Aviso ao carregar dados do TMDb:", err);
    }
  });

  // 2. Conecta ao backend Python e ao TMDb em segundo plano
  checkBackendStatus();

  // Carrega tendências globais do TMDb e atualiza o grid
  loadTMDBTrendsForTab().then(() => {
    HeroCarousel.updateItems();
    HeroCarousel.renderDashes();
    HeroCarousel.renderCurrentSlide();
    renderGrid();
  }).catch(err => console.warn(err));
});

// ==========================================
// 3. AUTENTICAÇÃO E PERFIL DO CLIENTE 👤
// ==========================================
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

function itemMatchesUserPreferences(item, prefKeys) {
  if (!item || !item.genres || !Array.isArray(item.genres) || !prefKeys || !Array.isArray(prefKeys) || prefKeys.length === 0) return false;
  return item.genres.some(g => {
    if (typeof g !== 'string') return false;
    const gClean = g.trim().toLowerCase();
    const found = GENRES_CONFIG.find(c => c.match && c.match.some(m => m.toLowerCase() === gClean));
    if (found && prefKeys.includes(found.key)) return true;
    return prefKeys.some(pk => {
      const pkClean = pk.toLowerCase();
      return pkClean === gClean || gClean.includes(pkClean) || pkClean.includes(gClean);
    });
  });
}

function renderUserRecommendationsBanner() {
  const container = document.getElementById('userRecommendationsBannerContainer');
  if (!container) return;

  if (AppState.activeTab === 'people') {
    container.innerHTML = '';
    return;
  }

  const user = AppState.currentUser;
  if (!user || !user.preferredCategories || !Array.isArray(user.preferredCategories) || user.preferredCategories.length === 0) {
    container.innerHTML = '';
    return;
  }

  const currentL = localStorage.getItem('cinebook_lang') || 'pt';
  const allLabel = currentL === 'pt' ? 'Ver Todos os Filmes' : (currentL === 'es' ? 'Ver Todas las Películas' : 'View All Movies');

  const isAllActive = !AppState.selectedGenreKey || AppState.selectedGenreKey === 'all';
  const allChipHtml = `<button type="button" class="user-rec-chip ${isAllActive ? 'active' : ''}" data-genre-key="all" style="background: ${isAllActive ? 'rgba(56, 189, 248, 0.25)' : 'rgba(255, 255, 255, 0.05)'}; border-color: ${isAllActive ? '#38bdf8' : 'rgba(255, 255, 255, 0.12)'};"><span>${allLabel}</span></button>`;

  const chipsHtml = user.preferredCategories.map(key => {
    const genreObj = GENRES_CONFIG.find(g => g.key === key);
    const label = genreObj ? (genreObj[currentL] || genreObj.pt || genreObj.en) : key;
    const isActive = AppState.selectedGenreKey === key;
    return `<button type="button" class="user-rec-chip ${isActive ? 'active' : ''}" data-genre-key="${key}"><span>${label}</span></button>`;
  }).join('');

  const firstName = user.name ? user.name.split(' ')[0] : 'Você';

  container.innerHTML = `
    <div class="user-recommendations-banner">
      <div class="user-recommendations-info">
        <div>
          <h3 class="user-rec-title">
            Recomendações para ${firstName}
            <span style="font-size: 0.72rem; background: rgba(56, 189, 248, 0.15); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.3); padding: 0.15rem 0.5rem; border-radius: 6px; font-weight: 700; white-space: nowrap; flex-shrink: 0;">Personalizado</span>
          </h3>
          <p class="user-rec-desc">Obras recomendadas priorizadas no topo. Todas as outras categorias continuam disponíveis no catálogo abaixo:</p>
        </div>
      </div>
      <div class="user-rec-chips-list">
        ${allChipHtml}
        ${chipsHtml}
        <a href="perfil.html" class="btn-edit-prefs-link" title="Editar meus gostos no Perfil">Ajustar Gostos</a>
      </div>
    </div>
  `;

  // Listener para filtrar rápido ao clicar na categoria recomendada ou em todos
  container.querySelectorAll('.user-rec-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      const gKey = btn.getAttribute('data-genre-key');
      AppState.selectedGenreKey = gKey;
      AppState.selectedGenre = gKey === 'all' ? 'Todos os Gêneros' : gKey;
      document.querySelectorAll('.genre-pill').forEach(el => {
        const pKey = el.getAttribute('data-genre');
        const isMatch = gKey === 'all' ? pKey === 'all' : pKey === gKey;
        el.classList.toggle('active', isMatch);
        el.setAttribute('aria-selected', isMatch ? 'true' : 'false');
        if (isMatch) {
          el.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
        }
      });
      renderUserRecommendationsBanner();
      renderGrid();
      window.scrollTo({ top: 350, behavior: 'smooth' });
    });
  });
}

function initAuthUI() {
  const authButtonsGroup = document.getElementById('authButtonsGroup');
  const userProfileContainer = document.getElementById('userProfileContainer');
  const headerUserAvatar = document.getElementById('headerUserAvatar');
  const headerUserName = document.getElementById('headerUserName');
  const userDropdownMenu = document.getElementById('userDropdownMenu');

  // Verifica notificações de redirecionamento (URL Search Params)
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('onboarded') === 'true') {
    showToast('Preferências salvas! Preparamos recomendações sob medida para você! 🎯✨');
    window.history.replaceState({}, document.title, window.location.pathname);
  } else if (urlParams.get('registered') === 'true') {
    showToast('Conta criada com sucesso! Bem-vindo(a) ao CINEBOOKS! 🎉');
    window.history.replaceState({}, document.title, window.location.pathname);
  } else if (urlParams.get('login') === 'true') {
    showToast('Login realizado com sucesso! 🍿');
    window.history.replaceState({}, document.title, window.location.pathname);
  }

  if (AppState.currentUser && (AppState.currentUser.name || AppState.currentUser.email)) {
    if (authButtonsGroup) authButtonsGroup.style.display = 'none';
    if (userProfileContainer) userProfileContainer.style.display = 'flex';

    // Renderiza avatar com suporte a Imagem, Emoji e Iniciais
    renderUserAvatar(headerUserAvatar, AppState.currentUser.avatar, AppState.currentUser.name);

    const rawName = AppState.currentUser.name || AppState.currentUser.username || (AppState.currentUser.email ? AppState.currentUser.email.split('@')[0] : 'Usuário');
    const firstName = rawName.split(' ')[0];
    if (headerUserName) {
      headerUserName.textContent = firstName;
      headerUserName.style.display = 'inline-block';
    }
    const dropdownUserName = document.getElementById('dropdownUserName');
    const dropdownUserEmail = document.getElementById('dropdownUserEmail');
    if (dropdownUserName) dropdownUserName.textContent = rawName;
    if (dropdownUserEmail) dropdownUserEmail.textContent = AppState.currentUser.email || '';

    renderUserRecommendationsBanner();
  } else {
    if (authButtonsGroup) authButtonsGroup.style.display = 'flex';
    if (userProfileContainer) userProfileContainer.style.display = 'none';
    if (userDropdownMenu) userDropdownMenu.classList.remove('open');
    const recContainer = document.getElementById('userRecommendationsBannerContainer');
    if (recContainer) recContainer.innerHTML = '';
  }
}

let modalSelectedGenresSet = new Set(['scifi', 'action']);
let modalRegisteredUserTemp = null;

function renderModalCategoryPicker() {
  const grid = document.getElementById('modalCategoryPickerGrid');
  if (!grid) return;

  const MODAL_GENRES = [
    { key: 'action', name: 'Ação' },
    { key: 'adventure', name: 'Aventura' },
    { key: 'comedy', name: 'Comédia' },
    { key: 'drama', name: 'Drama' },
    { key: 'scifi', name: 'Ficção Científica' },
    { key: 'fantasy', name: 'Fantasia' },
    { key: 'horror', name: 'Terror' },
    { key: 'suspense', name: 'Suspense' },
    { key: 'romance', name: 'Romance' },
    { key: 'animation', name: 'Animação' },
    { key: 'crime', name: 'Crime' },
    { key: 'mystery', name: 'Mistério' },
    { key: 'documentary', name: 'Documentário' }
  ];

  grid.innerHTML = '';
  MODAL_GENRES.forEach(g => {
    const isSelected = modalSelectedGenresSet.has(g.key);
    const card = document.createElement('div');
    card.className = `category-choice-card ${isSelected ? 'selected' : ''}`;
    card.style.padding = '0.75rem 0.6rem';
    card.innerHTML = `
      <div class="category-choice-check">✓</div>
      <span class="category-choice-name" style="font-size: 0.82rem; font-weight: 600;">${g.name}</span>
    `;
    card.addEventListener('click', () => {
      if (modalSelectedGenresSet.has(g.key)) {
        modalSelectedGenresSet.delete(g.key);
      } else {
        modalSelectedGenresSet.add(g.key);
      }
      renderModalCategoryPicker();
    });
    grid.appendChild(card);
  });
}

function openAuthModal(mode = 'login') {
  const modal = document.getElementById('authModal');
  const tabLogin = document.getElementById('tabSwitchLogin');
  const tabRegister = document.getElementById('tabSwitchRegister');
  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');
  const modalCategoryStep = document.getElementById('modalCategoryStep');
  const authTabs = document.querySelector('.auth-tabs');
  const errorMsg = document.getElementById('authErrorMessage');

  if (errorMsg) {
    errorMsg.style.display = 'none';
    errorMsg.textContent = '';
  }
  if (modalCategoryStep) modalCategoryStep.style.display = 'none';
  if (authTabs) authTabs.style.display = 'flex';

  if (mode === 'login') {
    if (tabLogin) tabLogin.classList.add('active');
    if (tabRegister) tabRegister.classList.remove('active');
    if (loginForm) loginForm.style.display = 'block';
    if (registerForm) registerForm.style.display = 'none';
  } else {
    if (tabRegister) tabRegister.classList.add('active');
    if (tabLogin) tabLogin.classList.remove('active');
    if (registerForm) registerForm.style.display = 'block';
    if (loginForm) loginForm.style.display = 'none';
  }

  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
}

function closeAuthModal() {
  const modal = document.getElementById('authModal');
  const modalCategoryStep = document.getElementById('modalCategoryStep');
  const authTabs = document.querySelector('.auth-tabs');
  if (modalCategoryStep) modalCategoryStep.style.display = 'none';
  if (authTabs) authTabs.style.display = 'flex';
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
}

async function handleLoginSubmit(e) {
  e.preventDefault();
  const identifier = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const errorMsg = document.getElementById('authErrorMessage');

  errorMsg.style.display = 'none';

  if (AppState.backendOnline) {
    try {
      const res = await fetch(`${AppState.apiBaseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: identifier, password })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        AppState.currentUser = typeof CineAuth !== 'undefined' ? CineAuth.setSession(data.user) : data.user;
        initAuthUI();
        closeAuthModal();
        showToast(`Bem-vindo de volta, ${data.user.name}! 🍿`);
        return;
      } else if (res.status === 401 || (data && data.error)) {
        errorMsg.textContent = data.error || 'Usuário ou senha incorretos.';
        errorMsg.style.display = 'block';
        return;
      }
    } catch (err) {
      console.warn("Erro ao logar na API, verificando registro local:", err);
    }
  }

  // Contas deste navegador: senha conferida por hash (js/auth.js)
  if (typeof CineAuth === 'undefined') return;
  await CineAuth.ready;
  const result = await CineAuth.login(identifier, password);
  if (!result.ok) {
    errorMsg.textContent = result.error;
    errorMsg.style.display = 'block';
    return;
  }
  const sessionUser = CineAuth.setSession(result.user);
  AppState.currentUser = sessionUser;
  initAuthUI();
  closeAuthModal();
  showToast(`Logado como ${sessionUser.name}! 🍿`);
}

async function handleRegisterSubmit(e) {
  e.preventDefault();
  const name = document.getElementById('regName').value.trim();
  const email = document.getElementById('regEmail').value.trim();
  const password = document.getElementById('regPassword').value;
  const errorMsg = document.getElementById('authErrorMessage');

  errorMsg.style.display = 'none';

  if (typeof CineAuth === 'undefined') return;
  await CineAuth.ready;
  const created = await CineAuth.register({
    name,
    email,
    password,
    avatar: AppState.selectedAvatar || '🍿'
  });
  if (!created.ok) {
    errorMsg.textContent = created.error;
    errorMsg.style.display = 'block';
    return;
  }
  const newUser = created.user;

  if (AppState.backendOnline) {
    try {
      const res = await fetch(`${AppState.apiBaseUrl}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          email,
          password,
          avatar: AppState.selectedAvatar
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        AppState.currentUser = typeof CineAuth !== 'undefined' ? CineAuth.setSession(data.user) : data.user;
        initAuthUI();
        closeAuthModal();
        showToast(`Conta criada com sucesso! Bem-vindo, ${name}! 🎉`);
        return;
      }
    } catch (err) {
      console.warn("Erro ao registrar na API, salvo localmente:", err);
    }
  }

  const sessionUser = CineAuth.setSession(newUser);
  AppState.currentUser = sessionUser;
  initAuthUI();
  closeAuthModal();
  showToast(`Cadastro realizado com sucesso! 🎉`);
}

function handleLogout() {
  AppState.currentUser = null;
  localStorage.removeItem('cinebook_user');
  initAuthUI();
  showToast('Você saiu da sua conta.');
}

// ==========================================
// 4. COMUNICAÇÃO COM O BACKEND PYTHON
// ==========================================
async function checkBackendStatus() {
  const badge = document.getElementById('backendBadge');
  // O backend Python só é usado quando é ele que está servindo o site
  // (localhost:8000). Publicado (Netlify), o site não tenta falar com
  // "localhost" do visitante — nem com dados de login, nem com nada.
  if (AppState.apiBaseUrl !== window.location.origin) {
    AppState.backendOnline = false;
    if (badge) badge.style.display = 'none';
    return;
  }
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1200);

    const response = await fetch(`${AppState.apiBaseUrl}/api/health`, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (response.ok) {
      AppState.backendOnline = true;
      if (badge) {
        badge.className = 'backend-badge';
        badge.innerHTML = `<span>🟢</span> Backend Python (SQLite) Conectado`;
      }
      await fetchMediaFromBackend();
      return;
    }
  } catch (err) { }

  AppState.backendOnline = false;
  if (badge) {
    badge.className = 'backend-badge offline';
    badge.innerHTML = `<span>🟠</span> Modo Local (Python Offline)`;
  }
}

async function fetchMediaFromBackend() {
  try {
    const response = await fetch(`${AppState.apiBaseUrl}/api/media`);
    if (response.ok) {
      const data = await response.json();
      if (Array.isArray(data) && data.length > 0) {
        AppState.mediaList = data;
      }
    }
  } catch (e) {
    console.warn("Usando catálogo local de fallback:", e);
  }
}

// ==========================================
// 5. RENDERIZAÇÃO DO HERO BANNER & GÊNEROS
// ==========================================
// 5. CARROSSEL DE DESTAQUES INTERATIVO (HERO CAROUSEL)
// ==========================================
const HeroCarousel = {
  items: [],
  currentIndex: 0,
  timer: null,
  autoRotateInterval: 4000,
  eventsBound: false,

  init() {
    this.bindEvents();
    this.updateItems();
    if (this.items.length > 0) {
      this.renderDashes();
      this.renderCurrentSlide();
      this.startAutoRotate();
    }
  },

  updateItems() {
    const section = document.getElementById('heroCarouselSection');

    // Se estiver na aba de Pessoas, oculta o carrossel de obras
    if (AppState.activeTab === 'people') {
      if (section) section.style.display = 'none';
      this.items = [];
      this.stopAutoRotate();
      return;
    }

    if (section) section.style.display = 'block';

    let pool = [...AppState.mediaList];

    // Filtra o carrossel estritamente pelo tipo da aba ativa
    if (AppState.activeTab === 'movie') {
      pool = pool.filter(m => m.type === 'movie');
    } else if (AppState.activeTab === 'series') {
      pool = pool.filter(m => m.type === 'series');
    } else if (AppState.activeTab === 'book') {
      pool = pool.filter(m => m.type === 'book');
    } else if (AppState.activeTab === 'watchlist') {
      pool = pool.filter(m => AppState.watchlist[m.id]);
    }

    // Filtra EXCLUSIVAMENTE os filmes e produções de 2026 mais populares e em alta
    let pool2026 = pool.filter(isCatalogHighlight);

    // Se na aba ativa (ex: livros) houver poucos itens de 2026, complementa com os lançamentos mais recentes
    if (pool2026.length < 3) {
      const recentPool = [...pool]
        .filter(m => !pool2026.some(p => p.id === m.id) && m.poster)
        .sort((a, b) => (Number(b.year || 0) - Number(a.year || 0)) || ((b.rating || 0) - (a.rating || 0)));
      pool2026 = [...pool2026, ...recentPool];
    }

    // Ordena rigorosamente pelos Destaques (featured) e Maior Avaliação (Em alta)
    this.items = pool2026
      .filter(m => m.poster)
      .sort((a, b) => {
        if (a.featured && !b.featured) return -1;
        if (!a.featured && b.featured) return 1;
        return (b.rating || 0) - (a.rating || 0);
      })
      .slice(0, 14);

    if (this.items.length === 0 && pool.length > 0) {
      this.items = pool.slice(0, 14);
    }

    if (this.currentIndex >= this.items.length) {
      this.currentIndex = 0;
    }
  },

  bindEvents() {
    if (this.eventsBound) return;
    this.eventsBound = true;

    const prevBtn = document.getElementById('heroPrevBtn');
    const nextBtn = document.getElementById('heroNextBtn');
    const section = document.getElementById('heroCarouselSection');

    if (prevBtn) {
      prevBtn.onclick = (e) => {
        e.preventDefault();
        this.prev();
        this.resetTimer();
      };
    }

    if (nextBtn) {
      nextBtn.onclick = (e) => {
        e.preventDefault();
        this.next();
        this.resetTimer();
      };
    }

    // Suporte a gestos Swipe Touch e Drag
    let touchStartX = 0;
    if (section) {
      section.addEventListener('touchstart', (e) => {
        touchStartX = e.changedTouches[0].screenX;
      }, { passive: true });

      section.addEventListener('touchend', (e) => {
        const touchEndX = e.changedTouches[0].screenX;
        const diff = touchEndX - touchStartX;
        if (Math.abs(diff) > 40) {
          if (diff < 0) {
            this.next();
          } else {
            this.prev();
          }
          this.resetTimer();
        }
      }, { passive: true });
    }
  },

  /**
   * Troca de slide. Com direção ('next' | 'prev') o slide atual desliza para
   * fora de um lado e o novo entra pelo outro; sem direção (troca de idioma,
   * lista atualizada) só atualiza o conteúdo, sem animação.
   */
  renderCurrentSlide(direction) {
    const slideMain = document.getElementById('heroSlideMain');
    const backdrop = document.getElementById('heroCarouselBackdrop');
    const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Cada troca ganha um número; se o usuário clicar de novo no meio da
    // animação, a troca antiga é abandonada e só a mais recente termina.
    const token = (this._slideToken = (this._slideToken || 0) + 1);
    this.renderDashes(); // o tracinho ativo acompanha o clique na hora

    // "Reduzir movimento" ligado no sistema (comum no Windows com efeitos de
    // animação desligados): continua deslizando, só que curto e mais rápido.
    if (slideMain) slideMain.classList.toggle('gentle', !!reduceMotion);

    if (!direction || !slideMain || !this._hasRendered) {
      if (slideMain) slideMain.classList.remove('slide-out-left', 'slide-out-right', 'slide-in-left', 'slide-in-right');
      if (backdrop) backdrop.classList.remove('backdrop-dim');
      this.fillSlide();
      this._hasRendered = true;
      this.preloadNeighbors();
      return;
    }

    const outClass = direction === 'next' ? 'slide-out-left' : 'slide-out-right';
    const inClass = direction === 'next' ? 'slide-in-right' : 'slide-in-left';

    slideMain.classList.remove('slide-out-left', 'slide-out-right', 'slide-in-left', 'slide-in-right');
    // força o navegador a registrar o estado atual antes de animar
    void slideMain.offsetWidth;
    slideMain.classList.add(outClass);
    if (backdrop) backdrop.classList.add('backdrop-dim');

    setTimeout(() => {
      if (token !== this._slideToken) return;
      this.fillSlide();

      // Posiciona o novo slide do outro lado, sem transição...
      slideMain.classList.add('no-transition');
      slideMain.classList.remove(outClass);
      slideMain.classList.add(inClass);
      void slideMain.offsetWidth;
      // ...e desliza até o centro.
      slideMain.classList.remove('no-transition');
      slideMain.classList.remove(inClass);
      if (backdrop) backdrop.classList.remove('backdrop-dim');
      this.preloadNeighbors();
    }, reduceMotion ? 180 : 300);
  },

  /** Baixa os pôsteres vizinhos antes, para não "piscar" ao entrar. */
  preloadNeighbors() {
    if (!this.items || this.items.length < 2) return;
    const n = this.items.length;
    [this.items[(this.currentIndex + 1) % n], this.items[(this.currentIndex - 1 + n) % n]].forEach(it => {
      if (it && it.poster) { const img = new Image(); img.src = it.poster; }
    });
  },

  fillSlide() {
    if (!this.items || this.items.length === 0) return;
    if (this.currentIndex >= this.items.length) this.currentIndex = 0;
    const item = this.items[this.currentIndex];
    if (!item) return;

    const currentL = localStorage.getItem('cinebook_lang') || 'pt';

    const slideMain = document.getElementById('heroSlideMain');
    const backdrop = document.getElementById('heroCarouselBackdrop');
    const posterImg = document.getElementById('heroPosterImg');
    const categoryTag = document.getElementById('heroCategoryTag');
    const mainTitle = document.getElementById('heroMainTitle');
    const yearVal = document.getElementById('heroYearVal');
    const durationVal = document.getElementById('heroDurationVal');
    const genreVal = document.getElementById('heroGenreVal');
    const publicScore = document.getElementById('heroPublicScore');
    const publicBar = document.getElementById('heroPublicBar');
    const criticScore = document.getElementById('heroCriticScore');
    const criticBar = document.getElementById('heroCriticBar');
    const descriptionText = document.getElementById('heroDescriptionText');
    const detailsBtn = document.getElementById('heroDetailsBtn');
    const saveBtn = document.getElementById('heroWatchlistBtn');
    const posterFrame = document.getElementById('heroPosterFrame');

    // Backdrop & Pôster
    if (backdrop) backdrop.style.backgroundImage = `url('${item.backdrop || item.poster || ''}')`;
    const displayTitle = typeof getMediaTitle === 'function' ? getMediaTitle(item, currentL) : (item.title || 'Título');
    const displaySynopsis = typeof getMediaSynopsis === 'function' ? getMediaSynopsis(item, currentL) : (item.synopsis || item.tagline);

    if (posterImg) {
      posterImg.onerror = () => {
        posterImg.src = item.type === 'book'
          ? 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=500&q=80'
          : 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?auto=format&fit=crop&w=500&q=80';
      };
      posterImg.src = item.poster || 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?auto=format&fit=crop&w=500&q=80';
      posterImg.alt = displayTitle;
    }
    if (posterFrame) posterFrame.onclick = () => {
      window.location.href = `detalhes.html?id=${encodeURIComponent(item.id)}`;
    };

    // Textos & Categoria Localizada
    const typeKey = item.type === 'movie' ? 'nav_movies' : (item.type === 'series' ? 'nav_series' : 'nav_books');
    const rawType = typeof t === 'function' ? (t(typeKey) || 'Filme') : (item.type === 'movie' ? 'Filme' : (item.type === 'series' ? 'Série' : 'Livro'));
    const cleanType = String(rawType).replace(/^[^\w\s\u00C0-\u017F\u0400-\u04FF\u4E00-\u9FFF\u0900-\u097F\u0600-\u06FF\u0980-\u09FF]+/g, '').trim().toUpperCase();
    if (categoryTag) categoryTag.textContent = `— ${cleanType}`;

    if (mainTitle) mainTitle.textContent = displayTitle;
    if (yearVal) yearVal.textContent = item.year || 2024;

    // Duração / Páginas Localizadas
    let durationFormatted = item.duration || (item.type === 'movie' ? '120 min' : (item.type === 'series' ? '1 Temporada' : '350 páginas'));
    if (item.type === 'book' && item.duration) {
      const pageCount = String(item.duration).replace(/\D/g, '');
      if (pageCount) {
        const pagesMap = {
          en: 'pages', pt: 'páginas', es: 'páginas', fr: 'pages',
          zh: '页', hi: 'पृष्ठ', ar: 'صفحة', bn: 'পৃষ্ঠা',
          ru: 'страниц', ur: 'صفحات', id: 'halaman'
        };
        durationFormatted = `${pageCount} ${pagesMap[currentL] || 'páginas'}`;
      }
    }
    if (durationVal) durationVal.textContent = durationFormatted;

    // Gêneros Localizados
    const translatedGenres = (Array.isArray(item.genres) ? item.genres : []).map(g => {
      if (typeof g !== 'string') return '';
      const found = GENRES_CONFIG.find(c => c.match && c.match.some(m => m.toLowerCase() === g.toLowerCase()));
      return found ? (found[currentL] || found.pt || g) : g;
    }).filter(Boolean);
    if (genreVal) genreVal.textContent = (translatedGenres.length > 0 ? translatedGenres : ['Cinema']).slice(0, 2).join(', ');

    // Avaliações de 0 a 10 — obra não lançada (ou sem nenhum voto) não tem
    // nota: as barras ficam vazias e o texto diz isso, em vez de um 8,5 inventado.
    const ratingNum = typeof item.rating === 'number' ? item.rating : 0;
    if (item.notReleasedYet || !ratingNum) {
      const noScoreTxt = item.notReleasedYet
        ? ((typeof t === 'function' && t('status_coming_soon') !== 'status_coming_soon') ? t('status_coming_soon') : 'Em breve')
        : '—';
      if (publicScore) publicScore.textContent = noScoreTxt;
      if (publicBar) publicBar.style.width = '0%';
      if (criticScore) criticScore.textContent = noScoreTxt;
      if (criticBar) criticBar.style.width = '0%';
    } else {
      const pubScoreNum = (ratingNum / 10).toFixed(1).replace('.', ',');
      const critScoreNum = Math.min((ratingNum + 3) / 10, 10).toFixed(1).replace('.', ',');
      if (publicScore) publicScore.textContent = `${pubScoreNum}/10`;
      if (publicBar) publicBar.style.width = `${ratingNum}%`;
      if (criticScore) criticScore.textContent = `${critScoreNum}/10`;
      if (criticBar) criticBar.style.width = `${Math.min(ratingNum + 3, 100)}%`;
    }

    if (descriptionText) descriptionText.textContent = displaySynopsis || item.tagline || (typeof t === 'function' ? t('hero_subtitle') : 'Acompanhe esta produção aclamada no catálogo CineBook.');

    // Botão de Detalhes
    if (detailsBtn) {
      detailsBtn.textContent = typeof t === 'function' ? (t('hero_btn_details') || 'Ver detalhes') : 'Ver detalhes';
      detailsBtn.onclick = () => {
        window.location.href = `detalhes.html?id=${encodeURIComponent(item.id)}`;
      };
    }

    // Botão de Salvar
    if (saveBtn) {
      const isSaved = !!AppState.watchlist[item.id];
      const saveText = isSaved
        ? (typeof t === 'function' ? t('btn_saved_watchlist') || 'Salvo na Lista' : 'Salvo na Lista')
        : (typeof t === 'function' ? t('btn_save_watchlist') || 'Salvar na Lista' : 'Salvar na Lista');
      saveBtn.innerHTML = `<span>${isSaved ? '⭐' : '➕'}</span> ${saveText}`;
      saveBtn.onclick = () => {
        toggleWatchlist(item.id, 'favorite');
        const updated = !!AppState.watchlist[item.id];
        const updatedText = updated
          ? (typeof t === 'function' ? t('btn_saved_watchlist') || 'Salvo na Lista' : 'Salvo na Lista')
          : (typeof t === 'function' ? t('btn_save_watchlist') || 'Salvar na Lista' : 'Salvar na Lista');
        saveBtn.innerHTML = `<span>${updated ? '⭐' : '➕'}</span> ${updatedText}`;
      };
    }

    this.renderDashes();
  },

  renderDashes() {
    const container = document.getElementById('heroDashIndicators');
    if (!container) return;

    const currentL = localStorage.getItem('cinebook_lang') || 'pt';
    container.innerHTML = '';
    this.items.forEach((it, idx) => {
      const dash = document.createElement('div');
      dash.className = `carousel-dash-item ${idx === this.currentIndex ? 'active' : ''}`;
      dash.title = typeof getMediaTitle === 'function' ? getMediaTitle(it, currentL) : (it.title || `Destaque ${idx + 1}`);
      dash.onclick = () => {
        this.goTo(idx);
        this.resetTimer();
      };
      container.appendChild(dash);
    });
  },

  next() {
    if (!this.items || this.items.length === 0) return;
    this.currentIndex = (this.currentIndex + 1) % this.items.length;
    this.renderCurrentSlide('next');
  },

  prev() {
    if (!this.items || this.items.length === 0) return;
    this.currentIndex = (this.currentIndex - 1 + this.items.length) % this.items.length;
    this.renderCurrentSlide('prev');
  },

  goTo(idx) {
    if (!this.items || this.items.length === 0) return;
    if (idx >= 0 && idx < this.items.length && idx !== this.currentIndex) {
      const direction = idx > this.currentIndex ? 'next' : 'prev';
      this.currentIndex = idx;
      this.renderCurrentSlide(direction);
    }
  },

  startAutoRotate() {
    this.stopAutoRotate();
    if (!this.items || this.items.length <= 1) return;
    this.timer = setInterval(() => {
      this.next();
    }, this.autoRotateInterval);
  },

  stopAutoRotate() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  },

  resetTimer() {
    this.stopAutoRotate();
    this.startAutoRotate();
  }
};

function initHeroBanner() {
  HeroCarousel.init();
}

const GENRES_CONFIG = [
  { key: 'all', pt: 'Todos', en: 'All', es: 'Todos', fr: 'Tous', zh: '全部', hi: 'सभी', ar: 'الكل', bn: 'সব', ru: 'Все', ur: 'تمام', id: 'Semua' },
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

function initGenrePills() {
  const container = document.getElementById('genrePillsBar');
  if (!container) return;
  container.innerHTML = '';

  const currentL = localStorage.getItem('cinebook_lang') || 'pt';

  GENRES_CONFIG.forEach((genreObj) => {
    const label = genreObj[currentL] || genreObj.pt || genreObj.en;
    const isAll = genreObj.key === 'all';
    const isActive = (AppState.selectedGenreKey || 'all') === genreObj.key;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `genre-pill ${isActive ? 'active' : ''}`;
    btn.setAttribute('data-genre', genreObj.key);
    btn.setAttribute('role', 'tab');
    btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
    btn.innerHTML = `<span class="genre-pill-label">${label}</span>`;

    btn.addEventListener('click', () => {
      AppState.selectedGenreKey = genreObj.key;
      AppState.selectedGenre = isAll ? 'Todos os Gêneros' : (genreObj[currentL] || genreObj.pt);
      document.querySelectorAll('.genre-pill').forEach(el => {
        const isCurrent = el === btn;
        el.classList.toggle('active', isCurrent);
        el.setAttribute('aria-selected', isCurrent ? 'true' : 'false');
      });
      btn.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
      renderUserRecommendationsBanner();
      renderGrid();
    });
    container.appendChild(btn);
  });

  // Configuração das setas de scroll suave
  const btnLeft = document.getElementById('genreScrollLeft');
  const btnRight = document.getElementById('genreScrollRight');

  if (btnLeft && !btnLeft.dataset.bound) {
    btnLeft.dataset.bound = 'true';
    btnLeft.addEventListener('click', () => {
      container.scrollBy({ left: -280, behavior: 'smooth' });
    });
  }

  if (btnRight && !btnRight.dataset.bound) {
    btnRight.dataset.bound = 'true';
    btnRight.addEventListener('click', () => {
      container.scrollBy({ left: 280, behavior: 'smooth' });
    });
  }
}

// ==========================================
// 6. FILTRAGEM E ORDENAÇÃO
// ==========================================
function getLocalPeople() {
  const peopleMap = new Map();

  if (typeof MEDIA_DATABASE !== 'undefined') {
    MEDIA_DATABASE.forEach(item => {
      // 1. Diretores / Autores
      if (item.director && item.director.trim() && !item.director.includes('TMDb')) {
        const dName = item.director.trim();
        const isBook = item.type === 'book';
        if (!peopleMap.has(dName)) {
          peopleMap.set(dName, {
            id: `local_person_${dName.replace(/\s+/g, '_').toLowerCase()}`,
            personId: dName,
            type: 'person',
            name: dName,
            role: isBook ? 'Autor(a)' : 'Diretor(a)',
            popularity: 88,
            photo: isBook
              ? 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&w=400&q=80'
              : 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=400&q=80',
            knownFor: [item.title]
          });
        } else {
          const p = peopleMap.get(dName);
          if (!p.knownFor.includes(item.title)) {
            p.knownFor.push(item.title);
          }
        }
      }

      // 2. Elenco
      if (item.cast && Array.isArray(item.cast)) {
        item.cast.forEach(actor => {
          if (actor.name && actor.name.trim()) {
            const aName = actor.name.trim();
            if (!peopleMap.has(aName)) {
              peopleMap.set(aName, {
                id: `local_person_${aName.replace(/\s+/g, '_').toLowerCase()}`,
                personId: aName,
                type: 'person',
                name: aName,
                role: 'Atuação',
                popularity: 85,
                photo: actor.photo || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80',
                knownFor: [item.title]
              });
            } else {
              const p = peopleMap.get(aName);
              if (!p.knownFor.includes(item.title)) {
                p.knownFor.push(item.title);
              }
              if (actor.photo && (!p.photo || p.photo.includes('unsplash'))) {
                p.photo = actor.photo;
              }
            }
          }
        });
      }
    });
  }

  return Array.from(peopleMap.values());
}

function getFilteredPeople() {
  let list = [...AppState.peopleList];
  if (list.length === 0) {
    list = getLocalPeople();
  }

  const query = (AppState.peopleSearchQuery || '').trim().toLowerCase();
  if (query !== '') {
    list = list.filter(p => {
      const matchName = p.name && p.name.toLowerCase().includes(query);
      const matchRole = p.role && p.role.toLowerCase().includes(query);
      const matchWorks = p.knownFor && p.knownFor.some(k => typeof k === 'string' && k.toLowerCase().includes(query));
      return matchName || matchRole || matchWorks;
    });
  }

  switch (AppState.peopleSortBy || 'popularity') {
    case 'name-asc':
      list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      break;
    case 'name-desc':
      list.sort((a, b) => (b.name || '').localeCompare(a.name || ''));
      break;
    case 'popularity':
    default:
      list.sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
      break;
  }

  return list;
}

/**
 * Itens do "catálogo 2026": tudo o que está cadastrado localmente (curadoria,
 * que agora tem o ano real de estreia — 2025, 2027...) mais o que vem da TMDB
 * com ano de 2026 em diante.
 */
function isCatalogHighlight(m) {
  if (typeof MEDIA_DATABASE !== 'undefined' && MEDIA_DATABASE.some(local => local.id === m.id)) return true;
  return Number(m.year) >= 2026;
}

/** Minúsculas e sem acento: "Ação" e "acao" passam a bater na busca. */
function normalizeSearchText(txt) {
  return String(txt || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

function getFilteredMedia() {
  let list = [...AppState.mediaList];
  const isSearching = AppState.searchQuery.trim() !== '';

  if (AppState.activeTab === 'movie') {
    // Sem busca: vitrine de lançamentos. Com busca: QUALQUER filme — antes a
    // aba Filmes jogava fora todo resultado da TMDB que não fosse de 2026,
    // então pesquisar "Interestelar" ou "Titanic" não mostrava nada.
    list = list.filter(item => item.type === 'movie' && (isSearching || isCatalogHighlight(item)));
  } else if (AppState.activeTab === 'series') {
    list = list.filter(item => item.type === 'series');
  } else if (AppState.activeTab === 'book') {
    list = list.filter(item => item.type === 'book');
  } else if (AppState.activeTab === 'watchlist') {
    const watchlistIds = Object.keys(AppState.watchlist || {});
    const watchlistItems = [];

    watchlistIds.forEach(id => {
      const val = AppState.watchlist[id];
      let item = AppState.mediaList.find(m => m.id === id || String(m.tmdbId) === String(id));
      if (!item && typeof MEDIA_DATABASE !== 'undefined') {
        item = MEDIA_DATABASE.find(m => m.id === id || String(m.tmdbId) === String(id));
      }
      if (!item && typeof val === 'object' && val.title) {
        item = { ...val };
      }
      if (item) {
        const status = typeof val === 'object' ? (val.status || 'plan') : (typeof val === 'string' ? val : 'plan');
        const normStatus = (status === 'current' || status === 'watching') ? 'watching' : (status === 'read' || status === 'completed' ? 'completed' : status);
        if (AppState.watchlistSubFilter === 'all' || normStatus === AppState.watchlistSubFilter || status === AppState.watchlistSubFilter) {
          watchlistItems.push(item);
        }
      }
    });

    list = watchlistItems;
  }

  if (isSearching) {
    const query = normalizeSearchText(AppState.searchQuery);
    list = list.filter(item => {
      // Resultado que veio da própria busca da TMDB para este termo já é
      // relevante (ela acha por título alternativo, título em outro idioma
      // etc.), mesmo que o texto não apareça literalmente no título em pt-BR.
      if (item._searchQuery && normalizeSearchText(item._searchQuery) === query) return true;
      const localTitle = typeof getMediaTitle === 'function' ? getMediaTitle(item) : '';
      const matchTitle = [item.title, item.originalTitle, localTitle].some(txt => normalizeSearchText(txt).includes(query));
      const matchDirector = normalizeSearchText(item.director).includes(query);
      const matchGenres = (item.genres || []).some(g => normalizeSearchText(g).includes(query));
      return matchTitle || matchDirector || matchGenres;
    });
  }

  // Filtro de Gênero Dinâmico Multilíngue
  if (AppState.selectedGenreKey && AppState.selectedGenreKey !== 'all') {
    const targetGenreObj = GENRES_CONFIG.find(g => g.key === AppState.selectedGenreKey);
    if (targetGenreObj && targetGenreObj.match) {
      list = list.filter(item => {
        if (!item.genres || item.genres.length === 0) return false;
        return item.genres.some(g => targetGenreObj.match.some(m => m.toLowerCase() === g.toLowerCase()));
      });
    }
  }

  switch (AppState.sortBy) {
    case 'rating-desc':
      list.sort((a, b) => b.rating - a.rating);
      break;
    case 'year-desc':
      list.sort((a, b) => b.year - a.year);
      break;
    case 'title-asc':
      list.sort((a, b) => a.title.localeCompare(b.title));
      break;
    case 'popularity':
    default:
      list.sort((a, b) => (b.rating * 1.5) - (a.rating * 1.5));
      break;
  }

  return list;
}

// ==========================================
// 7. RENDERIZAÇÃO DO GRID E CARDS TMDB
// ==========================================
function renderGrid() {
  const grid = document.getElementById('mediaGrid');
  const resultsCount = document.getElementById('resultsCount');
  const sectionTitle = document.getElementById('sectionTitle');
  const watchlistSubFilters = document.getElementById('watchlistSubFilters');
  const genrePillsSection = document.getElementById('genrePillsSection');
  const genrePillsBar = document.getElementById('genrePillsBar');
  const mediaSearchSection = document.getElementById('mediaSearchSection');
  const peopleSearchSection = document.getElementById('peopleSearchSection');

  if (mediaSearchSection) {
    mediaSearchSection.style.display = AppState.activeTab === 'people' ? 'none' : 'block';
  }
  if (peopleSearchSection) {
    peopleSearchSection.style.display = AppState.activeTab === 'people' ? 'block' : 'none';
  }

  // Oculta completamente a barra de categorias e setas na aba Pessoas
  if (genrePillsSection) {
    genrePillsSection.style.display = AppState.activeTab === 'people' ? 'none' : 'block';
  } else if (genrePillsBar) {
    genrePillsBar.style.display = AppState.activeTab === 'people' ? 'none' : 'flex';
  }

  const titlesMap = {
    all: typeof t === 'function' ? t('section_all') : 'Explorar Catálogo Completo',
    movie: typeof t === 'function' ? t('section_movies') : 'Filmes Populares',
    series: typeof t === 'function' ? t('section_series') : 'Séries em Destaque',
    book: typeof t === 'function' ? t('section_books') : 'Livros & Obras Recomendadas',
    people: typeof t === 'function' ? t('section_people') : 'Pessoas Populares',
    watchlist: typeof t === 'function' ? t('section_watchlist') : 'Minha Biblioteca Pessoal'
  };
  if (sectionTitle) {
    sectionTitle.textContent = titlesMap[AppState.activeTab] || 'Catálogo';
  }

  // Configura grid específico de 5 colunas para Pessoas Populares
  if (grid) {
    grid.className = AppState.activeTab === 'people' ? 'media-grid people-grid' : 'media-grid';
  }

  if (watchlistSubFilters) watchlistSubFilters.style.display = AppState.activeTab === 'watchlist' ? 'flex' : 'none';

  // RENDERIZAÇÃO ESPECIAL PARA A ABA PESSOAS (ESTILO OFICIAL TMDB)
  if (AppState.activeTab === 'people') {
    const people = getFilteredPeople();
    const countLabel = people.length === 1
      ? (typeof t === 'function' ? t('items_count_single') : 'artista encontrado')
      : (typeof t === 'function' ? t('items_count_multi') : 'artistas encontrados');
    resultsCount.textContent = `${people.length} ${countLabel}`;

    grid.innerHTML = '';

    if (people.length === 0) {
      grid.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">👤</div>
          <h3 class="empty-title">${typeof t === 'function' ? t('empty_results') : 'Nenhum resultado encontrado'}</h3>
          <p class="empty-desc">${typeof t === 'function' ? t('empty_people_desc') : 'Tente pesquisar por outro nome de ator, diretor ou autor.'}</p>
        </div>
      `;
      return;
    }

    people.forEach(person => {
      const card = document.createElement('article');
      card.className = 'person-card';
      card.setAttribute('tabindex', '0');
      card.setAttribute('aria-label', `${person.name}`);

      const formattedWorks = person.knownForFormatted || (person.knownFor || []).join(', ');

      card.innerHTML = `
        <div class="person-photo-wrapper">
          <img 
            src="${person.photo}" 
            alt="Foto de ${person.name}" 
            class="person-photo-img"
            loading="lazy"
            onerror="this.onerror=null; this.src='https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=500&q=80';"
          />
        </div>
        <div class="person-card-body">
          <h3 class="person-card-name">${person.name}</h3>
          <div class="person-known-for-text" title="${(person.knownFor || []).join(', ')}">
            ${formattedWorks || 'Obras em destaque'}
          </div>
        </div>
      `;

      card.addEventListener('click', () => {
        openPersonModal(person.personId || person.id);
      });

      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          card.click();
        }
      });

      grid.appendChild(card);
    });

    const loadMoreContainer = document.getElementById('loadMoreContainer');
    if (loadMoreContainer) {
      loadMoreContainer.style.display = (AppState.searchQuery.trim().length === 0 && people.length > 0) ? 'flex' : 'none';
    }
    return;
  }

  // RENDERIZAÇÃO PADRÃO DE FILMES, SÉRIES E LIVROS
  const items = getFilteredMedia();
  const countLabel = items.length === 1
    ? (typeof t === 'function' ? t('items_count_single') : 'item encontrado')
    : (typeof t === 'function' ? t('items_count_multi') : 'itens encontrados');
  resultsCount.textContent = `${items.length} ${countLabel}`;

  grid.innerHTML = '';

  if (items.length === 0) {
    const emptyTitle = typeof t === 'function' ? t('empty_results') : 'Nenhum resultado encontrado';
    const emptyDesc = AppState.activeTab === 'watchlist'
      ? (typeof t === 'function' ? t('empty_watchlist_desc') : 'Você ainda não adicionou nenhum item a esta categoria da sua lista. Explore o catálogo e clique na estrelinha para salvar!')
      : (typeof t === 'function' ? t('empty_results_desc') : 'Tente ajustar sua busca ou selecionar outro gênero nos filtros acima.');

    grid.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">${AppState.activeTab === 'watchlist' ? '📂' : '🔍'}</div>
        <h3 class="empty-title">${emptyTitle}</h3>
        <p class="empty-desc">${emptyDesc}</p>
      </div>
    `;
    return;
  }

  items.forEach(item => {
    const card = document.createElement('article');
    card.className = 'media-card';
    card.setAttribute('tabindex', '0');
    card.setAttribute('aria-label', `${item.title} (${item.year})`);

    const isSaved = !!AppState.watchlist[item.id];
    let typeLabel = 'Filme';
    if (item.type === 'movie') {
      typeLabel = typeof t === 'function' ? (t('nav_movies') || 'Filme') : 'Filme';
    } else if (item.type === 'series') {
      typeLabel = typeof t === 'function' ? (t('nav_series') || 'Série') : 'Série';
    } else if (item.type === 'book') {
      typeLabel = typeof t === 'function' ? (t('nav_books') || 'Livro') : 'Livro';
    }
    typeLabel = String(typeLabel).replace(/^[^\w\s\u00C0-\u017F\u0400-\u04FF\u4E00-\u9FFF\u0900-\u097F\u0600-\u06FF\u0980-\u09FF]+/g, '').trim();

    const scoreColor = item.rating >= 80 ? 'var(--score-high)' : (item.rating >= 60 ? 'var(--score-mid)' : 'var(--score-low)');
    const strokeDash = `${item.rating}, 100`;
    const comingSoonTxt = (typeof t === 'function' && t('status_coming_soon') !== 'status_coming_soon') ? t('status_coming_soon') : 'Em breve';
    const releaseTxt = item.notReleasedYet && typeof formatReleaseDateBR === 'function' ? formatReleaseDateBR(item.releaseDateFull) : '';

    const currentL = localStorage.getItem('cinebook_lang') || 'pt';

    // Tradução dos gêneros do card
    const rawGenres = (item.genres || []).map(g => {
      const found = GENRES_CONFIG.find(c => c.match && c.match.some(m => m.toLowerCase() === g.toLowerCase()));
      return found ? (found[currentL] || found.pt || g) : g;
    });
    const translatedGenres = [...new Set(rawGenres)];
    const genresDisplay = (translatedGenres.length > 0 ? translatedGenres : ['Cinema']).slice(0, 2).join(' • ');

    // Tradução de metadados (Temporadas, Páginas, Tipo)
    let metaRight = item.duration || '';
    if (item.type === 'book') {
      metaRight = item.director || 'Livro';
    } else if (metaRight.includes('Temporada') || metaRight.includes('Temp')) {
      const seasonNum = metaRight.match(/\d+/)?.[0] || '1';
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
      metaRight = seasonMap[currentL] || metaRight;
    } else if (metaRight === 'Série de TV' || item.type === 'series') {
      metaRight = typeof t === 'function' ? (t('nav_series') || 'Série') : 'Série';
    } else if (metaRight === 'Filme' || item.type === 'movie') {
      metaRight = typeof t === 'function' ? (t('nav_movies') || 'Filme') : 'Filme';
    }

    const isRecommended = itemMatchesUserPreferences(item, AppState.currentUser?.preferredCategories);

    card.innerHTML = `
      <div class="poster-wrapper">
        ${isRecommended ? '<span class="recommended-for-you-tag">✨ Recomendado</span>' : ''}
        <span class="poster-type-badge ${item.type}">${typeLabel}</span>
        <button 
          class="btn-quick-save ${isSaved ? 'saved' : ''}" 
          title="${isSaved ? (typeof t === 'function' ? t('btn_saved_watchlist') || 'Salvo' : 'Na sua lista') : (typeof t === 'function' ? t('btn_save_watchlist') || 'Salvar' : 'Adicionar à Minha Lista')}"
          data-save-id="${item.id}"
        >
          ${isSaved ? '⭐' : '＋'}
        </button>
        <img 
          src="${item.poster}" 
          alt="Pôster de ${item.title}" 
          class="poster-img"
          loading="lazy"
          onerror="this.onerror=null; this.src='${item.type === 'book' && typeof generateBookCover === 'function' ? generateBookCover(item.title, item.director) : 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?auto=format&fit=crop&w=500&q=80'}';"
        />

        ${item.notReleasedYet ? `
        <div class="coming-soon-badge" title="${comingSoonTxt}${releaseTxt ? ' • ' + releaseTxt : ''}">
          <span>📅 ${comingSoonTxt}</span>${releaseTxt ? `<small>${releaseTxt}</small>` : ''}
        </div>` : (item.rating ? `
        <div class="score-badge" title="Avaliação: ${item.rating}%">
          <svg viewBox="0 0 36 36">
            <circle class="score-bg" cx="18" cy="18" r="15.5"></circle>
            <circle 
              class="score-progress" 
              cx="18" 
              cy="18" 
              r="15.5" 
              stroke="${scoreColor}" 
              stroke-dasharray="${strokeDash}"
            ></circle>
          </svg>
          <div class="score-text">${item.rating}<sup>%</sup></div>
        </div>` : '')}
      </div>

      <div class="card-content">
        <h3 class="card-title">${typeof getMediaTitle === 'function' ? getMediaTitle(item, currentL) : item.title}</h3>
        <div class="card-meta">${item.year} • ${metaRight}</div>
        <div class="card-genres">${genresDisplay}</div>
      </div>
    `;

    card.addEventListener('click', (e) => {
      if (e.target.closest('.btn-quick-save')) return;
      window.location.href = `detalhes.html?id=${encodeURIComponent(item.id)}`;
    });

    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        window.location.href = `detalhes.html?id=${encodeURIComponent(item.id)}`;
      }
    });

    const saveBtn = card.querySelector('.btn-quick-save');
    saveBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleWatchlist(item.id, 'plan');
      renderGrid();
    });

    grid.appendChild(card);
  });

  // Controle de visibilidade do Botão Carregar Mais
  const loadMoreContainer = document.getElementById('loadMoreContainer');
  if (loadMoreContainer) {
    const isTmdbTab = ['all', 'movie', 'series', 'book'].includes(AppState.activeTab);
    const isSearching = AppState.searchQuery.trim().length > 0;
    loadMoreContainer.style.display = (isTmdbTab && !isSearching && items.length > 0) ? 'flex' : 'none';
    const loadMoreTextEl = document.getElementById('loadMoreText');
    if (loadMoreTextEl && !AppState.isLoadingMore) loadMoreTextEl.textContent = loadMoreLabel();
  }
}

// ==========================================
// 8. MODAIS DE DETALHES RICOS (PESSOAS & OBRAS)
// ==========================================

/**
 * Abre o Modal de Detalhes da Pessoa (Pessoas Populares do TMDb e Autores)
 */
async function openPersonModal(personId) {
  const modal = document.getElementById('personModal');
  if (!modal) return;

  const currentL = localStorage.getItem('cinebook_lang') || 'pt';
  const cleanId = String(personId).replace('person_', '').replace('tmdb_', '').replace('local_person_', '');

  // Encontra nos itens carregados
  let person = AppState.peopleList.find(p => String(p.personId) === cleanId || String(p.id) === String(personId) || String(p.name || '').toLowerCase() === cleanId.replace(/_/g, ' ').toLowerCase());

  const nameEl = document.getElementById('personModalName');
  const depEl = document.getElementById('personModalDepartment');
  const photoEl = document.getElementById('personModalPhoto');
  const heroEl = document.getElementById('personModalHero');
  const birthEl = document.getElementById('personModalBirth');
  const placeEl = document.getElementById('personModalPlace');
  const popEl = document.getElementById('personModalPopularity');
  const bioEl = document.getElementById('personModalBio');
  const creditsGrid = document.getElementById('personModalCreditsGrid');

  // Mapeamento de Departamentos em 11 idiomas
  const departmentTranslations = {
    'Acting': { pt: 'Atuação', en: 'Acting', es: 'Actuación', fr: 'Interprétation', zh: '表演', hi: 'अभिनय', ar: 'تمثيل', bn: 'অভিনয়', ru: 'Актёрское искусство', ur: 'اداکاری', id: 'Akting' },
    'Directing': { pt: 'Direção', en: 'Directing', es: 'Dirección', fr: 'Réalisation', zh: '导演', hi: 'निर्देशन', ar: 'إخراج', bn: 'পরিচালনা', ru: 'Режиссура', ur: 'ہدایت کاری', id: 'Penyutradaraan' },
    'Writing': { pt: 'Roteiro & Escrita', en: 'Writing', es: 'Guion', fr: 'Écriture', zh: '编剧', hi: 'लेखन', ar: 'تأليف', bn: 'চিত্রনাট্য', ru: 'Сценарий', ur: 'تحریر', id: 'Penulisan' },
    'Production': { pt: 'Produção', en: 'Production', es: 'Producción', fr: 'Production', zh: '制片', hi: 'निर्माण', ar: 'إنتاج', bn: 'প্রযোজনা', ru: 'Продюсирование', ur: 'پروڈکشن', id: 'Produksi' },
    'Sound': { pt: 'Trilha Sonora', en: 'Soundtrack', es: 'Banda Sonora', fr: 'Bande Sonore', zh: '配乐', hi: 'संगीत', ar: 'موسيقى تصويرية', bn: 'সঙ্গীত', ru: 'Музыка', ur: 'ساؤنڈ ٹریک', id: 'Musik' },
    'Camera': { pt: 'Fotografia & Câmera', en: 'Cinematography', es: 'Fotografía', fr: 'Photographie', zh: '摄影', hi: 'छायांकन', ar: 'تصوير سينمائي', bn: 'চিত্রগ্রহণ', ru: 'Операторская работа', ur: 'سنیماٹوگرافی', id: 'Sinematografi' },
    'Author': { pt: 'Autor(a)', en: 'Author', es: 'Autor(a)', fr: 'Auteur(e)', zh: '作者', hi: 'लेखक', ar: 'مؤلف', bn: 'লেখক', ru: 'Автор', ur: 'مصنف', id: 'Penulis' },
    'Atuação': { pt: 'Atuação', en: 'Acting', es: 'Actuación', fr: 'Interprétation', zh: '表演', hi: 'अभिनय', ar: 'تمثيل', bn: 'অভিনয়', ru: 'Актёрское искусство', ur: 'اداکاری', id: 'Akting' },
    'Direção': { pt: 'Direção', en: 'Directing', es: 'Dirección', fr: 'Réalisation', zh: '导演', hi: 'निर्देशन', ar: 'إخراج', bn: 'পরিচালনা', ru: 'Режиссура', ur: 'ہدایت کاری', id: 'Penyutradaraan' },
    'Autor(a)': { pt: 'Autor(a)', en: 'Author', es: 'Autor(a)', fr: 'Auteur(e)', zh: '作者', hi: 'लेखक', ar: 'مؤلف', bn: 'লেখক', ru: 'Автор', ur: 'مصنف', id: 'Penulis' }
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

  const defaultRole = person ? (person.role || 'Artista') : 'Artista';
  if (nameEl) nameEl.textContent = person ? person.name : 'Carregando...';
  if (depEl) depEl.textContent = `${getLocalizedDepartment(defaultRole)} • Cinema & TV`;
  if (photoEl) {
    photoEl.src = person ? person.photo : '';
    photoEl.alt = person ? person.name : 'Foto do Artista';
  }
  if (heroEl && person) {
    heroEl.style.backgroundImage = `url('${person.photo}')`;
  }
  if (birthEl) birthEl.textContent = `🎂 ${labelBirth}: —`;
  if (placeEl) placeEl.textContent = '📍 —';
  if (popEl) popEl.textContent = `🔥 ${person ? Math.round(person.popularity || 85) : 85} ${labelPop}`;
  if (bioEl) bioEl.textContent = labelLoadingBio;

  if (creditsGrid) {
    creditsGrid.innerHTML = '<div style="color: #94a3b8; font-size: 0.9rem; padding: 1rem 0;">Buscando filmografia oficial...</div>';
  }

  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');

  let tmdbNumericId = !isNaN(Number(cleanId)) ? Number(cleanId) : null;

  // Se for pessoa local ou sem ID numérico, busca no TMDb pelo nome
  if (!tmdbNumericId && typeof TMDB !== 'undefined' && person && person.name) {
    try {
      const searchRes = await TMDB.searchPeople(person.name);
      if (searchRes && searchRes.length > 0) {
        tmdbNumericId = searchRes[0].personId || searchRes[0].id;
      }
    } catch (e) { }
  }

  if (typeof TMDB !== 'undefined' && tmdbNumericId) {
    try {
      const details = await TMDB.getPersonDetails(tmdbNumericId);
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
              bn: 'এই ভাষায় জীবনী এখনও উপলব্ধ নয়।',
              ru: 'Биография на этом языке пока не добавлена в TMDb.',
              ur: 'اس زبان میں سوانح حیات فی الحال دستیاب نہیں ہے۔',
              id: 'Biografi belum tersedia dalam bahasa ini di TMDb.'
            }[currentL] || 'Biografia não disponível.';
            bioEl.textContent = noBioMsg;
          }
        }

        // Filmografia / Conhecido(a) por
        const castCredits = (details.combined_credits?.cast || []).filter(c => c.poster_path);
        const crewCredits = (details.combined_credits?.crew || []).filter(c => c.poster_path && (c.job === 'Director' || c.job === 'Writer' || c.department === 'Directing'));

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
            creditsGrid.innerHTML = '<div style="color: #94a3b8; font-size: 0.88rem;">Nenhuma obra encontrada na filmografia.</div>';
          } else {
            uniqueCredits.slice(0, 15).forEach(item => {
              const creditCard = document.createElement('div');
              creditCard.className = 'person-credit-card';
              const title = item.displayTitle || item.title || item.name || 'Obra';
              const character = item.character || item.job || (item.detectedMediaType === 'tv' ? 'Série' : 'Filme');
              const posterUrl = `${TMDB_CONFIG.IMAGE_BASE_URL}${item.poster_path}`;

              creditCard.innerHTML = `
                <img src="${posterUrl}" alt="${title}" class="person-credit-poster" loading="lazy" />
                <div class="person-credit-info">
                  <div class="person-credit-title" title="${title}">${title}</div>
                  <div class="person-credit-character" title="${character}">${character}</div>
                </div>
              `;

              creditCard.addEventListener('click', () => {
                closePersonModal();
                const mType = item.detectedMediaType === 'tv' ? 'tv' : 'movie';
                window.location.href = `detalhes.html?id=tmdb_${mType}_${item.id}`;
              });

              creditsGrid.appendChild(creditCard);
            });
          }
        }
      }
    } catch (e) {
      console.warn("Erro ao buscar detalhes da pessoa no TMDb:", e);
    }
  } else if (person && person.knownFor) {
    // Fallback Localizado para autores / pessoas sem registro no TMDb
    const localBioTemplate = {
      pt: `Artista e criador(a) em destaque no catálogo CineBook. Reconhecido(a) mundialmente por suas obras aclamadas: ${(person.knownFor || []).join(', ')}.`,
      en: `Distinguished creator and artist featured in CineBook. Renowned worldwide for acclaimed masterpieces: ${(person.knownFor || []).join(', ')}.`,
      es: `Artista y creador(a) destacado(a) en el catálogo CineBook. Reconocido(a) mundialmente por sus aclamadas obras: ${(person.knownFor || []).join(', ')}.`,
      fr: `Artiste et créateur(trice) d'exception sur CineBook. Mondialement reconnu(e) pour ses chefs-d'œuvre: ${(person.knownFor || []).join(', ')}.`,
      zh: `CineBook 重点收录的杰出创作者与艺术家，凭借知名代表作闻名世界：${(person.knownFor || []).join(', ')}。`,
      hi: `सिनेबुक पर प्रदर्शित प्रतिष्ठित कलाकार एवं रचनाकार। अपनी प्रसिद्ध कृतियों के लिए विश्व प्रसिद्ध: ${(person.knownFor || []).join(', ')}।`,
      ar: `فنان ومبدع بارز في كتالوج CineBook. مشهور عالمياً بأعماله المميزة: ${(person.knownFor || []).join(', ')}.`,
      bn: `সিনেবুকে বিশিষ্ট শিল্পী ও স্রষ্টা। তার প্রশংসিত কাজের জন্য বিশ্বজুড়ে পরিচিত: ${(person.knownFor || []).join(', ')}।`,
      ru: `Выдающийся автор и деятель искусств в каталоге CineBook. Всемирно известен своими произведениями: ${(person.knownFor || []).join(', ')}.`,
      ur: `سائن بک پر نمایاں مصنف اور فنکار۔ اپنے شاہکار کاموں کے لیے عالمی سطح پر معروف: ${(person.knownFor || []).join(', ')}.`,
      id: `Kreator dan seniman terkemuka di katalog CineBook. Terkenal di seluruh dunia atas karya-karya mahakaryanya: ${(person.knownFor || []).join(', ')}.`
    }[currentL] || `Artista e criador(a) em destaque no catálogo CineBook.`;

    if (bioEl) bioEl.textContent = localBioTemplate;
    if (creditsGrid) {
      creditsGrid.innerHTML = '';
      const uniqueWorks = [...new Set(person.knownFor || [])];
      uniqueWorks.forEach(workTitle => {
        const foundMedia = AppState.mediaList.find(m => m.title.toLowerCase() === workTitle.toLowerCase()) ||
                           (typeof MEDIA_DATABASE !== 'undefined' ? MEDIA_DATABASE.find(m => m.title.toLowerCase() === workTitle.toLowerCase()) : null);
        const creditCard = document.createElement('div');
        creditCard.className = 'person-credit-card';
        const posterUrl = foundMedia ? foundMedia.poster : person.photo;

        creditCard.innerHTML = `
          <img src="${posterUrl}" alt="${workTitle}" class="person-credit-poster" loading="lazy" />
          <div class="person-credit-info">
            <div class="person-credit-title" title="${workTitle}">${workTitle}</div>
            <div class="person-credit-character">${getLocalizedDepartment(person.role) || 'Obra em destaque'}</div>
          </div>
        `;

        if (foundMedia) {
          creditCard.addEventListener('click', () => {
            closePersonModal();
            window.location.href = `detalhes.html?id=${encodeURIComponent(foundMedia.id)}`;
          });
        }

        creditsGrid.appendChild(creditCard);
      });
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

// ==========================================
// 8.2 MODAL DE DETALHES DE FILMES, SÉRIES & LIVROS
// ==========================================
async function openModal(mediaId) {
  let item = AppState.mediaList.find(m => m.id === mediaId);

  // Se for uma obra do TMDb que ainda não está na memória
  if (!item && typeof TMDB !== 'undefined') {
    const isTv = String(mediaId).includes('tv') || String(mediaId).startsWith('s');
    item = await TMDB.getDetails(mediaId, isTv ? 'series' : 'movie');
    if (item) AppState.mediaList.push(item);
  }

  if (!item) return;

  // Se for do TMDb e ainda não tiver os detalhes completos (trailer, elenco
  // real, streaming) — ou se ainda não sabemos o status real de lançamento.
  // Esse último caso é o que garante que TODA obra com tmdbId (inclusive as
  // hardcoded localmente com elenco/trailer de exemplo) passe pelo menos uma
  // vez pela TMDB antes de mostrar avaliação, trailer ou "onde assistir" —
  // sem isso, dados de exemplo cadastrados à mão nunca eram corrigidos.
  if (typeof TMDB !== 'undefined' && item.tmdbId && !item._tmdbDetailed) {
    const fullDetails = await TMDB.getDetails(item.tmdbId, item.type);
    if (fullDetails) {
      // Mantém o id local (m_2026_...): é por ele que a lista e as avaliações
      // do usuário ficam salvas. Sem isso o item virava "tmdb_123" no meio do
      // caminho e perdia o vínculo com o que já estava salvo.
      const keepId = item.id;
      Object.assign(item, fullDetails);
      item.id = keepId;
      // A TMDB é a fonte de verdade pra estes três campos: nunca deixa um
      // trailer, streaming ou elenco de exemplo cadastrado à mão sobreviver
      // à checagem só porque a TMDB não confirmou nada (undefined não
      // sobrescreve via Object.assign quando a chave nem existe no objeto).
      item.trailerUrl = fullDetails.trailerUrl || '';
      item.whereToWatch = fullDetails.whereToWatch || [];
    }
  }

  AppState.currentModalMedia = item;
  AppState.selectedReviewStars = 0;

  const modal = document.getElementById('mediaModal');
  const modalHero = document.getElementById('modalHero');
  const modalPoster = document.getElementById('modalPoster');
  const modalTitle = document.getElementById('modalTitle');
  const modalTagline = document.getElementById('modalTagline');
  const modalYear = document.getElementById('modalYear');
  const modalDuration = document.getElementById('modalDuration');
  const modalGenres = document.getElementById('modalGenres');
  const modalSynopsis = document.getElementById('modalSynopsis');
  const modalCastTitle = document.getElementById('modalCastTitle');
  const modalCastGrid = document.getElementById('modalCastGrid');
  const modalProvidersSection = document.getElementById('modalProvidersSection');
  const modalProvidersTitle = document.getElementById('modalProvidersTitle');
  const modalProvidersList = document.getElementById('modalProvidersList');
  const modalTrailerSection = document.getElementById('modalTrailerSection');
  const modalTrailerTitle = document.getElementById('modalTrailerTitle');
  const modalTrailerContainer = document.getElementById('modalTrailerContainer');
  const modalReviewsSection = document.getElementById('modalReviewsSection');
  const modalRemoveWatchlistBtn = document.getElementById('modalRemoveWatchlistBtn');
  const modalBuyTicketBtn = document.getElementById('modalBuyTicketBtn');

  const currentL = localStorage.getItem('cinebook_lang') || 'pt';

  modalHero.style.backgroundImage = `url('${item.backdrop || item.poster}')`;
  modalPoster.src = item.poster;
  modalPoster.alt = item.title;
  modalTitle.textContent = item.title;
  modalTagline.textContent = item.tagline || '';
  modalYear.textContent = item.year;

  // Duração / Páginas / Temporadas Localizadas
  let modalDur = item.duration || '';
  if (item.type === 'book') {
    const pageCount = modalDur.replace(/\D/g, '');
    if (pageCount) {
      const pagesMap = {
        en: 'pages', pt: 'páginas', es: 'páginas', fr: 'pages',
        zh: '页', hi: 'पृष्ठ', ar: 'صفحة', bn: 'পৃষ্ঠা',
        ru: 'страниц', ur: 'صفحات', id: 'halaman'
      };
      modalDur = `${pageCount} ${pagesMap[currentL] || 'páginas'}`;
    }
  } else if (modalDur.includes('Temporada') || modalDur.includes('Temp')) {
    const seasonNum = modalDur.match(/\d+/)?.[0] || '1';
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
    modalDur = seasonMap[currentL] || modalDur;
  }
  modalDuration.textContent = modalDur;

  // Gêneros Traduzidos
  const modalRawGenres = (item.genres || []).map(g => {
    const found = GENRES_CONFIG.find(c => c.match && c.match.some(m => m.toLowerCase() === g.toLowerCase()));
    return found ? (found[currentL] || found.pt || g) : g;
  });
  const modalTranslatedGenres = [...new Set(modalRawGenres)];
  modalGenres.textContent = modalTranslatedGenres.join(', ');
  modalSynopsis.textContent = item.synopsis;

  updateModalStatusButtons(item.id);

  if (AppState.watchlist[item.id]) {
    modalRemoveWatchlistBtn.style.display = 'inline-flex';
    modalRemoveWatchlistBtn.onclick = () => {
      delete AppState.watchlist[item.id];
      saveWatchlistToStorage();
      updateModalStatusButtons(item.id);
      modalRemoveWatchlistBtn.style.display = 'none';
      showToast(`Removido da sua lista.`);
      renderGrid();
    };
  } else {
    modalRemoveWatchlistBtn.style.display = 'none';
  }

  // Comprar Ingresso — só para filmes realmente em cartaz agora (calculado
  // a partir da data de lançamento real da TMDB, nunca por suposição).
  if (modalBuyTicketBtn) {
    if (item.type === 'movie' && item.inTheaters) {
      modalBuyTicketBtn.href = `https://www.ingresso.com/busca/resultado?q=${encodeURIComponent(item.title)}`;
      modalBuyTicketBtn.style.display = 'inline-flex';
    } else {
      modalBuyTicketBtn.style.display = 'none';
    }
  }

  // Onde Assistir / Ler — obra ainda não lançada não tem onde assistir/ler
  // de verdade, então a seção inteira some em vez de mostrar um chute.
  if (item.notReleasedYet) {
    if (modalProvidersSection) modalProvidersSection.style.display = 'none';
  } else {
    if (modalProvidersSection) modalProvidersSection.style.display = '';
    modalProvidersTitle.textContent = item.type === 'book'
      ? (typeof t === 'function' ? `📖 ${t('modal_where_to_watch')}` : '📖 Onde Encontrar / Ler')
      : (typeof t === 'function' ? `📺 ${t('modal_where_to_watch')}` : '📺 Onde Assistir');
    modalProvidersList.innerHTML = '';
    if (item.whereToWatch && item.whereToWatch.length > 0) {
      item.whereToWatch.forEach(prov => {
        const chip = document.createElement('div');
        chip.className = 'provider-chip';
        chip.innerHTML = `<span>${prov.icon}</span> <span>${prov.name}</span> <small style="color: var(--text-muted);">(${prov.type})</small>`;
        modalProvidersList.appendChild(chip);
      });
    } else {
      modalProvidersList.innerHTML = `<span style="color: var(--text-muted);">${typeof t === 'function' ? t('empty_results_desc') : 'Informações de disponibilidade não cadastradas.'}</span>`;
    }
  }

  // Avaliações — obra ainda não lançada não pode ter quem já assistiu/leu,
  // então a seção inteira (avaliações existentes + formulário de nova
  // avaliação) some, em vez de só filtrar a lista.
  if (modalReviewsSection) {
    modalReviewsSection.style.display = item.notReleasedYet ? 'none' : '';
  }

  // Elenco / Autor
  modalCastTitle.textContent = item.type === 'book'
    ? (typeof t === 'function' ? `✍️ ${t('modal_cast')}` : '✍️ Autores & Equipe')
    : (typeof t === 'function' ? `👥 ${t('modal_cast')}` : '👥 Elenco Principal');
  modalCastGrid.innerHTML = '';
  if (item.cast && item.cast.length > 0) {
    item.cast.forEach(person => {
      const card = document.createElement('div');
      card.className = 'cast-card';
      const photoSrc = person.photo && person.photo.trim() !== ''
        ? person.photo
        : 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80';

      card.innerHTML = `
        <img src="${photoSrc}" alt="${person.name}" class="cast-photo" onerror="this.src='https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=200&q=80';"/>
        <div class="cast-name">${person.name}</div>
        <div class="cast-role">${person.role}</div>
      `;
      modalCastGrid.appendChild(card);
    });
  }

  loadRecommendations(item);

  // Trailer / Trecho — filme/série sem trailer real confirmado pela TMDB não
  // mostra a seção (nada de placeholder tipo "Trailer indisponível").
  if (item.type === 'book') {
    if (modalTrailerSection) modalTrailerSection.style.display = '';
    modalTrailerTitle.textContent = typeof t === 'function' ? `📑 ${t('modal_sample')}` : '📑 Trecho de Leitura';
    modalTrailerContainer.innerHTML = `
      <div style="background: rgba(255,255,255,0.04); padding: 1.25rem; border-radius: var(--radius-md); border-left: 3px solid var(--color-book); font-style: italic; color: #cbd5e1; line-height: 1.7;">
        "${item.sampleSnippet || 'Trecho não disponível.'}"
      </div>
    `;
  } else if (item.trailerUrl) {
    if (modalTrailerSection) modalTrailerSection.style.display = '';
    modalTrailerTitle.textContent = '🎬 Trailer Oficial';
    const match = item.trailerUrl.match(/(?:embed\/|v=|vi\/|youtu\.be\/|\/v\/|watch\?v=|\&v=)([^#\&\?]*).*/);
    const videoId = (match && match[1] && match[1].length === 11) ? match[1] : null;
    const directWatchUrl = videoId ? `https://www.youtube.com/watch?v=${videoId}` : item.trailerUrl;
    const backdropUrl = item.backdrop || item.poster || 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?auto=format&fit=crop&w=1200&q=80';

    modalTrailerContainer.innerHTML = `
      <a href="${directWatchUrl}" target="_blank" rel="noopener noreferrer" class="trailer-cinematic-card" style="background-image: url('${backdropUrl}'); aspect-ratio: 16/9; max-height: 320px;" title="Assistir Trailer Oficial no YouTube">
        <div class="trailer-cinematic-overlay"></div>
        <div class="trailer-badge-top">
          <span style="color: #ef4444;">●</span> <span>HD 1080p • Trailer Oficial</span>
        </div>
        <div class="trailer-play-center" style="width: 60px; height: 60px; font-size: 1.6rem;">
          <span>▶</span>
        </div>
        <div class="trailer-info-bottom">
          <div>
            <div class="trailer-bottom-title" style="font-size: 1rem;">${item.title} — Trailer Oficial</div>
            <div class="trailer-bottom-sub">Clique para reproduzir em alta definição no YouTube</div>
          </div>
          <div style="background: rgba(239, 68, 68, 0.9); color: #fff; padding: 0.35rem 0.8rem; border-radius: 8px; font-weight: 700; font-size: 0.78rem;">
            Assistir ↗
          </div>
        </div>
      </a>
    `;
  } else {
    if (modalTrailerSection) modalTrailerSection.style.display = 'none';
    modalTrailerContainer.innerHTML = '';
  }

  resetReviewForm();
  renderReviewsList(item.id);

  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  const modal = document.getElementById('mediaModal');
  const modalTrailerContainer = document.getElementById('modalTrailerContainer');
  modalTrailerContainer.innerHTML = '';
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
  AppState.currentModalMedia = null;
}

async function loadRecommendations(currentItem) {
  const container = document.getElementById('modalRecommendationsGrid');
  container.innerHTML = '<span style="color: var(--text-muted); font-size: 0.85rem;">Calculando recomendações...</span>';

  let recs = [];
  if (AppState.backendOnline) {
    try {
      const res = await fetch(`${AppState.apiBaseUrl}/api/recommendations/${currentItem.id}`);
      if (res.ok) recs = await res.json();
    } catch (e) { }
  }

  if (!recs || recs.length === 0) {
    const currentGenres = new Set(currentItem.genres || []);
    recs = AppState.mediaList
      .filter(m => m.id !== currentItem.id)
      .map(m => {
        const otherGenres = new Set(m.genres || []);
        const intersection = [...currentGenres].filter(g => otherGenres.has(g)).length;
        const union = new Set([...currentGenres, ...otherGenres]).size;
        const jaccard = union > 0 ? intersection / union : 0;
        const bonus = m.type === currentItem.type ? 0.2 : 0;
        return { item: m, score: jaccard + bonus };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map(r => r.item);
  }

  container.innerHTML = '';
  if (recs.length === 0) {
    container.innerHTML = '<span style="color: var(--text-muted);">Nenhuma recomendação similar encontrada.</span>';
    return;
  }

  recs.forEach(rec => {
    const card = document.createElement('div');
    card.className = 'rec-card';
    card.innerHTML = `
      <img src="${rec.backdrop || rec.poster}" alt="${rec.title}" class="rec-poster" onerror="this.src='https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?auto=format&fit=crop&w=500&q=80';"/>
      <div class="rec-info">
        <div class="rec-title">${rec.title}</div>
        <div class="rec-meta">
          <span>${rec.year}</span>
          <span style="color: var(--tmdb-light-green); font-weight: bold;">⭐ ${rec.rating}%</span>
        </div>
      </div>
    `;
    card.addEventListener('click', () => openModal(rec.id));
    container.appendChild(card);
  });
}

function updateModalStatusButtons(mediaId) {
  const item = AppState.watchlist[mediaId];
  const currentStatus = (typeof item === 'object' && item) ? item.status : item;
  document.querySelectorAll('#modalStatusSelector .status-btn').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-status') === currentStatus);
  });
}

// ==========================================
// 9. WATCHLIST & LOCALSTORAGE
// ==========================================
function toggleWatchlist(mediaId, status = 'plan') {
  const item = AppState.mediaList.find(m => m.id === mediaId) || (AppState.currentModalMedia?.id === mediaId ? AppState.currentModalMedia : null);
  const title = item ? item.title : 'Obra';

  if (AppState.watchlist[mediaId]) {
    const currentStatus = AppState.watchlist[mediaId].status || AppState.watchlist[mediaId];
    if (currentStatus === status) {
      delete AppState.watchlist[mediaId];
      showToast(`"${title}" removido da sua estante.`);
    } else {
      AppState.watchlist[mediaId] = {
        id: mediaId,
        status: status,
        title: item ? item.title : (AppState.watchlist[mediaId].title || title),
        originalTitle: item ? (item.originalTitle || item.title) : (AppState.watchlist[mediaId].originalTitle || title),
        year: item ? item.year : (AppState.watchlist[mediaId].year || 2024),
        poster: item ? item.poster : (AppState.watchlist[mediaId].poster || ''),
        backdrop: item ? (item.backdrop || item.poster) : (AppState.watchlist[mediaId].backdrop || ''),
        type: item ? item.type : (AppState.watchlist[mediaId].type || 'movie'),
        rating: item ? (item.rating || 0) : (AppState.watchlist[mediaId].rating || 0),
        addedAt: new Date().toISOString()
      };
      showToast(`"${title}" atualizado para: ${getStatusLabel(status)}`);
    }
  } else {
    AppState.watchlist[mediaId] = {
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
    showToast(`"${title}" adicionado à sua estante! ⭐`);
  }

  saveWatchlistToStorage();
  updateWatchlistCounter();
}

function saveWatchlistToStorage() {
  localStorage.setItem('cinebook_watchlist', JSON.stringify(AppState.watchlist));
  updateWatchlistCounter();
}

function updateWatchlistCounter() {
  const countBadge = document.getElementById('watchlistCount');
  if (countBadge) {
    countBadge.textContent = Object.keys(AppState.watchlist || {}).length;
  }
}

function getStatusLabel(status) {
  const map = { plan: 'Quero Ver/Ler ➕', current: 'Em Andamento ⏳', completed: 'Concluído ✅', favorite: 'Favorito ❤️' };
  return map[status] || status;
}

// ==========================================
// 10. RESENHAS & AVALIAÇÕES COM AUTORIA
// ==========================================
function resetReviewForm() {
  AppState.selectedReviewStars = 0;
  document.querySelectorAll('#modalStarRating .star').forEach(s => s.classList.remove('active'));
  document.getElementById('modalReviewText').value = '';
}

function renderReviewsList(mediaId) {
  const container = document.getElementById('modalReviewsList');
  if (!container || typeof CineReviews === 'undefined') return;
  const item = AppState.currentModalMedia || (typeof MEDIA_DATABASE !== 'undefined' ? MEDIA_DATABASE.find(m => m.id === mediaId) : null) || { id: mediaId };
  // Só avaliações reais (CineBook + usuários do TMDB).
  CineReviews.render(container, item, { compact: true });
}

async function saveCurrentReview() {
  if (!AppState.currentModalMedia) return;
  const mediaId = AppState.currentModalMedia.id;
  const textInput = document.getElementById('modalReviewText');
  const comment = textInput.value.trim();

  if (AppState.selectedReviewStars === 0) {
    showToast('Por favor, selecione uma nota em estrelas!');
    return;
  }

  if (comment === '') {
    showToast('Escreva um breve comentário antes de salvar!');
    return;
  }

  const now = new Date();
  const dateStr = `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;

  const userName = AppState.currentUser ? AppState.currentUser.name : "Usuário Anônimo";
  const userAvatar = AppState.currentUser ? AppState.currentUser.avatar : "🍿";

  if (AppState.backendOnline) {
    try {
      await fetch(`${AppState.apiBaseUrl}/api/reviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mediaId: mediaId,
          userName: userName,
          userAvatar: userAvatar,
          rating: AppState.selectedReviewStars,
          comment: comment,
          date: dateStr
        })
      });
    } catch (e) {
      console.warn("Erro ao salvar no SQLite:", e);
    }
  }

  CineReviews.addUserReview(mediaId, {
    user: userName,
    avatar: userAvatar,
    rating: AppState.selectedReviewStars,
    comment
  });

  showToast('Avaliação registrada com sucesso! ⭐');
  resetReviewForm();
  renderReviewsList(mediaId);
}

// ==========================================
// 11. MODAL DE ESTATÍSTICAS / MÉTRICAS
// ==========================================
async function openStatsModal() {
  const modal = document.getElementById('statsModal');
  let statsData = null;

  if (AppState.backendOnline) {
    try {
      const res = await fetch(`${AppState.apiBaseUrl}/api/stats`);
      if (res.ok) statsData = await res.json();
    } catch (e) { }
  }

  if (!statsData) {
    const totalMedia = AppState.mediaList.length;
    const avgRating = (AppState.mediaList.reduce((acc, m) => acc + m.rating, 0) / (totalMedia || 1)).toFixed(1);
    // Conta as avaliações reais feitas neste navegador (os dois formatos).
    const reviewedIds = new Set(Object.keys(AppState.reviews || {}));
    Object.keys(localStorage).forEach(k => { if (k.startsWith('cinebook_reviews_')) reviewedIds.add(k.slice('cinebook_reviews_'.length)); });
    const totalReviews = typeof CineReviews !== 'undefined'
      ? [...reviewedIds].reduce((acc, id) => acc + CineReviews.getUserReviews(id).length, 0)
      : 0;

    const genreMap = {};
    AppState.mediaList.forEach(m => {
      (m.genres || []).forEach(g => {
        genreMap[g] = (genreMap[g] || 0) + 1;
      });
    });
    const topGenres = Object.entries(genreMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([genre, count]) => ({ genre, count }));

    statsData = { totalMedia, globalAverageScore: avgRating, totalReviews, topGenres };
  }

  document.getElementById('statTotalMedia').textContent = statsData.totalMedia;
  document.getElementById('statAvgRating').textContent = `${statsData.globalAverageScore}%`;
  document.getElementById('statTotalReviews').textContent = statsData.totalReviews;

  const genresContainer = document.getElementById('statTopGenresList');
  genresContainer.innerHTML = '';
  statsData.topGenres.forEach(item => {
    const div = document.createElement('div');
    div.className = 'genre-bar-item';
    div.innerHTML = `
      <span style="font-weight: 600; color: #fff;">${item.genre}</span>
      <span style="background: rgba(30,213,169,0.2); color: var(--tmdb-light-green); padding: 0.15rem 0.5rem; border-radius: var(--radius-full); font-weight: bold;">
        ${item.count} ${item.count === 1 ? 'obra' : 'obras'}
      </span>
    `;
    genresContainer.appendChild(div);
  });

  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
}

function closeStatsModal() {
  const modal = document.getElementById('statsModal');
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
}

// ==========================================
// 12. TOAST NOTIFICATIONS
// ==========================================
function showToast(message) {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerHTML = `<span>🍿</span> <span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 3000);
}

// ==========================================
// 13. EVENT LISTENERS
// ==========================================
function initEventListeners() {
  document.getElementById('brandBtn')?.addEventListener('click', () => switchTab('movie'));

  document.querySelectorAll('.cine-nav-item[data-tab], .nav-tab-btn[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.getAttribute('data-tab')));
  });

  document.querySelectorAll('.sub-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.sub-filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      AppState.watchlistSubFilter = btn.getAttribute('data-status');
      renderGrid();
    });
  });

  let searchDebounce = null;
  document.getElementById('searchInput')?.addEventListener('input', (e) => {
    AppState.searchQuery = e.target.value;
    renderGrid();

    clearTimeout(searchDebounce);
    if (AppState.searchQuery.trim().length >= 2 && (typeof TMDB !== 'undefined' || typeof GoogleBooks !== 'undefined')) {
      searchDebounce = setTimeout(async () => {
        if (AppState.activeTab === 'people') {
          const peopleResults = await TMDB.searchPeople(AppState.searchQuery);
          if (peopleResults && peopleResults.length > 0) {
            peopleResults.forEach(r => {
              if (!AppState.peopleList.some(p => p.name.toLowerCase() === r.name.toLowerCase())) {
                AppState.peopleList.push(r);
              }
            });
            renderGrid();
          }
        } else if (AppState.activeTab === 'book') {
          if (typeof GoogleBooks === 'undefined') return;
          const queryAtRequest = AppState.searchQuery;
          const bookResults = await GoogleBooks.search(queryAtRequest);
          if (queryAtRequest !== AppState.searchQuery) return;
          if (addBooksToMediaList(bookResults, queryAtRequest) > 0 || bookResults.length > 0) renderGrid();
        } else {
          const queryAtRequest = AppState.searchQuery;
          const tmdbResults = await TMDB.search(queryAtRequest);
          // O usuário continuou digitando: descarta a resposta antiga.
          if (queryAtRequest !== AppState.searchQuery) return;
          if (tmdbResults && tmdbResults.length > 0) {
            tmdbResults.forEach(r => {
              const existing = AppState.mediaList.find(m => m.id === r.id ||
                (m.tmdbId && String(m.tmdbId) === String(r.tmdbId) && m.type === r.type));
              if (existing) {
                existing._searchQuery = queryAtRequest;
              } else {
                r._searchQuery = queryAtRequest;
                AppState.mediaList.push(r);
              }
            });
            renderGrid();
          }
        }
      }, 300);
    }
  });

  document.getElementById('sortSelect')?.addEventListener('change', (e) => {
    AppState.sortBy = e.target.value;
    renderGrid();
  });

  // Busca Exclusiva para a aba Pessoas
  const peopleInput = document.getElementById('peopleSearchInput');
  const peopleClearBtn = document.getElementById('peopleSearchClearBtn');
  const peopleSort = document.getElementById('peopleSortSelect');
  let peopleSearchDebounce = null;

  if (peopleInput) {
    peopleInput.addEventListener('input', (e) => {
      const val = e.target.value;
      AppState.peopleSearchQuery = val;
      if (peopleClearBtn) {
        peopleClearBtn.style.display = val.trim().length > 0 ? 'flex' : 'none';
      }

      renderGrid();

      clearTimeout(peopleSearchDebounce);
      if (val.trim().length >= 2 && typeof TMDB !== 'undefined') {
        peopleSearchDebounce = setTimeout(async () => {
          const results = await TMDB.searchPeople(val);
          if (results && results.length > 0) {
            AppState.peopleList = results;
            renderGrid();
          }
        }, 250);
      } else if (val.trim().length === 0 && typeof TMDB !== 'undefined') {
        TMDB.getPopularPeople(1).then(popular => {
          if (popular && popular.length > 0) {
            AppState.peopleList = popular;
            renderGrid();
          }
        });
      }
    });
  }

  if (peopleClearBtn) {
    peopleClearBtn.addEventListener('click', () => {
      if (peopleInput) {
        peopleInput.value = '';
        peopleInput.focus();
      }
      AppState.peopleSearchQuery = '';
      peopleClearBtn.style.display = 'none';
      if (typeof TMDB !== 'undefined') {
        TMDB.getPopularPeople(1).then(popular => {
          if (popular && popular.length > 0) {
            AppState.peopleList = popular;
          } else {
            AppState.peopleList = getLocalPeople();
          }
          renderGrid();
        });
      } else {
        renderGrid();
      }
    });
  }

  if (peopleSort) {
    peopleSort.addEventListener('change', (e) => {
      AppState.peopleSortBy = e.target.value;
      renderGrid();
    });
  }

  // Modal Principal
  document.getElementById('modalCloseBtn')?.addEventListener('click', closeModal);
  document.getElementById('mediaModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'mediaModal') closeModal();
  });

  // Modal de Detalhes da Pessoa (TMDb)
  document.getElementById('personModalCloseBtn')?.addEventListener('click', closePersonModal);
  document.getElementById('personModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'personModal') closePersonModal();
  });

  // Modal de Estatísticas
  document.getElementById('statsBtn')?.addEventListener('click', openStatsModal);
  document.getElementById('dropdownStatsBtn')?.addEventListener('click', () => {
    const userDropdownMenu = document.getElementById('userDropdownMenu');
    if (userDropdownMenu) userDropdownMenu.classList.remove('open');
    openStatsModal();
  });
  document.getElementById('statsCloseBtn')?.addEventListener('click', closeStatsModal);
  document.getElementById('statsModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'statsModal') closeStatsModal();
  });

  // Autenticação & Dropdown
  const authOpenBtn = document.getElementById('authOpenBtn');
  if (authOpenBtn) authOpenBtn.addEventListener('click', () => openAuthModal('login'));

  document.getElementById('authCloseBtn')?.addEventListener('click', closeAuthModal);
  document.getElementById('authModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'authModal') closeAuthModal();
  });

  document.getElementById('tabSwitchLogin')?.addEventListener('click', () => openAuthModal('login'));
  document.getElementById('tabSwitchRegister')?.addEventListener('click', () => openAuthModal('register'));

  document.getElementById('loginForm')?.addEventListener('submit', handleLoginSubmit);
  document.getElementById('registerForm')?.addEventListener('submit', handleRegisterSubmit);

  // Avatar Picker
  document.querySelectorAll('#avatarPickerGroup .avatar-choice').forEach(choice => {
    choice.addEventListener('click', () => {
      document.querySelectorAll('#avatarPickerGroup .avatar-choice').forEach(c => c.classList.remove('selected'));
      choice.classList.add('selected');
      AppState.selectedAvatar = choice.getAttribute('data-avatar');
    });
  });

  // Toggle Dropdown do Perfil & Logout
  const userProfileChip = document.getElementById('userProfileChip');
  const userDropdownMenu = document.getElementById('userDropdownMenu');
  const userProfileContainer = document.getElementById('userProfileContainer');

  if (userProfileChip && userDropdownMenu) {
    userProfileChip.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      userDropdownMenu.classList.toggle('open');
    });

    document.addEventListener('click', (e) => {
      if (userProfileContainer && !userProfileContainer.contains(e.target)) {
        userDropdownMenu.classList.remove('open');
      }
    });
  }

  const dropdownProfileBtn = document.getElementById('dropdownProfileBtn');
  if (dropdownProfileBtn) {
    dropdownProfileBtn.addEventListener('click', () => {
      if (userDropdownMenu) userDropdownMenu.classList.remove('open');
    });
  }

  const dropdownMyListBtn = document.getElementById('dropdownMyListBtn');
  if (dropdownMyListBtn) {
    dropdownMyListBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (userDropdownMenu) userDropdownMenu.classList.remove('open');
      switchTab('watchlist');
    });
  }

  const dropdownLogoutBtn = document.getElementById('dropdownLogoutBtn');
  if (dropdownLogoutBtn) {
    dropdownLogoutBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (userDropdownMenu) userDropdownMenu.classList.remove('open');
      handleLogout();
    });
  }

  // Teclado
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeModal();
      closePersonModal();
      closeStatsModal();
      closeAuthModal();
    }
  });

  // Status Selector no Modal
  document.querySelectorAll('#modalStatusSelector .status-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!AppState.currentModalMedia) return;
      const status = btn.getAttribute('data-status');
      toggleWatchlist(AppState.currentModalMedia.id, status);
      updateModalStatusButtons(AppState.currentModalMedia.id);

      const removeBtn = document.getElementById('modalRemoveWatchlistBtn');
      if (removeBtn) removeBtn.style.display = AppState.watchlist[AppState.currentModalMedia.id] ? 'inline-flex' : 'none';
      renderGrid();
    });
  });

  // Estrelas
  const stars = document.querySelectorAll('#modalStarRating .star');
  stars.forEach(star => {
    star.addEventListener('click', () => {
      const rating = parseInt(star.getAttribute('data-star'), 10);
      AppState.selectedReviewStars = rating;
      stars.forEach(s => {
        const sVal = parseInt(s.getAttribute('data-star'), 10);
        s.classList.toggle('active', sVal <= rating);
      });
    });
  });

  document.getElementById('modalSaveReviewBtn')?.addEventListener('click', saveCurrentReview);

  // Botão Carregar Mais Obras (TMDb)
  document.getElementById('loadMoreBtn')?.addEventListener('click', loadMoreMedia);
}

function switchTab(tabName) {
  AppState.activeTab = tabName;
  document.querySelectorAll('.cine-nav-item[data-tab], .nav-tab-btn[data-tab]').forEach(b => {
    b.classList.toggle('active', b.getAttribute('data-tab') === tabName);
  });

  // Atualiza os itens do carrossel estritamente para a categoria ativa e reseta para o 1º slide
  HeroCarousel.updateItems();
  HeroCarousel.currentIndex = 0;
  HeroCarousel.renderDashes();
  HeroCarousel.renderCurrentSlide();
  HeroCarousel.startAutoRotate();

  renderUserRecommendationsBanner();
  renderGrid();
  loadTMDBTrendsForTab();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/**
 * Carrega dinamicamente filmes, séries ou pessoas em alta e populares do TMDb (Página 1)
 */
async function loadTMDBTrendsForTab() {
  if (AppState.activeTab === 'book') {
    await loadBooksForTab();
    return;
  }
  if (typeof TMDB === 'undefined') return;

  try {
    if (AppState.activeTab === 'people') {
      AppState.tmdbPeoplePage = 1;
      const people = await TMDB.getPopularPeople(1);
      if (people && people.length > 0) {
        AppState.peopleList = people;
      } else {
        AppState.peopleList = getLocalPeople();
      }
      renderGrid();
      return;
    }

    let items = [];
    if (AppState.activeTab === 'movie') {
      AppState.tmdbMoviePage = 1;
      items = await TMDB.getPopularMovies(1);
    } else if (AppState.activeTab === 'series') {
      AppState.tmdbSeriesPage = 1;
      items = await TMDB.getPopularSeries(1);
    } else if (AppState.activeTab === 'all') {
      AppState.tmdbAllPage = 1;
      items = await TMDB.getTrending('all', 'week', 1);
    }

    if (items && items.length > 0) {
      items.forEach(it => {
        const existingIdx = AppState.mediaList.findIndex(m => m.id === it.id);
        if (existingIdx >= 0) {
          AppState.mediaList[existingIdx] = it;
        } else {
          AppState.mediaList.push(it);
        }
      });
      renderGrid();
      HeroCarousel.updateItems();
      HeroCarousel.renderDashes();
      HeroCarousel.renderCurrentSlide();
    }
  } catch (err) {
    console.warn("Erro ao buscar dados do TMDb:", err);
  }
}

/**
 * Aba Livros: completa os destaques locais com os livros reais (capa,
 * sinopse, páginas, links) e traz a primeira vitrine do Google Books.
 */
async function loadBooksForTab() {
  if (typeof GoogleBooks === 'undefined') return;
  const refresh = () => {
    if (AppState.activeTab !== 'book') return;
    renderGrid();
    HeroCarousel.updateItems();
    HeroCarousel.renderDashes();
    HeroCarousel.renderCurrentSlide();
  };

  try {
    // As capas dos destaques vão aparecendo conforme chegam (onProgress),
    // sem esperar os 40 livros.
    const [enrichedCount, feed] = await Promise.all([
      GoogleBooks.enrichLocalBooks(AppState.mediaList.filter(m => m.type === 'book'), 3, refresh),
      GoogleBooks.nextFeedPage(true)
    ]);
    addBooksToMediaList(feed);
    if (enrichedCount > 0 || (feed && feed.length > 0)) refresh();
  } catch (err) {
    console.warn('Erro ao buscar livros no Google Books:', err);
  }
}

function loadMoreLabel() {
  const tr = (key, fallback) => (typeof t === 'function' && t(key) !== key) ? t(key) : fallback;
  if (AppState.activeTab === 'book') return tr('load_more_books', 'Carregar mais livros');
  if (AppState.activeTab === 'series') return tr('load_more_series', 'Carregar mais séries');
  if (AppState.activeTab === 'movie') return tr('load_more_movies', 'Carregar mais filmes');
  return tr('load_more_titles', 'Carregar mais títulos');
}

/** Adiciona livros da API sem repetir o que já está na lista. */
function addBooksToMediaList(books, searchQuery) {
  if (!books || books.length === 0 || typeof GoogleBooks === 'undefined') return 0;
  let added = 0;
  books.forEach(book => {
    const key = `${GoogleBooks.normalize(book.title)}|${GoogleBooks.normalize((book.authors || [])[0] || '')}`;
    const existing = AppState.mediaList.find(m => m.type === 'book' && (
      (m.gbId && m.gbId === book.gbId) || m.id === book.id ||
      `${GoogleBooks.normalize(m.title)}|${GoogleBooks.normalize((m.authors || [m.director || ''])[0] || '')}` === key
    ));
    if (existing) {
      if (searchQuery) existing._searchQuery = searchQuery;
      return;
    }
    if (searchQuery) book._searchQuery = searchQuery;
    AppState.mediaList.push(book);
    added++;
  });
  return added;
}

/**
 * Inicializa a Rolagem Infinita Inteligente (Estilo Oficial TMDb)
 */
function initInfiniteScroll() {
  const container = document.getElementById('loadMoreContainer');
  if (!container) return;

  // 1. Intersection Observer para carregar automaticamente ao aproximar do final da página
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting && !AppState.isLoadingMore) {
          const isTmdbTab = ['all', 'movie', 'series', 'people', 'book'].includes(AppState.activeTab);
          const isSearching = AppState.searchQuery.trim().length > 0;
          if (isTmdbTab && !isSearching) {
            loadMoreMedia(true);
          }
        }
      });
    }, {
      root: null,
      rootMargin: '450px', // Inicia a requisição antecipadamente enquanto o usuário rola
      threshold: 0.1
    });

    observer.observe(container);
  }

  // 2. Listener de scroll do window como suporte adicional com throttle
  let lastScrollTime = 0;
  window.addEventListener('scroll', () => {
    const now = Date.now();
    if (now - lastScrollTime < 250 || AppState.isLoadingMore) return;
    lastScrollTime = now;

    const isTmdbTab = ['all', 'movie', 'series', 'people', 'book'].includes(AppState.activeTab);
    const isSearching = AppState.searchQuery.trim().length > 0;
    if (!isTmdbTab || isSearching) return;

    const scrollPos = window.innerHeight + window.scrollY;
    const bottomThreshold = document.documentElement.scrollHeight - 700;
    if (scrollPos >= bottomThreshold) {
      loadMoreMedia(true);
    }
  }, { passive: true });
}

/**
 * Carrega a próxima página de filmes, séries ou pessoas do TMDb (Paginação Contínua & Rolagem Infinita)
 */
async function loadMoreMedia(isAuto = false) {
  if (AppState.isLoadingMore) return;
  if (AppState.activeTab === 'book') {
    if (typeof GoogleBooks === 'undefined') return;
  } else if (typeof TMDB === 'undefined') {
    return;
  }
  AppState.isLoadingMore = true;

  const btn = document.getElementById('loadMoreBtn');
  const spinner = document.getElementById('loadMoreSpinner');
  const icon = document.getElementById('loadMoreIcon');
  const text = document.getElementById('loadMoreText');

  if (btn) btn.classList.add('loading');
  if (spinner) spinner.style.display = 'inline-block';
  if (icon) icon.style.display = 'none';
  if (text) text.textContent = isAuto ? 'Carregando mais títulos automaticamente...' : 'Buscando mais títulos...';

  try {
    const currentLang = localStorage.getItem('cinebook_lang') || 'pt';

    if (AppState.activeTab === 'book') {
      // Algumas vitrines podem vir só com livros repetidos: tenta até 3.
      for (let attempt = 0; attempt < 3; attempt++) {
        const nextBooks = await GoogleBooks.nextFeedPage();
        if (addBooksToMediaList(nextBooks) > 0) break;
      }
      renderGrid();
    } else if (AppState.activeTab === 'people') {
      AppState.tmdbPeoplePage = (AppState.tmdbPeoplePage || 1) + 1;
      const nextPeople = await TMDB.getPopularPeople(AppState.tmdbPeoplePage);
      if (nextPeople && nextPeople.length > 0) {
        nextPeople.forEach(p => {
          if (!AppState.peopleList.some(c => c.name.toLowerCase() === p.name.toLowerCase())) {
            AppState.peopleList.push(p);
          }
        });
        renderGrid();
      }
    } else {
      let newItems = [];
      if (AppState.activeTab === 'movie') {
        AppState.tmdbMoviePage = (AppState.tmdbMoviePage || 1) + 1;
        newItems = await TMDB.getPopularMovies(AppState.tmdbMoviePage);
      } else if (AppState.activeTab === 'series') {
        AppState.tmdbSeriesPage = (AppState.tmdbSeriesPage || 1) + 1;
        newItems = await TMDB.getPopularSeries(AppState.tmdbSeriesPage);
      } else if (AppState.activeTab === 'all') {
        AppState.tmdbAllPage = (AppState.tmdbAllPage || 1) + 1;
        newItems = await TMDB.getTrending('all', 'week', AppState.tmdbAllPage);
      }

      if (newItems && newItems.length > 0) {
        await TMDB.enrichLocalizedPosters(newItems, currentLang);

        newItems.forEach(it => {
          const existingIdx = AppState.mediaList.findIndex(m => m.id === it.id);
          if (existingIdx >= 0) {
            AppState.mediaList[existingIdx] = it;
          } else {
            AppState.mediaList.push(it);
          }
        });
        renderGrid();
      }
    }
  } catch (err) {
    console.warn("Erro ao carregar mais títulos do TMDb:", err);
  } finally {
    AppState.isLoadingMore = false;
    if (btn) btn.classList.remove('loading');
    if (spinner) spinner.style.display = 'none';
    if (icon) icon.style.display = 'inline-block';
    if (text) text.textContent = loadMoreLabel();
  }
}
