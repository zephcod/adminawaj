"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "@/app/login/actions";
import { AwajMark } from "@/components/icons/AwajMark";
import { ThemeToggle } from "@/components/ThemeToggle";
import { isActive, NAV } from "./nav";

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col bg-navy text-white lg:flex">
      <div className="px-6 pt-8 pb-6">
        <div className="flex items-center gap-2">
          <AwajMark className="h-7 w-7 shrink-0" aria-hidden />
          <div className="font-display text-xl font-bold tracking-tight">
            Awaj<span className="text-gold"> CRM</span>
          </div>
        </div>
        <div className="mt-1 font-mono text-[10px] tracking-[0.18em] text-white/40 uppercase">
          Admin Control
        </div>
      </div>

      <nav className="flex flex-col gap-1 px-3">
        {NAV.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors ${
                active
                  ? "bg-white/10 font-semibold text-gold"
                  : "text-white/70 hover:bg-white/5 hover:text-white"
              }`}
            >
              <span className="font-mono text-[10px] text-white/30">{item.code}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto px-6 pb-8">
        <p className="font-mono text-[10px] leading-relaxed tracking-wider text-white/30 uppercase">
          From pitch to profit
          <br />
          <span className="text-gold/60">Grow with Awajet.</span>
        </p>
        <div className="mt-5 flex items-center justify-between">
          <form action={logout}>
            <button className="font-mono text-[10px] tracking-[0.14em] text-white/40 uppercase transition-colors hover:text-amber">
              ⏻ Sign out
            </button>
          </form>
          <ThemeToggle />
        </div>
      </div>
    </aside>
  );
}
