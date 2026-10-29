import hashlib,hmac,json,secrets,time
from pathlib import Path
from contextlib import asynccontextmanager
from typing import Literal,Any
from uuid import uuid4
from fastapi import FastAPI,Request,Response,UploadFile,HTTPException,Depends
from fastapi.responses import FileResponse,JSONResponse,RedirectResponse,StreamingResponse
from pydantic import BaseModel,Field,ConfigDict,UUID4,model_validator
from sqlalchemy import select
from .config import RUNTIME,STORAGE,ROOT,SESSION_SECRET,INTERNAL,ORIGIN,MAX_BYTES,read_settings,save_settings
from .db import Base,engine,Session,Project,Document,Run,Job,Revision,Estimate,Event,Idempotency,audit,uid,now
from .measurements import FIELDS,normalize,number
from .estimates import calculate,CATALOG,VERSION
from .budgets import BudgetInputs,BudgetSave,calculate_budget
from . import ai_gateway,maps,exports,price_research,parcels

SESSION_VALUE=hmac.new(SESSION_SECRET.encode(),b'local-owner-session',hashlib.sha256).hexdigest()
CSRF=hmac.new(SESSION_SECRET.encode(),b'local-owner-csrf',hashlib.sha256).hexdigest()

@asynccontextmanager
async def lifespan(app):
    Base.metadata.create_all(engine)
    yield

app=FastAPI(title='SatelliteRoofs local API',version='0.1.0',lifespan=lifespan,docs_url=None,redoc_url=None)

@app.middleware('http')
async def security(request,call_next):
    request_id=secrets.token_hex(12)
    if request.url.path not in ('/health','/auth/callback'):
        if not INTERNAL or not hmac.compare_digest(request.headers.get('x-roofready-internal',''),INTERNAL):return JSONResponse({'detail':'Use the SatelliteRoofs local web application.','request_id':request_id},403)
        if request.url.path!='/api/v1/session':
            if not hmac.compare_digest(request.cookies.get('rr_session',''),SESSION_VALUE):return JSONResponse({'detail':'Open SatelliteRoofs to initialize your local session.','request_id':request_id},401)
            if request.method not in ('GET','HEAD','OPTIONS'):
                if request.headers.get('origin')!=ORIGIN or not hmac.compare_digest(request.headers.get('x-csrf-token',''),CSRF):return JSONResponse({'detail':'The local origin or CSRF token did not match. Reload SatelliteRoofs.','request_id':request_id},403)
    response=await call_next(request)
    response.headers.update({'X-Request-ID':request_id,'X-Content-Type-Options':'nosniff','Cache-Control':'no-store','Referrer-Policy':'no-referrer','Content-Security-Policy':"frame-ancestors 'self'"})
    return response

@app.exception_handler(ValueError)
async def invalid(request,exc):return JSONResponse({'detail':str(exc),'code':getattr(exc,'code','invalid_input')},422)

def session():
    with Session() as s:
        yield s

def get(s,model,id,lock=False):
    stmt=select(model).where(model.id==id)
    if lock:stmt=stmt.with_for_update()
    row=s.scalar(stmt)
    if not row:raise HTTPException(404,'Record not found')
    return row

def expected(p,seq):
    if p.measurement_seq!=seq:raise HTTPException(409,'Measurements changed. Reload and review the current revision.')

def serialize(row):
    return {col.name:getattr(row,col.name) for col in row.__table__.columns if col.name!='storage_key'}

def fingerprint(payload):return hashlib.sha256(json.dumps(payload,sort_keys=True,default=str).encode()).hexdigest()
def idem(s,key,payload):
    row=s.get(Idempotency,key)
    if row and row.fingerprint!=fingerprint(payload):raise HTTPException(409,'This idempotency key was already used for different inputs.')
    return row.data if row else None
def remember(s,key,payload,data):s.add(Idempotency(key=key,fingerprint=fingerprint(payload),data=data))

class ProjectInput(BaseModel):
    name:str=Field(min_length=1,max_length=200)
    address:str=Field(default='',max_length=500)
class MeasurementValue(BaseModel):
    value:str|None=None
    unit:str='ft'
    observation_id:str|None=None
    area_basis:Literal['sloped_surface','horizontal_footprint','unknown']='unknown'
    waste_included:bool=False
    review_status:Literal['accepted','unreviewed','not_available']='accepted'
    reason:str=''
