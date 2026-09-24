const { chromium } = require('playwright');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8090';
const SHOTS = require('path').join(__dirname, 'screenshots') + '/';
const pass = (m) => console.log('  PASS  ' + m);
const fail = (m) => { console.log('  FAIL  ' + m); process.exitCode = 1; };

function vol(id, title, author, extra = {}) {
  return {
    id,
    volumeInfo: {
      title, authors: [author], publisher: 'Editora Teste', publishedDate: '2017-05-10',
      description: `<p>Sinopse real de <b>${title}</b>, vinda da API do Google Books. `.padEnd(200, 'x') + '</p>',
      pageCount: 680, categories: ['Fiction / Science Fiction / Space Opera'],
      averageRating: 4.5, ratingsCount: 120, language: 'pt',
      imageLinks: { thumbnail: `http://books.google.com/books/content?id=${id}&printsec=frontcover&img=1&zoom=1&edge=curl&source=gbs_api` },
      previewLink: `http://books.google.com.br/books?id=${id}&dq=x`, infoLink: `https://play.google.com/store/books/details?id=${id}`,
      canonicalVolumeLink: `https://books.google.com/books/about/x.html?id=${id}`,
      ...extra.info,
    },
    saleInfo: { saleability: 'FOR_SALE', buyLink: `https://play.google.com/store/books/details?id=${id}&rdid=book-${id}`, retailPrice: { amount: 39.9, currencyCode: 'BRL' } },
    accessInfo: { viewability: 'PARTIAL', webReaderLink: `http://play.google.com/books/reader?id=${id}` },
    searchInfo: { textSnippet: `Trecho real de ${title}.` },
  };
}

function handleBooks(url) {
  const u = new URL(url.replace('/gbooks-api/', '/books/v1/').replace(/^http:\/\/127\.0\.0\.1:8090/, 'https://www.googleapis.com'));
  const path = u.pathname;
  const one = path.match(/\/volumes\/([^/]+)$/);
  if (one) return { id: one[1], ...vol(one[1], 'Livro Direto Pelo Id', 'Autora Teste') };
  const q = u.searchParams.get('q') || '';
  const intitle = q.match(/intitle:"([^"]+)"/);
  const inauthor = q.match(/inauthor:(\S+)/);
  if (intitle) {
    const t = intitle[1];
    const safe = t.normalize('NFD').replace(/[^\w]/g, '').slice(0, 20);
    return { totalItems: 2, items: [
      vol(`OUTRO${safe}`, `Guia de estudos sobre ${t}`, 'Fulano'),
      vol(`REAL${safe}`, t, inauthor ? inauthor[1] : 'Autor'),
    ] };
  }
  if (q.startsWith('subject:')) {
    const start = Number(u.searchParams.get('startIndex') || 0);
    return { totalItems: 500, items: Array.from({ length: 40 }, (_, i) => vol(`F${q.length}_${start + i}`, `Vitrine ${q.replace(/\W/g, '')} ${start + i}`, `Autor ${i}`)) };
  }
  if (/harry/i.test(q)) {
    return { totalItems: 2, items: [vol('HP2', 'Harry Potter e a Câmara Secreta', 'J.K. Rowling'), vol('HP2b', 'Harry Potter e a Câmara Secreta', 'J.K. Rowling')] };
  }
  return { totalItems: 0 };
}

async function newPage(browser, { books = 'up', context = null } = {}) {
  const ctx = context || await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const hits = { books: 0 };
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (route) => {
    const url = route.request().url();
    if (url.includes('googleapis.com/books')) {
      hits.books++;
      if (books === 'down') return route.abort('connectionrefused');
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(handleBooks(url)) });
    }
    if (url.includes('api.themoviedb.org')) return route.abort('connectionrefused');
    return route.abort();
  });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return { page, hits, errors, ctx };
}

