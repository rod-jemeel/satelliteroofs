"""Read-only NJOGIS parcel lookup; never used as roof measurements."""
import math
import httpx
from shapely.geometry import shape, Point

SOURCE = 'https://services2.arcgis.com/XVOqAjTOJ5P6ngMu/arcgis/rest/services/Parcels_Composite_NJ_WM/FeatureServer/0'
ATTRIBUTION = 'NJOGIS and county/municipal contributors'


def lookup(longitude, latitude):
    if not all(math.isfinite(v) for v in (longitude, latitude)):
        raise ValueError('Invalid map coordinates.')
    result = {'type': 'FeatureCollection', 'features': [], 'source_url': SOURCE,
              'attribution': ATTRIBUTION, 'message': '', 'coverage': 'New Jersey'}
    if not (-75.6 <= longitude <= -73.85 and 38.9 <= latitude <= 41.4):
        result['message'] = 'No parcel coverage is connected for this location. You can still select or trace its roof.'
        return result
    try:
        response = httpx.get(SOURCE + '/query', params={
            'f': 'geojson', 'geometry': f'{longitude},{latitude}',
            'geometryType': 'esriGeometryPoint', 'inSR': '4326',
            'spatialRel': 'esriSpatialRelIntersects', 'outSR': '4326',
            'outFields': 'PAMS_PIN,PCLBLOCK,PCLLOT,MUN_NAME,COUNTY',
            'returnGeometry': 'true', 'resultRecordCount': '8',
        }, timeout=12)
        response.raise_for_status()
        if len(response.content) > 4_000_000:
            raise ValueError('Parcel response exceeds limits')
        data = response.json()
        if data.get('error') or data.get('type') != 'FeatureCollection':
            raise ValueError('Invalid parcel response')
        for feature in data.get('features', [])[:8]:
            geometry = feature.get('geometry') or {}
            if geometry.get('type') not in ('Polygon', 'MultiPolygon'):
                continue
            polygon = shape(geometry)
            if polygon.is_empty or not polygon.is_valid or not polygon.covers(Point(longitude, latitude)):
                continue
            properties = feature.get('properties') or {}
            result['features'].append({'type': 'Feature', 'geometry': geometry,
                'properties': {key: str(properties.get(key) or '')[:100] for key in
                               ('PAMS_PIN', 'PCLBLOCK', 'PCLLOT', 'MUN_NAME', 'COUNTY')}})
    except Exception:
        raise ValueError('New Jersey parcel lookup is unavailable. Try again; your roof drawings are unchanged.') from None
    result['message'] = ('NJ parcel boundary · reference only, not a survey' if result['features'] else
                         'No parcel found here. Click inside a New Jersey lot rather than on a road.')
    return result
