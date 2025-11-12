<template>
  <div class="container">
    <!-- Header -->
    <header class="header">
      <div class="header-left">
        <div class="logo-container">
          <div class="logo logo-main">Digital ATC</div>
          <div class="logo logo-subtitle">dsb robotics</div>
        </div>
        <div class="status-indicator-wrapper">
          <div
            class="status-indicator"
            :class="{ 
              'is-offline': !llmReady && !openAiRequestFailed,
              'is-error': openAiRequestFailed
            }"
            :title="openAiRequestFailed ? (openAiKeyFailed ? 'OpenAI API Key failed' : 'OpenAI request failed') : (llmReady ? 'LLM ready' : 'LLM key missing')"
          ></div>
          <span v-if="openAiRequestFailed" class="status-error-text">
            {{ openAiKeyFailed ? 'OpenAI API Key failed' : 'OpenAI request failed' }}
          </span>
          <span v-else-if="!llmReady" class="status-error-text status-warning-text">LLM key missing</span>
        </div>
      </div>
      <div class="header-right">
        <span>{{ simState.callsign }}</span>
        <span>·</span>
        <span>KOAK → SF Bay</span>
        <span>·</span>
        <span>Phase: {{ simState.phase }}</span>
      </div>
    </header>

    <!-- Left sidebar -->
    <aside class="sidebar-left">
      <div class="sidebar-section">
        <div class="section-header">Layers</div>
        <div class="section-content">
          <div class="layer-item" @click="toggleLayer('trail')">
            <div class="checkbox" :class="{ checked: layers.trail }"></div>
            <span>Aircraft trail</span>
          </div>
          <div class="layer-item" @click="toggleLayer('flightPlan')">
            <div class="checkbox" :class="{ checked: layers.flightPlan }"></div>
            <span>Flight plan</span>
          </div>
          <div class="layer-item" @click="toggleLayer('tfr')">
            <div class="checkbox" :class="{ checked: layers.tfr }"></div>
            <span>TFR / No-go</span>
          </div>
          <div class="layer-item" @click="toggleLayer('traffic')">
            <div class="checkbox" :class="{ checked: layers.traffic }"></div>
            <span>Traffic</span>
          </div>
          <div class="layer-item" @click="toggleLayer('airspace')">
            <div class="checkbox" :class="{ checked: layers.airspace }"></div>
            <span>Airspace</span>
          </div>
          <div class="layer-item" @click="toggleLayer('navaids')">
            <div class="checkbox" :class="{ checked: layers.navaids }"></div>
            <span>Navaids</span>
          </div>
        </div>
      </div>

      <div class="sidebar-section">
        <div class="section-header">Chart Overlays</div>
        <div class="section-content">
          <button
            class="tool-btn"
            :class="{ active: chartOverlay === 'none' }"
            @click="chartOverlay = 'none'"
          >
            None
          </button>
          <button
            class="tool-btn"
            :class="{ active: chartOverlay === 'sfo' }"
            @click="chartOverlay = 'sfo'"
          >
            SFO TAC
          </button>
          <button
            class="tool-btn"
            :class="{ active: chartOverlay === 'koak-dep' }"
            @click="chartOverlay = 'koak-dep'"
          >
            KOAK Departure
          </button>
          <button
            class="tool-btn"
            :class="{ active: chartOverlay === 'koak-arr' }"
            @click="chartOverlay = 'koak-arr'"
          >
            KOAK Arrival
          </button>
        </div>
      </div>

      <div class="sidebar-section">
        <div class="section-header">Tools</div>
        <div class="section-content">
          <button class="tool-btn">Add waypoint</button>
          <button class="tool-btn">Draw TFR</button>
          <button class="tool-btn">Measure distance</button>
          <button class="tool-btn">Export transcript</button>
        </div>
      </div>
    </aside>

    <!-- Map -->
    <div class="map">
      <Map ref="mapRef" />
      <div class="map-overlay">
        <button
          class="overlay-btn"
          :class="{ active: !isFollowing }"
          @click="toggleCenter"
        >
          <Unlock :size="14" />
          Center
        </button>
        <button
          class="overlay-btn"
          :class="{ active: isFollowing }"
          @click="toggleFollow"
        >
          <Lock :size="14" />
          Follow
        </button>
        <div class="toggle-switch" :class="{ disabled: isFollowing }">
          <button
            class="toggle-btn"
            :class="{ active: is2D }"
            @click="setViewMode('2D')"
            :disabled="isFollowing"
          >
            2D
          </button>
          <button
            class="toggle-btn"
            :class="{ active: !is2D }"
            @click="setViewMode('3D')"
            :disabled="isFollowing"
          >
            3D
          </button>
        </div>
      </div>
    </div>

    <!-- Right sidebar -->
    <aside class="sidebar-right">
      <div class="tabs">
        <div
          class="tab"
          :class="{ active: activeTab === 'state' }"
          @click="activeTab = 'state'"
        >
          State
        </div>
        <div
          class="tab"
          :class="{ active: activeTab === 'scenario' }"
          @click="activeTab = 'scenario'"
        >
          Scenario
        </div>
        <div
          class="tab"
          :class="{ active: activeTab === 'plan' }"
          @click="activeTab = 'plan'"
        >
          Plan
        </div>
      </div>

      <!-- State tab -->
      <div class="tab-content" :class="{ active: activeTab === 'state' }">
        <div class="state-grid">
          <div class="state-item">
            <div class="state-label">Altitude</div>
            <div class="state-value">{{ formatAltitude(simState.altitudeFt) }}</div>
          </div>
          <div class="state-item">
            <div class="state-label">Heading</div>
            <div class="state-value">{{ Math.round(simState.headingDeg) }}°</div>
          </div>
          <div class="state-item">
            <div class="state-label">Speed</div>
            <div class="state-value">{{ Math.round(simState.speedKt) }}</div>
          </div>
          <div class="state-item">
            <div class="state-label">V/S</div>
            <div class="state-value">{{ formatVS(simState.vsFpm) }}</div>
          </div>
        </div>

        <div class="state-section">
          <div class="subsection-title">Current Intent</div>
          <div class="intent-item">
            <span class="intent-key">Target HDG</span>
            <span>{{ simState.targetHeadingDeg ? Math.round(simState.targetHeadingDeg) + '°' : '—' }}</span>
          </div>
          <div class="intent-item">
            <span class="intent-key">Target ALT</span>
            <span>{{ simState.targetAltitudeFt ? formatAltitude(simState.targetAltitudeFt) + ' ft' : '—' }}</span>
          </div>
          <div class="intent-item">
            <span class="intent-key">Target SPD</span>
            <span>{{ simState.targetSpeedKt ? simState.targetSpeedKt + ' kt' : '—' }}</span>
          </div>
          <div class="intent-item">
            <span class="intent-key">VS Limit</span>
            <span>{{ simState.verticalSpeedLimitFpm ? simState.verticalSpeedLimitFpm + ' fpm' : '—' }}</span>
          </div>
          <div class="intent-item">
            <span class="intent-key">Special Action</span>
            <span>{{ simState.specialAction || '—' }}</span>
          </div>
        </div>

        <div class="state-section">
          <div class="subsection-title">Clearance</div>
          <div class="state-note">
            {{ lastClearance || 'Awaiting first ATC clearance.' }}
          </div>
        </div>

        <div class="state-section">
          <div class="subsection-title">Safety</div>
          <div
            v-if="safetyFlags.conflictPredicted"
            class="state-alert"
          >
            {{ safetyFlags.reason || 'Potential conflict predicted. Monitor trajectory.' }}
          </div>
          <div
            v-else-if="safetyFlags.needsClarification"
            class="state-warning"
          >
            {{ safetyFlags.reason || 'Clarification requested by pilot.' }}
          </div>
          <div v-else class="state-note">No active alerts.</div>
        </div>

        <div class="timeline-container">
          <div class="subsection-title">Timeline</div>
          <div class="timeline-bar">
            <div class="timeline-progress" :style="{ width: timelineProgress + '%' }"></div>
          </div>
          <div class="timeline-labels">
            <span>{{ elapsedLabel }}</span>
            <span>{{ totalTimelineLabel }}</span>
          </div>
        </div>
      </div>

      <!-- Scenario tab -->
      <div class="tab-content" :class="{ active: activeTab === 'scenario' }">
        <div class="event-queue-content">
          <div class="event-queue-label">{{ currentScenarioTitle }}</div>
          <div class="event-list">
            <div
              v-for="event in scenarioEvents"
              :key="event.index"
              class="event-item"
              :class="{
                active: currentEventIndex === event.index,
                done: event.status === 'completed'
              }"
            >
              <span class="event-time">{{ formatTimestamp(event.t || 0) }}</span>
              <span class="event-desc">{{ describeEvent(event) }}</span>
            </div>
            <div v-if="!scenarioEvents.length" class="event-empty">No scripted events.</div>
          </div>
        </div>
      </div>

      <!-- Flight Plan tab -->
      <div class="tab-content" :class="{ active: activeTab === 'plan' }">
        <div v-if="flightPlan.length" class="flight-plan-list">
          <div
            v-for="(waypoint, index) in flightPlan"
            :key="index"
            class="flight-plan-item"
          >
            <div>
              <div class="waypoint-name">{{ waypoint.name }}</div>
              <div class="waypoint-alt">{{ waypoint.altitude }}</div>
            </div>
            <div style="font-size: 10px; color: var(--color-text-tertiary)">
              {{ formatTimestamp(waypoint.timeSeconds) }}
            </div>
          </div>
        </div>
        <div v-else class="event-empty">No flight plan available for this scenario.</div>
      </div>
    </aside>

    <!-- Bottom control panel -->
    <div class="control-strip">
      <div class="scenario-panel">
        <div class="scenario-selector">
          <div class="scenario-header">
            <span class="scenario-label">Scenario</span>
            <select class="scenario-select" v-model="selectedScenarioId">
              <option
                v-for="scenario in scenarios"
                :key="scenario.id"
                :value="scenario.id"
              >
                {{ scenario.label }}
              </option>
            </select>
          </div>
          <div class="playback-controls">
            <button class="btn" :class="{ 'is-active': !isPaused }" @click="startSimulation">Start</button>
            <button class="btn" :class="{ 'is-active': isPaused }" @click="pauseSimulation">Pause</button>
            <button class="btn" @click="resetScenario">Reset</button>
          </div>
        </div>

        <div class="quick-commands-panel">
          <div class="quick-actions-label">Quick Commands</div>
          <div class="quick-actions-grid">
            <button class="quick-btn" @click="quickCommand('Climb 2000')">
              Climb 2000
            </button>
            <button class="quick-btn" @click="quickCommand('Turn L 270')">
              Turn L 270
            </button>
            <button class="quick-btn" @click="quickCommand('Direct ALCTZ')">
              Direct ALCTZ
            </button>
            <button class="quick-btn" @click="quickCommand('Go Around')">
              Go Around
            </button>
          </div>
        </div>
      </div>

      <div class="flight-data-panel">
        <!-- Top row: Flight Strip -->
        <div class="flight-strip-container">
          <div class="flight-strip">
            <div class="strip-field">
              <div class="strip-label">HDG</div>
              <input
                type="number"
                v-model.number="headingInput"
                min="0"
                max="360"
                placeholder="000"
                @keyup.enter="setAll"
                class="strip-input"
              />
            </div>
            <div class="strip-field">
              <div class="strip-label">ALT</div>
              <input
                type="number"
                v-model.number="altitudeInput"
                min="-1000"
                max="60000"
                placeholder="10000"
                @keyup.enter="setAll"
                class="strip-input"
              />
            </div>
            <div class="strip-field">
              <div class="strip-label">SPD</div>
              <input
                type="number"
                v-model.number="speedInput"
                min="40"
                max="400"
                placeholder="120"
                @keyup.enter="setAll"
                class="strip-input"
              />
            </div>
            <div class="strip-field">
              <div class="strip-label">V/S Limit</div>
              <input
                type="number"
                v-model.number="verticalSpeedInput"
                min="0"
                max="4000"
                placeholder="0"
                @keyup.enter="setAll"
                class="strip-input"
              />
            </div>
            <button class="btn strip-set-btn" @click="setAll">Set</button>
          </div>
        </div>

        <!-- Bottom row: ATC Console -->
        <div class="atc-input-container">
          <div class="atc-console">
            <div class="atc-console-label">
              ATC Input
              <span v-if="isProcessingAtc" class="atc-status">Processing…</span>
            </div>
            <div class="atc-input-row">
              <input
                type="text"
                class="atc-input"
                placeholder="Type ATC instruction or use quick commands..."
                v-model="atcInput"
                @keyup.enter="sendATC"
              />
              <button
                class="btn"
                @click="sendATC"
                :disabled="isProcessingAtc || !atcInput.trim()"
              >
                Send
              </button>
            </div>
            <div v-if="!llmReady" class="atc-hint">
              Add <code>VITE_OPENAI_API_KEY</code> to enable the digital pilot.
            </div>
            <div v-if="errorMessage" class="atc-error">{{ errorMessage }}</div>
          </div>
        </div>
      </div>

      <div class="transcript-panel">
        <div class="transcript-panel-label">Transcript</div>
        <div class="transcript-content">
          <div v-if="!transcript.length" class="log-empty">No transmissions yet.</div>
          <div v-else>
            <div class="log-entry" v-for="entry in transcript" :key="entry.id">
              <div class="log-time">{{ formatTimestamp(entry.elapsedSeconds) }}</div>
              <div
                class="log-speaker"
                :class="{
                  atc: entry.speaker === 'ATC',
                  pilot: entry.speaker === 'PILOT',
                  system: entry.speaker !== 'ATC' && entry.speaker !== 'PILOT'
                }"
              >
                {{ entry.speaker }}
              </div>
              <div class="log-text">{{ entry.text }}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { Unlock, Lock } from 'lucide-vue-next';
