import httpx
import math
import re
from .config import read_settings

def browse(address):
    """Temporary geocoding for the current map view, never project storage."""
    address=address.strip()
    if len(address)<3 or len(address)>256 or ';' in address or len(re.findall(r'\w+',address))>20:
        raise ValueError('Enter a street address of 3–256 characters, with at most 20 words and no semicolons.')
    token=read_settings().get('map_token','')
    if not token:raise ValueError('Add your public Mapbox token in Settings to search addresses.')
    try:
        response=httpx.get('https://api.mapbox.com/search/geocode/v6/forward',params={'q':address,'access_token':token,'permanent':'false','autocomplete':'false','types':'address','limit':5},timeout=12)
    except httpx.RequestError:
        raise ValueError('Mapbox address search could not connect. Try again shortly.') from None
    if response.status_code==429:raise ValueError('Mapbox address search is rate-limited. Try again later.')
    if response.status_code in (401,403):raise ValueError('Mapbox could not authorize address search. Check the token in Settings.')
    if response.status_code!=200:raise ValueError('Mapbox address search is unavailable. Try again shortly.')
    try:
        features=response.json().get('features',[])
        if not isinstance(features,list):raise ValueError()
    except (ValueError,AttributeError):
        raise ValueError('Mapbox returned an unreadable address response. Try again shortly.') from None
    matches=[]
    for feature in features[:5]:
        try:
            geometry=feature['geometry'];coordinates=geometry['coordinates'];properties=feature['properties']
            if geometry['type']!='Point' or len(coordinates)!=2 or any(isinstance(v,bool) for v in coordinates):continue
            longitude,latitude=map(float,coordinates)
            if not math.isfinite(longitude) or not math.isfinite(latitude) or not -180<=longitude<=180 or not -85<=latitude<=85:continue
            label=str(properties.get('full_address') or properties.get('name') or '').strip()[:500]
            if not label:continue
            accuracy=str((properties.get('coordinates') or {}).get('accuracy') or 'unknown')[:40]
            matches.append(dict(label=label,longitude=longitude,latitude=latitude,accuracy=accuracy))
        except (KeyError,TypeError,ValueError,AttributeError):continue
    return matches

def search(address):
    # Deliberately no provider call, even with a legacy enabled setting.
    raise ValueError('Permanent geocoding is disabled to avoid its charges. Use the top map search and place a property pin manually.')

SEARCHBOX='https://api.mapbox.com/search/searchbox/v1'

def reverse(longitude,latitude):
    """Nearby address candidates, never an ownership or exact-building assertion."""
    settings=read_settings();token=settings.get('map_token','')
    if not token:raise ValueError('Add your public Mapbox token in Settings to look up a roof address.')
    try:
        response=httpx.get('https://api.mapbox.com/search/geocode/v6/reverse',params={
            'longitude':longitude,'latitude':latitude,'access_token':token,'types':'address',
            'limit':5,'language':'en','permanent':'false'},timeout=12)
    except httpx.RequestError:raise ValueError('Roof address lookup could not connect. Retry or enter the address manually.') from None
    if response.status_code==429:raise ValueError('Mapbox address lookup is rate-limited. Retry later or enter the address manually.')
    if response.status_code!=200:raise ValueError('Mapbox address lookup is unavailable. Check your token and account access in Settings.')
    try:
        features=response.json().get('features',[])
        if not isinstance(features,list):raise ValueError()
    except (ValueError,AttributeError):raise ValueError('Mapbox returned an unreadable address response.') from None
    results=[];seen=set()
    for feature in features[:5]:
        try:
            geometry=feature['geometry'];coords=geometry['coordinates'];p=feature['properties']
            if geometry['type']!='Point' or len(coords)!=2 or any(isinstance(c,bool) for c in coords) or p.get('feature_type')!='address':continue
            lng,lat=map(float,coords)
            if not all(map(math.isfinite,(lng,lat))) or abs(lng)>180 or abs(lat)>85:continue
            dlat=math.radians(lat-latitude);dlng=math.radians(lng-longitude)
            a=math.sin(dlat/2)**2+math.cos(math.radians(latitude))*math.cos(math.radians(lat))*math.sin(dlng/2)**2
            distance=round(6371008.8*2*math.asin(math.sqrt(min(1,a))))
            label=str(p.get('full_address') or '').strip()[:500]
            if not label or label in seen or distance>100:continue
            context=p.get('context') or {}
            city=(context.get('place') or context.get('locality') or {}).get('name','')
            region=context.get('region') or {};region=region.get('region_code') or region.get('name','')
            postcode=(context.get('postcode') or {}).get('name','')
            price_location=', '.join(x for x in (str(city), ' '.join(str(x) for x in (region,postcode) if x)) if x)[:100]
            results.append(dict(label=label,longitude=lng,latitude=lat,accuracy=str((p.get('coordinates') or {}).get('accuracy') or 'unknown')[:40],
                distance_m=distance,price_location=price_location,storage_basis='temporary',confirmed=False))
            seen.add(label)
        except (KeyError,TypeError,ValueError,AttributeError):continue
    return sorted(results,key=lambda r:r['distance_m'])

