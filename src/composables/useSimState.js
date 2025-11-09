import { ref } from 'vue';

// Shared sim state for the entire app
export const simState = ref({
  altitudeFt: 1500,
  headingDeg: 330,
  speedKt: 110,
  vsFpm: 0,
  callsign: 'N123AB',
  phase: 'enroute',
  targetHeadingDeg: null,
  targetAltitudeFt: null,
  targetSpeedKt: null,
  specialAction: null,
});

export function useSimState() {
  return {
    simState,
  };
}

