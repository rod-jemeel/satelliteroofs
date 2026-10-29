import json
import httpx
import pytest
from uuid import uuid4
from test_workflow import client
from test_budgets import inputs
from rr import price_research as prices,ai_gateway


def quote(id='shingles',category='shingles'):
    return dict(id=id,category=category,product='Test-only roof product',supplier='Test supplier',unit='bundle',price_usd='40',coverage_ft2='40',source_url='https://www.homedepot.com/p/test/123',coverage_source_url='https://www.homedepot.com/p/test/123',availability='Confirm price and local stock')


def provider(quotes=None):
    return {'status':'completed','output':[{'type':'web_search_call','status':'completed','action':{'sources':[{'url':'https://www.homedepot.com/p/test/123'}]}},{'type':'message','content':[{'type':'output_text','text':json.dumps({'quotes':quotes if quotes is not None else [quote()],'notes':['Test fixture, not a live price.']}),'annotations':[]}]}]}


@pytest.fixture
def research_env(monkeypatch,tmp_path):
    monkeypatch.setattr(prices,'RESEARCH_DIR',tmp_path/'research');monkeypatch.setattr(prices,'RUNTIME',tmp_path)
    monkeypatch.setattr(ai_gateway,'status',lambda:{'status':'ready','model':'test-model'})
    calls=[]
    def invoke(body,model,progress=None):calls.append(body);return prices.parse_response(provider())
    monkeypatch.setattr(prices,'invoke',invoke)
    return calls


def create(client):
    return client.post('/api/v1/price-research',json={'query':'Architectural shingles','location':'Chicago, IL'},headers={'Idempotency-Key':str(uuid4())})


def test_research_requires_its_own_ready_ai_connection(client,monkeypatch):
    monkeypatch.setattr(ai_gateway,'status',lambda:{'status':'authentication_required','model':''})
    response=create(client)
    assert response.status_code==422
    assert response.json()['code']=='authentication_required'


def test_supplier_evidence_and_completed_search_are_required():
    assert prices.parse_response(provider())['quotes'][0]['price_usd']=='40'
    invalid=[]
    no_search=provider();no_search['output']=no_search['output'][1:];invalid.append(no_search)
    missing=provider();missing['output'][0]['action']['sources']=[];invalid.append(missing)
    unsafe=provider([dict(quote(),source_url='http://127.0.0.1/admin')]);invalid.append(unsafe)
    forged=provider([dict(quote(),coverage_source_url='https://www.lowes.com/not-consulted')]);invalid.append(forged)
    negative=provider([dict(quote(),price_usd='-1')]);invalid.append(negative)
    duplicate=provider([quote(),quote()]);invalid.append(duplicate)
    for result in invalid:
        with pytest.raises(ai_gateway.AIError):prices.parse_response(result)
    for url in ['javascript:alert(1)','https://homedepot.com.attacker.example/x','https://user:secret@www.homedepot.com/x','https://www.homedepot.com:444/x']:
        assert prices.safe_url(url) is None


def test_research_is_durable_and_never_replays_an_idempotency_key(client,research_env):
    key=str(uuid4());body={'query':'Roof shingles','location':'Chicago, IL'}
    first=client.post('/api/v1/price-research',json=body,headers={'Idempotency-Key':key});assert first.status_code==200,first.text
    assert first.json()['status']=='completed'
    second=client.post('/api/v1/price-research',json=body,headers={'Idempotency-Key':key});assert second.json()==first.json()
    assert len(research_env)==1
    assert client.get('/api/v1/price-research/'+key).json()==first.json()
    assert client.post('/api/v1/price-research',json={'query':'Different product'},headers={'Idempotency-Key':key}).status_code==422
    assert len(research_env)==1


def test_unknown_provider_outcome_is_not_replayed(client,research_env,monkeypatch):
    calls=[]
    def interrupted(*args):calls.append(1);raise httpx.ReadTimeout('test interruption')
    monkeypatch.setattr(prices,'invoke',interrupted)
    key=str(uuid4());body={'query':'Roof shingles'}
    for _ in range(2):
        response=client.post('/api/v1/price-research',json=body,headers={'Idempotency-Key':key})
        assert response.json()['status']=='unknown'
    assert calls==[1]


