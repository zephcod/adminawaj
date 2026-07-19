"use client";

import * as Dialog from "@radix-ui/react-dialog";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { logout } from "@/app/login/actions";
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
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
            <path
              d="M3 5h14M3 10h14M3 15h14"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
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
                <p className="font-display text-xl font-bold">
                  Awaj<span className="text-gold"> ET</span>
                </p>
                <p className="mt-1 font-mono text-[10px] tracking-[0.18em] text-white/40 uppercase">
                  Admin Control
                </p>
              </div>
              <Dialog.Close
                aria-label="Close menu"
                className="rounded-md p-2 text-white/60 hover:bg-white/10 hover:text-white"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
                  <path
                    d="M3 3l10 10M13 3L3 13"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                  />
                </svg>
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

            <form action={logout} className="mt-auto">
              <button className="font-mono text-[11px] tracking-[0.14em] text-white/40 uppercase transition-colors hover:text-amber">
                ⏻ Sign out
              </button>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <Link href="/" className="font-display text-lg font-bold text-white">
        Awaj<span className="text-gold"> ET</span>
      </Link>
    </header>
  );
}
