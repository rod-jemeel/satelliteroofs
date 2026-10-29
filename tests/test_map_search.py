import httpx
from test_workflow import client
from rr import maps


def configure(monkeypatch):
    monkeypatch.setattr(maps, 'read_settings', lambda: {'map_token':'pk.search-test','permanent_geocoding':False})


def feature(coords=None):
    return {'type':'Feature','geometry':{'type':'Point','coordinates':coords if coords is not None else [-97.7623,30.2818]},'properties':{'full_address':'123 Demo Lane, Austin, Texas','coordinates':{'accuracy':'rooftop'}}}


def test_browse_search_is_temporary_submit_only_and_never_saves_a_project(client,monkeypatch):
    configure(monkeypatch);calls=[]
    def provider(url,**kwargs):
        calls.append(kwargs)
        return httpx.Response(200,json={'features':[feature()]})
    monkeypatch.setattr(maps.httpx,'get',provider)
    response=client.post('/api/v1/map/search',json={'address':'123 Demo Lane, Austin, TX'})
    assert response.status_code==200,response.text
    assert response.json()==[{'label':'123 Demo Lane, Austin, Texas','longitude':-97.7623,'latitude':30.2818,'accuracy':'rooftop'}]
    assert calls[0]['params']['permanent']=='false'
    assert calls[0]['params']['autocomplete']=='false'
    assert calls[0]['params']['types']=='address'
    assert response.headers['cache-control']=='no-store'
    assert client.get('/api/v1/projects').json()==[]
    # Saving provider results still requires the separate permanent-storage path.
    p=client.post('/api/v1/projects',json={'name':'Unchanged project'}).json()
    assert client.post(f'/api/v1/projects/{p["id"]}/location/search',json={'address':'123 Demo Lane'}).status_code==422
    assert len(calls)==1


def test_browse_search_handles_provider_failures_without_exposing_token(client,monkeypatch):
    configure(monkeypatch)
    for status in [401,403,429,500]:
        monkeypatch.setattr(maps.httpx,'get',lambda *a,**k:httpx.Response(status,json={'message':'private provider error pk.search-test'}))
        r=client.post('/api/v1/map/search',json={'address':'123 Demo Lane'})
        assert r.status_code==422
        assert 'pk.search-test' not in r.text
    def timeout(*a,**k):raise httpx.ReadTimeout('secret URL pk.search-test')
    monkeypatch.setattr(maps.httpx,'get',timeout)
    r=client.post('/api/v1/map/search',json={'address':'123 Demo Lane'})
    assert r.status_code==422 and 'pk.search-test' not in r.text


def test_browse_search_validates_query_and_ignores_bad_coordinates(client,monkeypatch):
    configure(monkeypatch);calls=[]
    def provider(*a,**k):
        calls.append(k)
        return httpx.Response(200,json={'features':[feature([181,30]),feature([-97,None]),feature([-97,90]),feature()]})
    monkeypatch.setattr(maps.httpx,'get',provider)
    for query in ['   ','a'*257,'house; invalid',' '.join(['word']*21)]:
        assert client.post('/api/v1/map/search',json={'address':query}).status_code==422
    assert calls==[]
    assert len(client.post('/api/v1/map/search',json={'address':'123 Demo Lane'}).json())==1


def test_browse_search_requires_a_token_and_csrf(client,monkeypatch):
    monkeypatch.setattr(maps,'read_settings',lambda:{'map_token':''})
    assert client.post('/api/v1/map/search',json={'address':'123 Demo Lane'}).status_code==422
    client.headers.pop('x-csrf-token')
    assert client.post('/api/v1/map/search',json={'address':'123 Demo Lane'}).status_code==403

def test_searchbox_suggest_and_retrieve_use_the_same_session(client,monkeypatch):
    from rr import maps
    from uuid import uuid4
    calls=[]
    monkeypatch.setattr(maps,'read_settings',lambda:{'map_token':'pk.test'})
    class Response:
        status_code=200
        def __init__(self,data):self.data=data
        def json(self):return self.data
    def get(url,params,timeout):
        calls.append((url,params))
        if url.endswith('/suggest'):return Response({'suggestions':[{'mapbox_id':'street_1','name':'Meaders Lane','place_formatted':'Dallas, Texas, United States','feature_type':'street'}]})
        return Response({'features':[{'geometry':{'type':'Point','coordinates':[-96.8,32.8]},'properties':{'name':'Meaders Lane','place_formatted':'Dallas, Texas, United States','feature_type':'street'}}]})
    monkeypatch.setattr(maps.httpx,'get',get)
    session=str(uuid4())
    result=client.post('/api/v1/map/suggest',json={'query':'meaders lane','session_token':session,'proximity':{'longitude':-97,'latitude':32}})
    assert result.status_code==200,result.text
    assert result.json()[0]['mapbox_id']=='street_1'
    found=client.post('/api/v1/map/retrieve',json={'mapbox_id':'street_1','session_token':session})
    assert found.status_code==200,found.text
    assert found.json()['longitude']==-96.8 and found.json()['feature_type']=='street'
    assert calls[0][0].endswith('/search/searchbox/v1/suggest')
    assert calls[1][0].endswith('/search/searchbox/v1/retrieve/street_1')
    assert all(params['session_token']==session for _,params in calls)
    assert calls[0][1]['proximity']=='-97.0,32.0'
    assert all('permanent' not in params for _,params in calls)