class MeasurementInput(BaseModel):
    expected_revision:int=Field(ge=0)
    values:dict[str,MeasurementValue]
    scope:list[str]=Field(default_factory=lambda:['main'],min_length=1)
    reason:str=Field(default='',max_length=2000)
    run_id:str|None=None
class ExpectedInput(BaseModel):
    expected_revision:int
    expected_estimate:int|None=None
class EstimateInput(BaseModel):
    expected_revision:int
    config:dict[str,Any]=Field(default_factory=dict)
    idempotency_key:str=Field(default_factory=uid)
class ExportInput(BaseModel):
    audience:Literal['internal','customer']='customer'
    format:Literal['pdf','json','csv']='pdf'
    idempotency_key:str=Field(default_factory=uid)
class LocationInput(BaseModel):
    latitude:float=Field(ge=-90,le=90)
    longitude:float=Field(ge=-180,le=180)
    provider:Literal['manual','mapbox']='manual'
    storage_basis:Literal['user_supplied','permanent_geocoding']='user_supplied'
    label:str=''
    accuracy:str='unknown'
class AddressInput(BaseModel):address:str=Field(min_length=1,max_length=500)
class BrowseAddressInput(BaseModel):
    model_config=ConfigDict(extra='forbid')
    address:str=Field(min_length=3,max_length=256)
class BrowseMatch(BaseModel):
    label:str
    longitude:float
    latitude:float
    accuracy:str
class SearchProximity(BaseModel):
    model_config=ConfigDict(extra='forbid')
    longitude:float=Field(ge=-180,le=180)
    latitude:float=Field(ge=-85,le=85)
class ReverseInput(BaseModel):
    model_config=ConfigDict(extra='forbid')
    longitude:float=Field(ge=-180,le=180,strict=True)
    latitude:float=Field(ge=-85,le=85,strict=True)
    @model_validator(mode='after')
    def actual_location(self):
        if abs(self.longitude)<.001 and abs(self.latitude)<.001:raise ValueError('Choose a roof location first.')
        return self
class RoofAddressMatch(BrowseMatch):
    distance_m:int
    price_location:str
    storage_basis:Literal['temporary','permanent_geocoding']
    confirmed:Literal[False]=False
class SuggestInput(BaseModel):
    model_config=ConfigDict(extra='forbid')
    query:str=Field(min_length=3,max_length=256)
    session_token:UUID4
    proximity:SearchProximity|None=None
class RetrieveInput(BaseModel):
    model_config=ConfigDict(extra='forbid')
    mapbox_id:str=Field(min_length=1,max_length=500,pattern=r'^[A-Za-z0-9_:=\-]+$')
    session_token:UUID4
class MapSuggestion(BaseModel):
    mapbox_id:str
    label:str
    feature_type:str
class RetrievedMatch(BrowseMatch):
    feature_type:str
class SettingsInput(BaseModel):
    model:str=Field(default='',max_length=100)
    map_token:str=Field(default='',max_length=500)
    permanent_geocoding:Literal[False]=False
class AnnotationInput(BaseModel):
    document_id:str
    page_number:int=Field(ge=1)
    bbox:list[float]=Field(min_length=4,max_length=4)
    label:str=Field(min_length=1,max_length=200)

@app.get('/health')
def health():return {'status':'ok','service':'SatelliteRoofs'}
@app.get('/api/v1/session')
def start_session(response:Response):
    response.set_cookie('rr_session',SESSION_VALUE,httponly=True,samesite='strict',path='/',max_age=86400)
    return {'csrf':CSRF,'owner':'Local owner'}

@app.get('/api/v1/projects')
def projects(s=Depends(session)):
    result=[]
    for p in s.scalars(select(Project).order_by(Project.created_at.desc())):
        data=serialize(p);data['run']=serialize(get(s,Run,p.current_run)) if p.current_run else None
        e=s.scalar(select(Estimate).where(Estimate.project_id==p.id).order_by(Estimate.seq.desc()))
        data['latest_estimate']=serialize(e) if e else None;result.append(data)
    return result
@app.post('/api/v1/projects')
def new_project(body:ProjectInput,s=Depends(session)):
    p=Project(name=body.name.strip(),address=body.address.strip(),data={'structures':[{'id':'main','name':'Main house'}]});s.add(p);s.flush();audit(s,p.id,'project_created');s.commit();return serialize(p)

