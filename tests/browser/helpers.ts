import type {Page} from '@playwright/test';

// A fresh synthetic project per test: no dependence on a developer database.
export async function createDemoProject(page:Page){
 const session=await page.request.get('/api/v1/session');
 if(!session.ok())throw new Error('Local session unavailable');
 const {csrf}=await session.json();
 const response=await page.request.post('/api/v1/demo',{data:{},headers:{'x-csrf-token':csrf,origin:'http://127.0.0.1:3210'}});
 if(!response.ok())throw new Error('Could not create synthetic report fixture');
 const {project_id}=await response.json();
 // Wait for the local worker, not an external AI provider.
 for(let i=0;i<120;i++){
  const p=await (await page.request.get('/api/v1/projects/'+project_id)).json();
  if(p.runs?.some((r:{status:string})=>r.status==='needs_review'))return project_id as string;
  await new Promise(resolve=>setTimeout(resolve,250));
 }
 throw new Error('Synthetic report processing timed out');
}
