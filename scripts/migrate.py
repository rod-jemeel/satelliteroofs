"""Migrate, or safely baseline the exact initial schema of an early local run."""
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'services/api'))
from sqlalchemy import inspect
from alembic.config import Config
from alembic import command
from alembic.migration import MigrationContext
from alembic.autogenerate import compare_metadata
from rr.db import engine,Base

config=Config(str(Path(__file__).resolve().parents[1]/'alembic.ini'))
with engine.connect() as connection:
    tables=inspect(connection).get_table_names()
    if 'projects' in tables and 'alembic_version' not in tables:
        differences=compare_metadata(MigrationContext.configure(connection),Base.metadata)
        if differences:raise RuntimeError('Existing unversioned schema differs from the initial model. Back up and review migration differences; no changes were applied.')
        command.stamp(config,'0001')
command.upgrade(config,'head')
print('Database schema is current (0001).')
