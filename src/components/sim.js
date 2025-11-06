import mapboxgl from 'mapbox-gl';

/**
 * Simple simulation that moves aircraft north 1000m and back in a loop
 * @param {Object} options - Simulation options
 * @param {number} options.initialLat - Starting latitude
 * @param {number} options.initialLon - Starting longitude
 * @param {number} options.altitudeMeters - Altitude in meters
 * @param {Function} options.onUpdate - Callback function called with updated position {lat, lon, headingDeg}
 * @returns {Object} Simulation control object with start/stop methods
 */
export function createSim({ initialLat, initialLon, altitudeMeters, onUpdate }) {
  const speedMps = 300; // 50 meters per second
  const distanceM = 1000; // 1000 meters
  const durationSeconds = distanceM / speedMps; // 20 seconds each direction

  let currentLat = initialLat;
  let currentLon = initialLon;
  let startTime = null;
  let animationFrameId = null;
  let isRunning = false;
  let direction = 1; // 1 = north, -1 = south

  // Convert meters to degrees (approximate, works well for small distances)
  // 1 degree latitude ≈ 111,000 meters
  const metersPerDegreeLat = 111000;
  const latDeltaPerSecond = speedMps / metersPerDegreeLat;

  function updatePosition(timestamp) {
    if (!isRunning) return;

    if (!startTime) {
      startTime = timestamp;
    }

    const elapsed = (timestamp - startTime) / 1000; // Convert to seconds

    // Move north or south
    if (direction === 1) {
      // Moving north
      currentLat = initialLat + latDeltaPerSecond * elapsed;
      if (currentLat >= initialLat + distanceM / metersPerDegreeLat) {
        // Reached north end, switch to south
        direction = -1;
        startTime = timestamp; // Reset timer for southbound leg
        currentLat = initialLat + distanceM / metersPerDegreeLat;
      }
    } else {
      // Moving south
      const distanceTraveled = latDeltaPerSecond * elapsed;
      currentLat = initialLat + distanceM / metersPerDegreeLat - distanceTraveled;
      if (currentLat <= initialLat) {
        // Reached south end, switch to north and loop
        direction = 1;
        startTime = timestamp; // Reset timer for northbound leg
        currentLat = initialLat;
      }
    }

    // Calculate heading (0 = north, 180 = south)
    const headingDeg = direction === 1 ? 0 : 180;

    // Call update callback
    onUpdate({
      lat: currentLat,
      lon: currentLon,
      altitudeMeters,
      headingDeg,
    });

    animationFrameId = requestAnimationFrame(updatePosition);
  }

  return {
    start() {
      if (isRunning) return;
      isRunning = true;
      startTime = null;
      animationFrameId = requestAnimationFrame(updatePosition);
    },

    stop() {
      isRunning = false;
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
      }
      startTime = null;
    },

    reset() {
      this.stop();
      currentLat = initialLat;
      currentLon = initialLon;
      direction = 1;
    },

    getState() {
      return {
        lat: currentLat,
        lon: currentLon,
        altitudeMeters,
        headingDeg: direction === 1 ? 0 : 180,
      };
    },
  };
}