import Map from './components/Map.vue';
import { useSimState } from './composables/useSimState';
import { runPilotAgent, PilotAgentError } from './llm/pilotAgent';
import { OpenAiClientError } from './llm/openaiClient';
import { applyIntentToSim } from './llm/intentApplier';
import { appConfig } from './utils/config';
import { defaultStartState } from './sim/defaultStartState';
import { createScenarioRunner } from './sim/scenarioRunner';
import scenarioDefaultDemo from '../scenarios/Default_KOAK_demo.json';
import scenarioLegacy from '../scenarios/KOAK_SF_VFR_TFR_traffic.json';
import scenarioIFRGoaround from '../scenarios/KOAK_IFR_vectors_goaround.json';

const { simState } = useSimState();
const mapRef = ref(null);
const isFollowing = ref(true);
const is2D = ref(false);
const isPaused = ref(false); // Will sync with actual sim state on mount

// UI state
const activeTab = ref('state'); // 'state', 'scenario', or 'plan'
const layers = ref({
  trail: true,
  flightPlan: true,
  tfr: true,
  traffic: true,
  airspace: false,
  navaids: false,
});
const chartOverlay = ref('none');
const scenarios = [
  { id: scenarioDefaultDemo.id, label: '1 » Default Demo', data: scenarioDefaultDemo },
  { id: scenarioLegacy.id, label: '2 » SF VFR + TFR', data: scenarioLegacy },
  { id: scenarioIFRGoaround.id, label: '3 » IFR Vectors Go-Around', data: scenarioIFRGoaround },
];
const selectedScenarioId = ref(scenarios[0].id);
const atcInput = ref('');
const timelineProgress = ref(0);

