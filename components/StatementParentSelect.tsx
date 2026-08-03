"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Select } from "@/components/ui/select";

/** Screen-only switcher between parent-campaign statements. */
export default function StatementParentSelect({
  options,
  current,
}: {
  options: { value: string; label: string }[];
  current: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function onChange(next: string) {
    const q = new URLSearchParams(params.toString());
    q.set("parent", next);
    router.push(`${pathname}?${q.toString()}`);
  }

  return (
    <div className="w-56 print:hidden">
      <Select value={current} onValueChange={onChange} options={options} />
    </div>
  );
}
