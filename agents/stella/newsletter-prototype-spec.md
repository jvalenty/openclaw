# Final Technical Specification: Newsletter Prototype Engine

**1. Data Acquisition & Extraction**
- **Trigger:** Batch ingestion (1,000 leads/week) from the source CRM.
- **Scraping:** Extract company name, logo, HEX colors, and service descriptions from the prospect's URL.
- **Resilience Strategy:** Fallback cascade for logos (`og:image` → header → favicon → text placeholder) and colors (CSS → image extraction → premium fallback palette).

**2. Content Intelligence (The Story Engine)**
- **Tone Matching:** LLM classifies site copy (Corporate / Modern / Casual) to mirror the brand's voice.
- **The PSR Framework:** LLM generates a custom Problem-Solution-Result story utilizing the internal "Context and Examples" DB. 
  - *Constraint:* Strict "no fabricated facts" policy. Results must be fictionalized but plausible, avoiding made-up numbers unless supported by the prospect's site or internal DB proof patterns.
- **Content Blocks:** Generates 1-3 Deep Dive insights and 2-3 Take Action items.
- **News Headlines:** Fetched via live News/RSS API and *cached by industry/day* to reduce API costs. If unavailable, falls back to evergreen "Trending Topics".
- **Output:** A strict, versioned JSON artifact containing all copy, colors, and asset URLs.

**3. The Prototype Engine & Hosting (The Renderer)**
- **Data Storage:** JSON artifacts stored durably in Cloudflare R2 or AWS S3 (with optional KV cache for performance).
- **URL Strategy:** Unguessable public IDs (e.g., `preview.newsdelivered.com/p/{uuid}`) to protect the prospect list from scraping. Token-gated signed URLs can be added if stricter security is needed.
- **Renderer:** A single premium, responsive web app (React/Tailwind or Astro) that fetches the JSON and renders the wireframe dynamically. Supports `template_version` to allow future design upgrades.
- **Wireframe Elements:** Header (Logo), Industry News (3 cards), Feature Story (PSR), Deep Dive, Take Action, Monetization Placeholder ("Sponsored By"), and a CTA button linking to the scheduling calendar.

**4. Quality Control & Write-Back**
- **Automated Scoring:** The pipeline generates a QC score evaluating relevance, tone match, and specificity. High scores are auto-approved.
- **Human-in-the-Loop:** Only the lowest 10-20% of QC scores are routed to a human for review.
- **Write-Back:** The system updates the CRM via API with the `prototype_url`, `status` (Draft/Approved), and `qc_score`.

---

### Outstanding Questions for John & Steve
1. **Context DB:** Where does the "Context and Examples" internal DB currently live, and can you provide a sample of the schema/rows?
2. **System of Record:** Which CRM are we using as the final source of truth for the prospect list?
3. **Approval UI:** Where should the human QC approval step take place (inside the vendor CRM, or a separate Airtable/dashboard)?
4. **Hosting & Domain:** Do you prefer AWS S3 + CloudFront or Vercel/Cloudflare Pages for the rendering app? What is the exact custom domain?
5. **Design Assets:** Can you provide the visual examples/HTML you want us to model the prototype UI after?
6. **Compliance/Restrictions:** Is there any required disclaimer language for the preview page? Are there restricted industries (e.g., health/finance) or prohibited claims?
7. **Calendar CTA:** What exact scheduling system (Calendly/HubSpot) are we linking to, and what UTM fields should be standardized?
8. **Security:** Are unguessable public URLs sufficient, or do you require token-gated/signed URLs for the previews?