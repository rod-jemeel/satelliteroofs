import pytest
from pathlib import Path
from rr.documents import inspect_pdf

def test_native_fixture_has_real_evidence_and_exact_totals():
    result=inspect_pdf(Path('fixtures/demo-roof-report.pdf'))
    assert result['support']=='tested_synthetic_v1'
    area=next(x for x in result['observations'] if x['field']=='roof_area')
    assert area['value']=='2400'
    assert area['evidence'][0]['token_ids']
    assert area['evidence'][0]['page_number']==1
    assert all(0<=v<=1 for v in area['evidence'][0]['bbox_normalized'])
    assert len([x for x in result['observations'] if x['field']=='roof_area'])==1

def test_scanned_report_is_partial_without_invented_values():
    result=inspect_pdf(Path('fixtures/scanned-report.pdf'))
    assert result['quality']=='partial'
    assert any(x['code']=='scan_needs_review' for x in result['issues'])

def test_crop_rotation_contract():
    r=inspect_pdf(Path('fixtures/rotated-cropped.pdf'))
    assert r['pages'][0]['rotation']==90
    assert r['observations']
    assert all(0<=v<=1 for o in r['observations'] for e in o['evidence'] for v in e['bbox_normalized'])

def test_multiple_structure_report_never_assumes_one_total():
    r=inspect_pdf(Path('fixtures/multiple-structures.pdf'))
    assert r['quality']=='partial'
    assert any(x['code']=='multiple_structures' for x in r['issues'])
    assert all(o['quality']=='conflicting' for o in r['observations'] if o['field']=='roof_area')

def test_corrupt_and_encrypted_pdf_rejected(tmp_path):
    p=tmp_path/'bad.pdf';p.write_bytes(b'%PDF-not-a-report')
    with pytest.raises(ValueError): inspect_pdf(p)
    with pytest.raises(ValueError, match='encrypted|unlock'): inspect_pdf(Path('fixtures/encrypted.pdf'))
