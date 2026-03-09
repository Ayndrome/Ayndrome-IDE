'use client';

import { useState, useRef, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { FileIcon, FolderIcon } from "@react-symbols/icons/utils";

interface CreateInputProps {
    type: 'file' | 'folder';
    depth: number;
    defaultName?: string;
    onSubmit: (name: string) => void;
    onCancel: () => void;
}

export const CreateInput = ({ type, depth, defaultName = '', onSubmit, onCancel }: CreateInputProps) => {
    const [name, setName] = useState(defaultName);
    const ref = useRef<HTMLInputElement>(null);

    const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
        e.stopPropagation();
        if (e.key === 'Enter' && name.trim()) {
            onSubmit(name.trim());
        } else if (e.key === 'Escape') {
            onCancel();
        }
    }, [name, onSubmit, onCancel]);

    return (
        <div
            className="flex items-center gap-1 py-[2px]"
            style={{ paddingLeft: `${depth * 12 + 20}px`, paddingRight: '6px' }}
        >
            {/* Live-updating icon matches what will be created */}
            <span className="shrink-0 size-4 flex items-center justify-center">
                {type === 'folder'
                    ? <FolderIcon folderName={name || '_'} className="size-4" />
                    : <FileIcon fileName={name || 'file'} autoAssign className="size-4" />
                }
            </span>
            <Input
                ref={ref}
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={handleKeyDown}
                onBlur={onCancel}
                className="h-5 text-xs py-0 px-1.5 rounded-sm border-primary/50 bg-background focus-visible:ring-0 focus-visible:border-primary min-w-0 flex-1"
            />
        </div>
    );
};