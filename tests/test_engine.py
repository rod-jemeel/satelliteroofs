from decimal import Decimal
import pytest
from rr.estimates import calculate, packages, selling_price, stock_pieces
from rr.measurements import normalize


def measurements(**updates):
    values = dict(roof_area='2400', ridge_hip_length='140', eave_length='180', rake_length='120', valley_length='40', step_flashing_length='0', headwall_length='0', penetration_count='3', facet_pitch='6/12')
    result = {k: {'value': v, 'unit': 'ft2' if k == 'roof_area' else 'count' if k == 'penetration_count' else 'pitch' if k == 'facet_pitch' else 'ft', 'area_basis': 'sloped_surface', 'waste_included': False, 'review_status': 'accepted'} for k, v in values.items()}
    for k, v in updates.items():
        result[k].update(v)
    return result


def test_grouped_bundle_rounding():
    assert packages('2640', '100', '3', '1') == Decimal(80)
    assert packages('2640', '100', '3', '3') == Decimal(81)
    assert packages('0', '100', '3', '1') == 0

def test_zero_order_quantities_use_plain_decimal_strings():
    e=calculate(measurements(),{})
    assert next(x for x in e['lines'] if x['formula_id']=='step_flashing')['ordered_quantity']=='0'


def test_margin_is_not_markup():
    assert selling_price('10000', '0.30', 'margin') == Decimal('14285.71')
    assert selling_price('10000', '0.30', 'markup') == Decimal('13000.00')
    for value in ['1', '-0.1', 'NaN', 'Infinity']:
        with pytest.raises(ValueError): selling_price('100', value, 'margin')


def test_trace_and_labor_do_not_use_material_waste():
    e = calculate(measurements(), {'waste': '0.10', 'margin': '0.30'})
    shingle = next(x for x in e['lines'] if x['formula_id'] == 'field_shingles')
    labor = next(x for x in e['lines'] if x['formula_id'] == 'install_labor')
    assert shingle['ordered_quantity'] == '80'
    assert labor['ordered_quantity'] == '24'
    assert e['status'] == 'ready_for_review'
    assert shingle['inputs']['roof_area']['value'] == '2400'


def test_null_is_not_zero_and_scope_gaps_block_completeness():
    assert calculate(measurements(valley_length={'value': None}), {})['status'] == 'partial'
    assert calculate(measurements(valley_length={'value': '0'}), {})['status'] == 'ready_for_review'
    assert calculate(measurements(roof_area={'area_basis': 'unknown'}), {})['status'] == 'partial'
    assert calculate(measurements(), {'mixed_system': True})['status'] == 'partial'


def test_no_second_waste_or_pitch_multiplier():
    e = calculate(measurements(roof_area={'waste_included': True}), {'waste': '0.10'})
    assert next(x for x in e['lines'] if x['formula_id'] == 'field_shingles')['ordered_quantity'] == '72'
    assert calculate(measurements(roof_area={'area_basis': 'horizontal_footprint'}), {})['status'] == 'partial'


def test_waste_adjusted_area_cannot_establish_installed_labor_quantity():
    e=calculate(measurements(roof_area={'waste_included': True}), {'waste':'0.10'})
    assert e['status']=='partial'
    assert any(x['code']=='installed_area_missing' for x in e['issues'])
    assert not any(x['formula_id']=='install_labor' for x in e['lines'])


@pytest.mark.parametrize('raw,unit,value', [('12\' 6"', 'ft', '12.5'), ('1,234.5', 'ft2', '1234.5'), ('1/2', 'ft', '0.5'), ('10', 'm', '32.80839895013123359580052493'), ('6:12', 'pitch', '6/12')])
def test_unit_normalization(raw, unit, value):
    assert normalize(raw, unit) == value


@pytest.mark.parametrize('raw,unit', [('1,25','ft'), ('NaN','ft2'), ('-1','ft'), ('2','unknown')])
def test_ambiguous_or_unsafe_values_need_review(raw, unit):
    with pytest.raises(ValueError): normalize(raw, unit)


def test_stock_laps():
    assert stock_pieces('20', '10', '0.5') == 3
    with pytest.raises(ValueError): stock_pieces('20', '10', '10')
