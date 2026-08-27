"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { logout } from "@/app/login/actions";
import { AwajMark } from "@/components/icons/AwajMark";
import { ThemeToggle } from "@/components/ThemeToggle";
import { isActive, NAV } from "./nav";

export default function MobileNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close the drawer whenever navigation happens
  useEffect(() => setOpen(false), [pathname]);

  return (
    <header className="sticky top-0 z-40 flex items-center justify-between bg-navy px-4 py-3 lg:hidden">

      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Trigger
          aria-label="Open menu"
          className="rounded-md p-2 text-white/80 hover:bg-white/10 hover:text-white"
        >
          <Menu className="h-5 w-5" aria-hidden />
        </Dialog.Trigger>

        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-navy/60 backdrop-blur-sm data-[state=open]:animate-in" />
          <Dialog.Content className="fixed inset-y-0 left-0 z-50 flex w-72 flex-col bg-navy p-6 text-white shadow-2xl outline-none">
            <Dialog.Title className="sr-only">Navigation</Dialog.Title>
            <Dialog.Description className="sr-only">
              Main navigation menu
            </Dialog.Description>

            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <AwajMark className="h-6 w-6 shrink-0" aria-hidden />
                  <p className="font-display text-xl font-bold">
                    Awaj<span className="text-gold"> CRM</span>
                  </p>
                </div>
                <p className="mt-1 font-mono text-[10px] tracking-[0.18em] text-white/40 uppercase">
                  Admin Control
                </p>
              </div>
              <Dialog.Close
                aria-label="Close menu"
                className="rounded-md p-2 text-white/60 hover:bg-white/10 hover:text-white"
              >
                <X className="h-4 w-4" aria-hidden />
              </Dialog.Close>
            </div>

            <nav className="mt-8 flex flex-col gap-1">
              {NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 rounded-md px-3 py-3 text-[15px] transition-colors ${
                    isActive(pathname, item.href)
                      ? "bg-white/10 font-semibold text-gold"
                      : "text-white/70 hover:bg-white/5 hover:text-white"
                  }`}
                >
                  <span className="font-mono text-[10px] text-white/30">
                    {item.code}
                  </span>
                  {item.label}
                </Link>
              ))}
            </nav>

            <div className="mt-auto flex items-center justify-between">
              <form action={logout}>
                <button className="font-mono text-[11px] tracking-[0.14em] text-white/40 uppercase transition-colors hover:text-amber">
                  ⏻ Sign out
                </button>
              </form>
              <ThemeToggle />
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <Link
        href="/"
        className="flex items-center gap-1.5 font-display text-lg font-bold text-white"
      >
        <AwajMark className="h-6 w-6 shrink-0" aria-hidden />
        Awaj<span className="text-gold"> CRM</span>
      </Link>
    </header>
  );
}
