'use client';

import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import { X, Loader2, GitBranch, Search } from "lucide-react";
import { FaGithub as GithubIcon } from "react-icons/fa";
import { Button } from "@/components/ui/button";

interface ImportGithubModalProps {
    open: boolean;
    onClose: () => void;
}

const popularRepos = [
    "facebook/react",
    "vercel/next.js",
    "microsoft/vscode",
    "tailwindlabs/tailwindcss",
];

export const ImportGithubModal = ({ open, onClose }: ImportGithubModalProps) => {
    const [repoUrl, setRepoUrl] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (open) {
            setError("");
            setTimeout(() => inputRef.current?.focus(), 80);
        }
    }, [open]);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
        if (open) window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open, onClose]);

    const isValidUrl = (val: string) => {
        return val.match(/^(https?:\/\/(www\.)?github\.com\/)?[\w-]+\/[\w.-]+\/?$/);
    };

    const handleImport = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!repoUrl.trim()) { setError("Please enter a GitHub repo URL or owner/repo"); return; }
        if (!isValidUrl(repoUrl.trim())) { setError("Enter a valid GitHub URL or owner/repo format"); return; }

        setLoading(true);
        setError("");
        // TODO: trigger Convex importStatus mutation
        await new Promise((r) => setTimeout(r, 1500));
        setLoading(false);
        setRepoUrl("");
        onClose();
    };

    if (!open) return null;

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

            <div className={cn(
                "relative z-10 w-full max-w-md rounded-2xl",
                "bg-card border border-border shadow-2xl",
                "animate-in fade-in zoom-in-95 duration-200"
            )}>
                {/* Header */}
                <div className="flex items-center justify-between px-5 pt-5 pb-4">
                    <div className="flex items-center gap-2">
                        <div className="size-7 rounded-lg bg-muted flex items-center justify-center">
                            <GithubIcon className="size-3.5" />
                        </div>
                        <h2 className="text-base font-semibold">Import from GitHub</h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    >
                        <X className="size-4" />
                    </button>
                </div>

                <div className="h-px bg-border mx-5" />

                <form onSubmit={handleImport} className="px-5 pt-4 pb-5 flex flex-col gap-4">

                    {/* URL input */}
                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                            Repository URL or owner/repo
                        </label>
                        <div className="relative">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                            <input
                                ref={inputRef}
                                type="text"
                                placeholder="https://github.com/owner/repo"
                                value={repoUrl}
                                onChange={(e) => { setRepoUrl(e.target.value); setError(""); }}
                                className={cn(
                                    "w-full pl-8 pr-3 py-2 rounded-lg text-sm",
                                    "bg-muted/40 border",
                                    error ? "border-destructive" : "border-border",
                                    "focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring/30",
                                    "placeholder:text-muted-foreground/60 transition-all"
                                )}
                            />
                        </div>
                        {error && <p className="text-xs text-destructive">{error}</p>}
                    </div>

                    {/* Quick picks */}
                    <div className="flex flex-col gap-2">
                        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Popular repos</span>
                        <div className="flex flex-col gap-1">
                            {popularRepos.map((repo) => (
                                <button
                                    key={repo}
                                    type="button"
                                    onClick={() => setRepoUrl(`https://github.com/${repo}`)}
                                    className={cn(
                                        "flex items-center gap-2.5 px-3 py-2 rounded-lg border border-border",
                                        "bg-muted/20 hover:bg-muted/50 text-sm transition-all text-left",
                                        repoUrl.includes(repo) ? "border-primary/60 bg-primary/5" : ""
                                    )}
                                >
                                    <GitBranch className="size-3.5 text-muted-foreground shrink-0" />
                                    <span className="font-mono text-xs">{repo}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2 pt-1">
                        <Button type="button" variant="outline" className="flex-1 h-9" onClick={onClose} disabled={loading}>
                            Cancel
                        </Button>
                        <Button type="submit" className="flex-1 h-9 gap-2" disabled={loading}>
                            {loading ? (
                                <><Loader2 className="size-3.5 animate-spin" /> Importing…</>
                            ) : (
                                <><GithubIcon className="size-3.5" /> Import Repo</>
                            )}
                        </Button>
                    </div>
                </form>
            </div>
        </div>
    );
};
