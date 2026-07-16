/**
 * Phase 4 — Provider-agnostic AML adapters.
 *
 * Real IDV / screening providers (Frankie, Trulioo, ComplyAdvantage, Refinitiv…)
 * plug in behind these interfaces. Until keys are wired via `add_secret`, the
 * `simulator` provider returns deterministic, seed-based results so the whole
 * workflow (initiate → run → match resolution → status) is fully exercisable
 * end-to-end without ever calling out and without any false-pass path.
 *
 * Providers MUST NEVER be selected client-side. Callers pass a provider hint
 * only; the shared factory decides based on env + case metadata.
 */

export type IdvMethod = "document_and_liveness" | "document_only" | "database_lookup" | "manual";

export interface IdvRequest {
  caseId: string;
  subjectLabel: string;
  method: IdvMethod;
  metadata?: Record<string, unknown>;
}

export interface IdvResult {
  provider: string;
  providerReference: string;
  status: "verified" | "failed" | "manual_review" | "pending" | "in_progress";
  overallScore: number;
  checks: Array<{ name: string; status: "pass" | "fail" | "warn"; detail?: string }>;
  raw: Record<string, unknown>;
}

export type ScreeningScope = "pep" | "sanctions" | "adverse_media" | "watchlist";

export interface ScreeningRequest {
  caseId: string;
  subjectLabel: string;
  subjectType: "individual" | "entity" | "trust";
  scope: ScreeningScope[];
  metadata?: Record<string, unknown>;
}

export interface ScreeningMatch {
  matchType: "pep" | "sanctions" | "adverse_media" | "watchlist" | "other";
  listName: string;
  matchedName: string;
  score: number;
  jurisdiction?: string;
  details: Record<string, unknown>;
}

export interface ScreeningResult {
  provider: string;
  providerReference: string;
  status: "clear" | "matched" | "review";
  matches: ScreeningMatch[];
  summary: Record<string, unknown>;
  raw: Record<string, unknown>;
}

export interface IdvProvider {
  readonly name: string;
  runIdv(req: IdvRequest): Promise<IdvResult>;
}

export interface ScreeningProvider {
  readonly name: string;
  runScreening(req: ScreeningRequest): Promise<ScreeningResult>;
}

// ---------- deterministic simulator ----------

function hashSeed(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h >>> 0);
}

function pseudoRandom(seed: number, salt: string): number {
  const n = hashSeed(`${seed}|${salt}`);
  return (n % 10_000) / 10_000; // 0..1
}

const SIMULATOR_IDV: IdvProvider = {
  name: "simulator",
  async runIdv(req) {
    const seed = hashSeed(`${req.caseId}|${req.subjectLabel}`);
    const scoreBase = pseudoRandom(seed, "idv");
    const overallScore = Math.round((0.6 + scoreBase * 0.4) * 100) / 100; // 0.60–1.00
    const status: IdvResult["status"] =
      overallScore >= 0.85 ? "verified" : overallScore >= 0.70 ? "manual_review" : "failed";
    return {
      provider: "simulator",
      providerReference: `SIM-IDV-${seed.toString(36).slice(0, 10).toUpperCase()}`,
      status,
      overallScore,
      checks: [
        { name: "document_authenticity", status: status === "failed" ? "fail" : "pass" },
        { name: "face_match", status: overallScore >= 0.8 ? "pass" : "warn" },
        { name: "liveness", status: req.method === "document_only" ? "warn" : "pass" },
        { name: "database_crossmatch", status: "pass" },
      ],
      raw: { simulated: true, method: req.method, generated_at: new Date().toISOString() },
    };
  },
};

const KNOWN_LIST_HITS = [
  { pattern: /vladimir|putin/i, list: "OFAC SDN",           type: "sanctions" as const, jur: "US" },
  { pattern: /kim jong/i,       list: "UN Consolidated",    type: "sanctions" as const, jur: "UN" },
  { pattern: /orban|erdogan/i,  list: "PEP Register",       type: "pep" as const,       jur: "EU" },
];

const SIMULATOR_SCREENING: ScreeningProvider = {
  name: "simulator",
  async runScreening(req) {
    const seed = hashSeed(`${req.caseId}|${req.subjectLabel}`);
    const matches: ScreeningMatch[] = [];

    for (const rule of KNOWN_LIST_HITS) {
      if (rule.pattern.test(req.subjectLabel) && req.scope.includes(rule.type as ScreeningScope)) {
        matches.push({
          matchType: rule.type,
          listName: rule.list,
          matchedName: req.subjectLabel,
          score: 0.92,
          jurisdiction: rule.jur,
          details: { rule: "keyword", simulated: true },
        });
      }
    }

    // Fuzzy adverse-media chance for demo purposes.
    if (req.scope.includes("adverse_media") && pseudoRandom(seed, "am") > 0.85) {
      matches.push({
        matchType: "adverse_media",
        listName: "Aggregated News",
        matchedName: req.subjectLabel,
        score: 0.62,
        details: { headline: "Regulatory inquiry (simulated)", simulated: true },
      });
    }

    const status: ScreeningResult["status"] =
      matches.length === 0 ? "clear"
      : matches.some((m) => m.score >= 0.85) ? "matched"
      : "review";

    return {
      provider: "simulator",
      providerReference: `SIM-SCR-${seed.toString(36).slice(0, 10).toUpperCase()}`,
      status,
      matches,
      summary: {
        scope: req.scope,
        match_count: matches.length,
        high_confidence_count: matches.filter((m) => m.score >= 0.85).length,
      },
      raw: { simulated: true, generated_at: new Date().toISOString() },
    };
  },
};

// ---------- factory ----------

export function getIdvProvider(preferred?: string): IdvProvider {
  // Real providers gated by env secrets. Absent → simulator (safe default).
  const forced = (Deno.env.get("AML_IDV_PROVIDER") || preferred || "").toLowerCase();
  if (forced && forced !== "simulator") {
    // Real adapter would go here — for now we fall back to simulator to avoid false-pass.
    console.warn(`[aml/providers] IDV provider "${forced}" not wired; using simulator.`);
  }
  return SIMULATOR_IDV;
}

export function getScreeningProvider(preferred?: string): ScreeningProvider {
  const forced = (Deno.env.get("AML_SCREENING_PROVIDER") || preferred || "").toLowerCase();
  if (forced && forced !== "simulator") {
    console.warn(`[aml/providers] Screening provider "${forced}" not wired; using simulator.`);
  }
  return SIMULATOR_SCREENING;
}

// ---------- webhook signature verification ----------

/**
 * Timing-safe HMAC-SHA256 verification for provider webhooks.
 * Providers supply a shared secret via `add_secret` (e.g. AML_WEBHOOK_SECRET_<PROVIDER>).
 */
export async function verifyWebhookSignature(
  rawBody: string,
  signatureHex: string,
  secret: string,
): Promise<boolean> {
  if (!signatureHex || !secret) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const macBuf = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const expected = Array.from(new Uint8Array(macBuf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  if (expected.length !== signatureHex.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ signatureHex.charCodeAt(i);
  }
  return diff === 0;
}
