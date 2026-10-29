from test_workflow import client


def inputs(**changes):
    return dict(footprint_ft2='2000', pitch_rise='6', overhang_percent='5',
                rate_low='4.50', rate_high='7.50', uncertainty_percent='15',
                extra_cost='0', rates_source='demo', **changes)


def test_budget_preview_uses_explicit_assumptions_and_outward_rounding(client):
    response = client.post('/api/v1/property-budgets/preview', json=inputs())
    assert response.status_code == 200
    result = response.json()
    assert result['status'] == 'preliminary'
    assert result['roof_area_ft2'] == '2347.87'
    assert result['low'] == '8900'
    assert result['high'] == '20300'
    assert result['pitch_factor'] == '1.118034'
    assert result['approval_allowed'] is False
    assert 'demo' in ' '.join(result['assumptions']).lower()
    assert len(client.get('/api/v1/projects').json()) == 0


def test_budget_rejects_invalid_ranges_and_never_accepts_client_totals(client):
    for patch in [dict(footprint_ft2='0'), dict(pitch_rise='-1'),
                  dict(rate_low='9', rate_high='4'), dict(uncertainty_percent='101'),
                  dict(footprint_ft2='NaN'), dict(low='1', high='2')]:
        response = client.post('/api/v1/property-budgets/preview', json={**inputs(), **patch})
        assert response.status_code == 422


def test_budget_save_is_separate_idempotent_and_requires_review(client):
    body = dict(name='Map budget', address='', latitude=30.29, longitude=-97.75,
                footprint_source='mapbox_vector', reviewed=False, inputs=inputs())
    assert client.post('/api/v1/property-budgets', json=body).status_code == 422
    body['reviewed'] = True
    headers = {'Idempotency-Key': 'budget-one'}
    first = client.post('/api/v1/property-budgets', json=body, headers=headers)
    assert first.status_code == 201
    replay = client.post('/api/v1/property-budgets', json=body, headers=headers)
    assert replay.status_code == 201
    assert first.json()['id'] == replay.json()['id']
    project = client.get('/api/v1/projects/' + first.json()['id']).json()
    assert project['measurement_seq'] == project['estimate_seq'] == 0
    assert project['revisions'] == project['estimates'] == []
    assert project['data']['budget']['low'] == '8900'
    assert project['data']['budget']['inputs']['rates_source'] == 'demo'
    assert project['data']['location']['confirmed'] is False
    assert 'geometry' not in project['data']['budget']
    assert project['events'][0]['action'] == 'preliminary_budget_saved'
    assert len(client.get('/api/v1/projects').json()) == 1
    body['inputs']['rate_low'] = '5'
    assert client.post('/api/v1/property-budgets', json=body, headers=headers).status_code == 409


def test_saved_roof_address_requires_confirmation_and_storable_source(client,monkeypatch):
    from rr import main
    body=dict(name='Address review',address='123 Demo Lane, Austin, TX',latitude=30.29,longitude=-97.75,
              footprint_source='mapbox_vector',reviewed=True,inputs=inputs(),
              address_details=dict(price_location='Austin, TX 78703',accuracy='rooftop',distance_m=8,
                                   storage_basis='permanent_geocoding',confirmed=False))
    assert client.post('/api/v1/property-budgets',json=body).status_code==422
    body['address_details']['confirmed']=True
    monkeypatch.setattr(main,'read_settings',lambda:{'permanent_geocoding':False})
    # Previously obtained permanent results may still be retained without new provider calls.
    monkeypatch.setattr(main,'read_settings',lambda:{'permanent_geocoding':False})
    result=client.post('/api/v1/property-budgets',json=body)
    assert result.status_code==201,result.text
    assert result.json()['address']==body['address']
    assert result.json()['data']['budget']['address_details']==body['address_details']
    body['address_details']['storage_basis']='temporary'
    assert client.post('/api/v1/property-budgets',json=body).status_code==422


def test_user_outline_is_validated_preserved_and_its_area_recomputed(client):
    outline = [[-97.75,30],[-97.74979231,30],[-97.74979231,30.000089932],[-97.75,30.000089932],[-97.75,30]]
    body = dict(name='Drawn roof',latitude=30,longitude=-97.75,reviewed=True,
                footprint_source='user_drawn',user_outline=outline,inputs=inputs())
    response = client.post('/api/v1/property-budgets',json=body)
    assert response.status_code == 201
    budget = response.json()['data']['budget']
    assert budget['user_outline'] == outline
    assert abs(float(budget['inputs']['footprint_ft2'])-2153) < 2
    assert budget['footprint_source'] == 'user_drawn'
    for invalid in [outline[:-1], [[0,0],[1,1],[0,1],[1,0],[0,0]], [[0,0],[1,0],[1,1],[0,0]]]:
        body['user_outline'] = invalid
        assert client.post('/api/v1/property-budgets',json=body).status_code == 422
    body['user_outline'] = outline
    body['footprint_source'] = 'mapbox_vector'
    assert client.post('/api/v1/property-budgets',json=body).status_code == 422
