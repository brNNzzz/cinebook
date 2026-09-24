"""
Módulo de Banco de Dados e Lógica de Negócios em Python - CineBook
Utiliza SQLite3 (nativo do Python) para persistência de mídias, avaliações,
autenticação de usuários com senha protegida por PBKDF2-SHA256 (com sal
aleatório por conta) e algoritmos de recomendação.
"""

import sqlite3
import json
import os
import hashlib
import hmac
import secrets
import base64
from typing import List, Dict, Any, Optional

DB_FILE = os.path.join(os.path.dirname(__file__), "cinebook.db")

def get_connection():
    """Retorna uma conexão com o banco de dados SQLite."""
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    return conn

PBKDF2_ITERATIONS = 600_000  # recomendação OWASP (2023) para PBKDF2-HMAC-SHA256
LEGACY_DEMO_HASH = hashlib.sha256(b"123456").hexdigest()


def hash_password(password: str) -> str:
    """
    Gera o hash da senha com PBKDF2-HMAC-SHA256 e um sal aleatório por conta.
    Formato guardado: pbkdf2_sha256$<iterações>$<sal base64>$<hash base64>
    (antes era SHA-256 puro, sem sal — rápido demais de quebrar por força bruta).
    """
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PBKDF2_ITERATIONS)
    return "pbkdf2_sha256${}${}${}".format(
        PBKDF2_ITERATIONS,
        base64.b64encode(salt).decode("ascii"),
        base64.b64encode(digest).decode("ascii"),
    )


def verify_password(password: str, stored: str):
    """
    Confere a senha. Devolve (confere, precisa_atualizar_hash).
    Aceita também o formato antigo (SHA-256 puro) para as contas existentes
    continuarem entrando — e nesse caso pede para regravar no formato novo.
    """
    if not stored or password is None:
        return False, False
    if stored.startswith("pbkdf2_sha256$"):
        try:
            _, iterations, salt_b64, hash_b64 = stored.split("$")
            digest = hashlib.pbkdf2_hmac(
                "sha256", password.encode("utf-8"), base64.b64decode(salt_b64), int(iterations)
            )
            ok = hmac.compare_digest(base64.b64encode(digest).decode("ascii"), hash_b64)
            return ok, ok and int(iterations) < PBKDF2_ITERATIONS
        except (ValueError, TypeError):
            return False, False
    legacy = hashlib.sha256(password.encode("utf-8")).hexdigest()
    ok = hmac.compare_digest(legacy, stored)
    return ok, ok


def validate_new_password(password: str) -> Optional[str]:
    """Mesmas regras do site: 8+ caracteres, letras e números."""
    if not password or len(password) < 8:
        return "A senha precisa ter pelo menos 8 caracteres."
    if len(password) > 128:
        return "A senha pode ter no máximo 128 caracteres."
    if password.isdigit():
        return "A senha não pode ser só de números."
    if not any(c.isalpha() for c in password) or not any(c.isdigit() for c in password):
        return "Use letras e números na senha."
    return None

