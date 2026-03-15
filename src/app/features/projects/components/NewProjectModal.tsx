'use client';

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { X, Sparkles, FileCode2, Globe, Blocks, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCreateProject } from "../hooks/use-project";

const templates = [
    { id: "blank", icon: <FileCode2 className="size-4" />, label: "Blank Project", desc: "Start from scratch" },
    { id: "web", icon: <Globe className="size-4" />, label: "Web App", desc: "HTML/CSS/JS starter" },
    { id: "nextjs", icon: <Blocks className="size-4" />, label: "Next.js", desc: "Full-stack React app" },
    { id: "api", icon: <Sparkles className="size-4" />, label: "API Backend", desc: "Node/Express server" },
];

interface NewProjectModalProps {
    open: boolean;
    onClose: () => void;
    initialPrompt?: string;
}

export const NewProjectModal = ({ open, onClose, initialPrompt = "" }: NewProjectModalProps) => {
    const router = useRouter();
    const [name, setName] = useState("");
    const [description, setDescription] = useState(initialPrompt);
    const [template, setTemplate] = useState("blank");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const nameRef = useRef<HTMLInputElement>(null);
    const createProject = useCreateProject();

    // Focus name input when opened
    useEffect(() => {
        if (open) {
            setError("");
            setTimeout(() => nameRef.current?.focus(), 80);
        }
    }, [open]);

    // Update description if initialPrompt changes (from AI bar)
    useEffect(() => {
        if (initialPrompt) setDescription(initialPrompt);
    }, [initialPrompt]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) { setError("Project name is required"); return; }

        setLoading(true);
        setError("");
        try {
            const projectId = await createProject({ name: name.trim() });
            setName("");
            setDescription("");
            setTemplate("blank");
            onClose();
            router.push(`/project/${projectId}`);
        } catch (err: any) {
            setError(err?.message ?? "Failed to create project");
        } finally {
            setLoading(false);
        }
    };

    // Dismiss on Escape
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
        if (open) window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open, onClose]);

    if (!open) return null;

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

            {/* Modal */}
            <div className={cn(
                "relative z-10 w-full max-w-md rounded-2xl",
                "bg-card border border-border shadow-2xl",
                "animate-in fade-in zoom-in-95 duration-200"
            )}>
                {/* Header */}
                <div className="flex items-center justify-between px-5 pt-5 pb-4">
                    <div className="flex items-center gap-2">
                        <div className="size-7 rounded-lg bg-primary/10 flex items-center justify-center">
                            <Sparkles className="size-3.5 text-primary" />
                        </div>
                        <h2 className="text-base font-semibold">New Project</h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    >
                        <X className="size-4" />
                    </button>
                </div>

                {/* Divider */}
                <div className="h-px bg-border mx-5" />

                <form onSubmit={handleSubmit} className="px-5 pt-4 pb-5 flex flex-col gap-4">

                    {/* Project name */}
                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                            Project Name <span className="text-destructive">*</span>
                        </label>
                        <input
                            ref={nameRef}
                            type="text"
                            placeholder="my-awesome-project"
                            value={name}
                            onChange={(e) => { setName(e.target.value); setError(""); }}
                            className={cn(
                                "w-full px-3 py-2 rounded-lg text-sm",
                                "bg-muted/40 border",
                                error ? "border-destructive" : "border-border",
                                "focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring/30",
                                "placeholder:text-muted-foreground/60 transition-all"
                            )}
                        />
                        {error && <p className="text-xs text-destructive">{error}</p>}
                    </div>

                    {/* Description */}
                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                            Description <span className="text-muted-foreground/50">(optional)</span>
                        </label>
                        <textarea
                            placeholder="What are you building?"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            rows={2}
                            className={cn(
                                "w-full px-3 py-2 rounded-lg text-sm resize-none",
                                "bg-muted/40 border border-border",
                                "focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring/30",
                                "placeholder:text-muted-foreground/60 transition-all"
                            )}
                        />
                    </div>

                    {/* Template picker */}
                    <div className="flex flex-col gap-2">
                        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Template</label>
                        <div className="grid grid-cols-2 gap-2">
                            {templates.map((t) => (
                                <button
                                    key={t.id}
                                    type="button"
                                    onClick={() => setTemplate(t.id)}
                                    className={cn(
                                        "flex flex-col items-start gap-1 p-3 rounded-xl border text-left",
                                        "transition-all duration-150",
                                        template === t.id
                                            ? "border-primary bg-primary/10 text-foreground"
                                            : "border-border bg-muted/20 text-muted-foreground hover:border-border/80 hover:bg-muted/40"
                                    )}
                                >
                                    <div className={cn("mb-0.5", template === t.id ? "text-primary" : "")}>{t.icon}</div>
                                    <span className="text-xs font-semibold">{t.label}</span>
                                    <span className="text-[10px] leading-tight opacity-70">{t.desc}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2 pt-1">
                        <Button
                            type="button"
                            variant="outline"
                            className="flex-1 h-9"
                            onClick={onClose}
                            disabled={loading}
                        >
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            className="flex-1 h-9 gap-2"
                            disabled={loading}
                        >
                            {loading ? (
                                <><Loader2 className="size-3.5 animate-spin" /> Creating…</>
                            ) : (
                                <><Sparkles className="size-3.5" /> Create Project</>
                            )}
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    );
};
