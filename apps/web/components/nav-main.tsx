"use client"
import { FolderOpen, Plus, Calculator, Settings2 } from "lucide-react"
import { SidebarGroup, SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar"
export function NavMain({onProjects,onNew,onEstimate,onSettings,hasProject}:{onProjects:()=>void;onNew:()=>void;onEstimate:()=>void;onSettings:()=>void;hasProject:boolean}) {
  return <SidebarGroup><SidebarGroupLabel>Workspace</SidebarGroupLabel><SidebarMenu>
    <SidebarMenuItem><SidebarMenuButton onClick={onProjects}><FolderOpen/><span>Projects</span></SidebarMenuButton></SidebarMenuItem>
    <SidebarMenuItem><SidebarMenuButton onClick={onNew}><Plus/><span>New project</span></SidebarMenuButton></SidebarMenuItem>
    <SidebarMenuItem><SidebarMenuButton onClick={onEstimate} disabled={!hasProject}><Calculator/><span>Current estimate</span></SidebarMenuButton></SidebarMenuItem>
    <SidebarMenuItem><SidebarMenuButton onClick={onSettings}><Settings2/><span>Settings</span></SidebarMenuButton></SidebarMenuItem>
  </SidebarMenu></SidebarGroup>
}
