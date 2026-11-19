// Token Radar model v2 ("radar-2"): snapshot in, ranked board out.
//
// Board = every rankable pre-token protocol in the snapshot (198 rows here),
// never a hand-picked subset. Rankable follows the watchlist rule itself:
// pre-token (no mcap, no gecko_id, no symbol) AND category not in the
// excluded set AND name not versioned AND no whole word wrapped/staked/
// staking AND name not starting with an exchange name. No protocol name
// is ever special-cased anywhere in this file.
//
// Implied value, from snapshot figures only:
//   base       = tvl_usd * 0.25
//   growth     = clamp(change_7d, -60, 120); growthMult = 1 + growth/100 * 0.5
//   maturity   = 0.6 + min(age_days, 1095)/1095 * 0.4   (unknown age: 365d)
//   chainMult  = 1 + 0.03 * min(chains-1, 10)          (1 chain: 1.00, cap 1.30)
//   stability  = 1 - 0.10 * max(0, |growth|-40)/80     (dampens 7d spikes;
//                1.00 up to |40|%, 0.90 at +120%, 0.975 at -60%)
//   implied    = max(1, round(base * growthMult * maturity * chainMult * stability))
// TVL is size, growth is momentum, maturity is how long it has run with
// no token, chain count is distribution breadth, stability stops one
// wild week from carrying the whole rank. Live-token protocols are kept
// apart: the dashboard shows their market mcap, never a model value.

export interface SnapshotProtocol {
  slug: string; name: string; category: string | null; chains: string[];
  tvl_usd: number; change_7d: number | null; mcap_usd: number | null;
  listed_at: string | null; gecko_id: string | null; symbol: string | null;
}
export interface Snapshot {
  as_of: string; source: string; floor_usd: number;
  protocols: SnapshotProtocol[]; watchlist: string[];
}
export interface ModelConstants {
  base_multiple: number; growth_weight: number; growth_floor: number; growth_cap: number;
  maturity_floor: number; maturity_range: number; maturity_days: number; unknown_age_days: number;
  chain_bonus: number; chain_cap: number; stability_start: number; stability_max: number; stability_range: number;
}
export const MODEL: ModelConstants = {
  base_multiple: 0.25, growth_weight: 0.5, growth_floor: -60, growth_cap: 120,
  maturity_floor: 0.6, maturity_range: 0.4, maturity_days: 1095, unknown_age_days: 365,
  chain_bonus: 0.03, chain_cap: 10, stability_start: 40, stability_max: 0.10, stability_range: 80,
};
export const MODEL_VERSION = 'radar-2';
export const LIVE_ROWS = 24;

