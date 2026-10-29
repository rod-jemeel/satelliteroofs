import {test,expect} from '@playwright/test';
const researchId='2f2fbe45-c0c8-421e-b50d-15764f3b130f';
const source='https://www.homedepot.com/p/test-only/123';
const quote=(id:string,category:string,product:string,price:string,coverage:string|null)=>({id,category,product,supplier:'Test supplier',unit:'pack',price_usd:price,coverage_ft2:coverage,source_url:source,coverage_source_url:coverage?source:null,availability:'Synthetic browser fixture; verify supplier.'});
const quotes=[quote('a','shingles','Fixture shingles','40','40'),quote('b','shingles','Alternative fixture shingles','50','50'),quote('u','underlayment','Fixture underlayment','100','1000'),quote('n','nails','Fixture nails','30',null)];
const record={id:researchId,status:'completed',request:{query:'Roof materials',location:'Chicago, IL'},model:'test-model',started_at:'2026-10-26T01:00:00Z',checked_at:'2026-10-26T01:01:00Z',quotes,notes:['Synthetic data for testing.']};
test.afterEach(async({page})=>{await page.unrouteAll({behavior:'wait'})});
test.beforeEach(async({page})=>{
 await page.route('**/api/v1/map/reverse',r=>r.fulfill({json:[]}));
 await page.route('**/api/v1/settings',async route=>{const response=await route.fetch();await route.fulfill({response,json:{...await response.json(),map_token:''}})});
 await page.route('**/api/v1/ai/connection',r=>r.fulfill({json:{status:'ready',model:'test-model',adapter:'responses'}}));
 await page.route('**/api/v1/price-research/latest',r=>r.fulfill({json:null}));
});

test('material research keeps sources, composes reviewed rates and never auto-applies',async({page})=>{
 let searches=0,applies=0;
 await page.route('**/api/v1/price-research',async route=>{searches++;expect(route.request().headers()['idempotency-key']).toBeTruthy();expect(Object.keys(route.request().postDataJSON()).sort()).toEqual(['location','query']);await route.fulfill({json:record})});
 await page.route('**/api/v1/price-research/proposal',async route=>{applies++;const basis=route.request().postDataJSON();expect(basis.quote_ids.sort()).toEqual(['b','u']);expect(basis.reviewed).toBe(true);await route.fulfill({json:{research_id:researchId,checked_at:record.checked_at,model:record.model,quotes:[quotes[1],quotes[2]],material_rate_ft2:'1.210000',rate_low:'3.21',rate_high:'4.21',basis,exclusions:[]}})});
 await page.route('**/api/v1/property-budgets/preview',async route=>{const body=route.request().postDataJSON();const response=await route.fetch({postData:{...body,pricing_basis:null}});const result=await response.json();await route.fulfill({response,json:{...result,inputs:{...result.inputs,pricing_basis:body.pricing_basis}}})});
 await page.goto('/');await page.getByRole('button',{name:'Budget calculator',exact:true}).click();await page.getByLabel('Building footprint (ft²)',{exact:true}).fill('2000');
 await page.getByRole('button',{name:'Research material prices',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Material price research',exact:true});await expect(dialog).toBeVisible();
 await dialog.getByRole('button',{name:'Research prices',exact:true}).click();
 await expect(dialog.getByRole('link',{name:'Supplier page'}).first()).toHaveAttribute('href',source);
 await expect(dialog.getByRole('checkbox',{name:'Select Fixture nails',exact:true})).toBeDisabled();
 await dialog.getByRole('checkbox',{name:'Select Fixture shingles',exact:true}).check();
 await dialog.getByRole('checkbox',{name:'Select Alternative fixture shingles',exact:true}).check();
 await expect(dialog.getByRole('checkbox',{name:'Select Fixture shingles',exact:true})).not.toBeChecked();
 await dialog.getByRole('checkbox',{name:'Select Fixture underlayment',exact:true}).check();
 await dialog.getByLabel('Material waste (%)',{exact:true}).fill('10');
 await dialog.getByLabel('Lower labor and other rate',{exact:true}).fill('2');await dialog.getByLabel('Upper labor and other rate',{exact:true}).fill('3');
 await expect(dialog.getByRole('button',{name:'Apply selected prices',exact:true})).toBeDisabled();expect(applies).toBe(0);
 await dialog.getByRole('checkbox',{name:'I reviewed the supplier prices, pack coverage, waste, and labor assumptions.',exact:true}).check();
 await dialog.getByRole('button',{name:'Apply selected prices',exact:true}).click();await expect(dialog).not.toBeVisible();
 await expect(page.getByText('Reviewed material research + your labor',{exact:true})).toBeVisible();
 await page.locator('.budget-pricing summary').click();await expect(page.getByLabel('Lower rate ($/ft²)',{exact:true})).toHaveValue('3.21');await expect(page.getByLabel('Upper rate ($/ft²)',{exact:true})).toHaveValue('4.21');
 const updated=page.waitForResponse(r=>r.url().endsWith('/property-budgets/preview')&&r.request().postDataJSON().rate_low==='4');
 await page.getByLabel('Lower rate ($/ft²)',{exact:true}).fill('4');await expect(page.getByText('Your rates · assumptions below',{exact:true})).toBeVisible();
 await (await updated).finished();
 expect(searches).toBe(1);expect(applies).toBe(1);
});

test('unknown research is recovered through a read without another provider search',async({page})=>{
 let starts=0,reads=0;
 await page.route('**/api/v1/price-research',r=>{starts++;return r.fulfill({json:{...record,status:'unknown',quotes:[],message:'Outcome unknown; request will not be replayed.'}})});
 await page.route(/\/api\/v1\/price-research\/[0-9a-f-]{36}$/,r=>{reads++;return r.fulfill({json:record})});
 await page.goto('/');await page.getByRole('button',{name:'Budget calculator',exact:true}).click();await page.getByRole('button',{name:'Research material prices',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Material price research',exact:true});await dialog.getByRole('button',{name:'Research prices',exact:true}).click();
 await expect(dialog.getByText('Outcome unknown; request will not be replayed.',{exact:true})).toBeVisible();
 await dialog.getByRole('button',{name:'Check request status',exact:true}).click();await expect(dialog.getByText('Fixture underlayment',{exact:true})).toBeVisible();
 expect(starts).toBe(1);expect(reads).toBe(1);
});

test('phone research requires a connection and preserves the roof budget',async({page})=>{
 await page.route('**/api/v1/ai/connection',r=>r.fulfill({json:{status:'authentication_required',model:''}}));
 await page.setViewportSize({width:390,height:844});await page.goto('/');await page.getByRole('button',{name:'Budget calculator',exact:true}).click();await page.getByLabel('Building footprint (ft²)',{exact:true}).fill('2000');
 await page.getByRole('button',{name:'Research material prices',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Material price research',exact:true});await expect(dialog.getByRole('button',{name:'Research prices',exact:true})).toBeDisabled();
 await expect(dialog.getByRole('button',{name:'Open AI settings',exact:true})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();await page.screenshot({path:'verification/material-research-mobile.png',fullPage:true});
 await dialog.locator('[data-slot=dialog-footer]').getByRole('button',{name:'Close',exact:true}).click();await expect(page.getByLabel('Building footprint (ft²)',{exact:true})).toHaveValue('2000');
});
