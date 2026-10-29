"use client"
import { House } from "lucide-react"
import type { Project } from "@/lib/types"
import { SidebarGroup, SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar"
export function NavProjects({projects,activeId,onSelect}:{projects:Project[];activeId:string|null;onSelect:(id:string)=>void}) {
  return <SidebarGroup><SidebarGroupLabel>Recent roofs</SidebarGroupLabel><SidebarMenu>
    {projects.slice(0,6).map(p=><SidebarMenuItem key={p.id}><SidebarMenuButton onClick={()=>onSelect(p.id)} isActive={p.id===activeId} tooltip={p.name}><House/><span className="truncate">{p.name}</span></SidebarMenuButton></SidebarMenuItem>)}
    {!projects.length&&<p className="sidebar-note">Create a project to start your first review.</p>}
  </SidebarMenu></SidebarGroup>
}
