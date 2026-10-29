"""Initial local prototype records and immutable JSON snapshots."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision='0001';down_revision=None;branch_labels=None;depends_on=None

def upgrade():
    j=sa.JSON().with_variant(JSONB,'postgresql')
    op.create_table('projects',sa.Column('id',sa.String(),primary_key=True),sa.Column('name',sa.String(200),nullable=False),sa.Column('address',sa.String(500),nullable=False),sa.Column('created_at',sa.String(),nullable=False),sa.Column('measurement_seq',sa.Integer(),nullable=False),sa.Column('estimate_seq',sa.Integer(),nullable=False),sa.Column('current_run',sa.String()),sa.Column('data',j,nullable=False))
    op.create_table('documents',sa.Column('id',sa.String(),primary_key=True),sa.Column('project_id',sa.String(),sa.ForeignKey('projects.id'),nullable=False),sa.Column('filename',sa.String(),nullable=False),sa.Column('sha256',sa.String(64),nullable=False),sa.Column('size',sa.Integer(),nullable=False),sa.Column('storage_key',sa.String(),unique=True,nullable=False),sa.Column('created_at',sa.String(),nullable=False),sa.Column('data',j,nullable=False))
    op.create_table('extraction_runs',sa.Column('id',sa.String(),primary_key=True),sa.Column('project_id',sa.String(),sa.ForeignKey('projects.id'),nullable=False),sa.Column('document_id',sa.String(),sa.ForeignKey('documents.id'),nullable=False),sa.Column('status',sa.String(),nullable=False),sa.Column('quality',sa.String(),nullable=False),sa.Column('created_at',sa.String(),nullable=False),sa.Column('data',j,nullable=False),sa.Column('error',sa.String()))
    op.create_table('processing_jobs',sa.Column('id',sa.String(),primary_key=True),sa.Column('run_id',sa.String(),sa.ForeignKey('extraction_runs.id'),unique=True,nullable=False),sa.Column('state',sa.String(),nullable=False),sa.Column('attempts',sa.Integer(),nullable=False),sa.Column('lease_owner',sa.String()),sa.Column('lease_until',sa.String()),sa.Column('checkpoint',j,nullable=False))
    op.create_table('measurement_revisions',sa.Column('id',sa.String(),primary_key=True),sa.Column('project_id',sa.String(),sa.ForeignKey('projects.id'),nullable=False),sa.Column('seq',sa.Integer(),nullable=False),sa.Column('status',sa.String(),nullable=False),sa.Column('created_at',sa.String(),nullable=False),sa.Column('data',j,nullable=False),sa.UniqueConstraint('project_id','seq'))
    op.create_table('estimate_revisions',sa.Column('id',sa.String(),primary_key=True),sa.Column('project_id',sa.String(),sa.ForeignKey('projects.id'),nullable=False),sa.Column('measurement_id',sa.String(),sa.ForeignKey('measurement_revisions.id'),nullable=False),sa.Column('seq',sa.Integer(),nullable=False),sa.Column('status',sa.String(),nullable=False),sa.Column('created_at',sa.String(),nullable=False),sa.Column('data',j,nullable=False),sa.UniqueConstraint('project_id','seq'))
    op.create_table('audit_events',sa.Column('id',sa.String(),primary_key=True),sa.Column('project_id',sa.String(),sa.ForeignKey('projects.id')),sa.Column('action',sa.String(),nullable=False),sa.Column('created_at',sa.String(),nullable=False),sa.Column('data',j,nullable=False))
    op.create_table('idempotency_keys',sa.Column('key',sa.String(),primary_key=True),sa.Column('fingerprint',sa.String(),nullable=False),sa.Column('data',j,nullable=False))
    for table in ['documents','extraction_runs','measurement_revisions','estimate_revisions','audit_events']:op.create_index('ix_'+table+'_project_id',table,['project_id'])
    op.create_index('ix_processing_jobs_state','processing_jobs',['state']);op.create_index('ix_processing_jobs_lease_until','processing_jobs',['lease_until'])

def downgrade():
    raise RuntimeError('Destructive downgrade is disabled. Restore a reviewed backup instead.')
