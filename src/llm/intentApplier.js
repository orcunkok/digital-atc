function isNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

export function applyIntentToSim(sim, intent, simStateRef) {
  if (!sim || !intent) return;

  console.log('[Intent Applier] Applying intent:', {
    targetAltitudeFt: intent.targetAltitudeFt,
    verticalMode: intent.verticalMode,
    currentAltitudeFt: simStateRef?.value?.altitudeFt,
  });

  if (isNumber(intent.targetHeadingDeg)) {
    console.log('[Intent Applier] Setting heading:', intent.targetHeadingDeg);
    sim.setHeading(intent.targetHeadingDeg);
  } else if (intent.specialAction === 'resumeOwnNavigation') {
    sim.clearHeading?.();
  }

  if (isNumber(intent.targetTrackDeg)) {
    console.log('[Intent Applier] Setting track:', intent.targetTrackDeg);
    sim.setHeading(intent.targetTrackDeg);
  }

  if (isNumber(intent.targetAltitudeFt)) {
    console.log('[Intent Applier] Setting target altitude:', intent.targetAltitudeFt);
    sim.setAltitude(intent.targetAltitudeFt);
  } else if (intent.verticalMode === 'level') {
    // Maintain current altitude by setting it as target
    if (simStateRef?.value?.altitudeFt != null) {
      const currentAlt = simStateRef.value.altitudeFt;
      console.log('[Intent Applier] verticalMode=level, maintaining current altitude:', currentAlt);
      sim.setAltitude(currentAlt);
    } else {
      console.warn('[Intent Applier] verticalMode=level but current altitude is null');
    }
  } else if (intent.specialAction === 'resumeOwnNavigation') {
    // Only clear altitude when explicitly resuming own navigation
    console.log('[Intent Applier] resumeOwnNavigation: clearing altitude target');
    sim.clearAltitude?.();
  }
  // Note: If altitude is not mentioned in intent, preserve existing target (don't clear it)

  if (isNumber(intent.targetSpeedKt)) {
    console.log('[Intent Applier] Setting target speed:', intent.targetSpeedKt);
    sim.setSpeed(intent.targetSpeedKt);
  } else if (intent.specialAction === 'resumeOwnNavigation') {
    // Only clear speed when explicitly resuming own navigation
    console.log('[Intent Applier] resumeOwnNavigation: clearing speed target');
    sim.clearSpeed?.();
  }
  // Note: If speed is not mentioned in intent, preserve existing target (don't clear it)

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