def init_db():
    """Inicializa as tabelas do banco de dados e popula com dados iniciais."""
    conn = get_connection()
    cursor = conn.cursor()

    # 1. Tabela de Usuários / Clientes
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        avatar TEXT DEFAULT '🍿',
        preferred_genres TEXT DEFAULT '[]',
        created_at TEXT NOT NULL
    )
    """)

    # Migração segura para bancos existentes sem a coluna
    try:
        cursor.execute("ALTER TABLE users ADD COLUMN preferred_genres TEXT DEFAULT '[]'")
    except Exception:
        pass

    # 2. Tabela de Mídias (Filmes, Séries e Livros)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS media (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,          -- 'movie', 'series', 'book'
        title TEXT NOT NULL,
        original_title TEXT,
        year INTEGER NOT NULL,
        rating INTEGER NOT NULL,     -- 0 a 100
        duration TEXT NOT NULL,
        director TEXT NOT NULL,      -- Diretor ou Autor
        genres TEXT NOT NULL,        -- JSON array de strings
        poster TEXT,
        backdrop TEXT,
        tagline TEXT,
        synopsis TEXT,
        cast_data TEXT,             -- JSON array de objetos de elenco/autor
        where_to_watch TEXT,        -- JSON array de streamings/lojas
        trailer_url TEXT,
        sample_snippet TEXT,
        featured INTEGER DEFAULT 0
    )
    """)

    # 3. Tabela de Avaliações / Resenhas de Usuários
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS reviews (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        media_id TEXT NOT NULL,
        user_name TEXT DEFAULT 'Usuário CineBook',
        user_avatar TEXT DEFAULT '🍿',
        rating INTEGER NOT NULL,     -- 1 a 5 estrelas
        comment TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (media_id) REFERENCES media (id)
    )
    """)

    conn.commit()

    # Verifica se a tabela de mídias está vazia para popular
    cursor.execute("SELECT COUNT(*) as count FROM media")
    if cursor.fetchone()["count"] == 0:
        seed_initial_data(conn)

    # Verifica se a tabela de usuários está vazia para criar um usuário demonstrativo
    remove_public_demo_account(conn)
    cursor.execute("SELECT COUNT(*) as count FROM users")
    if cursor.fetchone()["count"] == 0:
        seed_initial_users(conn)

    conn.close()

def seed_initial_users(conn):
    """
    Conta de demonstração: só é criada se a variável de ambiente
    CINEBOOK_DEMO_PASSWORD estiver definida (nada de senha padrão pública
    como "123456" embutida no código).
    """
    demo_password = os.environ.get("CINEBOOK_DEMO_PASSWORD")
    if not demo_password:
        return
    cursor = conn.cursor()
    cursor.execute("""
    INSERT INTO users (name, email, password_hash, avatar, created_at)
    VALUES (?, ?, ?, ?, ?)
    """, ("Pedro Aluno", "pedro@cinebook.com", hash_password(demo_password), "🚀", "26/08/2026"))
    conn.commit()


def remove_public_demo_account(conn):
    """Apaga a antiga conta de demonstração se ainda estiver com a senha 123456."""
    cursor = conn.cursor()
    cursor.execute("DELETE FROM users WHERE LOWER(email) = ? AND password_hash = ?",
                   ("pedro@cinebook.com", LEGACY_DEMO_HASH))
    conn.commit()

def seed_initial_data(conn):
    """Insere os dados iniciais no banco SQLite."""
    cursor = conn.cursor()

    initial_media = [
        # ================= FILMES DE 2026 (EM ALTA & POPULARES NO HERO CAROUSEL) =================
        (
            "m_2026_odrama", "movie", "O Drama", "The Drama", 2026, 95, "2h 10m",
            "Kristoffer Borgli",
            json.dumps(["Drama", "Romance", "Comédia", "Mistério"]),
            "https://image.tmdb.org/t/p/w500/tM3hbeEwJZdQAjwwt5UjFn638AY.jpg",
            "https://image.tmdb.org/t/p/original/1oKLEA9JOhvaBwLpqjROisvWMy7.jpg",
            "O amor perfeito pode se tornar o pesadelo mais imprevisível.",
            "Um casal prestes a se casar é abalado por revelações inesperadas e segredos obscuros que vêm à tona dias antes da cerimônia.",
            json.dumps([
                {"name": "Zendaya", "role": "Protagonista", "photo": "https://image.tmdb.org/t/p/w200/r2Jkr2rB6rK3v9k6PjN3nJg7.jpg"},
                {"name": "Robert Pattinson", "role": "Noivo", "photo": "https://image.tmdb.org/t/p/w200/tcKaWw6qO6kM8k1YhW6e8.jpg"}
            ]),
            json.dumps([
                {"name": "A24 Films", "icon": "🎬", "type": "Cinema"},
                {"name": "Max (HBO)", "icon": "📺", "type": "Streaming"}
            ]),
            "https://www.youtube.com/embed/Way9Dexny3w",
            None,
            1
        ),
        (
            "m_2026_exterminio", "movie", "Extermínio: O Templo dos Ossos", "28 Years Later: The Bone Temple", 2026, 94, "2h 15m",
            "Nia DaCosta, Danny Boyle",
            json.dumps(["Terror", "Ficção Científica", "Suspense", "Ação"]),
            "https://image.tmdb.org/t/p/w500/2loBxp99k59RT8PGmdrLssA17q5.jpg",
            "https://image.tmdb.org/t/p/original/6WqqEjiycNvDLjbEClM1zCwIbDD.jpg",
            "O vírus da raiva evoluiu. A humanidade construiu seu próprio altar.",
            "Quase três décadas após o surto original do vírus da raiva, sobreviventes isolados descobrem uma misteriosa cidadela erguida na Grã-Bretanha.",
            json.dumps([
                {"name": "Cillian Murphy", "role": "Jim", "photo": "https://image.tmdb.org/t/p/w200/cm.jpg"},
                {"name": "Aaron Taylor-Johnson", "role": "Líder Militar", "photo": "https://image.tmdb.org/t/p/w200/atj.jpg"}
            ]),
            json.dumps([
                {"name": "Sony Pictures", "icon": "🎟️", "type": "Cinema"},
                {"name": "Prime Video", "icon": "📺", "type": "Streaming"}
            ]),
            "https://www.youtube.com/embed/Way9Dexny3w",
            None,
            1
        ),
        (
            "m_2026_spiderman4", "movie", "Homem-Aranha: Um Novo Dia", "Spider-Man: Brand New Day", 2026, 96, "2h 35m",
            "Destin Daniel Cretton",
            json.dumps(["Ação", "Aventura", "Ficção Científica"]),
            "https://image.tmdb.org/t/p/w500/x0nvYzQpyJc5pdT9lMnkMuYAg0O.jpg",
            "https://image.tmdb.org/t/p/original/7iwUUcKURMT7aKfCwMy6YnGtchD.jpg",
            "Sem aliados, sem identidade. Um novo começo para o herói da vizinhança.",
            "Após o mundo esquecer a identidade de Peter Parker, ele recomeça sua vida em Nova York como um herói de rua e enfrenta novas alianças perigosas.",
            json.dumps([
                {"name": "Tom Holland", "role": "Peter Parker / Homem-Aranha", "photo": "https://image.tmdb.org/t/p/w200/th.jpg"},
                {"name": "Zendaya", "role": "MJ Watson", "photo": "https://image.tmdb.org/t/p/w200/r2Jkr2rB6rK3v9k6PjN3nJg7.jpg"}
            ]),
            json.dumps([
                {"name": "Cinema", "icon": "🎟️", "type": "Em Cartaz"},
                {"name": "Disney+", "icon": "✨", "type": "Streaming"}
            ]),
            "https://www.youtube.com/embed/cqGjhVJWtEg",
            None,
            1
        ),
        (
            "m_2026_devoradores", "movie", "Devoradores de Estrelas", "Project Hail Mary", 2026, 97, "2h 40m",
            "Phil Lord, Christopher Miller",
            json.dumps(["Ficção Científica", "Aventura", "Drama"]),
            "https://image.tmdb.org/t/p/w500/2i8uru7rlbHKaoIbC2V4FZLT7uW.jpg",
            "https://image.tmdb.org/t/p/original/8Tfys3mDZVp4tNoH2ktm06a0Tau.jpg",
            "A última esperança da Terra está a anos-luz de casa.",
            "Ryland Grace é o único astronauta sobrevivente em uma missão desesperada no espaço profundo para salvar a Terra.",
            json.dumps([
                {"name": "Ryan Gosling", "role": "Ryland Grace", "photo": "https://image.tmdb.org/t/p/w200/rg.jpg"},
                {"name": "Sandra Hüller", "role": "Eva Stratt", "photo": "https://image.tmdb.org/t/p/w200/sh.jpg"}
            ]),
            json.dumps([
                {"name": "MGM / Amazon", "icon": "📺", "type": "Streaming"},
                {"name": "Cinema", "icon": "🎟️", "type": "Em Cartaz"}
            ]),
            "https://www.youtube.com/embed/Way9Dexny3w",
            None,
            1
        ),
        (
            "m_2026_obsessao", "movie", "Obsessão", "Obsession", 2026, 93, "2h 20m",
            "Emerald Fennell",
            json.dumps(["Drama", "Romance", "Suspense"]),
            "https://image.tmdb.org/t/p/w500/wUc6IDf5ChjM1UyQye21qFBeJY0.jpg",
            "https://image.tmdb.org/t/p/original/rZfmzpixLKLR3Hg2u0WgC7XLFl8.jpg",
            "Uma paixão avassaladora que quebra todas as regras da razão.",
            "Uma intensa e apaixonada história de amor e vingança que transcende gerações nos ermos sombrios da Inglaterra.",
            json.dumps([
                {"name": "Margot Robbie", "role": "Catherine Earnshaw", "photo": "https://image.tmdb.org/t/p/w200/mr.jpg"},
                {"name": "Jacob Elordi", "role": "Heathcliff", "photo": "https://image.tmdb.org/t/p/w200/je.jpg"}
            ]),
            json.dumps([
                {"name": "Warner Bros.", "icon": "🎟️", "type": "Cinema"},
                {"name": "Max (HBO)", "icon": "📺", "type": "Streaming"}
            ]),
            "https://www.youtube.com/embed/Way9Dexny3w",
            None,
            1
        ),
        (
            "m_2026_michael", "movie", "Michael: A Biografia do Rei do Pop", "Michael", 2026, 95, "2h 45m",
            "Antoine Fuqua",
            json.dumps(["Drama", "Música", "Biografia"]),
            "https://image.tmdb.org/t/p/w500/gXh43JopeO8BlA661BvlkR6yeqs.jpg",
            "https://image.tmdb.org/t/p/original/ufSwlnECLoUbBjPrFqEQcWBzHwc.jpg",
            "A jornada humana e artística do maior ícone da música mundial.",
            "A cinebiografia explora a infância, o estrelato com os Jackson 5 e as criações revolucionárias de Michael Jackson.",
            json.dumps([
                {"name": "Jaafar Jackson", "role": "Michael Jackson", "photo": "https://image.tmdb.org/t/p/w200/jj.jpg"},
                {"name": "Colman Domingo", "role": "Joe Jackson", "photo": "https://image.tmdb.org/t/p/w200/cd.jpg"}
            ]),
            json.dumps([
                {"name": "Prime Video", "icon": "📺", "type": "Streaming"},
                {"name": "Cinema", "icon": "🎟️", "type": "Em Cartaz"}
            ]),
            "https://www.youtube.com/embed/uYPbbksJxIg",
            None,
            1
        ),
        (
            "m_2026_batman", "movie", "The Batman: Parte II", "The Batman Part II", 2026, 94, "2h 50m",
            "Matt Reeves",
            json.dumps(["Ação", "Crime", "Drama", "Suspense"]),
            "https://image.tmdb.org/t/p/w500/wd7b4Nv9QBHDTIjc2m7sr0IUMoh.jpg",
            "https://image.tmdb.org/t/p/original/rvtdN5XkWAfGX6xDuPL6yYS2seK.jpg",
            "As sombras de Gotham agora são dele.",
            "Bruce Wayne mergulha ainda mais fundo nas entranhas corruptas de Gotham City, enfrentando novos conspiradores e protegendo a cidade do caos iminente.",
            json.dumps([
                {"name": "Robert Pattinson", "role": "Bruce Wayne / Batman", "photo": "https://image.tmdb.org/t/p/w200/tcKaWw6qO6kM8k1YhW6e8.jpg"},
                {"name": "Andy Serkis", "role": "Alfred Pennyworth", "photo": "https://image.tmdb.org/t/p/w200/2a4tBmJwSj5.jpg"},
                {"name": "Colin Farrell", "role": "Oswald Cobblepot", "photo": "https://image.tmdb.org/t/p/w200/lZ4b1d.jpg"}
            ]),
            json.dumps([
                {"name": "Max (HBO)", "icon": "📺", "type": "Streaming"},
                {"name": "Cinema", "icon": "🎟️", "type": "Em Cartaz"}
            ]),
            "https://www.youtube.com/embed/mqqft2x_Aa4",
            None,
            1
        ),
        (
            "m_2026_secretwars", "movie", "Vingadores: Guerras Secretas", "Avengers: Secret Wars", 2026, 96, "3h 10m",
            "Anthony & Joe Russo",
            json.dumps(["Ação", "Ficção Científica", "Aventura"]),
            "https://image.tmdb.org/t/p/w500/yEYe1GoYR5qnsTkJjlUPIpEfPl9.jpg",
            "https://image.tmdb.org/t/p/original/uLqws8xbhFnxa9PXQXJghI3GSfV.jpg",
            "O destino de todos os universos em colisão.",
            "A maior batalha multiversal de todos os tempos reúne os maiores heróis e vilões de todas as linhas temporais para salvar a própria estrutura da realidade.",
            json.dumps([
                {"name": "Robert Downey Jr.", "role": "Doutor Destino", "photo": "https://image.tmdb.org/t/p/w200/5qM8.jpg"},
                {"name": "Tom Holland", "role": "Peter Parker / Homem-Aranha", "photo": "https://image.tmdb.org/t/p/w200/th.jpg"}
            ]),
            json.dumps([
                {"name": "Disney+", "icon": "✨", "type": "Streaming"},
                {"name": "Cinema", "icon": "🎟️", "type": "Em Cartaz"}
            ]),
            "https://www.youtube.com/embed/eOrNdBpGMv8",
            None,
            1
        ),
        (
            "m_2026_spiderverse", "movie", "Homem-Aranha: Além do Aranhaverso", "Spider-Man: Beyond the Spider-Verse", 2026, 95, "2h 25m",
            "Joaquim Dos Santos, Kemp Powers",
            json.dumps(["Animação", "Ação", "Ficção Científica"]),
            "https://image.tmdb.org/t/p/w500/9KAe39xqyZnv9J4W3DRGdQqX82h.jpg",
            "https://image.tmdb.org/t/p/original/7tT2w75p69nll5PvALpWFCYx5dU.jpg",
            "Escreva sua própria história em cada dimensão.",
            "Miles Morales precisa escapar da Terra-42 e unir seus aliados através das realidades para deter o Mancha e salvar seu pai.",
            json.dumps([
                {"name": "Shameik Moore", "role": "Miles Morales (voz)", "photo": "https://image.tmdb.org/t/p/w200/uU.jpg"},
                {"name": "Hailee Steinfeld", "role": "Gwen Stacy (voz)", "photo": "https://image.tmdb.org/t/p/w200/hS.jpg"}
            ]),
            json.dumps([
                {"name": "Max (HBO)", "icon": "📺", "type": "Streaming"},
                {"name": "Cinema", "icon": "🎟️", "type": "Em Cartaz"}
            ]),
            "https://www.youtube.com/embed/cqGjhVJWtEg",
            None,
            1
        ),
        (
            "m_2026_dune", "movie", "Duna: Messias", "Dune: Messiah", 2026, 93, "2h 45m",
            "Denis Villeneuve",
            json.dumps(["Ficção Científica", "Aventura", "Drama"]),
            "https://image.tmdb.org/t/p/w500/8LJJjLjAzAwXS40S5mx79PJ2jSs.jpg",
            "https://image.tmdb.org/t/p/original/eZ239CUp1d6OryZEBPnO2n87gMG.jpg",
            "O reinado do imperador Paul Muad'Dib.",
            "Doze anos após assumir o trono do Império conhecido, Paul Atreides enfrenta conspirações internas entre as Bene Gesserit e fanáticos em Arrakis.",
            json.dumps([
                {"name": "Timothée Chalamet", "role": "Paul Atreides", "photo": "https://image.tmdb.org/t/p/w200/BE2sdjpgsa2rNTFa66f7upkaOP.jpg"},
                {"name": "Zendaya", "role": "Chani", "photo": "https://image.tmdb.org/t/p/w200/r2Jkr2rB6rK3v9k6PjN3nJg7.jpg"}
            ]),
            json.dumps([
                {"name": "Max (HBO)", "icon": "📺", "type": "Streaming"},
                {"name": "Cinema", "icon": "🎟️", "type": "Em Cartaz"}
            ]),
            "https://www.youtube.com/embed/Way9Dexny3w",
            None,
            1
        ),
        (
            "m_2026_superman", "movie", "Superman: Legacy", "Superman", 2026, 91, "2h 30m",
            "James Gunn",
            json.dumps(["Ação", "Aventura", "Ficção Científica"]),
            "https://image.tmdb.org/t/p/w500/v8ezJI3qfEv4OYq8AWSp4inFIwE.jpg",
            "https://image.tmdb.org/t/p/original/eGX66zonvc4bXg3rM08RUxdYSDx.jpg",
            "A verdade, a justiça e um amanhã melhor.",
            "O Homem de Aço precisa conciliar sua herança kryptoniana com sua criação humana no Kansas em um mundo repleto de super-heróis.",
            json.dumps([
                {"name": "David Corenswet", "role": "Clark Kent / Superman", "photo": "https://image.tmdb.org/t/p/w200/dc.jpg"},
                {"name": "Rachel Brosnahan", "role": "Lois Lane", "photo": "https://image.tmdb.org/t/p/w200/rb.jpg"}
            ]),
            json.dumps([
                {"name": "Max (HBO)", "icon": "📺", "type": "Streaming"},
                {"name": "Cinema", "icon": "🎟️", "type": "Em Cartaz"}
            ]),
            "https://www.youtube.com/embed/Way9Dexny3w",
            None,
            1
        ),
        (
            "m_2026_toystory5", "movie", "Toy Story 5", "Toy Story 5", 2026, 93, "1h 45m",
            "Andrew Stanton",
            json.dumps(["Animação", "Aventura", "Comédia", "Família"]),
            "https://image.tmdb.org/t/p/w500/sssrBhdvDcczgMQYDc8oCoSuFEJ.jpg",
            "https://image.tmdb.org/t/p/original/8sSKdEmlmqF4kJUd28SqthXC4yZ.jpg",
            "O encontro inesquecível entre brinquedos clássicos e a era digital.",
            "Woody, Buzz Lightyear e Jessie enfrentam o maior desafio de suas vidas: competir pela atenção das crianças em um mundo tecnológico.",
            json.dumps([
                {"name": "Tom Hanks", "role": "Woody (voz)", "photo": "https://image.tmdb.org/t/p/w200/th.jpg"},
                {"name": "Tim Allen", "role": "Buzz Lightyear (voz)", "photo": "https://image.tmdb.org/t/p/w200/ta.jpg"}
            ]),
            json.dumps([
                {"name": "Disney+", "icon": "✨", "type": "Streaming"},
                {"name": "Cinema", "icon": "🎟️", "type": "Em Cartaz"}
            ]),
            "https://www.youtube.com/embed/cqGjhVJWtEg",
            None,
            1
        ),
        (
            "m_2026_conjuring", "movie", "Invocação do Mal: Últimos Ritos", "The Conjuring: Last Rites", 2026, 90, "2h 10m",
            "Michael Chaves",
            json.dumps(["Terror", "Mistério", "Suspense"]),
            "https://image.tmdb.org/t/p/w500/40nHGUfypLhlr7gJx8At1IbYkaK.jpg",
            "https://image.tmdb.org/t/p/original/i8MupUe4xgmYXoRNAQMYvuoexSU.jpg",
            "O caso mais sombrio e aterrorizante dos Warren.",
            "Ed e Lorraine Warren enfrentam seu caso mais perigoso ao serem chamados para exorcizar uma entidade ancestral que ameaça destruir uma família inteira.",
            json.dumps([
                {"name": "Patrick Wilson", "role": "Ed Warren", "photo": "https://image.tmdb.org/t/p/w200/pw.jpg"},
                {"name": "Vera Farmiga", "role": "Lorraine Warren", "photo": "https://image.tmdb.org/t/p/w200/vf.jpg"}
            ]),
            json.dumps([
                {"name": "Max (HBO)", "icon": "📺", "type": "Streaming"},
                {"name": "Cinema", "icon": "🎟️", "type": "Em Cartaz"}
            ]),
            "https://www.youtube.com/embed/Way9Dexny3w",
            None,
            1
        ),

        # Séries
        (
            "s1", "series", "The Last of Us", "The Last of Us", 2023, 88, "1ª Temp • 9 Eps",
            "Craig Mazin, Neil Druckmann",
            json.dumps(["Drama", "Ficção Científica", "Ação", "Terror"]),
            "https://image.tmdb.org/t/p/w500/dmo6TYuuJgaYinXBPjrgG9mB5od.jpg",
            "https://image.tmdb.org/t/p/original/uDgy6hyPd82kOHh6I95FLtLnj6p.jpg",
            "Quando você estiver perdido na escuridão, procure a luz.",
            "Vinte anos após a queda da civilização moderna, Joel é contratado para contrabandear Ellie através de um país devastado.",
            json.dumps([{"name": "Pedro Pascal", "role": "Joel Miller", "photo": "https://image.tmdb.org/t/p/w200/pp.jpg"}]),
            json.dumps([{"name": "Max (HBO)", "icon": "📺", "type": "Streaming"}]),
            "https://www.youtube.com/embed/uLtkt8BonwM",
            None,
            1
        ),
        (
            "s2", "series", "Stranger Things", "Stranger Things", 2016, 87, "4 Temporadas",
            "The Duffer Brothers",
            json.dumps(["Ficção Científica", "Terror", "Drama", "Mistério"]),
            "https://image.tmdb.org/t/p/w500/49WJfeN0moxb9IPfGn8AIqMGskD.jpg",
            "https://image.tmdb.org/t/p/original/56v2KjBlU4XaOv9rVYEQypROD7P.jpg",
            "Cada final tem um começo.",
            "Quando um jovem desaparece, uma pequena cidade descobre forças sobrenaturais e uma garota muito estranha.",
            json.dumps([{"name": "Millie Bobby Brown", "role": "Eleven", "photo": "https://image.tmdb.org/t/p/w200/mb.jpg"}]),
            json.dumps([{"name": "Netflix", "icon": "🔴", "type": "Streaming"}]),
            "https://www.youtube.com/embed/b9EkMc79ZSU",
            None,
            0
        ),
        (
            "s3", "series", "Breaking Bad", "Breaking Bad", 2008, 96, "5 Temporadas",
            "Vince Gilligan",
            json.dumps(["Drama", "Crime", "Suspense"]),
            "https://image.tmdb.org/t/p/w500/ggFHVNu6YYI5L9pCfOacjizRGt.jpg",
            "https://image.tmdb.org/t/p/original/tsRy63Mu5cu8etL1X7ZLyf7UP1M.jpg",
            "O mal se espalha.",
            "Ao descobrir que tem câncer terminal, um professor de química passa a produzir metanfetamina para garantir o futuro da família.",
            json.dumps([{"name": "Bryan Cranston", "role": "Walter White", "photo": "https://image.tmdb.org/t/p/w200/bc.jpg"}]),
            json.dumps([{"name": "Netflix", "icon": "🔴", "type": "Streaming"}]),
            "https://www.youtube.com/embed/HhesaQXLuRY",
            None,
            0
        ),
        (
            "s4", "series", "O Problema dos 3 Corpos", "3 Body Problem", 2024, 82, "1ª Temp • 8 Eps",
            "David Benioff, D.B. Weiss",
            json.dumps(["Ficção Científica", "Mistério", "Drama"]),
            "https://image.tmdb.org/t/p/w500/ykZ8c7Bf1Vq5xHl4eJ2iR5.jpg",
            "https://image.tmdb.org/t/p/original/9faGSFi5jam6pvaGNd0Gss3vtPt.jpg",
            "O universo está ouvindo.",
            "Uma decisão tomada na China nos anos 1960 ecoa através do espaço e do tempo até um grupo de cientistas no presente.",
            json.dumps([{"name": "Jess Hong", "role": "Jin Cheng", "photo": "https://image.tmdb.org/t/p/w200/jh.jpg"}]),
            json.dumps([{"name": "Netflix", "icon": "🔴", "type": "Streaming"}]),
            "https://www.youtube.com/embed/mogSbMD6EcY",
            None,
            0
        ),
        (
            "s5", "series", "A Casa do Dragão", "House of the Dragon", 2022, 85, "2 Temporadas",
            "Ryan J. Condal",
            json.dumps(["Fantasia", "Drama", "Ação"]),
            "https://image.tmdb.org/t/p/w500/1X4h40fcB4WWUmIBK0auT4zRBAV.jpg",
            "https://image.tmdb.org/t/p/original/etj5CuMuam3hDAc4uz3jUtFk0m3.jpg",
            "O fogo reinará.",
            "A história da dinastia Targaryen e a lendária guerra civil conhecida como a Dança dos Dragões.",
            json.dumps([{"name": "Matt Smith", "role": "Daemon Targaryen", "photo": "https://image.tmdb.org/t/p/w200/ms.jpg"}]),
            json.dumps([{"name": "Max (HBO)", "icon": "📺", "type": "Streaming"}]),
            "https://www.youtube.com/embed/DotnJ7tTA34",
            None,
            0
        ),

        # Livros
        (
            "b1", "book", "Duna (Edição Definitiva)", "Dune", 1965, 94, "680 páginas",
            "Frank Herbert",
            json.dumps(["Ficção Científica", "Fantasia", "Aventura"]),
            "https://images-na.ssl-images-amazon.com/images/S/compressed.photo.goodreads.com/books/1555447414i/44767458.jpg",
            "https://image.tmdb.org/t/p/original/xOMo8BRK7PfcJv9JCnx7s5200fr.jpg",
            "Não terei medo. O medo é o assassino da mente.",
            "Ambientado no planeta desértico Arrakis, Duna conta a épica história de Paul Atreides na disputa pelo mélange.",
            json.dumps([{"name": "Frank Herbert", "role": "Autor", "photo": "https://upload.wikimedia.org/wikipedia/commons/thumb/8/8d/Frank_Herbert_1984.jpg/220px-Frank_Herbert_1984.jpg"}]),
            json.dumps([{"name": "Amazon Kindle", "icon": "📖", "type": "E-book"}]),
            None,
            "Um começo é a época de se tomar o maior cuidado para que os equilíbrios fiquem corretos...",
            1
        ),
        (
            "b2", "book", "1984", "Nineteen Eighty-Four", 1949, 93, "416 páginas",
            "George Orwell",
            json.dumps(["Ficção Científica", "Distopia", "Drama"]),
            "https://images-na.ssl-images-amazon.com/images/S/compressed.photo.goodreads.com/books/1657781256i/61439040.jpg",
            "https://images.unsplash.com/photo-1512820790803-83ca734da794?auto=format&fit=crop&w=1600&q=80",
            "O Grande Irmão está de olho em você.",
            "Winston Smith é um funcionário do Ministério da Verdade que sonha com a rebelião contra o Partido.",
            json.dumps([{"name": "George Orwell", "role": "Autor", "photo": "https://upload.wikimedia.org/wikipedia/commons/thumb/7/7e/George_Orwell_press_photo.jpg/220px-George_Orwell_press_photo.jpg"}]),
            json.dumps([{"name": "Amazon Kindle", "icon": "📖", "type": "E-book"}]),
            None,
            "Era um dia frio e luminoso de abril, e os relógios davam treze horas...",
            0
        ),
        (
            "b3", "book", "O Senhor dos Anéis: A Sociedade do Anel", "The Fellowship of the Ring", 1954, 97, "576 páginas",
            "J.R.R. Tolkien",
            json.dumps(["Fantasia", "Aventura", "Alta Fantasia"]),
            "https://m.media-amazon.com/images/I/81EBp5rd6RL._AC_UF1000,1000_QL80_.jpg",
            "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=1600&q=80",
            "Um Anel para a todos governar.",
            "Frodo Bolseiro recebe a perigosa missão de destruir o Um Anel nas profundezas da Montanha da Perdição.",
            json.dumps([{"name": "J.R.R. Tolkien", "role": "Autor", "photo": "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d4/J._R._R._Tolkien%2C_ca._1925.jpg/220px-J._R._R._Tolkien%2C_ca._1925.jpg"}]),
            json.dumps([{"name": "Amazon Kindle", "icon": "📖", "type": "E-book"}]),
            None,
            "Quando o senhor Bilbo Bolseiro de Bolsão anunciou que logo comemoraria seu 111º aniversário...",
            0
        ),
        (
            "b4", "book", "O Problema dos Três Corpos (Trilogia)", "The Three-Body Problem", 2008, 89, "464 páginas",
            "Cixin Liu",
            json.dumps(["Ficção Científica", "Suspense", "Hard Sci-Fi"]),
            "https://images-na.ssl-images-amazon.com/images/S/compressed.photo.goodreads.com/books/1415428227i/20518872.jpg",
            "https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=1600&q=80",
            "A humanidade fez o primeiro contato.",
            "Um projeto militar secreto estabelece contato com uma civilização alienígena em colapso.",
            json.dumps([{"name": "Cixin Liu", "role": "Autor", "photo": "https://upload.wikimedia.org/wikipedia/commons/thumb/c/cf/Liu_Cixin_2015.jpg/220px-Liu_Cixin_2015.jpg"}]),
            json.dumps([{"name": "Amazon Kindle", "icon": "📖", "type": "E-book"}]),
            None,
            "A Base Costa Vermelha erguia-se silenciosa sob os céus gélidos...",
            0
        ),
        (
            "b5", "book", "Neuromancer", "Neuromancer", 1984, 91, "320 páginas",
            "William Gibson",
            json.dumps(["Ficção Científica", "Cyberpunk", "Ação"]),
            "https://images-na.ssl-images-amazon.com/images/S/compressed.photo.goodreads.com/books/1554437249i/6088007.jpg",
            "https://images.unsplash.com/photo-1509198397868-475647b2a1e5?auto=format&fit=crop&w=1600&q=80",
            "O céu sobre o porto tinha a cor de uma televisão fora do ar.",
            "Case é um hacker exilado que recebe uma última chance no ciberespaço ao lado de Molly Millions.",
            json.dumps([{"name": "William Gibson", "role": "Autor", "photo": "https://upload.wikimedia.org/wikipedia/commons/thumb/5/52/William_Gibson_2008.jpg/220px-William_Gibson_2008.jpg"}]),
            json.dumps([{"name": "Amazon Kindle", "icon": "📖", "type": "E-book"}]),
            None,
            "O céu sobre o porto tinha a cor de uma televisão sintonizada num canal fora do ar...",
            0
        )
    ]

    cursor.executemany("""
    INSERT INTO media (
        id, type, title, original_title, year, rating, duration, director,
        genres, poster, backdrop, tagline, synopsis, cast_data, where_to_watch,
        trailer_url, sample_snippet, featured
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, initial_media)

    # Avaliações iniciais
    initial_reviews = [
        ("m1", "Pedro Aluno", "🚀", 5, "Cinematografia espetacular e trilha sonora imersiva de Hans Zimmer! Obra-prima.", "25/08/2026"),
        ("s1", "Maria Silva", "🍿", 5, "Melhor adaptação de videogame da história da televisão.", "24/08/2026"),
        ("b1", "Lucas Tech", "📚", 5, "Uma das maiores obras de ficção científica de todos os tempos.", "20/08/2026")
    ]
    cursor.executemany("""
    INSERT INTO reviews (media_id, user_name, user_avatar, rating, comment, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
    """, initial_reviews)

    conn.commit()

