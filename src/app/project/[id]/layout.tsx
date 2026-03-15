'use client';

import { TooltipProvider } from "@/components/ui/tooltip";

export default function IDELayout({ children }: { children: React.ReactNode }) {
    return (
        <TooltipProvider>
            <div className="h-screen w-screen overflow-hidden flex flex-col bg-background text-foreground">
                {children}
            </div>
        </TooltipProvider>
    );
}