// Flight strip control inputs
const headingInput = ref(null);
const altitudeInput = ref(null);
const speedInput = ref(null);
const verticalSpeedInput = ref(null);

// LLM + transcript state
const transcript = ref([]);
const safetyFlags = ref({
  needsClarification: false,
  conflictPredicted: false,
  lostComms: false,
  reason: null,
});
const lastClearance = ref('');
const llmUsage = ref(null);
const errorMessage = ref('');
const openAiRequestFailed = ref(false);
const openAiKeyFailed = ref(false);
const isProcessingAtc = ref(false);
const constraints = ref({ noGoAreas: [] });
const traffic = ref([]);
const sessionStart = ref(performance.now());

const llmReady = computed(() => appConfig.openAi.hasApiKey);
const mapReady = computed(() => Boolean(mapRef.value?.sim));
const currentScenario = computed(
  () => scenarios.find((item) => item.id === selectedScenarioId.value) || null
);
const currentScenarioTitle = computed(
  () => currentScenario.value?.data?.title || 'Scenario Timeline'
);
const flightPlan = computed(() => {
  return currentScenario.value?.data?.flightPlan || [];
});

let messageCounter = 0;
const timelineDurationSeconds = ref(180);
const timelineElapsed = ref(0);
const elapsedLabel = ref('00:00');
const totalTimelineLabel = computed(() => formatTimestamp(timelineDurationSeconds.value));
const pendingStartState = ref(null);

