'use client';
import type {CSSProperties} from 'react';
import {Accessibility,Feedback} from '@dnd-kit/dom';
import {DragDropProvider,type DragStartEvent,type DragOverEvent,type DragEndEvent} from '@dnd-kit/react';
import {isSortable,useSortable} from '@dnd-kit/react/sortable';
import {GripVertical} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Field,FieldLabel} from '@/components/ui/field';
import {withRoofColors,type RoofSection} from '@/lib/buildings';
import type {BudgetSnapshot} from '@/lib/types';

const layerAccessibility=Accessibility.configure({
 screenReaderInstructions:{draggable:'Press Space to pick up a roof layer, use arrow keys to reorder, Space to drop, or Escape to cancel.'},
 announcements:{
  dragstart:({operation}:DragStartEvent)=>`Picked up ${operation.source?.data.name||'roof layer'}.`,
  dragover:({operation}:DragOverEvent)=>isSortable(operation.source)?`${operation.source.data.name}, position ${operation.source.index+1}.`:undefined,
  dragend:({operation,canceled}:DragEndEvent)=>canceled?'Layer reorder cancelled.':isSortable(operation.source)?`${operation.source.data.name} placed at position ${operation.source.index+1}.`:'Layer dropped.'
 }
});
type SectionMeasure=NonNullable<BudgetSnapshot['sections']>[number];
export default function RoofSections({sections,activeId,measurements,disabled,onChange}:{sections:RoofSection[];activeId?:string;measurements?:BudgetSnapshot['sections'];disabled:boolean;onChange:(sections:RoofSection[],activeId?:string)=>void}){
 sections=withRoofColors(sections);
 const selectedId=activeId||sections[0]?.id;
 const change=(id:string,patch:Partial<RoofSection>)=>onChange(sections.map(s=>s.id===id?{...s,...patch}:s),selectedId);
 return <section className="roof-sections" data-testid="roof-sections-list">
  <h2>Roof sections <span>{sections.length}</span></h2>
  <p>{sections.length===1&&sections[0].origin==='mapbox_vector'?'Mapbox starting outline. Use Edit outline points to align it with the roof.':'Drag the grip to reorder. Higher sections own the overlap.'}</p>
  <DragDropProvider plugins={defaults=>[...defaults,layerAccessibility,Feedback.configure({dropAnimation:null})]} onDragEnd={event=>{
   const {source,target}=event.operation;
   if(disabled||event.canceled||!target||!isSortable(source))return;
   const from=sections.findIndex(s=>s.id===source.id),to=source.index;
   if(from<0||!Number.isInteger(to)||to<0||to>=sections.length||from===to)return;
   const next=sections.slice(),[moved]=next.splice(from,1);next.splice(to,0,moved);
   onChange(next,selectedId);
  }}>
   <div className="roof-layer-list">{sections.map((section,index)=><SortableRoofSection key={section.id} section={section} index={index} active={section.id===selectedId} measured={measurements?.find(s=>s.id===section.id)} disabled={disabled} canReorder={sections.length>1} onSelect={()=>onChange(sections,section.id)} onChange={patch=>change(section.id,patch)}/>)}</div>
  </DragDropProvider>
  <p>Pitch is assumed. Hidden roof surfaces aren’t detected.</p>
 </section>;
}

function SortableRoofSection({section,index,active,measured,disabled,canReorder,onSelect,onChange}:{section:RoofSection;index:number;active:boolean;measured?:SectionMeasure;disabled:boolean;canReorder:boolean;onSelect:()=>void;onChange:(patch:Partial<RoofSection>)=>void}){
 const sortable=useSortable({id:section.id,index,disabled:disabled||!canReorder,data:{name:section.name}});
 return <fieldset ref={sortable.ref} aria-label={section.name} disabled={disabled} className="roof-section" data-active={active} data-dragging={sortable.isDragging} data-dropping={sortable.isDropping} data-included={section.enabled} data-layer-color={section.color} style={{'--roof-color':section.color} as CSSProperties}>
  <div className="roof-layer-heading">
   {active?<>
    <Button variant="ghost" size="icon" className="roof-layer-select" aria-label={`Select ${section.name}`} aria-pressed onClick={onSelect}><span className="roof-layer-swatch" aria-hidden="true"/></Button>
    <Field className="roof-layer-name"><FieldLabel className="sr-only" htmlFor={`roof-${section.id}-name`}>Section name</FieldLabel><Input id={`roof-${section.id}-name`} aria-label={`Name for ${section.name}`} title="Rename roof section" maxLength={100} value={section.name} onChange={e=>onChange({name:e.target.value})}/></Field>
   </>:<Button variant="ghost" size="sm" className="roof-layer-title" aria-label={`Select ${section.name}`} aria-pressed={false} onClick={onSelect}><span className="roof-layer-swatch" aria-hidden="true"/>{section.name}</Button>}
   <Button ref={sortable.handleRef} variant="ghost" size="icon" className="roof-layer-drag" aria-label={`Reorder ${section.name}`} title="Drag to reorder. Space to pick up, arrows to move, Space to drop, Escape to cancel." disabled={disabled||!canReorder}><GripVertical/></Button>
  </div>
  <div className="roof-layer-summary">{measured?<><span>{Math.round(Number(measured.counted_ft2)).toLocaleString()} ft² counted</span><span>{Number(measured.covered_ft2)>0?`${Math.round(Number(measured.covered_ft2)).toLocaleString()} ft² covered`:active?'No covered area':`${section.pitch_rise}/12 pitch`}</span></>:<span>Check geometry and pitch</span>}{!section.enabled&&<span>Excluded</span>}</div>
  <div className="roof-layer-editor" hidden={!active}>
   <div className="roof-layer-controls">
    <Field className="roof-layer-pitch"><FieldLabel htmlFor={`roof-${section.id}-pitch`}>Pitch</FieldLabel><div><Input id={`roof-${section.id}-pitch`} aria-label={`Pitch for ${section.name}`} title="Assumed rise per 12 inches of run" type="number" min={0} max={18} step="any" value={section.pitch_rise} onChange={e=>onChange({pitch_rise:e.target.value})}/><span>/ 12</span></div></Field>
    <label className="roof-section-check"><input type="checkbox" aria-label={`Include ${section.name} in budget`} checked={section.enabled} onChange={e=>onChange({enabled:e.target.checked})}/>Include in budget</label>
   </div>
   {(section.include_covered||Number(measured?.covered_ft2)>0)&&<label className="roof-section-check roof-covered-option"><input type="checkbox" aria-label={`Count covered lower area for ${section.name}`} checked={section.include_covered} onChange={e=>onChange({include_covered:e.target.checked})}/>Count covered lower area</label>}
  </div>
 </fieldset>;
}
