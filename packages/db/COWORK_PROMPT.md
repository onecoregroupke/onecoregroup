# One Core Group — Marketing campaign + content generator

You're helping me populate the One Core Group marketing hub (Next.js + Supabase) with **one campaign per brand** and **12–20 scheduled content rows per campaign**. Your final deliverable is a single self-contained SQL file I can paste into the Supabase SQL Editor.

---

## The brands and how to talk about each

| Brand | Slug | Voice & priority |
|---|---|---|
| Nairobi Piano Technicians | `nairobi-piano-technicians` | Expert, trustworthy. High-intent business — every post nudges toward WhatsApp enquiry, showroom visit, or catalogue browse. Mix: piano sales, tuning, repair, moving, lessons, technician craft, customer stories. |
| Glitz N' Glim | `glitz-n-glim` | Fresh, aspirational, family-friendly. E-commerce — every post nudges toward WhatsApp order or website. Mix: product showcase, before/after, fragrance hooks, value-pack promos. |
| Nuuranest Stays | `nuuranest-stays` | Warm coastal hospitality. Booking-driven — nudges toward WhatsApp booking, Booking.com, or Airbnb. Mix: room showcase, local experiences (Nyali, Bamburi, Mombasa), guest testimonials. |
| Ar-Rayyan Playhouse & Daycare | `ar-rayyan-playhouse` | Warm, nurturing, parent-focused. Mix: activities of the day, parent tips, child milestones, enrollment CTAs. |
| Rhythms College | `rhythms-college` | Passionate, achievement-focused. Mix: student wins, teacher spotlights, instrument deep-dives, enrollment CTAs, recital announcements. |
| Darul Swafa | `darul-swafa` | Respectful, knowledge-rich. Mix: short Islamic teachings, programme announcements, student progress, enrollment CTAs. |

All six brands share One Core Group's operating system: **Content → Landing / Catalogue → WhatsApp / Form → Follow-up → Conversion → Review → Retargeting → Reporting.** Every single post must answer: *"What action do we want the audience to take after seeing this?"* No filler.

---

## The data model you're writing INSERTs for

### `marketing_campaigns`
A bounded unit of work — goal, audience, window, owner.

| Column | Type | Notes |
|---|---|---|
| `brand_id` | UUID | FK to `brands(id)`. Use the slug-lookup pattern. |
| `slug` | TEXT UNIQUE | Format: `<brand>-<theme>-<yyyymm>` e.g. `npt-piano-discovery-202612` |
| `name` | TEXT | Human-friendly campaign name. |
| `goal` | TEXT | 1-2 sentences. What outcome by what date. |
| `audience_summary` | TEXT | 1 sentence on who. |
| `primary_channel` | TEXT | e.g. `instagram`, `whatsapp` |
| `secondary_channels` | TEXT[] | optional |
| `start_date`, `end_date` | DATE | Both required for the campaign to show as a bar on the calendar. |
| `status` | TEXT | Default `planning`. Use `planning` for everything. |
| `utm_campaign` | TEXT | Default = slug. |
| `target_leads` | INT | optional |
| `target_revenue_ksh` | NUMERIC | optional |
| `owner_email` | TEXT | use `wallace@onecoregroup.com` |
| `notes` | TEXT | optional |

### `marketing_content`
Every planned post is one row. Status machine: `idea → draft → review → approved → scheduled → published`. For our seed, **use `draft`** (so Wallace can review before scheduling).

| Column | Type | Notes |
|---|---|---|
| `brand_id` | UUID | FK |
| `platform_id` | UUID | FK to `marketing_platforms`. Match the brand. |
| `campaign_id` | UUID | FK to the campaign you just created. |
| `content_type` | TEXT | `post | story | reel | short | video | thread | channel_message | status | ad | newsletter_issue | blog_post` |
| `status` | TEXT | `draft` |
| `posted_via` | TEXT | `manual` |
| `title` | TEXT | Internal label, also shown on the calendar chip. ≤ 60 chars. |
| `hook` | TEXT | The scroll-stopping first line. 1 line. |
| `body_markdown` | TEXT | Full caption. 2-4 short paragraphs, ending with a clear CTA. |
| `hashtags` | TEXT | Space-separated, 5-8 tags, mix of brand + niche + location (Kenya / Nairobi / Mombasa). |
| `scheduled_at` | TIMESTAMPTZ | EAT time. Use `'2026-12-15T08:00:00+03:00'::timestamptz`. |
| `owner_email` | TEXT | `wallace@onecoregroup.com` |
| `metadata` | JSONB | Stash `{"_seed_run": "<run-id>"}` (see "re-runnability" below). |

### `marketing_content_pillars`
M:M join. Every content row links to **1 or 2** pillars. Use the CTE pattern shown below.

---

## My hub state (paste the JSON output from the inspection query here)

```json
PASTE THE OUTPUT OF THE `hub_state` JSON QUERY HERE.
It contains brands[], platforms[], pillars[] with their UUIDs.
You don't have to hardcode UUIDs — use slug-lookup subqueries in the SQL.
```

---

## Content guidelines

**Cadence per active platform (use as a guide, not a quota):**
- Instagram: ~4 posts/wk (mix reels + carousels + statics)
- TikTok: ~3 reels/wk
- Facebook: ~2 posts/wk
- X: ~3 posts/wk
- YouTube: 1 short/wk
- WhatsApp Status: daily (use `content_type='status'`)

**Posting times (EAT):** 07:00–09:00, 12:00–13:00, 18:00–20:00. Vary across the campaign — don't dump everything at 09:00.

**Pillar mix per campaign:** roughly 35% visibility, 25% engagement, 25% conversion, 15% authority. Tag each content row with the right pillar slug(s): `visibility`, `engagement`, `conversion`, `authority`.