// Helper functions
function formatAltitude(ft) {
  if (ft === null || ft === undefined) return '—';
  return Math.round(ft).toLocaleString();
}

function formatVS(fpm) {
  if (fpm === null || fpm === undefined) return '—';
  if (fpm === 0) return '0';
  const sign = fpm > 0 ? '+' : '';
  return sign + fpm;
}

function getElapsedSeconds() {
  return (performance.now() - sessionStart.value) / 1000;
}

function formatTimestamp(seconds) {
  if (typeof seconds !== 'number' || Number.isNaN(seconds)) return '--:--';
  const total = Math.max(0, seconds);
  const minutes = Math.floor(total / 60)
    .toString()
    .padStart(2, '0');
  const secs = Math.floor(total % 60)
    .toString()
    .padStart(2, '0');
  return `${minutes}:${secs}`;
}

function updateTimelineProgress(elapsedSeconds = getElapsedSeconds()) {
  timelineElapsed.value = elapsedSeconds;
  const duration = Math.max(timelineDurationSeconds.value, 1);
  const progress = Math.min(100, Math.round((elapsedSeconds / duration) * 100));
  timelineProgress.value = progress;
  elapsedLabel.value = formatTimestamp(elapsedSeconds);
}

function addTranscriptEntry(speaker, text, elapsedSeconds = getElapsedSeconds()) {
  if (!text) return;
  messageCounter += 1;
  transcript.value.push({
    id: `${messageCounter}`,
    speaker,
    text,
    elapsedSeconds,
  });
  updateTimelineProgress();
}