export interface FarmStep { text: string; cost: string; time: string }
export interface BoardRow {
  rank: number; slug: string; name: string; category: string | null; chains: string[];
  tvl_usd: number; change_7d: number | null; mcap_usd: number | null; listed_at: string | null;
  gecko_id: string | null; symbol: string | null; token_status: 'pre-token';
  age_days: number | null; implied_value_usd: number;
  model: {
    base_usd: number; growth_pct: number; growth_multiplier: number;
    maturity_multiplier: number; chain_multiplier: number; stability_multiplier: number; age_days: number | null;
  };
  farm_steps: string[];
}
export interface RadarRow {
  rank: number; slug: string; name: string; category: string | null; chains: string[];
  tvl_usd: number; change_7d: number | null; mcap_usd: number | null; listed_at: string | null;
  age_days: number | null; implied_value_usd: number; base_usd: number;
  growth_multiplier: number; maturity_multiplier: number; chain_multiplier: number; stability_multiplier: number;
}
export interface LiveRow {
  slug: string; name: string; category: string | null; chains: string[];
  tvl_usd: number; mcap_usd: number | null; change_7d: number | null;
}
export interface RadarData {
  as_of: string; source: string; floor_usd: number; model: ModelConstants;
  model_version: string; watchlist_size: number; board_size: number;
  early_size: number; live_size: number; rows: RadarRow[]; live: LiveRow[];
}
export class SnapshotError extends Error {
  constructor(m: string) { super(m); this.name = 'SnapshotError'; }
}
const DAY_MS = 86_400_000;
const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;
function finite(v: unknown, f: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : f;
}
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`); const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}
export function impliedValue(p: SnapshotProtocol, asOf: string, m: ModelConstants = MODEL) {
  const age = ageDays(asOf, p.listed_at);
  const growthPct = Math.min(m.growth_cap, Math.max(m.growth_floor, finite(p.change_7d, 0)));
  const growthMult = 1 + (growthPct / 100) * m.growth_weight;
  const ageFor = age ?? m.unknown_age_days;
  const maturityMult = m.maturity_floor + (Math.min(Math.max(ageFor, 0), m.maturity_days) / m.maturity_days) * m.maturity_range;
  const chainMult = 1 + m.chain_bonus * Math.min(Math.max(p.chains.length - 1, 0), m.chain_cap);
  const excess = Math.max(0, Math.abs(growthPct) - m.stability_start);
  const stabilityMult = 1 - m.stability_max * (excess / m.stability_range);
  const base = p.tvl_usd * m.base_multiple;
  const implied = Math.max(1, Math.round(base * growthMult * maturityMult * chainMult * stabilityMult));
  return { implied, base, growthPct, growthMult, maturityMult, chainMult, stabilityMult, age };
}
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
const EXCLUDED_CATEGORIES = new Set(['CEX', 'Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC']);
const EXCHANGE_NAMES = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}
// Rankable = the watchlist rule, applied to every protocol, not just the watchlist.
export function isRankable(p: SnapshotProtocol): boolean {
  if (!isPreToken(p)) return false;
  if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) return false;
  if (VERSIONED.test(p.name)) return false;
  const words = p.name.toLowerCase().match(/[a-z]+/g) ?? [];
  if (words.some((w) => w === 'wrapped' || w === 'staked' || w === 'staking')) return false;
  if (EXCHANGE_NAMES.some((e) => p.name.startsWith(e))) return false;
  return true;
}
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const chosen = snapshot.protocols.filter(isRankable);
  const scored = chosen.map((p) => ({ p, v: impliedValue(p, snapshot.as_of, model) }));
  scored.sort((a, b) => b.v.implied - a.v.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1, slug: s.p.slug, name: s.p.name, category: s.p.category, chains: s.p.chains,
    tvl_usd: s.p.tvl_usd, change_7d: s.p.change_7d, mcap_usd: s.p.mcap_usd, listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id, symbol: s.p.symbol, token_status: 'pre-token' as const,
    age_days: s.v.age, implied_value_usd: s.v.implied,
    model: {
      base_usd: Math.round(s.v.base), growth_pct: s.v.growthPct,
      growth_multiplier: round4(s.v.growthMult), maturity_multiplier: round4(s.v.maturityMult),
      chain_multiplier: round4(s.v.chainMult), stability_multiplier: round4(s.v.stabilityMult), age_days: s.v.age,
    },
    farm_steps: farmSteps(s.p, s.v.age).map(stepText),
  }));
}
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}
// One action per category family, derived from the category string only.
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase(); const n = p.name;
  if (c.includes('risk curator') || c.includes('curator') || c.includes('allocator')) return `Deposit $${capital} into a ${n} vault on ${chain} and keep the vault shares.`;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${n} on ${chain} and keep the position open.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) return `Provide $${capital} of liquidity to ${n}'s main pool on ${chain} and keep the position open.`;
  if (c.includes('basis')) return `Deposit $${capital} of USDC into ${n}'s basis strategy on ${chain} and hold the receipt.`;
  if (c.includes('rwa')) return `Mint $${capital} of the yield-bearing asset through ${n} on ${chain} and hold it.`;
  if (c.includes('derivative') || c.includes('perpetual') || c.includes('options')) return `Deposit $${capital} of USDC as margin on ${n} and open one small hedged position.`;
  if (c.includes('staking')) return `Stake $${capital} of the chain's staking asset through ${n} and keep the receipt.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC to ${chain} through ${n} and use the bridged funds in its app.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${n} on ${chain}.`;
  if (c.includes('prediction')) return `Fund $${capital} and place one market position on ${n}.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${n} on ${chain} and keep the policy.`;
  if (c.includes('chain')) return `Use $${capital} of ${n}'s native activity on ${chain}: one swap, one deposit and one vote.`;
  return `Deposit $${capital} of USDC into ${n} on ${chain} and keep the position open.`;
}
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p); const capital = capitalFor(p); const hold = holdDaysFor(age);
  const secondChain = p.chains.length > 1 ? p.chains[1]! : null;
  return [
    { text: `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.`, cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
    { text: actionFor(p, capital, chain), cost: `$${capital} of capital and about $${capital >= 150 ? 8 : 4} of gas`, time: '15 minutes to set up' },
    { text: secondChain ? `Repeat one qualifying action on ${secondChain} so the position is visible on a second chain.` : `Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.`, cost: 'about $2 of gas a week', time: '10 minutes a week' },
    { text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`, cost: `the $${capital} stays in the position`, time: `${hold} days` },
    { text: `Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.`, cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
    { text: `Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.`, cost: 'nothing but the log', time: '5 minutes' },
  ];
}
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({ slug: p.slug, name: p.name, category: p.category, chains: p.chains, tvl_usd: p.tvl_usd, mcap_usd: p.mcap_usd, change_7d: p.change_7d }));
}
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank, slug: row.slug, name: row.name, category: row.category, chains: row.chains,
    tvl_usd: row.tvl_usd, change_7d: row.change_7d, mcap_usd: row.mcap_usd, listed_at: row.listed_at,
    age_days: row.age_days, implied_value_usd: row.implied_value_usd, base_usd: row.model.base_usd,
    growth_multiplier: row.model.growth_multiplier, maturity_multiplier: row.model.maturity_multiplier,
    chain_multiplier: row.model.chain_multiplier, stability_multiplier: row.model.stability_multiplier,
  };
}
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const radar: RadarData = {
    as_of: snapshot.as_of, source: snapshot.source, floor_usd: snapshot.floor_usd,
    model, model_version: MODEL_VERSION, watchlist_size: snapshot.watchlist.length,
    board_size: board.length, early_size: early, live_size: live.length,
    rows: board.map(radarRow), live,
  };
  return { board, radar };
}
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { throw new SnapshotError('snapshot.json is not JSON'); }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    return {
      slug: p.slug, name: p.name, category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return { as_of: o.as_of, source: o.source, floor_usd: o.floor_usd, protocols, watchlist: o.watchlist as string[] };
}
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slugs: ${missing.slice(0, 5).join(', ')}`;
  if (board.length < 100 || board.length > 4000) return `board has ${board.length} rows, outside 100..4000`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) return `all ${board.length} rows share the same implied value`;
  for (const r of board) {
    if (r.farm_steps.length < 3 || r.farm_steps.length > 12) return `${r.slug} has ${r.farm_steps.length} farm steps`;
    for (const s of r.farm_steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
