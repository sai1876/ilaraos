import * as React from "react";
import { cn } from "@/lib/utils";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, label, error, ...props }, ref) => {
    const inputId = React.useId();
    return (
      <div className="w-full flex flex-col gap-1.5">
        {label && (
          <label 
            htmlFor={props.id || inputId}
            className="text-xs font-semibold text-[#6d5e53] select-none"
          >
            {label}
          </label>
        )}
        <input
          id={props.id || inputId}
          type={type}
          className={cn(
            "flex h-10 w-full rounded-xl border border-[#e5ded4] bg-[#FFFDFC] px-3.5 py-2 text-sm text-[#3e3229] placeholder:text-[#a6988c] outline-none transition-all duration-200 focus-visible:border-[#9A642C] focus-visible:ring-2 focus-visible:ring-[#9A642C]/10 disabled:cursor-not-allowed disabled:opacity-50",
            error && "border-red-400 focus-visible:border-red-500 focus-visible:ring-red-500/10",
            className
          )}
          ref={ref}
          aria-invalid={!!error}
          aria-describedby={error ? `${inputId}-error` : undefined}
          {...props}
        />
        {error && (
          <span 
            id={`${inputId}-error`}
            className="text-[11px] font-medium text-red-500 mt-0.5"
            role="alert"
          >
            {error}
          </span>
        )}
      </div>
    );
  }
);
Input.displayName = "Input";

export { Input };
