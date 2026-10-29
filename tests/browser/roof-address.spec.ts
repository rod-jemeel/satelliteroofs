import {test,expect} from '@playwright/test';
import geojsonvt from 'geojson-vt';
import vtpbf from 'vt-pbf';
const address='123 Demo Lane, Austin, Texas 78703, United States';
const candidate={label:address,longitude:-97.7623,latitude:30.2818,accuracy:'rooftop',distance_m:8,price_location:'Austin, TX 78703',storage_basis:'temporary',confirmed:false};
test.afterEach(async({page})=>{await page.unrouteAll({behavior:'wait'})});
test.beforeEach(async({page})=>{
 await page.route('**/api/v1/settings',async r=>{const response=await r.fetch();await r.fulfill({response,json:{...await response.json(),map_token:'pk.fixture',permanent_geocoding:false}})});
 await page.route('**/api/v1/map/reverse',r=>r.fulfill({json:[candidate]}));
 await page.route('**/api/v1/ai/connection',r=>r.fulfill({json:{status:'ready',model:'test-only'}}));
 await page.route('**/api/v1/price-research/latest',r=>r.fulfill({json:null}));
 await page.route('https://events.mapbox.com/**',r=>r.fulfill({status:204}));
 await page.route('https://api.mapbox.com/**',r=>r.fulfill({json:new URL(r.request().url()).pathname.includes('/styles/')?{version:8,sources:{fixture:{type:'vector',tiles:['http://127.0.0.1:3210/roof-address-tiles/{z}/{x}/{y}.pbf'],maxzoom:22}},layers:[{id:'background',type:'background',paint:{'background-color':'#edf1f4'}},{id:'building',type:'fill',source:'fixture','source-layer':'building',paint:{'fill-color':'#bbc4cf'}}]}:{tilejson:'3.0.0',tiles:['http://127.0.0.1:3210/roof-address-tiles/{z}/{x}/{y}.pbf'],maxzoom:22}}));
 const x=-97.7623,y=30.2818,d=.0001;
 const index=geojsonvt({type:'FeatureCollection',features:[{type:'Feature',id:77,properties:{type:'house'},geometry:{type:'Polygon',coordinates:[[[x-d,y-d],[x+d,y-d],[x+d,y+d],[x-d,y+d],[x-d,y-d]]]}}]},{maxZoom:22,indexMaxZoom:22});
 await page.route('**/roof-address-tiles/**',r=>{const [z,x,y]=new URL(r.request().url()).pathname.match(/\d+/g)!.map(Number);return r.fulfill({contentType:'application/x-protobuf',body:Buffer.from(vtpbf.fromGeojsonVt({building:index.getTile(z,x,y)||{features:[]}}))})});
});
async function selectRoof(page:any){
 await page.goto('/');await page.getByRole('button',{name:'Select a roof',exact:true}).click();
 const canvas=page.locator('.mapboxgl-canvas');await canvas.hover({position:{x:720,y:540}});await expect(canvas).toHaveCSS('cursor','pointer');await canvas.click({position:{x:720,y:540}});
 await expect(page.getByRole('heading',{name:'Roof budget',exact:true})).toBeVisible();
}

