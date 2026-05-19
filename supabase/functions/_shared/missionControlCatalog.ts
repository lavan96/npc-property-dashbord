// Mission Control pricing catalog client.
// Reads roles / add-ons / setup packages / per-report credit costs from
// Aurixa Mission Control. In-memory cache (5 min) keeps per-function
// invocations cheap; new edge-function instances re-fetch on cold start.
import { MissionControlError } from "./missionControl.ts";

const BASE_URL = (Deno.env.get("MISSION_CONTROL_URL") ?? "").replace(/\/+$/, "");
const API_KEY = Deno.env.get("MISSION_CONTROL_CLONE_API_KEY") ?? "";

export interface CatalogRole {
  slug: string;
  name: string;
  price_min_cents: number;
  price_max_cents: number;
  currency: string;
  permissions: string[];
}
export interface CatalogAddon {
  slug: string;
  name: string;
  price_min_cents: number;
  price_max_cents: number;
  currency?: string;
  billing_period: string;
  included_in_plans: string[];
  description?: string | null;
}
export interface CatalogSetup {
  slug: string;
  name: string;
  applies_to_plans: string[];
  deliverables: string[];
  price_cents?: number;
  currency?: string;
  description?: string | null;
}
export interface CatalogReport {
  slug: string;
  name: string;
  credit_cost: number;
  description?: string | null;
}

export interface Catalog {
  roles: CatalogRole[];
  addons: CatalogAddon[];
  setups: CatalogSetup[];
  reports: CatalogReport[];
  fetched_at: string;
}

const CACHE_TTL_MS = 5 * 60 * 1000;
let cache: { value: Catalog; expires: number } | null = null;
let inflight: Promise<Catalog> | null = null;

function emptyCatalog(): Catalog {
  return { roles: [], addons: [], setups: [], reports: [], fetched_at: new Date(0).toISOString() };
}

function assertConfigured() {
  if (!BASE_URL || !API_KEY) {
    throw new MissionControlError(
      "unconfigured",
      "MISSION_CONTROL_URL or MISSION_CONTROL_CLONE_API_KEY missing",
      500,
    );
  }
}

async function fetchFromMc(): Promise<Catalog> {
  assertConfigured();
  let lastStatus = 0;
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(`${BASE_URL}/api/public/pricing/catalog`, {
      method: "GET",
      headers: { "x-clone-api-key": API_KEY, accept: "application/json" },
    });
    lastStatus = res.status;
    if (res.status === 429 && attempt === 0) {
      const ra = Number(res.headers.get("retry-after") ?? "1");
      await new Promise((r) => setTimeout(r, Math.min(Math.max(ra, 1), 10) * 1000));
      continue;
    }
    if (res.status >= 500 && attempt === 0) {
      await new Promise((r) => setTimeout(r, 500));
      continue;
    }
    const text = await res.text();
    let body: any = {};
    try { body = text ? JSON.parse(text) : {}; } catch { /* ignore */ }
    if (!res.ok || body?.ok === false) {
      throw new MissionControlError(
        String(body?.error ?? "mc_error"),
        String(body?.message ?? `Mission Control catalog ${res.status}`),
        res.status || 500,
        body,
      );
    }
    return {
      roles: Array.isArray(body?.roles) ? body.roles : [],
      addons: Array.isArray(body?.addons) ? body.addons : [],
      setups: Array.isArray(body?.setups) ? body.setups : [],
      reports: Array.isArray(body?.reports) ? body.reports : [],
      fetched_at: new Date().toISOString(),
    };
  }
  throw new MissionControlError("mc_error", `Catalog fetch failed (${lastStatus})`, lastStatus || 500);
}

export async function fetchCatalog(opts: { force?: boolean } = {}): Promise<Catalog> {
  const now = Date.now();
  if (!opts.force && cache && cache.expires > now) return cache.value;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const value = await fetchFromMc();
      cache = { value, expires: now + CACHE_TTL_MS };
      return value;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/** Returns the catalog if available, otherwise an empty stub. Never throws. */
export async function safeFetchCatalog(): Promise<Catalog> {
  try { return await fetchCatalog(); }
  catch (e) {
    console.warn("[missionControlCatalog] fetch failed", e instanceof Error ? e.message : e);
    return cache?.value ?? emptyCatalog();
  }
}

export async function getReportCreditCost(slug: string): Promise<number | null> {
  if (!slug) return null;
  const cat = await safeFetchCatalog();
  const hit = cat.reports.find((r) => r.slug === slug);
  return hit ? Number(hit.credit_cost) : null;
}

export async function getSeatRole(slug: string): Promise<CatalogRole | null> {
  if (!slug) return null;
  const cat = await safeFetchCatalog();
  return cat.roles.find((r) => r.slug === slug) ?? null;
}

export function invalidateCatalogCache() {
  cache = null;
}
