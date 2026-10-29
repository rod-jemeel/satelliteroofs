'use client';
import {useState,type ReactNode} from 'react';
import type {Map} from 'mapbox-gl';
import {ChevronRight,Compass,Minus,Plus,Pentagon} from 'lucide-react';
import {Collapsible,CollapsibleContent,CollapsibleTrigger} from '@/components/ui/collapsible';
import {Button} from '@/components/ui/button';
import {Separator} from '@/components/ui/separator';
import MapToolButton from '@/components/MapToolButton';

export default function MapToolDock({map,drawing,children,onHost}:{map:Map|null;drawing:boolean;children:ReactNode;onHost:(node:HTMLDivElement|null)=>void}){
 const [drawOpen,setDrawOpen]=useState(true);
 return <div className="map-tool-stack">
 <div className="map-tool-dock map-view-dock" aria-label="Map tools">
  <div className="map-tool-content">
   <div className="map-tool-group" aria-label="Map view">{children}</div>
   <Separator orientation="vertical"/>
   <div className="map-tool-group" aria-label="Map navigation">
    <MapToolButton label="Zoom in" disabled={!map} onClick={()=>map?.zoomIn()}><Plus/></MapToolButton>
    <MapToolButton label="Zoom out" disabled={!map} onClick={()=>map?.zoomOut()}><Minus/></MapToolButton>
    <MapToolButton label="Reset bearing to north" disabled={!map||drawing} onClick={()=>map?.easeTo({bearing:0,pitch:0,duration:200})}><Compass/></MapToolButton>
   </div>
  </div>
 </div>
 <Collapsible className="map-tool-dock drawing-tool-dock" open={drawOpen} onOpenChange={setDrawOpen} aria-label="Drawing tools">
  <CollapsibleTrigger asChild><Button variant="ghost" size="icon" aria-label={drawOpen?'Collapse drawing toolbar':'Expand drawing toolbar'} title={drawOpen?'Collapse drawing toolbar':'Drawing tools'} disabled={drawing}>{drawOpen?<ChevronRight/>:<Pentagon/>}</Button></CollapsibleTrigger>
  <CollapsibleContent forceMount hidden={!drawOpen} className="map-tool-content"><div ref={onHost} className="map-roof-tool-host"/></CollapsibleContent>
 </Collapsible>
 </div>;
}
