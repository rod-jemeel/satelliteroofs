import pytest
from rr import parcels


def test_outside_coverage_makes_no_provider_request(monkeypatch):
    monkeypatch.setattr(parcels.httpx, 'get', lambda *a, **kw: pytest.fail('Unexpected provider request'))
    assert not parcels.lookup(-97.7, 30.2)['features']


def test_parcel_contains_click_and_strips_unneeded_attributes(monkeypatch):
    geometry = {'type': 'Polygon', 'coordinates': [[[-74.66,40.34],[-74.65,40.34],[-74.65,40.35],[-74.66,40.35],[-74.66,40.34]]]}
    class Response:
        content = b'{}'
        def raise_for_status(self): pass
        def json(self): return {'type':'FeatureCollection','features':[{'type':'Feature','geometry':geometry,'properties':{'PCLLOT':'1','OWNER_NAME':'excluded'}}]}
    calls=[]
    monkeypatch.setattr(parcels.httpx, 'get', lambda url, **kw: (calls.append((url,kw)) or Response()))
    result=parcels.lookup(-74.659,40.349)
    assert len(result['features'])==1
    assert 'OWNER_NAME' not in result['features'][0]['properties']
    assert calls[0][1]['params']['spatialRel']=='esriSpatialRelIntersects'
    assert not parcels.lookup(-74.7,40.349)['features']


def test_provider_failure_does_not_leak_details(monkeypatch):
    def failed(*a, **kw): raise RuntimeError('private request diagnostic')
    monkeypatch.setattr(parcels.httpx, 'get', failed)
    with pytest.raises(ValueError,match='New Jersey parcel lookup is unavailable'):
        parcels.lookup(-74.659,40.349)
