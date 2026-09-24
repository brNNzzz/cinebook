"""
CineBook - Versão Alternativa com Flask (Framework Python)
Suporta autenticação de usuários, banco de dados SQLite e catálogo.
"""

from flask import Flask, jsonify, request, send_from_directory
import os
import database

app = Flask(__name__, static_folder=".")
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

database.init_db()

@app.route("/")
def index():
    return send_from_directory(BASE_DIR, "index.html")

@app.route("/<path:path>")
def static_files(path):
    return send_from_directory(BASE_DIR, path)

@app.route("/api/auth/register", methods=["POST"])
def api_register():
    data = request.get_json() or {}
    result = database.register_user(
        data.get("name", ""),
        data.get("email", ""),
        data.get("password", ""),
        data.get("avatar", "🍿")
    )
    status_code = 201 if result["success"] else 400
    return jsonify(result), status_code

@app.route("/api/auth/login", methods=["POST"])
def api_login():
    data = request.get_json() or {}
    result = database.login_user(
        data.get("email", ""),
        data.get("password", "")
    )
    status_code = 200 if result["success"] else 401
    return jsonify(result), status_code

@app.route("/api/media", methods=["GET"])
def api_media():
    media_type = request.args.get("type")
    genre = request.args.get("genre")
    search = request.args.get("search")
    sort_by = request.args.get("sort", "popularity")

    results = database.get_all_media(media_type, genre, search, sort_by)
    return jsonify(results)

@app.route("/api/media/<media_id>", methods=["GET"])
def api_media_detail(media_id):
    item = database.get_media_by_id(media_id)
    if item:
        return jsonify(item)
    return jsonify({"error": "Mídia não encontrada"}), 404

@app.route("/api/recommendations/<media_id>", methods=["GET"])
def api_recommendations(media_id):
    recommendations = database.get_recommendations(media_id, limit=3)
    return jsonify(recommendations)

@app.route("/api/stats", methods=["GET"])
def api_stats():
    stats = database.get_catalog_statistics()
    return jsonify(stats)

@app.route("/api/reviews", methods=["POST"])
def api_add_review():
    data = request.get_json() or {}
    media_id = data.get("mediaId")
    user_name = data.get("userName", "Usuário CineBook")
    user_avatar = data.get("userAvatar", "🍿")
    rating = data.get("rating", 5)
    comment = data.get("comment", "")
    date_str = data.get("date", "")

    if not media_id or not comment:
        return jsonify({"error": "Campos obrigatórios ausentes"}), 400

    database.add_review(media_id, user_name, user_avatar, int(rating), comment, date_str)
    return jsonify({"success": True, "message": "Avaliação salva com sucesso!"}), 201

if __name__ == "__main__":
    print("🍿 Iniciando CineBook com Flask e Autenticação...")
    app.run(port=8000, debug=True)
