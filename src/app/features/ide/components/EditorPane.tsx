'use client';

import { cn } from "@/lib/utils";
import { useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
    XIcon,
    CircleDotIcon,
    CodeIcon,
    TerminalIcon,
    ChevronDownIcon,
    WrapTextIcon,
} from "lucide-react";
import { FileTabManager } from "./FileTabManager";
import { CodeEditor } from "./CodeEditor";
import { EmptyEditor } from "./EmptyEditor";

import { useEditorStore } from "@/src/store/editor-store";
import { useIDEStore } from "@/src/store/ide-store";

interface EditorPaneProps { }

export const EditorPane = (_: EditorPaneProps) => {
    const { tabs, activeFileId, closeTab, activeTab: getActiveTab } = useEditorStore();
    const { projectId } = useIDEStore();
    const currentTab = getActiveTab();
    const activeFile = currentTab?.fileName ?? "index.ts";

    return (
        <div className="flex flex-col h-full bg-background overflow-hidden">
            {/* File tab bar */}
            <div className="flex items-center border-b border-border bg-sidebar shrink-0 overflow-x-auto">
                <FileTabManager projectId={projectId} />
            </div>

            {tabs.length > 0 ? <CodeEditor /> : <EmptyEditor />}
        </div>
    );
};