def test_searchbox_rejects_unsafe_ids_sessions_and_coordinates(client,monkeypatch):
    from rr import maps
    from uuid import uuid4
    monkeypatch.setattr(maps,'read_settings',lambda:{'map_token':'pk.test'})
    monkeypatch.setattr(maps.httpx,'get',lambda *a,**k: (_ for _ in ()).throw(AssertionError('Invalid input must not call Mapbox')))
    session=str(uuid4())
    for body in [{'query':'me','session_token':session},{'query':'meaders','session_token':'bad'},{'query':'meaders','session_token':session,'proximity':{'longitude':190,'latitude':30}}]:
        assert client.post('/api/v1/map/suggest',json=body).status_code==422
    for id in ['../suggest','https://attacker.example','x/y']:
        assert client.post('/api/v1/map/retrieve',json={'mapbox_id':id,'session_token':session}).status_code==422


def test_roof_reverse_lookup_returns_only_nearby_addresses_with_review_metadata(client,monkeypatch):
    configure(monkeypatch);calls=[]
    near=feature();near['properties'].update(feature_type='address',context={'place':{'name':'Austin'},'region':{'region_code':'TX'},'postcode':{'name':'78703'}})
    far=feature([-97.7,30.3])
    street=feature();street['properties']['feature_type']='street'
    def get(url,**kwargs):
        calls.append((url,kwargs));return httpx.Response(200,json={'features':[far,street,feature([181,30]),near]})
    monkeypatch.setattr(maps.httpx,'get',get)
    result=client.post('/api/v1/map/reverse',json={'longitude':-97.7623,'latitude':30.2818})
    assert result.status_code==200,result.text
    matches=result.json();assert len(matches)==1
    assert matches[0]['label']=='123 Demo Lane, Austin, Texas'
    assert matches[0]['price_location']=='Austin, TX 78703'
    assert matches[0]['distance_m']==0 and matches[0]['confirmed'] is False
    assert matches[0]['storage_basis']=='temporary'
    assert calls[0][0].endswith('/geocode/v6/reverse')
    assert calls[0][1]['params']['types']=='address'
    assert calls[0][1]['params']['permanent']=='false'
    monkeypatch.setattr(maps,'read_settings',lambda:{'map_token':'pk.test','permanent_geocoding':True})
    assert client.post('/api/v1/map/reverse',json={'longitude':-97.7623,'latitude':30.2818}).json()[0]['storage_basis']=='temporary'
    assert calls[-1][1]['params']['permanent']=='false'
    assert client.get('/api/v1/projects').json()==[]


def test_roof_reverse_lookup_rejects_invalid_input_and_sanitizes_errors(client,monkeypatch):
    configure(monkeypatch)
    def forbidden(*a,**k):raise AssertionError('Invalid input must not call Mapbox')
    monkeypatch.setattr(maps.httpx,'get',forbidden)
    for body in [{'latitude':91,'longitude':30},{'latitude':30,'longitude':181},{'latitude':True,'longitude':30},{'latitude':0,'longitude':0}]:
        assert client.post('/api/v1/map/reverse',json=body).status_code==422
    monkeypatch.setattr(maps.httpx,'get',lambda *a,**k:httpx.Response(429,text='pk.search-test'))
    r=client.post('/api/v1/map/reverse',json={'latitude':30,'longitude':-97})
    assert r.status_code==422 and 'pk.search-test' not in r.text


def test_permanent_geocoding_cannot_be_enabled_or_requested_by_stale_clients(client,monkeypatch):
    from rr import main
    calls=[];saved=[]
    monkeypatch.setattr(maps,'read_settings',lambda:{'map_token':'pk.test','permanent_geocoding':True})
    monkeypatch.setattr(maps.httpx,'get',lambda *a,**k:calls.append(k) or httpx.Response(200,json={'features':[]}))
    monkeypatch.setattr(main,'save_settings',lambda data:saved.append(data))
    response=client.put('/api/v1/settings',json={'model':'','map_token':'pk.test','permanent_geocoding':True})
    assert response.status_code==422
    assert saved==[]
    result=client.post('/api/v1/projects',json={'name':'No paid geocoding'}).json()
    assert client.post('/api/v1/projects/'+result['id']+'/location/search',json={'address':'123 Demo Lane'}).status_code==422
    assert calls==[]


def test_settings_ignore_legacy_permanent_flag_and_never_persist_true(monkeypatch,tmp_path):
    import json
    from rr import config
    monkeypatch.setattr(config,'RUNTIME',tmp_path)
    path=tmp_path/'settings.json'
    path.write_text(json.dumps({'model':'demo','map_token':'pk.test','permanent_geocoding':True}),encoding='utf-8')
    assert config.read_settings()['permanent_geocoding'] is False
    config.save_settings({'model':'demo','map_token':'pk.test','permanent_geocoding':True})
    assert json.loads(path.read_text(encoding='utf-8'))['permanent_geocoding'] is False
