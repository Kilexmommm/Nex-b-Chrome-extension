#!/usr/bin/env python3
"""Sube la landing a aiprojects.kilex.org/<proyecto>/ por FTPS. Credenciales en ../.env
Uso: python3 deploy-ftp.py        -> simulacro
     python3 deploy-ftp.py --go   -> sube y verifica tamaños
(Reutiliza la sesión TLS en el canal de datos: el servidor lo exige; curl no lo hace.)"""
import ftplib, os, sys
here = os.path.dirname(os.path.abspath(__file__)); os.chdir(here)
env = {}
for l in open('../.env', encoding='utf-8'):
    l = l.strip()
    if l and not l.startswith('#') and '=' in l:
        k, v = l.split('=', 1); env[k] = v
project = env.get('PROJECT_SLUG', 'nex-bookmark')
base = '/'.join(x for x in (env.get('FTP_REMOTE_DIR', ''), project) if x)
files = sorted(os.path.join(d, n) for top in ('img', 'web') for d, _, ns in os.walk(top) for n in ns if n != '.DS_Store')
files = ['index.html'] + files
print(f"Destino: {env['FTP_HOST']}/{base}/  (https://aiprojects.kilex.org/{project}/)")
print('\n'.join(files))
if '--go' not in sys.argv:
    sys.exit('(simulacro; usa --go para subir)')

class T(ftplib.FTP_TLS):
    def ntransfercmd(self, cmd, rest=None):
        conn, size = ftplib.FTP.ntransfercmd(self, cmd, rest)
        if self._prot_p:
            conn = self.context.wrap_socket(conn, server_hostname=self.host, session=self.sock.session)
        return conn, size

ftp = T(env['FTP_HOST'], timeout=120); ftp.login(env['FTP_USER'], env['FTP_PASSWORD']); ftp.prot_p()
def mkdirs(path):
    cur = ''
    for part in [p for p in path.split('/') if p]:
        cur += '/' + part
        try: ftp.mkd(cur)
        except ftplib.error_perm: pass
bad = 0
for f in files:
    remote = '/' + base + '/' + f.replace(os.sep, '/')
    mkdirs(os.path.dirname(remote))
    with open(f, 'rb') as fh: ftp.storbinary('STOR ' + remote, fh)
    ok = ftp.size(remote) == os.path.getsize(f)
    bad += not ok
    print(('ok ' if ok else 'FALLO ') + f)
ftp.quit(); sys.exit(1 if bad else 0)
