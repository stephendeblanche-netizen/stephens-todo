import { drizzle } from "drizzle-orm/mysql2";
import { categories, tasks } from "../drizzle/schema.ts";

const SEED_CATEGORIES = [
  {
    name: "URGENT",
    kind: "urgent" as const,
    colorIndex: 0,
    sortOrder: 0,
    items: [
      "Offer to Nakeshri",
      "Offer to Ollie",
      "R&R for Merlin and Aaron",
      "Sales Plan \u2013 Dean Led",
      "Mom's 80th",
      "Alignment of Ops Leads and AM's -> Account Plan",
      "Hila \u2013 GTM must include operational capability required beyond onboarding",
      "MOU for BlueSure",
      "Go after Sigma Clients",
      "CT Site/people",
      "Max Billing Target",
    ],
  },
  {
    name: "QDR",
    kind: "normal" as const,
    colorIndex: 0,
    sortOrder: 1,
    items: [
      { text: "Client success person" },
      {
        text: "Business Development",
        children: [
          { text: "Account Management Capacity for" },
          {
            text: "Specific Opportunities",
            children: [
              { text: "Lemfi" },
              { text: "Snap UK" },
              { text: "Scottish Power" },
              { text: "Qualco" },
              { text: "Intrum" },
            ],
          },
          {
            text: "New Opportunities",
            children: [{ text: "TalkTalk" }],
          },
        ],
      },
      { text: "Branding / Website / Bulking up the Corporate Image" },
      {
        text: "Contracting",
        children: [
          { text: "Personal Loans" },
          { text: "Finalising FCA" },
          { text: "Mauritius" },
          { text: "Tri-Partite" },
          {
            text: "Pricing",
            children: [{ text: "Hourly Rate, Contingency, Fixed Fee" }],
          },
        ],
      },
      {
        text: "Budget",
        children: [
          { text: "Move workloads to SA plus software licenses etc" },
          { text: "Max bill on current = 10" },
          { text: "Discount rates = 6" },
        ],
      },
      { text: "Loan/Interest Payments \u2013 Formalise" },
      { text: "QA scorecard" },
    ],
  },
  {
    name: "Operational Reporting",
    kind: "normal" as const,
    colorIndex: 1,
    sortOrder: 2,
    items: [
      { text: "Master Dashboard" },
      { text: "Onboarding and Ramp Down tracking" },
      { text: "Build out of Full Competitive Capability Gaps" },
    ],
  },
  {
    name: "Zoey Spin-Out",
    kind: "normal" as const,
    colorIndex: 2,
    sortOrder: 3,
    items: [{ text: "Hila re GTM" }],
  },
  {
    name: "Dad",
    kind: "normal" as const,
    colorIndex: 3,
    sortOrder: 4,
    items: [{ text: "Sell coins" }],
  },
  {
    name: "Tony",
    kind: "normal" as const,
    colorIndex: 4,
    sortOrder: 5,
    items: [
      {
        text: "Group restructure",
        children: [
          { text: "Second Director" },
          { text: "Formalise loans and maintain discipline" },
          { text: "Update MOI's" },
          {
            text: "Clean-up CIPC",
            children: [
              { text: "Directors" },
              { text: "AFS's" },
              { text: "Beneficial Ownership" },
            ],
          },
          { text: "Shareholder Agreements" },
        ],
      },
      {
        text: "Construction: BBBEE Deal \u2013 Timeline/Value Threshold \u2013 NB: substance over form",
        children: [
          { text: "R7.5m owed (suing)" },
          { text: "New contracts" },
          { text: "Valuation in term of restructure" },
        ],
      },
      { text: "Sfera MT Investment \u2013 clean-up for future use" },
      { text: "Eastern Autobody Home" },
      { text: "BlueSure" },
      { text: "Rock \u2013 in or out (Nicola)" },
      { text: "Sauce business (premises)" },
    ],
  },
  {
    name: "Company Clean-Up",
    kind: "normal" as const,
    colorIndex: 5,
    sortOrder: 6,
    items: [
      { text: "Imbriolo Share Trust (Sabrina) \u2013 change name (guy through Alon)" },
      { text: "For both trusts change Trustees (remove Evan S) (guy through Alon)" },
      { text: "Allsure \u2013 check with Cliffie whats happening with shutting this down" },
      { text: "Octagon \u2013 sold property, keep entity, clean up, keep Craig, add Director" },
      { text: "AFS \u2013 Peter Marsh for latest on everything" },
      { text: "Collect documents for BlueSpan x 3 entities (Rock, PFS, Craig/Prop)" },
      { text: "Cleanup Sfera MT" },
      { text: "Richtrau (assessed loss), move to Holdings" },
    ],
  },
  {
    name: "Joel Walker",
    kind: "normal" as const,
    colorIndex: 6,
    sortOrder: 7,
    items: [{ text: "Exec Cycle Event" }, { text: "Kenya Event" }],
  },
  {
    name: "Mobility.OS",
    kind: "normal" as const,
    colorIndex: 7,
    sortOrder: 8,
    items: [{ text: "Website for SuperGroup" }],
  },
];

type SeedItem = string | { text: string; children?: SeedItem[] };

async function insertTasksRecursive(
  db: ReturnType<typeof drizzle>,
  items: SeedItem[],
  categoryId: number,
  parentId: number | null,
  startOrder: number
): Promise<void> {
  let order = startOrder;
  for (const item of items) {
    const text = typeof item === "string" ? item : item.text;
    const children = typeof item === "string" ? [] : (item.children ?? []);

    const [result] = await db.insert(tasks).values({
      categoryId,
      parentId: parentId ?? undefined,
      text,
      note: "",
      done: false,
      collapsed: false,
      sortOrder: order++,
    });

    const insertId = (result as unknown as { insertId: number }).insertId;

    if (children.length > 0) {
      await insertTasksRecursive(db, children, categoryId, insertId, 0);
    }
  }
}

export async function seedIfEmpty(db: ReturnType<typeof drizzle>): Promise<void> {
  const existing = await db.select().from(categories).limit(1);
  if (existing.length > 0) {
    return; // already seeded
  }

  console.log("[Seed] Seeding initial data...");

  for (const cat of SEED_CATEGORIES) {
    const [catResult] = await db.insert(categories).values({
      name: cat.name,
      kind: cat.kind,
      colorIndex: cat.colorIndex,
      sortOrder: cat.sortOrder,
      collapsed: false,
    });

    const catId = (catResult as unknown as { insertId: number }).insertId;
    await insertTasksRecursive(db, cat.items, catId, null, 0);
  }

  console.log("[Seed] Done.");
}
