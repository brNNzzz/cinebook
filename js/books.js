/**
 * CineBook - Integração com a API do Google Books
 * ---------------------------------------------------------------------------
 * Livros reais (capa, autores, editora, páginas, sinopse, nota dos leitores,
 * amostra e onde comprar) para a aba Livros, a busca e a página de detalhes.
 *
 * - Os 40 livros cadastrados em data.js continuam como destaques: cada um é
 *   ligado ao livro real correspondente (LOCAL_BOOK_LOOKUP) e recebe capa,
 *   sinopse, páginas e links de verdade.
 * - Respostas ficam guardadas no navegador por 7 dias, para não gastar a
 *   cota da API a cada visita.
 * - Ordem das chamadas: direto no Google (cota por usuário) e, se falhar,
 *   pelo proxy /gbooks-api do Netlify (ver netlify.toml).
 * ---------------------------------------------------------------------------
 */

const GOOGLE_BOOKS_CONFIG = {
  BASE_URL: 'https://www.googleapis.com/books/v1',
  PROXY_PATH: '/gbooks-api',
  // Opcional. Sem chave, a cota é contada por usuário (IP), o que costuma
  // bastar. Com chave (console.cloud.google.com > Books API), a cota passa a
  // ser do projeto inteiro.
  API_KEY: '',
  CACHE_KEY: 'cinebook_gbooks_cache_v1',
  CACHE_TTL_MS: 7 * 24 * 60 * 60 * 1000,
  CACHE_MAX_ENTRIES: 250,
  PAGE_SIZE: 40
};

/**
 * Livro real por trás de cada destaque local. "original" corrige títulos
 * originais que estavam inventados no cadastro (ex.: "Dune: Chronicles of
 * Arrakis" não existe — o livro é "Dune"); "year" é o ano da primeira
 * publicação da obra (o cadastro dizia 2026 para todos).
 */
