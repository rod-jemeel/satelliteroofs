import {createDemoProject} from './helpers';
import {test,expect} from '@playwright/test';
import vtpbf from 'vt-pbf';
import geojsonvt from 'geojson-vt';

test.afterEach(async({page})=>{await page.unrouteAll({behavior:'wait'})});
test.beforeEach(async({page})=>{
 await page.route('**/api/v1/map/reverse',r=>r.fulfill({json:[]}));
 await page.route('**/api/v1/settings',async route=>{const response=await route.fetch();await route.fulfill({response,json:{...await response.json(),map_token:'pk.address-fixture'}})});
 await page.route('**/api/v1/map/retrieve',r=>r.fulfill({json:{label:'123 Demo Lane, New York',longitude:-73.98,latitude:40.7,accuracy:'rooftop',feature_type:'address'}}));
 await page.route('https://events.mapbox.com/**',r=>r.fulfill({status:204}));
 await page.route('https://api.mapbox.com/**',r=>r.fulfill({json:new URL(r.request().url()).pathname.includes('/styles/')?{version:8,sources:{fixture:{type:'vector',tiles:['http://127.0.0.1:3210/search-test-map/{z}/{x}/{y}.pbf'],maxzoom:22}},layers:[{id:'background',type:'background',paint:{'background-color':'#edf1f4'}},{id:'building',type:'fill',source:'fixture','source-layer':'building'}]}:{tilejson:'3.0.0',tiles:['http://127.0.0.1:3210/search-test-map/{z}/{x}/{y}.pbf'],minzoom:0,maxzoom:22}}));
 const index=geojsonvt({type:'FeatureCollection',features:[{type:'Feature',id:42,properties:{type:'house'},geometry:{type:'Polygon',coordinates:[[[-73.9801,40.6999],[-73.9799,40.6999],[-73.9799,40.7001],[-73.9801,40.7001],[-73.9801,40.6999]]]}}]},{maxZoom:22,indexMaxZoom:22});
 await page.route('**/search-test-map/**',r=>{const [z,x,y]=new URL(r.request().url()).pathname.match(/\d+/g)!.map(Number);return r.fulfill({contentType:'application/x-protobuf',body:Buffer.from(vtpbf.fromGeojsonVt({building:index.getTile(z,x,y)||{features:[]}}))})});
});

test('address search submits once, jumps to satellite and draws without changing the project',async({page})=>{
 const matches=[{label:'123 Demo Lane, New York',longitude:-73.98,latitude:40.7,accuracy:'rooftop'}];let searches=0;const tiles:string[]=[];
 page.on('request',r=>{if(r.url().includes('/search-test-map/'))tiles.push(new URL(r.url()).pathname)});
 await page.route('**/api/v1/map/suggest',async route=>{searches++;expect(route.request().postDataJSON().query).toBe('123 Demo Lane, New York');await route.fulfill({json:matches.map(m=>({mapbox_id:'demo_address',label:m.label,feature_type:'address'}))})});
 const demoProjectId=await createDemoProject(page);await page.goto('/?project='+demoProjectId);
 await expect(page.getByRole('heading',{name:'Oakridge residence',exact:true})).toBeVisible();
 const original=await page.evaluate(async(id)=>(await (await fetch('/api/v1/projects/'+id)).json()).data,demoProjectId);
 await page.getByRole('tab',{name:'Street',exact:true}).click();
 await page.getByLabel('Search map by address',{exact:true}).fill('123 Demo Lane, New York');
 expect(searches).toBe(0);
 await page.getByRole('button',{name:'Search address',exact:true}).click();
 await page.getByRole('option',{name:'Go to 123 Demo Lane, New York',exact:true}).click();
 await expect(page.getByRole('tab',{name:'Satellite',exact:true})).toHaveAttribute('aria-selected','true');
 const z=19,x=Math.floor((matches[0].longitude+180)/360*2**z),lat=matches[0].latitude*Math.PI/180,y=Math.floor((1-Math.asinh(Math.tan(lat))/Math.PI)/2*2**z);
 await expect.poll(()=>tiles.some(t=>t===`/search-test-map/${z}/${x}/${y}.pbf`)).toBeTruthy();
 expect(searches).toBe(1);
 await expect(page.getByTestId('property-focus')).toHaveAttribute('data-focus-kind','building');
 await expect(page.locator('.map-address-message')).toHaveCount(0);
 await expect(page.getByLabel('Search map by address',{exact:true})).toHaveValue(matches[0].label);
 await page.getByRole('button',{name:'Draw roof outline',exact:true}).click();
 await expect(page.getByLabel('Search map by address',{exact:true})).toBeDisabled();
 for(const [x,y] of [[700,400],[740,400],[740,430],[700,430]])await page.locator('.mapboxgl-canvas').click({position:{x,y}});
 await page.getByRole('button',{name:'Close outline',exact:true}).click();
 await expect(page.getByTestId('budget-range')).toContainText('$');
 expect(await page.evaluate(async(id)=>(await (await fetch('/api/v1/projects/'+id)).json()).data,demoProjectId)).toEqual(original);
});

