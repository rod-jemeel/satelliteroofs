"""Explicit, ordered roof sections. Topmost enabled section owns each overlap."""
from decimal import Decimal as D
from typing import Literal
from pydantic import BaseModel,ConfigDict,Field,model_validator
from shapely.geometry import Polygon,GeometryCollection
from .outline import outline_area_ft2,spherical_area_ft2


class RoofSection(BaseModel):
    model_config=ConfigDict(extra='forbid')
    id:str=Field(min_length=1,max_length=100)
    name:str=Field(min_length=1,max_length=100)
    color:str|None=Field(default=None,pattern=r'^#[0-9a-fA-F]{6}$')
    outline:list[tuple[float,float]]=Field(min_length=4,max_length=501)
    pitch_rise:D=Field(default=D('6'),ge=0,le=18)
    enabled:bool=True
    include_covered:bool=False
    origin:Literal['mapbox_vector','user_drawn']|None=None

    @model_validator(mode='after')
    def valid_outline(self):
        if not self.name.strip():raise ValueError('Name each roof section.')
        outline_area_ft2(self.outline,minimum=10)
        return self


def geographic_area(geometry):
    if geometry.is_empty:return 0
    if geometry.geom_type=='Polygon':
        return max(0,spherical_area_ft2(geometry.exterior.coords)-sum(spherical_area_ft2(h.coords) for h in geometry.interiors))
    return sum(geographic_area(part) for part in getattr(geometry,'geoms',[]))


def measure_sections(sections):
    if len({s.id for s in sections})!=len(sections):raise ValueError('Roof section IDs must be unique.')
    covered=GeometryCollection();rows=[];surface=D('0')
    for section in sections:
        polygon=Polygon(section.outline)
        if not polygon.is_valid:raise ValueError('Correct the invalid roof section before calculating.')
        full=geographic_area(polygon)
        exposed=geographic_area(polygon.difference(covered)) if section.enabled else 0
        counted=(full if section.include_covered else exposed) if section.enabled else 0
        factor=(1+(section.pitch_rise/12)**2).sqrt()
        section_surface=D(str(counted))*factor
        surface+=section_surface
        rows.append(dict(id=section.id,name=section.name,outlined_ft2=f'{full:.2f}',exposed_ft2=f'{exposed:.2f}',
                         covered_ft2=f'{max(0,full-exposed) if section.enabled else 0:.2f}',counted_ft2=f'{counted:.2f}',
                         surface_ft2=str(section_surface.quantize(D('.01')))))
        if section.enabled:covered=covered.union(polygon)
    if covered.is_empty:raise ValueError('Include at least one valid roof section.')
    west,south,east,north=covered.bounds
    footprint=geographic_area(covered)
    if east-west>.05 or north-south>.05 or not 100<=footprint<=25000:
        raise ValueError('Included sections must form a local 100–25,000 ft² roof footprint.')
    return D(str(footprint)),surface,rows
