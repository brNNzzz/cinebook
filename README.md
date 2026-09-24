# 🍿 CineBook - Portal de Filmes, Séries & Livros

Aplicação Web Full Stack inspirada no visual e na experiência do **TMDB (The Movie Database)**, desenvolvida para o curso de Ciência da Computação.

---

## 🏗️ Arquitetura do Projeto

O projeto adota uma arquitetura **Full Stack Cliente-Servidor** moderna, com suporte a modo híbrido:

```
cinebook/
├── server.py            # Servidor HTTP & API REST nativa em Python (Zero dependências pip)
├── app_flask.py         # Versão alternativa da API utilizando Flask
├── database.py          # Módulo Python com SQLite (Tabelas, Queries, Recomendações e Estatísticas)
├── requirements.txt     # Dependências opcionais (Flask)
├── index.html           # Estrutura semântica HTML5
├── css/
│   └── styles.css       # Design System TMDB (Dark blue, radial score gauge, glassmorphism)
└── js/
    ├── data.js          # Catálogo local de fallback (Garante funcionamento offline)
    └── app.js           # Gerenciador de estado, consumo da API REST e manipulação de DOM
```

---

## 🐍 O que o Python faz no Projeto?

1. **API RESTful**:
   - `GET /api/media`: Retorna catálogo com suporte a filtros por tipo, gênero, busca e ordenação.
   - `GET /api/media/<id>`: Retorna detalhes completos e resenhas da obra.
   - `GET /api/recommendations/<id>`: **Algoritmo em Python** de recomendação baseado em similaridade de Jaccard sobre os gêneros e notas.
   - `GET /api/stats`: **Processamento de Dados (Analytics)** em tempo real com métricas do catálogo (médias, contagens por tipo e ranking de gêneros).
   - `POST /api/reviews`: Inserção de novas avaliações no banco de dados.

2. **Persistência de Dados**:
   - Banco de dados relacional **SQLite (`cinebook.db`)** com tabelas para `media` e `reviews`.

---

## 🚀 Como Executar o Projeto

### Opção 1: Executando com o Servidor Python (Recomendado para apresentação)
1. Abra o terminal na pasta `cinebook`.
2. Execute o comando:
   ```bash
   python server.py
   ```
3. Abra no navegador: `http://localhost:8000`

### Opção 2: Abrindo Diretamente no Navegador (Modo Standalone / Offline)
- Basta dar dois cliques no arquivo `index.html`. O JavaScript ativará automaticamente o modo local resiliente.
