"""
CineBook - Servidor HTTP & API REST em Python
Servidor completo nativo (Standard Library) com autenticação de usuários,
banco de dados SQLite e recomendação inteligente.
"""

import sys
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8')

import http.server
import socketserver
import json
import urllib.parse
import os
import mimetypes
from typing import Any
import database

PORT = 8000
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

class CineBookHandler(http.server.SimpleHTTPRequestHandler):
    
    def end_headers(self):
        # Habilita CORS
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def do_GET(self):
        parsed_url = urllib.parse.urlparse(self.path)
        path = parsed_url.path
        query_params = urllib.parse.parse_qs(parsed_url.query)

        # 1. API: Listagem de Mídias
        if path == "/api/media":
            media_type = query_params.get("type", [None])[0]
            genre = query_params.get("genre", [None])[0]
            search = query_params.get("search", [None])[0]
            sort_by = query_params.get("sort", ["popularity"])[0]

            results = database.get_all_media(media_type, genre, search, sort_by)
            self.send_json_response(200, results)
            return

        # 2. API: Detalhes de uma Mídia (/api/media/<id>)
        elif path.startswith("/api/media/"):
            media_id = path.replace("/api/media/", "").strip()
            item = database.get_media_by_id(media_id)
            if item:
                self.send_json_response(200, item)
            else:
                self.send_json_response(404, {"error": "Mídia não encontrada"})
            return

        # 3. API: Algoritmo de Recomendação (/api/recommendations/<id>)
        elif path.startswith("/api/recommendations/"):
            media_id = path.replace("/api/recommendations/", "").strip()
            recommendations = database.get_recommendations(media_id, limit=3)
            self.send_json_response(200, recommendations)
            return

        # 4. API: Estatísticas Analíticas do Catálogo
        elif path == "/api/stats":
            stats = database.get_catalog_statistics()
            self.send_json_response(200, stats)
            return

        # 5. API: Status de Saúde do Backend
        elif path == "/api/health":
            self.send_json_response(200, {"status": "online", "database": "SQLite", "version": "1.2.0", "tmdb": "connected"})
            return

        # 6. API: Configuração e Chave TMDb
        elif path == "/api/tmdb/config":
            self.send_json_response(200, {
                "active": True,
                "provider": "The Movie Database (TMDb v3)",
                "features": ["trending", "popular", "multi_search", "credits", "watch_providers", "trailers"]
            })
            return

        # 6. Servir Arquivos Estáticos (Frontend)
        else:
            if path == "/":
                path = "/index.html"

            file_path = os.path.normpath(os.path.join(BASE_DIR, path.lstrip("/")))
            if not os.path.exists(file_path) and os.path.exists(file_path + ".html"):
                file_path = file_path + ".html"
            
            if not file_path.startswith(BASE_DIR) or not os.path.exists(file_path) or os.path.isdir(file_path):
                self.send_error(404, "Arquivo não encontrado")
                return

            mime_type, _ = mimetypes.guess_type(file_path)
            if not mime_type:
                mime_type = "application/octet-stream"

            try:
                with open(file_path, "rb") as f:
                    content = f.read()
                self.send_response(200)
                self.send_header("Content-Type", mime_type)
                self.send_header("Content-Length", str(len(content)))
                self.end_headers()
                self.wfile.write(content)
            except Exception as e:
                self.send_error(500, f"Erro interno: {str(e)}")

    def do_POST(self):
        parsed_url = urllib.parse.urlparse(self.path)
        path = parsed_url.path

        content_length = int(self.headers.get("Content-Length", 0))
        post_data = self.rfile.read(content_length)
        
        try:
            body = json.loads(post_data.decode("utf-8")) if post_data else {}
        except Exception:
            self.send_json_response(400, {"error": "Corpo da requisição inválido (esperado JSON)"})
            return

        # 1. API: Cadastro de Novo Usuário (/api/auth/register)
        if path == "/api/auth/register":
            name = body.get("name")
            email = body.get("email")
            password = body.get("password")
            avatar = body.get("avatar", "🍿")
            preferred_genres = body.get("preferredCategories") or body.get("preferred_genres") or []

            result = database.register_user(name, email, password, avatar, preferred_genres)
            status_code = 201 if result["success"] else 400
            self.send_json_response(status_code, result)
            return

        # 2. API: Login de Usuário (/api/auth/login)
        elif path == "/api/auth/login":
            email = body.get("email")
            password = body.get("password")

            result = database.login_user(email, password)
            status_code = 200 if result["success"] else 401
            self.send_json_response(status_code, result)
            return

        # 3. API: Atualizar Perfil de Usuário (/api/user/update)
        elif path == "/api/user/update":
            user_id = body.get("userId")
            name = body.get("name")
            avatar = body.get("avatar")
            new_password = body.get("password")
            current_password = body.get("currentPassword")
            preferred_genres = body.get("preferredCategories") or body.get("preferred_genres")

            if not user_id:
                self.send_json_response(400, {"error": "ID de usuário obrigatório"})
                return

            result = database.update_user_profile(user_id, name, avatar, new_password, preferred_genres, current_password)
            status_code = 200 if result["success"] else 400
            self.send_json_response(status_code, result)
            return

        # 3. API: Salvar Resenha / Avaliação
        elif path == "/api/reviews":
            media_id = body.get("mediaId")
            user_name = body.get("userName", "Usuário CineBook")
            user_avatar = body.get("userAvatar", "🍿")
            rating = int(body.get("rating", 5))
            comment = body.get("comment", "")
            date_str = body.get("date", "")

            if not media_id or not comment:
                self.send_json_response(400, {"error": "Campos obrigatórios ausentes"})
                return

            database.add_review(media_id, user_name, user_avatar, rating, comment, date_str)
            self.send_json_response(201, {"success": True, "message": "Avaliação salva com sucesso no SQLite!"})
            return

        self.send_error(404, "Endpoint não encontrado")

    def send_json_response(self, status_code: int, data: Any):
        response_bytes = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(response_bytes)))
        self.end_headers()
        self.wfile.write(response_bytes)

def run():
    print("📦 Inicializando Banco de Dados SQLite (cinebook.db)...")
    database.init_db()
    print("✅ Banco de Dados conectado e tabelas criadas!")

    with socketserver.TCPServer(("", PORT), CineBookHandler) as httpd:
        print(f"\n=======================================================")
        print(f"🍿 CINEBOOK SERVER RODANDO (Com Cadastro & Login)!")
        print(f"🔗 Acesse no navegador: http://localhost:{PORT}")
        print(f"👤 Endpoint de Registro: http://localhost:{PORT}/api/auth/register")
        print(f"🔑 Endpoint de Login: http://localhost:{PORT}/api/auth/login")
        print(f"=======================================================\n")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n🛑 Servidor encerrado.")

if __name__ == "__main__":
    run()
