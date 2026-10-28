"use client";

import React, { useEffect } from "react";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";

export interface ToastMessage {
  id: string;
  type?: "success" | "error" | "info";
  text: string;
}

interface ToastProps {
  toast: ToastMessage | null;
  onClose: () => void;
  duration?: number;
}

export function Toast({ toast, onClose, duration = 2500 }: ToastProps) {
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => {
      onClose();
    }, duration);
    return () => clearTimeout(timer);
  }, [toast, onClose, duration]);

  if (!toast) return null;

  const icons = {
    success: <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />,
    error: <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />,
    info: <Info className="w-5 h-5 text-indigo-400 shrink-0" />
  };

  const borders = {
    success: "border-emerald-500/40 bg-slate-900/95 text-emerald-200 shadow-[0_4px_20px_rgba(16,185,129,0.25)]",
    error: "border-rose-500/40 bg-slate-900/95 text-rose-200 shadow-[0_4px_20px_rgba(244,63,94,0.25)]",
    info: "border-indigo-500/40 bg-slate-900/95 text-indigo-200 shadow-[0_4px_20px_rgba(99,102,241,0.25)]"
  };

  const type = toast.type || "success";

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-bounce duration-300">
      <div
        className={`flex items-center gap-3 px-4 py-3 rounded-xl border backdrop-blur-md text-sm font-medium ${borders[type]}`}
      >
        {icons[type]}
        <span>{toast.text}</span>
        <button
          onClick={onClose}
          className="ml-2 text-slate-400 hover:text-white transition-colors"
          aria-label="닫기"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
