"""Pure deterministic engine. All catalog coverage/prices below are fictional."""
from copy import deepcopy
from decimal import Decimal, ROUND_CEILING, ROUND_HALF_UP
from .measurements import number, text

D = Decimal
VERSION = 'asphalt-demo-1.0'
CATALOG = [
    dict(sku='DEMO-SH30', name='Architectural field shingles', formula_id='field_shingles', unit='bundle', coverage='100', packages_per_group='3', increment='1', price='38.50', basis='ft2'),
    dict(sku='DEMO-UL10', name='Synthetic underlayment', formula_id='underlayment', unit='roll', coverage='900', packages_per_group='1', increment='1', price='89.00', basis='ft2'),
    dict(sku='DEMO-CAP', name='Ridge & hip cap', formula_id='ridge_cap', unit='bundle', coverage='25', packages_per_group='1', increment='1', price='65.00', basis='ft'),
    dict(sku='DEMO-START', name='Starter strip', formula_id='starter', unit='bundle', coverage='100', packages_per_group='1', increment='1', price='48.00', basis='ft'),
    dict(sku='DEMO-EDGE', name='Drip edge • aggregate allowance', formula_id='drip_edge', unit='piece', coverage='9.5', packages_per_group='1', increment='1', price='12.50', basis='ft'),
    dict(sku='DEMO-VAL', name='Closed-valley membrane', formula_id='valley_membrane', unit='roll', coverage='60', packages_per_group='1', increment='1', price='96.00', basis='ft'),
    dict(sku='DEMO-STEP', name='Step flashing', formula_id='step_flashing', unit='piece', coverage='0.4166666666666666666666666667', packages_per_group='1', increment='1', price='2.20', basis='ft'),
    dict(sku='DEMO-WALL', name='Headwall flashing', formula_id='headwall_flashing', unit='piece', coverage='9.5', packages_per_group='1', increment='1', price='22.00', basis='ft'),
    dict(sku='DEMO-BOOT', name='Pipe boots', formula_id='penetrations', unit='each', coverage='1', packages_per_group='1', increment='1', price='24.00', basis='count'),
]
for p in CATALOG:
    p.update(spec_version='demo-1', source='Fictional demonstration specification; not manufacturer data', review_date='2026-10-25', system='asphalt_shingle', coverage_basis='effective_installed')

def money(v): return number(v).quantize(D('.01'), rounding=ROUND_HALF_UP)

def packages(demand, coverage, group='1', increment='1'):
    demand, coverage, group, increment = map(number, (demand, coverage, group, increment))
    if min(coverage, group, increment) <= 0: raise ValueError('Coverage and purchase increments must be positive')
    return (demand*group/coverage/increment).to_integral_value(rounding=ROUND_CEILING)*increment

def stock_pieces(length, stock, overlap):
    length, stock, overlap = map(number, (length, stock, overlap))
    if stock <= overlap: raise ValueError('Overlap must be shorter than stock')
    return max(1, int(((length-overlap)/(stock-overlap)).to_integral_value(rounding=ROUND_CEILING))) if length else 0

def selling_price(cost, rate, mode='margin'):
    cost, rate = map(number, (cost, rate))
    if mode not in ('margin', 'markup'): raise ValueError('Unknown pricing mode')
    if mode == 'margin' and rate >= 1: raise ValueError('Gross margin must be below 100%')
    return money(cost/(1-rate) if mode == 'margin' else cost*(1+rate))

