import {Toaster} from 'sonner';
import type {Metadata} from 'next';
import './globals.css';
import '@fontsource/ibm-plex-sans/latin-400.css';
import '@fontsource/ibm-plex-sans/latin-500.css';
import '@fontsource/ibm-plex-sans/latin-600.css';
import { TooltipProvider } from '@/components/ui/tooltip';

export const metadata:Metadata={title:'SatelliteRoofs | Estimate with evidence',description:'Local roofing measurement review and reproducible estimates.'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body><TooltipProvider>{children}</TooltipProvider><Toaster position="bottom-right" closeButton richColors duration={7000} toastOptions={{style:{fontFamily:"inherit"}}}/></body></html>}
