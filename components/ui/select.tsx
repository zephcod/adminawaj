"use client";

import * as SelectPrimitive from "@radix-ui/react-select";
import { ChevronDown } from "lucide-react";

export interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  value: string;
  onValueChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  className?: string;
}

/** Brand-styled Radix Select — accessible, touch-friendly, keyboard-navigable. */
export function Select({ value, onValueChange, options, placeholder = "Select…", className = "" }: SelectProps) {
  return (
    <SelectPrimitive.Root value={value || undefined} onValueChange={onValueChange}>
      <SelectPrimitive.Trigger
        className={`flex min-h-10 w-full items-center justify-between gap-2 rounded-md border border-edge bg-card px-3 py-2 text-left text-sm text-fg focus:border-gold focus:outline-none data-[placeholder]:text-muted ${className}`}
      >
        <span className="truncate">
          <SelectPrimitive.Value placeholder={placeholder} />
        </span>
        <SelectPrimitive.Icon>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={4}
          className="z-50 max-h-72 w-[var(--radix-select-trigger-width)] overflow-hidden rounded-md border border-edge bg-card shadow-lg"
        >
          <SelectPrimitive.Viewport className="p-1">
            {options.map((o) => (
              <SelectPrimitive.Item
                key={o.value}
                value={o.value}
                className="cursor-pointer rounded px-3 py-2.5 text-sm text-fg outline-none data-[highlighted]:bg-gold/15 data-[highlighted]:text-amber data-[state=checked]:font-semibold"
              >
                <SelectPrimitive.ItemText>{o.label}</SelectPrimitive.ItemText>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}
