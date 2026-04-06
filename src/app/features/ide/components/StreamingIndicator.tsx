// src/app/features/ide/components/StreamingIndicator.tsx
// Thin animated bar shown at top of editor while agent is streaming content.

'use client';

import React from "react";
import { useStreamingWriterStore } from "@/src/store/streaming-writer-store";
import { useEditorStore } from "@/src/store/editor-store";

export const StreamingIndicator: React.FC = () => {
    const { sessions } = useStreamingWriterStore();
    const { activeFilePath } = useEditorStore();

    const isActive = activeFilePath
        ? !!sessions[activeFilePath]
        : false;

    if (!isActive) return null;

    return (
        <div
            className="absolute top-0 left-0 right-0 z-10 overflow-hidden"
            style={{ height: "2px" }}
        >
            <div
                className="h-full"
                style={{
                    background: "linear-gradient(90deg, #388bfd 0%, #58a6ff 50%, #388bfd 100%)",
                    backgroundSize: "200% 100%",
                    animation: "streaming-progress 1.2s linear infinite",
                }}
            />
            <style>{`
                @keyframes streaming-progress {
                    0%   { background-position: 100% 0; }
                    100% { background-position: -100% 0; }
                }
            `}</style>
        </div>
    );
};