def calculate(measurements: dict, config: dict) -> dict:
    m, c = deepcopy(measurements), deepcopy(config)
    waste = number(c.get('waste', '0.10')); margin = number(c.get('margin', '0.30'))
    if waste > 1: raise ValueError('Waste must be between 0 and 100%')
    selling_price('0', margin, c.get('pricing_mode', 'margin'))
    lines, issues = [], []
    def gap(code, message):
        if not any(x['code'] == code for x in issues): issues.append(dict(code=code, message=message, severity='required'))
    def value(key):
        entry = m.get(key, {})
        if entry.get('value') is None:
            gap('missing_'+key, f'{key.replace("_", " ").capitalize()} needs a reviewed value, including explicit zero if absent.')
            return None
        return number(entry['value'])
    area = value('roof_area')
    if m.get('roof_area', {}).get('area_basis') != 'sloped_surface':
        gap('area_basis', 'Confirm sloped surface area. Footprint conversion requires verified per-facet areas and pitches.'); area = None
    eave, rake, valley = value('eave_length'), value('rake_length'), value('valley_length')
    cap = number(m['ridge_hip_length']['value']) if m.get('ridge_hip_length', {}).get('value') is not None else None
    cap_keys = ['ridge_hip_length']
    if cap is None:
        ridge, hip = value('ridge_length'), value('hip_length')
        cap = ridge + hip if ridge is not None and hip is not None else None
        cap_keys = ['ridge_length', 'hip_length']
    if c.get('mixed_system'): gap('mixed_system', 'Non-shingle sections are excluded and unpriced. Provide separately reviewed scope before finalization.')
    if c.get('ice_barrier', 'not_required_reviewed') == 'required':
        width = c.get('ice_width')
        if width is None: gap('ice_width', 'Ice barrier requires a human-approved treatment width.')
    if c.get('ice_barrier', 'not_required_reviewed') == 'unreviewed': gap('ice_rule', 'Review whether ice barrier is required; no jurisdiction has been inferred.')
    def line(product, demand, keys, explanation, unit_price=None, kind='material', round_packages=True):
        if demand is None: return
        p = deepcopy(product)
        override = c.get('overrides', {}).get(p['sku'], {})
        if override and not str(override.get('reason', '')).strip(): raise ValueError('Overrides require a reason')
        price = number(override.get('price', unit_price or p['price']))
        ordered = packages(demand, p['coverage'], p['packages_per_group'], c.get('bundle_increment', p['increment']) if p['formula_id']=='field_shingles' else p['increment']) if round_packages else demand
        if override.get('quantity') is not None: ordered = number(override['quantity'])
        cost = money(ordered*price)
        lines.append(dict(sku=p['sku'], name=p['name'], kind=kind, formula_id=p['formula_id'], formula_version=VERSION, unit=p['unit'], demand=text(demand), ordered_quantity=text(ordered), unit_price=str(money(price)), line_cost=str(cost), surplus=text(max(D(0), ordered*number(p['coverage'])/number(p['packages_per_group'])-demand)) if round_packages else '0', inputs={k:m.get(k) for k in keys}, product=p, rate_snapshot=str(price), rounding='Aggregate by SKU, ceil purchase increment; charged line HALF_UP cents' if round_packages else 'Installed quantity, no material waste; HALF_UP cents', explanation=explanation, override=override or None))
    demand = area * (1 if m.get('roof_area', {}).get('waste_included') else 1+waste) if area is not None else None
    if m.get('roof_area', {}).get('waste_included'):
        gap('installed_area_missing','The source area includes waste. It can size field shingles, but does not establish base installed area for underlayment and labor. Review a separate base-area source.')
        area=None
    line(CATALOG[0], demand, ['roof_area'], f'Surface area × {text(1+waste)} waste factor, unless the source already includes waste. 3 bundles / 100 ft²; round once by SKU.')
    line(CATALOG[1], area, ['roof_area'], 'One layer; 900 ft² effective coverage per roll, with laps already reflected.')
    line(CATALOG[2], cap * D('1.05') if cap is not None else None, cap_keys, 'Unique combined ridge and hip length × 1.05 / 25 ft per bundle. Does not establish ridge-vent demand.')
    edges = eave+rake if eave is not None and rake is not None else None
    line(CATALOG[3], edges, ['eave_length','rake_length'], 'Starter on eaves and rakes / 100 ft per bundle.')
    line(CATALOG[4], edges, ['eave_length','rake_length'], 'Aggregate ordering allowance: edge length / 9.5 ft effective stock. No exact cut plan or corner count is claimed.')
    line(CATALOG[5], valley, ['valley_length'], 'Closed-valley membrane / 60 effective linear ft per roll.')
    line(CATALOG[6], value('step_flashing_length'), ['step_flashing_length'], 'Reviewed step flashing length / demo 5-inch exposure per piece.')
    line(CATALOG[7], value('headwall_length'), ['headwall_length'], 'Reviewed headwall length / 9.5 ft effective stock.')
    line(CATALOG[8], value('penetration_count'), ['penetration_count'], 'One compatible demonstration boot per reviewed penetration.')
    if c.get('ice_barrier') == 'required' and c.get('ice_width') is not None:
        p=dict(CATALOG[1], sku='DEMO-ICE', name='Ice barrier', formula_id='ice_barrier', coverage='180', price='110')
        line(p, eave*number(c['ice_width']) if eave is not None else None, ['eave_length'], 'Eave length × approved slope treatment width / 180 ft² effective roll.')
    labor=dict(CATALOG[0], sku='LAB-INSTALL', name='Shingle installation labor', formula_id='install_labor', unit='square', price=c.get('labor_rate','95'))
    line(labor, area/100 if area is not None else None, ['roof_area'], 'Installed area / 100 × agreed rate per square. Material waste is excluded.', kind='labor', round_packages=False)
    tear=dict(labor, sku='LAB-TEAR', name='Tear-off and disposal labor', formula_id='tearoff_labor', price=c.get('tearoff_rate','35'))
    line(tear, area/100 if area is not None else None, ['roof_area'], 'Installed area / 100 × tear-off rate; single layer and ordinary access assumed.', kind='labor', round_packages=False)
    material=sum((D(x['line_cost']) for x in lines if x['kind']=='material'),D(0)); labor_cost=sum((D(x['line_cost']) for x in lines if x['kind']=='labor'),D(0))
    other=money(c.get('other_cost','350')); cost=material+labor_cost+other
    sell=selling_price(cost,margin,c.get('pricing_mode','margin')); tax_rate=number(c.get('tax_rate','0'))
    if tax_rate > 1: raise ValueError('Tax rate exceeds 100%')
    tax=money(sell*tax_rate); profit=sell-cost
    return dict(status='partial' if issues else 'ready_for_review', currency='USD', assembly_version=VERSION, catalog_snapshot=deepcopy(CATALOG), lines=lines, issues=issues, measurements=m, config=c, material_cost=str(money(material)), labor_cost=str(money(labor_cost)), other_cost=str(other), direct_cost=str(money(cost)), selling_price=str(sell), tax=str(tax), total=str(sell+tax), gross_profit=str(money(profit)), actual_margin=text(profit/sell if sell else D(0)), assumptions=['Demo data: fictional products and pricing.', 'One asphalt shingle system; ordinary single-story access and one tear-off layer.', 'Tax is explicitly configured; zero is a demo setting, not tax advice.', 'Drip edge uses an aggregate allowance; installation cut plan and corners require review.'], exclusions=['Deck replacement, permits and unforeseen damage unless included in other direct costs.', 'Ridge ventilation and non-shingle systems are not priced by this assembly.'])