const LOCAL_BOOK_LOOKUP = {
  b1: { title: 'Duna', author: 'Herbert', original: 'Dune', year: 1965, fixTitle: true },
  b2: { title: 'Neuromancer', author: 'Gibson', original: 'Neuromancer', year: 1984, fixTitle: true },
  b3: { title: 'A Sociedade do Anel', author: 'Tolkien', original: 'The Fellowship of the Ring', year: 1954 },
  b4: { title: '1984', author: 'Orwell', original: 'Nineteen Eighty-Four', year: 1949, fixTitle: true },
  b5: { title: 'O Problema dos Três Corpos', author: 'Liu', original: 'The Three-Body Problem', year: 2008 },
  b6: { title: 'O Silmarillion', author: 'Tolkien', original: 'The Silmarillion', year: 1977 },
  b7: { title: 'Fahrenheit 451', author: 'Bradbury', original: 'Fahrenheit 451', year: 1953, fixTitle: true },
  b8: { title: 'A Biblioteca da Meia-Noite', author: 'Haig', original: 'The Midnight Library', year: 2020 },
  b9: { title: 'O Nome do Vento', author: 'Rothfuss', original: 'The Name of the Wind', year: 2007 },
  b10: { title: 'A Cantiga dos Pássaros e das Serpentes', author: 'Collins', original: 'The Ballad of Songbirds and Snakes', year: 2020 },
  b11: { title: 'Fundação', author: 'Asimov', original: 'Foundation', year: 1951, fixTitle: true },
  b12: { title: 'O Homem de Giz', author: 'Tudor', original: 'The Chalk Man', year: 2018 },
  b13: { title: 'Verity', author: 'Hoover', original: 'Verity', year: 2018, fixTitle: true },
  b14: { title: 'A Paciente Silenciosa', author: 'Michaelides', original: 'The Silent Patient', year: 2019 },
  b15: { title: 'O Iluminado', author: 'King', original: 'The Shining', year: 1977 },
  b16: { title: 'It: A Coisa', author: 'King', original: 'It', year: 1986 },
  b17: { title: 'Sapiens', author: 'Harari', original: 'Sapiens: A Brief History of Humankind', year: 2011 },
  b18: { title: 'O Pequeno Príncipe', author: 'Exupéry', original: 'Le Petit Prince', year: 1943 },
  b19: { title: 'Cem Anos de Solidão', author: 'Márquez', original: 'Cien años de soledad', year: 1967 },
  b20: { title: 'Flores para Algernon', author: 'Keyes', original: 'Flowers for Algernon', year: 1966 },
  b21: { title: 'Orgulho e Preconceito', author: 'Austen', original: 'Pride and Prejudice', year: 1813 },
  b22: { title: 'Crime e Castigo', author: 'Dostoiévski', original: 'Преступление и наказание', year: 1866 },
  b23: { title: 'Admirável Mundo Novo', author: 'Huxley', original: 'Brave New World', year: 1932 },
  b24: { title: 'A Revolução dos Bichos', author: 'Orwell', original: 'Animal Farm', year: 1945 },
  b25: { title: 'Dom Quixote', author: 'Cervantes', original: 'Don Quijote de la Mancha', year: 1605 },
  b26: { title: 'O Retrato de Dorian Gray', author: 'Wilde', original: 'The Picture of Dorian Gray', year: 1890 },
  b27: { title: 'A Metamorfose', author: 'Kafka', original: 'Die Verwandlung', year: 1915 },
  b28: { title: 'O Apanhador no Campo de Centeio', author: 'Salinger', original: 'The Catcher in the Rye', year: 1951 },
  b29: { title: 'O Conde de Monte Cristo', author: 'Dumas', original: 'Le Comte de Monte-Cristo', year: 1844 },
  b30: { title: 'Frankenstein', author: 'Shelley', original: 'Frankenstein; or, The Modern Prometheus', year: 1818 },
  b31: { title: 'Drácula', author: 'Stoker', original: 'Dracula', year: 1897 },
  b32: { title: 'O Leão, a Feiticeira e o Guarda-Roupa', author: 'Lewis', original: 'The Lion, the Witch and the Wardrobe', year: 1950 },
  b33: { title: 'O Hobbit', author: 'Tolkien', original: 'The Hobbit', year: 1937 },
  b34: { title: 'O Ladrão de Raios', author: 'Riordan', original: 'The Lightning Thief', year: 2005 },
  b35: { title: 'Harry Potter e a Pedra Filosofal', author: 'Rowling', original: "Harry Potter and the Philosopher's Stone", year: 1997 },
  b36: { title: 'Jogos Vorazes', author: 'Collins', original: 'The Hunger Games', year: 2008 },
  b37: { title: 'O Código Da Vinci', author: 'Brown', original: 'The Da Vinci Code', year: 2003 },
  b38: { title: 'Assassinato no Expresso do Oriente', author: 'Christie', original: 'Murder on the Orient Express', year: 1934 },
  b39: { title: 'O Grande Gatsby', author: 'Fitzgerald', original: 'The Great Gatsby', year: 1925 },
  b40: { title: 'A Menina que Roubava Livros', author: 'Zusak', original: 'The Book Thief', year: 2005 }
};

/** Vitrines da aba Livros (rodízio a cada "carregar mais"). */
const BOOK_FEEDS = [
  'subject:fiction',
  'subject:fantasy',
  'subject:thriller',
  'subject:romance',
  'subject:"science fiction"',
  'subject:biography',
  'subject:history',
  'subject:horror'
];

/** Categorias do Google (em inglês, "Fiction / Fantasy / Epic") → rótulos do site. */
const BOOK_CATEGORY_MAP = {
  'fiction': 'Ficção',
  'fantasy': 'Fantasia',
  'epic': 'Fantasia',
  'science fiction': 'Ficção Científica',
  'dystopian': 'Distopia',
  'horror': 'Terror',
  'thrillers': 'Suspense',
  'suspense': 'Suspense',
  'psychological': 'Suspense',
  'romance': 'Romance',
  'mystery & detective': 'Mistério',
  'mystery': 'Mistério',
  'crime': 'Crime',
  'action & adventure': 'Aventura',
  'adventure': 'Aventura',
  'classics': 'Clássico',
  'literary': 'Literatura',
  'history': 'História',
  'biography & autobiography': 'Biografia',
  'juvenile fiction': 'Infantojuvenil',
  'young adult fiction': 'Jovem Adulto',
  'comics & graphic novels': 'Quadrinhos',
  'humor': 'Comédia',
  'poetry': 'Poesia',
  'philosophy': 'Filosofia',
  'psychology': 'Psicologia',
  'self-help': 'Autoajuda',
  'business & economics': 'Negócios',
  'science': 'Ciência',
  'religion': 'Religião',
  'war & military': 'Guerra'
};

