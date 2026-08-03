import { render } from "@react-email/components";
import { StatementEmail } from "@/emails/StatementEmail";
import type { StatementData } from "./statement";

/** Render the react-email statement to an HTML string for Resend. */
export function renderStatementEmail(
  data: StatementData,
  summary?: string
): Promise<string> {
  return render(<StatementEmail data={data} summary={summary} />);
}