function describeEvent(event) {
  if (!event) return '';
  switch (event.type) {
    case 'ATC': {
      const text = event.text || '';
      const trimmed = text.replace(/^\s*([A-Za-z0-9]+\s*,\s*)?/, '');
      const short = trimmed.length > 60 ? `${trimmed.slice(0, 57)}…` : trimmed;
      return `ATC · ${short}`;
    }
    case 'ADD_TFR':
      return `Add TFR · ${event.name || event.id}`;
    case 'REMOVE_TFR':
      return `Remove TFR · ${event.name || event.id || event.tfrId}`;
    case 'ADD_TRAFFIC':
      return `Add traffic · ${(event.traffic && event.traffic.id) || 'unknown'}`;
    case 'REMOVE_TRAFFIC':
      return `Remove traffic · ${event.trafficId || event.id}`;
    case 'NOTE':
      return `Note · ${event.note || ''}`;
    default:
      return event.type || 'Event';
  }
}

function clearRuntimeState({ resetMap = true } = {}) {
  if (resetMap && mapRef.value?.reset) {
    mapRef.value.reset();
  }
  isPaused.value = false;
  sessionStart.value = performance.now();
  timelineProgress.value = 0;
  timelineElapsed.value = 0;
  elapsedLabel.value = '00:00';
  transcript.value = [];
  safetyFlags.value = {
    needsClarification: false,
    conflictPredicted: false,
    lostComms: false,
    reason: null,
  };
  llmUsage.value = null;
  lastClearance.value = '';
  errorMessage.value = '';
  openAiRequestFailed.value = false;
  openAiKeyFailed.value = false;
  atcInput.value = '';
  messageCounter = 0;
  constraints.value = { noGoAreas: [] };
  traffic.value = [];
}