class GoogleBooksService {
  constructor() {
    this._cache = null;
    this._proxyOff = false;
    this._feedCursor = { feed: 0, start: 0 };
  }

  // -------------------------------------------------------------------------
  // Rede
  // -------------------------------------------------------------------------

  getLangRestrict() {
    const lang = (typeof localStorage !== 'undefined' && localStorage.getItem('cinebook_lang')) || 'pt';
    return lang;
  }

  async fetchWithTimeout(url, ms) {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), ms) : null;
    try {
      return await fetch(url, controller ? { signal: controller.signal } : undefined);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  /** GET /books/v1{endpoint}. Devolve o JSON ou null. */
  async request(endpoint, params = {}) {
    const query = new URLSearchParams(params);
    if (GOOGLE_BOOKS_CONFIG.API_KEY) query.set('key', GOOGLE_BOOKS_CONFIG.API_KEY);
    const qs = query.toString();
    const directUrl = `${GOOGLE_BOOKS_CONFIG.BASE_URL}${endpoint}?${qs}`;
    const proxyUrl = `${GOOGLE_BOOKS_CONFIG.PROXY_PATH}${endpoint}?${qs}`;

    // 1) Direto no Google.
    try {
      const res = await this.fetchWithTimeout(directUrl, 9000);
      if (res.ok) return await res.json();
      // 404 = volume não existe: não adianta tentar de novo pelo proxy.
      if (res.status === 404) return null;
      // 429/403 = cota estourada / bloqueio: cai para o proxy.
    } catch (_) {
      // rede bloqueada ou timeout: cai para o proxy.
    }

    // 2) Proxy do próprio site (Netlify).
    if (this._proxyOff) return null;
    try {
      const res = await this.fetchWithTimeout(proxyUrl, 9000);
      const isJson = (res.headers.get('content-type') || '').includes('json');
      if (!isJson) {
        this._proxyOff = true; // servidor sem proxy (ex.: rodando local)
        return null;
      }
      return res.ok ? await res.json() : null;
    } catch (err) {
      console.warn('[Google Books] Falha em', endpoint, err && err.message);
      return null;
    }
  }

  // -------------------------------------------------------------------------
  // Cache no navegador (localStorage), com validade e teto de entradas
  // -------------------------------------------------------------------------

  loadCache() {
    if (this._cache) return this._cache;
    try {
      this._cache = JSON.parse(localStorage.getItem(GOOGLE_BOOKS_CONFIG.CACHE_KEY)) || {};
    } catch (_) {
      this._cache = {};
    }
    return this._cache;
  }

  cacheGet(key) {
    const entry = this.loadCache()[key];
    if (!entry) return undefined;
    if (Date.now() - entry.ts > GOOGLE_BOOKS_CONFIG.CACHE_TTL_MS) return undefined;
    return entry.v;
  }

  cacheSet(key, value) {
    const cache = this.loadCache();
    cache[key] = { ts: Date.now(), v: value };
    const keys = Object.keys(cache);
    if (keys.length > GOOGLE_BOOKS_CONFIG.CACHE_MAX_ENTRIES) {
      keys.sort((a, b) => cache[a].ts - cache[b].ts)
        .slice(0, keys.length - GOOGLE_BOOKS_CONFIG.CACHE_MAX_ENTRIES)
        .forEach(k => delete cache[k]);
    }
    try {
      localStorage.setItem(GOOGLE_BOOKS_CONFIG.CACHE_KEY, JSON.stringify(cache));
    } catch (_) {
      // navegador sem espaço/privado: segue sem cache
    }
  }

  // -------------------------------------------------------------------------
  // Formatação
  // -------------------------------------------------------------------------

  /** Capa em https, sem o "dobra de página" e em resolução melhor. */
  coverUrl(imageLinks, size = 'grid') {
    if (!imageLinks) return '';
    const raw = size === 'large'
      ? (imageLinks.extraLarge || imageLinks.large || imageLinks.medium || imageLinks.small || imageLinks.thumbnail || imageLinks.smallThumbnail)
      : (imageLinks.thumbnail || imageLinks.smallThumbnail);
    if (!raw) return '';
    let url = raw.replace(/^http:\/\//i, 'https://').replace(/&edge=curl/gi, '');
    if (/books\.google/.test(url) && !/fife=/.test(url)) {
      url += size === 'large' ? '&fife=w600-h900' : '&fife=w400-h600';
    }
    return url;
  }

  /** "2017" → "2017-01-01"; "2017-05" → "2017-05-01". */
  normalizeDate(dateStr) {
    if (!dateStr) return null;
    if (/^\d{4}$/.test(dateStr)) return `${dateStr}-01-01`;
    if (/^\d{4}-\d{2}$/.test(dateStr)) return `${dateStr}-01`;
    if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) return dateStr.slice(0, 10);
    return null;
  }

  mapCategories(categories) {
    const out = [];
    (categories || []).forEach(cat => {
      String(cat).split('/').forEach(part => {
        const key = part.trim().toLowerCase();
        if (!key || key === 'general') return;
        const label = BOOK_CATEGORY_MAP[key] || (/[à-ú]/i.test(part) ? part.trim() : null);
        if (label && !out.includes(label)) out.push(label);
      });
    });
    return out.slice(0, 3);
  }

  /** Texto puro a partir da descrição do Google (que às vezes vem com HTML). */
  plainText(html) {
    if (!html) return '';
    const tmp = typeof document !== 'undefined' ? document.createElement('div') : null;
    if (!tmp) return String(html).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    tmp.innerHTML = String(html).replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n\n');
    return (tmp.textContent || '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  }

  /** Onde comprar / ler, só com links que existem de verdade. */
  buildWhereToRead(vol, title, authors) {
    const info = vol.volumeInfo || {};
    const sale = vol.saleInfo || {};
    const access = vol.accessInfo || {};
    const list = [];

    if (sale.saleability === 'FOR_SALE' && sale.buyLink) {
      const price = sale.retailPrice || sale.listPrice;
      const priceTxt = price && typeof price.amount === 'number'
        ? price.amount.toLocaleString('pt-BR', { style: 'currency', currency: price.currencyCode || 'BRL' })
        : '';
      list.push({ name: 'Google Play Livros', icon: '🛒', type: priceTxt ? `E-book • ${priceTxt}` : 'E-book', link: sale.buyLink, logo: null });
    } else if (sale.saleability === 'FREE' && (access.webReaderLink || info.previewLink)) {
      list.push({ name: 'Google Play Livros', icon: '📖', type: 'Grátis', link: access.webReaderLink || info.previewLink, logo: null });
    }

    if (access.viewability && access.viewability !== 'NO_PAGES' && (access.webReaderLink || info.previewLink)) {
      list.push({ name: 'Amostra no Google Books', icon: '👀', type: 'Leia um trecho grátis', link: access.webReaderLink || info.previewLink, logo: null });
    }

    const searchTerm = encodeURIComponent(`${title} ${(authors || [])[0] || ''}`.trim());
    list.push({ name: 'Amazon', icon: '📦', type: 'Livro físico e Kindle', link: `https://www.amazon.com.br/s?k=${searchTerm}&i=stripbooks`, logo: null });

    if (info.infoLink || info.canonicalVolumeLink) {
      list.push({ name: 'Google Books', icon: '📚', type: 'Ficha completa da edição', link: info.canonicalVolumeLink || info.infoLink, logo: null });
    }
    return list;
  }

  /** Volume do Google → item no formato usado pelo resto do site. */
  formatVolume(vol) {
    const info = vol.volumeInfo || {};
    const title = info.title || 'Sem título';
    const authors = info.authors || [];
    const dateFull = this.normalizeDate(info.publishedDate);
    const year = dateFull ? Number(dateFull.slice(0, 4)) : '';
    const rating = (info.ratingsCount || 0) > 0 && info.averageRating
      ? Math.round(info.averageRating * 20)
      : 0;
    const cover = this.coverUrl(info.imageLinks, 'grid');
    const coverLarge = this.coverUrl(info.imageLinks, 'large') || cover;
    const synopsis = this.plainText(info.description);
    const releaseInfo = typeof computeReleaseStatus === 'function'
      ? computeReleaseStatus(dateFull, 'book')
      : { releaseDateFull: dateFull, notReleasedYet: false, inTheaters: false };

    const access = vol.accessInfo || {};
    const hasPreview = access.viewability && access.viewability !== 'NO_PAGES';

    return {
      id: `gb_${vol.id}`,
      gbId: vol.id,
      type: 'book',
      title: info.subtitle && title.length < 18 ? `${title}: ${info.subtitle}` : title,
      originalTitle: '',
      year,
      rating,
      ratingsCount: info.ratingsCount || 0,
      duration: info.pageCount ? `${info.pageCount} páginas` : '',
      pageCount: info.pageCount || 0,
      director: authors.join(', '),
      authors,
      publisher: info.publisher || '',
      genres: this.mapCategories(info.categories),
      poster: cover,
      posterLarge: coverLarge,
      backdrop: coverLarge,
      synopsis,
      tagline: '',
      sampleSnippet: vol.searchInfo && vol.searchInfo.textSnippet ? this.plainText(vol.searchInfo.textSnippet) : '',
      previewUrl: hasPreview ? (access.webReaderLink || info.previewLink) : '',
      cast: authors.map(name => ({ name, role: 'Autor(a)', photo: '' })),
      whereToWatch: this.buildWhereToRead(vol, title, authors),
      trailerUrl: '',
      language: info.language || '',
      isbn: ((info.industryIdentifiers || []).find(i => i.type === 'ISBN_13') || (info.industryIdentifiers || [])[0] || {}).identifier || '',
      featured: false,
      source: 'google_books',
      releaseDateFull: releaseInfo.releaseDateFull,
      notReleasedYet: releaseInfo.notReleasedYet,
      inTheaters: false
    };
  }

  /** Remove edições repetidas do mesmo livro e itens sem capa. */
  dedupe(items) {
    const seen = new Set();
    return items.filter(it => {
      if (!it.poster) return false;
      const key = `${this.normalize(it.title)}|${this.normalize((it.authors || [])[0] || '')}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  normalize(txt) {
    return String(txt || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  // -------------------------------------------------------------------------
  // Consultas públicas
  // -------------------------------------------------------------------------

  /** Busca livre (título, autor, ISBN...). */
  async search(query, startIndex = 0) {
    if (!query || !query.trim()) return [];
    const cacheKey = `s:${this.normalize(query)}:${startIndex}`;
    const cached = this.cacheGet(cacheKey);
    if (cached) return cached;

    const data = await this.request('/volumes', {
      q: query.trim(),
      printType: 'books',
      maxResults: String(GOOGLE_BOOKS_CONFIG.PAGE_SIZE),
      startIndex: String(startIndex),
      orderBy: 'relevance'
    });
    if (!data || !Array.isArray(data.items)) return [];
    const items = this.dedupe(data.items.map(v => this.formatVolume(v)));
    this.cacheSet(cacheKey, items);
    return items;
  }

  /** Próxima página da vitrine da aba Livros (rodízio de gêneros). */
  async nextFeedPage(reset = false) {
    if (reset) this._feedCursor = { feed: 0, start: 0 };
    const { feed, start } = this._feedCursor;
    const q = BOOK_FEEDS[feed % BOOK_FEEDS.length];
    const lang = this.getLangRestrict();
    const cacheKey = `f:${lang}:${q}:${start}`;

    let items = this.cacheGet(cacheKey);
    if (!items) {
      const data = await this.request('/volumes', {
        q,
        langRestrict: lang,
        printType: 'books',
        orderBy: 'relevance',
        maxResults: String(GOOGLE_BOOKS_CONFIG.PAGE_SIZE),
        startIndex: String(start)
      });
      items = data && Array.isArray(data.items) ? this.dedupe(data.items.map(v => this.formatVolume(v))) : [];
      if (items.length) this.cacheSet(cacheKey, items);
    }

    // Avança o cursor: próxima vitrine; depois de passar por todas, próxima página.
    const nextFeed = feed + 1;
    this._feedCursor = nextFeed % BOOK_FEEDS.length === 0
      ? { feed: 0, start: start + GOOGLE_BOOKS_CONFIG.PAGE_SIZE }
      : { feed: nextFeed, start };
    return items;
  }

  /** Um volume pelo id do Google ("gb_xxxx" ou "xxxx"). */
  async getVolume(id) {
    const volumeId = String(id).replace(/^gb_/, '');
    const cacheKey = `v:${volumeId}`;
    const cached = this.cacheGet(cacheKey);
    if (cached) return cached;
    const data = await this.request(`/volumes/${encodeURIComponent(volumeId)}`);
    if (!data || !data.id) return null;
    const item = this.formatVolume(data);
    this.cacheSet(cacheKey, item);
    return item;
  }

  /** Escolhe, entre os resultados, o que mais parece ser o livro procurado. */
  pickBestMatch(items, wantedTitle, wantedAuthor) {
    const t = this.normalize(wantedTitle);
    const a = this.normalize(wantedAuthor);
    const scored = items.map(it => {
      const title = this.normalize(it.title);
      const authors = this.normalize((it.authors || []).join(' '));
      let score = 0;
      if (title === t) score += 50;
      else if (title.startsWith(t)) score += 35;
      else if (title.includes(t)) score += 20;
      else return { it, score: -1 };
      if (a && authors.includes(a)) score += 30;
      if (it.synopsis && it.synopsis.length > 120) score += 10;
      if (it.language === 'pt' || it.language === 'pt-BR') score += 10;
      score += Math.min(it.ratingsCount || 0, 50) / 5;
      return { it, score };
    }).filter(s => s.score > 0).sort((x, y) => y.score - x.score);
    return scored.length ? scored[0].it : null;
  }

  /**
   * Completa um destaque local (b1...b40) com os dados do livro real.
   * Devolve o item atualizado (ou o próprio item, se a API não responder).
   */
  async enrichLocalBook(item) {
    if (!item || item.type !== 'book') return item;
    const lookup = LOCAL_BOOK_LOOKUP[item.id];
    if (!lookup) return item;

    const cacheKey = `l:${item.id}`;
    let match = this.cacheGet(cacheKey);
    if (match === undefined) {
      const q = `intitle:"${lookup.title}" inauthor:${lookup.author}`;
      let data = await this.request('/volumes', { q, langRestrict: 'pt', printType: 'books', maxResults: '15', orderBy: 'relevance' });
      let items = data && Array.isArray(data.items) ? data.items.map(v => this.formatVolume(v)).filter(i => i.poster) : [];
      match = this.pickBestMatch(items, lookup.title, lookup.author);
      if (!match) {
        data = await this.request('/volumes', { q, printType: 'books', maxResults: '15', orderBy: 'relevance' });
        items = data && Array.isArray(data.items) ? data.items.map(v => this.formatVolume(v)).filter(i => i.poster) : [];
        match = this.pickBestMatch(items, lookup.title, lookup.author);
      }
      if (!data) return item; // API fora do ar: não grava "não achei" no cache
      this.cacheSet(cacheKey, match || null);
    }
    return this.applyMatch(item, match, lookup);
  }

  applyMatch(item, match, lookup) {
    if (lookup && lookup.original) item.originalTitle = lookup.original;
    if (!match) return item;
    Object.assign(item, {
      gbId: match.gbId,
      title: match.title || item.title,
      baseTitle: match.title || item.title,
      year: (lookup && lookup.year) || match.year || item.year,
      duration: match.duration || item.duration,
      pageCount: match.pageCount,
      director: match.director || item.director,
      authors: match.authors,
      publisher: match.publisher,
      genres: match.genres && match.genres.length ? match.genres : item.genres,
      poster: match.poster,
      posterLarge: match.posterLarge,
      backdrop: match.posterLarge || match.poster,
      synopsis: match.synopsis || item.synopsis,
      tagline: '',
      sampleSnippet: match.sampleSnippet,
      previewUrl: match.previewUrl,
      cast: match.cast && match.cast.length ? match.cast : item.cast,
      whereToWatch: match.whereToWatch,
      isbn: match.isbn,
      releaseDateFull: match.releaseDateFull,
      notReleasedYet: match.notReleasedYet,
      inTheaters: false,
      // Nota: a dos leitores do Google quando existe; senão mantém a da curadoria.
      rating: match.rating || item.rating,
      ratingsCount: match.ratingsCount,
      _booksEnriched: true
    });
    return item;
  }

  /**
   * Aplica na hora (sem rede) o que já estiver guardado no navegador, para
   * que as capas reais apareçam desde o primeiro desenho da página.
   */
  applyCachedEnrichment(list) {
    (list || []).forEach(item => {
      if (item.type !== 'book' || item._booksEnriched) return;
      const lookup = LOCAL_BOOK_LOOKUP[item.id];
      if (!lookup) return;
      const match = this.cacheGet(`l:${item.id}`);
      if (match) this.applyMatch(item, match, lookup);
      else if (lookup.original) item.originalTitle = lookup.original;
    });
  }

  /** Completa vários destaques locais com poucas requisições em paralelo. */
  async enrichLocalBooks(list, concurrency = 4) {
    const pending = (list || []).filter(i => i.type === 'book' && LOCAL_BOOK_LOOKUP[i.id] && !i._booksEnriched);
    let cursor = 0;
    const worker = async () => {
      while (cursor < pending.length) {
        const item = pending[cursor++];
        try { await this.enrichLocalBook(item); } catch (_) {}
      }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, pending.length) }, worker));
    return pending.filter(i => i._booksEnriched).length;
  }

  /** Livros parecidos (mesmo gênero ou mesmo autor) para "Recomendados". */
  async getSimilar(item, max = 4) {
    const author = (item.authors || [])[0];
    const genre = (item.genres || [])[0];
    const reverse = Object.entries(BOOK_CATEGORY_MAP).find(([, v]) => v === genre);
    const q = reverse ? `subject:"${reverse[0]}"` : (author ? `inauthor:"${author}"` : '');
    if (!q) return [];
    const results = await this.search(q);
    return results.filter(r => r.gbId !== item.gbId && this.normalize(r.title) !== this.normalize(item.title)).slice(0, max);
  }
}

const GoogleBooks = new GoogleBooksService();

/**
 * Capa provisória para livros sem capa (ou enquanto a API não respondeu):
 * gerada na hora com título e autor, em vez de mostrar pôster de filme.
 */
function generateBookCover(title, author) {
  const esc = (s) => String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const words = String(title || '').split(/\s+/);
  const lines = [];
  let line = '';
  words.forEach(w => {
    if ((line + ' ' + w).trim().length > 16 && line) { lines.push(line); line = w; } else { line = (line + ' ' + w).trim(); }
  });
  if (line) lines.push(line);
  const shown = lines.slice(0, 5);
  const titleSvg = shown.map((l, i) => `<text x="30" y="${150 + i * 40}" font-family="Georgia, serif" font-size="32" font-weight="700" fill="#f8fafc">${esc(l)}</text>`).join('');
  const authorY = 150 + shown.length * 40 + 20;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600" viewBox="0 0 400 600">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1e293b"/><stop offset="1" stop-color="#0f172a"/></linearGradient></defs>
    <rect width="400" height="600" fill="url(#g)"/>
    <rect x="18" y="18" width="364" height="564" fill="none" stroke="#1ed5a9" stroke-opacity="0.45" stroke-width="2"/>
    ${titleSvg}
    <rect x="30" y="${authorY - 26}" width="40" height="3" fill="#1ed5a9"/>
    <text x="30" y="${authorY + 6}" font-family="Arial, sans-serif" font-size="20" fill="#94a3b8">${esc(String(author || '').slice(0, 30))}</text>
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

// Livros locais: nada de pôster de filme como capa. Usa a capa real guardada
// no navegador; se ainda não houver, a capa provisória com título e autor.
if (typeof MEDIA_DATABASE !== 'undefined') {
  MEDIA_DATABASE.forEach(item => {
    const lookup = LOCAL_BOOK_LOOKUP[item.id];
    if (item.type !== 'book' || !lookup) return;
    // Só troca o título quando o cadastro inventou uma edição que não existe
    // ("Duna: Crônicas de Arrakis", "1984: Edição Especial Ilustrada"...).
    if (lookup.fixTitle) item.title = lookup.title;
    item.year = lookup.year;
    item.originalTitle = lookup.original;
    item.poster = generateBookCover(item.title, item.director);
    item.backdrop = item.poster;
  });
  GoogleBooks.applyCachedEnrichment(MEDIA_DATABASE);
}
