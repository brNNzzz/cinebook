const { chromium } = require('playwright');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8090';
const SHOTS = require('path').join(__dirname, 'screenshots') + '/';
const pass = (m) => console.log('  PASS  ' + m);
const fail = (m) => { console.log('  FAIL  ' + m); process.exitCode = 1; };

const SEARCH_INTERSTELLAR = {
  page: 1, total_results: 1, results: [{
    id: 157336, media_type: 'movie', title: 'Interestelar', original_title: 'Interstellar',
    release_date: '2014-11-05', vote_average: 8.4, vote_count: 35000, genre_ids: [12, 18, 878],
    poster_path: '/nCbkOyOMTEwlEV0LtCOvCnwEONA.jpg', backdrop_path: '/x.jpg', overview: 'x',
  }],
};

async function newPage(browser, { tmdb = 'down', proxy = 'absent' } = {}) {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const page = await context.newPage();
  const hits = { direct: 0, proxy: 0 };
  // Nada externo (fontes, imagens) — só o que o teste controla.
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (route) => {
    const url = route.request().url();
    if (url.includes('api.themoviedb.org')) {
      hits.direct++;
      if (tmdb === 'down') return route.abort('connectionrefused');
      if (url.includes('/search/multi')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SEARCH_INTERSTELLAR) });
      return route.fulfill({ status: 404, contentType: 'application/json', body: '{"status_message":"nf"}' });
    }
    return route.abort();
  });
  if (proxy === 'present') {
    await page.route('**/tmdb-api/**', (route) => {
      hits.proxy++;
      const url = route.request().url();
      if (url.includes('/search/multi')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SEARCH_INTERSTELLAR) });
      return route.fulfill({ status: 404, contentType: 'application/json', body: '{"status_message":"nf"}' });
    });
  }
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return { page, hits, errors, context };
}