# ==========================================
# AUTENTICAÇÃO E GESTÃO DE USUÁRIOS 👤
# ==========================================

def register_user(name: str, email: str, password: str, avatar: str = "🍿", preferred_genres: Optional[List[str]] = None) -> Dict[str, Any]:
    """Cadastra um novo cliente no SQLite com validação e criptografia de senha."""
    conn = get_connection()
    cursor = conn.cursor()

    email_clean = email.strip().lower()
    name_clean = name.strip()

    if not email_clean or not name_clean or not password:
        conn.close()
        return {"success": False, "error": "Todos os campos são obrigatórios."}

    password_error = validate_new_password(password)
    if password_error:
        conn.close()
        return {"success": False, "error": password_error}

    # Verifica se o e-mail já está cadastrado
    cursor.execute("SELECT id FROM users WHERE email = ?", (email_clean,))
    if cursor.fetchone():
        conn.close()
        return {"success": False, "error": "Este e-mail já está cadastrado. Tente fazer login."}

    hashed = hash_password(password)
    from datetime import datetime
    now_str = datetime.now().strftime("%d/%m/%Y")
    pref_json = json.dumps(preferred_genres or [])

    cursor.execute("""
    INSERT INTO users (name, email, password_hash, avatar, preferred_genres, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
    """, (name_clean, email_clean, hashed, avatar or "🍿", pref_json, now_str))
    
    user_id = cursor.lastrowid
    conn.commit()
    conn.close()

    return {
        "success": True,
        "user": {
            "id": user_id,
            "name": name_clean,
            "email": email_clean,
            "avatar": avatar or "🍿",
            "preferredCategories": preferred_genres or [],
            "createdAt": now_str
        }
    }