function applyScenarioStartState(scenario) {
  if (!scenario) return;
  const start = { ...defaultStartState, ...(scenario.startState || {}) };
  pendingStartState.value = start;
  simState.value = {
    ...simState.value,
    callsign: scenario.callsign || simState.value.callsign,
    phase: start.phase || simState.value.phase,
    specialAction: null,
    targetHeadingDeg: null,
    targetAltitudeFt: null,
    targetSpeedKt: null,
    altitudeFt: start.altitudeFt,
    headingDeg: start.headingDeg,
    speedKt: start.groundspeedKt,
    vsFpm: start.vsFpm,
    lat: start.lat,
    lon: start.lon,
  };

  if (mapRef.value?.initializeFromScenario) {
    mapRef.value.initializeFromScenario(start);
  }
}

function toggleLayer(layer) {
  layers.value[layer] = !layers.value[layer];
}

function quickCommand(cmd) {
  const callsign = simState.value.callsign;
  let instruction = '';

  if (cmd.includes('Climb')) instruction = `${callsign}, climb and maintain 2,000.`;
  else if (cmd.includes('Descend'))
    instruction = `${callsign}, descend and maintain 1,000.`;
  else if (cmd.includes('Turn L'))
    instruction = `${callsign}, turn left heading 270.`;
  else if (cmd.includes('Turn R'))
    instruction = `${callsign}, turn right heading 360.`;
  else if (cmd.includes('Direct'))
    instruction = `${callsign}, proceed direct ALCTZ.`;
  else if (cmd.includes('Go Around'))
    instruction = `${callsign}, go around, runway heading, climb to 2,000.`;

  atcInput.value = instruction;
}

async function sendATC() {
  if (isProcessingAtc.value) return;
  await processAtcInstruction(atcInput.value);
}

async function processAtcInstruction(rawText) {
  const normalized = typeof rawText === 'string' ? rawText.trim() : '';
  if (!normalized) return;

  if (!mapReady.value) {
    errorMessage.value = 'Simulator not ready yet. Please wait for the map to finish loading.';
    return;
  }

  if (!llmReady.value) {
    errorMessage.value = 'Set VITE_OPENAI_API_KEY to enable the digital pilot.';
    return;
  }

  atcInput.value = '';
  errorMessage.value = '';
  openAiRequestFailed.value = false;
  openAiKeyFailed.value = false;
  lastClearance.value = normalized;
  addTranscriptEntry('ATC', normalized);

  const payload = {
    atcText: normalized,
    callsign: simState.value.callsign,
    phase: simState.value.phase,
    state: {
      lat: simState.value.lat,
      lon: simState.value.lon,
      altitudeFt: simState.value.altitudeFt,
      headingDeg: simState.value.headingDeg,
      groundspeedKt: simState.value.speedKt,
      vsFpm: simState.value.vsFpm,
    },
    constraints: {
      noGoAreas: constraints.value.noGoAreas || [],
    },
    traffic: traffic.value,
  };

  try {
    isProcessingAtc.value = true;
    const agentResponse = await runPilotAgent(payload);
    const { result, usage } = agentResponse;

    addTranscriptEntry('PILOT', result.readback);

    safetyFlags.value = {
      needsClarification: Boolean(result.safetyFlags?.needsClarification),
      conflictPredicted: Boolean(result.safetyFlags?.conflictPredicted),
      lostComms: Boolean(result.safetyFlags?.lostComms),
      reason: result.safetyFlags?.reason || null,
    };

    llmUsage.value = usage || null;

    applyIntentToSim(mapRef.value?.sim, result.intent, simState);
  } catch (error) {
    // Check if this is an OpenAI request failure
    const openAiError =
      error instanceof OpenAiClientError
        ? error
        : error instanceof PilotAgentError && error.cause instanceof OpenAiClientError
        ? error.cause
        : error?.cause instanceof OpenAiClientError
        ? error.cause
        : null;

    const isOpenAiError =
      openAiError !== null ||
      error instanceof OpenAiClientError ||
      (error instanceof PilotAgentError && error.cause instanceof OpenAiClientError) ||
      (error?.cause instanceof OpenAiClientError) ||
      (error?.message === 'OpenAI request failed.');

    if (isOpenAiError) {
      // Check if it's specifically a key-related error
      const errorToCheck = openAiError || error;
      const isKeyError =
        errorToCheck &&
        (errorToCheck.status === 401 || // Unauthorized
          errorToCheck.status === 403 || // Forbidden (could be key-related)
          errorToCheck.code === 'missing_api_key' ||
          errorToCheck.code === 'api_key_not_loaded' ||
          (errorToCheck.details?.error?.code === 'invalid_api_key') ||
          (errorToCheck.details?.error?.message?.toLowerCase().includes('api key')) ||
          (errorToCheck.details?.error?.message?.toLowerCase().includes('authentication')) ||
          (errorToCheck.message?.toLowerCase().includes('api key')) ||
          (errorToCheck.message?.toLowerCase().includes('authentication')));

      openAiRequestFailed.value = true;
      openAiKeyFailed.value = Boolean(isKeyError);
      errorMessage.value = ''; // Don't show error under ATC input for OpenAI errors
    } else {
      const message =
        error instanceof PilotAgentError || error?.name === 'PilotAgentError'
          ? error.message
          : error instanceof Error
          ? error.message
          : 'Pilot agent failed.';

      errorMessage.value = message;
      openAiRequestFailed.value = false;
      openAiKeyFailed.value = false;
    }
  } finally {
    isProcessingAtc.value = false;
    updateTimelineProgress();
  }
}

