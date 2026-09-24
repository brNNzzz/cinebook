import urllib.request

try:
    with urllib.request.urlopen("http://localhost:8000/perfil.html") as response:
        html = response.read().decode('utf-8')
        print(f"Server is up! perfil.html length: {len(html)} bytes")
except Exception as e:
    print(f"Error connecting to server: {e}")
