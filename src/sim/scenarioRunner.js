import { ref } from 'vue';

function computeDurationSeconds(scenario) {
  if (!scenario) return 180;
  if (typeof scenario.durationSec === 'number') {
    return scenario.durationSec;
  }
  const maxEventTime =
    scenario.events?.reduce((acc, evt) => Math.max(acc, evt.t || 0), 0) ?? 0;
  return Math.max(90, maxEventTime + 30);
}

export function createScenarioRunner(callbacks = {}) {
  const activeScenario = ref(null);
  const events = ref([]);
  const elapsed = ref(0);
  const duration = ref(180);
  const currentEventIndex = ref(0);
  const isRunning = ref(false);

  let startTimestamp = 0;
  let pauseOffsetMs = 0;
  let rafId = null;
  let nextEventPointer = 0;

  function resetEventStatuses() {
    // Sort events by time to ensure they're processed in chronological order
    const sortedEvents = [...(activeScenario.value?.events || [])].sort((a, b) => (a.t || 0) - (b.t || 0));
    events.value = sortedEvents.map((evt, index) => ({
      ...evt,
      index,
      status: 'pending',
    }));
    currentEventIndex.value = events.value.length ? 0 : -1;
    nextEventPointer = 0;
  }

  function loadScenario(scenario) {
    activeScenario.value = scenario;
    duration.value = computeDurationSeconds(scenario);
    resetEventStatuses();
    elapsed.value = 0;
    pauseOffsetMs = 0;
    startTimestamp = 0;
    isRunning.value = false;
    if (callbacks.onLoad) {
      callbacks.onLoad({ scenario, duration: duration.value });
    }
  }

  function updateCurrentEventIndex() {
    const idx = events.value.findIndex((evt) => evt.status === 'pending');
    currentEventIndex.value = idx === -1 ? events.value.length : idx;
  }

  function triggerEvent(event) {
    switch (event.type) {
      case 'ATC':
        callbacks.onAtc?.(event.text, event);
        break;
      case 'ADD_TFR':
        callbacks.onAddTfr?.(event);
        break;
      case 'REMOVE_TFR':
        callbacks.onRemoveTfr?.(event);
        break;
      case 'ADD_TRAFFIC':
        callbacks.onAddTraffic?.(event.traffic);
        break;
      case 'REMOVE_TRAFFIC':
        callbacks.onRemoveTraffic?.(event.trafficId ?? event.id);
        break;
      case 'NOTE':
        callbacks.onNote?.(event);
        break;
      default:
        // eslint-disable-next-line no-console
        console.debug('[scenarioRunner] Unhandled event type', event.type, event);
    }
  }

  function processEvents(elapsedSeconds) {
    if (!events.value.length) return;
    while (nextEventPointer < events.value.length) {
      const event = events.value[nextEventPointer];
      if ((event.t || 0) > elapsedSeconds) break;

      triggerEvent(event);
      events.value[nextEventPointer] = { ...event, status: 'completed' };
      nextEventPointer += 1;
    }
    updateCurrentEventIndex();
  }

  function tick(now) {
    if (!isRunning.value) return;
    const nowMs = typeof now === 'number' ? now : performance.now();
    const elapsedSeconds = (nowMs - startTimestamp) / 1000;
    elapsed.value = elapsedSeconds;

    callbacks.onTick?.(elapsedSeconds, duration.value);
    processEvents(elapsedSeconds);

    if (elapsedSeconds >= duration.value) {
      pause();
      callbacks.onComplete?.();
      return;
    }

    rafId = requestAnimationFrame(tick);
  }

  function start() {
    if (!activeScenario.value) return;
    if (isRunning.value) return;

    startTimestamp = performance.now() - pauseOffsetMs;
    isRunning.value = true;
    rafId = requestAnimationFrame(tick);
    callbacks.onStart?.();
  }

  function pause() {
    if (!isRunning.value) return;
    isRunning.value = false;
    pauseOffsetMs = performance.now() - startTimestamp;
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    callbacks.onPause?.();
  }

  function reset() {
    pause();
    pauseOffsetMs = 0;
    elapsed.value = 0;
    startTimestamp = 0;
    resetEventStatuses();
    callbacks.onReset?.();
  }

  function getState() {
    return {
      scenario: activeScenario.value,
      events: events.value,
      elapsed: elapsed.value,
      duration: duration.value,
      currentEventIndex: currentEventIndex.value,
      isRunning: isRunning.value,
    };
  }

  return {
    loadScenario,
    start,
    pause,
    reset,
    getState,
    state: {
      activeScenario,
      events,
      elapsed,
      duration,
      currentEventIndex,
      isRunning,
    },
  };
}

