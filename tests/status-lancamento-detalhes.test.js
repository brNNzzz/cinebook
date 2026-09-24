const { chromium } = require('playwright');
const SHOTS = require('path').join(__dirname, 'screenshots') + '/';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:8090';
const pass = (m) => console.log('  PASS  ' + m);
const fail = (m) => { console.log('  FAIL  ' + m); process.exitCode = 1; };

function isoDaysAgo(days) { const d = new Date(); d.setDate(d.getDate() - days); return d.toISOString().slice(0, 10); }
function isoDaysAhead(days) { const d = new Date(); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10); }

const FAKE_CAST = [{ name: 'Ator Teste', character: 'Protagonista', profile_path: '/fake1.jpg' }];

const MOVIES = {
  9001: {
    id: 9001, title: 'Filme Não Lançado', overview: 'Sinopse teste', status: 'Post Production',
    release_date: isoDaysAhead(120), genres: [{ name: 'Ficção Científica' }], runtime: 130,
    credits: { cast: FAKE_CAST, crew: [] }, videos: { results: [] },
    'watch/providers': { results: {} }, recommendations: { results: [] },
  },
  9002: {
    id: 9002, title: 'Filme Recem Lancado', overview: 'Sinopse teste 2', status: 'Released',
    release_date: isoDaysAgo(10), genres: [{ name: 'Ação' }], runtime: 110,
    credits: { cast: FAKE_CAST, crew: [] },
    videos: { results: [{ site: 'YouTube', type: 'Trailer', key: 'zzzzzzzzzzz' }] },
    'watch/providers': { results: { BR: { flatrate: [{ provider_name: 'Netflix', provider_id: 8, logo_path: '/n.jpg' }] } } },
    recommendations: { results: [] },
  },
  1325734: {
    id: 1325734, title: 'O Drama', overview: 'Sinopse real', status: 'Planned',
    release_date: isoDaysAhead(200), genres: [{ name: 'Drama' }], runtime: 130,
    credits: { cast: [], crew: [] }, videos: { results: [] },
    'watch/providers': { results: {} }, recommendations: { results: [] },
  },
};

async function mockTmdb(page) {
  await page.route('**/api.themoviedb.org/**', async (route) => {
    const url = route.request().url();
    const m = url.match(/\/3\/movie\/(\d+)/);
    if (m && MOVIES[m[1]]) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOVIES[m[1]]) });
    }
    return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({}) });
  });
}

async function inspect(page) {
  return page.evaluate(() => {
    const vis = (id) => {
      const el = document.getElementById(id);
      if (!el) return 'MISSING';
      return window.getComputedStyle(el).display !== 'none' ? 'visible' : 'hidden';
    };
    return {
      trailer: vis('detailsMediaPreviewBlock'),
      providers: vis('detailsProvidersBlock'),
      reviews: vis('detailsReviewsBlock'),
      ticketDisplay: document.getElementById('btnBuyTicket')?.style.display || null,
      ticketHref: document.getElementById('btnBuyTicket')?.href || null,
    };
  });
}

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
    args: ['--no-sandbox'],
  });
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const page = await context.newPage();
  await mockTmdb(page);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  console.log('\n=== detalhes.html?id=tmdb_9001 (não lançado) ===');
  await page.goto(BASE + '/detalhes.html?id=tmdb_9001', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);
  let r = await inspect(page);
  r.providers === 'hidden' ? pass('onde-assistir escondido') : fail('onde-assistir: ' + r.providers);
  r.reviews === 'hidden' ? pass('avaliações escondidas') : fail('avaliações: ' + r.reviews);
  r.trailer === 'hidden' ? pass('trailer escondido (sem trailer cadastrado)') : fail('trailer: ' + r.trailer);
  (r.ticketDisplay === 'none' || !r.ticketDisplay) ? pass('sem botão de ingresso') : fail('ticket: ' + r.ticketDisplay);

  console.log('\n=== detalhes.html?id=tmdb_9002 (em cartaz) ===');
  await page.goto(BASE + '/detalhes.html?id=tmdb_9002', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);
  r = await inspect(page);
  r.providers === 'visible' ? pass('onde-assistir visível') : fail('onde-assistir: ' + r.providers);
  r.reviews === 'visible' ? pass('avaliações visíveis') : fail('avaliações: ' + r.reviews);
  r.trailer === 'visible' ? pass('trailer visível') : fail('trailer: ' + r.trailer);
  r.ticketDisplay === 'inline-flex' ? pass('botão de ingresso visível') : fail('ticket: ' + r.ticketDisplay);
  r.ticketHref && r.ticketHref.includes('ingresso.com') ? pass('link correto: ' + r.ticketHref) : fail('link: ' + r.ticketHref);

  console.log('\n=== detalhes.html?id=m_2026_odrama (local, sobrescrito pela TMDB p/ "ainda não lançado") ===');
  await page.goto(BASE + '/detalhes.html?id=m_2026_odrama', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);
  r = await inspect(page);
  r.providers === 'hidden' ? pass('onde-assistir escondido (não confia no A24/Max cadastrado à mão)') : fail('onde-assistir: ' + r.providers);
  r.reviews === 'hidden' ? pass('avaliações escondidas') : fail('avaliações: ' + r.reviews);

  console.log('\n=== Erros de página ===');
  errors.length === 0 ? pass('nenhum erro JS') : fail('erros: ' + errors.slice(0, 5).join(' | '));

  await page.screenshot({ path: SHOTS + 'details_em_cartaz.png', fullPage: true });
  await page.goto(BASE + '/detalhes.html?id=tmdb_9001', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);
  await page.screenshot({ path: SHOTS + 'details_nao_lancado.png', fullPage: true });

  await browser.close();
  console.log('\n=== fim ===');
})();
