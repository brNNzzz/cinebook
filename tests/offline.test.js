// Service worker: instala, guarda o necessário e abre a página de um filme sem internet.
const { chromium } = require('playwright');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8090';
const pass = (m) => console.log('  PASS  ' + m);
const fail = (m) => { console.log('  FAIL  ' + m); process.exitCode = 1; };

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.route(/^https?:\/\/(?!127\.0\.0\.1|localhost)/, r => r.abort());
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));

  console.log('\n=== Offline ===');
  await page.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller, null, { timeout: 20000 });
  const cacheNames = await page.evaluate(() => caches.keys());
  cacheNames.some(c => c.startsWith('cinebook-static-')) ? pass('service worker instalado: ' + cacheNames.join(', ')) : fail('caches: ' + cacheNames);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  (await page.evaluate(() => typeof openModal === 'function')) ? pass('recarrega normalmente com o service worker') : fail('reload');

  await ctx.setOffline(true);
  await page.goto(BASE + '/detalhes.html?id=m_2026_secretwars', { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForTimeout(1500);
  const d = await page.evaluate(() => ({
    title: document.getElementById('detailsMainTitle')?.textContent,
    label: document.querySelector('.details-score-label')?.textContent,
  }));
  d.title === 'Vingadores: Guerras Secretas' ? pass('página do filme abre sem internet') : fail('offline title: ' + d.title);
  /17\/12\/2027/.test(d.label || '') ? pass('e continua mostrando a estreia (sem nota inventada)') : fail('label: ' + d.label);

  errors.length === 0 ? pass('sem erros JS') : fail('erros: ' + errors.join(' | '));
  await browser.close();
  console.log('\n=== fim ===');
})();
