"""Preliminary scenarios only; never supplies verified takeoff quantities."""
from decimal import Decimal, ROUND_FLOOR, ROUND_CEILING, ROUND_HALF_UP
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, model_validator
from .outline import outline_area_ft2
from .roof_sections import RoofSection,measure_sections
from .price_research import PricingBasis,pricing

D = Decimal


class BudgetInputs(BaseModel):
    model_config = ConfigDict(extra='forbid')
    footprint_ft2: Decimal = Field(ge=100, le=25000)
    pitch_rise: Decimal = Field(default=D('6'), ge=0, le=18)
    overhang_percent: Decimal = Field(default=D('5'), ge=0, le=25)
    rate_low: Decimal = Field(default=D('4.50'), ge=D('0.50'), le=100)
    rate_high: Decimal = Field(default=D('7.50'), ge=D('0.50'), le=100)
    uncertainty_percent: Decimal = Field(default=D('15'), ge=0, le=50)
    extra_cost: Decimal = Field(default=D('0'), ge=0, le=100000)
    rates_source: Literal['demo', 'custom'] = 'demo'
    roof_sections: list[RoofSection] | None = Field(default=None,min_length=1,max_length=24)
    pricing_basis: PricingBasis | None = None

    @model_validator(mode='after')
    def ordered_rates(self):
        if self.rate_high < self.rate_low:
            raise ValueError('The upper rate must be at least the lower rate.')
        if self.roof_sections is not None:
            footprint,_,_=measure_sections(self.roof_sections)
            self.footprint_ft2=footprint.quantize(D('1'),rounding=ROUND_HALF_UP)
        if self.pricing_basis is not None:
            proposal=pricing(self.pricing_basis)
            if self.rates_source!='custom' or self.rate_low!=D(proposal['rate_low']) or self.rate_high!=D(proposal['rate_high']):
                raise ValueError('Reviewed material research must match the composed installed rates. Clear the research basis before entering manual rates.')
        return self


class BudgetAddress(BaseModel):
    model_config = ConfigDict(extra='forbid')
    price_location: str = Field(default='',max_length=100)
    accuracy: str = Field(default='unknown',max_length=40)
    distance_m: int | None = Field(default=None,ge=0,le=100)
    storage_basis: Literal['permanent_geocoding','user_supplied']
    confirmed: Literal[True]

class BudgetSave(BaseModel):
    model_config = ConfigDict(extra='forbid')
    name: str = Field(min_length=1, max_length=200)
    address: str = Field(default='', max_length=500)
    address_details: BudgetAddress | None = None
    latitude: float = Field(ge=-85, le=85)
    longitude: float = Field(ge=-180, le=180)
    footprint_source: Literal['mapbox_vector', 'manual', 'user_drawn']
    user_outline: list[tuple[float,float]] | None = Field(default=None,max_length=501)
    building_name: str = Field(default='', max_length=200)
    building_type: str = Field(default='building', max_length=80)
    reviewed: Literal[True]
    inputs: BudgetInputs

    @model_validator(mode='after')
    def validate_outline(self):
        if self.footprint_source=='user_drawn':
            if self.inputs.roof_sections:
                corners=[p for s in self.inputs.roof_sections if s.enabled for p in s.outline[:-1]]
                # Sections are authoritative; a legacy single outline is only retained for a one-section save.
                if self.user_outline is not None and (len(self.inputs.roof_sections)!=1 or self.user_outline!=self.inputs.roof_sections[0].outline):
                    raise ValueError('The legacy outline must match the single roof section.')
            else:
                if self.user_outline is None:raise ValueError('A user-drawn budget needs its closed outline.')
                area=outline_area_ft2(self.user_outline)
                self.inputs.footprint_ft2=D(str(area)).quantize(D('1'),rounding=ROUND_HALF_UP)
                corners=self.user_outline[:-1]
            self.longitude=sum(p[0] for p in corners)/len(corners)
            self.latitude=sum(p[1] for p in corners)/len(corners)
        elif self.user_outline is not None or self.inputs.roof_sections is not None:
            raise ValueError('Only user-drawn outlines can be retained with a budget.')
        return self


def calculate_budget(c: BudgetInputs):
    factor = (1 + (c.pitch_rise / 12) ** 2).sqrt()
    roof_area = c.footprint_ft2 * (1 + c.overhang_percent / 100) * factor
    section_rows=None
    if c.roof_sections:
        footprint,surface,section_rows=measure_sections(c.roof_sections)
        roof_area=surface*(1+c.overhang_percent/100)
        factor=surface/footprint
    lower = (roof_area * c.rate_low + c.extra_cost) * (1 - c.uncertainty_percent / 100)
    upper = (roof_area * c.rate_high + c.extra_cost) * (1 + c.uncertainty_percent / 100)
    result=dict(
        status='preliminary', formula_version='roof-sections-1.0' if c.roof_sections else 'footprint-budget-1.0', approval_allowed=False,
        currency='USD', inputs=c.model_dump(mode='json'),
        roof_area_ft2=str(roof_area.quantize(D('.01'))),
        pitch_factor=str(factor.quantize(D('.000001'))),
        low=str((lower / 100).to_integral_value(rounding=ROUND_FLOOR) * 100),
        high=str((upper / 100).to_integral_value(rounding=ROUND_CEILING) * 100),
        assumptions=[
            f'{"Demo rates: fictional prices" if c.rates_source == "demo" else "User-entered rates"}; not a supplier quote.',
            f'Uniform {c.pitch_rise}/12 pitch and {c.overhang_percent}% horizontal area allowance are assumptions, not detected roof attributes.',
            'Basic asphalt replacement scenario. Per-surface-square-foot rates include labor, materials and material waste allowances.',
            f'Range uses a user-configured {c.uncertainty_percent}% scenario allowance, not a statistical confidence interval.',
            'Range bounds are rounded outwards to the nearest $100. No tax is included.',
        ],
        exclusions=['Measured ridges, hips, valleys, eaves and flashing quantities.',
                    'Deck repair, structural damage, permits, code upgrades, complex access and non-shingle systems unless included in the rates or extra costs.',
                    'Property ownership, verified address and imagery capture date are not supplied by this preview.'],
        trace='Footprint × (1 + area allowance) × sqrt(1 + (pitch rise / 12)²); apply rate range and extra costs, then scenario allowance.',
    )
    if section_rows is not None:
        result['sections']=section_rows
        result['assumptions'][1]='Section pitches and top-to-bottom order are user assumptions. Higher enabled sections cover lower sections; covered lower areas are excluded unless explicitly included.'
        result['trace']='For each enabled section, subtract higher sections unless covered area is explicitly included; multiply counted horizontal area by its own pitch factor; sum surfaces, then apply the shared area/pricing/scenario allowances.'
    if c.pricing_basis is not None:
        result['material_pricing']=pricing(c.pricing_basis)
        result['assumptions'][0]='Reviewed AI material research plus user-entered labor and other rates. Source prices, pack coverage, waste and location still require supplier confirmation.'
    return result
