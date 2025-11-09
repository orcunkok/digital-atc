<template>
  <div class="container">
    <!-- Header -->
    <header class="header">
      <div class="header-left">
        <div class="logo-container">
          <div class="logo logo-main">Digital ATC</div>
          <div class="logo logo-subtitle">dsb robotics</div>
        </div>
        <div class="status-indicator"></div>
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
      <MapboxTerrain ref="mapRef" />
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
        <div class="toggle-switch">
          <button
            class="toggle-btn"
            :class="{ active: is2D }"
            @click="setViewMode('2D')"
          >
            2D
          </button>
          <button
            class="toggle-btn"
            :class="{ active: !is2D }"
            @click="setViewMode('3D')"
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
          :class="{ active: activeTab === 'transcript' }"
          @click="activeTab = 'transcript'"
        >
          Transcript
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
            <span class="intent-key">Special Action</span>
            <span>{{ simState.specialAction || '—' }}</span>
          </div>
        </div>

        <div class="state-section">
          <div class="subsection-title">Clearance</div>
          <div style="font-size: 11px; line-height: 1.6; color: var(--color-text-secondary)">
            Proceed northbound along the shoreline at 1,500. Remain west of TFR.
          </div>
        </div>

        <div class="state-section">
          <div class="subsection-title">Conflicts</div>
          <div style="font-size: 11px; color: var(--color-error)">
            TFR projected 2.1 NM ahead
          </div>
        </div>

        <div class="timeline-container">
          <div class="subsection-title">Timeline</div>
          <div class="timeline-bar">
            <div class="timeline-progress" :style="{ width: timelineProgress + '%' }"></div>
          </div>
          <div class="timeline-labels">
            <span>00:35</span>
            <span>02:30</span>
          </div>
        </div>
      </div>

      <!-- Transcript tab -->
      <div class="tab-content" :class="{ active: activeTab === 'transcript' }">
        <div class="log-entry">
          <div class="log-time">00:05</div>
          <div class="log-speaker atc">ATC</div>
          <div class="log-text">
            N123AB, NorCal Approach, radar contact, proceed northbound along the
            shoreline at 1,500.
          </div>
        </div>
        <div class="log-entry">
          <div class="log-time">00:07</div>
          <div class="log-speaker pilot">PILOT</div>
          <div class="log-text">
            NorCal, November One Two Three Alfa Bravo, shoreline northbound at one
            thousand five hundred.
          </div>
        </div>
        <div class="log-entry">
          <div class="log-time">00:28</div>
          <div class="log-speaker atc">ATC</div>
          <div class="log-text">
            N123AB, be advised TFR ahead, remain west of the TFR.
          </div>
        </div>
        <div class="log-entry">
          <div class="log-time">00:30</div>
          <div class="log-speaker pilot">PILOT</div>
          <div class="log-text">
            November One Two Three Alfa Bravo, will remain west of the TFR.
          </div>
        </div>
      </div>

      <!-- Flight Plan tab -->
      <div class="tab-content" :class="{ active: activeTab === 'plan' }">
        <div class="flight-plan-item">
          <div>
            <div class="waypoint-name">KOAK</div>
            <div class="waypoint-alt">Departure</div>
          </div>
          <div style="font-size: 10px; color: var(--color-text-tertiary)">00:00</div>
        </div>
        <div class="flight-plan-item">
          <div>
            <div class="waypoint-name">Oakland Shoreline</div>
            <div class="waypoint-alt">1,500 ft</div>
          </div>
          <div style="font-size: 10px; color: var(--color-text-tertiary)">00:03</div>
        </div>
        <div class="flight-plan-item">
          <div>
            <div class="waypoint-name">ALCTZ</div>
            <div class="waypoint-alt">1,500 ft</div>
          </div>
          <div style="font-size: 10px; color: var(--color-text-tertiary)">00:45</div>
        </div>
        <div class="flight-plan-item">
          <div>
            <div class="waypoint-name">Golden Gate</div>
            <div class="waypoint-alt">1,500 ft</div>
          </div>
          <div style="font-size: 10px; color: var(--color-text-tertiary)">01:10</div>
        </div>
      </div>
    </aside>

    <!-- Bottom control panel -->
    <div class="control-strip">
      <div class="scenario-panel">
        <div class="scenario-selector">
          <div class="scenario-header">
            <span class="scenario-label">Scenario</span>
            <select class="scenario-select">
              <option>1 > SF VFR + TFR</option>
              <option>2 > KOAK IFR Go-Around</option>
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
              <div class="strip-label">Callsign</div>
              <div class="strip-value strip-callsign">{{ simState.callsign }}</div>
            </div>
            <div class="strip-field">
              <div class="strip-label">ALT</div>
              <div class="strip-value">{{ formatAltitude(simState.altitudeFt) }}</div>
            </div>
            <div class="strip-field">
              <div class="strip-label">HDG</div>
              <div class="strip-value">{{ Math.round(simState.headingDeg) }}°</div>
            </div>
            <div class="strip-field">
              <div class="strip-label">SPD</div>
              <div class="strip-value">{{ Math.round(simState.speedKt) }}</div>
            </div>
            <div class="strip-field">
              <div class="strip-label">V/S</div>
              <div class="strip-value">{{ formatVS(simState.vsFpm) }}</div>
            </div>
          </div>
        </div>

        <!-- Bottom row: ATC Console -->
        <div class="atc-input-container">
          <div class="atc-console">
            <div class="atc-console-label">ATC Input</div>
            <div class="atc-input-row">
              <input
                type="text"
                class="atc-input"
                placeholder="Type ATC instruction or use quick commands..."
                v-model="atcInput"
                @keyup.enter="sendATC"
              />
              <button class="btn" @click="sendATC">Send</button>
            </div>
          </div>
        </div>
      </div>

      <div class="event-queue">
        <div class="event-queue-label">Upcoming Events</div>
        <div class="event-list">
          <div class="event-item" :class="{ active: currentEventIndex === 0 }">
            <span class="event-time">00:35</span>
            <span class="event-desc">Current position</span>
          </div>
          <div class="event-item" :class="{ active: currentEventIndex === 1 }">
            <span class="event-time">00:45</span>
            <span class="event-desc">Add traffic 2 o'clock</span>
          </div>
          <div class="event-item" :class="{ active: currentEventIndex === 2 }">
            <span class="event-time">00:48</span>
            <span class="event-desc">ATC: Traffic advisory</span>
          </div>
          <div class="event-item" :class="{ active: currentEventIndex === 3 }">
            <span class="event-time">01:20</span>
            <span class="event-desc">ATC: Handoff NorCal</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import { Unlock, Lock } from 'lucide-vue-next';