const scenarioRunner = createScenarioRunner({
  onLoad: ({ scenario, duration }) => {
    timelineDurationSeconds.value = duration;
    timelineElapsed.value = 0;
    elapsedLabel.value = '00:00';
    constraints.value = { noGoAreas: [] };
    traffic.value = [];
    applyScenarioStartState(scenario);
    // Initialize map/sim from scenario startState
    if (scenario?.startState && mapRef.value?.initializeFromScenario) {
      mapRef.value.initializeFromScenario(scenario.startState);
    }
  },
  onReset: () => {
    timelineElapsed.value = 0;
    timelineProgress.value = 0;
    elapsedLabel.value = '00:00';
    constraints.value = { noGoAreas: [] };
    traffic.value = [];
    const scenario = scenarioRunner.state.activeScenario.value;
    if (scenario) {
      applyScenarioStartState(scenario);
      if (scenario.startState && mapRef.value?.initializeFromScenario) {
        mapRef.value.initializeFromScenario(scenario.startState);
      }
    }
  },
  onAtc: (text) => {
    processAtcInstruction(text);
  },
  onAddTfr: (event) => {
    const nextAreas = [...(constraints.value.noGoAreas || [])];
    const entry = {
      id: event.id,
      name: event.name,
      polygon: event.polygon,
      minAltFt: event.minAltFt,
      maxAltFt: event.maxAltFt,
    };
    const existingIndex = nextAreas.findIndex((area) => area.id === entry.id);
    if (existingIndex >= 0) {
      nextAreas[existingIndex] = entry;
    } else {
      nextAreas.push(entry);
    }
    constraints.value = { noGoAreas: nextAreas };
  },
  onRemoveTfr: (event) => {
    const id = event.id || event.tfrId;
    constraints.value = {
      noGoAreas: (constraints.value.noGoAreas || []).filter((area) => area.id !== id),
    };
  },
  onAddTraffic: (contact) => {
    const entry = { ...contact };
    traffic.value = [
      ...traffic.value.filter((item) => item.id !== entry.id),
      entry,
    ];
  },
  onRemoveTraffic: (trafficId) => {
    const id = typeof trafficId === 'object' ? trafficId.id : trafficId;
    traffic.value = traffic.value.filter((item) => item.id !== id);
  },
  onTick: (elapsedSeconds, durationSeconds) => {
    timelineDurationSeconds.value = durationSeconds;
    updateTimelineProgress(elapsedSeconds);
  },
  onComplete: () => {
    pauseSimulation();
  },
});

const scenarioEvents = scenarioRunner.state.events;
const currentEventIndex = scenarioRunner.state.currentEventIndex;

