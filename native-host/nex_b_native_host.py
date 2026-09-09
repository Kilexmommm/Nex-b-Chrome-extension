#!/usr/bin/env python3
"""Host local de nex.b para macOS. Solo abre rutas file:// tras un clic del usuario."""
import json
import os
import struct
import subprocess
import sys
from pathlib import Path
from urllib.parse import unquote, urlparse

MAX_MESSAGE = 1024 * 1024

def reply(value):
    data = json.dumps(value, separators=(",", ":")).encode("utf-8")
    sys.stdout.buffer.write(struct.pack("<I", len(data)) + data)
    sys.stdout.buffer.flush()

def local_path(url):
    parsed = urlparse(url)
    if parsed.scheme != "file" or parsed.netloc not in ("", "localhost") or parsed.query or parsed.fragment:
        raise ValueError("Solo se aceptan URLs file:// locales sin parámetros.")
    path = Path(unquote(parsed.path)).resolve(strict=True)
    return path

def main():
    size_bytes = sys.stdin.buffer.read(4)
    if len(size_bytes) != 4:
        return
    size = struct.unpack("<I", size_bytes)[0]
    if size > MAX_MESSAGE:
        reply({"ok": False, "error": "Solicitud demasiado grande."})
        return
    try:
        message = json.loads(sys.stdin.buffer.read(size).decode("utf-8"))
        if not isinstance(message, dict) or message.get("action") != "open" or not isinstance(message.get("url"), str):
            raise ValueError("Solicitud no permitida.")
        path = local_path(message["url"])
        if path.is_dir():
            subprocess.run(["/usr/bin/open", str(path)], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        elif path.suffix.lower() in {".html", ".htm"}:
            subprocess.run(["/usr/bin/open", "-a", "Google Chrome", str(path)], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        else:
            subprocess.run(["/usr/bin/open", "-R", str(path)], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        reply({"ok": True})
    except Exception as error:
        reply({"ok": False, "error": str(error)[:300]})

if __name__ == "__main__":
    main()