@app.post('/api/v1/property-budgets/preview')
def preview_budget(body:BudgetInputs):
    return calculate_budget(body)

@app.post('/api/v1/price-research')
def research_prices(body:price_research.ResearchInput,request:Request):
    key=request.headers.get('idempotency-key')
    if not key:raise ValueError('A unique research request ID is required.')
    try:return price_research.research(body,key)
    except TimeoutError:raise HTTPException(409,'Another material search is already running. Check its status before starting a new one.')

@app.get('/api/v1/price-research/latest')
def latest_research():return price_research.latest()

@app.get('/api/v1/price-research/{research_id}')
def research_result(research_id:str):return price_research.read(research_id)

@app.post('/api/v1/price-research/proposal')
def material_proposal(body:price_research.PricingBasis):return price_research.pricing(body)

@app.post('/api/v1/property-budgets',status_code=201)
def save_budget(body:BudgetSave,request:Request,s=Depends(session)):
    if not body.name.strip():raise ValueError('Give this budget project a name.')
    if body.address_details:
        if not body.address.strip():raise ValueError('The reviewed address cannot be empty.')
    if abs(body.latitude)<.001 and abs(body.longitude)<.001:raise ValueError('0,0 is a placeholder, not a property location.')
    payload=body.model_dump(mode='json');key='budget:'+request.headers.get('idempotency-key',uid())
    old=idem(s,key,payload)
    if old:return old
    budget={**calculate_budget(body.inputs),'footprint_source':body.footprint_source,
            'building_name':body.building_name,'building_type':body.building_type,
            'reviewed_by':'Local owner','reviewed_at':now()}
    if body.user_outline is not None:budget['user_outline']=[list(p) for p in body.user_outline]
    if body.address_details:budget['address_details']=body.address_details.model_dump(mode='json')
    location=dict(latitude=body.latitude,longitude=body.longitude,provider='manual',
                  storage_basis='user_supplied',label=body.address or body.name,
                  confirmed=False,accuracy='user_selected')
    p=Project(name=body.name.strip(),address=body.address.strip(),data={'structures':[{'id':'main','name':'Selected building'}],'budget':budget,'location':location})
    s.add(p);s.flush();audit(s,p.id,'preliminary_budget_saved',formula_version=budget['formula_version'])
    result=serialize(p);remember(s,key,payload,result);s.commit();return result
@app.get('/api/v1/projects/{id}')
def project_detail(id:str,s=Depends(session)):
    p=get(s,Project,id);d=serialize(p)
    d['documents']=[serialize(x) for x in s.scalars(select(Document).where(Document.project_id==id).order_by(Document.created_at.desc()))]
    d['runs']=[serialize(x) for x in s.scalars(select(Run).where(Run.project_id==id).order_by(Run.created_at.desc()))]
    d['revisions']=[serialize(x) for x in s.scalars(select(Revision).where(Revision.project_id==id).order_by(Revision.seq.desc()))]
    d['estimates']=[dict(serialize(x),is_current=x.seq==p.estimate_seq and x.data.get('measurement_seq')==p.measurement_seq and x.data.get('run_id')==p.current_run) for x in s.scalars(select(Estimate).where(Estimate.project_id==id).order_by(Estimate.seq.desc()))]
    d['events']=[serialize(x) for x in s.scalars(select(Event).where(Event.project_id==id).order_by(Event.created_at.desc()).limit(100))]
    return d

def enqueue(s,p,document,key,payload):
    run=Run(project_id=p.id,document_id=document.id,data={'ai_requested':payload.get('ai',False)});s.add(run);s.flush();s.add(Job(run_id=run.id));p.current_run=run.id
    data={'document_id':document.id,'extraction_run_id':run.id,'sha256':document.sha256,'status':'queued'}
    remember(s,key,payload,data);audit(s,p.id,'extraction_queued',run_id=run.id,document_id=document.id);s.commit();return data

