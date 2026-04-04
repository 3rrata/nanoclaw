---
name: lead-finder
description: Find potential customers in Greece for IT solutions, tech support, device maintenance, and web design services. Uses Tavily API to search for businesses, then agent-browser to evaluate their websites.
allowed-tools: Bash(agent-browser:*), Bash(curl:*)
---

# Lead Finder — Greek Business Prospecting

Find businesses in Greece that are likely prospects for IT solutions: tech support, device maintenance, and fully managed web projects (web design focus).

**When to use:** The user asks to find leads, prospects, or potential customers. Also triggered by keywords like "prospecting", "find clients", "search businesses", "who needs web design", "leads in Greece".

**Tools:**
- **Tavily API** (via `curl`) — search for businesses, discover leads
- **agent-browser** — visit business websites to evaluate quality

## Prerequisites

Requires `TAVILY_API_KEY` environment variable. If missing, tell the user to add it to `.env`:
```
TAVILY_API_KEY=tvly-xxxxxxxxxxxxx
```
Get a free key at https://tavily.com (1000 searches/month on free tier).

## Service Offering Context

You are searching for businesses that would benefit from:
- **Tech support** — ongoing IT support contracts
- **Device maintenance** — hardware upkeep, network maintenance
- **Managed web projects** — web design, hosting, maintenance, modernization

The ideal customer is a small-to-medium Greek business with an outdated or missing web presence.

## Search Strategy

### Step 1 — Define search parameters

Ask the user (if not specified):
- **Sector** (default: all sectors below)
- **Region/city** (default: all major regions)
- **How many leads** (default: 10)

### Step 2 — Search with Tavily

Use the Tavily search API via curl to find businesses. The API key is in `$TAVILY_API_KEY`.

#### Search command template

```bash
curl -s -X POST "https://api.tavily.com/search" \
  -H "Content-Type: application/json" \
  -d '{
    "api_key": "'"$TAVILY_API_KEY"'",
    "query": "SEARCH_QUERY_HERE",
    "search_depth": "advanced",
    "max_results": 10,
    "include_answer": false,
    "include_raw_content": false
  }'
```

#### Search queries — run multiple in parallel

Build queries combining sectors, cities, and intent signals. Examples:

```
# Greek directory listings
"εστιατόρια Αθήνα επικοινωνία site:vrisko.gr OR site:xo.gr"
"ξενοδοχεία Θεσσαλονίκη website site:.gr"

# Businesses likely needing web help
"εστιατόρια Αθήνα facebook page only no website"
"καταστήματα Πάτρα ιστοσελίδα"

# English queries for tourist-facing businesses
"restaurants Athens Greece small business website"
"hotels Rhodes Greece contact website"

# Sector-specific
"δικηγόροι Αθήνα δικηγορικό γραφείο website"
"κατασκευές οικοδομικές Θεσσαλονίκη επικοινωνία"
```

#### Sectors and search terms

| Sector | Greek terms | Priority cities |
|--------|-------------|-----------------|
| Hospitality | ξενοδοχεία, εστιατόρια, καφέ, ταβέρνες, Rooms to Let | Athens, Thessaloniki, Rhodes, Corfu, Crete, Santorini, Mykonos |
| Retail & e-commerce | καταστήματα, βιβλιοπωλεία, ρούχα, ηλεκτρονικά | Athens, Thessaloniki, Patras, Larissa |
| Professional services | δικηγόροι, λογιστές, γιατροί, οδοντίατροι, συμβουλευτικές | Athens, Thessaloniki, Patras, Heraklion |
| Construction & trades | κατασκευές, οικοδομικές, ηλεκτρολόγοι, κηπουρική | Athens, Thessaloniki, Patras, Volos |

#### Tavily also supports domain filtering

```bash
# Search only specific Greek directories
curl -s -X POST "https://api.tavily.com/search" \
  -H "Content-Type: application/json" \
  -d '{
    "api_key": "'"$TAVILY_API_KEY"'",
    "query": "εστιατόρια Αθήνα",
    "search_depth": "advanced",
    "max_results": 10,
    "include_domains": ["vrisko.gr", "xo.gr", "findabc.gr"]
  }'
```

#### Extracting business data from Tavily results

