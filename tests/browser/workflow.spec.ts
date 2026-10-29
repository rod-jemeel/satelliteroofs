import {createDemoProject} from './helpers';
import {test,expect,type Page} from '@playwright/test';

async function expectSourcePainted(page:Page){
  await expect.poll(()=>page.locator('.pdf-page canvas').evaluate((canvas:HTMLCanvasElement)=>{
    const pixels=canvas.getContext('2d')!.getImageData(0,0,canvas.width,canvas.height).data;
    let ink=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i+3]>0&&pixels[i]<160&&pixels[i+1]<160&&pixels[i+2]<160)ink++;
    return ink;
  }),{timeout:30000}).toBeGreaterThan(100);
}

// Mask only this browser response to avoid external tile billing during regressions.
// The user's persisted token and settings are never changed.
test.afterEach(async({page})=>{await page.unrouteAll({behavior:'wait'})});

test.beforeEach(async({page})=>{
  await page.route('**/api/v1/settings',async route=>{
    const response=await route.fetch();const settings=await response.json();
    await route.fulfill({response,json:{...settings,map_token:''}});
  });
});

test('report evidence, correction, human verification, deterministic estimate and export',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'Open demo project'}).click();
  await expect(page.getByRole('heading',{name:'Oakridge residence'})).toBeVisible();
  await page.getByRole('tab',{name:'Measurements',exact:true}).click();
  await expect(page.getByText('Tested synthetic layout',{exact:true})).toBeVisible({timeout:60000});
  await expect(page.getByTestId('evidence-highlight')).toBeVisible();
  await expectSourcePainted(page);
  await page.getByRole('tab',{name:'Drawings',exact:true}).click();await expect(page.getByLabel('Report page')).toHaveValue('2');
  await page.getByRole('button',{name:'View source',exact:true}).click();await expect(page.getByLabel('Report page')).toHaveValue('1');
  await expect(page.getByTestId('evidence-highlight')).toBeVisible();
  await page.getByLabel('Edit Roof surface area').fill('2401');
  await page.getByRole('button',{name:'Collapse project panel'}).click();await page.getByRole('button',{name:'Expand project panel'}).click();
  await expect(page.getByLabel('Edit Roof surface area')).toHaveValue('2401');
  await page.getByLabel('Correction reason').fill('Intentional demonstration correction after source review');
  await page.getByRole('button',{name:'Accept edited value'}).click();
  for(const name of ['Ridge + hip','Eaves','Rakes','Valley','Step flashing','Headwall flashing','Pipe penetrations','Reported pitch'])await page.getByRole('button',{name:`Accept ${name}`,exact:true}).click();
  await page.getByRole('button',{name:/^Save review/}).click();await expect(page.getByRole('button',{name:'Verify revision'})).toBeEnabled();
  await page.getByRole('button',{name:'Verify revision'}).click();await expect(page.getByText('Human verified',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Build estimate'}).click();await page.getByLabel('Ice barrier treatment').selectOption('not_required_reviewed');
  await page.getByRole('button',{name:'Calculate estimate',exact:true}).click();await expect(page.getByText('Ready for review',{exact:true})).toBeVisible();
  await expect(page.locator('.line-head').getByText('Unit cost',{exact:true})).toBeVisible();
  await expect(page.getByText('Calculation trace',{exact:true})).toBeVisible();await expect(page.getByText('80 bundle',{exact:false}).first()).toBeVisible();
  await page.getByRole('button',{name:'Approve estimate'}).click();await expect(page.getByText('Approved',{exact:true})).toBeVisible();
  await page.getByLabel('Export format').selectOption('json');const download=page.waitForEvent('download');await page.getByRole('button',{name:'Export',exact:true}).click();
  expect((await download).suggestedFilename()).toMatch(/customer.*\.json/);await page.screenshot({path:'verification/estimate-desktop.png',fullPage:true});
  // A deliberate null in a newer review must not fall back to the extracted area.
  await page.getByRole('tab',{name:'Measurements',exact:true}).click();
  await page.getByRole('button',{name:'Mark not available',exact:true}).click();await page.getByRole('button',{name:/^Save review/}).click();
  await expect(page.getByText('Measurements r2',{exact:true})).toBeVisible();await page.getByRole('tab',{name:'Overview',exact:true}).click();
  await expect(page.locator('.roof-area strong')).toHaveText('—');
});

test('real upload preserves rotated crop evidence through zoom',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'New project',exact:true}).first().click();
  await page.getByLabel('Project name',{exact:true}).fill('Rotated crop upload');await page.getByRole('button',{name:'Create project',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Rotated crop upload',exact:true})).toBeVisible();
  await page.locator('input[type=file]').setInputFiles('fixtures/rotated-cropped.pdf');await expect(page.getByText('Unvalidated layout',{exact:true})).toBeVisible({timeout:60000});
  const highlight=page.getByTestId('evidence-highlight');await expect(highlight).toBeVisible();
  await expectSourcePainted(page);
  const sheet=await page.locator('.pdf-page').boundingBox();const box=await highlight.boundingBox();
  expect((box!.x-sheet!.x)/sheet!.width).toBeCloseTo(.296419,2);expect((box!.y-sheet!.y)/sheet!.height).toBeCloseTo(.08169,2);
  await page.locator('.evidence-dock').getByLabel('Zoom in',{exact:true}).click();await expect(highlight).toBeVisible();
  await expectSourcePainted(page);
  const zoomSheet=await page.locator('.pdf-page').boundingBox();const zoomBox=await highlight.boundingBox();
  expect((zoomBox!.x-zoomSheet!.x)/zoomSheet!.width).toBeCloseTo(.296419,2);
  await page.getByLabel('Reset view',{exact:true}).click();await page.screenshot({path:'verification/rotated-crop-evidence.png',fullPage:true});
});

