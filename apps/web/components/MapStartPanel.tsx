'use client';
import {ArrowLeft,ArrowUpRight,FileText,FolderOpen,MapPin,MousePointer2,Pentagon,Search} from 'lucide-react';
import {Button} from '@/components/ui/button';

export default function MapStartPanel({parcelAttribution,parcelMessage,mode,located,ready,drawing,onMode,onSearch,onTrace,onProjects,onNew,onDemo}:{parcelAttribution?:string;parcelMessage?:string;
 mode:'choose'|'roof'|'lot';located:boolean;ready:boolean;drawing:boolean;
 onMode:(mode:'choose'|'roof'|'lot')=>void;onSearch:()=>void;onTrace:()=>void;onProjects:()=>void;onNew:()=>void;onDemo:()=>void;
}){
 const title=drawing?'Trace the visible roof':mode==='roof'?'Click a highlighted building':mode==='lot'?'Highlight a lot':located?'Property in view':'Start with a roof';
 return <div className="panel-body map-start">
  <header><h1>{title}</h1><p>{drawing?'Click each roof corner, then close the outline with the checkmark.':mode==='roof'?'Move over a building and click its highlight for a footprint budget. Trace manually if its outline is missing or inaccurate.':mode==='lot'?'Click inside a property to look up its parcel boundary where available. Then select or trace the roof.':located?'Check that you are looking at the right property. Select its building or trace the visible roof edges.':'Already see the house? Select it on the satellite map. Search an address only if you need to find it.'}</p></header>
  {mode!=='choose'&&<Button variant="ghost" size="sm" disabled={drawing} onClick={()=>onMode('choose')}><ArrowLeft/>Other ways to start</Button>}
  <div className="map-start-actions">
   <Button className="full" disabled={!ready||drawing} onClick={()=>onMode('roof')}><MousePointer2/>Select a roof</Button>
   <div><Button variant="outline" disabled={drawing} onClick={onSearch}><Search/>Find an address</Button><Button variant="outline" disabled={!ready||drawing} onClick={onTrace}><Pentagon/>Trace roof</Button></div>
   <Button variant="ghost" className="full" disabled={!ready||drawing} onClick={()=>onMode(mode==='lot'?'choose':'lot')}><MapPin/>{mode==='lot'?'Cancel lot selection':'Highlight a lot'}</Button>
  </div>
  {parcelMessage&&<p role="status" className="map-start-note" data-testid="parcel-status">{parcelMessage}</p>}
  {parcelAttribution&&<p className="map-start-note">Parcel source: {parcelAttribution}. Reference boundary, not a survey.</p>}
  <section className="map-start-next"><h2>Then review and save</h2><p>Check roof layers and pitch, review pricing, then save your budget. No project is needed before you trace.</p></section>
  <section className="map-start-other"><h2>Working from a measurement report?</h2><p>Create a project, upload the PDF, then review its measurements before estimating.</p><Button variant="outline" className="full" disabled={drawing} onClick={onNew}><FileText/>New project</Button><div><Button variant="ghost" size="sm" disabled={drawing} onClick={onProjects}><FolderOpen/>Saved projects</Button><Button variant="ghost" size="sm" disabled={drawing} onClick={onDemo}>Open demo project<ArrowUpRight/></Button></div></section>
 </div>;
}
