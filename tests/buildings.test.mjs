import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as buildings from '../apps/web/lib/buildings.ts';
import {buildingSelection,outlineSelection,roofSelection,focusBuilding,translateGeometry,withRoofColors,nextRoofColor} from '../apps/web/lib/buildings.ts';

const rectangle={type:'Polygon',coordinates:[[[0,0],[.000179864,0],[.000179864,.000089932],[0,.000089932],[0,0]]]};

test('a selected map footprint becomes its own editable section with provenance and stable identity',()=>{
 const original=buildingSelection({id:77,geometry:rectangle,properties:{name:'Test roof',type:'house',height:8}},[.00008,.00004]);
 const b=buildings.editableBuildingSelection(original);
 assert.equal(b.key,original.key);assert.equal(b.name,'Test roof');assert.equal(b.heightMeters,8);
 assert.equal(b.source,'user_drawn');assert.equal(b.sections.length,1);assert.equal(b.activeSectionId,b.sections[0].id);
 assert.equal(b.sections[0].name,'Roof section 1');assert.equal(b.sections[0].origin,'mapbox_vector');
 assert.deepEqual(b.sections[0].outline,rectangle.coordinates[0]);assert.equal(b.verified,false);
 b.sections[0].outline[0][0]=.00001;
 assert.equal(original.geometry.coordinates[0][0][0],0,'editing a section must not mutate the provider feature');
});

test('disconnected map polygons become separate sections; holes and invalid outlines are never silently filled',()=>{
 const second=rectangle.coordinates[0].map(([x,y])=>[x+.001,y]);
 const original=buildingSelection({id:8,geometry:{type:'MultiPolygon',coordinates:[rectangle.coordinates,[second]]}},[0,0]);
 assert.equal(buildings.editableBuildingSelection(original).sections.length,2);
 const hole=rectangle.coordinates[0].map(([x,y])=>[x*.5,y*.5]);
 const courtyard=buildings.editableBuildingSelection(buildingSelection({geometry:{type:'Polygon',coordinates:[rectangle.coordinates[0],hole]}},[0,0]));
 assert.equal(courtyard.sections,undefined);assert.ok(courtyard.outlineImportError);
 assert.equal(buildings.editableBuildingSelection(buildingSelection({},[0,0])).sections,undefined);
});
test('a user outline keeps its editable identity and rejects crossed edges',()=>{
 const outline=outlineSelection({id:'my-roof',type:'Feature',geometry:rectangle,properties:{}});
 assert.equal(outline.source,'user_drawn');assert.equal(outline.key,'my-roof');
 assert.ok(Math.abs(outline.footprintFt2-2152.78)<1);
 const crossed={type:'Polygon',coordinates:[[[0,0],[.0002,.0001],[0,.0001],[.0002,0],[0,0]]]};
 assert.equal(outlineSelection({id:'bad',geometry:crossed}).footprintFt2,null);
});
test('a map footprint is approximate horizontal area and never a measured roof',()=>{
 const b=buildingSelection({id:42,geometry:rectangle,properties:{type:'house',height:7}},[.00008,.00004]);
 assert.ok(Math.abs(b.footprintFt2-2152.78)<1);
 assert.equal(b.buildingType,'house');assert.equal(b.heightMeters,7);
 assert.equal(b.areaBasis,'horizontal_footprint');assert.equal(b.verified,false);
});
test('unsupported parts, open/invalid rings and non-polygons have no automatic budget area',()=>{
 for(const feature of [
  {geometry:rectangle,properties:{type:'building:part'}},
  {geometry:{type:'Point',coordinates:[0,0]},properties:{}},
  {geometry:{type:'Polygon',coordinates:[[[0,0],[1,0],[1,1]]]},properties:{}},
  {geometry:{type:'Polygon',coordinates:[[[0,0],[180,0],[180,89],[0,0]]]},properties:{}},
 ])assert.equal(buildingSelection(feature,[0,0]).footprintFt2,null);
});
test('holes reduce footprint area and multipolygons retain separate parts',()=>{
 const cutout=rectangle.coordinates[0].map(([x,y])=>[x*.5,y*.5]);
 const full=buildingSelection({geometry:rectangle},[0,0]).footprintFt2;
 const hole=buildingSelection({geometry:{type:'Polygon',coordinates:[rectangle.coordinates[0],cutout]}},[0,0]);
 assert.ok(Math.abs(hole.footprintFt2-full*.75)<1);
 const multi=buildingSelection({geometry:{type:'MultiPolygon',coordinates:[rectangle.coordinates,rectangle.coordinates]}},[0,0]);
 assert.ok(Math.abs(multi.footprintFt2-full*2)<1);
});


test('roof sections have one union footprint and retain their own pitch/order',()=>{
 const low={id:'low',name:'Lower roof',outline:rectangle.coordinates[0],pitch_rise:'0',enabled:true,include_covered:false};
 const high={...low,id:'high',name:'Upper roof',outline:rectangle.coordinates[0].map(([x,y])=>[x*.5,y]),pitch_rise:'12'};
 const b=roofSelection([high,low],'high','my-roof');
 assert.equal(b.key,'my-roof');assert.equal(b.activeSectionId,'high');assert.equal(b.sections.length,2);
 assert.ok(Math.abs(b.footprintFt2-2152.78)<1);
 assert.equal(roofSelection([{...low,pitch_rise:''}],'low').footprintFt2,null);
});

test('property focus selects a containing building, never a nearby fabricated lot',()=>{
 const building={geometry:rectangle,properties:{type:'house'}};
 assert.ok(focusBuilding([building],[.00008,.00004])?.geometry);
 assert.equal(focusBuilding([building],[.01,.01]),null);
});


test('moving a focus outline preserves its shape without accepting invalid coordinates',()=>{
 const moved=translateGeometry(rectangle,.01,.02);
 assert.deepEqual(moved.coordinates[0][0],[.01,.02]);
 assert.deepEqual(rectangle.coordinates[0][0],[0,0]);
 assert.equal(translateGeometry(rectangle,181,0),null);
 assert.equal(translateGeometry(rectangle,0,86),null);
});


test('roof colors are distinct and stay with saved layers through reorder, add and remove',()=>{
 const layers=withRoofColors(Array.from({length:24},(_,i)=>({id:String(i),color:undefined})));
 assert.equal(new Set(layers.map(s=>s.color)).size,24);
 const assigned=layers.slice(0,2),before=Object.fromEntries(assigned.map(s=>[s.id,s.color]));
 assert.notEqual(nextRoofColor(assigned),assigned[0].color);
 const reordered=withRoofColors(assigned.slice().reverse());
 assert.deepEqual(Object.fromEntries(reordered.map(s=>[s.id,s.color])),before);
 assert.equal(withRoofColors([assigned[1]])[0].color,assigned[1].color);
 assert.deepEqual(withRoofColors([{id:'one',color:'invalid'}])[0].color,'#0866ff');
});
