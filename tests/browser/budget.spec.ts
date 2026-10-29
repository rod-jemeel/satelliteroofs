import {createDemoProject} from './helpers';
import {test,expect} from '@playwright/test';
import geojsonvt from 'geojson-vt';
import vtpbf from 'vt-pbf';

test.afterEach(async({page})=>{await page.unrouteAll({behavior:'wait'})});

test.beforeEach(async({page})=>{
 await page.route('**/api/v1/map/reverse',r=>r.fulfill({json:[]}));
 await page.route('**/api/v1/settings',async route=>{const response=await route.fetch();await route.fulfill({response,json:{...await response.json(),map_token:''}})});
});

test('phone budget assumptions update and survive panel minimization',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.goto('/');
 await page.getByRole('button',{name:'Budget calculator',exact:true}).click();
 await page.getByLabel('Building footprint (ft²)',{exact:true}).fill('2000');
 await expect(page.getByTestId('budget-range')).toHaveText('$8,900 – $20,300');
 await page.locator('.budget-assumptions summary').click();
 await page.getByLabel('Assumed pitch rise / 12',{exact:true}).fill('12');
 await page.getByRole('button',{name:'Collapse drawing toolbar',exact:true}).click();
 await expect(page.getByRole('tab',{name:'Satellite',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Expand drawing toolbar',exact:true}).click();
 await page.getByRole('button',{name:'Collapse project panel'}).click();
 await page.getByRole('button',{name:'Expand project panel'}).click();
 await expect(page.getByLabel('Assumed pitch rise / 12',{exact:true})).toHaveValue('12');
 await expect(page.getByTestId('budget-range')).toHaveText('$11,300 – $25,700');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
});

test('manual budget preview is editable, remains preliminary and saves without measurements',async({page})=>{
 await page.goto('/');
 await page.getByRole('button',{name:'Budget calculator',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Roof budget',exact:true})).toBeVisible();
 await expect(page.getByTestId('budget-range')).not.toBeVisible();
 await page.getByLabel('Building footprint (ft²)',{exact:true}).fill('2000');
 await expect(page.getByTestId('budget-range')).toHaveText('$8,900 – $20,300');
 await expect(page.getByText('Demo rates · replace with your pricing',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Save as new project',exact:true}).click();
 await page.getByLabel('Project name',{exact:true}).fill('Preliminary budget QA');
 await page.getByLabel('Latitude',{exact:true}).fill('30.29');await page.getByLabel('Longitude',{exact:true}).fill('-97.75');
 await expect(page.getByRole('button',{name:'Save preliminary budget',exact:true})).toBeDisabled();
 await page.getByLabel('I reviewed the building and these budget assumptions').check();
 await page.getByRole('button',{name:'Save preliminary budget',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Preliminary budget QA',exact:true})).toBeVisible();
 await expect(page.getByRole('heading',{name:'Saved preliminary budget',exact:true})).toBeVisible();
 const projectId=new URL(page.url()).searchParams.get('project');
 const project=await page.evaluate(async id=>(await fetch('/api/v1/projects/'+id)).json(),projectId);
 expect(project.revisions).toEqual([]);expect(project.estimates).toEqual([]);expect(project.data.budget.status).toBe('preliminary');
 await page.reload();await expect(page.getByRole('heading',{name:'Saved preliminary budget',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Open budget assumptions',exact:true}).click();
 await expect(page.getByTestId('budget-range')).toHaveText('$8,900 – $20,300');
 await page.locator('.budget-pricing summary').click();
 await page.getByLabel('Lower rate ($/ft²)',{exact:true}).fill('9');
 await expect(page.getByTestId('budget-range')).not.toBeVisible();
 await expect(page.getByRole('button',{name:'Save as new project',exact:true})).toBeDisabled();
 await page.getByLabel('Upper rate ($/ft²)',{exact:true}).fill('10');
 await expect(page.getByTestId('budget-range')).toHaveText('$17,900 – $27,100');
 await page.getByLabel('Building footprint (ft²)',{exact:true}).fill('');
 await expect(page.getByTestId('budget-range')).not.toBeVisible();
});

test('clicking a vector building highlights it and creates a budget without changing its project',async({page})=>{
 const center=[-97.7623,30.2818],dx=.000105,dy=.00009;
 const tileIndex=geojsonvt({type:'FeatureCollection',features:[{type:'Feature',id:100,properties:{type:'house',height:6,name:'Synthetic test house'},geometry:{type:'Polygon',coordinates:[[[center[0]-dx,center[1]-dy],[center[0]+dx,center[1]-dy],[center[0]+dx,center[1]+dy],[center[0]-dx,center[1]+dy],[center[0]-dx,center[1]-dy]]]}}]},{maxZoom:18,indexMaxZoom:18,indexMaxPoints:1000});
 await page.route('**/api/v1/settings',async route=>{const response=await route.fetch();await route.fulfill({response,json:{...await response.json(),map_token:'pk.test-fixture'}})});
 await page.route('https://events.mapbox.com/**',route=>route.fulfill({status:204}));
 await page.route('https://api.mapbox.com/**',async route=>{
  const url=new URL(route.request().url());
  if(url.pathname.startsWith('/styles/'))return route.fulfill({json:{version:8,sources:{fixture:{type:'vector',tiles:['http://127.0.0.1:3210/test-building/{z}/{x}/{y}.pbf'],maxzoom:18}},layers:[{id:'background',type:'background',paint:{'background-color':'#edf1f4'}},{id:'building',type:'fill',source:'fixture','source-layer':'building',paint:{'fill-color':'#c9cfd5'}}]}});
  return route.fulfill({json:{}});
 });
 await page.route('**/test-building/**',route=>{
  const [z,x,y]=new URL(route.request().url()).pathname.match(/\d+/g)!.map(Number);
  const tile=tileIndex.getTile(z,x,y);
  return route.fulfill({contentType:'application/x-protobuf',body:Buffer.from(vtpbf.fromGeojsonVt({building:tile||{features:[]}}))});
 });
 const demoProjectId=await createDemoProject(page);await page.goto('/?project='+demoProjectId);
 await page.getByRole('tab',{name:'Street',exact:true}).click();
 await expect(page.locator('.map-caption .live-dot')).toBeVisible({timeout:30000});
 const canvas=page.locator('.mapboxgl-canvas'),viewport=page.viewportSize()!;
 await canvas.hover({position:{x:viewport.width/2,y:viewport.height/2}});
 await expect(canvas).toHaveCSS('cursor','pointer');
 await canvas.click({position:{x:viewport.width/2,y:viewport.height/2}});
 await expect(page.getByRole('heading',{name:'Roof budget',exact:true})).toBeVisible();
 await expect(page.getByTestId('map-stage')).toHaveAttribute('data-selected-building',/100/);
 await expect(page.getByLabel('Outlined area (ft²)',{exact:true})).not.toHaveValue('');
 await expect(page.getByTestId('budget-range')).toContainText('$');
 await expect(page.getByText('Synthetic test house',{exact:false}).first()).toBeVisible();
 const original=await page.evaluate(async(id)=>(await fetch('/api/v1/projects/'+id)).json(),demoProjectId);
 expect(original.data.budget).toBeUndefined();
 await page.getByRole('button',{name:'Back to workspace',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Oakridge residence',exact:true})).toBeVisible();
 await expect(page.getByTestId('map-stage')).not.toHaveAttribute('data-selected-building');
});


test('the whole work panel hides and restores its budget, with footprint help on demand',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'Budget calculator',exact:true}).click();
 await page.getByLabel('Building footprint (ft²)',{exact:true}).fill('2000');
 await expect(page.getByTestId('budget-range')).toHaveText('$8,900 – $20,300');
 await expect(page.getByText('User-entered footprint.',{exact:false})).not.toBeVisible();
 await page.getByRole('button',{name:'About footprint accuracy',exact:true}).click();
 await expect(page.getByRole('dialog',{name:'Footprint accuracy',exact:true})).toBeVisible();
 await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'Collapse project panel',exact:true}).click();
 await expect(page.getByLabel('SatelliteRoofs project panel',{exact:true})).not.toBeVisible();
 await expect(page.getByLabel('Search map by address',{exact:true})).not.toBeVisible();
 await page.getByRole('button',{name:'Expand project panel',exact:true}).click();
 await expect(page.getByLabel('Building footprint (ft²)',{exact:true})).toHaveValue('2000');
 await expect(page.getByTestId('budget-range')).toHaveText('$8,900 – $20,300');
});

test('satellite roof selection loads building footprints without an address search',async({page})=>{
 const center=[-97.7623,30.2818],dx=.000105,dy=.00009;
 const index=geojsonvt({type:'FeatureCollection',features:[{type:'Feature',id:100,properties:{type:'house'},geometry:{type:'Polygon',coordinates:[[[center[0]-dx,center[1]-dy],[center[0]+dx,center[1]-dy],[center[0]+dx,center[1]+dy],[center[0]-dx,center[1]+dy],[center[0]-dx,center[1]-dy]]]}}]},{maxZoom:18,indexMaxZoom:18});
 let searches=0;
 page.on('request',r=>{if(r.method()==='POST'&&r.url().endsWith('/api/v1/map/search'))searches++});
 await page.route('**/api/v1/settings',async route=>{const response=await route.fetch();await route.fulfill({response,json:{...await response.json(),map_token:'pk.test-fixture'}})});
 await page.route('https://events.mapbox.com/**',r=>r.fulfill({status:204}));
 await page.route('https://api.mapbox.com/**',r=>r.fulfill({json:new URL(r.request().url()).pathname.startsWith('/styles/')?{version:8,sources:{},layers:[{id:'background',type:'background',paint:{'background-color':'#edf1f4'}}]}:{tilejson:'3.0.0',tiles:['http://127.0.0.1:3210/start-building/{z}/{x}/{y}.pbf'],minzoom:0,maxzoom:18}}));
 await page.route('**/start-building/**',r=>{const [z,x,y]=new URL(r.request().url()).pathname.match(/\d+/g)!.map(Number);return r.fulfill({contentType:'application/x-protobuf',body:Buffer.from(vtpbf.fromGeojsonVt({building:index.getTile(z,x,y)||{features:[]}}))})});
 await page.goto('/');await page.getByRole('button',{name:'Select a roof',exact:true}).click();
 const viewport=page.viewportSize()!,canvas=page.locator('.mapboxgl-canvas');
 await canvas.hover({position:{x:viewport.width/2,y:viewport.height/2}});
 await expect(canvas).toHaveCSS('cursor','pointer');
 await canvas.click({position:{x:viewport.width/2,y:viewport.height/2}});
 await expect(page.getByTestId('budget-range')).toContainText('$');expect(searches).toBe(0);
});
