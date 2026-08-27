export const NAV = [
  { href: "/", label: "Dashboard", code: "01" },
  { href: "/pipeline", label: "Pipeline", code: "02" },
  { href: "/contacts", label: "Contacts", code: "03" },
  { href: "/companies", label: "Companies", code: "04" },
  { href: "/campaigns", label: "Campaigns", code: "05" },
  { href: "/send", label: "Email", code: "06" },
  { href: "/sms", label: "SMS", code: "07" },
  { href: "/issues", label: "Issues", code: "08" },
] as const;

export function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}
