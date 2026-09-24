const { chromium } = require('playwright');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8090';
const SHOTS = require('path').join(__dirname, 'screenshots') + '/';
const pass = (m) => console.log('  PASS  ' + m);
const fail = (m) => { console.log('  FAIL  ' + m); process.exitCode = 1; };
function isoDaysAgo(d) { const x = new Date(); x.setDate(x.getDate() - d); return x.toISOString().slice(0, 10); }

const MOVIE = {
  id: 9002, title: 'Filme Recem Lancado', overview: 'Sinopse', status: 'Released', release_date: isoDaysAgo(200),
  vote_average: 7.8, vote_count: 900, genres: [{ name: 'Ação' }], runtime: 110,
  credits: { cast: [], crew: [] }, videos: { results: [] }, 'watch/providers': { results: {} }, recommendations: { results: [] },
};
const LONG = 'Primeiro parágrafo da crítica.\r\n\r\n' + 'Texto longo '.repeat(80) + '\r\nFim.';
const REVIEWS_EN = {
  id: 9002, page: 1, total_results: 2, results: [
    { author: 'moviefan', author_details: { name: 'Jane Critic', username: 'moviefan', avatar_path: null, rating: 8 }, content: LONG, created_at: '2026-05-02T10:00:00.000Z', id: 'r1', url: 'https://www.themoviedb.org/review/r1' },
    { author: 'hacker', author_details: { name: '', username: 'hacker', avatar_path: '/https://www.gravatar.com/avatar/x.jpg', rating: null }, content: 'Nice <img src=x onerror="window.__xss=1"> movie', created_at: '2026-05-03T10:00:00.000Z', id: 'r2', url: 'https://www.themoviedb.org/review/r2' },
  ],
};

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1280, height: 900 } });
  const reqs = [];
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, (route) => {
    const url = route.request().url();
    if (url.includes('api.themoviedb.org')) {
      const u = new URL(url);
      reqs.push(u.pathname + ' ' + u.searchParams.get('language'));
      if (/\/movie\/9002\/reviews$/.test(u.pathname)) {
        const body = u.searchParams.get('language') === 'en-US' ? REVIEWS_EN : { id: 9002, page: 1, total_results: 0, results: [] };
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
      }
      if (/\/movie\/9002$/.test(u.pathname)) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MOVIE) });
      return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
    }
    return route.abort();
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  // avaliações de exemplo que o site antigo gravava sozinho
  await page.goto(BASE + '/offline.html');
  await page.evaluate(() => localStorage.setItem('cinebook_reviews', JSON.stringify({
    tmdb_9002: [{ userName: 'Pedro Aluno', userAvatar: '🚀', rating: 5, comment: 'Cinematografia espetacular e trilha sonora imersiva de Hans Zimmer! Obra-prima.', date: '25/08/2026' }],
  })));

  console.log('\n=== 1. Página de detalhes de um filme lançado ===');
  await page.goto(BASE + '/detalhes.html?id=tmdb_9002', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#detailsReviewsList .rv-card', { timeout: 10000 });
  let info = await page.evaluate(() => {
    const list = document.getElementById('detailsReviewsList');
    return {
      text: list.innerText,
      cards: list.querySelectorAll('.rv-card').length,
      imgs: [...list.querySelectorAll('img')].map(i => i.getAttribute('src')),
      link: list.querySelector('.rv-link')?.href,
      xss: window.__xss,
    };
  });
  !/Gabriel Moura|Tatiana Xavier|Henrique Vilela|Juliana Peçanha|Pedro Aluno/.test(info.text) ? pass('nenhuma avaliação inventada (nem a antiga salva no navegador)') : fail('avaliação falsa: ' + info.text.slice(0, 200));
  /Avaliações de usuários do TMDB\s*2/i.test(info.text) ? pass('grupo "Avaliações de usuários do TMDB" com o total real') : fail('grupo: ' + info.text.slice(0, 200));
  /estas estão em inglês/.test(info.text) ? pass('avisa que as avaliações estão em inglês') : fail('aviso de idioma');
  reqs.some(r => r.includes('/reviews pt-BR')) && reqs.some(r => r.includes('/reviews en-US')) ? pass('buscou primeiro em português e depois em inglês') : fail('reqs: ' + reqs.join(' | '));
  info.text.includes('Jane Critic') && info.text.includes('★★★★☆') ? pass('autor e nota reais (8/10 → 4 estrelas)') : fail('autor/nota');
  info.link === 'https://www.themoviedb.org/review/r1' ? pass('link "Ver no TMDB" para a avaliação original') : fail('link ' + info.link);
  !info.xss && !info.imgs.includes('x') && info.text.includes('<img src=x') ? pass('HTML dentro da avaliação é mostrado como texto (sem executar)') : fail('xss: ' + JSON.stringify(info));
  const av = await page.evaluate(() => JSON.parse(sessionStorage.getItem('cinebook_tmdb_reviews_movie_9002')).reviews[1].avatar);
  av === 'https://www.gravatar.com/avatar/x.jpg' ? pass('avatar do TMDB (gravatar) resolvido; se não carregar, vira iniciais') : fail('avatar: ' + av);

  const lenBefore = await page.evaluate(() => document.querySelector('#detailsReviewsList .rv-card').innerText.length);
  await page.click('#detailsReviewsList .rv-more');
  const lenAfter = await page.evaluate(() => document.querySelector('#detailsReviewsList .rv-card').innerText.length);
  lenAfter > lenBefore ? pass(`"Ler tudo" abre o texto completo (${lenBefore} → ${lenAfter} caracteres)`) : fail('ler tudo');

  console.log('\n=== 2. Avaliação feita no CineBook ===');
  await page.click('#detailsStarRating .star-btn[data-star="4"]');
  await page.fill('#detailsReviewComment', 'Gostei <b>muito</b> do final');
  await page.click('#btnPublishReview');
  await page.waitForTimeout(600);
  info = await page.evaluate(() => {
    const list = document.getElementById('detailsReviewsList');
    return { text: list.innerText, bold: list.querySelectorAll('b').length, first: list.querySelector('.rv-group-title')?.innerText };
  });
  /Avaliações no CineBook/i.test(info.first) && info.text.includes('Gostei <b>muito</b> do final') && info.bold === 0 ? pass('avaliação do usuário aparece no topo, com o texto escapado') : fail('própria: ' + JSON.stringify(info).slice(0, 300));
  await page.screenshot({ path: SHOTS + 'reviews_details.png', fullPage: false, clip: undefined });
  await page.evaluate(() => document.getElementById('detailsReviewsBlock').scrollIntoView());
  await page.screenshot({ path: SHOTS + 'reviews_block.png' });

  console.log('\n=== 3. Livro (sem fonte pública de resenhas) ===');
  await page.goto(BASE + '/detalhes.html?id=b33', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  const bookTxt = await page.textContent('#detailsReviewsList');
  /Ninguém avaliou esta obra ainda/.test(bookTxt) ? pass('livro sem avaliações mostra o convite honesto, não críticas inventadas') : fail('livro: ' + bookTxt.slice(0, 200));

  console.log('\n=== 4. Modal da página inicial ===');
  await page.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof openModal === 'function');
  await page.evaluate(() => openModal('tmdb_9002'));
  await page.waitForSelector('#modalReviewsList .rv-card', { timeout: 10000 });
  const modalTxt = await page.textContent('#modalReviewsList');
  modalTxt.includes('Jane Critic') && modalTxt.includes('Gostei <b>muito</b> do final') ? pass('modal mostra as mesmas avaliações reais') : fail('modal: ' + modalTxt.slice(0, 200));

  errors.length === 0 ? pass('sem erros JS') : fail('erros: ' + errors.join(' | '));
  await browser.close();
  console.log('\n=== fim ===');
})();