Tavily returns JSON with `results` array. Each result has:
- `title` — business name or listing title
- `url` — link to the business or directory page
- `content` — extracted text from the page

Parse the JSON response to extract business names, URLs, phone numbers, and addresses from the content.

### Step 3 — Evaluate each business website with agent-browser

For each business that has a website URL, visit it with agent-browser to assess quality.

```bash
agent-browser open "https://www.example-business.gr"
agent-browser snapshot -c
```

Run quick JavaScript evaluations:

```bash
# Check if responsive
agent-browser eval "!!document.querySelector('meta[name=viewport]')"

# Get copyright/year hint
agent-browser eval "(document.body.innerText.match(/20[12]\\d/) || ['unknown'])[0]"

# Check for broken images
agent-browser eval "Array.from(document.querySelectorAll('img')).filter(i=>!i.complete||i.naturalWidth===0).length"

# Get page title
agent-browser eval "document.title"

# Check SSL
agent-browser eval "location.protocol"

# Detect CMS/framework
agent-browser eval "document.querySelector('meta[name=generator]')?.content || 'unknown'"

# Close browser between sites to avoid state buildup
agent-browser close
```

#### Website quality checklist

- **Responsive design** — viewport meta tag present?
- **Modern tech** — Static HTML? WordPress with old theme? Modern framework?
- **SSL certificate** — HTTPS?
- **Last updated** — Copyright year or visible dates?
- **Contact info** — Contact page, phone, email?
- **Functionality** — Broken images, missing content?

#### Scoring rubric

| Signal | Points | Meaning |
|--------|--------|---------|
| No website found | 10 | High priority — needs everything |
| Website is just a Facebook page | 9 | High — needs a real site |
| Static HTML, looks dated (pre-2015) | 8 | High — full redesign candidate |
| Non-responsive (no mobile support) | 7 | High — redesign needed |
| WordPress with generic/old theme | 6 | Medium — refresh or rebuild |
| Broken links or missing images | 5 | Medium — maintenance needed |
| No contact form, just phone | 4 | Medium — opportunity for improvement |
| Outdated SSL or mixed content | 3 | Low-medium — tech support lead |
| Decent site but no blog/content | 2 | Low — content strategy opportunity |
| Modern, well-maintained site | 0 | Skip — not a lead |

**Lead tier:**
- **Hot (8-10):** No site, Facebook-only, or badly outdated — pitch full web project
- **Warm (4-7):** Has a site but needs work — pitch redesign or maintenance contract
- **Cool (1-3):** Minor improvements possible — pitch tech support or content services

### Step 4 — Format and deliver results

Present leads as structured cards, grouped by tier:

```
HOT LEADS (Full web project candidates)

1. [Business Name]
   Location: Athens, Greece
   Sector: Restaurant / Hospitality
   Website: example.gr (or "No website — Facebook only")
   Score: 9/10
   Issues: Static HTML site from ~2010, no mobile support, no SSL, broken images on menu page
   Suggested pitch: "Complete website redesign with responsive menu, online reservation system, and SEO optimization"
   Contact: phone, email if found

---

WARM LEADS (Redesign / maintenance candidates)

...

---

COOL LEADS (Tech support / minor improvements)

...
```

### Step 5 — Save results

Write the full lead report to `/workspace/group/leads-[date].md` for future reference. Include:
- Search date and parameters used
- All leads found with full details
- Summary statistics (X hot, Y warm, Z cool)
- Recommended next steps

## Efficiency tips

- **Batch Tavily searches** — run 3-4 curl commands in parallel for different sectors/cities
- **Limit website evaluations** — the 5-6 JavaScript checks are enough to score; don't over-analyze
- **Skip modern sites quickly** — if a site looks great, close browser and move on
- **Max 20 leads per search** — quality over quantity
- **Close browser between sites** — `agent-browser close` prevents state buildup

## Important guidelines

- **Search in Greek** — most Greek businesses are listed under Greek terms
- **Skip franchises and chains** — focus on independent SMBs
- **Skip businesses with excellent modern websites** — they already have IT support
- **Always verify the website** before scoring — don't score based on search snippet alone
- **Note if a business appears to be closed** — outdated content, old dates, no recent activity