def login_user(email: str, password: str) -> Dict[str, Any]:
    """Autentica o cliente verificando o e-mail e o hash da senha."""
    conn = get_connection()
    cursor = conn.cursor()

    identifier_clean = (email or "").strip().lower()

    cursor.execute("""
    SELECT id, name, email, avatar, preferred_genres, created_at, password_hash
    FROM users
    WHERE LOWER(email) = ? OR LOWER(name) = ?
    """, (identifier_clean, identifier_clean))

    row = cursor.fetchone()
    ok, needs_upgrade = verify_password(password or "", row["password_hash"]) if row else (False, False)

    if not ok:
        conn.close()
        return {"success": False, "error": "Usuário/E-mail ou senha incorretos."}

    # Conta antiga (SHA-256 puro): regrava no formato novo agora que a senha
    # foi conferida.
    if needs_upgrade:
        cursor.execute("UPDATE users SET password_hash = ? WHERE id = ?", (hash_password(password), row["id"]))
        conn.commit()
    conn.close()

    user = dict(row)
    pref_list = []
    try:
        if user.get("preferred_genres"):
            pref_list = json.loads(user["preferred_genres"])
    except Exception:
        pref_list = []

    return {
        "success": True,
        "user": {
            "id": user["id"],
            "name": user["name"],
            "email": user["email"],
            "avatar": user["avatar"],
            "preferredCategories": pref_list,
            "createdAt": user["created_at"]
        }
    }

