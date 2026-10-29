"use client"
import { NavMain } from "@/components/nav-main"
import { NavProjects } from "@/components/nav-projects"
import { NavUser } from "@/components/nav-user"
import { TeamSwitcher } from "@/components/team-switcher"
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarRail, useSidebar } from "@/components/ui/sidebar"
import type { Project } from "@/lib/types"
export function AppSidebar({ projects, activeId, onProjects, onSelect, onNew, onSettings, onEstimate }: {
  projects: Project[]; activeId: string|null; onProjects:()=>void; onSelect:(id:string)=>void;
  onNew:()=>void; onSettings:()=>void; onEstimate:()=>void;
}) {
  const {setOpen,setOpenMobile}=useSidebar()
  const close=(action:()=>void)=>()=>{action();setOpen(false);setOpenMobile(false)}
  return <Sidebar collapsible="offcanvas" variant="floating">
    <SidebarHeader><TeamSwitcher onSettings={close(onSettings)}/></SidebarHeader>
    <SidebarContent>
      <NavMain onProjects={close(onProjects)} onNew={close(onNew)} onEstimate={close(onEstimate)} onSettings={close(onSettings)} hasProject={!!activeId}/>
      <NavProjects projects={projects} activeId={activeId} onSelect={id=>close(()=>onSelect(id))()}/>
    </SidebarContent>
    <SidebarFooter><NavUser onSettings={close(onSettings)}/></SidebarFooter>
    <SidebarRail/>
  </Sidebar>
}
