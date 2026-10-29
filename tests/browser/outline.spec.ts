import {test,expect} from '@playwright/test';

test.afterEach(async({page})=>{await page.unrouteAll({behavior:'wait'})});

test.beforeEach(async({page})=>{
 await page.route('**/api/v1/map/reverse',r=>r.fulfill({json:[]}));
 await page.route('**/api/v1/settings',async route=>{const response=await route.fetch();await route.fulfill({response,json:{...await response.json(),map_token:'pk.local-drawing-test'}})});
 await page.route('https://events.mapbox.com/**',r=>r.fulfill({status:204}));
 await page.route('https://api.mapbox.com/**',r=>r.fulfill({json:{version:8,sources:{},layers:[{id:'background',type:'background',paint:{'background-color':'#edf1f4'}}]}}));
});

test('satellite outlines can be drawn, edited and retained across map styles',async({page})=>{
 const requestedStyles:string[]=[];
 page.on('request',request=>{if(request.url().includes('/styles/v1/'))requestedStyles.push(new URL(request.url()).pathname)});
 await page.goto('/');
 await expect(page.getByRole('tab',{name:'Satellite',exact:true})).toHaveAttribute('aria-selected','true');
 await page.getByRole('tab',{name:'Satellite',exact:true}).click();
 await expect(page.getByRole('tab',{name:'Satellite',exact:true})).toHaveAttribute('aria-selected','true');
 await page.getByRole('button',{name:'Draw roof outline',exact:true}).click({timeout:10000});
 await expect(page.getByRole('tab',{name:'Street',exact:true})).toBeDisabled();
 const canvas=page.locator('.mapboxgl-canvas');
 for(const [x,y] of [[700,400],[740,400],[740,430],[700,430]])await canvas.click({position:{x,y}});
 await page.getByRole('button',{name:'Close outline',exact:true}).click();
 await expect(page.getByTestId('budget-range')).toContainText('$');
 const area=page.getByLabel('Outlined area (ft²)',{exact:true});const original=await area.inputValue();
 await page.getByRole('button',{name:'Edit outline points',exact:true}).click();
 await page.mouse.move(740,400);await page.mouse.down();await page.mouse.move(750,390,{steps:8});await page.mouse.up();
 await page.getByRole('button',{name:'Done editing outline',exact:true}).click();
 await expect(area).not.toHaveValue(original);const adjusted=await area.inputValue();
 await page.getByRole('tab',{name:'Street',exact:true}).click();
 await page.getByRole('button',{name:'Edit outline points',exact:true}).click();
 await page.getByRole('button',{name:'Done editing outline',exact:true}).click();
 await expect(area).toHaveValue(adjusted);
 await page.getByRole('tab',{name:'Satellite',exact:true}).click();
 await page.getByRole('button',{name:'Edit outline points',exact:true}).click();
 await page.getByRole('button',{name:'Cancel outline',exact:true}).click();
 await expect(area).toHaveValue(adjusted);
 expect(requestedStyles).toContain('/styles/v1/mapbox/satellite-streets-v12');
});

test('satellite tile failures offer retry without discarding a completed outline',async({page})=>{
 await page.goto('/');await page.getByRole('tab',{name:'Street',exact:true}).click();await page.getByRole('button',{name:'Draw roof outline',exact:true}).click();
 const canvas=page.locator('.mapboxgl-canvas');
 for(const [x,y] of [[700,400],[740,400],[740,430],[700,430]])await canvas.click({position:{x,y}});
 await page.getByRole('button',{name:'Close outline',exact:true}).click();
 const area=page.getByLabel('Outlined area (ft²)',{exact:true});const original=await area.inputValue();
 let loads=0;
 await page.route('https://api.mapbox.com/styles/v1/mapbox/satellite-streets-v12**',route=>{loads++;return route.fulfill({json:{version:8,sources:{satellite:{type:'raster',tileSize:256,tiles:['http://127.0.0.1:3210/test-satellite-tiles/{z}/{x}/{y}.png']}},layers:[{id:'satellite',type:'raster',source:'satellite'}]}})});
 await page.route('**/test-satellite-tiles/**',route=>route.fulfill({status:429,json:{message:'Too Many Requests'}}));
 await page.getByRole('tab',{name:'Satellite',exact:true}).click();
 await expect(page.getByRole('alert').filter({hasText:'Satellite imagery'})).toContainText('429');
 await page.getByRole('button',{name:'Retry',exact:true}).click();
 await expect.poll(()=>loads).toBeGreaterThan(1);
 await expect(area).toHaveValue(original);
 await page.getByRole('button',{name:'Street view',exact:true}).click();
 await page.getByRole('button',{name:'Edit outline points',exact:true}).click();
 await page.getByRole('button',{name:'Done editing outline',exact:true}).click();
 await expect(area).toHaveValue(original);
});

