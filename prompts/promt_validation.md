Validator checks (suggested):

- Callsign present (exact string, e.g., "N123AB") in readback.
- If ATC includes a heading/altitude/speed, intent fields are non-null accordingly.
- Readback phonetics:
  - Callsign letters replaced by ICAO/NATO words (e.g., N -> November, A -> Alfa).
  - Callsign digits pronounced (e.g., 3 -> Tree, 9 -> Niner).
- Altitudes are written in words when spoken (not digits).
- JSON matches /schemas/response.schema.json; clamp numeric ranges if needed.
- If safetyFlags.needsClarification = true, readback includes a brief clarification request.

If failed:
- Re-prompt with a short correction note: e.g., “Your readback omitted phonetics for the callsign. Include ICAO/NATO phonetics for letters and number words for digits. Output JSON only.”