"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useId, useState, useTransition } from "react";
import { normalizeTag, sortTags, tagChipClass, TAG_PREFIXES } from "@/lib/tags";

interface Props {
  name: string;
  tags: string[];
  suggestions: string[];
  onSave: (tags: string[]) => Promise<void>;
}

export default function TagEditor({ name, tags, suggestions, onSave }: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string[]>(tags);
  const [input, setInput] = useState("");
  const [pending, startTransition] = useTransition();
  const listId = useId();

  function add(raw: string) {
    const tag = normalizeTag(raw);
    if (!tag) return;
    setDraft((d) => (d.includes(tag) ? d : [...d, tag]));
    setInput("");
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          setDraft(tags);
          setInput("");
        }
      }}
    >
      <Dialog.Trigger
        aria-label={`Edit tags for ${name}`}
        className="rounded p-1 font-mono text-[11px] text-warmgray hover:bg-mist hover:text-amber"
      >
        ✎
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-navy/60 backdrop-blur-sm" />
        <Dialog.Content className="fixed inset-x-0 bottom-0 z-50 max-h-[92dvh] overflow-y-auto rounded-t-xl bg-white p-5 shadow-xl outline-none sm:inset-x-auto sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:w-full sm:max-w-md sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-lg sm:p-6">
          <Dialog.Title className="text-lg font-semibold">
            Tags — {name}
          </Dialog.Title>
          <Dialog.Description className="mt-1 text-xs text-warmgray">
            Use <span className="font-mono">prefix:value</span> — e.g.{" "}
            {Object.entries(TAG_PREFIXES)
              .slice(0, 3)
              .map(([p, m]) => `${p}: (${m.label.toLowerCase()})`)
              .join(", ")}
          </Dialog.Description>

          <div className="mt-4 flex min-h-9 flex-wrap gap-1.5">
            {sortTags(draft).map((t) => (
              <span
                key={t}
                className={`flex items-center gap-1 rounded-full px-2.5 py-1 font-mono text-[11px] ${tagChipClass(t)}`}
              >
                {t}
                <button
                  aria-label={`Remove ${t}`}
                  onClick={() => setDraft((d) => d.filter((x) => x !== t))}
                  className="opacity-60 hover:opacity-100"
                >
                  ✕
                </button>
              </span>
            ))}
            {draft.length === 0 && (
              <span className="text-xs text-warmgray">No tags yet.</span>
            )}
          </div>

          <div className="mt-3 flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  add(input);
                }
              }}
              list={listId}
              placeholder="ind:fintech"
              className="w-full rounded-md border border-charcoal/20 px-2.5 py-2 font-mono text-sm focus:outline-2 focus:outline-gold"
            />
            <datalist id={listId}>
              {suggestions
                .filter((s) => !draft.includes(s))
                .map((s) => (
                  <option key={s} value={s} />
                ))}
            </datalist>
            <button
              type="button"
              onClick={() => add(input)}
              className="rounded-md border border-line px-3 text-sm font-semibold text-charcoal hover:border-gold hover:text-amber"
            >
              Add
            </button>
          </div>

          <div className="mt-5 flex justify-end gap-3">
            <Dialog.Close className="rounded-md px-4 py-2 text-sm text-warmgray hover:text-charcoal">
              Cancel
            </Dialog.Close>
            <button
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  await onSave(input.trim() ? [...draft, normalizeTag(input)] : draft);
                  setOpen(false);
                })
              }
              className="rounded-md bg-navy px-5 py-2 text-sm font-semibold text-white hover:bg-charcoal disabled:opacity-50"
            >
              {pending ? "Saving…" : "Save tags"}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