test('crossed outlines cannot produce prices and cancellation does not save projects',async({page})=>{
 await page.goto('/');
 await page.getByRole('button',{name:'Draw roof outline',exact:true}).click();
 const count=await page.evaluate(async()=>(await (await fetch('/api/v1/projects')).json()).length);
 const canvas=page.locator('.mapboxgl-canvas');
 await canvas.click({position:{x:700,y:400}});await canvas.click({position:{x:740,y:430}});
 await page.getByRole('button',{name:'Cancel outline',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Start with a roof',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Draw roof outline',exact:true}).click();
 for(const [x,y] of [[700,400],[740,430],[700,430],[740,400]])await canvas.click({position:{x,y}});
 await page.getByRole('button',{name:'Close outline',exact:true}).click();
 await expect(page.getByRole('alert').filter({hasText:'crossed edges'})).toBeVisible();
 await expect(page.getByTestId('budget-range')).not.toBeVisible();
 await expect(page.getByRole('button',{name:'Save as new project',exact:true})).toBeDisabled();
 await page.getByRole('button',{name:'Delete roof outline',exact:true}).click();
 expect(await page.evaluate(async()=>(await (await fetch('/api/v1/projects')).json()).length)).toBe(count);
});

test('phone outline drawing keeps controls usable and the page within its viewport',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.goto('/');
 await page.getByRole('button',{name:'Draw roof outline',exact:true}).click();
 const canvas=page.locator('.mapboxgl-canvas');
 for(const [x,y] of [[150,350],[210,350],[210,390],[150,390]])await canvas.click({position:{x,y}});
 await page.getByRole('button',{name:'Close outline',exact:true}).click();
 await expect(page.getByTestId('budget-range')).toContainText('$');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
 await page.getByRole('button',{name:'Edit outline points',exact:true}).click();
 await expect(page.getByRole('button',{name:'Expand project panel'})).toBeVisible();
 await page.getByRole('button',{name:'Done editing outline',exact:true}).click();
 await expect(page.getByTestId('budget-range')).toBeVisible();
});