@app.post('/api/v1/projects/{id}/documents',status_code=202)
async def upload(id:str,file:UploadFile,request:Request,s=Depends(session)):
    p=get(s,Project,id,True);raw=await file.read(MAX_BYTES+1)
    if len(raw)>MAX_BYTES:raise HTTPException(413,'PDF exceeds the 25 MB upload limit.')
    if not raw.startswith(b'%PDF-'):raise HTTPException(422,'Upload a PDF file. Other file formats are not supported.')
    digest=hashlib.sha256(raw).hexdigest();key='upload:'+id+':'+request.headers.get('idempotency-key',uid());payload={'sha':digest}
    previous=idem(s,key,payload)
    if previous:return previous
    storage=uid()+'.pdf';path=STORAGE/storage
    with path.open('xb') as f:f.write(raw)
    path.chmod(0o600)
    doc=Document(project_id=id,filename=Path(file.filename.replace('\\','/')).name[:250],sha256=digest,size=len(raw),storage_key=storage,data={'uploader':'Local owner'});s.add(doc);s.flush()
    return enqueue(s,p,doc,key,payload)

@app.post('/api/v1/demo',status_code=202)
def demo(request:Request,s=Depends(session)):
    key='demo:'+request.headers.get('idempotency-key',uid());old=idem(s,key,{})
    if old:return old
    path=ROOT/'fixtures/demo-roof-report.pdf'
    if not path.exists():raise HTTPException(422,'Run scripts/create_fixtures.py to create the synthetic demo reports.')
    p=Project(name='Oakridge residence',address='1284 Oakridge Drive • synthetic address',data={'demo':True,'structures':[{'id':'main','name':'Main house'}]});s.add(p);s.flush()
    raw=path.read_bytes();storage=uid()+'.pdf';(STORAGE/storage).write_bytes(raw)
    doc=Document(project_id=p.id,filename=path.name,sha256=hashlib.sha256(raw).hexdigest(),size=len(raw),storage_key=storage,data={'synthetic':True,'uploader':'Local owner'});s.add(doc);s.flush()
    run=Run(project_id=p.id,document_id=doc.id,data={});s.add(run);s.flush();s.add(Job(run_id=run.id));p.current_run=run.id
    data={'project_id':p.id,'document_id':doc.id,'extraction_run_id':run.id};remember(s,key,{},data);audit(s,p.id,'synthetic_demo_imported');s.commit();return data

@app.get('/api/v1/documents/{id}/content')
def content(id:str,s=Depends(session)):
    d=get(s,Document,id);return FileResponse(STORAGE/d.storage_key,media_type='application/pdf',filename=d.filename,content_disposition_type='inline')
@app.get('/api/v1/documents/{id}/pages')
def pages(id:str,s=Depends(session)):
    get(s,Document,id);run=s.scalar(select(Run).where(Run.document_id==id,Run.status=='needs_review').order_by(Run.created_at.desc()))
    return run.data.get('pages',[]) if run else []
@app.get('/api/v1/extractions/{id}')
def extraction(id:str,s=Depends(session)):return serialize(get(s,Run,id))
@app.post('/api/v1/documents/{id}/extractions',status_code=202)
def reextract(id:str,request:Request,body:dict,s=Depends(session)):
    doc=get(s,Document,id);p=get(s,Project,doc.project_id,True);key='extract:'+id+':'+request.headers.get('idempotency-key',uid());old=idem(s,key,body)
    if old:return old
    return enqueue(s,p,doc,key,body)
@app.post('/api/v1/extractions/{id}/cancel')
def cancel(id:str,s=Depends(session)):
    run=get(s,Run,id,True)
    if run.status not in ('needs_review','failed'):run.status='cancelled'
    j=s.scalar(select(Job).where(Job.run_id==id));j.state='cancelled';audit(s,run.project_id,'extraction_cancelled',run_id=id);s.commit();return serialize(run)
@app.get('/api/v1/extractions/{id}/events')
def progress(id:str,s=Depends(session)):
    run=get(s,Run,id)
    return StreamingResponse(iter(['event: progress\ndata: '+json.dumps({'status':run.status,'quality':run.quality})+'\n\n']),media_type='text/event-stream')
@app.get('/api/v1/projects/{id}/observations')
def observations(id:str,s=Depends(session)):
    p=get(s,Project,id);return get(s,Run,p.current_run).data.get('observations',[]) if p.current_run else []

