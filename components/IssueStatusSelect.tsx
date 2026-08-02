"use client";

import { useState, useTransition } from "react";
import { setIssueStatus } from "@/app/actions";
import { ISSUE_STATUS_LABELS, ISSUE_STATUSES } from "@/lib/domain";
import { Select } from "@/components/ui/select";

export default function IssueStatusSelect({
  issueId,
  current,
}: {
  issueId: string;
  current: string;
}) {
  const [value, setValue] = useState(current);
  const [pending, startTransition] = useTransition();

  function onChange(next: string) {
    const previous = value;
    setValue(next);
    startTransition(async () => {
      try {
        await setIssueStatus(issueId, next);
      } catch {
        setValue(previous);
      }
    });
  }

  return (
    <div className={`w-36 ${pending ? "opacity-60" : ""}`}>
      <Select
        value={value}
        onValueChange={onChange}
        options={ISSUE_STATUSES.map((s) => ({
          value: s,
          label: ISSUE_STATUS_LABELS[s],
        }))}
      />
    </div>
  );
}
