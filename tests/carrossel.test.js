const { chromium } = require('playwright');
const pass = (m) => console.log('  PASS  ' + m);
const fail = (m) => { console.log('  FAIL  ' + m); process.exitCode = 1; };
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args:['--no-sandbox'] });
  const ctx = await b.newContext({ serviceWorkers:'block', viewport:{ width:1280, height:720 } });
  const p = await ctx.newPage();
  await p.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
  const errs=[]; p.on('pageerror', e=>errs.push(e.message));
  await p.goto((process.env.BASE_URL || 'http://127.0.0.1:8090') + '/index.html', { waitUntil:'domcontentloaded' });
  await p.waitForTimeout(1500);
  await p.evaluate(() => HeroCarousel.stopAutoRotate());
  const state = () => p.evaluate(() => {
    const el = document.getElementById('heroSlideMain'); const cs = getComputedStyle(el);
    return { title: document.getElementById('heroMainTitle').textContent, idx: HeroCarousel.currentIndex,
      transform: cs.transform, opacity: Number(cs.opacity), cls: el.className,
      activeDash: [...document.querySelectorAll('.carousel-dash-item')].findIndex(d => d.classList.contains('active')) };
  });
  const s0 = await state();
  await p.click('#heroNextBtn');
  await p.waitForTimeout(150);
  const mid = await state();
  await p.screenshot({ path: 'car_mid_out.png', clip: { x:0, y:60, width:1280, height:500 } });
  await p.waitForTimeout(230);
  await p.screenshot({ path: 'car_mid_in.png', clip: { x:0, y:60, width:1280, height:500 } });
  await p.waitForTimeout(600);
  const s1 = await state();
  console.log('antes:', s0.title, '| meio:', mid.cls, mid.opacity.toFixed(2), mid.transform, '| depois:', s1.title, s1.opacity, s1.transform);
  mid.cls.includes('slide-out-left') && mid.opacity < 0.9 ? pass('saindo pela esquerda ao clicar em "próximo"') : fail('meio: ' + JSON.stringify(mid));
  mid.activeDash === s1.idx ? pass('tracinho ativo muda na hora do clique') : fail('dash ' + mid.activeDash);
  s1.title !== s0.title && s1.opacity === 1 && (s1.transform === 'none' || s1.transform === 'matrix(1, 0, 0, 1, 0, 0)') ? pass('novo slide assentado no centro') : fail('fim: ' + JSON.stringify(s1));

  await p.click('#heroPrevBtn');
  await p.waitForTimeout(150);
  const midPrev = await state();
  midPrev.cls.includes('slide-out-right') ? pass('"anterior" sai pela direita') : fail('prev: ' + midPrev.cls);
  await p.waitForTimeout(900);
  const s2 = await state();
  s2.title === s0.title ? pass('voltou para o primeiro slide') : fail('prev fim: ' + s2.title);

  // cliques rápidos seguidos
  for (let i = 0; i < 4; i++) { await p.click('#heroNextBtn'); await p.waitForTimeout(60); }
  await p.waitForTimeout(900);
  const s3 = await state();
  const expected = await p.evaluate(() => (4) % HeroCarousel.items.length);
  const expTitle = await p.evaluate((i) => { const it = HeroCarousel.items[i]; return getMediaTitle(it, 'pt'); }, expected);
  s3.idx === expected && s3.title === expTitle && s3.opacity === 1 ? pass('4 cliques rápidos terminam no slide certo, sem ficar invisível') : fail('rápido: ' + JSON.stringify(s3) + ' esperado ' + expTitle);

  // troca automática também desliza
  await p.evaluate(() => { HeroCarousel.autoRotateInterval = 800; HeroCarousel.startAutoRotate(); });
  await p.waitForTimeout(950);
  const auto = await state();
  auto.cls.includes('slide-out-left') || auto.cls === 'hero-slide-main' ? pass('rotação automática usa o mesmo efeito (' + auto.cls + ')') : fail('auto: ' + auto.cls);
  errs.length === 0 ? pass('sem erros JS') : fail(errs.join(' | '));
  await b.close();
})();
