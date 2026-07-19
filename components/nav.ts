export const NAV = [
  { href: "/", label: "Dashboard", code: "01" },
  { href: "/pipeline", label: "Pipeline", code: "02" },
  { href: "/contacts", label: "Contacts", code: "03" },
  { href: "/send", label: "Email", code: "04" },
] as const;

export function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}
