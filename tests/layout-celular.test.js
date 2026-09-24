// Layout: nada passa da largura da tela (celular a tablet) e o cadastro pode
// ser concluído em telas baixas de notebook e em celulares pequenos.
const { chromium } = require('playwright');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8090';
const pass = (m) => console.log('  PASS  ' + m);
const fail = (m) => { console.log('  FAIL  ' + m); process.exitCode = 1; };

const PAGES = ['index.html', 'index.html?tab=book', 'detalhes.html?id=m_2026_spiderman4', 'detalhes.html?id=b1',
  'estreias.html', 'login.html', 'cadastro.html', 'perfil.html', 'institucional.html'];
const WIDTHS = [320, 360, 390, 768];

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });

  console.log('\n=== 1. Nada cortado na lateral ===');
  for (const w of WIDTHS) {
    const ctx = await browser.newContext({ serviceWorkers: 'block', viewport: { width: w, height: 780 }, isMobile: w < 500, hasTouch: w < 500 });
    await ctx.route(/^https?:\/\/(?!127\.0\.0\.1|localhost)/, r => r.abort());
    const page = await ctx.newPage();
    await page.goto(BASE + '/offline.html');
    await page.evaluate(() => localStorage.setItem('cinebook_user', JSON.stringify({ id: 1, name: 'Maria Teste', email: 'maria@exemplo.com', avatar: '🍿' })));
    const bad = [];
    for (const p of PAGES) {
      await page.goto(BASE + '/' + p, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(900);
      const out = await page.evaluate(() => {
        const vw = document.documentElement.clientWidth;
        const list = [];
        document.querySelectorAll('body *').forEach(el => {
          const cs = getComputedStyle(el);
          if (cs.display === 'none' || cs.visibility === 'hidden') return;
          const b = el.getBoundingClientRect();
          if (!b.width || !b.height) return;
          let a = el.parentElement;
          while (a && a !== document.body) {
            const acs = getComputedStyle(a);
            if (/(auto|scroll|hidden)/.test(acs.overflowX) && a.scrollWidth > a.clientWidth + 1) return; // carrossel/abas com rolagem própria
            a = a.parentElement;
          }
          if (b.right > vw + 1 || b.left < -1) list.push(`${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}.${String(el.className).split(' ')[0]}`);
        });
        return list.slice(0, 3);
      });
      if (out.length) bad.push(`${p}: ${out.join(', ')}`);
    }
    bad.length === 0 ? pass(`${w}px: ${PAGES.length} páginas sem nada passando da tela`) : fail(`${w}px: ${bad.join(' | ')}`);
    await ctx.close();
  }

  console.log('\n=== 2. Cadastro até o fim, rolando como um usuário ===');
  for (const [w, h, label] of [[1366, 657, 'notebook'], [1280, 600, 'notebook baixo'], [360, 640, 'celular pequeno']]) {
    const ctx = await browser.newContext({ serviceWorkers: 'block', viewport: { width: w, height: h }, isMobile: w < 500, hasTouch: w < 500 });
    await ctx.route(/^https?:\/\/(?!127\.0\.0\.1|localhost)/, r => r.abort());
    const page = await ctx.newPage();
    await page.goto(BASE + '/cadastro.html', { waitUntil: 'domcontentloaded' });
    await page.fill('#usernameInput', 'layout' + w);
    await page.fill('#emailInput', `layout${w}@exemplo.com`);
    await page.fill('#passwordInput', 'Cinema2026!');
    await page.fill('#passwordConfirmInput', 'Cinema2026!');
    await page.click('#submitBtn');
    await page.waitForSelector('#step2Categories', { state: 'visible', timeout: 15000 });
    const inView = () => page.evaluate(() => { const b = document.getElementById('btnFinishOnboarding').getBoundingClientRect(); return b.top >= 0 && b.bottom <= innerHeight; });
    let visible = await inView();
    for (let i = 0; i < 12 && !visible; i++) {
      await page.mouse.move(Math.round(w / 4), Math.round(h / 2));
      await page.mouse.wheel(0, 250);
      await page.waitForTimeout(150);
      visible = await inView();
    }
    if (!visible) { fail(`${label} (${w}x${h}): botão "Salvar gostos" não aparece nem rolando`); await ctx.close(); continue; }
    await page.click('#btnFinishOnboarding');
    await page.waitForURL(/index\.html/, { timeout: 8000, waitUntil: 'domcontentloaded' });
    pass(`${label} (${w}x${h}): escolhe categorias e conclui o cadastro`);
    await ctx.close();
  }

  console.log('\n=== 3. Zoom liberado (acessibilidade) ===');
  const ctx = await browser.newContext({ serviceWorkers: 'block' });
  const page = await ctx.newPage();
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1|localhost)/, r => r.abort());
  const blocked = [];
  for (const p of PAGES) {
    await page.goto(BASE + '/' + p, { waitUntil: 'domcontentloaded' });
    const vp = await page.getAttribute('meta[name="viewport"]', 'content');
    if (/user-scalable\s*=\s*no|maximum-scale\s*=\s*1(\.0)?\b/.test(vp || '')) blocked.push(p);
  }
  blocked.length === 0 ? pass('nenhuma página impede o zoom com os dedos') : fail('zoom bloqueado em: ' + blocked.join(', '));
  await ctx.close();

  await browser.close();
  console.log('\n=== fim ===');
})();