def update_user_profile(user_id: int, name: Optional[str] = None, avatar: Optional[str] = None, new_password: Optional[str] = None, preferred_genres: Optional[List[str]] = None, current_password: Optional[str] = None) -> Dict[str, Any]:
    """
    Atualiza as informações do usuário (nome, avatar, categorias e/ou senha).
    Para trocar a senha é obrigatório informar a senha atual.
    """
    conn = get_connection()
    cursor = conn.cursor()

    if new_password:
        cursor.execute("SELECT password_hash FROM users WHERE id = ?", (user_id,))
        row = cursor.fetchone()
        ok, _ = verify_password(current_password or "", row["password_hash"]) if row else (False, False)
        if not ok:
            conn.close()
            return {"success": False, "error": "A senha atual está incorreta."}
        password_error = validate_new_password(new_password)
        if password_error:
            conn.close()
            return {"success": False, "error": password_error}

    fields = []
    params = []

    if name and name.strip():
        fields.append("name = ?")
        params.append(name.strip())

    if avatar:
        fields.append("avatar = ?")
        params.append(avatar)

    if preferred_genres is not None:
        fields.append("preferred_genres = ?")
        params.append(json.dumps(preferred_genres))

    if new_password:
        fields.append("password_hash = ?")
        params.append(hash_password(new_password))

    if not fields:
        conn.close()
        return {"success": False, "error": "Nenhum dado informado para atualização."}

    params.append(user_id)
    query = f"UPDATE users SET {', '.join(fields)} WHERE id = ?"
    cursor.execute(query, params)
    conn.commit()

    cursor.execute("SELECT id, name, email, avatar, preferred_genres, created_at FROM users WHERE id = ?", (user_id,))
    row = cursor.fetchone()
    conn.close()

    if not row:
        return {"success": False, "error": "Usuário não encontrado."}

    user = dict(row)
    pref_list = []
    try:
        if user.get("preferred_genres"):
            pref_list = json.loads(user["preferred_genres"])
    except Exception:
        pref_list = []

    return {
        "success": True,
        "user": {
            "id": user["id"],
            "name": user["name"],
            "email": user["email"],
            "avatar": user["avatar"],
            "preferredCategories": pref_list,
            "createdAt": user["created_at"]
        }
    }

