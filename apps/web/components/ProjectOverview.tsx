'use client';
import {useState} from 'react';
import {MapPin,Check,FileText,ArrowUpRight,ScanLine,History} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Badge} from '@/components/ui/badge';
import {Field,FieldGroup,FieldLabel} from '@/components/ui/field';
import {type Project,type Location,usd,pretty} from '@/lib/types';

export default function ProjectOverview({project,point,picking,onPick,onPicking,onConfirm,onReview,onReport,onEstimate,onHistory,onBudget,onError}:{
 project:Project;point:Location|null;picking:boolean;onPick:(p:Location)=>void;onPicking:()=>void;onConfirm:()=>void;
 onReview:()=>void;onReport:()=>void;onEstimate:()=>void;onHistory:()=>void;onBudget:()=>void;onError:(s:string)=>void;
}){
 const [lat,setLat]=useState(''),[lng,setLng]=useState('');
 const run=project.runs.find(r=>r.id===project.current_run);
 const revision=project.revisions[0]?.data.run_id===project.current_run?project.revisions[0]:undefined;
 const areaInput=revision?revision.data.values.roof_area:run?.data.observations?.find(o=>o.field==='roof_area');
 const area=areaInput?.value;
 const areaLabel=areaInput?.area_basis==='sloped_surface'?'ft² surface area':areaInput?.area_basis==='horizontal_footprint'?'ft² footprint area':'ft² reported area';
 const verified=project.revisions[0]?.status==='verified'&&project.revisions[0]?.data.run_id===project.current_run;
 return <div className="overview-content">
  {!run&&!project.data.budget&&<section><h2>Start with your measurement report</h2><p>Upload the PDF, review its measurements, then build an estimate. A map address is optional.</p><Button className="full" onClick={onReport}><FileText/>Choose measurement PDF</Button></section>}
  {project.data.budget&&<section className="saved-budget"><Badge variant="secondary">Preliminary</Badge><h2>Saved preliminary budget</h2><strong>{usd(project.data.budget.low).replace('.00','')} – {usd(project.data.budget.high).replace('.00','')}</strong><p>{project.data.budget.inputs.rates_source==='demo'?'Demo rates':'User-entered rates'} · unverified roof assumptions</p><Button variant="outline" className="full" onClick={onBudget}>Open budget assumptions</Button></section>}
  <section className="property-location">
   <div className="section-row"><h2>Property location</h2><span className={point?.confirmed?'location-status confirmed':'location-status'}>{point?.confirmed?'Confirmed':'Not confirmed'}</span></div>
   {point?<div className="selected-location"><MapPin/><div><strong>{point.confirmed?'Verified property pin':'Selected property pin'}</strong><p>{point.latitude.toFixed(6)}, {point.longitude.toFixed(6)}</p></div>{!point.confirmed&&<Button size="sm" aria-label="Confirm property pin" onClick={onConfirm}><Check data-icon="inline-start"/>Confirm</Button>}</div>:<p className="location-help">Use the top search to navigate, then place and confirm a pin on the correct building.</p>}
   <Button variant="outline" className="full" onClick={onPicking}><MapPin data-icon="inline-start"/>{picking?'Cancel pin placement':point?'Move property pin':'Place property pin'}</Button>
   <details className="manual-location"><summary>Enter coordinates manually</summary><FieldGroup><Field><FieldLabel htmlFor="manual-lat">Latitude</FieldLabel><Input id="manual-lat" aria-label="Latitude" value={lat} onChange={e=>setLat(e.target.value)} placeholder="30.2672" type="number" step="any"/></Field><Field><FieldLabel htmlFor="manual-lng">Longitude</FieldLabel><Input id="manual-lng" aria-label="Longitude" value={lng} onChange={e=>setLng(e.target.value)} placeholder="-97.7431" type="number" step="any"/></Field><Button variant="outline" disabled={!lat||!lng} onClick={()=>onPick({latitude:Number(lat),longitude:Number(lng),provider:'manual',storage_basis:'user_supplied',label:project.address||'Manual property pin',confirmed:false,accuracy:'user_selected'})}>Preview pin</Button></FieldGroup></details>
  </section>
  <section className="roof-summary"><div className="section-row"><h2>Roof measurements</h2><Badge variant="secondary">{verified?'Verified':'Needs review'}</Badge></div><div className="roof-area"><strong>{area!==null&&area!==undefined?Number(area).toLocaleString('en-US'):'—'}</strong><span>{areaLabel}</span></div><p>{run?.data.provider||'No report uploaded'}{project.data.demo?' · Demo data':''}</p><Button className="full" onClick={onReview}><ScanLine data-icon="inline-start"/>Review measurements<ArrowUpRight data-icon="inline-end"/></Button><Button variant="ghost" className="full" onClick={onReport}><FileText data-icon="inline-start"/>Open source report</Button></section>
  {project.estimates[0]&&<section className="estimate-preview"><div><h2>Latest estimate</h2><p>Revision {project.estimates[0].seq} · {pretty(project.estimates[0].status)}</p></div><Button variant="ghost" onClick={onEstimate}>{usd(project.estimates[0].data.total)}<ArrowUpRight data-icon="inline-end"/></Button></section>}
  <Button variant="ghost" className="activity-button" onClick={onHistory}><History data-icon="inline-start"/>Revision history<span>{project.events.length} events</span></Button>
 </div>
}
