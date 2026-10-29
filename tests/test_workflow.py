import pytest
from fastapi.testclient import TestClient
from rr.main import app
from rr.db import Base, engine

@pytest.fixture
def client():
    Base.metadata.drop_all(engine);Base.metadata.create_all(engine)
    with TestClient(app) as c:
        c.headers['x-roofready-internal']='test-internal'
        response=c.get('/api/v1/session');assert response.status_code==200
        c.headers['x-csrf-token']=response.json()['csrf']
        c.headers['origin']='http://127.0.0.1:3210'
        yield c

def project(c):return c.post('/api/v1/projects',json={'name':'Test house','address':''}).json()

def test_session_and_origin_protect_mutations(client):
    client.headers['origin']='https://attacker.example'
    assert client.post('/api/v1/projects',json={'name':'Bad'}).status_code==403
    client.headers['origin']='http://127.0.0.1:3210';client.headers.pop('x-csrf-token')
    assert client.post('/api/v1/projects',json={'name':'Bad'}).status_code==403

def test_upload_hash_and_idempotency(client):
    import hashlib
    p=project(client);raw=open('fixtures/demo-roof-report.pdf','rb').read()
    for _ in range(2):
        r=client.post(f'/api/v1/projects/{p["id"]}/documents',files={'file':('unsafe/../report.pdf',raw,'application/pdf')},headers={'Idempotency-Key':'upload-one'})
        assert r.status_code==202
        assert r.json()['sha256']==hashlib.sha256(raw).hexdigest()
    assert len(client.get(f'/api/v1/projects/{p["id"]}').json()['documents'])==1

def test_stale_revision_and_approval_are_rejected(client):
    p=project(client)
    from test_engine import measurements
    payload={'expected_revision':0,'values':measurements(),'scope':['main'],'reason':'Manual entry from reviewed report','run_id':None}
    r=client.post(f'/api/v1/projects/{p["id"]}/measurement-revisions',json=payload)
    assert r.status_code==200,r.text
    rev=r.json()
    assert client.post(f'/api/v1/projects/{p["id"]}/measurement-revisions',json=payload).status_code==409
    assert client.post(f'/api/v1/measurement-revisions/{rev["id"]}/verify',json={'expected_revision':1}).status_code==200
    e=client.post(f'/api/v1/projects/{p["id"]}/estimates',json={'expected_revision':1,'config':{'ice_barrier':'not_required_reviewed'},'idempotency_key':'estimate1'}).json()
    assert e['status']=='ready_for_review'
    assert client.post(f'/api/v1/estimate-revisions/{e["id"]}/approve',json={'expected_revision':1,'expected_estimate':1}).status_code==200
    payload['expected_revision']=1;payload['values']['roof_area']['value']='2500'
    assert client.post(f'/api/v1/projects/{p["id"]}/measurement-revisions',json=payload).status_code==200
    assert client.post(f'/api/v1/estimate-revisions/{e["id"]}/approve',json={'expected_revision':1,'expected_estimate':1}).status_code==409
    old=client.get(f'/api/v1/projects/{p["id"]}').json()['estimates'][0]
    assert old['data']['measurements']['roof_area']['value']=='2400'
    assert old['status']=='approved'
    assert old['is_current'] is False

def test_manual_estimation_and_exports_without_services(client,monkeypatch):
    from rr import maps
    monkeypatch.setattr(maps,'read_settings',lambda:{'map_token':'','permanent_geocoding':False})
    from rr import ai_gateway
    monkeypatch.setattr(ai_gateway,'status',lambda:{'status':'authentication_required'})
    p=project(client)
    from test_engine import measurements
    rev=client.post(f'/api/v1/projects/{p["id"]}/measurement-revisions',json={'expected_revision':0,'values':measurements(),'scope':['main'],'reason':'Reviewed manually'}).json()
    client.post(f'/api/v1/measurement-revisions/{rev["id"]}/verify',json={'expected_revision':1})
    e=client.post(f'/api/v1/projects/{p["id"]}/estimates',json={'expected_revision':1,'config':{}}).json()
    r=client.post(f'/api/v1/estimate-revisions/{e["id"]}/exports',json={'audience':'customer','format':'json','idempotency_key':'export1'})
    assert r.status_code==200,r.text
    exported=client.get(r.json()['url']).json()
    assert 'direct_cost' not in exported and 'gross_profit' not in exported and 'lines' not in exported
    assert client.get('/api/v1/ai/connection').json()['status']=='authentication_required'
    assert client.post(f'/api/v1/projects/{p["id"]}/location/search',json={'address':'test'}).status_code==422

def test_partial_draft_cannot_be_approved(client):
    p=project(client)
    rev=client.post(f'/api/v1/projects/{p["id"]}/measurement-revisions',json={'expected_revision':0,'values':{'roof_area':{'value':'2400','area_basis':'sloped_surface','unit':'ft2'}},'scope':['main'],'reason':'Partial manual review'}).json()
    e=client.post(f'/api/v1/projects/{p["id"]}/estimates',json={'expected_revision':1,'config':{}}).json()
    assert e['status']=='partial'
    assert client.post(f'/api/v1/estimate-revisions/{e["id"]}/approve',json={'expected_revision':1,'expected_estimate':1}).status_code==422

def test_customer_and_internal_pdf_exports_have_separate_content(client):
    import io,pdfplumber
    from test_engine import measurements
    p=project(client)
    rev=client.post(f'/api/v1/projects/{p["id"]}/measurement-revisions',json={'expected_revision':0,'values':measurements(),'scope':['main'],'reason':'Reviewed fixture'}).json()
    client.post(f'/api/v1/measurement-revisions/{rev["id"]}/verify',json={'expected_revision':1})
    e=client.post(f'/api/v1/projects/{p["id"]}/estimates',json={'expected_revision':1,'config':{}}).json()
    for audience in ['customer','internal']:
        r=client.post(f'/api/v1/estimate-revisions/{e["id"]}/exports',json={'audience':audience,'format':'pdf'})
        assert r.status_code==200
        raw=client.get(r.json()['url']).content
        with pdfplumber.open(io.BytesIO(raw)) as pdf: text='\n'.join(p.extract_text() or '' for p in pdf.pages)
        assert 'DEMO DATA' in text and 'Revision 1' in text
        if audience=='customer':assert 'Direct cost:' not in text and 'Gross profit:' not in text and 'Calculation trace' not in text
        else:assert 'Calculation trace' in text and 'Direct cost:' in text