function toggleFollow() {
  mapRef.value?.toggleFollow?.();
  // isFollowing is updated internally by toggleFollow, sync after a brief delay
  setTimeout(() => {
    isFollowing.value = mapRef.value?.isFollowing ?? isFollowing.value;
  }, 0);
}

function toggleCenter() {
  isFollowing.value = false;
  mapRef.value?.centerOnAircraft?.();
}

function startSimulation() {
  mapRef.value?.start?.();
  scenarioRunner.start();
  isPaused.value = false;
  if (transcript.value.length === 0) {
    sessionStart.value = performance.now();
    timelineProgress.value = 0;
    elapsedLabel.value = '00:00';
    timelineElapsed.value = 0;
  }
}

function pauseSimulation() {
  mapRef.value?.pause?.();
  scenarioRunner.pause();
  isPaused.value = true;
}

function resetScenario() {
  clearRuntimeState();
  scenarioRunner.reset();
  scenarioRunner.start();
}

function setViewMode(mode) {
  is2D.value = mode === '2D';
  const pitch = is2D.value ? 0 : 70;
  mapRef.value?.setPitch?.(pitch);
}

// Flight strip control functions
function setAll() {
  const sim = mapRef.value?.sim;
  if (!sim) return;

  if (headingInput.value !== null && headingInput.value !== '') {
    sim.setHeading(headingInput.value);
  }
  if (altitudeInput.value !== null && altitudeInput.value !== '') {
    sim.setAltitude(altitudeInput.value);
  }
  if (speedInput.value !== null && speedInput.value !== '') {
    sim.setSpeed(speedInput.value);
  }
  if (verticalSpeedInput.value !== null && verticalSpeedInput.value !== '') {
    sim.setVerticalSpeedLimit(verticalSpeedInput.value);
  }
}

// Handle space key for pause/play toggle
function handleKeyPress(event) {
  if (event.code === 'Space' && event.target.tagName !== 'INPUT' && event.target.tagName !== 'TEXTAREA') {
    event.preventDefault();
    mapRef.value?.togglePause?.();
    // State will sync via checkSimState
    checkSimState();
  }
}

// Sync simulation state with UI
function checkSimState() {
  const running = mapRef.value?.isRunning;
  if (typeof running === 'boolean') {
    isPaused.value = !running;
    const runnerState = scenarioRunner.state.isRunning.value;
    if (running && !runnerState) {
      scenarioRunner.start();
    } else if (!running && runnerState) {
      scenarioRunner.pause();
    }
  }
}

// Sync initial state when map loads
watch(
  selectedScenarioId,
  (id) => {
    const scenario = scenarios.find((item) => item.id === id);
    if (!scenario) return;
    scenarioRunner.pause();
    scenarioRunner.loadScenario(scenario.data);
    const mapAvailable = Boolean(mapRef.value?.reset);
    clearRuntimeState({ resetMap: mapAvailable });
    scenarioRunner.reset();
    if (mapAvailable) {
      scenarioRunner.start();
    }
  },
  { immediate: true }
);

watch(
  () => mapRef.value,
  (mapInstance) => {
    if (mapInstance?.initializeFromScenario && pendingStartState.value) {
      mapInstance.initializeFromScenario(pendingStartState.value);
    }
  },
  { immediate: true }
);

onMounted(() => {
  // Add space key listener
  window.addEventListener('keydown', handleKeyPress);

  // Check initial state after a short delay to ensure map is loaded
  setTimeout(() => {
    sessionStart.value = performance.now();
    const followState = mapRef.value?.isFollowing;
    if (followState !== undefined) {
      isFollowing.value = followState;
    }

    const pitch = mapRef.value?.getPitch?.();
    if (pitch !== undefined) {
      is2D.value = pitch < 5;
    }

    checkSimState();
    resetScenario();
  }, 500);

  // Check periodically to keep in sync (reduced frequency for better performance)
  const syncInterval = setInterval(checkSimState, 250);

  // Cleanup on unmount
  onUnmounted(() => {
    window.removeEventListener('keydown', handleKeyPress);
    clearInterval(syncInterval);
  });
});

</script>

<style scoped>
/* Styles will be in style.css */
</style>
