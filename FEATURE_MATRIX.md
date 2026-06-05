# FEATURE_MATRIX.md

Legend: ✅ Working · 🟡 Partially Implemented · 🟦 Stubbed · ⬜ Not Started

Status is judged against the **free-stack target**. "Works (paid)" means the
feature functions but on a paid provider that must still be migrated.

| # | Feature | Status | Notes |
|---|---|---|---|
| 1 | Build / lint / typecheck | ✅ | Green; Next 14, strict TS |
| 2 | DB schema (tables, indexes, `match_chunks`) | ✅ | But `vector(1536)` — wrong dim for free embeddings |
| 3 | Company create + list (API) | ✅ | GET/POST, unique-ticker handling |
| 4 | Dashboard company grid | ✅ | Credibility widgets + recent docs |
| 5 | Create-company UI | ✅ | Inline in UploadZone |
| 6 | PDF upload + text extraction | ✅ | pdf-parse v2, local/free |
| 7 | Paste-text upload | ✅ | Toggle in UploadZone |
| 8 | Guidance extraction (LLM) | 🟡 | Works on **Claude**; ⬜ on Ollama (not migrated) |
| 9 | Guidance persistence | ✅ | Statements + pending outcomes inserted |
| 10 | Chunking + embeddings + chunk store | 🟡 | Works on **OpenAI/Voyage**; ⬜ on local embeddings |
| 11 | Vector search (`match_chunks`) | 🟡 | Functional; depends on paid embeddings + dims |
| 12 | Management score computation | 🟡 | Computes, but hit-rate always 0 (no outcomes) |
| 13 | Outcome tracking (met/missed/...) | 🟦 | PATCH API exists; **no UI**, no auto-detection |
| 14 | Guidance timeline UI | ✅ | Grouped by period, outcome badges |
| 15 | Credibility score widget | ✅ | Gauge + sub-metrics |
| 16 | ConcallCard (extraction display) | ✅ | Table + summary + themes |
| 17 | Chat intent classification | 🟡 | Works on Claude; ⬜ on Ollama |
| 18 | Chat answer synthesis | 🟡 | Works on Claude; ⬜ on Ollama |
| 19 | Chat streaming | 🟡 | **Simulated** (full answer then chunked) |
| 20 | Chat citations | 🟡 | guidance: period present; RAG: period empty |
| 21 | Peer comparison | 🟦 | Data fetched into context; no dedicated UI |
| 22 | Calculation intent | ⬜ | Routed to general; no arithmetic/tool use |
| 23 | Free-stack migration (Ollama/local embed) | ⬜ | Core cost goal; not started |
| 24 | Authentication / multi-user | ⬜ | None |
| 25 | RLS / authorization | ⬜ | Tables have no policies; service-role everywhere |
| 26 | Original PDF storage | ⬜ | `storage_path` unused |
| 27 | Outcome auto-detection from later docs | ⬜ | `evidence_doc_id` unused |
| 28 | Hosting / deployment config | ⬜ | No Dockerfile / compose / target |
| 29 | Observability + rate limiting + cost caps | ⬜ | None |
| 30 | Automated tests | ⬜ | None |
| 31 | Landing page | 🟦 | Redirect to /dashboard only |

## Roll-up

| Status | Count |
|---|---|
| ✅ Working | 10 |
| 🟡 Partially | 8 |
| 🟦 Stubbed | 4 |
| ⬜ Not Started | 9 |

Most "Working" items are plumbing/UI. Most **differentiating** items
(scoring value, RAG quality, free-stack, security) are Partial/Stubbed/Not
Started.
