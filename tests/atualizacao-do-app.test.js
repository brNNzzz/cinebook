// Simula quem já tinha o app (service worker v1.0.0 com cache) recebendo o deploy novo.
const { chromium } = require('playwright');
const { execSync } = require('child_process');
const BASE = process.env.SWSIM_URL || 'http://127.0.0.1:8092';
const SWSIM = process.env.SWSIM_DIR || '/tmp/swsim';
const pass = (m) => console.log('  PASS  ' + m);
const fail = (m) => { console.log('  FAIL  ' + m); process.exitCode = 1; };

// Clica em "próximo" e acompanha o slide quadro a quadro (evita depender de
// um instante exato): devolve o deslocamento mais à esquerda observado.
async function clickNextAndTrack(page) {
  const track = page.evaluate(() => new Promise(resolve => {
    const el = document.getElementById('heroSlideMain');
    let minX = 0; let sawOut = false; let gentle = false;
    const t0 = performance.now();
    const tick = () => {
      const m = getComputedStyle(el).transform.match(/matrix\(([^)]+)\)/);
      const x = m ? Number(m[1].split(',')[4]) : 0;
      if (x < minX) minX = x;
      if (el.classList.contains('slide-out-left')) sawOut = true;
      if (el.classList.contains('gentle')) gentle = true;
      if (performance.now() - t0 < 400) requestAnimationFrame(tick); else resolve({ minX, sawOut, gentle });
    };
    requestAnimationFrame(tick);
  }));
  await page.click('#heroNextBtn');
  return track;
}

const swap = (to) => execSync(`ln -sfn ${SWSIM}/${to} ${SWSIM}/current`);

(async () => {
  swap('old');
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  // Sem interceptar a rede aqui: no Chromium, pedidos feitos DE DENTRO do
  // service worker interceptados pelo Playwright podem ficar pendurados e
  // travar a troca de versão (o que não acontece num navegador de verdade).
  if (process.env.SWSIM_ROUTE) await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));

  console.log('\n=== 1. Visitante com a versão ANTIGA instalada ===');
  await page.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' });
  // A versão antiga recarrega a página sozinha quando o SW assume; espera
  // isso passar em vez de disputar com um reload manual.
  const oldDeadline = Date.now() + 30000;
  while (Date.now() < oldDeadline) {
    try {
      const ok = await page.evaluate(async () => !!navigator.serviceWorker.controller &&
        (await caches.keys()).some(c => c === 'cinebook-static-v1.0.0'));
      if (ok) break;
    } catch (_) {}
    await page.waitForTimeout(500);
  }
  await page.waitForTimeout(2500);
  await page.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForTimeout(1500);
  const old = await page.evaluate(async () => ({
    caches: await caches.keys(),
    hasSlide: typeof HeroCarousel !== 'undefined' && typeof HeroCarousel.preloadNeighbors === 'function',
  }));
  old.caches.some(c => c.includes('v1.0.0')) && !old.hasSlide ? pass('rodando a versão antiga (SW v1.0.0, carrossel sem deslize)') : fail('estado antigo: ' + JSON.stringify(old));

  console.log('\n=== 2. Deploy da versão nova; o visitante só abre o site de novo ===');
  swap('new');
  await page.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' });
  // Sem clicar em nada: espera o SW novo assumir e a página recarregar sozinha.
  const newVersion = (require('fs').readFileSync(`${SWSIM}/new/sw.js`, 'utf8').match(/const VERSION = '([^']+)'/) || [])[1];
  // Espera o SW novo ativar (ele apaga os caches antigos ao ativar) e a
  // página terminar a recarga automática que vem logo depois.
  // (waitForFunction não espera Promises — por isso a consulta é feita em
  // laço; a página recarrega sozinha no meio, então erros são esperados)
  const swDeadline = Date.now() + 30000;
  while (Date.now() < swDeadline) {
    try {
      const done = await page.evaluate(async (v) => {
        const keys = await caches.keys();
        return keys.some(c => c.startsWith('cinebook-static-') && c.endsWith(v)) && !keys.some(c => c.endsWith('v1.0.0'));
      }, newVersion);
      if (done) break;
    } catch (_) { /* recarregando */ }
    await page.waitForTimeout(400);
  }
  if (process.env.DEBUG_SW) {
    const dbg = await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      let updErr = null;
      try { await reg.update(); } catch (e) { updErr = String(e); }
      await new Promise(r => setTimeout(r, 3000));
      return { active: reg.active && reg.active.state, installing: reg.installing && reg.installing.state, waiting: reg.waiting && reg.waiting.state, updErr, caches: await caches.keys(), sw: await (await fetch('/sw.js', { cache: 'no-store' })).text().then(t => t.match(/VERSION = '[^']+'/)[0]) };
    }).catch(e => ({ err: String(e) }));
    console.log('   DEBUG', JSON.stringify(dbg));
  }
  // Espera a recarga automática terminar (sem depender do evento "load").
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    try {
      const ready = await page.evaluate(() => document.readyState !== 'loading' &&
        typeof HeroCarousel !== 'undefined' && typeof HeroCarousel.preloadNeighbors === 'function' &&
        typeof CineAuth !== 'undefined');
      if (ready) break;
    } catch (_) { /* página recarregando */ }
    await page.waitForTimeout(400);
  }
  await page.waitForTimeout(1500);
  const now = await page.evaluate(async () => ({
    caches: await caches.keys(),
    hasSlide: typeof HeroCarousel !== 'undefined' && typeof HeroCarousel.preloadNeighbors === 'function',
    hasBooks: typeof GoogleBooks !== 'undefined' && typeof GoogleBooks.olSearch === 'function',
    hasAuth: typeof CineAuth !== 'undefined',
    swScript: navigator.serviceWorker.controller && navigator.serviceWorker.controller.scriptURL,
    footer: !!document.querySelector('.site-footer'),
  }));
  now.hasSlide && now.hasBooks && now.hasAuth && now.footer ? pass('na primeira visita após o deploy já roda o código novo (carrossel, livros, contas, rodapé)') : fail('código: ' + JSON.stringify(now));
  !now.caches.some(c => c.includes('v1.0.0')) && now.caches.some(c => c.endsWith(newVersion)) ? pass(`caches antigos apagados; SW ${newVersion} no controle: ` + now.caches.join(', ')) : fail('caches: ' + now.caches.join(', '));
  const toast = await page.$('#pwa-update-toast');
  !toast || !(await toast.isVisible()) ? pass('nenhum aviso "atualizar" precisou ser clicado') : fail('toast visível');

  console.log('\n=== 3. Carrossel desliza na versão atualizada ===');
  await page.evaluate(() => HeroCarousel.stopAutoRotate());
  const mid = await clickNextAndTrack(page);
  mid.sawOut && mid.minX < -10 ? pass(`deslizando para a esquerda (até ${mid.minX.toFixed(1)}px)`) : fail('meio: ' + JSON.stringify(mid));

  console.log('\n=== 4. Mesmo com "reduzir movimento" no sistema ===');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForTimeout(700);
  const midR = await clickNextAndTrack(page);
  midR.gentle && midR.sawOut && midR.minX < -5 && midR.minX > -40 ? pass(`desliza curto e rápido (até ${midR.minX.toFixed(1)}px)`) : fail('reduced: ' + JSON.stringify(midR));

  errors.length === 0 ? pass('sem erros JS') : fail('erros: ' + errors.join(' | '));
  await browser.close();
  console.log('\n=== fim ===');
})();
