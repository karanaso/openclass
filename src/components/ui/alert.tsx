import type * as React from "react";
import { cn } from "@/lib/cn";

export function Alert({
  className,
  variant = "info",
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { variant?: "info" | "error" | "success" | "warning" }) {
  const variants = {
    info: "border-blue-200 bg-blue-50 text-blue-900",
    error: "border-red-200 bg-red-50 text-red-900",
    success: "border-emerald-200 bg-emerald-50 text-emerald-900",
    warning: "border-amber-200 bg-amber-50 text-amber-900",
  };
  return <div role="alert" className={cn("rounded-lg border px-4 py-3 text-sm", variants[variant], className)} {...props} />;
}
