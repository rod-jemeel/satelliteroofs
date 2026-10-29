import area from '@turf/area';
import kinks from '@turf/kinks';
import union from '@turf/union';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import type {Polygon,MultiPolygon} from 'geojson';

export type RoofSection={id:string;name:string;outline:number[][];pitch_rise:string;enabled:boolean;include_covered:boolean;color?:string;origin?:'mapbox_vector'|'user_drawn'};
const ROOF_COLORS=['#0866ff','#dc6803','#008577','#8549d8','#c43263','#527a16','#a33d25','#147aaf','#b44b99','#637013','#5447b7','#007e91','#c34c15','#6873cb','#9a5c16','#14894e','#a44e63','#517ab3','#765b27','#9a43ac','#38786d','#b2543d','#54646f','#8b6220'];
export function nextRoofColor(sections:RoofSection[]):string{return ROOF_COLORS.find(c=>!sections.some(s=>s.color?.toLowerCase()===c))||ROOF_COLORS[0]}
export function withRoofColors(sections:RoofSection[]):RoofSection[]{
 const assigned=new Map<string,string>(),used=new Set<string>();
 for(const s of sections){if(s.color&&/^#[0-9a-f]{6}$/i.test(s.color)&&!used.has(s.color.toLowerCase())){assigned.set(s.id,s.color.toLowerCase());used.add(s.color.toLowerCase())}}
 for(const s of sections.slice().sort((a,b)=>a.id.localeCompare(b.id))){if(!assigned.has(s.id)){const c=ROOF_COLORS.find(c=>!used.has(c))||ROOF_COLORS[0];assigned.set(s.id,c);used.add(c)}}
 return sections.map(s=>({...s,color:assigned.get(s.id)!}));
}
export type BuildingSelection={
 key:string;longitude:number;latitude:number;name:string;buildingType:string;heightMeters:number|null;
 footprintFt2:number|null;geometry:Polygon|MultiPolygon|null;areaBasis:'horizontal_footprint';verified:false;source?:'mapbox_vector'|'manual'|'user_drawn';
 sections?:RoofSection[];activeSectionId?:string;
 outlineImportError?:string;
};
type MapFeature={id?:string|number;source?:string;sourceLayer?:string;geometry?:unknown;properties?:Record<string,unknown>|null};

function validGeometry(value:unknown):value is Polygon|MultiPolygon{
 if(!value||typeof value!=='object')return false;
 const g=value as {type?:string;coordinates?:unknown};
 if(g.type!=='Polygon'&&g.type!=='MultiPolygon'||!Array.isArray(g.coordinates))return false;
 const polygons=g.type==='Polygon'?[g.coordinates]:g.coordinates;let count=0;
 return polygons.length>0&&polygons.every(p=>Array.isArray(p)&&p.length>0&&p.every(r=>{
  if(!Array.isArray(r)||r.length<4||r.length>10000)return false;
  const good=r.every(c=>Array.isArray(c)&&c.length>=2&&Number.isFinite(c[0])&&Number.isFinite(c[1])&&Math.abs(c[0])<=180&&Math.abs(c[1])<=85);
  count+=r.length;return good&&count<=10000&&r[0][0]===r.at(-1)[0]&&r[0][1]===r.at(-1)[1];
 }));
}

export function outlineSelection(feature:MapFeature,minimum=100):BuildingSelection{
 const geometry=validGeometry(feature.geometry)?feature.geometry:null;
 const points=geometry?.type==='Polygon'?geometry.coordinates[0]:[];
 const point=points.length?points.slice(0,-1).reduce((p,c)=>[p[0]+c[0]/(points.length-1),p[1]+c[1]/(points.length-1)],[0,0]):[NaN,NaN];
 const b=buildingSelection({...feature,properties:{type:'roof_outline',name:'Your roof outline'}},[point[0],point[1]]);
 const simple=geometry?.type==='Polygon'&&geometry.coordinates.length===1&&points.length<=501&&kinks(geometry).features.length===0;
 const size=geometry?area(geometry)*10.76391041671:NaN;
 return {...b,key:String(feature.id||'user-outline'),source:'user_drawn',footprintFt2:simple&&size>=minimum&&size<=25000?Math.round(size*100)/100:null};
}

export function sectionsFor(building:BuildingSelection|null):RoofSection[]{
 if(building?.sections)return building.sections;
 return building?.source==='user_drawn'&&building.geometry?.type==='Polygon'?[{id:building.key,name:'Roof section 1',outline:building.geometry.coordinates[0],pitch_rise:'6',enabled:true,include_covered:false}]:[];
}

export function editableBuildingSelection(building:BuildingSelection):BuildingSelection{
 if(building.sections||building.source==='user_drawn'||!building.geometry)return building;
 const polygons=building.geometry.type==='Polygon'?[building.geometry.coordinates]:building.geometry.coordinates;
 const unsupported=()=>({...building,outlineImportError:'This map footprint has holes, too many corners or unsupported geometry. Trace its roof sections manually.'});
 // A section has one simple ring. Never fill a courtyard or discard a separate part.
 if(!polygons.length||polygons.length>24||polygons.some(p=>p.length!==1||p[0].length>501))return unsupported();
 const sections:RoofSection[]=polygons.map((p,index)=>({id:`map-section-${index+1}`,name:`Roof section ${index+1}`,outline:p[0].map(c=>c.slice(0,2)),pitch_rise:'6',enabled:true,include_covered:false,origin:'mapbox_vector'}));
 const result=roofSelection(sections,sections[0].id,building.key);
 if(result.footprintFt2===null)return unsupported();
 return {...result,name:building.name,buildingType:building.buildingType,heightMeters:building.heightMeters,longitude:building.longitude,latitude:building.latitude};
}

export function roofSelection(sections:RoofSection[],activeId?:string,key?:string):BuildingSelection{
 sections=withRoofColors(sections);
 const active=sections.find(s=>s.id===activeId)||sections[0];
 const b=outlineSelection({id:active?.id,geometry:active?{type:'Polygon',coordinates:[active.outline]}:null},10);
 let footprintFt2:number|null=null;
 try{
  const valid=sections.length>0&&sections.length<=24&&new Set(sections.map(s=>s.id)).size===sections.length&&sections.every(s=>s.name.trim()&&s.pitch_rise.trim()!==''&&Number.isFinite(Number(s.pitch_rise))&&Number(s.pitch_rise)>=0&&Number(s.pitch_rise)<=18&&outlineSelection({geometry:{type:'Polygon',coordinates:[s.outline]}},10).footprintFt2!==null);
  const features=sections.filter(s=>s.enabled).map(s=>({type:'Feature' as const,properties:{},geometry:{type:'Polygon' as const,coordinates:[s.outline]}}));
  if(valid&&features.length){const geometry=features.length===1?features[0]:union({type:'FeatureCollection',features});const size=geometry?area(geometry)*10.76391041671:0;if(size>=100&&size<=25000)footprintFt2=Math.round(size*100)/100;}
 }catch{}
 return {...b,key:key||'roof-'+(sections[0]?.id||'draft'),name:sections.length>1?'Your roof sections':'Your roof outline',sections,activeSectionId:active?.id,footprintFt2};
}

export function focusBuilding(features:MapFeature[],point:[number,number]):BuildingSelection|null{
 const matches=features.filter(f=>f.properties?.type!=='building:part'&&validGeometry(f.geometry)&&booleanPointInPolygon(point,f.geometry));
 const feature=matches.sort((a,b)=>area(a.geometry as Polygon)-area(b.geometry as Polygon))[0];
 return feature?buildingSelection(feature,point):null;
}

export function translateGeometry(geometry:Polygon|MultiPolygon,longitude:number,latitude:number):Polygon|MultiPolygon|null{
 if(!Number.isFinite(longitude)||!Number.isFinite(latitude))return null;
 const ring=(points:number[][])=>points.map(p=>[p[0]+longitude,p[1]+latitude,...p.slice(2)]);
 const moved=geometry.type==='Polygon'?{type:'Polygon' as const,coordinates:geometry.coordinates.map(ring)}:{type:'MultiPolygon' as const,coordinates:geometry.coordinates.map(p=>p.map(ring))};
 return validGeometry(moved)?moved:null;
}

export function buildingSelection(feature:MapFeature,point:[number,number]):BuildingSelection{
 const p=feature.properties||{},buildingType=String(p.type||'building').slice(0,80);
 const geometry=validGeometry(feature.geometry)?feature.geometry:null;
 let footprintFt2:number|null=null;
 if(geometry&&buildingType!=='building:part'){
  const value=area(geometry)*10.76391041671;
  if(Number.isFinite(value)&&value>=100&&value<=25000)footprintFt2=Math.round(value*100)/100;
 }
 const first=geometry?JSON.stringify(geometry.type==='Polygon'?geometry.coordinates[0]?.[0]:geometry.coordinates[0]?.[0]?.[0]):point.join(',');
 const rawHeight=p.height;
 return {key:[feature.source,feature.sourceLayer,feature.id,first].join(':'),longitude:point[0],latitude:point[1],
  name:String(p.name_en||p.name||'Selected building').slice(0,200),buildingType,
  heightMeters:rawHeight!==undefined&&rawHeight!==null&&Number.isFinite(Number(rawHeight))&&Number(rawHeight)>=0?Number(rawHeight):null,
  footprintFt2,geometry,areaBasis:'horizontal_footprint',verified:false};
}
