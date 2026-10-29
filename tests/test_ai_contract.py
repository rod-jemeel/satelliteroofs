import json,time
import pytest
from rr.ai_gateway import consume_events,validate_callback,AIError,Extraction,map_candidates

def test_protected_credential_storage_roundtrip():
    from rr.ai_gateway import protect
    raw=b'not-a-real-token'
    sealed=protect(raw)
    assert raw not in sealed
    assert protect(sealed,True)==raw

def test_oauth_rejects_state_and_client_substitution():
    p={'state':'expected','expires':time.time()+60,'client_id':'issued-one'}
    with pytest.raises(AIError):validate_callback(p,{'state':'other','code':'x'})
    with pytest.raises(AIError):validate_callback(p,{'state':'expected','code':'x','client_id':'issued-two'})
    with pytest.raises(AIError):validate_callback({**p,'client_id':'dynamic_agent_client'},{'state':'expected','code':'x'})
    assert validate_callback(p,{'state':'expected','code':'x'})=='issued-one'

def test_stream_requires_terminal_completion():
    delta='data: '+json.dumps({'type':'response.output_text.delta','delta':'{"candidates":[],"issues":[]}'})
    with pytest.raises(AIError):consume_events([delta])
    assert consume_events([delta,'data: {"type":"response.completed"}']).candidates==[]
    with pytest.raises(AIError):consume_events([delta,'data: {"type":"response.failed","code":"usage_limit_exceeded"}'])

def test_model_cannot_forge_evidence_or_approve():
    c={'field':'roof_area','raw_value':'2400','unit':'ft2','page_number':1,'token_ids':['fake'],'area_basis':'sloped_surface','waste_included':False}
    output=Extraction.model_validate({'candidates':[c],'issues':[]})
    with pytest.raises(AIError):map_candidates(output,{'pages':[]})
    with pytest.raises(Exception):Extraction.model_validate({'candidates':[dict(c,approved=True)],'issues':[]})
