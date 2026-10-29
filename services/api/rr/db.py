from datetime import datetime, timezone
from uuid import uuid4
from sqlalchemy import create_engine, String, Integer, Text, ForeignKey, UniqueConstraint, JSON
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker
from .config import DATABASE_URL

def uid(): return str(uuid4())
def now(): return datetime.now(timezone.utc).isoformat()
class Base(DeclarativeBase): pass
J=JSON().with_variant(JSONB,'postgresql')
engine=create_engine(DATABASE_URL, pool_pre_ping=True, **({'connect_args':{'check_same_thread':False}} if DATABASE_URL.startswith('sqlite') else {'pool_size':5,'max_overflow':5}))
Session=sessionmaker(engine, expire_on_commit=False)

class Project(Base):
    __tablename__='projects'
    id:Mapped[str]=mapped_column(String,primary_key=True,default=uid)
    name:Mapped[str]=mapped_column(String(200))
    address:Mapped[str]=mapped_column(String(500),default='')
    created_at:Mapped[str]=mapped_column(String,default=now)
    measurement_seq:Mapped[int]=mapped_column(Integer,default=0)
    estimate_seq:Mapped[int]=mapped_column(Integer,default=0)
    current_run:Mapped[str|None]=mapped_column(String,nullable=True)
    data:Mapped[dict]=mapped_column(J,default=dict)

class Document(Base):
    __tablename__='documents'
    id:Mapped[str]=mapped_column(String,primary_key=True,default=uid)
    project_id:Mapped[str]=mapped_column(ForeignKey('projects.id'),index=True)
    filename:Mapped[str]=mapped_column(String)
    sha256:Mapped[str]=mapped_column(String(64))
    size:Mapped[int]=mapped_column(Integer)
    storage_key:Mapped[str]=mapped_column(String,unique=True)
    created_at:Mapped[str]=mapped_column(String,default=now)
    data:Mapped[dict]=mapped_column(J,default=dict)

class Run(Base):
    __tablename__='extraction_runs'
    id:Mapped[str]=mapped_column(String,primary_key=True,default=uid)
    project_id:Mapped[str]=mapped_column(ForeignKey('projects.id'),index=True)
    document_id:Mapped[str]=mapped_column(ForeignKey('documents.id'))
    status:Mapped[str]=mapped_column(String,default='queued')
    quality:Mapped[str]=mapped_column(String,default='pending')
    created_at:Mapped[str]=mapped_column(String,default=now)
    data:Mapped[dict]=mapped_column(J,default=dict)
    error:Mapped[str|None]=mapped_column(String,nullable=True)

class Job(Base):
    __tablename__='processing_jobs'
    id:Mapped[str]=mapped_column(String,primary_key=True,default=uid)
    run_id:Mapped[str]=mapped_column(ForeignKey('extraction_runs.id'),unique=True)
    state:Mapped[str]=mapped_column(String,default='queued',index=True)
    attempts:Mapped[int]=mapped_column(Integer,default=0)
    lease_owner:Mapped[str|None]=mapped_column(String,nullable=True)
    lease_until:Mapped[str|None]=mapped_column(String,nullable=True,index=True)
    checkpoint:Mapped[dict]=mapped_column(J,default=dict)

class Revision(Base):
    __tablename__='measurement_revisions'
    __table_args__=(UniqueConstraint('project_id','seq'),)
    id:Mapped[str]=mapped_column(String,primary_key=True,default=uid)
    project_id:Mapped[str]=mapped_column(ForeignKey('projects.id'),index=True)
    seq:Mapped[int]=mapped_column(Integer)
    status:Mapped[str]=mapped_column(String,default='draft')
    created_at:Mapped[str]=mapped_column(String,default=now)
    data:Mapped[dict]=mapped_column(J)

class Estimate(Base):
    __tablename__='estimate_revisions'
    __table_args__=(UniqueConstraint('project_id','seq'),)
    id:Mapped[str]=mapped_column(String,primary_key=True,default=uid)
    project_id:Mapped[str]=mapped_column(ForeignKey('projects.id'),index=True)
    measurement_id:Mapped[str]=mapped_column(ForeignKey('measurement_revisions.id'))
    seq:Mapped[int]=mapped_column(Integer)
    status:Mapped[str]=mapped_column(String)
    created_at:Mapped[str]=mapped_column(String,default=now)
    data:Mapped[dict]=mapped_column(J)

class Event(Base):
    __tablename__='audit_events'
    id:Mapped[str]=mapped_column(String,primary_key=True,default=uid)
    project_id:Mapped[str|None]=mapped_column(ForeignKey('projects.id'),nullable=True,index=True)
    action:Mapped[str]=mapped_column(String)
    created_at:Mapped[str]=mapped_column(String,default=now)
    data:Mapped[dict]=mapped_column(J,default=dict)

class Idempotency(Base):
    __tablename__='idempotency_keys'
    key:Mapped[str]=mapped_column(String,primary_key=True)
    fingerprint:Mapped[str]=mapped_column(String)
    data:Mapped[dict]=mapped_column(J)

def audit(s, project_id, action, **data): s.add(Event(project_id=project_id,action=action,data={'actor':'Local owner',**data}))
