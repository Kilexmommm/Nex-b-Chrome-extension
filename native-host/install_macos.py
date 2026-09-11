"""Install the optional legacy Chrome host outside Documents."""
import json
import os
from pathlib import Path
import re
import shutil
import sys
import tempfile


def install(extension_id, home, source):
    if not re.fullmatch(r"[a-p]{32}", extension_id):
        raise ValueError("El ID debe tener 32 letras entre a y p.")
    names = ("nex_b_native_host.py", "launch-macos.sh")
    for name in names:
        if not (source / name).is_file():
            raise ValueError("Falta el archivo: " + name)
    target = home / "Library/Application Support/nex.b/NativeHost"
    target.mkdir(parents=True, exist_ok=True, mode=0o700)
    for name in names:
        shutil.copyfile(source / name, target / name)
        (target / name).chmod(0o700)
    registry = home / "Library/Application Support/Google/Chrome/NativeMessagingHosts"
    registry.mkdir(parents=True, exist_ok=True)
    manifest = registry / "com.kilex.nex_b.json"
    if manifest.exists():
        with tempfile.NamedTemporaryFile(prefix=manifest.name + ".", suffix=".bak", dir=registry, delete=False) as backup:
            backup.write(manifest.read_bytes())
    payload = {"name": "com.kilex.nex_b", "description": "Asistente local de nex.b para macOS",
               "path": str(target / "launch-macos.sh"), "type": "stdio",
               "allowed_origins": ["chrome-extension://" + extension_id + "/"]}
    temp_path = None
    try:
        with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=registry, delete=False) as stream:
            temp_path = Path(stream.name)
            json.dump(payload, stream, ensure_ascii=False, indent=2)
        os.replace(temp_path, manifest)
    finally:
        if temp_path is not None and temp_path.exists():
            temp_path.unlink()
    return manifest


if __name__ == "__main__":
    try:
        if sys.platform != "darwin":
            raise ValueError("Este instalador solo es compatible con macOS.")
        extension_id = sys.argv[1] if len(sys.argv) > 1 else input("ID de nex.b en chrome://extensions: ").strip()
        manifest = install(extension_id, Path.home(), Path(__file__).resolve().parent)
        print("Asistente instalado. Recarga nex.b. Registro:", manifest)
    except (ValueError, OSError) as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