# ==========================================
# CONSULTAS DE MÍDIA & RESENHAS
# ==========================================

def get_all_media(media_type: Optional[str] = None, genre: Optional[str] = None, search: Optional[str] = None, sort_by: str = "popularity") -> List[Dict[str, Any]]:
    """Consulta e filtra mídias do banco de dados SQLite."""
    conn = get_connection()
    cursor = conn.cursor()

    query = "SELECT * FROM media WHERE 1=1"
    params = []

    if media_type and media_type != "all":
        query += " AND type = ?"
        params.append(media_type)

    if genre and genre != "Todos os Gêneros":
        query += " AND genres LIKE ?"
        params.append(f"%{genre}%")

    if search and search.strip():
        term = f"%{search.strip().lower()}%"
        query += " AND (LOWER(title) LIKE ? OR LOWER(original_title) LIKE ? OR LOWER(director) LIKE ? OR LOWER(genres) LIKE ?)"
        params.extend([term, term, term, term])

    if sort_by == "rating-desc":
        query += " ORDER BY rating DESC"
    elif sort_by == "year-desc":
        query += " ORDER BY year DESC"
    elif sort_by == "title-asc":
        query += " ORDER BY title ASC"
    else:
        query += " ORDER BY rating * 1.5 DESC"

    cursor.execute(query, params)
    rows = cursor.fetchall()
    conn.close()

    result = []
    for r in rows:
        item = dict(r)
        item["genres"] = json.loads(item["genres"]) if item["genres"] else []
        item["cast"] = json.loads(item["cast_data"]) if item["cast_data"] else []
        item["whereToWatch"] = json.loads(item["where_to_watch"]) if item["where_to_watch"] else []
        item["originalTitle"] = item["original_title"]
        item["trailerUrl"] = item["trailer_url"]
        item["sampleSnippet"] = item["sample_snippet"]
        item["featured"] = bool(item["featured"])
        result.append(item)

    return result