async function openBooksTab(page) {
  await page.goto(BASE + '/index.html?tab=book', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
}

const gridInfo = (page) => page.evaluate(() => {
  const cards = [...document.querySelectorAll('#mediaGrid .card-title')].map(el => {
    const card = el.closest('article, .media-card');
    return { title: el.textContent, img: card.querySelector('.poster-img')?.getAttribute('src') || '' };
  });
  return cards;
});

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });

  console.log('\n=== 1. Aba Livros com o Google Books respondendo ===');
  const { page, errors, ctx } = await newPage(browser);
  await openBooksTab(page);
  let cards = await gridInfo(page);
  const duna = cards.find(c => c.title === 'Duna');
  duna ? pass('destaque local virou o livro real "Duna"') : fail('Duna não achado: ' + cards.slice(0, 5).map(c => c.title).join(' | '));
  // (a imagem em si é bloqueada no teste — sem internet — e cai na capa provisória pelo onerror;
  //  por isso confere o endereço que o site mandou carregar)
  const dunaPoster = await page.evaluate(() => AppState.mediaList.find(m => m.id === 'b1').poster);
  dunaPoster.startsWith('https://books.google.com') && !dunaPoster.includes('edge=curl') ? pass('capa real do Google (https, sem dobra): ' + dunaPoster.slice(0, 70)) : fail('capa: ' + dunaPoster.slice(0, 60));
  duna && duna.img.startsWith('data:image/svg') ? pass('se a capa não carregar, cai na capa provisória (não em foto de cinema)') : fail('fallback: ' + (duna && duna.img.slice(0, 40)));
  cards.every(c => !c.img.includes('image.tmdb.org')) ? pass('nenhum livro com pôster de filme') : fail('ainda há pôster de filme em livro');
  cards.some(c => c.title.startsWith('Vitrine')) ? pass(`livros da API na vitrine (${cards.length} cards no total)`) : fail('vitrine vazia');
  const before = cards.length;
  await page.evaluate(() => loadMoreMedia(false));
  await page.waitForTimeout(800);
  cards = await gridInfo(page);
  cards.length > before ? pass(`carregar mais: ${before} → ${cards.length}`) : fail('carregar mais não trouxe nada');
  const btnText = await page.textContent('#loadMoreText');
  /livros/i.test(btnText) ? pass('botão diz: ' + btnText) : fail('botão: ' + btnText);

  await page.fill('#searchInput', 'harry');
  await page.waitForTimeout(1200);
  cards = await gridInfo(page);
  const hp2 = cards.filter(c => c.title === 'Harry Potter e a Câmara Secreta');
  hp2.length === 1 ? pass('busca "harry" traz livro da API (edições repetidas unificadas)') : fail('busca: ' + cards.map(c => c.title).join(' | '));
  cards.some(c => c.title.includes('Pedra Filosofal')) ? pass('e mantém o destaque local que bate') : fail('local Pedra Filosofal sumiu');
  await page.fill('#searchInput', '');
  await page.waitForTimeout(400);
  await page.evaluate(() => document.getElementById('mediaGrid').scrollIntoView());
  await page.screenshot({ path: SHOTS + 'books_grid.png' });
  errors.length === 0 ? pass('sem erros JS') : fail('erros: ' + errors.join(' | '));

  console.log('\n=== 2. Página de detalhes de um destaque local (b1 = Duna) ===');
  const p2 = await newPage(browser, { context: ctx });
  await p2.page.goto(BASE + '/detalhes.html?id=b1', { waitUntil: 'domcontentloaded' });
  await p2.page.waitForTimeout(2000);
  const d = await p2.page.evaluate(() => ({
    title: document.getElementById('detailsMainTitle').textContent,
    original: document.getElementById('detailsOriginalTitle').textContent,
    poster: document.getElementById('detailsPosterImg').getAttribute('src'),
    synopsis: document.getElementById('detailsSynopsisText').textContent,
    providers: [...document.querySelectorAll('#detailsProvidersList a')].map(a => ({ name: a.querySelector('.provider-brand-name').textContent, href: a.href, tag: a.querySelector('.provider-type-tag').textContent })),
    sample: document.querySelector('.book-preview-btn')?.href,
    sampleVisible: getComputedStyle(document.getElementById('detailsMediaPreviewBlock')).display !== 'none',
    tech: document.getElementById('techDirector').textContent,
    duration: document.getElementById('techDurationFormat').textContent,
    castImg: document.querySelector('#detailsCastGrid .cast-photo')?.getAttribute('src') || '',
    score: document.getElementById('detailsScoreText').textContent,
  }));
  d.title === 'Duna' ? pass('título: Duna') : fail('título: ' + d.title);
  d.original === '(Dune)' ? pass('título original corrigido: ' + d.original) : fail('original: ' + d.original);
  d.poster.includes('books.google.com') ? pass('capa do Google') : fail('poster: ' + d.poster);
  d.synopsis.startsWith('Sinopse real de Duna') && !d.synopsis.includes('<') ? pass('sinopse real, sem HTML') : fail('sinopse: ' + d.synopsis.slice(0, 60));
  const play = d.providers.find(p => p.name === 'Google Play Livros');
  play && play.href.includes('play.google.com/store/books/details?id=REALDuna') ? pass('Google Play Livros com link e preço: ' + play.tag) : fail('providers: ' + JSON.stringify(d.providers));
  d.providers.some(p => p.name === 'Amazon' && p.href.includes('amazon.com.br/s?k=')) ? pass('Amazon com busca pelo livro') : fail('amazon');
  d.sampleVisible && d.sample && d.sample.includes('books/reader?id=REALDuna') ? pass('botão de amostra grátis') : fail('amostra: ' + d.sample);
  d.tech === 'Herbert • Editora Teste' ? pass('ficha: ' + d.tech) : fail('ficha: ' + d.tech);
  d.duration === '680 páginas' ? pass('páginas: ' + d.duration) : fail('páginas: ' + d.duration);
  d.castImg.startsWith('data:image/svg') ? pass('autor sem foto usa iniciais (não foto de banco de imagens)') : fail('cast img: ' + d.castImg.slice(0, 50));
  d.score.startsWith('90') ? pass('nota dos leitores do Google (4,5★ → 90%)') : fail('nota: ' + d.score);
  await p2.page.screenshot({ path: SHOTS + 'books_details.png', fullPage: true });
  p2.errors.length === 0 ? pass('sem erros JS') : fail('erros: ' + p2.errors.join(' | '));

  console.log('\n=== 3. Livro que veio da API (gb_...) ===');
  const p3 = await newPage(browser, { context: ctx });
  await p3.page.goto(BASE + '/detalhes.html?id=gb_XYZ123', { waitUntil: 'domcontentloaded' });
  await p3.page.waitForTimeout(1500);
  const t3 = await p3.page.textContent('#detailsMainTitle');
  t3 === 'Livro Direto Pelo Id' ? pass('abre direto pelo id do Google') : fail('gb title: ' + t3);
  p3.errors.length === 0 ? pass('sem erros JS') : fail('erros: ' + p3.errors.join(' | '));
  await ctx.close();

  console.log('\n=== 4. Google Books FORA DO AR, navegador sem cache ===');
  const p4 = await newPage(browser, { books: 'down' });
  await openBooksTab(p4.page);
  cards = await gridInfo(p4.page);
  cards.length >= 40 ? pass(`os 40 destaques continuam aparecendo (${cards.length})`) : fail('cards: ' + cards.length);
  cards.every(c => c.img.startsWith('data:image/svg')) ? pass('capas provisórias com título/autor (nada de pôster de filme)') : fail('capas: ' + cards.slice(0, 3).map(c => c.img.slice(0, 40)).join(' | '));
  await p4.page.evaluate(() => document.getElementById('mediaGrid').scrollIntoView());
  await p4.page.screenshot({ path: SHOTS + 'books_offline_grid.png' });
  await p4.page.goto(BASE + '/detalhes.html?id=b33', { waitUntil: 'domcontentloaded' });
  await p4.page.waitForTimeout(1500);
  const t4 = await p4.page.textContent('#detailsMainTitle');
  t4 === 'O Hobbit' ? pass('detalhes de livro local abrem mesmo sem API') : fail('b33: ' + t4);
  p4.errors.length === 0 ? pass('sem erros JS') : fail('erros: ' + p4.errors.join(' | '));
  await p4.ctx.close();

  await browser.close();
  console.log('\n=== fim ===');
})();