test('draw, adjust, save and reload a user roof outline',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'Draw roof outline',exact:true}).click();
 const canvas=page.locator('.mapboxgl-canvas');
 await canvas.click({position:{x:700,y:400}});await canvas.click({position:{x:740,y:400}});
 await expect(page.getByRole('button',{name:'Close outline',exact:true})).toBeDisabled();
 await canvas.click({position:{x:740,y:430}});await canvas.click({position:{x:700,y:430}});
 await page.getByRole('button',{name:'Close outline',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Roof budget',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'About footprint accuracy',exact:true}).click();
 await expect(page.getByText('User-drawn top-down outline.',{exact:false})).toBeVisible();
 await page.keyboard.press('Escape');
 const before=await page.getByLabel('Outlined area (ft²)',{exact:true}).inputValue();
 await expect(page.getByLabel('Outlined area (ft²)',{exact:true})).toHaveAttribute('readonly');
 await page.getByRole('button',{name:'Edit outline points',exact:true}).click();
 await page.mouse.move(740,400);await page.mouse.down();await page.mouse.move(750,390,{steps:8});await page.mouse.up();
 await page.getByRole('button',{name:'Done editing outline',exact:true}).click();
 await expect(page.getByLabel('Outlined area (ft²)',{exact:true})).not.toHaveValue(before);
 await expect(page.getByTestId('budget-range')).toContainText('$');
 await page.getByRole('button',{name:'Save as new project',exact:true}).click();
 await page.getByLabel('Project name',{exact:true}).fill('Drawn outline QA');
 await page.getByLabel('I reviewed the building and these budget assumptions').check();
 await page.getByRole('button',{name:'Save preliminary budget',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Drawn outline QA',exact:true})).toBeVisible();
 const id=new URL(page.url()).searchParams.get('project');
 const project=await page.evaluate(async id=>(await fetch('/api/v1/projects/'+id)).json(),id);
 expect(project.data.budget.footprint_source).toBe('user_drawn');expect(project.data.budget.user_outline).toHaveLength(5);
 expect(project.revisions).toEqual([]);expect(project.estimates).toEqual([]);
 await page.reload();await page.getByRole('button',{name:'Open budget assumptions',exact:true}).click();
 await expect(page.getByRole('button',{name:'Edit outline points',exact:true})).toBeVisible();
 await expect(page.getByTestId('map-stage')).toHaveAttribute('data-selected-building',/saved-outline/);
});


test('roof sections overlap by layer order, keep pitches and reopen together',async({page})=>{
 await page.goto('/');const canvas=page.locator('.mapboxgl-canvas');
 await page.getByRole('button',{name:'Draw roof outline',exact:true}).click();
 for(const [x,y] of [[700,400],[780,400],[780,460],[700,460]])await canvas.click({position:{x,y}});
 await page.getByRole('button',{name:'Close outline',exact:true}).click();
 await page.getByLabel('Pitch for Roof section 1',{exact:true}).fill('0');
 await page.getByRole('button',{name:'Add roof section',exact:true}).click();
 for(const [x,y] of [[740,400],[800,400],[800,440],[740,440]])await canvas.click({position:{x,y}});
 await page.getByRole('button',{name:'Close outline',exact:true}).click();
 await page.getByLabel('Pitch for Roof section 2',{exact:true}).fill('12');
 await expect(page.getByTestId('roof-sections-list').getByRole('group',{name:/^Roof section \d+$/})).toHaveCount(2);
 await expect(page.getByTestId('roof-sections-list')).toContainText('covered');
 await expect(page.locator('.roof-layer-editor:visible')).toHaveCount(1);
 const activeLayer=await page.locator('.roof-section[data-active=true]').boundingBox();expect(activeLayer!.height).toBeLessThan(180);
 await expect(page.getByTestId('budget-range')).toContainText('$');
 const colors=await page.getByTestId('roof-sections-list').locator('fieldset[data-layer-color]').evaluateAll(nodes=>Object.fromEntries(nodes.map(n=>[n.getAttribute('aria-label'),n.getAttribute('data-layer-color')])));
 expect(new Set(Object.values(colors)).size).toBe(2);
 const before=await page.getByTestId('budget-range').innerText();
 const handle=page.getByRole('button',{name:'Reorder Roof section 2',exact:true});
 await expect(handle).toBeVisible({timeout:2000});
 await page.getByRole('group',{name:'Roof section 1',exact:true}).evaluate(el=>el.scrollIntoView({block:'center'}));
 await handle.scrollIntoViewIfNeeded();
 const start=await handle.boundingBox(),target=await page.getByRole('group',{name:'Roof section 1',exact:true}).boundingBox();
 await page.mouse.move(start!.x+start!.width/2,start!.y+start!.height/2);await page.mouse.down();
 await page.mouse.move(start!.x+start!.width/2,target!.y+target!.height-8,{steps:16});await page.mouse.up();
 await expect(page.getByTestId('roof-sections-list').locator('fieldset').first()).toHaveAttribute('aria-label','Roof section 1');
 await expect(page.getByRole('group',{name:'Roof section 2',exact:true})).toHaveAttribute('data-layer-color',colors['Roof section 2']!);
 await expect(page.getByTestId('budget-range')).not.toHaveText(before);
 const dragged=page.getByRole('group',{name:'Roof section 2',exact:true});
 await expect(dragged).toHaveAttribute('data-dropping','false');
 await handle.focus();await handle.press('Space');await expect(dragged).toHaveAttribute('data-dragging','true');
 await handle.press('ArrowUp');await expect(page.getByTestId('roof-sections-list').locator('fieldset').first()).toHaveAttribute('aria-label','Roof section 2');
 await page.keyboard.press('Escape');
 await expect(page.getByTestId('roof-sections-list').locator('fieldset').first()).toHaveAttribute('aria-label','Roof section 1');
 await expect(dragged).toHaveAttribute('data-dropping','false');await expect(dragged).toHaveAttribute('data-dragging','false');await expect(dragged).not.toHaveAttribute('data-dnd-dropping');
 await handle.focus();await handle.press('Space');await expect(dragged).toHaveAttribute('data-dragging','true');
 await handle.press('ArrowUp');await expect(page.getByTestId('roof-sections-list').locator('fieldset').first()).toHaveAttribute('aria-label','Roof section 2');
 await handle.press('Space');await expect(dragged).toHaveAttribute('data-dropping','false');await expect(dragged).toHaveAttribute('data-dragging','false');await expect(dragged).not.toHaveAttribute('data-dnd-dropping');
 await expect(page.getByTestId('budget-range')).toHaveText(before);
 await handle.focus();await handle.press('Space');await expect(dragged).toHaveAttribute('data-dragging','true');
 await handle.press('ArrowDown');await expect(page.getByTestId('roof-sections-list').locator('fieldset').first()).toHaveAttribute('aria-label','Roof section 1');
 await handle.press('Space');await expect(dragged).toHaveAttribute('data-dropping','false');await expect(dragged).toHaveAttribute('data-dragging','false');await expect(dragged).not.toHaveAttribute('data-dnd-dropping');
 await expect(page.getByTestId('budget-range')).not.toHaveText(before);
 await page.getByRole('button',{name:'Save as new project',exact:true}).click();
 await page.getByLabel('Project name',{exact:true}).fill('Sections QA');
 await page.getByLabel('I reviewed the building and these budget assumptions').check();
 await page.getByRole('button',{name:'Save preliminary budget',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Sections QA',exact:true})).toBeVisible();
 await page.reload();await page.getByRole('button',{name:'Open budget assumptions',exact:true}).click();
 await expect(page.getByTestId('roof-sections-list').getByRole('group',{name:/^Roof section \d+$/})).toHaveCount(2);
 await expect(page.getByLabel('Pitch for Roof section 2',{exact:true})).toHaveValue('12');
 await expect(page.getByRole('group',{name:'Roof section 2',exact:true})).toHaveAttribute('data-layer-color',colors['Roof section 2']!);
 await expect(page.getByRole('group',{name:'Roof section 1',exact:true})).toHaveAttribute('data-layer-color',colors['Roof section 1']!);
 await page.getByRole('button',{name:'Select Roof section 1',exact:true}).click();
 await page.getByRole('button',{name:'Edit outline points',exact:true}).click();
 await expect(page.getByRole('button',{name:'Reorder Roof section 1',exact:true})).toBeDisabled();
 await page.getByRole('button',{name:'Cancel outline',exact:true}).click();
 await expect(page.getByTestId('roof-sections-list').getByRole('group',{name:/^Roof section \d+$/})).toHaveCount(2);
 await page.getByLabel('Name for Roof section 1',{exact:true}).fill('Main roof');
 await expect(page.getByRole('group',{name:'Main roof',exact:true})).toHaveAttribute('data-layer-color',colors['Roof section 1']!);
 await expect(page.locator('.roof-layer-editor:visible')).toHaveCount(1);
 await page.setViewportSize({width:390,height:844});
 await page.getByRole('button',{name:'Expand project panel',exact:true}).click();
 await page.getByLabel('Pitch for Main roof',{exact:true}).scrollIntoViewIfNeeded();
 await expect(page.getByLabel('Pitch for Main roof',{exact:true})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();

 const touchHandle=page.getByRole('button',{name:'Reorder Main roof',exact:true});
 await touchHandle.scrollIntoViewIfNeeded();
 const touchStart=await touchHandle.boundingBox(),touchTarget=await page.getByRole('group',{name:'Roof section 2',exact:true}).boundingBox();
 const touch=await page.context().newCDPSession(page),touchX=touchStart!.x+touchStart!.width/2,touchY=touchStart!.y+touchStart!.height/2;
 await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:touchX,y:touchY}]});
 await page.waitForTimeout(350);
 for(let step=1;step<=12;step++){await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:touchX,y:touchY+(touchTarget!.y+touchTarget!.height-8-touchY)*step/12}]});await page.waitForTimeout(20)}
 await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await touch.detach();
 await expect(page.getByTestId('roof-sections-list').locator('fieldset').first()).toHaveAttribute('aria-label','Roof section 2');
 await expect(page.getByRole('group',{name:'Main roof',exact:true})).toHaveAttribute('data-layer-color',colors['Roof section 1']!);
 await page.screenshot({path:'verification/compact-roof-layers-mobile.png',fullPage:true});
});


