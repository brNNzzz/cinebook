# CineBook

![Testes](../../actions/workflows/testes.yml/badge.svg)

Filmes, séries e livros em um só lugar. O CineBook reúne sinopse, elenco ou autores, trailer, data de estreia, onde assistir, ler ou comprar e avaliações de quem já viu, com lista pessoal, 11 idiomas e instalação como aplicativo (PWA).

**Site no ar:** https://cinebooksv3.netlify.app

## O problema que resolve

Quem acompanha filmes, séries e livros costuma pular entre vários sites: um para saber a data de estreia, outro para descobrir em qual streaming está, outro para ler avaliações e outro ainda para livros. O CineBook junta tudo numa experiência só, com dados reais de fontes públicas e em português.

## Funcionalidades

- **Catálogo de filmes e séries** com dados do TMDB: sinopse, elenco, trailer oficial, onde assistir no Brasil (via JustWatch) e busca por qualquer título.
- **Status real de lançamento**: obras que ainda não estrearam não mostram nota, avaliações, "onde assistir" nem trailer inventado; filmes em cartaz ganham o botão **Comprar ingresso** (Ingresso.com).
- **Em breve**: calendário de estreias nos cinemas do Brasil (data brasileira de cada filme), com lembrete no **Google Agenda** ou em arquivo **.ics** (Outlook, Apple).
- **Livros** pelo Google Books, com a Open Library como reserva automática: capa, autores, páginas, sinopse, amostra grátis e onde comprar.
- **Avaliações reais**: as de usuários do TMDB e as dos próprios usuários do CineBook. Nenhuma avaliação é gerada ou inventada.
- **Conta e lista pessoal** (quero ver, assistindo/lendo, já vi/li, favoritos). A senha é guardada só como hash PBKDF2-SHA256.
- **11 idiomas**: português, inglês, espanhol, francês, chinês, hindi, árabe, bengali, russo, urdu e indonésio.
- **App instalável e offline** (PWA): funciona no computador e no Android e se atualiza sozinho a cada publicação.

## Tecnologias

| Parte | Tecnologia |
|---|---|
| Interface | HTML5, CSS3 e JavaScript puro (sem framework) |
| Dados | APIs do TMDB, Google Books e Open Library |
| App | Service Worker, Web App Manifest (PWA) |
| Segurança | Web Crypto API (PBKDF2-SHA256) |
| Backend opcional | Python (`server.py` ou Flask) + SQLite |
| Hospedagem | Netlify, com deploy automático a cada push |
| Testes | Playwright (navegador real) + GitHub Actions |

## Estrutura

```
├── index.html            Catálogo (filmes, séries, livros, pessoas)
├── detalhes.html         Página de cada obra
├── estreias.html         Em breve nos cinemas
├── login.html            Entrar
├── cadastro.html         Criar conta
├── perfil.html           Perfil e lista pessoal
├── institucional.html    Sobre, termos, privacidade e fontes de dados
├── offline.html          Página mostrada sem internet
├── css/styles.css        Estilos
├── js/
│   ├── app.js            Catálogo, busca, carrossel, filtros
│   ├── details.js        Página de detalhes
│   ├── tmdb.js           Cliente da API do TMDB
│   ├── books.js          Google Books + Open Library
│   ├── reviews.js        Avaliações reais (TMDB + CineBook)
│   ├── upcoming.js       Calendário de estreias
│   ├── auth.js           Contas e senhas (hash PBKDF2)
│   ├── data.js           Destaques da casa e datas de estreia
│   ├── i18n.js           Traduções (11 idiomas)
│   └── pwa.js            Instalação e atualização do app
├── sw.js                 Service worker (cache e modo offline)
├── manifest.json         Manifesto do app
├── netlify.toml          Configuração do Netlify (cabeçalhos, proxies das APIs)
├── server.py, app_flask.py, database.py   Backend Python opcional
└── tests/                Testes automatizados
```

## Como rodar no computador

O site é estático. Qualquer servidor local serve:

```bash
python -m http.server 8090
```

Depois abra http://localhost:8090.

Para usar também o backend Python (API e banco SQLite): `python server.py`, depois http://localhost:8000. O banco `cinebook.db` é criado sozinho na primeira execução.

## Testes

São 179 verificações num navegador de verdade, cobrindo lançamentos, busca, carrossel, livros, avaliações, contas, estreias e modo offline. Nenhum teste acessa a internet: as APIs são simuladas.

```bash
cd tests
npm install
npx playwright install chromium
npm test
```

Para rodar só um grupo: `npm test -- em-breve`. Os testes também rodam sozinhos no GitHub a cada push (aba **Actions**).

## Relatório técnico

Notas do Lighthouse (antes e depois), diagrama da arquitetura e resultado dos testes: [`docs/relatorio-tecnico.html`](docs/relatorio-tecnico.html). No site publicado, fica em `/docs/relatorio-tecnico.html`. Os números medidos estão em [`docs/lighthouse/resumo.json`](docs/lighthouse/resumo.json).

## Publicação

Cada `git push` na branch `main` publica o site no Netlify automaticamente. As chamadas às APIs passam por proxies no próprio domínio (`/tmdb-api`, `/gbooks-api`, `/olib-api`), configurados no `netlify.toml`.

**Chave do Google Books (opcional):** sem chave, o Google divide uma cota diária global e às vezes recusa pedidos; nesse caso o site usa a Open Library. Para usar a sua chave, preencha `API_KEY` em `js/books.js`.

## Fontes de dados

- [TMDB](https://www.themoviedb.org/): filmes, séries, elenco, trailers, estreias e avaliações. *Este produto usa a API do TMDB, mas não é endossado nem certificado pelo TMDB.*
- [JustWatch](https://www.justwatch.com/) (via TMDB): onde assistir.
- [Google Books](https://books.google.com/) e [Open Library](https://openlibrary.org/): livros.

## Equipe

<!-- Preencha com os nomes e funções da equipe -->
