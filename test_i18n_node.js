
const fs = require('fs');

// Mock browser globals
global.localStorage = {
  store: { 'cinebook_lang': 'pt' },
  getItem(k) { return this.store[k] || null; },
  setItem(k, v) { this.store[k] = String(v); }
};
global.sessionStorage = {
  store: {},
  getItem(k) { return this.store[k] || null; },
  setItem(k, v) { this.store[k] = String(v); }
};

// Load data.js
const dataCode = fs.readFileSync('js/data.js', 'utf8');
eval(dataCode);

console.log("Testing Hero Carousel items translations:");

const testIds = ['m_2026_devoradores', 'm_2026_odrama', 'm_2026_exterminio', 'm_2026_spiderman4', 'm_2026_obsessao', 'm_2026_michael', 'm_2026_batman', 'b2'];
const languages = ['pt', 'en', 'es', 'fr', 'zh', 'hi', 'ar', 'bn', 'ru', 'ur', 'id'];

testIds.forEach(id => {
  const item = MEDIA_DATABASE.find(m => m.id === id);
  if (!item) {
    console.error("Item not found:", id);
    return;
  }
  console.log(`\n--- Item: ${item.id} (Default: ${item.title}) ---`);
  languages.forEach(lang => {
    const title = getMediaTitle(item, lang);
    const synopsis = getMediaSynopsis(item, lang);
    console.log(`[${lang.toUpperCase()}] Title: "${title}" | Synopsis: "${synopsis.substring(0, 50)}..."`);
    if (!title || title.trim() === '') {
      throw new Error(`Empty title for ${id} in ${lang}`);
    }
    if (!synopsis || synopsis.trim() === '') {
      throw new Error(`Empty synopsis for ${id} in ${lang}`);
    }
  });
});

console.log("\nAll translations passed successfully!");
