import os
from pathlib import Path
os.environ['DATABASE_URL']='sqlite:///'+str(Path(__file__).resolve().parents[1]/'.runtime'/'pytest.db')
os.environ['ROOFREADY_INTERNAL']='test-internal'