def test_reviewed_prices_compose_rates_and_survive_budget_save(client,research_env):
    record=create(client).json()
    basis=dict(research_id=record['id'],quote_ids=['shingles'],waste_percent='10',labor_rate_low='2',labor_rate_high='3',reviewed=True)
    proposal=client.post('/api/v1/price-research/proposal',json=basis);assert proposal.status_code==200,proposal.text
    assert proposal.json()['rate_low']=='3.10' and proposal.json()['rate_high']=='4.10'
    body={**inputs(),'rates_source':'custom','rate_low':'3.10','rate_high':'4.10','pricing_basis':basis}
    preview=client.post('/api/v1/property-budgets/preview',json=body);assert preview.status_code==200,preview.text
    assert preview.json()['material_pricing']['quotes'][0]['source_url'].startswith('https://www.homedepot.com/')
    assert client.post('/api/v1/property-budgets/preview',json={**body,'rate_low':'9'}).status_code==422
    save=client.post('/api/v1/property-budgets',json=dict(name='Reviewed research QA',latitude=41.8,longitude=-87.6,footprint_source='manual',reviewed=True,inputs=body))
    assert save.status_code==201,save.text
    assert save.json()['data']['budget']['material_pricing']['basis']['waste_percent']=='10'
    saved=client.get('/api/v1/projects/'+save.json()['id']).json()
    assert saved['revisions']==[] and saved['estimates']==[]
    for patch in [dict(reviewed=False),dict(quote_ids=['unknown']),dict(quote_ids=['shingles','shingles']),dict(labor_rate_low='9'),dict(quote_ids=[])]:
        assert client.post('/api/v1/price-research/proposal',json={**basis,**patch}).status_code==422


def test_incompatible_pack_coverage_and_alternative_double_counting_are_rejected(client,research_env):
    record=create(client).json();record['quotes']=[quote(),dict(quote('alternative'),price_usd='50'),dict(quote('nails','nails'),coverage_ft2=None,coverage_source_url=None)];prices.write(record)
    common=dict(research_id=record['id'],waste_percent=0,labor_rate_low=2,labor_rate_high=3,reviewed=True)
    for ids in [['shingles','alternative'],['nails']]:
        assert client.post('/api/v1/price-research/proposal',json={**common,'quote_ids':ids}).status_code==422


def test_provider_payload_exposes_only_bounded_web_search(monkeypatch):
    seen={}
    monkeypatch.setattr(ai_gateway,'access_token',lambda:'test-token')
    class Stream:
        status_code=200
        def __enter__(self):return self
        def __exit__(self,*args):pass
        def iter_lines(self):yield 'data: '+json.dumps({'type':'response.completed','response':provider()})
    class Client:
        def __init__(self,**kwargs):pass
        def __enter__(self):return self
        def __exit__(self,*args):pass
        def stream(self,method,url,headers,json):
            seen.update(url=url,payload=json)
            return Stream()
    monkeypatch.setattr(prices.httpx,'Client',Client)
    progress=[]
    output=prices.invoke(prices.ResearchInput(query='Roof shingles',location='Chicago'),'configured-model',progress.append)
    payload=seen['payload']
    assert payload['model']=='configured-model' and payload['store'] is False
    assert payload['stream'] is True and payload['tool_choice']=='required'
    assert 'max_tool_calls' not in payload  # The connected plan endpoint rejects this API-only parameter.
    assert [tool['type'] for tool in payload['tools']]==['web_search']
    assert payload['tools'][0]['filters']['allowed_domains']==prices.DOMAINS
    assert payload['include']==['web_search_call.action.sources']
    assert 'Roof shingles' in payload['input'][0]['content'][0]['text'] and output['quotes']
    assert progress[-1]['output_types']==['message','web_search_call']


def test_completed_response_without_web_search_is_failed_and_never_replayed(client,research_env,monkeypatch):
    calls=[]
    def invoke(body,model,progress=None):
        calls.append(1)
        if progress:progress({'last_event':'response.completed','event_count':96})
        result=provider();result['output']=result['output'][1:]
        return prices.parse_response(result)
    monkeypatch.setattr(prices,'invoke',invoke)
    key=str(uuid4());body={'query':'Roof shingles'}
    for _ in range(2):
        record=client.post('/api/v1/price-research',json=body,headers={'Idempotency-Key':key}).json()
        assert record['status']=='failed' and record['quotes']==[]
        assert record['last_event']=='response.completed'
        assert 'No completed web search' in record['message']
    assert calls==[1]

@pytest.mark.parametrize('terminal', ['completed','failed','missing'])
def test_streamed_search_items_survive_empty_terminal_output(monkeypatch,terminal):
    monkeypatch.setattr(ai_gateway,'access_token',lambda:'test-token')
    items=provider()['output']
    events=[{'type':'response.output_item.done','output_index':index,'item':dict(item,id='item-'+str(index))} for index,item in enumerate(items)]
    if terminal!='missing':events.append({'type':'response.'+terminal,'response':{'id':'response-test','status':terminal,'output':[]}})
    class Stream:
        status_code=200
        def __enter__(self):return self
        def __exit__(self,*args):pass
        def iter_lines(self):
            for event in events:yield 'data: '+json.dumps(event)
    class Client:
        def __init__(self,**kwargs):pass
        def __enter__(self):return self
        def __exit__(self,*args):pass
        def stream(self,*args,**kwargs):return Stream()
    monkeypatch.setattr(prices.httpx,'Client',Client)
    if terminal=='completed':
        output=prices.invoke(prices.ResearchInput(query='Roof shingles'),'test-model')
        assert output['quotes'][0]['source_url']==quote()['source_url']
        assert output['quotes'][0]['price_usd']=='40'
    else:
        with pytest.raises((ai_gateway.AIError,httpx.ReadError)):
            prices.invoke(prices.ResearchInput(query='Roof shingles'),'test-model')
