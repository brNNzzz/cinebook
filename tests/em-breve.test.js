const { chromium } = require('playwright');
const fs = require('fs');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8090';
const SHOTS = require('path').join(__dirname, 'screenshots') + '/';
const pass = (m) => console.log('  PASS  ' + m);
const fail = (m) => { console.log('  FAIL  ' + m); process.exitCode = 1; };
function iso(days) { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + days); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }

// 5 filmes: data "principal" (EUA) diferente da brasileira em alguns.
const MOVIES = [
  { id: 501, title: 'Filme A', original_title: 'Movie A', release_date: iso(10), popularity: 50, poster_path: '/a.jpg', genre_ids: [28], overview: 'Sinopse A', br: iso(12) },
  { id: 502, title: 'Filme B', original_title: 'Filme B', release_date: iso(20), popularity: 90, poster_path: '/b.jpg', genre_ids: [35], overview: 'Sinopse B, com vírgula; e ponto-e-vírgula', br: iso(20) },
  { id: 503, title: 'Filme C Sem Data BR', original_title: 'Movie C', release_date: iso(45), popularity: 30, poster_path: '/c.jpg', genre_ids: [27], overview: '', br: null },
  { id: 504, title: 'Filme D', original_title: 'Movie D', release_date: iso(70), popularity: 70, poster_path: '/d.jpg', genre_ids: [18], overview: '', br: iso(75) },
  { id: 505, title: 'Filme Fora Do Periodo', original_title: 'Movie E', release_date: iso(25), popularity: 10, poster_path: '/e.jpg', genre_ids: [18], overview: '', br: iso(200) },
];

async function setup(browser, { tmdb = 'up', viewport = { width: 1280, height: 900 } } = {}) {
  const ctx = await browser.newContext({ serviceWorkers: 'block', viewport, acceptDownloads: true });
  const calls = [];
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, (route) => {
    const url = route.request().url();
    if (url.includes('api.themoviedb.org')) {
      if (tmdb === 'down') return route.abort('connectionrefused');
      const u = new URL(url);
      calls.push(u.pathname + '?' + u.searchParams.toString());
      if (u.pathname === '/3/discover/movie') {
        const page = Number(u.searchParams.get('page'));
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ page, results: page === 1 ? MOVIES : [] }) });
      }
      const m = u.pathname.match(/\/3\/movie\/(\d+)\/release_dates$/);
      if (m) {
        const mv = MOVIES.find(x => x.id === Number(m[1]));
        const results = [{ iso_3166_1: 'US', release_dates: [{ type: 3, release_date: mv.release_date + 'T00:00:00.000Z' }] }];
        if (mv.br) results.push({ iso_3166_1: 'BR', release_dates: [{ type: 3, release_date: mv.br + 'T00:00:00.000Z' }] });
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: mv.id, results }) });
      }
      return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
    }
    return route.abort();
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  return { ctx, page, calls, errors };
}

