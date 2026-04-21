from http.server import BaseHTTPRequestHandler
import json

from server import build_dashboard_payload


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        try:
            payload = build_dashboard_payload()
            body = json.dumps(payload).encode("utf-8")
            self.send_response(200)
        except Exception as exc:
            body = json.dumps({"error": str(exc)}).encode("utf-8")
            self.send_response(500)

        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)
