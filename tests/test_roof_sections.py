import math
from decimal import Decimal
import pytest
from test_workflow import client
from test_budgets import inputs


def ring(x=0,y=0,w=.00018,h=.00009):
    return [(x,y),(x+w,y),(x+w,y+h),(x,y+h),(x,y)]

def section(id,outline,pitch='6',**kw):
    return dict(id=id,name=id,outline=outline,pitch_rise=pitch,enabled=True,include_covered=False,**kw)

def preview(client,sections):
    return client.post('/api/v1/property-budgets/preview',json={**inputs(),'overhang_percent':'0','roof_sections':sections})

def test_edited_mapbox_section_retains_origin_after_save(client):
    initial=section('Roof section 1',ring(-97,30),origin='mapbox_vector')
    body=dict(name='Edited map roof',latitude=30,longitude=-97,footprint_source='user_drawn',reviewed=True,inputs={**inputs(),'roof_sections':[initial]})
    result=client.post('/api/v1/property-budgets',json=body)
    assert result.status_code==201,result.text
    assert result.json()['data']['budget']['inputs']['roof_sections'][0]['origin']=='mapbox_vector'
    assert result.json()['data']['budget']['status']=='preliminary'


def test_layers_count_overlap_once_and_apply_pitch_per_exposed_section(client):
    lower=section('Lower',ring(),pitch='0');upper=section('Upper',ring(w=.00009),pitch='12')
    result=preview(client,[upper,lower]);assert result.status_code==200,result.text
    data=result.json();parts=data['sections']
    assert data['formula_version']=='roof-sections-1.0'
    assert abs(float(parts[0]['counted_ft2'])-float(parts[1]['counted_ft2']))<1
    assert abs(float(parts[1]['covered_ft2'])-float(parts[0]['counted_ft2']))<1
    expected=float(parts[0]['counted_ft2'])*math.sqrt(2)+float(parts[1]['counted_ft2'])
    assert abs(float(data['roof_area_ft2'])-expected)<.1
    assert float(data['inputs']['footprint_ft2'])<2200
    # Moving the flat lower roof above the upper roof changes the slope-weighted surface.
    reordered=preview(client,[lower,upper]).json()
    assert float(reordered['sections'][1]['counted_ft2'])==0
    assert float(reordered['roof_area_ft2'])<float(data['roof_area_ft2'])


def test_explicit_covered_area_override_and_disabled_layers(client):
    lower=section('Lower',ring(),pitch='0');upper=section('Upper',ring(w=.00009),pitch='12')
    base=preview(client,[upper,lower]).json()
    lower['include_covered']=True
    both=preview(client,[upper,lower]).json()
    assert float(both['roof_area_ft2'])>float(base['roof_area_ft2'])
    upper['enabled']=False
    disabled=preview(client,[upper,lower]).json()
    assert float(disabled['sections'][0]['counted_ft2'])==0
    assert float(disabled['roof_area_ft2'])<float(both['roof_area_ft2'])


def test_layers_validate_ids_geometry_pitch_and_total_size(client):
    valid=section('A',ring())
    for sections in [[valid,valid],[{**valid,'pitch_rise':'99'}],[{**valid,'color':'url(bad)'}],[{**valid,'outline':ring(w=10)}],[{**valid,'enabled':False}],[]]:
        response=preview(client,sections)
        assert response.status_code==422,response.text
    cross=section('Bad',[(0,0),(.0002,.0001),(0,.0001),(.0002,0),(0,0)])
    assert preview(client,[cross]).status_code==422


def test_layered_budgets_save_and_reopen_without_accepting_forged_areas(client):
    sections=[section('Upper',ring(-97,30,w=.00009),pitch='12',color='#dc6803'),section('Lower',ring(-97,30),pitch='0',color='#0866ff')]
    body=dict(name='Layered roof',address='',latitude=30,longitude=-97,footprint_source='user_drawn',reviewed=True,inputs={**inputs(),'roof_sections':sections})
    response=client.post('/api/v1/property-budgets',json=body)
    assert response.status_code==201,response.text
    project=client.get('/api/v1/projects/'+response.json()['id']).json()
    assert len(project['data']['budget']['inputs']['roof_sections'])==2
    assert [s['color'] for s in project['data']['budget']['inputs']['roof_sections']]==['#dc6803','#0866ff']
    assert project['data']['budget']['formula_version']=='roof-sections-1.0'
    assert project['revisions']==[] and project['estimates']==[]
    assert project['data']['budget']['inputs']['footprint_ft2']!='2000'
    body['footprint_source']='mapbox_vector'
    assert client.post('/api/v1/property-budgets',json=body).status_code==422


def test_upper_roof_inside_lower_roof_creates_a_hole_without_double_counting(client):
    lower=section('Lower',ring(),pitch='0')
    upper=section('Dormer',ring(.000045,.0000225,w=.00009,h=.000045),pitch='12')
    response=preview(client,[upper,lower]);assert response.status_code==200,response.text
    data=response.json();top,bottom=data['sections']
    assert abs(float(bottom['covered_ft2'])-float(top['outlined_ft2']))<.1
    assert abs(float(bottom['counted_ft2'])+float(top['counted_ft2'])-float(bottom['outlined_ft2']))<.1
    assert abs(float(top['outlined_ft2'])*4-float(bottom['outlined_ft2']))<.1