@app.post('/api/v1/projects/{id}/measurement-revisions')
def save_revision(id:str,body:MeasurementInput,s=Depends(session)):
    p=get(s,Project,id,True);expected(p,body.expected_revision)
    allowed=[x['id'] for x in p.data.get('structures',[{'id':'main'}])]
    if len(body.scope)!=1 or any(x not in allowed for x in body.scope):raise ValueError('Select one reviewed structure per estimate. Multiple-structure aggregation is not yet supported; create separate projects.')
    if body.run_id!=p.current_run:raise HTTPException(409,'The extraction run changed. Reload before saving.')
    candidates=get(s,Run,body.run_id).data.get('observations',[]) if body.run_id else []
    by_id={o['id']:o for o in candidates};values={}
    for key,entry in body.values.items():
        if key not in FIELDS:raise ValueError('Unknown canonical measurement field')
        value=entry.model_dump();ob=by_id.get(entry.observation_id) if entry.observation_id else None
        if entry.observation_id and (not ob or ob['field']!=key):raise ValueError('Observation must belong to this run and canonical field.')
        if entry.value is not None:
            value['value']=normalize(entry.value,'pitch' if key=='facet_pitch' else FIELDS[key][1])
            if entry.unit!=FIELDS[key][1]:raise ValueError('Accepted measurements must use the displayed canonical unit.')
            changed=not ob or value['value']!=ob['value'] or value['area_basis']!=ob.get('area_basis') or value['waste_included']!=ob.get('waste_included') or ob.get('quality')=='conflicting'
            if changed and not (entry.reason or body.reason).strip():raise ValueError('Manual entries, corrections and conflict resolutions require a reason.')
            value['provenance']='manual' if changed else 'observation';value['manual_entry_id']=uid() if changed else None
        else:value['review_status']='not_available';value['provenance']='manual'
        value.update(reviewer='Local owner',reviewed_at=now(),reason=entry.reason or body.reason,structure_id=body.scope[0]);values[key]=value
    p.measurement_seq+=1
    r=Revision(project_id=id,seq=p.measurement_seq,status='draft',data={'values':values,'scope':body.scope,'run_id':body.run_id,'reviewer':'Local owner','reason':body.reason})
    s.add(r);s.flush();audit(s,id,'measurement_revision_saved',revision_id=r.id,seq=r.seq,reason=body.reason);s.commit();return serialize(r)

@app.post('/api/v1/measurement-revisions/{id}/verify')
def verify(id:str,body:ExpectedInput,s=Depends(session)):
    r=get(s,Revision,id);p=get(s,Project,r.project_id,True);expected(p,body.expected_revision)
    if r.seq!=p.measurement_seq or r.data.get('run_id')!=p.current_run:raise HTTPException(409,'Only the current measurement revision can be verified.')
    required=['roof_area','eave_length','rake_length','valley_length']
    values=r.data['values']
    for key in required:
        if values.get(key,{}).get('value') is None or values[key].get('review_status')!='accepted':raise ValueError(f'Accept a reviewed {FIELDS[key][0].lower()} value before verification.')
    if values['roof_area']['area_basis']!='sloped_surface':raise ValueError('Confirm the roof area is sloped surface area.')
    if values.get('ridge_hip_length',{}).get('value') is None and any(values.get(k,{}).get('value') is None for k in ['ridge_length','hip_length']):raise ValueError('Review combined ridge/hip or both component lengths.')
    if any(v.get('value') is not None and v.get('review_status')!='accepted' for v in values.values()):raise ValueError('Accept or mark unavailable every selected measurement.')
    r.status='verified';r.data={**r.data,'verified_at':now()};audit(s,p.id,'measurements_verified',revision_id=id);s.commit();return serialize(r)

@app.get('/api/v1/catalog')
def catalog():return {'version':'demo-1','demo_data':True,'products':CATALOG,'fields':{k:{'name':v[0],'unit':v[1]} for k,v in FIELDS.items()}}
@app.get('/api/v1/assemblies')
def assemblies():return [{'id':VERSION,'name':'Asphalt shingle • demo assembly','demo_data':True}]