**Hooks:** scroll-stopping, ≤ 12 words, Kenyan English. Examples:
- "Your piano has secrets only a tuner can hear."
- "One bottle. Six surfaces. Zero streaks."
- "Sunrise from the Bamburi balcony — your alarm clock for the weekend."

**Bodies:** 2-4 short paragraphs (no walls of text). Always end with one specific CTA: *"DM us to book", "Tap the link in bio", "Visit our Nairobi showroom", "Order on WhatsApp: wa.me/254…"*

**Hashtags:** brand tag + 2 niche tags + 2 location tags. Don't repeat the same 8 tags on every post — vary 1-2 per post.

---

## Output format

A single `.sql` file structured like this:

```sql
-- =============================================================================
-- One Core Group — campaign seed: <month/quarter>, brands × campaigns
-- Generated by Cowork on <date>. Seed run id: <run-id>.
--
-- To re-run cleanly:
--   DELETE FROM marketing_content_pillars
--     WHERE content_id IN (SELECT id FROM marketing_content WHERE metadata->>'_seed_run' = '<run-id>');
--   DELETE FROM marketing_content WHERE metadata->>'_seed_run' = '<run-id>';
--   DELETE FROM marketing_campaigns WHERE slug IN ('<slug1>', '<slug2>', …);
-- =============================================================================

BEGIN;

-- 1) Campaigns -------------------------------------------------------------
INSERT INTO marketing_campaigns (brand_id, slug, name, goal, audience_summary, primary_channel, start_date, end_date, status, utm_campaign, target_leads, owner_email, notes)
VALUES
  ((SELECT id FROM brands WHERE slug = 'nairobi-piano-technicians'),
   'npt-piano-discovery-202612', 'Piano Discovery — December 2026',
   'Drive 30 showroom visits and 50 WhatsApp catalogue enquiries by Dec 31.',
   'Pianists, parents of music students, churches, schools, music studios in Nairobi.',
   'instagram', '2026-12-01', '2026-12-31', 'planning',
   'npt-piano-discovery-202612', 50, 'wallace@onecoregroup.com',
   'Anchor reels on tuning craft + customer stories. Push showroom-visit CTA every Friday.')
  -- … repeat for the other 5 brands
ON CONFLICT (slug) DO NOTHING;

-- 2) Content + pillar links (one CTE per row) ------------------------------
WITH ins AS (
  INSERT INTO marketing_content (
    brand_id, platform_id, campaign_id, content_type, status, posted_via,
    title, hook, body_markdown, hashtags, scheduled_at, owner_email, metadata
  ) VALUES (
    (SELECT id FROM brands WHERE slug = 'nairobi-piano-technicians'),
    (SELECT id FROM marketing_platforms
       WHERE brand_id = (SELECT id FROM brands WHERE slug = 'nairobi-piano-technicians')
         AND platform = 'instagram' AND handle IS NULL),
    (SELECT id FROM marketing_campaigns WHERE slug = 'npt-piano-discovery-202612'),
    'reel', 'draft', 'manual',
    '3 sounds your piano makes when it needs tuning',
    'Your piano has secrets only a tuner can hear.',
    $body$Most pianos in Nairobi go years between tunings. Here are three sounds that mean it's time to call us:

1. Notes that ring against each other in the same chord.
2. A flat, "dead" feel in the middle octaves.
3. Buzzing or rattling when you play softly.

If any of these sound familiar, DM us — we'll book a visit this week.$body$,
    '#nairobipianotechnicians #pianotuningkenya #pianocarenairobi #musicnairobi #kenyamusic',
    '2026-12-02T08:00:00+03:00'::timestamptz,
    'wallace@onecoregroup.com',
    '{"_seed_run":"2026-12-rev1"}'::jsonb
  )
  RETURNING id
)
INSERT INTO marketing_content_pillars (content_id, pillar_id)
SELECT ins.id, p.id
FROM ins
CROSS JOIN marketing_pillars p
WHERE p.slug IN ('authority', 'conversion');

-- … repeat the CTE block for every other content row …

COMMIT;
```

### Critical conventions

1. **Slug-lookup everything.** Never paste raw UUIDs. Use `(SELECT id FROM brands WHERE slug = '…')` etc. The SQL must work on any environment.
2. **Dollar-quote captions.** Use `$body$ … $body$` for `body_markdown` so apostrophes and quotes inside the text don't break the SQL.
3. **Tag every row** with `metadata->>'_seed_run'` so I can wipe and re-run cleanly.
4. **One CTE per content row** so the pillar link sees the new id without juggling UUIDs in your head.
5. **Wrap in a single `BEGIN; … COMMIT;`** so a syntax error rolls back instead of half-applying.
6. **Don't schedule two posts for the same platform within 60 minutes of each other.** Spread the cadence.

---

## Step-by-step you should follow

1. Read everything above.
2. Confirm the `hub_state` JSON I pasted contains brands + platforms + pillars. If anything's missing (e.g. a brand has no `tiktok` platform), skip that platform for that brand — don't invent IDs.
3. Pick a campaign **theme + window** per brand. Use a unique theme — don't reuse "December push" across brands. Each campaign should be 2–4 weeks.
4. For each campaign, draft 12–20 content rows distributed across the window and the brand's active platforms, with the pillar mix above. Hook + body should be real, ready-to-publish copy in the brand's voice — not placeholders like "TBD" or "Lorem ipsum".
5. Emit the full SQL file in one code block. No commentary in between. Wrap with `BEGIN; … COMMIT;`.
6. At the very end, list each campaign slug and its content count, so I can sanity-check before I run it.

Begin.
