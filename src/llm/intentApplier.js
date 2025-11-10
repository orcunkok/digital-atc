function isNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

export function applyIntentToSim(sim, intent, simStateRef) {
  if (!sim || !intent) return;

  if (isNumber(intent.targetHeadingDeg)) {
    sim.setHeading(intent.targetHeadingDeg);
  } else if (intent.specialAction === 'resumeOwnNavigation') {
    sim.clearHeading?.();
  }

  if (isNumber(intent.targetTrackDeg)) {
    sim.setHeading(intent.targetTrackDeg);
  }

  if (isNumber(intent.targetAltitudeFt)) {
    sim.setAltitude(intent.targetAltitudeFt);
  } else if (intent.verticalMode === 'level') {
    // Maintain current altitude; no action needed.
  } else if (sim.clearAltitude) {
    sim.clearAltitude();
  }

  if (isNumber(intent.targetSpeedKt)) {
    sim.setSpeed(intent.targetSpeedKt);
  } else if (sim.clearSpeed) {
    sim.clearSpeed();
  }

  if (simStateRef) {
    simStateRef.value = {
      ...simStateRef.value,
      specialAction: intent.specialAction || null,
    };
  } else if (intent.specialAction) {
    // eslint-disable-next-line no-console
    console.debug('[digital-atc] Special action requested:', intent.specialAction);
  }
}

