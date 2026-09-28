"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: ReactNode;
  size?: "sm" | "md" | "lg" | "xl" | "full";
  className?: string;
}

const sizeClasses = {
  sm: "max-w-md",
  md: "max-w-lg",
  lg: "max-w-2xl",
  xl: "max-w-4xl",
  full: "max-w-[90vw]",
};

export function Modal({
  isOpen,
  onClose,
  title,
  description,
  children,
  size = "md",
  className,
}: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    if (isOpen) {
      document.addEventListener("keydown", handleEscape);
      document.body.style.overflow = "hidden";
    }

    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "unset";
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return createPortal(
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#091318]/55 p-4 backdrop-blur-md"
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose();
      }}
    >
      <div
        className={cn(
          "relative max-h-[90vh] w-full overflow-y-auto rounded-2xl border border-white/70 bg-gradient-to-br from-white via-white to-[#f4f8f8] shadow-[0_28px_80px_rgb(6_24_29_/_28%),inset_0_1px_0_white]",
          "animate-in fade-in zoom-in-95 duration-200",
          sizeClasses[size],
          className
        )}
      >
        {title && (
          <div className="flex items-start justify-between border-b border-line/80 bg-gradient-to-r from-[#f3f8f7] to-white px-6 py-5">
            <div>
              <h2 className="font-display text-xl font-semibold text-ink">{title}</h2>
              {description && (
                <p className="mt-1 text-sm text-slate-500">{description}</p>
              )}
            </div>
            <button
              onClick={onClose}
              aria-label="Tutup dialog"
              className="rounded-lg border border-transparent p-1.5 text-slate-400 transition-all hover:border-line hover:bg-white hover:text-ink hover:shadow-sm"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>,
    document.body
  );
}
