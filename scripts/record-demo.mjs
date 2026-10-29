// Records the real local PDF workflow with synthetic data and no external calls.
import {chromium,expect} from '@playwright/test';
import {spawnSync} from 'node:child_process';
import {mkdir,copyFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const media=path.join(root,'docs/media');
await mkdir(media,{recursive:true});
const browser=await chromium.launch();
const context=await browser.newContext({viewport:{width:1440,height:1080},recordVideo:{dir:path.join(root,'.runtime/demo-recordings'),size:{width:1440,height:1080}}});
const page=await context.newPage();
let blocked=0,completed=false;
await page.route('**/*',async route=>{
 const url=new URL(route.request().url());
 if(url.hostname!=='127.0.0.1'&&url.hostname!=='localhost'){blocked++;return route.abort();}
 return route.continue();
});
await page.route('**/api/v1/settings',async route=>{
 const response=await route.fetch();const settings=await response.json();
 await route.fulfill({response,json:{...settings,map_token:''}});
});
await page.route('**/api/v1/ai/**',r=>r.abort());
async function caption(text,seconds=4){
 await page.evaluate(text=>{
  let el=document.getElementById('demo-caption');
  if(!el){el=document.createElement('div');el.id='demo-caption';document.body.append(el);Object.assign(el.style,{position:'fixed',bottom:'16px',left:'50%',transform:'translateX(-50%)',maxWidth:'900px',padding:'14px 24px',borderRadius:'10px',background:'#171b21',color:'#fff',font:'500 18px/1.5 sans-serif',textAlign:'center',zIndex:'2147483647',pointerEvents:'none'});}
  el.textContent=text;
 },text);
 await page.waitForTimeout(seconds*1000);
}
async function screenshot(name){
 await page.evaluate(()=>{const el=document.getElementById('demo-caption');if(el)el.style.visibility='hidden'});
 if(['estimate','calculation-trace'].includes(name))await page.locator('#roofready-project-panel').screenshot({path:path.join(media,name+'.png')});
 else await page.screenshot({path:path.join(media,name+'.png')});
 await page.evaluate(()=>{const el=document.getElementById('demo-caption');if(el)el.style.visibility='visible'});
}
try{
 await page.goto('http://127.0.0.1:3210/');
 await caption('SatelliteRoofs · Recorded prototype walkthrough · Synthetic report and demonstration pricing',5);
 await page.getByRole('button',{name:'New project',exact:true}).click();
 await page.getByLabel('Project name',{exact:true}).fill('Sample roof report');
 await caption('Create a project, then upload a roofing measurement PDF. No map or AI account is needed for this workflow.');
 await page.getByRole('button',{name:'Create project',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Sample roof report',exact:true})).toBeVisible();
 const upload=page.locator('input[type=file]');
 await upload.setInputFiles(path.join(root,'fixtures/demo-roof-report.pdf'));
 await expect(page.getByText('Tested synthetic layout',{exact:true})).toBeVisible({timeout:60000});
 await expect(page.getByTestId('evidence-highlight')).toBeVisible();
 await page.waitForFunction(()=>!document.querySelector('.render-indicator'));
 await caption('Extracted measurements stay linked to the original PDF. This sample has 2,400 ft² of roof surface and a 6/12 pitch.',6);
 await screenshot('report-review');
 await page.getByRole('tab',{name:'Drawings',exact:true}).click();
 await expect(page.getByLabel('Report page')).toHaveValue('2');
 await page.waitForFunction(()=>!document.querySelector('.render-indicator'));
 await caption('Review the original roof drawing alongside the extracted measurements.',5);
 await screenshot('report-drawing');
 await page.getByRole('button',{name:'View source',exact:true}).click();
 await page.getByLabel('Edit Roof surface area').fill('2401');
 await caption('A reviewer can correct an extracted value and record why it changed.',4);
 await page.getByLabel('Edit Roof surface area').fill('2400');
 await page.getByLabel('Correction reason').fill('Confirmed 2,400 ft² against the synthetic source report.');
 await page.getByRole('button',{name:'Accept edited value'}).click();
 for(const name of ['Ridge + hip','Eaves','Rakes','Valley','Step flashing','Headwall flashing','Pipe penetrations','Reported pitch']){
  await page.getByRole('button',{name:`Accept ${name}`,exact:true}).click();
  await page.waitForTimeout(250);
 }
 await page.getByRole('button',{name:/^Save review/}).click();
 await expect(page.getByRole('button',{name:'Verify revision'})).toBeEnabled();
 await caption('Save a measurement revision, then verify it. Extraction and human approval are separate steps.',5);
 await page.getByRole('button',{name:'Verify revision'}).click();
 await expect(page.getByText('Human verified',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Build estimate'}).click();
 await page.getByLabel('Ice barrier treatment').selectOption('not_required_reviewed');
 await caption('Choose the estimating assumptions. Products, coverage, labor and rates here are demonstration configurations.',5);
 await page.getByRole('button',{name:'Calculate estimate',exact:true}).click();
 await expect(page.getByText('Ready for review',{exact:true})).toBeVisible();
 await page.locator('.estimate-title').scrollIntoViewIfNeeded();
 await caption('Python calculates material packages, labor, costs and selling price. AI is not responsible for the math.',6);
 if(await page.getByText('Calculation trace',{exact:true}).isVisible())await page.locator('.line-row').first().click();
 await screenshot('estimate');
 if(!await page.getByText('Calculation trace',{exact:true}).isVisible())await page.locator('.line-row').first().click();
 await page.getByText('Calculation trace',{exact:true}).scrollIntoViewIfNeeded();
 await expect(page.getByText('Calculation trace',{exact:true})).toBeVisible();
 await caption('Each estimate line exposes its inputs, formula and package rounding.',5);
 await screenshot('calculation-trace');
 await page.getByRole('button',{name:'Approve estimate',exact:true}).click();
 await expect(page.getByText('Approved',{exact:true})).toBeVisible();
 await page.getByLabel('Export format').selectOption('pdf');
 await caption('Approve the reviewed estimate, then export a customer proposal PDF.',4);
 const download=page.waitForEvent('download');
 await page.getByRole('button',{name:'Export',exact:true}).click();
 await (await download).saveAs(path.join(root,'.runtime/demo-customer-proposal.pdf'));
 await caption('Prototype limits: real provider layouts still need validation; scanned PDFs need manual entry; CRM and production handoff are not complete.',7);
 completed=true;
 console.log(JSON.stringify({workflow:'upload-review-verify-estimate-approve-export',external_requests_blocked:blocked,paid_provider_calls:0}));
}finally{
 const video=page.video();await context.close();
 if(video&&completed){
  await copyFile(await video.path(),path.join(media,'walkthrough.webm'));
  if(process.env.FFMPEG_PATH){const converted=spawnSync(process.env.FFMPEG_PATH,['-hide_banner','-loglevel','error','-y','-i',path.join(media,'walkthrough.webm'),'-c:v','libx264','-pix_fmt','yuv420p','-crf','23','-movflags','+faststart',path.join(media,'walkthrough.mp4')],{stdio:'inherit',windowsHide:true});if(converted.status!==0)throw new Error('MP4 conversion failed; the original WebM is preserved.');}
 }
 await browser.close();
}
