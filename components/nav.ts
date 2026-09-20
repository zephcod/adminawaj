import type { NavIconKey } from "./NavShell";

export interface NavItem {
  href: string;
  label: string;
  /** Plain string key — NavShell's NAV_ICONS map resolves it to a component,
   *  since icon components can't cross the Server → Client boundary. */
  icon: NavIconKey;
}

export const NAV: readonly NavItem[] = [
  { href: "/", label: "Dashboard", icon: "dashboard" },
  { href: "/pipeline", label: "Pipeline", icon: "pipeline" },
  { href: "/contacts", label: "Contacts", icon: "contacts" },
  { href: "/companies", label: "Companies", icon: "companies" },
  { href: "/campaigns", label: "Campaigns", icon: "campaigns" },
  { href: "/send", label: "Email", icon: "email" },
  { href: "/sms", label: "SMS", icon: "sms" },
  { href: "/issues", label: "Issues", icon: "issues" },
];

export function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}
