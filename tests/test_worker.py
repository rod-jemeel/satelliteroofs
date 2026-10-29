import importlib.util
from pathlib import Path
from rr.db import Base,engine,Session,Project,Document,Run,Job,now
from rr.config import STORAGE
import hashlib
import pytest

spec=importlib.util.spec_from_file_location('roofready_worker',Path(__file__).resolve().parents[1]/'services/worker/main.py')
worker=importlib.util.module_from_spec(spec);spec.loader.exec_module(worker)

@pytest.fixture
def queued():
    Base.metadata.drop_all(engine);Base.metadata.create_all(engine)
    raw=Path('fixtures/demo-roof-report.pdf').read_bytes()
    with Session.begin() as s:
        p=Project(name='Worker fixture',address='',data={});s.add(p);s.flush()
        doc=Document(project_id=p.id,filename='fixture.pdf',sha256=hashlib.sha256(raw).hexdigest(),size=len(raw),storage_key='pytest-worker.pdf',data={});s.add(doc);s.flush();(STORAGE/doc.storage_key).write_bytes(raw)
        r=Run(project_id=p.id,document_id=doc.id,data={});s.add(r);s.flush();j=Job(run_id=r.id);s.add(j);s.flush();yield_id=j.id
    return yield_id

def test_worker_claim_is_exclusive_and_expired_lease_recovers(queued):
    assert worker.claim()==queued
    assert worker.claim() is None
    with Session.begin() as s:s.get(Job,queued).lease_until='2000-01-01T00:00:00+00:00'
    assert worker.claim()==queued
    with Session() as s:assert s.get(Job,queued).attempts==2

def test_worker_preserves_native_results_without_replaying_ambiguous_ai(queued,monkeypatch):
    worker.claim()
    with Session.begin() as s:
        job=s.get(Job,queued);job.checkpoint={'ai_request_dispatched':True};run=s.get(Run,job.run_id);run.data={'ai_requested':True}
    def forbidden(packet):raise AssertionError('An unknown provider POST must never be repeated automatically')
    monkeypatch.setattr(worker.ai_gateway,'extract',forbidden)
    worker.run_job(queued)
    with Session() as s:
        job=s.get(Job,queued);r=s.get(Run,job.run_id)
        assert r.status=='needs_review'
        assert r.data['observations']
        assert r.data['ai_status']=='outcome_unknown'