def searchbox_request(path,params):
    token=read_settings().get('map_token','')
    if not token:raise ValueError('Add your public Mapbox token in Settings to search places.')
    try:response=httpx.get(SEARCHBOX+path,params={**params,'access_token':token},timeout=12)
    except httpx.RequestError:raise ValueError('Mapbox search could not connect. Try again shortly.') from None
    if response.status_code==429:raise ValueError('Mapbox search is rate-limited. Try again later.')
    if response.status_code in (401,403):raise ValueError('Mapbox could not authorize Search Box. Check the saved token and account access.')
    if response.status_code!=200:raise ValueError('Mapbox search is unavailable. Try again shortly.')
    try:
        data=response.json()
        if not isinstance(data,dict):raise ValueError()
        return data
    except (ValueError,TypeError):raise ValueError('Mapbox returned an unreadable search response.') from None

def searchbox_label(properties):
    return str(properties.get('full_address') or ', '.join(str(properties.get(k) or '').strip() for k in ('name','place_formatted') if properties.get(k))).strip()[:500]

def suggest(query,session_token,proximity=None):
    query=query.strip()
    if len(query)<3 or ';' in query:raise ValueError('Enter at least three characters for an address or place.')
    params={'q':query,'session_token':str(session_token),'limit':5,'language':'en','types':'address,street,place,locality,neighborhood,postcode,region,country,poi'}
    if proximity:params['proximity']=f'{proximity.longitude},{proximity.latitude}'
    data=searchbox_request('/suggest',params);results=[]
    suggestions=data.get('suggestions',[])
    if not isinstance(suggestions,list):raise ValueError('Mapbox returned unreadable suggestions.')
    for item in suggestions[:5]:
        if not isinstance(item,dict):continue
        id=item.get('mapbox_id');label=searchbox_label(item)
        if not isinstance(id,str) or not re.fullmatch(r'[A-Za-z0-9_:=\-]{1,500}',id) or not label:continue
        results.append({'mapbox_id':id,'label':label,'feature_type':str(item.get('feature_type') or 'address')[:40]})
    return results

def retrieve(mapbox_id,session_token):
    from urllib.parse import quote
    data=searchbox_request('/retrieve/'+quote(mapbox_id,safe=''),{'session_token':str(session_token)})
    features=data.get('features',[])
    if not isinstance(features,list):raise ValueError('Mapbox returned unreadable location details.')
    for feature in features:
        try:
            geometry=feature['geometry'];coordinates=geometry['coordinates'];properties=feature['properties']
            if geometry['type']!='Point' or len(coordinates)!=2 or any(isinstance(v,bool) for v in coordinates):continue
            longitude,latitude=map(float,coordinates)
            if not math.isfinite(longitude) or not math.isfinite(latitude) or not -180<=longitude<=180 or not -85<=latitude<=85:continue
            label=searchbox_label(properties)
            if not label:continue
            return {'label':label,'longitude':longitude,'latitude':latitude,'accuracy':str((properties.get('coordinates') or {}).get('accuracy') or 'unknown')[:40],'feature_type':str(properties.get('feature_type') or 'address')[:40]}
        except (KeyError,ValueError,TypeError,AttributeError):continue
    raise ValueError('Mapbox did not return a usable location for this suggestion. Choose another result.')