test('map tools stay visible and drawing tools form one collapsible row without discarding a roof',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'Draw roof outline',exact:true}).click();
 await page.mouse.click(580,300);await page.mouse.click(720,300);await page.mouse.click(720,410);
 await page.getByRole('button',{name:'Close outline',exact:true}).click();
 await expect(page.getByRole('button',{name:'Edit outline points',exact:true})).toBeVisible();
 const selected=await page.getByTestId('map-stage').getAttribute('data-selected-building');
 await expect(page.getByRole('button',{name:'Collapse map toolbar',exact:true})).toHaveCount(0);
 const toolButtons=await page.locator('.roof-draw-toolbar button').evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().y));
 expect(Math.max(...toolButtons)-Math.min(...toolButtons)).toBeLessThan(2);
 await page.getByRole('button',{name:'Collapse drawing toolbar',exact:true}).click();
 await expect(page.getByRole('button',{name:'Edit outline points',exact:true})).not.toBeVisible();
 await expect(page.getByRole('tab',{name:'Satellite',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Expand drawing toolbar',exact:true}).click();
 await expect(page.getByRole('button',{name:'Edit outline points',exact:true})).toBeVisible();
 await expect(page.getByTestId('map-stage')).toHaveAttribute('data-selected-building',selected!);
});

test('map-first start lets a new user trace without searching or creating a project',async({page})=>{
 let searches=0,creates=0;
 page.on('request',r=>{if(r.method()==='POST'&&r.url().endsWith('/api/v1/map/search'))searches++;if(r.method()==='POST'&&r.url().endsWith('/api/v1/projects'))creates++});
 await page.goto('/');
 await expect(page.getByRole('heading',{name:'Start with a roof',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Find an address',exact:true}).click();
 await expect(page.getByLabel('Search map by address',{exact:true})).toBeFocused();
 await page.getByRole('button',{name:'Trace roof',exact:true}).click();
 await expect(page.getByRole('button',{name:'Cancel outline',exact:true})).toBeVisible();
 for(const [x,y] of [[700,400],[740,400],[740,430],[700,430]])await page.mouse.click(x,y);
 await page.getByRole('button',{name:'Close outline',exact:true}).click();
 await expect(page.getByTestId('budget-range')).toContainText('$');
 expect(searches).toBe(0);expect(creates).toBe(0);
});

test('lot focus places a context pin without calculating a roof budget',async({page})=>{
 await page.route('**/api/v1/map/parcel',r=>r.fulfill({json:{type:'FeatureCollection',features:[{type:'Feature',properties:{PCLLOT:'1'},geometry:{type:'Polygon',coordinates:[[[-74.66,40.34],[-74.65,40.34],[-74.65,40.35],[-74.66,40.35],[-74.66,40.34]]]}}],message:'NJ parcel boundary · reference only, not a survey',source_url:'https://nj.gov/njgin/edata/parcels/',attribution:'NJOGIS'}}));
 await page.goto('/');await expect(page.getByText(/New Jersey parcels:/)).toHaveCount(0);await page.getByRole('button',{name:'Highlight a lot',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Highlight a lot',exact:true})).toBeVisible();
 await page.locator('.mapboxgl-canvas').click({position:{x:700,y:400}});
 await expect(page.getByRole('heading',{name:'Property in view',exact:true})).toBeVisible();
 await expect(page.getByTestId('parcel-status')).toContainText('NJ parcel boundary');
 await expect(page.getByTestId('budget-range')).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Trace roof',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Saved projects',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Projects',exact:true})).toBeVisible();
});

test('holding the left button pans the map before drawing and after cancellation',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.goto('/');await page.getByRole('button',{name:'Highlight a lot',exact:true}).click();
 await page.locator('.mapboxgl-canvas').click({position:{x:700,y:400}});
 const marker=page.locator('.mapboxgl-marker');await expect(marker).toBeVisible();
 async function pan(){
  const before=await marker.boundingBox();
  await page.mouse.move(1000,700);await page.mouse.down();await page.waitForTimeout(700);
  await page.mouse.move(1150,700,{steps:15});await page.mouse.up();
  await expect.poll(async()=>Math.abs((await marker.boundingBox())!.x-before!.x)).toBeGreaterThan(50);
 }
 await pan();
 await page.getByRole('button',{name:'Draw roof outline',exact:true}).click();
 await page.getByRole('button',{name:'Cancel outline',exact:true}).click();
 await pan();
});
