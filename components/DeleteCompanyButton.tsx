"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

export default function DeleteCompanyButton({
  companyId,
  companyName,
  deleteCompany,
}: {
  companyId: string;
  companyName: string;
  deleteCompany: (companyId: string) => Promise<void>;
}) {
  const router = useRouter();
  const [isDeleting, startDelete] = useTransition();

  return (
    <button
      aria-label={`Delete ${companyName}`}
      disabled={isDeleting}
      onClick={() => {
        if (!confirm(`Delete "${companyName}"? This can't be undone.`)) return;
        startDelete(async () => {
          await deleteCompany(companyId);
          router.push("/companies");
        });
      }}
      className="flex items-center gap-1.5 rounded-md bg-red-600 px-3 py-1.75 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-50"
    >
      <Trash2 className="h-3.5 w-3.5" aria-hidden />
      Delete company
    </button>
  );
}
