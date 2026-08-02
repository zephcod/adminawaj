"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

export default function DeleteLeadButton({
  leadId,
  leadTitle,
  deleteLead,
}: {
  leadId: string;
  leadTitle: string;
  deleteLead: (leadId: string) => Promise<void>;
}) {
  const router = useRouter();
  const [isDeleting, startDelete] = useTransition();

  return (
    <button
      aria-label={`Delete ${leadTitle}`}
      disabled={isDeleting}
      onClick={() => {
        if (!confirm(`Delete "${leadTitle}"? This can't be undone.`)) return;
        startDelete(async () => {
          await deleteLead(leadId);
          router.push("/pipeline");
        });
      }}
      className="flex items-center gap-1.5 rounded-md bg-red-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-50"
    >
      <Trash2 className="h-3.5 w-3.5" aria-hidden />
      Delete lead
    </button>
  );
}
