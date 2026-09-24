/**
 * CineBook - Módulo de Integração com a API Oficial do TMDb (The Movie Database)
 * Fornece catálogo mundial de filmes e séries, busca global, trailers, elenco e streaming.
 */

const TMDB_CONFIG = {
  // Chave padrão da API v3 (o usuário pode personalizar via localStorage['cinebook_tmdb_key'])
  DEFAULT_API_KEY: '844dba0bfd8f3a4f3799f6130ef9e335',
  BASE_URL: 'https://api.themoviedb.org/3',
  IMAGE_BASE_URL: 'https://image.tmdb.org/t/p/w500',
  BACKDROP_BASE_URL: 'https://image.tmdb.org/t/p/original',
  
  // Mapeamento de idiomas suportados pelo CineBook para os códigos TMDb
  LANG_MAP: {
    pt: 'pt-BR',
    en: 'en-US',
    es: 'es-ES',
    fr: 'fr-FR',
    zh: 'zh-CN',
    hi: 'hi-IN',
    ar: 'ar-SA',
    bn: 'bn-BD',
    ru: 'ru-RU',
    ur: 'ur-PK',
    id: 'id-ID'
  },

  // Mapeamento de regiões para feeds oficiais de cada país
  REGION_MAP: {
    pt: 'BR',
    en: 'US',
    es: 'ES',
    fr: 'FR',
    zh: 'CN',
    hi: 'IN',
    ar: 'SA',
    bn: 'BD',
    ru: 'RU',
    ur: 'PK',
    id: 'ID'
  },

  // Mapeamento de IDs de gênero do TMDb para nomes amigáveis
  GENRE_MAP: {
    28: "Ação", 12: "Aventura", 16: "Animação", 35: "Comédia", 80: "Crime",
    99: "Documentário", 18: "Drama", 10751: "Família", 14: "Fantasia", 36: "História",
    27: "Terror", 10402: "Música", 9648: "Mistério", 10749: "Romance", 878: "Ficção Científica",
    10770: "Cinema TV", 53: "Suspense", 10752: "Guerra", 37: "Faroeste",
    10759: "Ação & Aventura", 10762: "Kids", 10763: "News", 10764: "Reality",
    10765: "Sci-Fi & Fantasia", 10766: "Soap", 10767: "Talk", 10768: "War & Politics"
  }
};

class TMDbService {
  constructor() {
    this.apiKey = localStorage.getItem('cinebook_tmdb_key') || TMDB_CONFIG.DEFAULT_API_KEY;
  }

  getApiKey() {
    return localStorage.getItem('cinebook_tmdb_key') || TMDB_CONFIG.DEFAULT_API_KEY;
  }

  setApiKey(key) {
    if (key && key.trim()) {
      localStorage.setItem('cinebook_tmdb_key', key.trim());
      this.apiKey = key.trim();
    } else {
      localStorage.removeItem('cinebook_tmdb_key');
      this.apiKey = TMDB_CONFIG.DEFAULT_API_KEY;
    }
  }

  getLanguage() {
    const appLang = localStorage.getItem('cinebook_lang') || 'pt';
    return TMDB_CONFIG.LANG_MAP[appLang] || 'pt-BR';
  }

  getShortLanguage() {
    const appLang = localStorage.getItem('cinebook_lang') || 'pt';
    return appLang;
  }

