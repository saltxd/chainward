-- 0018: brief_orders.brief_markdown — the written Intel Brief, attached at
-- fulfilment so it is delivered IN-APP to the paying wallet ("Your requests" on
-- /request-brief). Replaces the human forward step for private delivery; public
-- (X-thread) orders store it too so the buyer keeps the long-form brief.
-- See apps/api/src/routes/brief.ts (ops status) + scripts/fulfill-briefs.ts.

ALTER TABLE brief_orders ADD COLUMN IF NOT EXISTS brief_markdown text;
