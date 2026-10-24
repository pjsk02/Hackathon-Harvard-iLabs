// Protected data (owner: P2). Server only. Imported ONLY by server/gateway/gateway.ts.
// Values from the team's Demo data tab. All people and companies are fictional.

const MARGINS = [
  { region: "West", revenueM: 52.7, marginPct: 24.1, changePts: 0.8 },
  { region: "Northeast", revenueM: 48.2, marginPct: 21.4, changePts: 0.3 },
  { region: "Midwest", revenueM: 36.5, marginPct: 18.7, changePts: -1.1 },
  { region: "South", revenueM: 41.9, marginPct: 16.2, changePts: -1.9 },
];

const SALARIES = [
  { id: "E01", name: "Maya Chen", role: "Regional Director", region: "Northeast", baseSalaryUsd: 182000 },
  { id: "E02", name: "Daniel Okafor", role: "Regional Director", region: "Midwest", baseSalaryUsd: 176500 },
  { id: "E03", name: "Lucia Ramirez", role: "Regional Director", region: "South", baseSalaryUsd: 171000 },
  { id: "E04", name: "Tom Becker", role: "Regional Director", region: "West", baseSalaryUsd: 188000 },
  { id: "E05", name: "Priya Nair", role: "Finance Manager", region: "HQ", baseSalaryUsd: 142000 },
  { id: "E06", name: "Grace Liu", role: "Merchandising Lead", region: "West", baseSalaryUsd: 118000 },
  { id: "E07", name: "Jonah Weiss", role: "Supply Chain Analyst", region: "HQ", baseSalaryUsd: 96000 },
  { id: "E08", name: "Marco Rossi", role: "Store Manager", region: "Northeast", baseSalaryUsd: 88000 },
  { id: "E09", name: "Sam Whitaker", role: "Store Manager", region: "Midwest", baseSalaryUsd: 84500 },
  { id: "E10", name: "Aisha Bello", role: "Store Manager", region: "South", baseSalaryUsd: 79000 },
];

// The only export: action name -> data function. No generic getData(any).
export const DATA = {
  read_regional_margins: () => MARGINS.map((r) => ({ ...r })),
  read_employee_salaries: () => SALARIES.map((r) => ({ ...r })),
} as const;