def get_media_by_id(media_id: str) -> Optional[Dict[str, Any]]:
    """Retorna uma obra específica com todas as suas informações e avaliações."""
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT * FROM media WHERE id = ?", (media_id,))
    row = cursor.fetchone()

    if not row:
        conn.close()
        return None

    item = dict(row)
    item["genres"] = json.loads(item["genres"]) if item["genres"] else []
    item["cast"] = json.loads(item["cast_data"]) if item["cast_data"] else []
    item["whereToWatch"] = json.loads(item["where_to_watch"]) if item["where_to_watch"] else []
    item["originalTitle"] = item["original_title"]
    item["trailerUrl"] = item["trailer_url"]
    item["sampleSnippet"] = item["sample_snippet"]
    item["featured"] = bool(item["featured"])

    cursor.execute("""
    SELECT user_name, user_avatar, rating, comment, created_at as date 
    FROM reviews 
    WHERE media_id = ? 
    ORDER BY id DESC
    """, (media_id,))
    item["reviews"] = [dict(rev) for rev in cursor.fetchall()]

    conn.close()
    return item

def add_review(media_id: str, user_name: str, user_avatar: str, rating: int, comment: str, date_str: str) -> bool:
    """Insere uma nova resenha com autoria do cliente no banco de dados."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
    INSERT INTO reviews (media_id, user_name, user_avatar, rating, comment, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
    """, (media_id, user_name or "Usuário CineBook", user_avatar or "🍿", rating, comment, date_str))
    conn.commit()
    conn.close()
    return True

