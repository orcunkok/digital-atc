# Digital ATC (MVP)

LLM-driven “digital pilot” that parses ATC instructions, reads back with FAA phraseology and ICAO/NATO phonetics, and outputs structured intent to fly a simple point‑mass fixed‑wing sim over SF on Mapbox.

What’s here
- /schemas: JSON Schemas for LLM outputs and inputs
- /prompts: System + developer prompts, and few-shot examples
- /lexicon: ICAO/NATO phonetic alphabet and FAA number words (for readbacks)
- /scenarios: Scripted ATC lines and GeoJSON layers for demo runs
- /docs: FAA/AIM references used to guide phraseology rules (links only)

How it works (high level)
- Frontend (Vite + Vue + Mapbox) runs a simple JS sim (point-mass).
- ATC text is clicked/typed into the console and sent to the LLM.
- LLM returns JSON:
  - readback: brief, standard phraseology with callsign + phonetics
  - intent: heading/altitude/speed/specialAction/navigation
  - safetyFlags: needsClarification/conflictPredicted/etc.
- Resolver applies intent to sim with rate limits; constraints check flags conflicts.

NATO Phonetics and FAA numbers
- Readbacks must:
  - Use ICAO/NATO alphabet for letters (e.g., N123AB -> “November One Two Three Alfa Bravo”)
  - Use FAA/ICAO numbers: 0 Zero, 1 Wun, 2 Too, 3 Tree, 4 Fower, 5 Fife, 6 Six, 7 Seven, 8 Eight, 9 Niner
  - Altitudes spoken in plain words (e.g., 1,500 -> “one thousand five hundred”)
- The LLM prompt enforces this, and a post-return validator checks it.

Quick start
- Put your Mapbox token in your frontend.
- Use /prompts/system_pilot.txt and /prompts/developer_pilot.txt with the /schemas/response.schema.json.
- Run your sim; send {atcText, state, constraints, traffic} to your LLM endpoint; apply returned intent.

References

- FAA AIM Chapter 4-2: Radio Communications Phraseology and Techniques
  https://www.faa.gov/air_traffic/publications/atpubs/aim_html/chap4_section_2.html

- FAA Pilot/Controller Glossary (latest)
  https://www.faa.gov/air_traffic/publications/media/PCG_Chg_2_dtd_3-21-24.pdf

- FAA Order JO 7110.65 (controller phraseology and procedures)
  Latest consolidated version:
  https://www.faa.gov/documentLibrary/media/Order/7110.65BB_Basic_dtd_2-20-25.pdf

- ICAO Radiotelephony Alphabet
  https://www.icao.int/pages/alphabetradiotelephony.aspx

License
- MIT 