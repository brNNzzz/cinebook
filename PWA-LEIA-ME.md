# CineBook PWA — o que foi feito e como instalar no servidor

Este pacote transforma o CineBook num aplicativo instalável no Android e no PC,
sem framework, sem build, sem dependência nova.

A parte importante: **quase tudo é arquivo novo**. Só 8 linhas são adicionadas
dentro do `<head>` das páginas que já existem. Isso significa que você pode
aplicar isto na versão atual do site, mesmo que ela esteja diferente da que eu
recebi.

---

## 1. Arquivos NOVOS (só copiar para o servidor)

```
manifest.json              # identidade do app: nome, ícones, cores
sw.js                      # service worker: cache e funcionamento offline
offline.html               # tela exibida quando não há conexão
js/pwa.js                  # registra o SW e mostra o botão "Instalar app"
favicon.ico
assets/icons/
  ├── icon-192.png
  ├── icon-512.png
  ├── icon-maskable-192.png   # versão para o recorte circular do Android
  ├── icon-maskable-512.png
  ├── apple-touch-icon.png
  ├── icon-144.png
  ├── favicon-32.png
  └── favicon-16.png
```

Nenhum desses arquivos existia antes, então nada é sobrescrito.

`sw.js` e `manifest.json` **precisam ficar na raiz** (junto do `index.html`).
O service worker só controla as páginas que estão na mesma pasta ou abaixo dela.

---

## 2. As 8 linhas para colar nas páginas existentes

Cole isto **logo antes do `</head>`** em cada página: `index.html`,
`detalhes.html`, `login.html`, `cadastro.html`, `perfil.html` — e em qualquer
página nova que você tenha criado depois.

```html
  <!-- PWA -->
  <link rel="manifest" href="manifest.json">
  <meta name="theme-color" content="#060d17">
  <link rel="apple-touch-icon" href="assets/icons/apple-touch-icon.png">
  <meta name="mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <meta name="apple-mobile-web-app-title" content="CineBook">
  <script src="js/pwa.js" defer></script>
```

`#060d17` é a cor de fundo do site (`--bg-main` do seu CSS). Ela pinta a barra
de status do Android e a tela de abertura do app. Se o fundo do site mudar,
troque aqui e em `manifest.json` (`theme_color` e `background_color`).

---

## 3. Mudanças no `.htaccess`

Três blocos foram acrescentados ao final do arquivo. Se você editou o
`.htaccess` depois, copie só os blocos, não o arquivo inteiro.

**a) O service worker não pode ficar em cache.** O `.htaccess` original manda o
navegador guardar todo `.js` por um mês. Se isso valesse para o `sw.js`, o
navegador serviria uma versão velha dele e o site nunca mais se atualizaria
para quem já tivesse visitado.

**b) Tipos MIME** para `.webmanifest` e `.json`.

**c) Proteção de arquivos sensíveis.** Este é independente do PWA, mas é
importante: hoje, se o `cinebook.db` estiver na `public_html`, qualquer pessoa
pode baixá-lo em `https://cinebooks.com.br/cinebook.db` e ler os e-mails e os
hashes de senha dos cadastros. O bloco novo nega acesso a `.db`, `.py`, `.env`
e afins. **Verifique isso no seu site assim que puder.**

---

## 4. Como subir na Hostinger

1. Abra o **Gerenciador de Arquivos** no hPanel e entre em `public_html`.
2. Envie os arquivos novos da seção 1, mantendo a estrutura de pastas
   (`assets/icons/` precisa existir).
3. Edite cada `.html` e cole as 8 linhas da seção 2 antes do `</head>`.
4. Acrescente os blocos da seção 3 no fim do `.htaccess`.
5. Abra o site numa aba anônima e recarregue uma vez.

O PWA exige HTTPS — o `cinebooks.com.br` já tem, então está resolvido.

---

## 5. Como instalar o app depois de publicado