async function inspectDetails(page) {
  return page.evaluate(() => {
    const vis = (id) => { const el = document.getElementById(id); if (!el) return 'MISSING'; return getComputedStyle(el).display !== 'none' ? 'visible' : 'hidden'; };
    const badge = document.getElementById('detailsScoreCircle')?.closest('.score-badge');
    return {
      providers: vis('detailsProvidersBlock'), reviews: vis('detailsReviewsBlock'), trailer: vis('detailsMediaPreviewBlock'),
      ticket: document.getElementById('btnBuyTicket')?.style.display,
      scoreBadge: badge ? getComputedStyle(badge).display : 'MISSING',
      scoreLabel: document.querySelector('.details-score-label')?.textContent,
      techStatus: document.getElementById('techStatus')?.textContent,
      year: document.getElementById('detailsYear')?.textContent,
    };
  });
}

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });

  console.log('\n=== 1. Guerras Secretas com a TMDB FORA DO AR (o caso do print) ===');
  {
    const { page, errors, context } = await newPage(browser, { tmdb: 'down' });
    await page.goto(BASE + '/detalhes.html?id=m_2026_secretwars', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    const r = await inspectDetails(page);
    r.scoreBadge === 'none' ? pass('nota do público escondida') : fail('nota do público: ' + r.scoreBadge);
    /17\/12\/2027/.test(r.scoreLabel) ? pass('mostra a estreia: ' + r.scoreLabel) : fail('label: ' + r.scoreLabel);
    r.reviews === 'hidden' ? pass('avaliações escondidas') : fail('avaliações: ' + r.reviews);
    r.providers === 'hidden' ? pass('onde assistir (Disney+/Cinema) escondido') : fail('onde assistir: ' + r.providers);
    r.trailer === 'hidden' ? pass('sem trailer') : fail('trailer: ' + r.trailer);
    r.ticket !== 'inline-flex' ? pass('sem botão de ingresso') : fail('ingresso visível');
    r.techStatus === 'Ainda não lançado' ? pass('ficha técnica: ' + r.techStatus) : fail('ficha técnica: ' + r.techStatus);
    r.year === '2027' ? pass('ano correto: 2027') : fail('ano: ' + r.year);
    await page.screenshot({ path: SHOTS + 'r2_secretwars.png', fullPage: false });
    errors.length === 0 ? pass('sem erros JS') : fail('erros: ' + errors.join(' | '));
    await context.close();
  }

  console.log('\n=== 2. Homem-Aranha: Um Novo Dia (estreou 30/07/2026) com a TMDB fora do ar ===');
  {
    const { page, context } = await newPage(browser, { tmdb: 'down' });
    await page.goto(BASE + '/detalhes.html?id=m_2026_spiderman4', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    const r = await inspectDetails(page);
    r.ticket === 'inline-flex' ? pass('botão de ingresso (em cartaz)') : fail('ingresso: ' + r.ticket);
    r.reviews === 'visible' ? pass('avaliações visíveis') : fail('avaliações: ' + r.reviews);
    r.scoreBadge !== 'none' ? pass('nota visível') : fail('nota escondida');
    r.techStatus === 'Em cartaz nos cinemas' ? pass('ficha técnica: ' + r.techStatus) : fail('ficha técnica: ' + r.techStatus);
    await context.close();
  }

  console.log('\n=== 3. Card de Guerras Secretas no catálogo ===');
  {
    const { page, context } = await newPage(browser, { tmdb: 'down' });
    await page.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);
    const card = await page.evaluate(() => {
      const cards = [...document.querySelectorAll('.media-card, article')].filter(c => c.textContent.includes('Guerras Secretas'));
      if (!cards.length) return null;
      return { soon: !!cards[0].querySelector('.coming-soon-badge'), score: !!cards[0].querySelector('.score-badge'), text: cards[0].querySelector('.coming-soon-badge')?.textContent.trim() };
    });
    if (!card) fail('card não encontrado');
    else {
      card.soon && !card.score ? pass('card mostra "' + card.text.replace(/\s+/g, ' ') + '" no lugar da nota') : fail('card: ' + JSON.stringify(card));
    }
    await context.close();
  }

  for (const mode of ['direto', 'proxy']) {
    console.log(`\n=== 4. Pesquisa "interestelar" na aba Filmes (TMDB ${mode}) ===`);
    const { page, hits, context, errors } = await newPage(browser, mode === 'proxy' ? { tmdb: 'down', proxy: 'present' } : { tmdb: 'up' });
    await page.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    await page.fill('#searchInput', 'interestelar');
    await page.waitForTimeout(1500);
    const found = await page.evaluate(() => [...document.querySelectorAll('#mediaGrid .card-title')].map(e => e.textContent));
    found.includes('Interestelar') ? pass('Interestelar (2014) aparece: ' + JSON.stringify(found)) : fail('resultados: ' + JSON.stringify(found));
    if (mode === 'proxy') hits.proxy > 0 ? pass(`usou o proxy /tmdb-api (${hits.proxy} chamadas)`) : fail('proxy não usado');
    await page.fill('#searchInput', 'INTERSTELLAR');
    await page.waitForTimeout(1500);
    const found2 = await page.evaluate(() => [...document.querySelectorAll('#mediaGrid .card-title')].map(e => e.textContent));
    found2.includes('Interestelar') ? pass('busca pelo título original em maiúsculas também acha') : fail('resultados2: ' + JSON.stringify(found2));
    await page.fill('#searchInput', 'guerras secretas');
    await page.waitForTimeout(600);
    const found3 = await page.evaluate(() => [...document.querySelectorAll('#mediaGrid .card-title')].map(e => e.textContent));
    found3.some(t => t.includes('Guerras Secretas')) ? pass('filmes locais continuam aparecendo na busca') : fail('local: ' + JSON.stringify(found3));
    if (mode === 'proxy') await page.screenshot({ path: SHOTS + 'r2_search.png', fullPage: false });
    errors.length === 0 ? pass('sem erros JS') : fail('erros: ' + errors.join(' | '));
    await context.close();
  }

  await browser.close();
  console.log('\n=== fim ===');
})();
