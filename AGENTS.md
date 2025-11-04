# AGENTS

This repo uses a single “Digital Pilot” agent pattern to parse ATC instructions,
speak back with correct phraseology (ICAO/NATO phonetics + FAA number words),
and output structured intent for the point‑mass sim.

Agent responsibilities
- Parse ATC text into:
  - readback (concise, standard phraseology with callsign and phonetics)
  - intent (heading/altitude/speed/specialAction/navigation) per schemas/response.schema.json
  - safetyFlags (needsClarification/conflictPredicted/lostComms)
- Never invent clearances; only act on ATC input + provided state/constraints/traffic
- Use ICAO/NATO phonetics for letters and FAA/ICAO number words for digits in readbacks
- Use altitude words (e.g., “one thousand five hundred”)
- For go-around: set specialAction=goAround, verticalMode=climb, and follow runway heading

Data contracts (must not drift)
- Input to agent: schemas/request.schema.json
- Output from agent: schemas/response.schema.json
- Lexicon helpers: lexicon/phonetics.json, lexicon/altitude_words.md

Run loop (MVP)
1) ATC event picked or typed in UI
2) Build request payload from live sim state + constraints + traffic
3) Call LLM with prompts/system_pilot.txt and prompts/developer_pilot.txt
4) Validate JSON against schemas/response.schema.json
5) If validation fails, re-prompt with correction hint
6) Apply intent to sim (rate-limited heading/alt/speed) and update UI
7) Log transcript with timestamps

Stack constraints (enforced by Cursor rules)
- Frontend: Vite + Vue (JavaScript only), raw CSS, Mapbox GL JS
- No TypeScript, no CSS frameworks
- Code style: Prettier 80 char print width; copy-pasteable bash snippets
- Units: speed kt, VS fpm, altitude ft, distances NM, angles deg
- Physics: point‑mass, limited turn rate from bank, capped VS/accel

Scenarios included
- scenarios/KOAK_SF_VFR_TFR_traffic.json
- scenarios/KOAK_IFR_vectors_goaround.json

Safety/validation guards
- Readback must contain callsign (phonetics for letters + number words for digits)
- Altitudes in words (no bare digits in readback)
- Intent must set fields for any explicit ATC assignment (e.g., heading/altitude)
- Conflict flags set when projected path intersects no-go polygons or traffic CPA is unsafe

Secrets
- Do not commit keys. Use .env (frontend) and local env (backend if added).

Recording demo
- Use scenario timeline, log panel, compliance score overlay
- Keep one clean take per scenario