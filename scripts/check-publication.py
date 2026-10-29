"""Check tracked/staged files before publication; never print matching values."""
import json
import re
import subprocess
from pathlib import Path

root = Path(__file__).resolve().parents[1]
paths = subprocess.check_output(['git', 'ls-files', '-z'], cwd=root).decode().split('\0')
patterns = {
    'private key': rb'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----',
    'GitHub credential': rb'\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})',
    'provider credential': rb'\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{32,}',
    'Mapbox token': rb'\b[ps]k\.[A-Za-z0-9_-]{25,}\.[A-Za-z0-9_-]{10,}',
    'JWT credential': rb'\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}',
}
settings = root / '.runtime/settings.json'
if settings.exists():
    token = json.loads(settings.read_text('utf-8')).get('map_token', '')
    if len(token) > 12:
        patterns['saved local token'] = re.escape(token.encode())
issues = []
total = 0
for name in filter(None, paths):
    if any(part in {'.runtime', 'node_modules', '.next', '__pycache__', 'test-results', 'verification'} or part.startswith('.venv') for part in Path(name).parts):
        issues.append((name, 'private/generated directory'))
        continue
    if Path(name).name.startswith('.env') or Path(name).suffix in {'.db', '.sqlite', '.protected', '.key', '.pem'}:
        issues.append((name, 'private runtime file'))
        continue
    data = subprocess.check_output(['git', 'show', ':' + name], cwd=root)
    total += len(data)
    for label, pattern in patterns.items():
        if re.search(pattern, data):
            issues.append((name, label))
for name, label in issues:
    print(f'BLOCKED: {name}: {label}')
print(json.dumps({'files_checked': len(list(filter(None, paths))), 'bytes_checked': total, 'findings': len(issues)}))
raise SystemExit(1 if issues else 0)
