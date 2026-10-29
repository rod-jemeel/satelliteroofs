'use client';
import {useEffect,useRef,useState,type ReactNode} from 'react';
import type mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { Map, MapPin, RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type {Location} from '@/lib/types';
import {buildingSelection,focusBuilding,translateGeometry,type BuildingSelection} from '@/lib/buildings';
import type {Feature,FeatureCollection,Polygon,MultiPolygon} from 'geojson';
import RoofDrawControl from '@/components/RoofDrawControl';
import MapToolDock from '@/components/MapToolDock';
export type MapCamera={longitude:number;latitude:number;request:number;zoom?:number};
export default function MapCanvas({parcel,token,location,style,picking,onPick,camera,onSettings,onReady,onStreet,selectedBuilding,onBuilding,onOutlineStart,onOutline,onDrawing,focus,tools,drawRequest,onDrawRequestHandled,pickLabel,selectingBuilding=false,onViewChange}:{
 parcel?:FeatureCollection|null;tools:ReactNode;onViewChange?:(position:{longitude:number;latitude:number})=>void;drawRequest?:number;onDrawRequestHandled?:()=>void;pickLabel?:string;selectingBuilding?:boolean;
 token:string;location:Location|null;style:'satellite'|'street';picking:boolean;focus?:MapCamera;
 onPick:(p:Location)=>void;camera?:MapCamera;onSettings:()=>void;onReady:(ready:boolean)=>void;onStreet:()=>void;selectedBuilding:BuildingSelection|null;onBuilding:(b:BuildingSelection)=>void;onOutlineStart:(kind:'new'|'edit')=>void;onOutline:(b:BuildingSelection|null,finished:boolean)=>void;onDrawing:(active:boolean)=>void;
}){
 const container=useRef<HTMLDivElement>(null),map=useRef<mapboxgl.Map|null>(null),marker=useRef<mapboxgl.Marker|null>(null);
 const callbacks=useRef({picking,onPick,onReady,location,onBuilding,selectedBuilding,camera,focus,selectingBuilding,onViewChange});callbacks.current={picking,onPick,onReady,location,onBuilding,selectedBuilding,camera,focus,selectingBuilding,onViewChange};
 const focusSignature=useRef(''),[focusKind,setFocusKind]=useState<'point'|'building'|'adjusted'>('point');
 const focusGeometry=useRef<Polygon|MultiPolygon|null>(null),adjustedFocus=useRef<{request:number;geometry:Polygon|MultiPolygon}|null>(null),focusDragging=useRef(false),ignoreClickUntil=useRef(0);
 const [toolbarHost,setToolbarHost]=useState<HTMLDivElement|null>(null);
 const cameraRequest=useRef<number|undefined>(undefined);
 const hovered=useRef<BuildingSelection|null>(null);
 const drawingActive=useRef(false),[loadedMap,setLoadedMap]=useState<mapboxgl.Map|null>(null),[outlineActive,setOutlineActive]=useState(false);
 function paintSelection(){const m=map.current,source=m?.getSource('roofready-building-selection') as mapboxgl.GeoJSONSource|undefined;if(!source)return;const features:Feature[]=[];for(const [kind,b] of [['selected',callbacks.current.selectedBuilding],['hover',hovered.current]] as const)if(b?.geometry&&b.source!=='user_drawn'&&!(kind==='hover'&&b.key===callbacks.current.selectedBuilding?.key))features.push({type:'Feature',properties:{kind},geometry:b.geometry});source.setData({type:'FeatureCollection',features} as FeatureCollection)}
 const [error,setError]=useState(''),[retry,setRetry]=useState(0),[rateLimited,setRateLimited]=useState(false);
 const lastView=useRef<{center:[number,number];zoom:number}|null>(null);
 function paintFocus(){
  const m=map.current,f=callbacks.current.focus;if(!m)return;
  const source=m.getSource('roofready-property-focus') as mapboxgl.GeoJSONSource|undefined;if(!source)return;
  if(!f){focusGeometry.current=null;adjustedFocus.current=null;if(focusSignature.current){focusSignature.current='';source.setData({type:'FeatureCollection',features:[]})}return;}
  let building:BuildingSelection|null=null;
  try{if(m.getSource('roofready-context'))building=focusBuilding(m.querySourceFeatures('roofready-context',{sourceLayer:'building'}),[f.longitude,f.latitude])}catch{}
  const override=adjustedFocus.current?.request===f.request?adjustedFocus.current.geometry:null;
  const geometry=override||building?.geometry||{type:'Point' as const,coordinates:[f.longitude,f.latitude]};
  focusGeometry.current=geometry.type==='Polygon'||geometry.type==='MultiPolygon'?geometry:null;
  const signature=JSON.stringify([f.request,geometry]);if(signature===focusSignature.current)return;
  focusSignature.current=signature;setFocusKind(override?'adjusted':building?'building':'point');source.setData({type:'Feature',properties:{},geometry});
 }
 function prepareFocus(){
  const m=map.current;if(!m||(!callbacks.current.focus&&!callbacks.current.selectingBuilding)||!m.isStyleLoaded())return;
  if(!m.getSource('roofready-context')){m.addSource('roofready-context',{type:'vector',url:'mapbox://mapbox.mapbox-streets-v8'});m.addLayer({id:'roofready-context-buildings',type:'fill',source:'roofready-context','source-layer':'building',paint:{'fill-opacity':0}})}
  if(!callbacks.current.focus)return;
  if(!m.getSource('roofready-property-focus')){
   m.addSource('roofready-property-focus',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
   m.addLayer({id:'roofready-focus-fill',type:'fill',source:'roofready-property-focus',filter:['==',['geometry-type'],'Polygon'],paint:{'fill-color':'#0866ff','fill-opacity':.08}},'roofready-building-fill');
   m.addLayer({id:'roofready-focus-edge',type:'line',source:'roofready-property-focus',filter:['==',['geometry-type'],'Polygon'],paint:{'line-color':'#0866ff','line-width':2,'line-dasharray':[3,2]}},'roofready-building-fill');
   m.addLayer({id:'roofready-focus-point',type:'circle',source:'roofready-property-focus',filter:['==',['geometry-type'],'Point'],paint:{'circle-radius':14,'circle-color':'#0866ff','circle-opacity':.12,'circle-stroke-color':'#0866ff','circle-stroke-width':2}},'roofready-building-fill');
  }
  paintFocus();
 }
 useEffect(()=>{
  if(!token||!container.current)return;let alive=true;let failed=false;let m:mapboxgl.Map|undefined;
  setError('');setRateLimited(false);onReady(false);
  import('mapbox-gl').then(({default:lib})=>{
   if(!alive||!container.current)return;
   const point=callbacks.current.location;
   const pending=callbacks.current.camera?.request!==cameraRequest.current?callbacks.current.camera:undefined;
   m=new lib.Map({container:container.current,accessToken:token,style:style==='satellite'?'mapbox://styles/mapbox/satellite-streets-v12':'mapbox://styles/mapbox/streets-v12',center:pending?[pending.longitude,pending.latitude]:lastView.current?.center||(point?[point.longitude,point.latitude]:[-97.7623,30.2818]),zoom:pending?(pending.zoom??18):lastView.current?.zoom||(point?18:17),attributionControl:false,logoPosition:'bottom-right',preserveDrawingBuffer:true});
   if(pending)cameraRequest.current=pending.request;
   map.current=m;
   const publishView=()=>{const p=m!.getCenter();callbacks.current.onViewChange?.({longitude:p.lng,latitude:p.lat})};publishView();m.on('moveend',publishView);
   focusSignature.current='';m.on('idle',()=>{prepareFocus();paintFocus()});
   m.addControl(new lib.AttributionControl({compact:true}),'bottom-right');
   m.on('load',()=>{if(alive&&m){m.addSource('roofready-building-selection',{type:'geojson',data:{type:'FeatureCollection',features:[]}});m.addLayer({id:'roofready-building-fill',type:'fill',source:'roofready-building-selection',paint:{'fill-color':'#0866ff','fill-opacity':['case',['==',['get','kind'],'selected'],.22,.10]}});m.addLayer({id:'roofready-building-outline',type:'line',source:'roofready-building-selection',paint:{'line-color':'#0866ff','line-width':['case',['==',['get','kind'],'selected'],2.5,1.5]}});paintSelection();setLoadedMap(m);callbacks.current.onReady(!failed)}});
   m.on('error',e=>{if(!alive)return;failed=true;const status=(e.error as Error&{status?:number}).status;callbacks.current.onReady(false);if(status===429){setRateLimited(true);setError(style==='satellite'?'Satellite imagery is unavailable: Mapbox returned HTTP 429. Wait for the limit to reset or check your Mapbox usage limits.':'Mapbox is rate-limiting this map. Try again after the limit resets.');}else if(status===401||status===403)setError('Mapbox could not authorize this map. Check the token and its allowed URL.');else setError('Some map tiles could not load. Check the connection or reload the map.');});
   const hit=(p:mapboxgl.PointLike)=>m!.queryRenderedFeatures(p).find(f=>f.sourceLayer==='building'&&(f.geometry.type==='Polygon'||f.geometry.type==='MultiPolygon')&&f.properties?.underground!=='true'&&f.properties?.type!=='building:part');
   m.on('mousemove',e=>{if(drawingActive.current||focusDragging.current)return;if(callbacks.current.picking){m!.getCanvas().style.cursor='crosshair';return;}const f=hit(e.point),next=f?buildingSelection(f,[e.lngLat.lng,e.lngLat.lat]):null;m!.getCanvas().style.cursor=next?'pointer':'';if(next?.key!==hovered.current?.key){hovered.current=next;paintSelection()}});
   m.getCanvas().addEventListener('mouseleave',()=>{hovered.current=null;paintSelection()});
   m.on('click',e=>{if(drawingActive.current||focusDragging.current||Date.now()<ignoreClickUntil.current||m!.queryRenderedFeatures(e.point).some(f=>f.source?.startsWith('mapbox-gl-draw')))return;if(callbacks.current.picking){callbacks.current.onPick({longitude:e.lngLat.lng,latitude:e.lngLat.lat,provider:'manual',storage_basis:'user_supplied',label:'Manually selected property',confirmed:false,accuracy:'user_selected'});return;}const f=hit(e.point);if(f)callbacks.current.onBuilding(buildingSelection(f,[e.lngLat.lng,e.lngLat.lat]));});
   const current=callbacks.current.location;
   if(current){const mk=new lib.Marker({draggable:true,color:'#0866ff'}).setLngLat([current.longitude,current.latitude]).addTo(m);marker.current=mk;mk.on('dragend',()=>{const p=mk.getLngLat();callbacks.current.onPick({longitude:p.lng,latitude:p.lat,provider:'manual',storage_basis:'user_supplied',label:'Manually selected property',confirmed:false,accuracy:'user_selected'})});}
  }).catch(()=>{if(alive)setError('The map could not start. Reload it or check the connection in Settings.');});
  return()=>{alive=false;setLoadedMap(null);if(m){const c=m.getCenter();lastView.current={center:[c.lng,c.lat],zoom:m.getZoom()};}marker.current?.remove();marker.current=null;m?.remove();map.current=null};
 },[token,style,retry]);
 useEffect(()=>{prepareFocus();paintFocus()},[focus?.request,loadedMap,selectingBuilding]);
 useEffect(()=>{
  const m=loadedMap;if(!m||!focus)return;
  let start:{longitude:number;latitude:number;geometry:Polygon|MultiPolygon;pan:boolean;moved:boolean}|null=null;
  const allowed=()=>!drawingActive.current&&!callbacks.current.picking&&callbacks.current.selectedBuilding?.source!=='user_drawn';
  const begin=(event:mapboxgl.MapMouseEvent|mapboxgl.MapTouchEvent)=>{if(!allowed()||!focusGeometry.current||('lngLats' in event&&event.lngLats.length!==1))return;const p='lngLats' in event?event.lngLats[0]:event.lngLat;if(!p)return;event.preventDefault();start={longitude:p.lng,latitude:p.lat,geometry:focusGeometry.current,pan:m.dragPan.isEnabled(),moved:false};focusDragging.current=true;m.dragPan.disable();m.getCanvas().style.cursor='grabbing';hovered.current=null;paintSelection()};
  const move=(event:mapboxgl.MapMouseEvent|mapboxgl.MapTouchEvent)=>{if(!start)return;if('lngLats' in event&&event.lngLats.length!==1){finish();return;}const p='lngLats' in event?event.lngLats[0]:event.lngLat;if(!p)return;const dx=p.lng-start.longitude,dy=p.lat-start.latitude;if(Math.abs(dx)+Math.abs(dy)<1e-8)return;const geometry=translateGeometry(start.geometry,dx,dy);if(!geometry)return;start.moved=true;adjustedFocus.current={request:focus.request,geometry};paintFocus();m.getCanvas().style.cursor='grabbing'};
  const finish=()=>{if(!start)return;if(start.pan)m.dragPan.enable();if(start.moved)ignoreClickUntil.current=Date.now()+400;start=null;focusDragging.current=false;m.getCanvas().style.cursor=allowed()?'grab':''};
  const enter=()=>{if(allowed()&&!start)m.getCanvas().style.cursor='grab'};
  m.on('mousedown','roofready-focus-fill',begin);m.on('touchstart','roofready-focus-fill',begin);m.on('mousemove',move);m.on('touchmove',move);m.on('mouseup',finish);m.on('touchend',finish);m.on('mouseenter','roofready-focus-fill',enter);m.on('mousemove','roofready-focus-fill',enter);window.addEventListener('mouseup',finish);window.addEventListener('touchend',finish);
  return()=>{finish();m.off('mousedown','roofready-focus-fill',begin);m.off('touchstart','roofready-focus-fill',begin);m.off('mousemove',move);m.off('touchmove',move);m.off('mouseup',finish);m.off('touchend',finish);m.off('mouseenter','roofready-focus-fill',enter);m.off('mousemove','roofready-focus-fill',enter);window.removeEventListener('mouseup',finish);window.removeEventListener('touchend',finish)};
 },[loadedMap,focus?.request]);
 useEffect(()=>{const m=loadedMap;if(!m||!m.isStyleLoaded())return;const source=m.getSource('satelliteroofs-parcel') as mapboxgl.GeoJSONSource|undefined;const data=parcel||{type:'FeatureCollection' as const,features:[]};if(source)source.setData(data);else{m.addSource('satelliteroofs-parcel',{type:'geojson',data});m.addLayer({id:'satelliteroofs-parcel-fill',type:'fill',source:'satelliteroofs-parcel',paint:{'fill-color':'#10b981','fill-opacity':.10}},'roofready-building-fill');m.addLayer({id:'satelliteroofs-parcel-line',type:'line',source:'satelliteroofs-parcel',paint:{'line-color':'#059669','line-width':3}},'roofready-building-fill')}},[loadedMap,parcel]);
 useEffect(()=>{paintSelection()},[selectedBuilding?.key,selectedBuilding?.geometry]);
 useEffect(()=>{const m=map.current;if(m)m.getCanvas().style.cursor=picking?'crosshair':'';},[picking]);
 useEffect(()=>{
  const m=map.current;if(!location){marker.current?.remove();marker.current=null;return;}if(!m)return;let alive=true;
  import('mapbox-gl').then(({default:lib})=>{if(!alive)return;if(marker.current)marker.current.setLngLat([location.longitude,location.latitude]);else{const mk=new lib.Marker({draggable:true,color:'#0866ff'}).setLngLat([location.longitude,location.latitude]).addTo(m);marker.current=mk;mk.on('dragend',()=>{const p=mk.getLngLat();callbacks.current.onPick({longitude:p.lng,latitude:p.lat,provider:'manual',storage_basis:'user_supplied',label:'Manually selected property',confirmed:false,accuracy:'user_selected'})});}});
  return()=>{alive=false};
 },[location?.latitude,location?.longitude,token,retry,style]);
 useEffect(()=>{const m=map.current;if(camera&&m&&cameraRequest.current!==camera.request){cameraRequest.current=camera.request;m.flyTo({center:[camera.longitude,camera.latitude],zoom:camera.zoom??18,duration:matchMedia('(prefers-reduced-motion: reduce)').matches?0:800})}},[camera?.request]);
 return <div className="map-stage" data-testid="map-stage" data-selected-building={selectedBuilding?.geometry?selectedBuilding.key:undefined} aria-label="Full-screen property map">
  <div ref={container} className="map-surface"/>
  {loadedMap&&<RoofDrawControl drawRequest={drawRequest} onDrawRequestHandled={onDrawRequestHandled} toolbarHost={toolbarHost} map={loadedMap} selected={selectedBuilding} onStart={onOutlineStart} onChange={onOutline} onMode={active=>{drawingActive.current=active;setOutlineActive(active);onDrawing(active);if(active){hovered.current=null;paintSelection()}}}/>}
  <MapToolDock map={loadedMap} drawing={outlineActive} onHost={setToolbarHost}>{tools}</MapToolDock>
  {!token&&<div className="map-connection-state"><Map/><h2>Connect your property map</h2><p>Add a Mapbox token to explore the property. Your reports and estimates are ready to use.</p><Button onClick={onSettings}>Connect Mapbox</Button></div>}
  {error&&<div className="map-error" role="alert"><span>{error}</span><Button variant="outline" size="sm" disabled={outlineActive} onClick={()=>setRetry(v=>v+1)}><RotateCw data-icon="inline-start"/>Retry</Button>{rateLimited&&style==='satellite'&&<Button variant="outline" size="sm" disabled={outlineActive} onClick={onStreet}>Street view</Button>}</div>}
  {picking&&<div className="map-pick-instruction"><MapPin/>{pickLabel||'Click the correct building to place its pin'}</div>}
  {focus&&(!selectedBuilding||focusKind==='adjusted')&&<div className="map-focus-note" data-budget={!!selectedBuilding} data-testid="property-focus" data-focus-kind={focusKind}><span>{focusKind==='adjusted'?'Adjusted building focus · not a lot boundary':focusKind==='building'?'Drag building focus · not a lot boundary':'Address location · lot boundary unavailable'}</span>{focusKind==='adjusted'&&<Button variant="ghost" size="sm" aria-label="Reset building focus" onClick={()=>{adjustedFocus.current=null;focusSignature.current='';paintFocus()}}>Reset</Button>}</div>}
 </div>
}