import MapboxTerrain from './components/MapboxTerrain.vue';
import { useSimState } from './composables/useSimState';

const { simState } = useSimState();
const mapRef = ref(null);
const isFollowing = ref(true);
const is2D = ref(false);
const isPaused = ref(false);

// UI state
const activeTab = ref('state');
const layers = ref({
  trail: true,
  flightPlan: true,
  tfr: true,
  traffic: true,
  airspace: false,
  navaids: false,
});
const chartOverlay = ref('none');
const atcInput = ref('');
const currentEventIndex = ref(0);
const timelineProgress = ref(35);

// Helper functions
function formatAltitude(ft) {
  return ft.toLocaleString();
}

function formatVS(fpm) {
  if (fpm === 0) return '0';
  const sign = fpm > 0 ? '+' : '';
  return sign + fpm;
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

function sendATC() {
  // TODO: Implement ATC sending logic
  console.log('Sending ATC:', atcInput.value);
  atcInput.value = '';
}

function toggleFollow() {
  mapRef.value?.toggleFollow?.();
  isFollowing.value = mapRef.value?.isFollowing;
}

function toggleCenter() {
  isFollowing.value = false;
  mapRef.value?.centerOnAircraft?.();
}

function startSimulation() {
  mapRef.value?.start?.();
  isPaused.value = false;
}

function pauseSimulation() {
  mapRef.value?.pause?.();
  isPaused.value = true;
}

function resetScenario() {
  mapRef.value?.reset?.();
  isPaused.value = false;
}

function setViewMode(mode) {
  is2D.value = mode === '2D';
  const pitch = is2D.value ? 0 : 70;
  mapRef.value?.setPitch?.(pitch);
}

// Handle space key for pause/play toggle
function handleKeyPress(event) {
  if (event.code === 'Space' && event.target.tagName !== 'INPUT' && event.target.tagName !== 'TEXTAREA') {
    event.preventDefault();
    mapRef.value?.togglePause?.();
    // Sync paused state from sim
    const running = mapRef.value?.isRunning;
    if (typeof running === 'boolean') {
      isPaused.value = !running;
    } else {
      // Fallback toggle if not immediately available
      isPaused.value = !isPaused.value;
    }
  }
}

// Sync initial state when map loads
onMounted(() => {
  // Add space key listener
  window.addEventListener('keydown', handleKeyPress);

  // Check initial pitch after a short delay to ensure map is loaded
  setTimeout(() => {
    const followState = mapRef.value?.isFollowing;
    if (followState !== undefined) {
      isFollowing.value = followState;
    }

    const pitch = mapRef.value?.getPitch?.();
    if (pitch !== undefined) {
      is2D.value = pitch < 5;
    }

    const running = mapRef.value?.isRunning;
    if (typeof running === 'boolean') {
      isPaused.value = !running;
    }
  }, 500);
});

// Cleanup
onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyPress);
});
</script>

<style scoped>
/* Styles will be in style.css */
</style>