test('initial building outline is a section that edits, cancels, adds layers and survives save/reload',async({page})=>{
 await page.route('**/api/v1/map/reverse',r=>r.fulfill({json:[]}));
 let saved:any;
 await page.route('**/api/v1/property-budgets',async r=>{saved=r.request().postDataJSON();const response=await r.fetch();await r.fulfill({response})});
 await selectRoof(page);
 await expect(page.locator('.budget-body .roof-address')).toHaveCount(0);
 await expect(page.getByRole('group',{name:'Roof section 1',exact:true})).toBeVisible();
 const area=page.getByLabel('Outlined area (ft²)',{exact:true});await expect(area).toHaveAttribute('readonly','');
 const original=await area.inputValue();
 await page.getByRole('button',{name:'Edit outline points',exact:true}).click();
 await expect(page.getByText('Drag corners to adjust the outline',{exact:true})).toBeVisible();
 // Fixture corner at zoom 18, before any camera pan.
 await page.mouse.move(757,497);await page.mouse.down();await page.mouse.move(773,483,{steps:10});await page.mouse.up();
 await page.getByRole('button',{name:'Done editing outline',exact:true}).click();
 await expect(area).not.toHaveValue(original);const adjusted=await area.inputValue();
 await page.getByRole('button',{name:'Edit outline points',exact:true}).click();await page.getByRole('button',{name:'Cancel outline',exact:true}).click();await expect(area).toHaveValue(adjusted);
 await page.getByRole('button',{name:'Add roof section',exact:true}).click();
 const canvas=page.locator('.mapboxgl-canvas');for(const [x,y] of [[720,520],[745,520],[745,540],[720,540]])await canvas.click({position:{x,y}});
 await page.getByRole('button',{name:'Close outline',exact:true}).click();
 await expect(page.getByTestId('roof-sections-list').locator('fieldset')).toHaveCount(2);
 await page.getByRole('button',{name:'Save as new project',exact:true}).click();await page.getByLabel('Project name',{exact:true}).fill('Imported roof edit QA');
 await page.getByLabel('I reviewed the building and these budget assumptions').check();await page.getByRole('button',{name:'Save preliminary budget',exact:true}).click();
 await expect(page.locator('.project-identity')).toContainText('Imported roof edit QA');
 expect(saved.inputs.roof_sections.find((s:any)=>s.name==='Roof section 1').origin).toBe('mapbox_vector');
 const retained=saved.inputs.roof_sections.find((s:any)=>s.name==='Roof section 1').outline;
 await page.reload();await page.getByRole('button',{name:'Open budget assumptions',exact:true}).click();await expect(page.getByTestId('roof-sections-list').locator('fieldset')).toHaveCount(2);
 await page.getByRole('button',{name:'Edit outline points',exact:true}).click();await expect(page.getByRole('button',{name:'Done editing outline',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Cancel outline',exact:true}).click();
 const id=new URL(page.url()).searchParams.get('project');const p=await page.evaluate(async id=>(await fetch('/api/v1/projects/'+id)).json(),id);
 expect(p.data.budget.inputs.roof_sections.find((s:any)=>s.name==='Roof section 1').outline).toEqual(retained);
});
test('temporary roof addresses stay view-only and saving uses an explicitly entered address',async({page})=>{
 let reverseCalls=0,searches=0,saved:any;
 await page.route('**/api/v1/map/reverse',r=>{reverseCalls++;return r.fulfill({json:[candidate]})});
 await page.route('**/api/v1/price-research',r=>{searches++;expect(r.request().postDataJSON().location).toBe('Austin, TX 78703');return r.fulfill({json:{id:'11111111-1111-4111-8111-111111111111',status:'completed',request:r.request().postDataJSON(),quotes:[],notes:[],checked_at:new Date().toISOString()}})});
 await page.route('**/api/v1/property-budgets',async r=>{saved=r.request().postDataJSON();const response=await r.fetch();await r.fulfill({response})});
 await selectRoof(page);
 await expect(page.getByLabel('Search map by address',{exact:true})).toHaveValue(address);
 await expect(page.locator('.budget-body .roof-address')).toHaveCount(0);
 await page.locator('.budget-pricing summary').click();await expect(page.getByRole('button',{name:'Research material prices',exact:true})).toHaveCount(1);
 await page.getByRole('button',{name:'Research material prices',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Material price research',exact:true});
 await expect(dialog.getByLabel('Material price location',{exact:true})).toHaveValue('');expect(searches).toBe(0);
 await dialog.getByLabel('Material price location',{exact:true}).fill('Austin, TX 78703');
 await dialog.getByRole('button',{name:'Research prices',exact:true}).click();await expect(dialog.getByRole('heading',{name:'Supplier offers',exact:true})).toBeVisible();
 await dialog.locator('[data-slot=dialog-footer]').getByRole('button',{name:'Close',exact:true}).click();
 await page.getByRole('button',{name:'Open workspace menu',exact:true}).click();await page.getByRole('menuitem',{name:'New project',exact:true}).click();
 const newProject=page.getByRole('dialog',{name:'New roofing project',exact:true});await expect(newProject.getByLabel('Property address',{exact:true})).toHaveValue('');
 await newProject.getByRole('button',{name:'Cancel',exact:true}).click();
 await page.getByRole('button',{name:'Save as new project',exact:true}).click();
 await expect(page.getByLabel('Address (optional)',{exact:true})).toHaveValue('');
 await expect(page.getByText('The map address is temporary and will not be saved. Enter a known property address manually, or leave this optional field blank.',{exact:true})).toBeVisible();
 await expect(page.getByText('8 m from selected roof · rooftop point',{exact:true})).toBeVisible();
 await page.getByLabel('Address (optional)',{exact:true}).fill(address);
 await page.getByLabel('I reviewed the building and these budget assumptions').check();
 await expect(page.getByRole('button',{name:'Save preliminary budget',exact:true})).toBeDisabled();
 await page.getByRole('dialog',{name:'Save preliminary budget',exact:true}).getByLabel('This address belongs to the selected roof',{exact:true}).check();
 await page.getByRole('button',{name:'Save preliminary budget',exact:true}).click();
 await expect(page.locator('.project-identity')).toContainText(address);
 expect(saved.address).toBe(address);expect(saved.address_details.confirmed).toBe(true);expect(saved.address_details.price_location).toBe('');expect(saved.address_details.storage_basis).toBe('user_supplied');expect(reverseCalls).toBe(1);expect(searches).toBe(1);
 await page.reload();await page.getByRole('button',{name:'Open budget assumptions',exact:true}).click();
 await expect(page.getByLabel('Search map by address',{exact:true})).toHaveValue(address);
 expect(reverseCalls).toBe(1);
});

test('missing roof address allows manual correction without inventing a pricing location',async({page})=>{
 await page.route('**/api/v1/map/reverse',r=>r.fulfill({json:[]}));
 await selectRoof(page);await page.getByRole('button',{name:'Save as new project',exact:true}).click();
 const save=page.getByRole('dialog',{name:'Save preliminary budget',exact:true});await expect(save.getByText('No nearby street address found. Enter the address manually.',{exact:true})).toBeVisible();
 await save.getByLabel('Address (optional)',{exact:true}).fill('99 Correct Street, Austin, TX');await save.getByRole('button',{name:'Cancel',exact:true}).click();
 await page.getByRole('button',{name:'Research material prices',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Material price research',exact:true});await expect(dialog.getByLabel('Material price location',{exact:true})).toHaveValue('');
 await dialog.locator('[data-slot=dialog-footer]').getByRole('button',{name:'Close',exact:true}).click();
 await page.getByRole('button',{name:'Save as new project',exact:true}).click();await expect(page.getByLabel('Address (optional)',{exact:true})).toHaveValue('99 Correct Street, Austin, TX');
});

test('roof address and material research stay usable at desktop, tablet and phone widths',async({page})=>{
 await selectRoof(page);await expect(page.getByLabel('Search map by address',{exact:true})).toHaveValue(address);
 for(const width of [1440,768,390]){
  await page.setViewportSize({width,height:900});
  const expand=page.getByRole('button',{name:'Expand project panel',exact:true});if(await expand.isVisible())await expand.click();
  await expect(page.getByLabel('Search map by address',{exact:true})).toBeVisible();
  await expect(page.locator('.budget-body .roof-address')).toHaveCount(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
  await page.screenshot({path:`verification/roof-address-${width}.png`,fullPage:true});
  await page.getByRole('button',{name:'Research material prices',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Material price research',exact:true});
  await expect(dialog.getByLabel('Material price location',{exact:true})).toHaveValue('');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
  await page.screenshot({path:`verification/roof-research-${width}.png`,fullPage:true});
  await dialog.locator('[data-slot=dialog-footer]').getByRole('button',{name:'Close',exact:true}).click();
 }
});

test('a late address response cannot label a different budget',async({page})=>{
 let pending:any;
 await page.route('**/api/v1/map/reverse',r=>{pending=r});
 await selectRoof(page);await expect.poll(()=>!!pending).toBeTruthy();
 await page.getByRole('button',{name:'Budget calculator',exact:true}).click();
 await pending.fulfill({json:[candidate]});
 await expect(page.locator('.budget-body .roof-address')).toHaveCount(0);
 await expect(page.getByLabel('Search map by address',{exact:true})).toHaveValue('');
});

test('temporary address is omitted when saving only the roof budget',async({page})=>{
 let saved:any;
 await page.route('**/api/v1/property-budgets',async r=>{saved=r.request().postDataJSON();const response=await r.fetch();await r.fulfill({response})});
 await selectRoof(page);await expect(page.getByLabel('Search map by address',{exact:true})).toHaveValue(address);
 await page.getByRole('button',{name:'Save as new project',exact:true}).click();
 await expect(page.getByLabel('Address (optional)',{exact:true})).toHaveValue('');
 await page.getByLabel('I reviewed the building and these budget assumptions').check();
 await page.getByRole('button',{name:'Save preliminary budget',exact:true}).click();
 await expect(page.locator('.project-identity')).toContainText('Property budget');
 expect(saved.address).toBe('');expect(saved.address_details).toBeUndefined();
});
