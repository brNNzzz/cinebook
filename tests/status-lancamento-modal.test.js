const { chromium } = require('playwright');

const BASE = process.env.BASE_URL || 'http://127.0.0.1:8090';
const pass = (m) => console.log('  PASS  ' + m);
const fail = (m) => { console.log('  FAIL  ' + m); process.exitCode = 1; };

function isoDaysAgo(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}
function isoDaysAhead(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

const FAKE_CAST = [
  { name: 'Ator Teste', character: 'Protagonista', profile_path: '/fake1.jpg' },
  { name: 'Atriz Teste', character: 'Coadjuvante', profile_path: '/fake2.jpg' },
];

const MOVIES = {
  // Não lançado ainda, mas JÁ tem trailer real divulgado (comum em blockbusters).
  9001: {
    id: 9001,
    title: 'Filme Não Lançado',
    overview: 'Sinopse de teste.',
    status: 'Post Production',
    release_date: isoDaysAhead(120),
    genres: [{ name: 'Ficção Científica' }],
    runtime: 130,
    credits: { cast: FAKE_CAST, crew: [{ job: 'Director', name: 'Diretor Teste' }] },
    videos: { results: [{ site: 'YouTube', type: 'Trailer', key: 'abcdefghijk' }] },
    'watch/providers': { results: {} },
    recommendations: { results: [] },
  },
  // Lançado há 10 dias: deve estar "em cartaz".
  9002: {
    id: 9002,
    title: 'Filme Recem Lancado',
    overview: 'Sinopse de teste 2.',
    status: 'Released',
    release_date: isoDaysAgo(10),
    genres: [{ name: 'Ação' }],
    runtime: 110,
    credits: { cast: FAKE_CAST, crew: [{ job: 'Director', name: 'Diretor Teste' }] },
    videos: { results: [{ site: 'YouTube', type: 'Trailer', key: 'zzzzzzzzzzz' }] },
    'watch/providers': { results: { BR: { flatrate: [{ provider_name: 'Netflix', provider_id: 8, logo_path: '/n.jpg' }] } } },
    recommendations: { results: [] },
  },
  // Lançado há 300 dias: já saiu de cartaz.
  9003: {
    id: 9003,
    title: 'Filme Antigo',
    overview: 'Sinopse de teste 3.',
    status: 'Released',
    release_date: isoDaysAgo(300),
    genres: [{ name: 'Drama' }],
    runtime: 100,
    credits: { cast: FAKE_CAST, crew: [{ job: 'Director', name: 'Diretor Teste' }] },
    videos: { results: [] },
    'watch/providers': { results: { BR: { flatrate: [{ provider_name: 'Max', provider_id: 3, logo_path: '/m.jpg' }] } } },
    recommendations: { results: [] },
  },
  // Local hardcoded item (m_2026_odrama, tmdbId 1325734) — simula a TMDB
  // dizendo que na verdade ainda não foi lançado, SEM trailer e SEM
  // streaming, para provar que os dados fictícios cadastrados à mão
  // (elenco, trailer, whereToWatch) são substituídos, não mantidos.
  1325734: {
    id: 1325734,
    title: 'O Drama',
    overview: 'Sinopse real da TMDB.',
    status: 'Planned',
    release_date: isoDaysAhead(200),
    genres: [{ name: 'Drama' }],
    runtime: 130,
    credits: { cast: [], crew: [] },
    videos: { results: [] },
    'watch/providers': { results: {} },
    recommendations: { results: [] },
  },
};

async function mockTmdb(page) {
  await page.route('**/api.themoviedb.org/**', async (route) => {
    const url = route.request().url();
    const m = url.match(/\/3\/movie\/(\d+)/);
    if (m && MOVIES[m[1]]) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOVIES[m[1]]) });
    }
    // qualquer outra chamada (imagens localizadas, tv/, etc.) -> 404 controlado
    return route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ status_message: 'not found' }) });
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

  const consoleErrors = [];
  page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));

  await page.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof openModal === 'function' && typeof TMDB !== 'undefined');

  async function openAndInspect(mediaId) {
    await page.evaluate((id) => openModal(id), mediaId);
    await page.waitForTimeout(600);
    return page.evaluate(() => {
      const vis = (id) => {
        const el = document.getElementById(id);
        if (!el) return 'MISSING';
        const style = window.getComputedStyle(el);
        return style.display !== 'none' ? 'visible' : 'hidden';
      };
      return {
        providers: vis('modalProvidersSection'),
        reviews: vis('modalReviewsSection'),
        trailer: vis('modalTrailerSection'),
        ticketDisplay: document.getElementById('modalBuyTicketBtn')?.style.display || null,
        ticketHref: document.getElementById('modalBuyTicketBtn')?.href || null,
        providersHtml: document.getElementById('modalProvidersList')?.innerHTML || '',
        castCount: document.querySelectorAll('#modalCastGrid .cast-card').length,
      };
    });
  }

  console.log('\n=== 1. Filme NÃO lançado (mas com trailer real) — tmdb_9001 ===');
  let r = await openAndInspect('tmdb_9001');
  r.reviews === 'hidden' ? pass('seção de avaliações escondida') : fail('avaliações deveriam estar escondidas, está ' + r.reviews);
  r.providers === 'hidden' ? pass('seção "onde assistir" escondida') : fail('onde-assistir deveria estar escondida, está ' + r.providers);
  r.trailer === 'visible' ? pass('trailer aparece normalmente (filme não lançado PODE ter trailer real)') : fail('trailer deveria aparecer, está ' + r.trailer);
  (r.ticketDisplay === 'none' || r.ticketDisplay === '') ? pass('botão de ingresso escondido (filme nem lançou)') : fail('botão de ingresso deveria estar escondido: ' + r.ticketDisplay);

  console.log('\n=== 2. Filme lançado há 10 dias (em cartaz) — tmdb_9002 ===');
  r = await openAndInspect('tmdb_9002');
  r.reviews === 'visible' ? pass('avaliações visíveis (já lançou)') : fail('avaliações deveriam aparecer: ' + r.reviews);
  r.providers === 'visible' ? pass('onde-assistir visível') : fail('onde-assistir deveria aparecer: ' + r.providers);
  r.ticketDisplay === 'inline-flex' ? pass('botão de ingresso visível') : fail('botão de ingresso deveria estar visível: ' + r.ticketDisplay);
  r.ticketHref && r.ticketHref.includes('ingresso.com/busca/resultado?q=Filme') ? pass('link do ingresso correto: ' + r.ticketHref) : fail('link do ingresso incorreto: ' + r.ticketHref);

  console.log('\n=== 3. Filme lançado há 300 dias (fora de cartaz) — tmdb_9003 ===');
  r = await openAndInspect('tmdb_9003');
  r.reviews === 'visible' ? pass('avaliações visíveis') : fail('avaliações deveriam aparecer: ' + r.reviews);
  (r.ticketDisplay === 'none' || r.ticketDisplay === '') ? pass('botão de ingresso escondido (já saiu de cartaz)') : fail('botão de ingresso deveria estar escondido: ' + r.ticketDisplay);
  r.trailer === 'hidden' ? pass('trailer escondido (sem trailer cadastrado na TMDB)') : fail('trailer deveria estar escondido: ' + r.trailer);

  console.log('\n=== 4. Item LOCAL hardcoded (m_2026_odrama) tem seus dados fictícios substituídos ===');
  r = await openAndInspect('m_2026_odrama');
  r.reviews === 'hidden' ? pass('avaliações escondidas (TMDB diz que ainda não foi lançado)') : fail('avaliações deveriam estar escondidas: ' + r.reviews);
  r.providers === 'hidden' ? pass('onde-assistir escondido (não confia mais no "A24/Max" cadastrado à mão)') : fail('onde-assistir deveria estar escondido: ' + r.providers);
  r.trailer === 'hidden' ? pass('trailer placeholder removido (TMDB não confirmou nenhum)') : fail('trailer deveria estar escondido (era um placeholder falso): ' + r.trailer);

  console.log('\n=== 5. Erros de página ===');
  consoleErrors.length === 0 ? pass('nenhum erro JS') : fail('erros: ' + consoleErrors.slice(0, 5).join(' | '));

  await browser.close();
  console.log('\n=== fim ===');
})();