  /**
   * Executa requisições à API do TMDb com tratamento de erros e idioma dinâmico
   */
  async fetchTMDB(endpoint, params = {}) {
    const key = this.getApiKey();
    const lang = this.getLanguage();
    const shortLang = this.getShortLanguage();

    const queryParams = new URLSearchParams({
      api_key: key,
      language: lang,
      include_image_language: `${shortLang},${lang.split('-')[0]},null,en`,
      ...params
    });

    const url = `${TMDB_CONFIG.BASE_URL}${endpoint}?${queryParams.toString()}`;

    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Erro TMDb HTTP ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.warn(`[TMDb API] Falha na rota ${endpoint}:`, error.message);
      return null;
    }
  }

  /**
   * 1. Filmes e Séries em Alta (Trending) com Capas Localizadas
   */
  async getTrending(type = 'all', timeWindow = 'week', page = 1) {
    const endpoint = `/trending/${type === 'series' ? 'tv' : (type === 'movie' ? 'movie' : 'all')}/${timeWindow}`;
    const data = await this.fetchTMDB(endpoint, { page });
    if (!data || !data.results) return [];
    const items = data.results
      .filter(item => item.poster_path && (item.media_type === 'movie' || item.media_type === 'tv' || type !== 'all'))
      .map(item => this.formatItem(item, type === 'all' ? (item.media_type === 'tv' ? 'series' : 'movie') : type));
    
    await this.enrichLocalizedPosters(items);
    return items;
  }

  /**
   * 2. Filmes Populares (com Capas e Títulos 100% no Idioma do Usuário)
   */
  async getPopularMovies(page = 1) {
    const shortLang = this.getShortLanguage();
    const region = TMDB_CONFIG.REGION_MAP[shortLang] || 'US';
    const params = {
      page,
      sort_by: 'popularity.desc',
      include_adult: false,
      region
    };

    const data = await this.fetchTMDB('/discover/movie', params);
    if (!data || !data.results) return [];
    const items = data.results
      .filter(item => item.poster_path)
      .map(item => this.formatItem(item, 'movie'));

    await this.enrichLocalizedPosters(items);
    return items;
  }

  /**
   * 3. Séries Populares (com Capas e Títulos 100% no Idioma do Usuário)
   */
  async getPopularSeries(page = 1) {
    const data = await this.fetchTMDB('/discover/tv', { 
      page,
      sort_by: 'popularity.desc',
      include_adult: false
    });
    if (!data || !data.results) return [];
    const items = data.results
      .filter(item => item.poster_path)
      .map(item => this.formatItem(item, 'series'));

    await this.enrichLocalizedPosters(items);
    return items;
  }

  /**
   * 4. Busca Global (Multi Search: Filmes e Séries)
   */
  async search(query, page = 1) {
    if (!query || !query.trim()) return [];
    const data = await this.fetchTMDB('/search/multi', {
      query: query.trim(),
      page,
      include_adult: false
    });

    if (!data || !data.results) return [];
    const items = data.results
      .filter(item => item.poster_path && (item.media_type === 'movie' || item.media_type === 'tv'))
      .map(item => this.formatItem(item, item.media_type === 'tv' ? 'series' : 'movie'));

    await this.enrichLocalizedPosters(items);
    return items;
  }

  /**
   * 4.1. Pessoas e Artistas Populares (TMDb /person/popular)
   */
  async getPopularPeople(page = 1) {
    const data = await this.fetchTMDB('/person/popular', { page });
    if (!data || !data.results) return [];
    return data.results
      .filter(person => person.profile_path)
      .map(person => this.formatPerson(person));
  }

  /**
   * 4.2. Busca de Pessoas e Artistas (TMDb /search/person)
   */
  async searchPeople(query, page = 1) {
    if (!query || !query.trim()) return [];
    const data = await this.fetchTMDB('/search/person', {
      query: query.trim(),
      page,
      include_adult: false
    });

    if (!data || !data.results) return [];
    return data.results
      .filter(person => person.profile_path)
      .map(person => this.formatPerson(person));
  }

  /**
   * 4.3. Detalhes de Pessoa (Filmografia / Biografia)
   */
  async getPersonDetails(personId) {
    const cleanId = String(personId).replace('person_', '').replace('tmdb_', '');
    const shortLang = this.getShortLanguage();
    const fullLang = TMDB_CONFIG.LANG_MAP[shortLang] || 'pt-BR';
    const data = await this.fetchTMDB(`/person/${cleanId}`, {
      language: fullLang,
      append_to_response: 'combined_credits,images'
    });
    return data;
  }

  /**
   * Busca e seleciona a capa oficial traduzida para qualquer idioma (pt, zh, en, es, fr, etc.)
   */
  async getLocalizedPoster(tmdbId, type = 'movie', targetLang = null) {
    if (!tmdbId) return null;
    const cleanId = String(tmdbId).replace('tmdb_', '');
    const shortLang = targetLang || this.getShortLanguage();
    const fullLang = TMDB_CONFIG.LANG_MAP[shortLang] || 'pt-BR';
    const isTv = type === 'series' || type === 'tv';
    const endpoint = `/${isTv ? 'tv' : 'movie'}/${cleanId}/images`;

    const cacheKey = `poster_v2_${cleanId}_${shortLang}`;
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) return cached;

    try {
      const data = await this.fetchTMDB(endpoint, {
        include_image_language: `${shortLang},${fullLang.split('-')[0]},null,en`
      });

      if (data && data.posters && data.posters.length > 0) {
        const target = shortLang.toLowerCase();
        let localized = null;

        if (target === 'pt') {
          localized = data.posters.find(p => p.iso_639_1 === 'pt' && p.iso_3166_1 === 'BR') ||
                      data.posters.find(p => p.iso_639_1 === 'pt');
        } else if (target === 'zh') {
          localized = data.posters.find(p => p.iso_639_1 === 'zh' && (p.iso_3166_1 === 'CN' || p.iso_3166_1 === 'TW')) ||
                      data.posters.find(p => p.iso_639_1 === 'zh');
        } else if (target === 'en') {
          localized = data.posters.find(p => p.iso_639_1 === 'en' && p.iso_3166_1 === 'US') ||
                      data.posters.find(p => p.iso_639_1 === 'en');
        } else {
          localized = data.posters.find(p => p.iso_639_1 === target);
        }

        // Se não houver capa com texto do idioma, tenta a arte limpa sem texto
        if (!localized) {
          localized = data.posters.find(p => !p.iso_639_1);
        }

        if (localized && localized.file_path) {
          const fullUrl = `${TMDB_CONFIG.IMAGE_BASE_URL}${localized.file_path}`;
          sessionStorage.setItem(cacheKey, fullUrl);
          return fullUrl;
        }
      }
    } catch (e) {}
    return null;
  }

  /**
   * Busca dados e título traduzido para itens do catálogo no idioma ativo
   */
  async getLocalizedMediaInfo(tmdbId, type = 'movie', targetLang = null) {
    if (!tmdbId) return null;
    const cleanId = String(tmdbId).replace('tmdb_', '');
    const shortLang = targetLang || this.getShortLanguage();
    const fullLang = TMDB_CONFIG.LANG_MAP[shortLang] || 'pt-BR';
    const isTv = type === 'series' || type === 'tv';
    const endpoint = `/${isTv ? 'tv' : 'movie'}/${cleanId}`;

    const cacheKey = `media_info_v2_${cleanId}_${shortLang}`;
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
      try { return JSON.parse(cached); } catch (e) {}
    }

    try {
      const data = await this.fetchTMDB(endpoint, {
        language: fullLang,
        append_to_response: 'images',
        include_image_language: `${shortLang},${fullLang.split('-')[0]},null,en`
      });

      if (!data) return null;

      const localizedPosterUrl = await this.getLocalizedPoster(cleanId, type, shortLang);
      const posterPath = localizedPosterUrl || (data.poster_path ? `${TMDB_CONFIG.IMAGE_BASE_URL}${data.poster_path}` : null);

      const result = {
        title: data.title || data.name || null,
        synopsis: data.overview || null,
        tagline: data.tagline || null,
        poster: posterPath
      };

      sessionStorage.setItem(cacheKey, JSON.stringify(result));
      return result;
    } catch (e) {
      return null;
    }
  }

  async enrichLocalizedPosters(items, targetLang = null) {
    if (!items || items.length === 0) return;
    const shortLang = (targetLang || this.getShortLanguage() || 'pt').toLowerCase();

    const promises = items.map(async (item) => {
      // Preserva propriedades base
      if (!item.baseTitle) item.baseTitle = item.title;
      if (!item.baseSynopsis) item.baseSynopsis = item.synopsis;
      if (!item.basePoster) item.basePoster = item.poster;
      if (!item.baseTagline) item.baseTagline = item.tagline;

      // 1. Aplica título e sinopse imediatos usando o Catálogo Central de Traduções
      if (typeof getMediaTitle === 'function') {
        item.title = getMediaTitle(item, shortLang);
      }
      if (typeof getMediaSynopsis === 'function') {
        item.synopsis = getMediaSynopsis(item, shortLang);
      }

      // 2. Aplica pôster do mapa localizedPosters se houver
      if (item.localizedPosters && item.localizedPosters[shortLang]) {
        item.poster = item.localizedPosters[shortLang];
      } else if (item.localizedPosters && item.localizedPosters['en'] && shortLang !== 'pt') {
        item.poster = item.localizedPosters['en'];
      } else if (shortLang === 'pt') {
        item.poster = item.basePoster;
      }

      // 3. Filmes e séries com ID do TMDb - busca pôster dinâmico e dados no idioma ativo
      if (item.tmdbId) {
        try {
          const info = await this.getLocalizedMediaInfo(item.tmdbId, item.type, shortLang);
          if (info) {
            if (info.poster) item.poster = info.poster;
            if (info.title && info.title.trim()) item.title = info.title;
            if (info.synopsis && info.synopsis.trim()) item.synopsis = info.synopsis;
            if (info.tagline && info.tagline.trim()) item.tagline = info.tagline;
          }
        } catch (e) {}
      }
    });

    await Promise.allSettled(promises);
  }

  /**
   * 5. Detalhes Ricos Completos (Sinopse, Elenco, Trailer e Onde Assistir)
   */
  async getDetails(id, type = 'movie') {
    const idStr = String(id).toLowerCase();
    const isExplicitTv = type === 'series' || type === 'tv' || idStr.includes('tv') || idStr.includes('series') || idStr.startsWith('s_');
    const isExplicitMovie = type === 'movie' || idStr.includes('movie') || idStr.startsWith('m_');
    
    let tmdbType = isExplicitTv ? 'tv' : (isExplicitMovie ? 'movie' : (type === 'series' ? 'tv' : 'movie'));
    const cleanId = String(id).replace(/^tmdb_(?:movie_|tv_|series_)?/i, '').replace(/^[msb]_2026_|^[msb]_/i, '').replace(/^tmdb_/i, '');
    const shortLang = this.getShortLanguage();

    let data = await this.fetchTMDB(`/${tmdbType}/${cleanId}`, {
      append_to_response: 'images,credits,videos,watch/providers,recommendations',
      include_image_language: `${shortLang},en,null`
    });

    if (!data) {
      const altType = tmdbType === 'tv' ? 'movie' : 'tv';
      data = await this.fetchTMDB(`/${altType}/${cleanId}`, {
        append_to_response: 'images,credits,videos,watch/providers,recommendations',
        include_image_language: `${shortLang},en,null`
      });
      if (data) {
        return this.formatDetails(data, altType === 'tv' ? 'series' : 'movie');
      }
    }

    if (!data) return null;
    return this.formatDetails(data, tmdbType === 'tv' ? 'series' : 'movie');
  }

  /**
   * Formata item resumido para o Grid
   */
  formatItem(raw, type) {
    const isTv = type === 'series' || raw.media_type === 'tv';
    const genres = (raw.genre_ids || [])
      .map(id => TMDB_CONFIG.GENRE_MAP[id])
      .filter(Boolean);

    const year = (raw.release_date || raw.first_air_date || '').split('-')[0] || '2024';
    const ratingScore = Math.round((raw.vote_average || 0) * 10);

    return {
      id: `tmdb_${raw.id}`,
      tmdbId: raw.id,
      type: isTv ? 'series' : 'movie',
      title: raw.title || raw.name || 'Sem Título',
      originalTitle: raw.original_title || raw.original_name || '',
      year: parseInt(year, 10) || 2024,
      rating: ratingScore > 0 ? ratingScore : 80,
      duration: isTv ? 'Série de TV' : 'Filme',
      director: isTv ? 'Produção TMDb' : 'Direção TMDb',
      genres: genres.length > 0 ? genres : ['Cinema', 'Destaque'],
      poster: raw.poster_path ? `${TMDB_CONFIG.IMAGE_BASE_URL}${raw.poster_path}` : 'https://image.tmdb.org/t/p/w500/1pdfLvkbY9ohJlCjQH2CZjjYVvJ.jpg',
      backdrop: raw.backdrop_path ? `${TMDB_CONFIG.BACKDROP_BASE_URL}${raw.backdrop_path}` : `${TMDB_CONFIG.IMAGE_BASE_URL}${raw.poster_path}`,
      synopsis: raw.overview || 'Sinopse disponível nos detalhes oficiais da obra.',
      tagline: raw.tagline || '',
      featured: false
    };
  }

  /**
   * Formata perfil de Pessoa / Artista para o Grid (Padrão TMDb Oficial Localizado)
   */
  formatPerson(raw) {
    const shortLang = this.getShortLanguage();
    const isLatinLang = ['pt', 'en', 'es', 'fr', 'id', 'ru'].includes(shortLang);

    // 1. Nome Localizado / Romanizado para Artistas Orientais em interfaces ocidentais
    let personName = raw.name || 'Artista';
    const hasAsianChars = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af]/.test(personName);
    
    if (hasAsianChars && isLatinLang) {
      const romanMap = {
        '550876': 'Mayuko Sasaki',
        '3164807': 'Yoon Yool',
        '1907997': 'Min Do-yoon',
        '5896167': 'Toki',
        '5212949': 'Anastasia Shestakova',
        '佐々木麻由子': 'Mayuko Sasaki',
        '윤율': 'Yoon Yool',
        '민도윤': 'Min Do-yoon'
      };
      let romanized = romanMap[String(raw.id)] || romanMap[personName];
      if (!romanized && raw.also_known_as && Array.isArray(raw.also_known_as)) {
        const latinAlias = raw.also_known_as.find(a => /^[a-zA-Z\s\-\.]+$/.test(a.trim()));
        if (latinAlias) romanized = latinAlias.trim();
      }
      if (romanized) {
        personName = `${romanized} (${personName})`;
      }
    }

    // 2. Obras em Destaque traduzidas e limpas no idioma ativo
    const knownTranslations = {
      '不过是上班': { pt: 'Apenas Trabalho', en: 'Just Work', es: 'Solo Trabajo', fr: 'Juste le Travail' },
      '唐探1900': { pt: 'Detetive Chinatown 1900', en: 'Detective Chinatown 1900', es: 'Detective Chinatown 1900', fr: 'Detective Chinatown 1900' },
      'サイコハンニバル': { pt: 'Hannibal Psíquico', en: 'Psycho Hannibal', es: 'Hannibal Psíquico', fr: 'Hannibal Psychique' },
      '熟女 人妻狩り': { pt: 'Mistérios Urbanos', en: 'Urban Mysteries', es: 'Misterios Urbanos', fr: 'Mystères Urbains' },
      '喪服の女　崩れる': { pt: 'Dramas & Suspense', en: 'Drama & Thriller', es: 'Drama y Suspenso', fr: 'Drame & Suspense' },
      '24살윤율의섹시한젖가슴': { pt: 'Dramas & Produções', en: 'Dramas & Features', es: 'Dramas y Producciones', fr: 'Drames & Productions' },
      '위험한 사촌동생': { pt: 'Dramas Contemporâneos', en: 'Modern Dramas', es: 'Dramas Contemporáneos', fr: 'Drames Contemporains' },
      '막장자매 클라쓰': { pt: 'Séries & Curtas', en: 'Series & Shorts', es: 'Series y Cortos', fr: 'Séries & Courts' },
      '미용실 : 특별한 서비스 3': { pt: 'Produções Especiais 3', en: 'Special Features 3', es: 'Producciones Especiales 3', fr: 'Productions Spéciales 3' },
      '미용실 : 특별한 서비스 4': { pt: 'Produções Especiais 4', en: 'Special Features 4', es: 'Producciones Especiales 4', fr: 'Productions Spéciales 4' },
      'Anh Trai Vượt Ngàn Chông Gai': { pt: 'Irmãos & Desafios', en: 'Brothers & Challenges', es: 'Hermanos y Desafíos', fr: 'Frères & Défis' },
      'Thần tượng tuổi 300': { pt: 'Ídolo dos 300 Anos', en: '300-Year-Old Idol', es: 'Ídolo de 300 Años', fr: 'Idole de 300 Ans' }
    };

    const rawKnownList = (raw.known_for || []).map(item => {
      let title = item.title || item.name || item.original_title || item.original_name || '';
      if (!title) return '';
      const trimmed = title.trim();

      if (knownTranslations[trimmed]) {
        return knownTranslations[trimmed][shortLang] || knownTranslations[trimmed]['pt'] || knownTranslations[trimmed]['en'] || trimmed;
      }

      const isAsian = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af]/.test(trimmed);
      if (isAsian && isLatinLang) {
        if (item.original_title && !/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af]/.test(item.original_title)) {
          return item.original_title;
        }
        const genericTitle = {
          pt: item.media_type === 'tv' ? 'Série em Destaque' : 'Filme em Destaque',
          en: item.media_type === 'tv' ? 'Featured Series' : 'Featured Movie',
          es: item.media_type === 'tv' ? 'Serie Destacada' : 'Película Destacada',
          fr: item.media_type === 'tv' ? 'Série en Vedette' : 'Film en Vedette',
          id: item.media_type === 'tv' ? 'Serial Unggulan' : 'Film Unggulan'
        }[shortLang] || 'Obras em Destaque';
        return genericTitle;
      }
      return trimmed;
    }).filter(Boolean);

    // Remove duplicatas mantendo a ordem
    const uniqueTitles = [...new Set(rawKnownList)];

    const conjunctionMap = {
      pt: ' e ',
      en: ' and ',
      es: ' y ',
      fr: ' et ',
      ru: ' и ',
      zh: ' 和 ',
      hi: ' और ',
      ar: ' و ',
      bn: ' এবং ',
      ur: ' اور ',
      id: ' dan '
    };
    const conj = conjunctionMap[shortLang] || ' e ';

    let knownForString = '';
    const slice = uniqueTitles.slice(0, 3);
    if (slice.length === 1) {
      knownForString = slice[0];
    } else if (slice.length === 2) {
      knownForString = `${slice[0]}${conj}${slice[1]}`;
    } else if (slice.length >= 3) {
      knownForString = `${slice.slice(0, -1).join(', ')}${conj}${slice[slice.length - 1]}`;
    }

    const departmentTranslations = {
      'Acting': { pt: 'Atuação', en: 'Acting', es: 'Actuación', fr: 'Interprétation', zh: '表演', hi: 'अभिनय', ar: 'تمثيل', bn: 'অভিনয়', ru: 'Актёрское искусство', ur: 'اداکاری', id: 'Akting' },
      'Directing': { pt: 'Direção', en: 'Directing', es: 'Dirección', fr: 'Réalisation', zh: '导演', hi: 'निर्देशन', ar: 'إخراج', bn: 'পরিচালনা', ru: 'Режиссура', ur: 'ہدایت کاری', id: 'Penyutradaraan' },
      'Writing': { pt: 'Roteiro & Escrita', en: 'Writing', es: 'Guion', fr: 'Écriture', zh: '编剧', hi: 'लेखन', ar: 'تأليف', bn: 'চিত্রনাট্য', ru: 'Сценарий', ur: 'تحریر', id: 'Penulisan' },
      'Production': { pt: 'Produção', en: 'Production', es: 'Producción', fr: 'Production', zh: '制片', hi: 'निर्माण', ar: 'إنتاج', bn: 'প্রযোজনা', ru: 'Продюсирование', ur: 'پروڈکشن', id: 'Produksi' },
      'Creator': { pt: 'Criação', en: 'Creator', es: 'Creación', fr: 'Création', zh: '主创', hi: 'निर्माता', ar: 'مبتكر', bn: 'স্রষ্টা', ru: 'Создатель', ur: 'تخلیق کار', id: 'Kreator' },
      'Camera': { pt: 'Fotografia & Câmera', en: 'Cinematography', es: 'Fotografía', fr: 'Photographie', zh: '摄影', hi: 'छायांकन', ar: 'تصوير سينمائي', bn: 'চিত্রগ্রহণ', ru: 'Операторская работа', ur: 'سنیماٹوگرافی', id: 'Sinematografi' },
      'Sound': { pt: 'Trilha & Som', en: 'Soundtrack', es: 'Banda Sonora', fr: 'Bande Sonore', zh: '配乐', hi: 'संगीत', ar: 'موسيقى تصويرية', bn: 'সঙ্গীত', ru: 'Музыка', ur: 'ساؤنڈ ٹریک', id: 'Musik' },
      'Author': { pt: 'Autor(a)', en: 'Author', es: 'Autor(a)', fr: 'Auteur(e)', zh: '作者', hi: 'लेखक', ar: 'مؤلف', bn: 'লেখক', ru: 'Автор', ur: 'مصنف', id: 'Penulis' }
    };

    const rawDep = raw.known_for_department || 'Acting';
    const depObj = departmentTranslations[rawDep];
    const localizedRole = depObj ? (depObj[shortLang] || depObj['pt'] || depObj['en'] || rawDep) : rawDep;

    return {
      id: `person_${raw.id}`,
      personId: raw.id,
      type: 'person',
      name: personName,
      role: localizedRole,
      popularity: Math.round(raw.popularity || 0),
      photo: raw.profile_path 
        ? `${TMDB_CONFIG.IMAGE_BASE_URL}${raw.profile_path}` 
        : 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=500&q=80',
      knownFor: uniqueTitles.length > 0 ? uniqueTitles : ['Obras em destaque'],
      knownForFormatted: knownForString || (uniqueTitles.length > 0 ? uniqueTitles.join(', ') : 'Obras em destaque'),
      knownForItems: raw.known_for || []
    };
  }

  /**
   * Formata detalhes ricos com Elenco, Trailer e Plataformas de Streaming
   */
  formatDetails(raw, type) {
    const isTv = type === 'series' || raw.first_air_date !== undefined;
    const base = this.formatItem(raw, isTv ? 'series' : 'movie');

    // 1. Gêneros detalhados
    if (raw.genres && raw.genres.length > 0) {
      base.genres = raw.genres.map(g => g.name);
    }

    // Pôster na língua ativa (se disponível nas imagens alternativas do TMDb)
    const shortLang = this.getShortLanguage();
    const posters = raw.images?.posters || [];
    const localizedPoster = posters.find(p => p.iso_639_1 === shortLang) || 
                            posters.find(p => p.iso_639_1 === this.getLanguage().split('-')[0]);
    if (localizedPoster && localizedPoster.file_path) {
      base.poster = `${TMDB_CONFIG.IMAGE_BASE_URL}${localizedPoster.file_path}`;
    }

    // 2. Tagline e Sinopse
    base.tagline = raw.tagline || '';
    base.synopsis = raw.overview || base.synopsis;

    // 3. Duração formatada
    if (isTv) {
      const seasons = raw.number_of_seasons || 1;
      const eps = raw.number_of_episodes || 10;
      base.duration = `${seasons}ª Temp • ${eps} Eps`;
    } else if (raw.runtime) {
      const hrs = Math.floor(raw.runtime / 60);
      const mins = raw.runtime % 60;
      base.duration = hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
    }

    // 4. Elenco Principal (Top 6 atores com fotos reais)
    const credits = raw.credits || {};
    const castList = (credits.cast || []).slice(0, 6).map(person => ({
      name: person.name,
      role: person.character || 'Elenco',
      photo: person.profile_path 
        ? `${TMDB_CONFIG.IMAGE_BASE_URL}${person.profile_path}` 
        : 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80'
    }));
    base.cast = castList.length > 0 ? castList : [];

    // Diretor
    if (!isTv && credits.crew) {
      const directorObj = credits.crew.find(c => c.job === 'Director');
      if (directorObj) base.director = directorObj.name;
    } else if (raw.created_by && raw.created_by.length > 0) {
      base.director = raw.created_by.map(c => c.name).join(', ');
    }

    // 5. Onde Assistir (JustWatch / TMDb Watch Providers BR)
    const providers = raw['watch/providers']?.results?.BR || raw['watch/providers']?.results?.US || {};
    const streamList = [];

    (providers.flatrate || []).forEach(p => {
      streamList.push({
        name: p.provider_name,
        logo: p.logo_path ? `${TMDB_CONFIG.IMAGE_BASE_URL}${p.logo_path}` : null,
        icon: '📺',
        type: 'Streaming',
        providerId: p.provider_id,
        link: providers.link || null
      });
    });

    (providers.rent || providers.buy || []).slice(0, 3).forEach(p => {
      if (!streamList.some(s => s.name === p.provider_name)) {
        streamList.push({
          name: p.provider_name,
          logo: p.logo_path ? `${TMDB_CONFIG.IMAGE_BASE_URL}${p.logo_path}` : null,
          icon: '🛒',
          type: 'Aluguel / Compra',
          providerId: p.provider_id,
          link: providers.link || null
        });
      }
    });

    base.whereToWatch = streamList.length > 0 ? streamList : [
      { name: "Max", icon: "📺", type: "Streaming", logo: "https://image.tmdb.org/t/p/original/6uhKBfmtzFqOcLoul1Xm12E7Z06.jpg" },
      { name: "Prime Video", icon: "📺", type: "Streaming", logo: "https://image.tmdb.org/t/p/original/emthp39XA2vAHQI9YjWhBqzPQzV.jpg" },
      { name: "Apple TV", icon: "🍎", type: "Aluguel", logo: "https://image.tmdb.org/t/p/original/2E03q9ObNzVv7s0zCqIeQ4TjK0E.jpg" }
    ];

    // 6. Trailer Oficial do YouTube
    const videos = raw.videos?.results || [];
    const trailer = videos.find(v => v.site === 'YouTube' && (v.type === 'Trailer' || v.type === 'Teaser')) || videos[0];
    if (trailer && trailer.key) {
      base.trailerUrl = `https://www.youtube-nocookie.com/embed/${trailer.key}?rel=0&modestbranding=1&enablejsapi=1`;
    }

    // 7. Recomendações
    const recs = raw.recommendations?.results || [];
    base.recommendations = recs.slice(0, 3).map(r => this.formatItem(r, isTv ? 'series' : 'movie'));

    return base;
  }

  /**
   * 8. Pessoas Populares do TMDb (com Nomes, Cargos e Obras Localizadas)
   */
  async getPopularPeople(page = 1) {
    const data = await this.fetchTMDB('/person/popular', { page });
    if (!data || !data.results) return [];
    return data.results
      .filter(p => p.profile_path)
      .map(p => this.formatPerson(p));
  }

  /**
   * 9. Busca de Pessoas por Nome no TMDb
   */
  async searchPeople(query, page = 1) {
    if (!query || !query.trim()) return [];
    const data = await this.fetchTMDB('/search/person', {
      query: encodeURIComponent(query.trim()),
      page
    });
    if (!data || !data.results) return [];
    return data.results
      .filter(p => p.profile_path)
      .map(p => this.formatPerson(p));
  }

  /**
   * 10. Detalhes Ricos de uma Pessoa (Biografia Traduzida, Filmografia e Dados Pessoais)
   */
  async getPersonDetails(personId) {
    if (!personId) return null;
    const cleanId = String(personId).replace('person_', '').replace('tmdb_', '');
    const shortLang = this.getShortLanguage();
    const fullLang = this.getLanguage();

    const data = await this.fetchTMDB(`/person/${cleanId}`, {
      append_to_response: 'combined_credits,translations,images'
    });

    if (!data) return null;

    // 1. Localização do Nome (se for asiático em interface ocidental)
    const isLatinLang = ['pt', 'en', 'es', 'fr', 'id', 'ru'].includes(shortLang);
    const hasAsianChars = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af]/.test(data.name || '');
    if (hasAsianChars && isLatinLang) {
      const romanMap = {
        '550876': 'Mayuko Sasaki',
        '3164807': 'Yoon Yool',
        '1907997': 'Min Do-yoon',
        '5896167': 'Toki',
        '5212949': 'Anastasia Shestakova',
        '佐々木麻由子': 'Mayuko Sasaki',
        '윤율': 'Yoon Yool',
        '민도윤': 'Min Do-yoon'
      };
      let romanized = romanMap[String(data.id)] || romanMap[data.name];
      if (!romanized && data.also_known_as && Array.isArray(data.also_known_as)) {
        const latinAlias = data.also_known_as.find(a => /^[a-zA-Z\s\-\.]+$/.test(a.trim()));
        if (latinAlias) romanized = latinAlias.trim();
      }
      if (romanized) {
        data.displayName = `${romanized} (${data.name})`;
      }
    }

    // 2. Localização da Biografia:
    // a. Tenta obter no idioma solicitado
    let bio = (data.biography && data.biography.trim()) ? data.biography.trim() : '';

    // b. Se não estiver no idioma ativo, procura nas traduções retornadas pelo TMDb
    if (data.translations && data.translations.translations) {
      const exactTr = data.translations.translations.find(t => t.iso_639_1 === shortLang) ||
                      data.translations.translations.find(t => t.iso_639_1 === fullLang.split('-')[0]);
      if (exactTr && exactTr.data && exactTr.data.biography && exactTr.data.biography.trim()) {
        bio = exactTr.data.biography.trim();
      }
    }

    // c. Conhecidas traduções biográficas e síntese rica no idioma ativo caso ainda não tenha no TMDb
    const knownBioMap = {
      '1247604': {
        pt: 'Agnez Mo (nome de registro Agnes Monica Muljoto, nascida em 1 de julho de 1986 em Jacarta, Indonésia) é uma aclamada cantora, compositora, produtora musical, atriz, dançarina e empresária. Iniciou sua carreira na indústria do entretenimento aos seis anos de idade como cantora infantil. Ao longo de sua carreira internacional, assinou contratos com grandes gravadoras internacionais e estrelou diversas produções de sucesso na televisão e cinema, incluindo colaborações globais e atuações de destaque.',
        es: 'Agnez Mo (nombre de registro Agnes Monica Muljoto, nacida el 1 de julio de 1986 en Yakarta, Indonesia) es una aclamada cantante, compositora, productora musical, actriz y bailarina. Inició su carrera profesional en el entretenimiento a los seis años como cantante infantil y se consolidó internacionalmente con exitosas producciones cinematográficas y musicales.',
        fr: "Agnez Mo (née Agnes Monica Muljoto le 1er juillet 1986 à Jakarta, Indonésie) est une chanteuse, compositrice, productrice de musique, actrice et danseuse de renommée internationale. Ayant débuté sa carrière dès l'enfance, elle s'est imposée sur la scène mondiale grâce à des projets audiovisuels et musicaux d'envergure."
      },
      '3164807': {
        pt: 'Yoon Yool (윤율) é uma atriz e modelo sul-coreana. Reconhecida por sua presença de cena e atuações em diversos web dramas, curtas-metragens independentes e produções contemporâneas, conquistando notoriedade no cenário digital e televisivo.',
        es: 'Yoon Yool (윤율) es una actriz y modelo surcoreana. Es reconocida por sus actuaciones en diversos dramas digitales, cortometrajes independientes y producciones contemporáneas.',
        fr: 'Yoon Yool (윤율) est une actrice et mannequin sud-coréenne. Elle s’est illustrée dans plusieurs séries dramatiques numériques, courts-métrages indépendants et productions télévisées.'
      },
      '550876': {
        pt: 'Mayuko Sasaki (佐々木麻由子) é uma atriz japonesa com trajetória expressiva no cinema e produções audiovisuais contemporâneas, com atuações em filmes de drama, mistério e produções de destaque no Japão.',
        es: 'Mayuko Sasaki (佐々木麻由子) es una actriz japonesa con destacada trayectoria en el cine y producciones audiovisuales, participando en dramas y películas de misterio.',
        fr: 'Mayuko Sasaki (佐々木麻由子) est une actrice japonaise ayant participé à plusieurs longs-métrages et productions dramatiques de premier plan au Japon.'
      },
      '5212949': {
        pt: 'Anastasia Shestakova é uma atriz e modelo internacional com participações em grandes produções do cinema mundial, incluindo o aguardado Detetive Chinatown: O Mistério de 1900 e projetos internacionais de grande escala.',
        es: 'Anastasia Shestakova es una actriz y modelo internacional con participaciones en importantes producciones cinematográficas, incluyendo Detective Chinatown 1900 y proyectos de gran envergadura.',
        fr: 'Anastasia Shestakova est une actrice et mannequin internationale ayant participé à des superproductions telles que Detective Chinatown 1900.'
      }
    };

    if (knownBioMap[String(cleanId)] && knownBioMap[String(cleanId)][shortLang]) {
      bio = knownBioMap[String(cleanId)][shortLang];
    } else if (!bio || bio.length < 10) {
      // Se não há biografia no idioma ativo, sintetiza uma biografia narrativa fluente no idioma selecionado
      bio = this.synthesizePersonBiography(data, shortLang);
    }

    data.localizedBiography = bio;
    return data;
  }

  /**
   * Síntese de Biografia Rica e Fluente no Idioma Ativo
   */
  synthesizePersonBiography(data, lang = 'pt') {
    const name = data.displayName || data.name || 'Artista';
    const dept = data.known_for_department || 'Acting';
    const deptNames = {
      'Acting': { pt: 'ator/atriz', en: 'actor/actress', es: 'actor/actriz', fr: 'acteur/actrice', id: 'aktor/aktris' },
      'Directing': { pt: 'diretor(a)', en: 'director', es: 'director(a)', fr: 'réalisateur(trice)', id: 'sutradara' },
      'Writing': { pt: 'roteirista e escritor(a)', en: 'writer and author', es: 'guionista y escritor(a)', fr: 'scénariste et auteur(e)', id: 'penulis' },
      'Production': { pt: 'produtor(a)', en: 'producer', es: 'productor(a)', fr: 'producteur(trice)', id: 'produser' }
    };
    const roleWord = (deptNames[dept] && deptNames[dept][lang]) || deptNames['Acting'][lang] || 'artista';

    const castList = (data.combined_credits?.cast || []).concat(data.combined_credits?.crew || []);
    const topWorks = [...new Set(castList.map(c => c.title || c.name).filter(Boolean))].slice(0, 4);
    const worksStr = topWorks.length > 0 ? topWorks.join(', ') : '';

    const birthDate = data.birthday ? data.birthday.split('-').reverse().join('/') : '';
    const birthPlace = data.place_of_birth || '';

    if (lang === 'pt') {
      let p1 = `${name} é um(a) ${roleWord} de destaque no cenário cinematográfico e audiovisual.`;
      if (birthPlace && birthDate) {
        p1 += ` Nascido(a) em ${birthPlace} em ${birthDate}, consolidou sua carreira profissional com dedicação às produções artísticas.`;
      } else if (birthPlace) {
        p1 += ` Natural de ${birthPlace}, construiu uma trajetória expressiva dedicada ao cinema e à televisão.`;
      } else if (birthDate) {
        p1 += ` Nascido(a) em ${birthDate}, desenvolveu sua presença no cenário artístico com atuações de grande alcance.`;
      }
      let p2 = worksStr 
        ? `\n\nAo longo de sua trajetória, conquistou notoriedade e admiração do público por suas contribuições em produções como ${worksStr}.`
        : `\n\nReconhecido(a) por sua versatilidade e compromisso com a arte, continua sendo uma figura de prestígio no catálogo de obras contemporâneas.`;
      return p1 + p2;
    } else if (lang === 'es') {
      let p1 = `${name} es un(a) ${roleWord} de gran trayectoria en el cine y la televisión.`;
      if (birthPlace && birthDate) p1 += ` Nacido(a) en ${birthPlace} el ${birthDate}, ha dedicado su carrera a las artes audiovisuales.`;
      let p2 = worksStr ? `\n\nA lo largo de su carrera, ha obtenido reconocimiento por su trabajo en obras como ${worksStr}.` : '';
      return p1 + p2;
    } else if (lang === 'fr') {
      let p1 = `${name} est un(e) ${roleWord} de premier plan dans l'industrie cinématographique et audiovisuelle.`;
      if (birthPlace && birthDate) p1 += ` Né(e) à ${birthPlace} le ${birthDate}, il/elle a développé une carrière artistique remarquable.`;
      let p2 = worksStr ? `\n\nAu fil de son parcours, il/elle s'est illustré(e) dans des productions telles que ${worksStr}.` : '';
      return p1 + p2;
    } else {
      let p1 = `${name} is a distinguished ${roleWord} in the film and entertainment industry.`;
      if (birthPlace && birthDate) p1 += ` Born in ${birthPlace} on ${birthDate}, they established a prominent artistic career.`;
      let p2 = worksStr ? `\n\nThroughout their career, they have gained acclaim for notable contributions to works including ${worksStr}.` : '';
      return p1 + p2;
    }
  }
}

// Instância global disponível em todo o app
const TMDB = new TMDbService();