@app.post('/api/v1/projects/{id}/estimates')
def estimate(id:str,body:EstimateInput,s=Depends(session)):
    p=get(s,Project,id,True);key='estimate:'+id+':'+body.idempotency_key;payload=body.model_dump();old=idem(s,key,payload)
    if old:return old
    expected(p,body.expected_revision)
    r=s.scalar(select(Revision).where(Revision.project_id==id,Revision.seq==p.measurement_seq))
    if not r:raise ValueError('Save a reviewed measurement draft first.')
    if r.data.get('run_id')!=p.current_run:raise HTTPException(409,'Measurements were saved against an older extraction. Review the current run.')
    data=calculate(r.data['values'],body.config)
    if r.status!='verified':data['status']='partial';data['issues'].append({'code':'unverified_measurements','message':'Measurement revision has not been verified by the local owner.','severity':'required'})
    data.update(measurement_seq=r.seq,run_id=p.current_run,scope=r.data['scope'],reviewer='Local owner',calculated_at=now())
    p.estimate_seq+=1;e=Estimate(project_id=id,measurement_id=r.id,seq=p.estimate_seq,status=data['status'],data=data);s.add(e);s.flush();out=serialize(e);remember(s,key,payload,out);audit(s,id,'estimate_calculated',estimate_id=e.id,seq=e.seq);s.commit();return out

@app.post('/api/v1/estimates/{id}/revisions')
def revise_estimate(id:str,body:EstimateInput,s=Depends(session)):
    e=get(s,Estimate,id);return estimate(e.project_id,body,s)

@app.post('/api/v1/estimate-revisions/{id}/approve')
def approve(id:str,body:ExpectedInput,s=Depends(session)):
    e=get(s,Estimate,id);p=get(s,Project,e.project_id,True);expected(p,body.expected_revision)
    if body.expected_estimate!=p.estimate_seq or e.seq!=p.estimate_seq or e.data['measurement_seq']!=p.measurement_seq or e.data.get('run_id')!=p.current_run:raise HTTPException(409,'Only the current estimate and current measurements can be approved.')
    if e.status not in ('ready_for_review','approved') or e.data['issues']:raise ValueError('Resolve required inputs and verify measurements before approving this estimate.')
    if e.status!='approved':e.status='approved';audit(s,p.id,'estimate_approved',estimate_id=id)
    s.commit();return serialize(e)

@app.post('/api/v1/estimate-revisions/{id}/exports')
def export_estimate(id:str,body:ExportInput,s=Depends(session)):
    e=get(s,Estimate,id);p=get(s,Project,e.project_id,True);key='export:'+id+':'+body.idempotency_key;payload=body.model_dump();old=idem(s,key,payload)
    if old:return old
    artifact=uid();storage=artifact+'.'+body.format;exports.render(p,e,body.audience,body.format,STORAGE/storage)
    event=Event(project_id=p.id,action='estimate_exported',data={'artifact_id':artifact,'storage':storage,'audience':body.audience,'estimate_id':id,'actor':'Local owner'});s.add(event)
    result={'url':'/api/v1/exports/'+artifact,'filename':f'SatelliteRoofs-{body.audience}-r{e.seq}.{body.format}','audience':body.audience};remember(s,key,payload,result);s.commit();return result
@app.get('/api/v1/exports/{id}')
def download_export(id:str,s=Depends(session)):
    event=next((e for e in s.scalars(select(Event).where(Event.action=='estimate_exported')) if e.data.get('artifact_id')==id),None)
    if not event:raise HTTPException(404,'Export not found')
    path=STORAGE/event.data['storage'];media={'.pdf':'application/pdf','.json':'application/json','.csv':'text/csv'}[path.suffix]
    return FileResponse(path,media_type=media,filename=f'SatelliteRoofs-{event.data["audience"]}{path.suffix}')

@app.post('/api/v1/projects/{id}/location/search')
def location_search(id:str,body:AddressInput,s=Depends(session)):
    get(s,Project,id);return maps.search(body.address)
@app.post('/api/v1/map/search',response_model=list[BrowseMatch])
def map_search(body:BrowseAddressInput):
    return maps.browse(body.address)