const rows = (page) => page.evaluate(() => [...document.querySelectorAll('.up-row')].map(r => ({
  title: r.querySelector('h3').textContent,
  when: r.querySelector('.up-when').textContent,
  flag: !!r.querySelector('.up-flag'),
  href: r.querySelector('h3 a').getAttribute('href'),
  gcal: r.querySelector('.up-btn-primary').href,
})));

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });

  console.log('\n=== 1. Próximos 3 meses ===');
  const { ctx, page, calls, errors } = await setup(browser);
  await page.goto(BASE + '/estreias.html', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.up-row', { timeout: 10000 });
  let r = await rows(page);
  const titles = r.map(x => x.title);
  const fmt = (d) => { const [y, m, dd] = d.split('-'); return `${dd}/${m}/${y}`; };
  calls.some(c => c.includes('region=BR') && c.includes('with_release_type=2%7C3')) ? pass('consulta a TMDB com região Brasil e estreia em cinema') : fail('discover: ' + calls[0]);
  const a = r.find(x => x.title === 'Filme A');
  a && a.when.includes(fmt(iso(12))) && !a.flag ? pass('usa a data de estreia BRASILEIRA (' + fmt(iso(12)) + '), não a dos EUA') : fail('Filme A: ' + JSON.stringify(a));
  const c = r.find(x => x.title === 'Filme C Sem Data BR');
  c && c.flag ? pass('filme sem data no Brasil marcado como "data mundial"') : fail('Filme C: ' + JSON.stringify(c));
  !titles.includes('Filme Fora Do Periodo') ? pass('filme que só estreia no Brasil depois do período fica de fora') : fail('fora do período apareceu');
  const order = titles.filter(t => t.startsWith('Filme'));
  JSON.stringify(order) === JSON.stringify(['Filme A', 'Filme B', 'Filme C Sem Data BR', 'Filme D']) ? pass('ordenado por data: ' + order.join(' → ')) : fail('ordem: ' + order.join(', '));
  const months = await page.$$eval('.up-month h2', els => els.map(e => e.textContent));
  months.length >= 2 && /\d{4}/.test(months[0]) ? pass('agrupado por mês: ' + months.join(' | ')) : fail('meses: ' + months);
  a && a.href === 'detalhes.html?id=tmdb_501' ? pass('título leva à página de detalhes') : fail('href ' + (a && a.href));

  const g = new URL(a.gcal);
  g.hostname === 'calendar.google.com' && g.searchParams.get('action') === 'TEMPLATE' && g.searchParams.get('dates') === `${iso(12).replace(/-/g, '')}/${iso(13).replace(/-/g, '')}` && g.searchParams.get('text') === 'Estreia: Filme A'
    ? pass('link do Google Agenda: evento de dia inteiro na data certa') : fail('gcal: ' + a.gcal);

  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('.up-row:has-text("Filme B") [data-ics]')]);
  const ics = fs.readFileSync(await dl.path(), 'utf8');
  /^BEGIN:VCALENDAR\r\n/.test(ics) && ics.includes(`DTSTART;VALUE=DATE:${iso(20).replace(/-/g, '')}`) && ics.includes('SUMMARY:Estreia: Filme B') && ics.includes('vírgula\\; e') && ics.split('\r\n').every(l => l.length <= 75)
    ? pass(`arquivo .ics válido baixado (${dl.suggestedFilename()}), com vírgula/; escapados e linhas ≤ 75`) : fail('ics:\n' + ics);

  await page.click('[data-sort="popular"]');
  r = await rows(page);
  r[0].title === 'Filme B' ? pass('"Mais aguardados" ordena por popularidade') : fail('popular: ' + r.map(x => x.title));
  await page.click('[data-sort="date"]');
  await page.screenshot({ path: SHOTS + 'upcoming_desk.png' });

  console.log('\n=== 2. 12 meses: entram os destaques do CineBook ===');
  await page.click('[data-period="365"]');
  await page.waitForTimeout(800);
  r = await rows(page);
  r.some(x => x.title.includes('Aranhaverso')) && r.some(x => x.title === 'Shrek 5') ? pass('Homem-Aranha: Além do Aranhaverso e Shrek 5 (datas do catálogo) aparecem') : fail('locais: ' + r.map(x => x.title).join(' | '));
  !r.some(x => x.title.includes('Guerras Secretas')) ? pass('Guerras Secretas (dez/2027) fica fora da janela de 12 meses') : fail('secret wars dentro');
  errors.length === 0 ? pass('sem erros JS') : fail('erros: ' + errors.join(' | '));
  await ctx.close();

  console.log('\n=== 3. TMDB fora do ar ===');
  const off = await setup(browser, { tmdb: 'down' });
  await off.page.goto(BASE + '/estreias.html', { waitUntil: 'domcontentloaded' });
  await off.page.click('[data-period="365"]');
  await off.page.waitForSelector('.up-notice', { timeout: 15000 });
  r = await rows(off.page);
  r.length >= 2 ? pass(`avisa e mostra os destaques do CineBook (${r.length})`) : fail('offline rows ' + r.length);
  await off.ctx.close();

  console.log('\n=== 4. Celular ===');
  const mob = await setup(browser, { viewport: { width: 390, height: 844 } });
  await mob.page.goto(BASE + '/estreias.html', { waitUntil: 'domcontentloaded' });
  await mob.page.waitForSelector('.up-row', { timeout: 10000 });
  const hScroll = await mob.page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  !hScroll ? pass('sem rolagem lateral no celular') : fail('rolagem lateral no celular');
  await mob.page.screenshot({ path: SHOTS + 'upcoming_mobile.png' });
  await mob.ctx.close();

  console.log('\n=== 5. Link "Em breve" no menu ===');
  const nav = await setup(browser);
  await nav.page.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' });
  await nav.page.click('#tabUpcoming');
  await nav.page.waitForURL(/estreias\.html/);
  pass('menu da página inicial leva à página Em breve');
  await nav.ctx.close();

  await browser.close();
  console.log('\n=== fim ===');
})();
