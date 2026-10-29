"""Canonical units; ambiguous representations fail instead of guessing."""
from decimal import Decimal, InvalidOperation
import re

FIELDS = {
    'roof_area': ('Roof surface area', 'ft2'), 'ridge_length': ('Ridge', 'ft'),
    'hip_length': ('Hip', 'ft'), 'ridge_hip_length': ('Ridge + hip', 'ft'),
    'valley_length': ('Valley', 'ft'), 'eave_length': ('Eaves', 'ft'),
    'rake_length': ('Rakes', 'ft'), 'step_flashing_length': ('Step flashing', 'ft'),
    'headwall_length': ('Headwall flashing', 'ft'), 'penetration_count': ('Pipe penetrations', 'count'),
    'facet_pitch': ('Reported pitch', 'pitch'),
}

def number(raw):
    try: value = Decimal(str(raw))
    except (InvalidOperation, TypeError): raise ValueError('Enter a valid decimal number')
    if not value.is_finite() or value < 0 or value > Decimal('100000000'):
        raise ValueError('Quantity must be finite, nonnegative and within limits')
    return value

def text(value):
    formatted=format(value,'f')
    return formatted.rstrip('0').rstrip('.') if '.' in formatted else formatted

def normalize(raw: str, unit: str) -> str:
    raw = str(raw).strip()
    if unit == 'pitch':
        m = re.fullmatch(r'(\d+(?:\.\d+)?)\s*[:/]\s*(\d+(?:\.\d+)?)', raw)
        if not m or number(m[2]) == 0: raise ValueError('Pitch requires rise/run')
        return f'{text(number(m[1]))}/{text(number(m[2]))}'
    if unit not in ('ft', 'ft2', 'count', 'm', 'm2', 'in', 'square'):
        raise ValueError('Unsupported unit')
    feet = re.fullmatch(r'(\d+)\s*\'\s*(\d+(?:\.\d+)?)\s*"?', raw)
    if feet and unit == 'ft':
        if number(feet[2]) >= 12: raise ValueError('Inches must be below 12')
        value = number(feet[1]) + number(feet[2]) / 12
    else:
        if ',' in raw:
            if not re.fullmatch(r'\d{1,3}(,\d{3})+(\.\d+)?', raw): raise ValueError('Ambiguous decimal separator')
            raw = raw.replace(',', '')
        fraction = re.fullmatch(r'(?:(\d+)\s+)?(\d+)/(\d+)', raw)
        if fraction:
            if number(fraction[3]) == 0: raise ValueError('Invalid fraction')
            value = number(fraction[1] or '0') + number(fraction[2])/number(fraction[3])
        else: value = number(raw)
    if unit == 'm': value /= Decimal('0.3048')
    if unit == 'm2': value /= Decimal('0.09290304')
    if unit == 'in': value /= 12
    if unit == 'square': value *= 100
    if unit == 'count' and value != value.to_integral_value(): raise ValueError('Count must be a whole number')
    return text(value)
