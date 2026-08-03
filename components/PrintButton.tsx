"use client";

export default function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="rounded-md bg-gold px-4 py-2 text-sm font-medium text-navy transition hover:bg-amber print:hidden"
    >
      Print PDF
    </button>
  );
}
