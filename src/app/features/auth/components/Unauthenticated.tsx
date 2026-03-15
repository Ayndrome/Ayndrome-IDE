'use client';

import { SignInButton, SignUpButton } from "@clerk/nextjs";
import { SparklesIcon, CodeIcon, Zap, GitBranch } from "lucide-react";
import { cn } from "@/lib/utils";
import { Poppins } from "next/font/google";

const font = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const highlights = [
  { icon: <Zap className="size-3.5 text-yellow-400" />, text: "AI-powered code completion" },
  { icon: <GitBranch className="size-3.5 text-blue-400" />, text: "Built-in Git & GitHub integration" },
  { icon: <CodeIcon className="size-3.5 text-green-400" />, text: "Full terminal in the browser" },
];

export function UnauthenticatedComponent() {
  return (
    <div className={cn(font.className, "min-h-screen bg-background flex items-center justify-center p-6")}>
      <div className="w-full max-w-sm flex flex-col items-center gap-8">

        {/* Logo + wordmark */}
        <div className="flex flex-col items-center gap-3">
          <div className="size-14 rounded-2xl bg-primary flex items-center justify-center shadow-[0_0_32px_-6px] shadow-primary/60">
            <img src="/vercel.svg" alt="" />
          </div>
          <div className="flex flex-col items-center gap-1">
            <h1 className="text-2xl font-bold tracking-tight">Ayndrome IDE</h1>
            <p className="text-sm text-muted-foreground text-center">
              A browser-based IDE for modern developers
            </p>
          </div>
        </div>

        {/* Feature chips */}
        <div className="flex flex-col gap-2 w-full">
          {highlights.map((h) => (
            <div key={h.text} className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-muted/40 border border-border">
              {h.icon}
              <span className="text-sm text-muted-foreground">{h.text}</span>
            </div>
          ))}
        </div>

        {/* Auth buttons */}
        <div className="flex flex-col gap-2.5 w-full">
          <SignInButton mode="modal">
            <button className={cn(
              "w-full h-10 rounded-lg text-sm font-medium",
              "bg-primary text-primary-foreground",
              "hover:opacity-90 active:scale-[0.98] transition-all duration-150"
            )}>
              Sign in to continue
            </button>
          </SignInButton>

          <SignUpButton mode="modal">
            <button className={cn(
              "w-full h-10 rounded-lg text-sm font-medium",
              "border border-border bg-muted/30",
              "hover:bg-muted/60 active:scale-[0.98] transition-all duration-150"
            )}>
              Create a free account
            </button>
          </SignUpButton>
        </div>

        <p className="text-xs text-muted-foreground/60 text-center">
          By signing in you agree to our Terms of Service
        </p>
      </div>
    </div>
  );
}