test('missing inputs remain a partial draft and coordinates work without map credentials',async({page})=>{
  await page.goto('/');await page.getByRole('button',{name:'New project',exact:true}).first().click();
  await page.getByLabel('Project name',{exact:true}).fill('Missing values workflow');await page.getByRole('button',{name:'Create project',exact:true}).click();
  await page.getByRole('tab',{name:'Measurements',exact:true}).click();
  await page.getByLabel('Edit Roof surface area').fill('2400');await page.getByLabel('Correction reason').fill('Manual source review');
  await page.getByLabel('Area basis').selectOption('sloped_surface');await page.getByRole('button',{name:'Accept edited value'}).click();
  await page.getByRole('button',{name:/^Save review/}).click();await page.getByRole('tab',{name:'Estimate',exact:true}).click();
  await page.getByRole('button',{name:'Calculate estimate',exact:true}).click();await expect(page.getByText('Partial',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Approve estimate'})).toBeDisabled();await page.getByRole('tab',{name:'Overview',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Connect your property map'})).toBeVisible();await page.locator('.manual-location summary').click();
  await page.getByLabel('Latitude',{exact:true}).fill('30.2672');await page.getByLabel('Longitude',{exact:true}).fill('-97.7431');
  await page.getByRole('button',{name:'Preview pin',exact:true}).click();await expect(page.getByText('Selected property pin',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Confirm property pin'}).click();await expect(page.getByText('Confirmed',{exact:true})).toBeVisible();
  await page.reload();await expect(page.getByText('Verified property pin',{exact:true})).toBeVisible();
});

test('one floating panel uses a dropdown for navigation and settings',async({page})=>{
 const demoProjectId=await createDemoProject(page);await page.goto('/?project='+demoProjectId);
 await expect(page.getByRole('heading',{name:'Oakridge residence',exact:true})).toBeVisible();
 const panel=await page.getByLabel('SatelliteRoofs project panel',{exact:true}).boundingBox();
 await page.getByRole('button',{name:'Open workspace menu',exact:true}).click();
 await expect(page.getByRole('menu')).toBeVisible();
 const after=await page.getByLabel('SatelliteRoofs project panel',{exact:true}).boundingBox();
 expect({x:after!.x,y:after!.y,width:after!.width}).toEqual({x:panel!.x,y:panel!.y,width:panel!.width});
 await expect(page.locator('[data-slot=sidebar-container]')).toHaveCount(0);
 await page.getByRole('menuitem',{name:'Projects',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Projects',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Open workspace menu',exact:true}).click();
 await page.getByRole('menuitem',{name:'Settings',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Workspace settings',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Close settings',exact:true}).click();
});

test('mobile starts with the map, expands review and opens source without overflow',async({page})=>{
  await page.setViewportSize({width:390,height:844});const demoProjectId=await createDemoProject(page);await page.goto('/?project='+demoProjectId);
  await expect(page.getByRole('button',{name:'Expand project panel'})).toBeVisible();const panel=await page.getByLabel('SatelliteRoofs project panel',{exact:true}).boundingBox();expect(panel!.height).toBeLessThan(180);
  await page.screenshot({path:'verification/workflow-map-mobile.png',fullPage:true});await page.getByRole('button',{name:'Expand project panel'}).click();
  await page.getByRole('tab',{name:'Measurements',exact:true}).click();await expect(page.getByTestId('evidence-highlight')).toBeVisible();
  await page.getByRole('button',{name:'Close source report'}).click();await expect(page.getByRole('heading',{name:'Measurements',exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();await page.screenshot({path:'verification/workflow-review-mobile.png',fullPage:true});
  await page.getByRole('button',{name:'Source report',exact:true}).click();await expect(page.locator('.pdf-page canvas')).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();await page.getByRole('button',{name:'Close source report'}).click();
  await page.getByRole('button',{name:'Open workspace menu',exact:true}).click();await expect(page.getByRole('menu')).toBeVisible();
  await page.getByRole('menuitem',{name:'Projects',exact:true}).click();await expect(page.getByRole('heading',{name:'Projects',exact:true})).toBeVisible();
});


test('action errors use a dismissible toast and preserve the sidebar and form',async({page})=>{
 await page.route('**/api/v1/projects',async route=>{if(route.request().method()==='POST')await route.fulfill({status:503,json:{detail:'Failed to fetch'}});else await route.continue()});
 await page.goto('/');await page.getByRole('button',{name:'New project',exact:true}).click();
 await page.getByLabel('Project name',{exact:true}).fill('Keep this draft');
 await page.getByRole('button',{name:'Create project',exact:true}).click();
 const toast=page.locator('[data-sonner-toast]');await expect(toast).toContainText('Could not complete that action');
 await expect(toast).toContainText('The connection was interrupted');await expect(page.locator('.panel-alert')).toHaveCount(0);
 await expect(page.getByLabel('Project name',{exact:true})).toHaveValue('Keep this draft');
 await expect(toast).toHaveAttribute('data-mounted','true');
 await expect.poll(async()=>{const box=await toast.boundingBox();return !!box&&box.y+box.height<=1080-16}).toBeTruthy();
 await page.screenshot({path:'verification/action-error-toast.png'});
 await toast.getByRole('button',{name:'Close toast',exact:true}).click();await expect(toast).toHaveCount(0);
 await expect(page.getByLabel('Project name',{exact:true})).toHaveValue('Keep this draft');
});
