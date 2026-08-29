"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { CheckCircle2, AlertCircle, Info, Undo2, X } from "lucide-react";
import { cn } from "@/lib/utils";

type ToastType = "success" | "error" | "info";

interface ToastAction {
  label: string;
  onClick: () => void | Promise<void>;
}

interface Toast {
  id: number;
  message: string;
  type: ToastType;
  action?: ToastAction;
  duration: number;
}

interface ToastCtx {
  toast: (
    message: string,
    opts?: { type?: ToastType; action?: ToastAction; duration?: number }
  ) => void;
  /** Convenience for the "saved — Undo" pattern. */
  toastWithUndo: (message: string, undo: () => void | Promise<void>) => void;
  dismiss: (id: number) => void;
}

const Ctx = createContext<ToastCtx>({
  toast: () => {},
  toastWithUndo: () => {},
  dismiss: () => {},
});

export function useToast() {
  return useContext(Ctx);
}

let counter = 0;

const ICONS = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
} as const;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const toast = useCallback<ToastCtx["toast"]>(
    (message, opts) => {
      const id = ++counter;
      // An undoable toast stays up longer — the user needs time to react.
      const duration = opts?.duration ?? (opts?.action ? 7000 : 3200);
      setToasts((t) => [
        ...t.slice(-2), // at most three at once
        { id, message, type: opts?.type ?? "success", action: opts?.action, duration },
      ]);
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), duration)
      );
    },
    [dismiss]
  );

  const toastWithUndo = useCallback<ToastCtx["toastWithUndo"]>(
    (message, undo) => {
      const id = ++counter;
      setToasts((t) => [
        ...t.slice(-2),
        {
          id,
          message,
          type: "success",
          duration: 7000,
          action: {
            label: "Undo",
            onClick: async () => {
              dismiss(id);
              await undo();
            },
          },
        },
      ]);
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), 7000)
      );
    },
    [dismiss]
  );

  useEffect(() => {
    const map = timers.current;
    return () => {
      map.forEach(clearTimeout);
      map.clear();
    };
  }, []);

  return (
    <Ctx.Provider value={{ toast, toastWithUndo, dismiss }}>
      {children}
      <div
        // Polite so a toast never interrupts what a screen reader is reading.
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-24 z-[100] mx-auto flex w-[92%] max-w-md flex-col gap-2 md:bottom-6"
      >
        {toasts.map((t) => {
          const Icon = ICONS[t.type];
          return (
            <div
              key={t.id}
              className={cn(
                "pointer-events-auto flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium shadow-lg animate-slide-in-bottom",
                t.type === "success" && "bg-[var(--brand)] text-white",
                t.type === "error" && "bg-[var(--danger)] text-white",
                t.type === "info" && "bg-ink text-[var(--bg)]"
              )}
            >
              <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
              <span className="min-w-0 flex-1">{t.message}</span>

              {t.action && (
                <button
                  onClick={() => t.action?.onClick()}
                  className="flex shrink-0 items-center gap-1 rounded-lg bg-white/20 px-2.5 py-1 text-xs font-semibold hover:bg-white/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
                >
                  {t.action.label === "Undo" && <Undo2 className="h-3.5 w-3.5" />}
                  {t.action.label}
                </button>
              )}

              <button
                onClick={() => dismiss(t.id)}
                aria-label="Dismiss"
                className="shrink-0 rounded p-0.5 opacity-70 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>
    </Ctx.Provider>
  );
}
