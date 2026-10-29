"""One durable PostgreSQL worker; parser children never receive provider secrets."""
from pathlib import Path
import os,sys,time,json,subprocess,secrets
from datetime import datetime,timedelta,timezone
from sqlalchemy import select,or_
from rr.db import Session,Run,Job,Document,Project,audit,now
from rr.config import STORAGE,ROOT,RUNTIME
from rr import ai_gateway
from rr.filelock import FileLock,Timeout

OWNER=secrets.token_hex(16)
def lease_time():return (datetime.now(timezone.utc)+timedelta(seconds=30)).isoformat()

def claim():
    with Session.begin() as s:
        j=s.scalar(select(Job).where(or_(Job.state=='queued',(Job.state=='running')&(Job.lease_until<now()))).order_by(Job.id).with_for_update(skip_locked=True).limit(1))
        if not j:return None
        if j.attempts>=3:
            j.state='failed';r=s.get(Run,j.run_id);r.status='failed';r.error='Worker retry limit reached. Re-extract explicitly after checking the report.';return None
        j.state='running';j.attempts+=1;j.lease_owner=OWNER;j.lease_until=lease_time();return j.id

def update(job_id,stage=None):
    with Session.begin() as s:
        j=s.get(Job,job_id);r=s.get(Run,j.run_id)
        if j.state!='running' or j.lease_owner!=OWNER or r.status=='cancelled':return False
        j.lease_until=lease_time();j.checkpoint={**j.checkpoint,'stage':stage or j.checkpoint.get('stage'),'heartbeat':now()}
        if stage:r.status=stage
        return True

def run_job(job_id):
    with Session() as s:
        j=s.get(Job,job_id);run=s.get(Run,j.run_id);doc=s.get(Document,run.document_id);run_id=run.id;project_id=run.project_id;key=doc.storage_key;ai_requested=run.data.get('ai_requested',False);prior_ai_dispatch=j.checkpoint.get('ai_request_dispatched',False)
    folder=STORAGE/run_id;folder.mkdir(exist_ok=True)
    try:
        if not update(job_id,'inspecting'):return
        manifest=folder/'manifest.json'
        if not manifest.exists():
            safe_env={k:v for k,v in os.environ.items() if k.upper() in ['SYSTEMROOT','WINDIR','TEMP','TMP','PATH','LANG','HOME','USERPROFILE','APPDATA','LOCALAPPDATA']}
            safe_env.update(PYTHONPATH=str(ROOT/'services/api'),PYTHONIOENCODING='utf-8',ROOFREADY_ROOT=str(ROOT))
            if not update(job_id,'rendering'):return
            child=subprocess.Popen([sys.executable,'-m','rr.documents',str(STORAGE/key),str(folder)],env=safe_env,cwd=str(folder),stdin=subprocess.DEVNULL,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE,creationflags=subprocess.CREATE_NO_WINDOW if os.name=='nt' else 0)
            started=time.monotonic();heartbeat=0
            while child.poll() is None:
                if time.monotonic()-started>90:child.kill();child.wait();raise ValueError('PDF processing timed out after 90 seconds. Use a smaller report or manual entry.')
                if time.monotonic()-heartbeat>5:
                    heartbeat=time.monotonic()
                    if not update(job_id):child.kill();child.wait();return
                time.sleep(.25)
            err=child.stderr.read().decode('utf8',errors='replace')[-1000:]
            if child.returncode:raise ValueError(err.strip() or 'PDF parsing failed. Supply a native unlocked PDF.')
        if not update(job_id,'extracting_text'):return
        result=json.loads(manifest.read_text('utf8'))
        if ai_requested and prior_ai_dispatch:
            result['ai_status']='outcome_unknown';result['quality']='partial';result['issues'].append({'code':'ai_outcome_unknown','message':'A previous worker may have sent an AI request before stopping. It will not be replayed automatically. Native results are preserved; check provider usage before explicitly starting another extraction.','severity':'review'})
        elif ai_requested:
            if not update(job_id,'extracting_ai'):return
            try:
                with FileLock(str(RUNTIME/'ai-extraction.lock'),timeout=0):
                    packet={'canonical_fields':list(__import__('rr.measurements',fromlist=['FIELDS']).FIELDS),'pages':[{'page_number':p['page_number'],'tokens':[{k:v for k,v in t.items() if k!='top'} for t in p['tokens']]} for p in result['pages'][:6]]}
                    packet_text=json.dumps(packet)
                    if len(packet_text)>100000:raise ai_gateway.AIError('invalid_output','AI text budget exceeded. Review native evidence manually.')
                    result['provider_content_sent']={'page_numbers':[p['page_number'] for p in packet['pages']],'content':'native text tokens only','images_sent':False,'at':now()}
                    with Session.begin() as checkpoint_session:
                        checkpoint_job=checkpoint_session.get(Job,job_id)
                        if checkpoint_job.lease_owner!=OWNER or checkpoint_job.state!='running':return
                        checkpoint_job.checkpoint={**checkpoint_job.checkpoint,'ai_request_dispatched':True,'provider_content_sent':result['provider_content_sent']}
                    output=ai_gateway.extract(packet);candidates=ai_gateway.map_candidates(output,result)
                    for c in candidates:
                        peers=[o for o in result['observations'] if o['field']==c['field']]
                        if peers and any(o['value']!=c['value'] for o in peers):
                            c['quality']='conflicting'
                            for o in peers:o['quality']='conflicting'
                        if not any(o['field']==c['field'] and o['value']==c['value'] for o in peers):result['observations'].append(c)
                    result['ai_status']='success'
                    result['issues'].extend({'code':'ai_review','message':x,'severity':'review'} for x in output.issues[:30])
                    if len(result['pages'])>6:result['issues'].append({'code':'ai_page_budget','message':'AI reviewed only the first six native-text pages. Remaining pages require manual review.','severity':'required'});result['quality']='partial'
            except (ai_gateway.AIError,ValueError,Timeout) as e:
                result['ai_status']=getattr(e,'code','unavailable');result['quality']='partial';result['issues'].append({'code':'ai_'+result['ai_status'],'message':str(e) if not isinstance(e,Timeout) else 'Another AI extraction is active. Native results are preserved; retry explicitly.','severity':'review'})
        if not update(job_id,'validating'):return
        with Session.begin() as s:
            j=s.scalar(select(Job).where(Job.id==job_id).with_for_update());r=s.get(Run,run_id)
            if j.state!='running' or j.lease_owner!=OWNER or r.status=='cancelled':return
            r.data=result;r.status='needs_review';r.quality=result['quality'];j.state='completed';j.checkpoint={**j.checkpoint,'stage':'needs_review','manifest':str(manifest.relative_to(STORAGE))};audit(s,project_id,'extraction_completed',run_id=run_id,quality=r.quality)
    except Exception as e:
        with Session.begin() as s:
            j=s.get(Job,job_id);r=s.get(Run,run_id)
            if j.lease_owner==OWNER and j.state=='running':
                j.state='failed';r.status='failed';r.error=str(e)[:1000] if isinstance(e,ValueError) else 'Processing failed safely. Re-extract explicitly or use manual review.';audit(s,project_id,'extraction_failed',run_id=run_id)

if __name__=='__main__':
    print('RoofReady worker ready (one active job).',flush=True)
    while True:
        try:
            job=claim()
            if job:run_job(job)
            else:time.sleep(1)
        except KeyboardInterrupt:break
        except Exception:print('Worker database unavailable; retrying shortly.',flush=True);time.sleep(5)
