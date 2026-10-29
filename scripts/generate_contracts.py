from pathlib import Path
import json,sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'services/api'))
from rr.main import app
from rr.measurements import FIELDS
root=Path(__file__).resolve().parents[1]/'packages/contracts';root.mkdir(parents=True,exist_ok=True)
(root/'openapi.json').write_text(json.dumps(app.openapi(),indent=2),'utf8')
(root/'fields.json').write_text(json.dumps({k:{'name':v[0],'unit':v[1],'required':k in ['roof_area','ridge_hip_length','eave_length','rake_length','valley_length']} for k,v in FIELDS.items()},indent=2),'utf8')
print('Generated OpenAPI schema and canonical field definitions.')
