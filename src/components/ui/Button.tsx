"use client";

import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "destructive" | "outline" | "subtle";
  size?: "sm" | "md" | "lg" | "icon" | "icon-sm";
  loading?: boolean;
  /** Announced to screen readers while `loading` is true. */
  loadingText?: string;
}

const variants: Record<string, string> = {
  primary:
    "bg-[var(--brand)] text-white hover:bg-[var(--brand-hover)] shadow-sm disabled:opacity-60",
  secondary: "bg-surface-2 text-ink hover:bg-line disabled:opacity-50",
  outline: "border border-line bg-surface text-ink hover:bg-surface-2 disabled:opacity-50",
  ghost: "text-muted hover:bg-surface-2 hover:text-ink disabled:opacity-50",
  subtle: "bg-brand-soft text-[var(--brand-text)] hover:brightness-105 disabled:opacity-50",
  destructive: "bg-[var(--danger)] text-white hover:brightness-110 disabled:opacity-50",
};

const sizes: Record<string, string> = {
  sm: "h-9 px-3 text-sm rounded-lg",
  md: "h-11 px-4 text-sm rounded-xl",
  lg: "h-12 px-6 text-base rounded-xl",
  icon: "h-11 w-11 rounded-xl",
  "icon-sm": "h-9 w-9 rounded-lg",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    className,
    variant = "primary",
    size = "md",
    loading,
    loadingText = "Working…",
    children,
    disabled,
    ...props
  },
  ref
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        "inline-flex shrink-0 items-center justify-center gap-2 font-medium transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
        "disabled:cursor-not-allowed",
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    >
      {loading && (
        <>
          <span
            className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
            aria-hidden="true"
          />
          <span className="sr-only">{loadingText}</span>
        </>
      )}
      {children}
    </button>
  );
});
