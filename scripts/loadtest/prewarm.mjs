#!/usr/bin/env node
/**
 * Pre-warms the API and the Neon compute ahead of an on-sale.
 *
 * Two different problems, often confused:
 *
 *   WAKING   — a suspended Neon compute takes time to answer its first query.
 *              A single `SELECT 1` fixes this. That is what `/health/db` does.
 *   SCALING  — Neon autoscales 0.25 -> 2 CU based on load, but not instantly.
 *              A woken-but-idle compute still sits at 0.25 CU, so the first
 *              seconds of a burst hit the smallest possible database.
 *
 * Waking alone does NOT scale. This script does both: it wakes the compute,
 * then holds a light concurrent read load so the autoscaler has a reason to
 * move up before real buyers arrive. It prints DB latency throughout, so you
 * can watch it drop as the compute grows.
 *
 * Prefer raising the autoscaling MINIMUM in the Neon console when your plan
 * allows it — that is deterministic and this script is not. Use this when the
 * minimum can't be raised, or as a belt-and-braces check that the stack is warm.
 *
 * Usage:
 *   node prewarm.mjs --host easy-ticket-api.fly.dev --seconds 300 --slug meu-evento
 */

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, cur, i, arr) => {
    if (cur.startsWith('--')) acc.push([cur.slice(2), arr[i + 1]]);
    return acc;
  }, []),
);

const HOST = args.host ?? 'easy-ticket-api.fly.dev';
const SECONDS = Number(args.seconds ?? 300);
const SLUG = args.slug ?? null;
const CONCURRENCY = Number(args.concurrency ?? 8);
const BASE = `https://${HOST}`;

let stop = false;
let reads = 0;
let errors = 0;

async function readLoop() {
  // Hitting a real read endpoint when a slug is given, because that exercises
  // the query path buyers will actually use. Falls back to the DB healthcheck.
  const url = SLUG
    ? `${BASE}/api/v1/events/${SLUG}/availability`
    : `${BASE}/health/db`;
  while (!stop) {
    try {
      const res = await fetch(url);
      if (!res.ok) errors++;
      await res.arrayBuffer();
      reads++;
    } catch {
      errors++;
    }
  }
}

async function probeDbLatency() {
  const startedAt = Date.now();
  try {
    const res = await fetch(`${BASE}/health/db`);
    const body = await res.json();
    return {
      ok: res.ok,
      roundTripMs: Date.now() - startedAt,
      dbLatencyMs: body?.dbLatencyMs ?? null,
    };
  } catch (err) {
    return { ok: false, roundTripMs: Date.now() - startedAt, dbLatencyMs: null };
  }
}

async function main() {
  console.log(`[prewarm] alvo: ${BASE}`);
  console.log(`[prewarm] duracao: ${SECONDS}s, concorrencia: ${CONCURRENCY}`);
  console.log(`[prewarm] carga em: ${SLUG ? `availability/${SLUG}` : '/health/db'}\n`);

  const first = await probeDbLatency();
  console.log(
    `[prewarm] primeira query (inclui wake se estava suspenso): ` +
      `db=${first.dbLatencyMs}ms total=${first.roundTripMs}ms`,
  );
  if (!first.ok) {
    console.error('[prewarm] AVISO: /health/db nao respondeu OK. Deploy foi feito?');
  }

  const workers = Array.from({ length: CONCURRENCY }, () => readLoop());

  const deadline = Date.now() + SECONDS * 1000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 15_000));
    const probe = await probeDbLatency();
    const restante = Math.max(0, Math.round((deadline - Date.now()) / 1000));
    console.log(
      `[prewarm] db=${String(probe.dbLatencyMs).padStart(4)}ms  ` +
        `reads=${reads}  erros=${errors}  restam=${restante}s`,
    );
  }

  stop = true;
  await Promise.all(workers);

  const last = await probeDbLatency();
  console.log(
    `\n[prewarm] fim. ${reads} leituras, ${errors} erros.\n` +
      `[prewarm] latencia db: ${first.dbLatencyMs}ms (frio) -> ${last.dbLatencyMs}ms (quente)`,
  );
  console.log(
    '[prewarm] confira no console do Neon (Monitoring) se ALLOCATED CU subiu acima de 0.25.',
  );
}

main().catch((err) => {
  console.error('[prewarm] falhou:', err);
  process.exit(1);
});