**Android (Chrome):** o botão flutuante "Instalar app" aparece sozinho no canto
inferior direito. Também dá pelo menu ⋮ → "Instalar aplicativo".

**PC (Chrome/Edge):** mesmo botão, ou o ícone de instalação que surge na barra
de endereço, à direita.

**iPhone/iPad:** o Safari não oferece instalação automática. O app mostra as
instruções na primeira visita: botão Compartilhar → "Adicionar à Tela de
Início".

Se o usuário dispensar o botão no "×", ele fica escondido por 14 dias.

---

## 6. Como funciona o cache (e por que a busca continua ao vivo)

Esta é a parte que costuma dar errado em PWA e que foi tratada com cuidado:
um cache agressivo demais congela o catálogo e faz o app mentir sobre os dados.

| O quê | Estratégia | Efeito |
|---|---|---|
| Páginas | rede primeiro | sempre a versão atual quando há internet |
| CSS / JS / ícones | cache primeiro, atualiza em segundo plano | abre instantâneo |
| **API do TMDb** | **rede primeiro, sempre** | busca e catálogo nunca ficam velhos |
| Pôsteres do TMDb | cache primeiro, teto de 250 imagens | economiza dados |
| Fontes e bandeiras | cache primeiro | carregam uma vez só |
| YouTube, Netflix, etc. | não intercepta | seguem o comportamento normal |

Offline, as páginas já visitadas continuam abrindo e os últimos resultados de
busca aparecem do cache. Uma rota nunca visitada mostra a `offline.html`.

---

## 7. Quando você atualizar o site

Depois de subir mudanças em CSS ou JS, abra o `sw.js` e incremente a versão na
primeira linha de configuração:

```js
const VERSION = 'v1.0.1';   // era v1.0.0
```

Isso descarta os caches antigos e faz cada usuário receber um aviso
"Nova versão do CineBook disponível — Atualizar". Sem esse passo o site ainda
se atualiza, só que uma visita depois.

Se você criar **páginas novas**, adicione-as também na lista `PAGE_CANDIDATES`
do `sw.js` para que funcionem offline:

```js
const PAGE_CANDIDATES = [
  ['/', '/index.html'],
  ['/detalhes', '/detalhes.html'],
  ['/login', '/login.html'],
  ['/cadastro', '/cadastro.html'],
  ['/perfil', '/perfil.html'],
  ['/sua-pagina', '/sua-pagina.html'],   // <- nova
];
```

Se esquecer, nada quebra: a página simplesmente não fica disponível offline.

---

## 8. O que o PWA NÃO resolve

- **Cadastro e login continuam falsos.** As páginas ainda tentam falar com
  `http://localhost:8000` e caem para o `localStorage` em texto puro. Instalar
  como app não muda isso — é uma questão de backend, não de empacotamento.
- **Não coloca o app na Google Play.** Instalar pelo navegador gera um app real
  no Android (WebAPK), mas a loja exige empacotar como TWA e passar pelo
  processo do Play Console.

---

## 9. Testes executados

Validado com Chromium headless em dois cenários:

**Servidor estático simples** — service worker registra e ativa; manifest válido
com ícones 192, 512 e maskable, todos respondendo 200; app shell e estáticos
pré-cacheados; home e login abrem offline; rota inexistente cai na página
offline; chamadas ao TMDb saem pela rede; sem erros de console.

**Servidor imitando o `.htaccess` da Hostinger** (com os 301 de `.html` para URL
limpa) — mesmos resultados, e além disso: `/login.html` redirecionado renderiza
corretamente em vez de dar erro de rede, `/perfil` e `/perfil.html` abrem offline
pela mesma entrada de cache, e `detalhes.html?id=...` funciona offline
independentemente do id na query string.

Esse segundo cenário é o que mais importa: o redirecionamento do seu `.htaccess`
é a armadilha clássica que quebra service worker em produção, e ela está tratada.
