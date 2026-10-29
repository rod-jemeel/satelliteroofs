'use client';
import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import ToolButton from '@/components/MapToolButton';
import type {Map,ExpressionSpecification} from 'mapbox-gl';
import type Draw from '@mapbox/mapbox-gl-draw';
import type {FeatureCollection,Feature} from 'geojson';
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css';
import {Check,MousePointer2,Pentagon,Plus,Trash2,X} from 'lucide-react';
import {roofSelection,sectionsFor,withRoofColors,nextRoofColor,type BuildingSelection,type RoofSection} from '@/lib/buildings';

const styles=[
 {id:'roof-polygon',type:'fill',filter:['==','$type','Polygon'],paint:{'fill-color':['coalesce',['get','user_color'],'#0866ff'],'fill-opacity':['case',['==',['get','user_enabled'],false],.03,.12]}},
 {id:'roof-line-casing',type:'line',filter:['any',['==','$type','LineString'],['==','$type','Polygon']],paint:{'line-color':'#fff','line-width':5}},
 {id:'roof-lines',type:'line',filter:['any',['==','$type','LineString'],['==','$type','Polygon']],paint:{'line-color':['coalesce',['get','user_color'],'#0866ff'],'line-width':2.5}},
 {id:'roof-vertices',type:'circle',filter:['all',['==','$type','Point'],['==','meta','vertex']],paint:{'circle-color':'#fff','circle-radius':6,'circle-stroke-color':'#0866ff','circle-stroke-width':2}},
 {id:'roof-midpoints',type:'circle',filter:['all',['==','$type','Point'],['==','meta','midpoint']],paint:{'circle-color':'#0866ff','circle-radius':4,'circle-stroke-color':'#fff','circle-stroke-width':1.5}},
];
function featuresFor(building:BuildingSelection|null):FeatureCollection{return {type:'FeatureCollection',features:withRoofColors(sectionsFor(building)).slice().reverse().map(s=>({type:'Feature',id:s.id,properties:{enabled:s.enabled,name:s.name,color:s.color},geometry:{type:'Polygon',coordinates:[s.outline]}}))}}
export default function RoofDrawControl({map,selected,onStart,onChange,onMode,toolbarHost,drawRequest=0,onDrawRequestHandled}:{toolbarHost:HTMLElement|null;map:Map;selected:BuildingSelection|null;onStart:(kind:'new'|'edit')=>void;onChange:(b:BuildingSelection|null,finished:boolean)=>void;onMode:(active:boolean)=>void;drawRequest?:number;onDrawRequestHandled?:()=>void}){
 const draw=useRef<Draw|null>(null),callbacks=useRef({selected,onStart,onChange,onMode});callbacks.current={selected,onStart,onChange,onMode};
 const [ready,setReady]=useState(false),[mode,setMode]=useState<'idle'|'draw'|'edit'>('idle'),[count,setCount]=useState(0),[problem,setProblem]=useState('');
 const [draftColor,setDraftColor]=useState<string|null>(null);
 const modeRef=useRef(mode),operation=useRef<'new'|'add'|'edit'>('new'),before=useRef<BuildingSelection|null>(null),activeId=useRef(''),rotation=useRef({drag:true,touch:true,keyboard:true});
 function changeMode(next:'idle'|'draw'|'edit'){modeRef.current=next;setMode(next);callbacks.current.onMode(next!=='idle')}
 function restore(){if(draw.current&&modeRef.current==='idle')draw.current.set(featuresFor(callbacks.current.selected))}
 function publish(sections:RoofSection[],id:string,finished:boolean,key?:string){const b=roofSelection(sections,id,key);setProblem(b.footprintFt2===null?'Use roof sections with no crossed edges, valid pitches and a combined 100–25,000 ft² footprint.':'');callbacks.current.onChange(b,finished)}
 function topDown(){map.stop();map.jumpTo({pitch:0,bearing:0,zoom:Math.max(18,map.getZoom())});rotation.current={drag:map.dragRotate.isEnabled(),touch:map.touchPitch.isEnabled(),keyboard:map.keyboard.isEnabled()};map.dragRotate.disable();map.touchPitch.disable();map.keyboard.disable()}
 function restoreNavigation(){if(rotation.current.drag)map.dragRotate.enable();if(rotation.current.touch)map.touchPitch.enable();if(rotation.current.keyboard)map.keyboard.enable()}
 function update(feature:Feature,finished:boolean){if(feature.geometry.type!=='Polygon')return;const b=callbacks.current.selected,sections=sectionsFor(b);publish(sections.map(s=>s.id===String(feature.id)?{...s,outline:feature.geometry.type==='Polygon'?feature.geometry.coordinates[0]:s.outline}:s),String(feature.id),finished,b?.key)}
 useEffect(()=>{let alive=true;let control:Draw|undefined;
  const created=(e:{features:Feature[]})=>{if(!alive)return;const feature=e.features[0];changeMode('idle');restoreNavigation();if(!feature||feature.geometry.type!=='Polygon')return;const old=operation.current==='add'?sectionsFor(before.current):[];const n=Math.max(0,...old.map(s=>Number(s.name.match(/^Roof section (\d+)$/)?.[1])||0))+1;const id=String(feature.id);setDraftColor(null);const section={id,color:nextRoofColor(old),name:`Roof section ${n}`,outline:feature.geometry.coordinates[0],pitch_rise:old.find(s=>s.id===before.current?.activeSectionId)?.pitch_rise||'6',enabled:true,include_covered:false};publish([section,...old],id,true,operation.current==='add'?before.current?.key:id)};
  const updated=(e:{features:Feature[]})=>{if(alive&&e.features[0])update(e.features[0],false)};
  const deleted=(e:{features:Feature[]})=>{if(!alive)return;const ids=new Set(e.features.map(f=>String(f.id)));const old=callbacks.current.selected,remaining=sectionsFor(old).filter(s=>!ids.has(s.id));changeMode('idle');restoreNavigation();setProblem('');if(remaining.length)publish(remaining,remaining[0].id,true,old?.key);else callbacks.current.onChange(null,true)};
  const render=()=>{if(modeRef.current!=='draw'||!control)return;const old=new Set(operation.current==='add'?sectionsFor(before.current).map(s=>s.id):[]);const f=control.getAll().features.find(f=>!old.has(String(f.id)));const n=f?.geometry.type==='Polygon'?Math.max(0,f.geometry.coordinates[0].length-2):0;setCount(previous=>previous===n?previous:n)};
  const changed=(e:{mode:string})=>{if(alive&&e.mode==='simple_select'&&modeRef.current!=='idle'){changeMode('idle');restoreNavigation()}};
  const selectedFeature=(e:{features:Feature[]})=>{if(!alive||modeRef.current!=='idle'||!e.features[0])return;const b=callbacks.current.selected,id=String(e.features[0].id);if(sectionsFor(b).some(s=>s.id===id)&&b?.activeSectionId!==id)publish(sectionsFor(b),id,false,b?.key)};
  import('@mapbox/mapbox-gl-draw').then(({default:Constructor})=>{if(!alive)return;control=new Constructor({displayControlsDefault:false,controls:{},styles,userProperties:true,touchBuffer:14,clickBuffer:2});draw.current=control;map.addControl(control);map.on('draw.create',created);map.on('draw.update',updated);map.on('draw.delete',deleted);map.on('draw.render',render);map.on('draw.modechange',changed);map.on('draw.selectionchange',selectedFeature);restore();setReady(true)});
  return()=>{alive=false;callbacks.current.onMode(false);if(control){map.off('draw.create',created);map.off('draw.update',updated);map.off('draw.delete',deleted);map.off('draw.render',render);map.off('draw.modechange',changed);map.off('draw.selectionchange',selectedFeature);try{map.removeControl(control)}catch{}}draw.current=null;restoreNavigation()};
 },[map]);
 useEffect(()=>{restore()},[selected?.key,selected?.sections,selected?.activeSectionId,ready]);
 useEffect(()=>{
  if(!map.getStyle())return;
  const sections=withRoofColors(sectionsFor(selected)),color=draftColor||sections.find(s=>s.id===selected?.activeSectionId)?.color||sections[0]?.color||'#0866ff';
  for(const suffix of ['cold','hot']){
   const paints:Array<[string,'fill-color'|'line-color'|'circle-stroke-color'|'circle-color',string|ExpressionSpecification]>=[['roof-polygon','fill-color',['coalesce',['get','user_color'],color]],['roof-lines','line-color',['coalesce',['get','user_color'],color]],['roof-vertices','circle-stroke-color',color],['roof-midpoints','circle-color',color]];
   for(const [id,property,value] of paints){
    if(map.getLayer(`${id}.${suffix}`))map.setPaintProperty(`${id}.${suffix}`,property,value);
   }
  }
 },[map,ready,selected?.activeSectionId,selected?.sections,draftColor]);
 function start(kind:'new'|'add'='new'){if(!draw.current)return;before.current=callbacks.current.selected;operation.current=kind;setDraftColor(nextRoofColor(kind==='add'?sectionsFor(callbacks.current.selected):[]));callbacks.current.onStart(kind==='new'?'new':'edit');setProblem('');topDown();changeMode('draw');setCount(0);if(kind==='new')draw.current.deleteAll();draw.current.changeMode('draw_polygon')}
 function edit(){if(!draw.current||!selected)return;setDraftColor(null);before.current=selected;operation.current='edit';const active=sectionsFor(selected).find(s=>s.id===selected.activeSectionId)||sectionsFor(selected)[0];if(!active)return;activeId.current=active.id;callbacks.current.onStart('edit');topDown();if(map.getCanvas().clientWidth<768){const points=active.outline;map.fitBounds([[Math.min(...points.map(p=>p[0])),Math.min(...points.map(p=>p[1]))],[Math.max(...points.map(p=>p[0])),Math.max(...points.map(p=>p[1]))]],{padding:{top:320,bottom:240,left:32,right:32},maxZoom:20,duration:0})}changeMode('edit');draw.current.changeMode('direct_select',{featureId:active.id})}
 function finish(){const d=draw.current;if(!d)return;if(modeRef.current==='draw'){d.changeMode('simple_select');return;}const feature=d.get(activeId.current);d.changeMode('simple_select');changeMode('idle');restoreNavigation();if(feature)update(feature,true)}
 function cancel(){setDraftColor(null);const d=draw.current;if(!d)return;d.deleteAll();d.changeMode('simple_select');changeMode('idle');restoreNavigation();setProblem('');d.set(featuresFor(before.current));callbacks.current.onChange(before.current,true)}
 function remove(){const sections=sectionsFor(selected),remaining=sections.filter(s=>s.id!==(selected?.activeSectionId||sections[0]?.id));if(remaining.length)publish(remaining,remaining[0].id,true,selected?.key);else{draw.current?.deleteAll();callbacks.current.onChange(null,true);setProblem('')}}
 useEffect(()=>{if(ready&&drawRequest&&modeRef.current==='idle'){onDrawRequestHandled?.();start()}},[ready,drawRequest]);
 const hasSections=sectionsFor(selected).length>0;
 return <>
  {mode!=='idle'&&<div className="roof-draw-instruction" role="status"><strong>{mode==='draw'?`Place roof corners · ${count} points`:'Drag corners to adjust the outline'}</strong><span>{mode==='draw'?'Trace one roof plane or level, then close the outline.':'Drag a midpoint to add a corner. Choose Done when finished.'} Top-down area; pitch is assumed.</span></div>}
  {toolbarHost&&createPortal(<div className="roof-draw-toolbar" aria-label="Roof outline tools">
   {mode==='idle'?<><ToolButton label="Draw roof outline" disabled={!ready} onClick={()=>start()}><Pentagon/></ToolButton>{hasSections&&<><ToolButton label="Add roof section" disabled={sectionsFor(selected).length>=24} onClick={()=>start('add')}><Plus/></ToolButton><ToolButton label="Edit outline points" onClick={edit}><MousePointer2/></ToolButton><ToolButton label={sectionsFor(selected).length>1?'Delete selected roof section':'Delete roof outline'} onClick={remove}><Trash2/></ToolButton></>}</>:<><ToolButton label={mode==='draw'?'Close outline':'Done editing outline'} disabled={mode==='draw'&&count<3} onClick={finish}><Check/></ToolButton><ToolButton label="Cancel outline" onClick={cancel}><X/></ToolButton></>}

  </div>,toolbarHost)}
  {problem&&<div className="roof-draw-error" role="alert">{problem}</div>}
 </>;
}