test('phone search shows empty and error states and works while the panel is collapsed',async({page})=>{
 await page.setViewportSize({width:390,height:844});let searches=0;
 await page.route('**/api/v1/map/suggest',route=>{searches++;return searches===1?route.fulfill({json:[]}):route.fulfill({status:422,json:{detail:'Mapbox address search is rate-limited. Try again later.'}})});
 const demoProjectId=await createDemoProject(page);await page.goto('/?project='+demoProjectId);
 await expect(page.getByRole('button',{name:'Expand project panel'})).toBeVisible();
 await page.getByLabel('Search map by address',{exact:true}).fill('No such house');
 await page.getByLabel('Search map by address',{exact:true}).press('Enter');
 await expect(page.getByText('No addresses found. Try adding the city or ZIP code.',{exact:true})).toBeVisible();
 await page.getByLabel('Search map by address',{exact:true}).fill('123 Demo Lane');
 await page.getByRole('button',{name:'Search address',exact:true}).click();
 await expect(page.getByRole('alert').filter({hasText:'rate-limited'})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
});


test('the searched building focus can be dragged and reset without changing the project',async({page})=>{
 const match={label:'123 Demo Lane, New York',longitude:-73.98,latitude:40.7,accuracy:'rooftop'};
 await page.route('**/api/v1/map/suggest',r=>r.fulfill({json:[{mapbox_id:'demo_address',label:match.label,feature_type:'address'}]}));
 const demoProjectId=await createDemoProject(page);await page.goto('/?project='+demoProjectId);
 await page.getByLabel('Search map by address',{exact:true}).fill('123 Demo Lane');
 await page.getByRole('button',{name:'Search address',exact:true}).click();
 await page.getByRole('option',{name:'Go to 123 Demo Lane, New York',exact:true}).click();
 const focus=page.getByTestId('property-focus');await expect(focus).toHaveAttribute('data-focus-kind','building');
 const original=await page.evaluate(async(id)=>(await (await fetch('/api/v1/projects/'+id)).json()).data,demoProjectId);
 const viewport=page.viewportSize()!;const x=viewport.width/2,y=viewport.height/2;
 await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+35,y+25,{steps:10});await page.mouse.up();
 await expect(focus).toHaveAttribute('data-focus-kind','adjusted');
 await expect(page.getByRole('button',{name:'Reset building focus',exact:true})).toBeVisible();
 expect(await page.evaluate(async(id)=>(await (await fetch('/api/v1/projects/'+id)).json()).data,demoProjectId)).toEqual(original);
 await page.getByRole('button',{name:'Reset building focus',exact:true}).click();
 await expect(focus).toHaveAttribute('data-focus-kind','building');
 await expect(page.getByRole('button',{name:'Reset building focus',exact:true})).not.toBeVisible();
});

test('Mapbox autocomplete debounces typing, supports keyboard selection and shares a search session',async({page})=>{
 const suggestions:Array<Record<string,unknown>>=[];let retrieved=0;
 await page.route('**/api/v1/map/suggest',async route=>{const body=route.request().postDataJSON();suggestions.push(body);await route.fulfill({json:[{mapbox_id:'meaders_street',label:'Meaders Lane, Dallas, Texas',feature_type:'street'}]})});
 await page.route('**/api/v1/map/retrieve',async route=>{retrieved++;const body=route.request().postDataJSON();expect(body.mapbox_id).toBe('meaders_street');expect(body.session_token).toBe(suggestions[0].session_token);await route.fulfill({json:{label:'Meaders Lane, Dallas, Texas',longitude:-96.8,latitude:32.88,accuracy:'unknown',feature_type:'street'}})});
 await page.goto('/');const input=page.getByLabel('Search map by address',{exact:true});await expect(input).toBeEnabled();
 await input.pressSequentially('meaders lane',{delay:20});
 await expect(page.getByRole('option',{name:'Go to Meaders Lane, Dallas, Texas',exact:true})).toBeVisible();
 expect(suggestions).toHaveLength(1);expect(suggestions[0].proximity).toBeTruthy();
 expect(retrieved).toBe(0);await input.press('ArrowDown');await input.press('Enter');
 await expect(input).toHaveValue('Meaders Lane, Dallas, Texas');expect(retrieved).toBe(1);
 await expect(page.getByRole('option')).toHaveCount(0);await expect(page.getByTestId('budget-range')).toHaveCount(0);
 await expect(page.getByTestId('property-focus')).toHaveCount(0);
 await input.fill('meaders lane dallas');await expect(page.getByRole('option')).toBeVisible();
 expect(suggestions[1].session_token).not.toBe(suggestions[0].session_token);
 await input.press('Escape');await expect(page.getByRole('option')).toHaveCount(0);
});
