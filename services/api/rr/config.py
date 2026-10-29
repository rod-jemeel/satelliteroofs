from pathlib import Path
import os, secrets, json

ROOT = Path(os.getenv('ROOFREADY_ROOT', Path(__file__).resolve().parents[3]))
RUNTIME = ROOT / '.runtime'
STORAGE = Path(os.getenv('ROOFREADY_STORAGE', RUNTIME / 'storage'))
for d in [RUNTIME, STORAGE]: d.mkdir(parents=True, exist_ok=True)
DATABASE_URL = os.getenv('DATABASE_URL', 'sqlite:///'+str(RUNTIME/'dev.db'))
ORIGIN = os.getenv('ROOFREADY_ORIGIN', 'http://127.0.0.1:3210')
INTERNAL = os.getenv('ROOFREADY_INTERNAL', '')
MAX_BYTES = 25*1024*1024
MAX_PAGES = 40

def persistent_secret(name):
    path=RUNTIME/name
    if not path.exists():
        try:
            with path.open('x', encoding='utf8') as f: f.write(secrets.token_urlsafe(48))
            path.chmod(0o600)
        except FileExistsError: pass
    return path.read_text('utf8').strip()

SESSION_SECRET=persistent_secret('session.secret')

def read_settings():
    p=RUNTIME/'settings.json'
    data=json.loads(p.read_text('utf8')) if p.exists() else {'model': '', 'ai_adapter': 'responses', 'map_token': ''}
    return {**data,'permanent_geocoding':False}

def save_settings(data):
    p=RUNTIME/'settings.json'; tmp=p.with_suffix('.tmp')
    tmp.write_text(json.dumps({**data,'permanent_geocoding':False}), 'utf8'); tmp.chmod(0o600); tmp.replace(p)
