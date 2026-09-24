// Google Books recusando (429, cota global esgotada) + Open Library respondendo.
const { chromium } = require('playwright');
const zlib = require('zlib');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8090';
const SHOTS = require('path').join(__dirname, 'screenshots') + '/';
const pass = (m) => console.log('  PASS  ' + m);
const fail = (m) => { console.log('  FAIL  ' + m); process.exitCode = 1; };

// PNG sólido 200x300 com cor derivada do id (para as capas "carregarem" de verdade).
function png(w, h, [r, g, b]) {
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (buf) => { let c = 0xffffffff; for (const x of buf) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: w }, () => [r, g, b]).flat())]);
  const raw = Buffer.concat(Array.from({ length: h }, () => row));
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

let coverSeq = 1000;
function doc(title, author, extra = {}) {
  return { key: `/works/OL${coverSeq}W`, title, author_name: [author], first_publish_year: 1965, cover_i: coverSeq++, number_of_pages_median: 412, subject: ['Fiction', 'Science fiction', 'Fantasy fiction'], ratings_average: 4.2, ratings_count: 300, language: ['eng', 'por'], ...extra };
}

function handleOL(url) {
  const u = new URL(url);
  const path = u.pathname.replace(/^\/olib-api/, '');
  if (/^\/works\/(OL\d+W)\.json$/.test(path)) {
    return { title: 'Obra Direta', description: { type: '/type/text', value: 'Descrição real vinda da [Open Library][1].\n\n----------\n[1]: https://x' }, covers: [4242], subjects: ['Fantasy fiction'] };
  }
  if (path === '/search.json') {
    const title = u.searchParams.get('title');
    const author = u.searchParams.get('author');
    const q = u.searchParams.get('q') || '';
    if (title) return { numFound: 2, docs: [doc(`Study guide: ${title}`, 'Someone Else'), doc(title, `Autor ${author}`)] };
    if (/^key:/.test(q)) return { numFound: 1, docs: [doc('Obra Direta', 'Autora Direta', { key: q.replace(/key:"?([^"]+)"?/, '$1') })] };
    if (/subject:/.test(q)) {
      const off = Number(u.searchParams.get('offset') || 0);
      return { numFound: 999, docs: Array.from({ length: 40 }, (_, i) => doc(`Vitrine OL ${q.split(' ')[0]} ${off + i}`, `Autor ${i}`)) };
    }
    if (/harry/i.test(q)) return { numFound: 1, docs: [doc('Harry Potter and the Chamber of Secrets', 'J. K. Rowling')] };
    return { numFound: 0, docs: [] };
  }
  return null;
}

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1280, height: 900 } });
  const hits = { google: 0, ol: 0, covers: 0 };
  await ctx.route(/^https?:\/\/(?!127\.0\.0\.1)/, (route) => {
    const url = route.request().url();
    if (url.includes('googleapis.com/books')) {
      hits.google++;
      return route.fulfill({ status: 429, contentType: 'application/json', body: JSON.stringify({ error: { code: 429, message: "Quota exceeded for quota metric 'Queries' and limit 'Queries per day'", status: 'RESOURCE_EXHAUSTED' } }) });
    }
    if (url.startsWith('https://openlibrary.org/')) {
      hits.ol++;
      const body = handleOL(url);
      return body ? route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) }) : route.fulfill({ status: 404, body: '' });
    }
    if (url.startsWith('https://covers.openlibrary.org/')) {
      hits.covers++;
      const id = Number((url.match(/\/id\/(\d+)-/) || [])[1] || 1);
      return route.fulfill({ status: 200, contentType: 'image/png', body: png(20, 30, [40 + (id * 37) % 200, 60 + (id * 53) % 180, 90 + (id * 29) % 160]) });
    }
    return route.abort();
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  console.log('\n=== 1. Aba Livros com o Google Books respondendo 429 ===');
  await page.goto(BASE + '/index.html?tab=book', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);
  const state = await page.evaluate(() => {
    const b1 = AppState.mediaList.find(m => m.id === 'b1');
    const imgs = [...document.querySelectorAll('#mediaGrid .poster-img')];
    return {
      b1Poster: b1.poster, b1Title: b1.title,
      enrichedLocal: AppState.mediaList.filter(m => m.type === 'book' && m._booksEnriched).length,
      olCards: AppState.mediaList.filter(m => m.source === 'open_library').length,
      loadedCovers: imgs.filter(i => i.complete && i.naturalWidth > 0 && i.src.includes('covers.openlibrary.org')).length,
      downFlag: Number(localStorage.getItem('cinebook_gbooks_down_until') || 0) > Date.now(),
    };
  });
  state.downFlag ? pass('percebeu a cota esgotada e marcou o Google como indisponível') : fail('flag google down');
  hits.google <= 4 ? pass(`parou de insistir no Google (${hits.google} tentativas no total)`) : fail('google hits: ' + hits.google);
  state.b1Poster.startsWith('https://covers.openlibrary.org/b/id/') ? pass('Duna ganhou capa da Open Library: ' + state.b1Poster) : fail('b1 poster: ' + state.b1Poster.slice(0, 50));
  state.b1Title === 'Duna' ? pass('título em português mantido') : fail('b1 title ' + state.b1Title);
  state.enrichedLocal === 40 ? pass('os 40 destaques ganharam capa') : fail('enriquecidos: ' + state.enrichedLocal);
  state.olCards >= 20 ? pass(`vitrine veio da Open Library (${state.olCards} livros)`) : fail('olCards ' + state.olCards);
  state.loadedCovers > 10 ? pass(`capas carregadas na tela: ${state.loadedCovers}`) : fail('capas carregadas: ' + state.loadedCovers);
  await page.evaluate(() => document.getElementById('mediaGrid').scrollIntoView());
  await page.screenshot({ path: SHOTS + 'ol_grid.png' });

  const before = await page.evaluate(() => AppState.mediaList.filter(m => m.type === 'book').length);
  await page.evaluate(() => loadMoreMedia(false));
  await page.waitForTimeout(800);
  const after = await page.evaluate(() => AppState.mediaList.filter(m => m.type === 'book').length);
  after > before ? pass(`carregar mais pela Open Library: ${before} → ${after}`) : fail('load more OL');

  await page.fill('#searchInput', 'harry');
  await page.waitForTimeout(1500);
  const titles = await page.evaluate(() => [...document.querySelectorAll('#mediaGrid .card-title')].map(e => e.textContent));
  titles.includes('Harry Potter and the Chamber of Secrets') ? pass('busca de livros funciona pela Open Library') : fail('busca: ' + titles.join(' | '));

  console.log('\n=== 2. Detalhes ===');
  await page.goto(BASE + '/detalhes.html?id=b1', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1800);
  const d1 = await page.evaluate(() => ({
    poster: document.getElementById('detailsPosterImg').getAttribute('src'),
    title: document.getElementById('detailsMainTitle').textContent,
    providers: [...document.querySelectorAll('#detailsProvidersList .provider-brand-name')].map(e => e.textContent),
    pages: document.getElementById('techDurationFormat').textContent,
  }));
  d1.poster.includes('covers.openlibrary.org') ? pass('página do livro local com capa da Open Library') : fail('poster ' + d1.poster);
  d1.providers.includes('Open Library') && d1.providers.includes('Amazon') ? pass('onde ler: ' + d1.providers.join(', ')) : fail('providers ' + d1.providers);
  d1.pages === '412 páginas' ? pass('páginas: ' + d1.pages) : fail('pages ' + d1.pages);
  await page.screenshot({ path: SHOTS + 'ol_details.png' });

  await page.goto(BASE + '/detalhes.html?id=ol_OL1234W', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  const d2 = await page.evaluate(() => ({
    title: document.getElementById('detailsMainTitle').textContent,
    synopsis: document.getElementById('detailsSynopsisText').textContent,
  }));
  d2.title === 'Obra Direta' ? pass('livro da Open Library abre pelo id') : fail('ol title ' + d2.title);
  d2.synopsis === 'Descrição real vinda da Open Library.' ? pass('sinopse sem links/markdown: "' + d2.synopsis + '"') : fail('sinopse: ' + JSON.stringify(d2.synopsis));

  errors.length === 0 ? pass('sem erros JS') : fail('erros: ' + errors.join(' | '));
  await browser.close();
  console.log('\n=== fim ===');
})();