# ==========================================
# ALGORITMO DE RECOMENDAÇÃO EM PYTHON 🧠
# ==========================================

def get_recommendations(media_id: str, limit: int = 3) -> List[Dict[str, Any]]:
    """Similaridade de Jaccard sobre os conjuntos de gêneros + nota."""
    current = get_media_by_id(media_id)
    if not current:
        return []

    all_items = get_all_media()
    current_genres = set(current.get("genres", []))
    
    scored_items = []
    for item in all_items:
        if item["id"] == media_id:
            continue

        item_genres = set(item.get("genres", []))
        intersection = len(current_genres.intersection(item_genres))
        union = len(current_genres.union(item_genres))
        jaccard_score = intersection / union if union > 0 else 0.0

        type_bonus = 0.2 if item["type"] == current["type"] else 0.0
        final_similarity = (jaccard_score * 0.7) + type_bonus + ((item["rating"] / 100) * 0.1)

        scored_items.append((final_similarity, item))

    scored_items.sort(key=lambda x: x[0], reverse=True)
    return [item for score, item in scored_items[:limit]]

# ==========================================
# ANÁLISE DE DADOS & ESTATÍSTICAS (CS DEMO) 📊
# ==========================================

def get_catalog_statistics() -> Dict[str, Any]:
    """Calcula estatísticas analíticas do catálogo."""
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT type, COUNT(*) as count, AVG(rating) as avg_rating FROM media GROUP BY type")
    type_stats = {row["type"]: {"count": row["count"], "avg_rating": round(row["avg_rating"], 1)} for row in cursor.fetchall()}

    cursor.execute("SELECT COUNT(*) as total_media FROM media")
    total_media = cursor.fetchone()["total_media"]

    cursor.execute("SELECT COUNT(*) as total_reviews FROM reviews")
    total_reviews = cursor.fetchone()["total_reviews"]

    cursor.execute("SELECT COUNT(*) as total_users FROM users")
    total_users = cursor.fetchone()["total_users"]

    cursor.execute("SELECT AVG(rating) as global_avg FROM media")
    global_avg = round(cursor.fetchone()["global_avg"] or 0, 1)

    all_media = get_all_media()
    genre_counts: Dict[str, int] = {}
    for item in all_media:
        for g in item["genres"]:
            genre_counts[g] = genre_counts.get(g, 0) + 1

    top_genres = sorted(genre_counts.items(), key=lambda x: x[1], reverse=True)[:5]

    conn.close()
    return {
        "totalMedia": total_media,
        "totalReviews": total_reviews,
        "totalUsers": total_users,
        "globalAverageScore": global_avg,
        "byType": type_stats,
        "topGenres": [{"genre": g, "count": c} for g, c in top_genres]
    }
