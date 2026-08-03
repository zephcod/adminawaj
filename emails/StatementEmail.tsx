import {
  Body,
  Column,
  Container,
  Head,
  Hr,
  Html,
  Preview,
  Row,
  Section,
  Text,
} from "@react-email/components";
import { money, num } from "@/lib/domain";
import type { StatementData } from "@/lib/statement";

/**
 * Minimized client statement email, built with react-email.
 * Render to HTML with `render()` from "@react-email/components".
 */
export function StatementEmail({
  data,
  summary,
}: {
  data: StatementData;
  summary?: string;
}) {
  const { company, cur } = data;
  const trimmedSummary = summary?.trim();

  return (
    <Html>
      <Head />
      <Preview>
        {`Campaign statement — ${data.parentLabel} (${data.since} → ${data.until})`}
      </Preview>
      <Body style={body}>
        <Container style={card}>
          {/* Header */}
          <Section style={header}>
            <Text style={brand}>
              Awaj <span style={{ color: gold }}>ET</span>
            </Text>
            <Text style={brandSub}>Campaign Statement</Text>
          </Section>

          {/* Meta */}
          <Section style={{ padding: "20px 24px 8px" }}>
            <Text style={label}>Prepared for</Text>
            <Text style={companyName}>{company.name}</Text>
            <Text style={groupLabel}>{data.parentLabel}</Text>
            <Text style={period}>
              Period: {data.since} → {data.until}
            </Text>
          </Section>

          {/* Optional summary */}
          {trimmedSummary && (
            <Section style={{ padding: "4px 24px 8px" }}>
              <Text style={summaryText}>{trimmedSummary}</Text>
            </Section>
          )}

          {/* Metric strip */}
          <Section style={{ padding: "12px 24px" }}>
            <Row>
              {(
                [
                  ["Impressions", num(data.totals.impressions)],
                  ["Reach", num(data.totals.reach)],
                  ["Leads", num(data.totals.leads)],
                  ["Calls", num(data.totals.calls)],
                  [
                    "Cost / result",
                    data.totals.results ? money(data.totals.cpr, cur) : "—",
                  ],
                ] as const
              ).map(([l, v]) => (
                <Column key={l} style={metricCell}>
                  <Text style={metricLabel}>{l}</Text>
                  <Text style={metricValue}>{v}</Text>
                </Column>
              ))}
            </Row>
          </Section>

          {/* Campaigns */}
          <Section style={{ padding: "8px 24px" }}>
            <Row style={tableHead}>
              <Column style={{ ...th, textAlign: "left" }}>Campaign</Column>
              <Column style={{ ...th, textAlign: "right" }}>Leads</Column>
              <Column style={{ ...th, textAlign: "right" }}>Calls</Column>
              <Column style={{ ...th, textAlign: "right" }}>Ad spend</Column>
            </Row>
            {data.rows.length === 0 ? (
              <Row>
                <Column style={emptyCell}>
                  No campaign activity in this period.
                </Column>
              </Row>
            ) : (
              data.rows.map((c) => (
                <Row key={c.id} style={tableRow}>
                  <Column style={{ ...td, textAlign: "left" }}>{c.name}</Column>
                  <Column style={{ ...td, textAlign: "right" }}>{num(c.leads)}</Column>
                  <Column style={{ ...td, textAlign: "right" }}>{num(c.calls)}</Column>
                  <Column style={{ ...td, textAlign: "right" }}>
                    {money(c.spend, cur)}
                  </Column>
                </Row>
              ))
            )}
          </Section>

          {/* Totals */}
          <Section style={{ padding: "12px 24px 4px" }}>
            <Container style={totalsBox}>
              <TotalLine label="Ad spend" value={money(data.totals.spend, cur)} />
              <TotalLine label="Services" value={money(data.costTotal, cur)} />
              <TotalLine label="Subtotal" value={money(data.subtotal, cur)} bold />
              <TotalLine label="VAT (15%)" value={money(data.vat, cur)} />
              <TotalLine
                label="Total charge"
                value={money(data.totalCharge, cur)}
                bold
              />
              {data.wht > 0 && (
                <TotalLine label="WHT (3%)" value={`− ${money(data.wht, cur)}`} />
              )}
            </Container>
          </Section>
          <Section style={{ padding: "4px 24px 20px" }}>
            <Container style={payableBox}>
              <Row>
                <Column style={payableLabel}>Total payable</Column>
                <Column style={payableValue}>{money(data.totalPayable, cur)}</Column>
              </Row>
            </Container>
          </Section>

          {/* Footer */}
          <Hr style={hr} />
          <Section style={{ padding: "0 24px 20px" }}>
            <Text style={footerStrong}>
              Prepared by{" "}
              {company.accountManager
                ? `${company.accountManager} · Awaj ET`
                : "Awaj ET"}
            </Text>
            <Text style={footerFaint}>
              Data from Meta Ads · Figures in {cur}. This is a summary, a full
              statement is available on request.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

function TotalLine({
  label,
  value,
  bold = false,
}: {
  label: string;
  value: string;
  bold?: boolean;
}) {
  return (
    <Row>
      <Column
        style={{
          ...totalLabel,
          color: bold ? navy : smoke,
          fontWeight: bold ? 700 : 400,
        }}
      >
        {label}
      </Column>
      <Column
        style={{ ...totalValue, fontWeight: bold ? 700 : 400 }}
      >
        {value}
      </Column>
    </Row>
  );
}

// ── Palette ──
const gold = "#f0a93b";
const navy = "#12121c";
const smoke = "#6b6873";

// ── Styles ──
const body: React.CSSProperties = {
  margin: 0,
  padding: "24px 0",
  backgroundColor: "#f0ede6",
  fontFamily: "Arial, Helvetica, sans-serif",
};
const card: React.CSSProperties = {
  maxWidth: 600,
  width: "100%",
  backgroundColor: "#ffffff",
  borderRadius: 10,
  overflow: "hidden",
};
const header: React.CSSProperties = { backgroundColor: navy, padding: "20px 24px" };
const brand: React.CSSProperties = {
  margin: 0,
  fontSize: 20,
  fontWeight: 700,
  color: "#ffffff",
};
const brandSub: React.CSSProperties = {
  margin: "2px 0 0",
  fontSize: 10,
  letterSpacing: "0.16em",
  textTransform: "uppercase",
  color: "rgba(255,255,255,.5)",
};
const label: React.CSSProperties = {
  margin: 0,
  fontSize: 11,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  color: smoke,
};
const companyName: React.CSSProperties = {
  margin: "2px 0 0",
  fontSize: 16,
  fontWeight: 700,
  color: navy,
};
const groupLabel: React.CSSProperties = {
  margin: "2px 0 0",
  fontSize: 12,
  fontWeight: 600,
  color: "#c97d1e",
};
const period: React.CSSProperties = { margin: "2px 0 0", fontSize: 11, color: smoke };
const summaryText: React.CSSProperties = {
  margin: 0,
  fontSize: 13,
  lineHeight: "1.5",
  color: "#2b2b33",
  whiteSpace: "pre-wrap",
};
const metricCell: React.CSSProperties = {
  padding: "8px 6px",
  textAlign: "center",
};
const metricLabel: React.CSSProperties = {
  margin: 0,
  fontSize: 10,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: smoke,
};
const metricValue: React.CSSProperties = {
  margin: "2px 0 0",
  fontSize: 15,
  fontWeight: 700,
  color: navy,
};
const tableHead: React.CSSProperties = { borderBottom: `2px solid ${navy}` };
const th: React.CSSProperties = {
  padding: "6px 8px",
  fontSize: 10,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  color: smoke,
};
const tableRow: React.CSSProperties = { borderBottom: "1px solid #eee" };
const td: React.CSSProperties = { padding: "7px 8px", fontSize: 12, color: "#2b2b33" };
const emptyCell: React.CSSProperties = {
  padding: 14,
  textAlign: "center",
  color: smoke,
  fontSize: 12,
};
const totalsBox: React.CSSProperties = { width: "60%", marginLeft: "40%" };
const totalLabel: React.CSSProperties = { padding: "4px 0", fontSize: 12 };
const totalValue: React.CSSProperties = {
  padding: "4px 0",
  fontSize: 12,
  textAlign: "right",
  color: navy,
};
const payableBox: React.CSSProperties = {
  width: "60%",
  marginLeft: "40%",
  backgroundColor: navy,
  borderRadius: 6,
};
const payableLabel: React.CSSProperties = {
  padding: "10px 12px",
  fontSize: 14,
  fontWeight: 700,
  color: "#ffffff",
};
const payableValue: React.CSSProperties = {
  padding: "10px 12px",
  fontSize: 14,
  fontWeight: 700,
  color: gold,
  textAlign: "right",
};
const hr: React.CSSProperties = { borderColor: "#eee", margin: "16px 0 0" };
const footerStrong: React.CSSProperties = {
  margin: 0,
  fontSize: 11,
  fontWeight: 600,
  color: "#2b2b33",
};
const footerFaint: React.CSSProperties = {
  margin: "2px 0 0",
  fontSize: 10,
  color: smoke,
};

export default StatementEmail;