@app.post('/api/v1/map/suggest',response_model=list[MapSuggestion])
def map_suggest(body:SuggestInput):return maps.suggest(body.query,body.session_token,body.proximity)
@app.post('/api/v1/map/retrieve',response_model=RetrievedMatch)
def map_retrieve(body:RetrieveInput):return maps.retrieve(body.mapbox_id,body.session_token)
@app.post('/api/v1/map/reverse',response_model=list[RoofAddressMatch])
def map_reverse(body:ReverseInput):return maps.reverse(body.longitude,body.latitude)
@app.post('/api/v1/map/parcel')
def map_parcel(body:ReverseInput):return parcels.lookup(body.longitude,body.latitude)
@app.put('/api/v1/projects/{id}/location')
def set_location(id:str,body:LocationInput,s=Depends(session)):
    p=get(s,Project,id,True)
    if abs(body.latitude)<.001 and abs(body.longitude)<.001:raise ValueError('0,0 is a placeholder, not a confirmed property location.')
    if body.provider=='mapbox' and body.storage_basis!='permanent_geocoding':raise ValueError('Temporary Mapbox results cannot be saved as a property pin.')
    data=body.model_dump();data.update(confirmed=True,confirmed_by='Local owner',confirmed_at=now());p.data={**p.data,'location':data};audit(s,id,'location_confirmed',provider=body.provider);s.commit();return data

@app.post('/api/v1/projects/{id}/annotations')
def annotation(id:str,body:AnnotationInput,s=Depends(session)):
    p=get(s,Project,id,True);d=get(s,Document,body.document_id)
    if d.project_id!=id:raise ValueError('Document does not belong to this project.')
    if not all(0<=x<=1 for x in body.bbox) or body.bbox[0]>=body.bbox[2] or body.bbox[1]>=body.bbox[3]:raise ValueError('Draw a nonempty region within the page.')
    run=s.scalar(select(Run).where(Run.document_id==d.id,Run.status=='needs_review').order_by(Run.created_at.desc()))
    if not run or body.page_number>len(run.data.get('pages',[])):raise ValueError('Annotation page does not exist.')
    item={**body.model_dump(),'id':uid(),'actor':'Local owner','created_at':now()};p.data={**p.data,'annotations':[*p.data.get('annotations',[]),item]};audit(s,id,'annotation_created',annotation_id=item['id']);s.commit();return item

@app.get('/api/v1/settings')
def settings():return {**read_settings(),'document_limits':{'max_mb':25,'max_pages':40},'units':'US customary','crm':{'status':'demo_integration','message':'Demo integration only. No JobNimbus writes are performed.'},'database':'PostgreSQL' if engine.dialect.name=='postgresql' else 'SQLite test/development fallback'}
@app.put('/api/v1/settings')
def update_settings(body:SettingsInput):
    if body.map_token and not body.map_token.startswith('pk.'):raise ValueError('Use a restricted public Mapbox token (pk.). Secret tokens are not accepted in the browser.')
    save_settings({'ai_adapter':'responses',**body.model_dump()});return settings()
@app.get('/api/v1/ai/connection')
def connection():return ai_gateway.status()
@app.post('/api/v1/ai/connect')
def connect():return ai_gateway.begin()
@app.get('/auth/callback')
def callback(request:Request):
    try:ai_gateway.complete(dict(request.query_params));status='connected'
    except Exception:status='connection_failed'
    return RedirectResponse(ORIGIN+'/?ai='+status)
@app.post('/api/v1/ai/disconnect')
def disconnect():return ai_gateway.disconnect()
@app.get('/api/v1/ai/models')
def ai_models():return ai_gateway.models()
@app.post('/api/v1/ai/test')
def ai_test():
    packet={'pages':[{'page_number':1,'tokens':[{'id':'p1_t1','text':'Total roof area: 2400 sq ft, sloped surface, no waste','bbox':[0.1,0.1,0.9,0.2]}]}]}
    with ai_gateway.FileLock(str(RUNTIME/'ai-extraction.lock'),timeout=0):
        result=ai_gateway.extract(packet);obs=ai_gateway.map_candidates(result,packet)
    if not any(o['field']=='roof_area' and o['value']=='2400' and o['unit']=='ft2' for o in obs):raise ValueError('The structured extraction test did not return the expected source-supported area.')
    with ai_gateway.FileLock(str(RUNTIME/'oauth.lock')):
        c=ai_gateway.load('ai-credentials');c.update(ready=True,tested_model=read_settings()['model']);ai_gateway.save('ai-credentials',c)
    return ai_gateway.status()
@app.get('/api/v1/integrations/jobnimbus')
def crm():return {'status':'demo_integration','records':[{'id':'synthetic-job-001','name':'Oakridge residence','status':'Estimate review'}],'capabilities':{'searchJobs':'demo_only','attachEstimate':'unsupported_capability','createCorrectionTask':'unsupported_capability'}}
