#!/usr/bin/env python3
import email
import json
import os
import socketserver
import threading
from email.policy import default

PORT = int(os.environ.get("SMTP_FAKE_PORT", "18082"))
CAPTURE_PATH = os.environ.get("SMTP_CAPTURE_PATH", "/tmp/fake-smtp-messages.jsonl")
LOCK = threading.Lock()

class Handler(socketserver.StreamRequestHandler):
    def reply(self, line):
        self.wfile.write((line + "\r\n").encode())
        self.wfile.flush()

    def handle(self):
        self.reply("220 fake-smtp ESMTP ready")
        mail_from = ""
        recipients = []
        while True:
            raw = self.rfile.readline()
            if not raw:
                break
            line = raw.decode("utf-8", "replace").rstrip("\r\n")
            upper = line.upper()
            if upper.startswith("EHLO"):
                self.wfile.write(b"250-fake-smtp\r\n250 SIZE 10485760\r\n"); self.wfile.flush()
            elif upper.startswith("HELO"):
                self.reply("250 fake-smtp")
            elif upper.startswith("MAIL FROM:"):
                mail_from = line[10:].strip(); self.reply("250 2.1.0 OK")
            elif upper.startswith("RCPT TO:"):
                recipients.append(line[8:].strip()); self.reply("250 2.1.5 OK")
            elif upper == "DATA":
                self.reply("354 End data with <CR><LF>.<CR><LF>")
                chunks = []
                while True:
                    part = self.rfile.readline()
                    if part in (b".\r\n", b".\n", b""):
                        break
                    if part.startswith(b".."):
                        part = part[1:]
                    chunks.append(part)
                raw_message = b"".join(chunks)
                parsed = email.message_from_bytes(raw_message, policy=default)
                body = ""
                try:
                    body = parsed.get_body(preferencelist=("plain", "html")).get_content()
                except Exception:
                    body = raw_message.decode("utf-8", "replace")
                record = {
                    "mailFrom": mail_from,
                    "recipients": recipients,
                    "subject": str(parsed.get("subject", "")),
                    "body": body,
                }
                with LOCK:
                    with open(CAPTURE_PATH, "a", encoding="utf-8") as handle:
                        handle.write(json.dumps(record) + "\n")
                self.reply("250 2.0.0 accepted")
            elif upper == "RSET":
                mail_from = ""; recipients = []; self.reply("250 2.0.0 reset")
            elif upper == "NOOP":
                self.reply("250 2.0.0 OK")
            elif upper == "QUIT":
                self.reply("221 2.0.0 bye"); break
            else:
                self.reply("250 2.0.0 OK")

class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True

open(CAPTURE_PATH, "w").close()
with Server(("0.0.0.0", PORT), Handler) as server:
    server.serve_forever()
