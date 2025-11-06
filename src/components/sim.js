/**
 * Simple simulation that moves aircraft north 1000m and back in a loop
 * All calculations are in local coordinates (meters relative to origin)
 * @param {Object} options - Simulation options
 * @param {number} options.initialHeadingDeg - Initial heading in degrees
 * @param {number} options.initialAltitudeMeters - Initial altitude in meters
 * @param {Function} options.onUpdate - Callback function called with local state {x, y, z, headingDeg}
 * @returns {Object} Simulation control object with start/stop methods
 */
export function createSim({
  initialHeadingDeg = 0,
  initialAltitudeMeters = 1000,
  onUpdate,
}) {
  const speedMps = 300; // meters per second
  const distanceM = 10000; // 1000 meters

  // Local coordinates (meters): x=east, y=north, z=up
  let x = 0; // east (meters)
  let y = 0; // north (meters)
  let z = initialAltitudeMeters; // altitude (meters)
  let headingDeg = initialHeadingDeg;

  let startTime = null;
  let animationFrameId = null;
  let isRunning = false;
  let direction = 1; // 1 = north, -1 = south

  // Track position history for breadcrumb trail (last 1000 meters)
  const maxTrailDistanceM = 1000; // Keep last 1000 meters
  let positionHistory = []; // Array of {x, y, z, cumulativeDistance}
  let lastUpdateTime = null;
  const updateIntervalMs = 100; // Update every 100ms (10 times per second)
  let cumulativeDistance = 0; // Total distance traveled along path

  function updatePosition(timestamp) {
    if (!isRunning) return;

    if (!startTime) {
      startTime = timestamp;
    }

    const elapsed = (timestamp - startTime) / 1000; // Convert to seconds

    // Move north or south in local coordinates
    if (direction === 1) {
      // Moving north (positive y)
      y = speedMps * elapsed;
      if (y >= distanceM) {
        // Reached north end, switch to south
        direction = -1;
        startTime = timestamp; // Reset timer for southbound leg
        y = distanceM;
      }
    } else {
      // Moving south (negative y)
      const distanceTraveled = speedMps * elapsed;
      y = distanceM - distanceTraveled;
      if (y <= 0) {
        // Reached south end, switch to north and loop
        direction = 1;
        startTime = timestamp; // Reset timer for northbound leg
        y = 0;
      }
    }

    // Calculate heading (0 = north, 180 = south)
    headingDeg = direction === 1 ? 0 : 180;

    // Update position history every second
    const currentTime = timestamp;
    if (!lastUpdateTime || currentTime - lastUpdateTime >= updateIntervalMs) {
      // Calculate distance from last position
      if (positionHistory.length > 0) {
        const lastPoint = positionHistory[positionHistory.length - 1];
        const dx = x - lastPoint.x;
        const dy = y - lastPoint.y;
        const segmentDistance = Math.sqrt(dx * dx + dy * dy);
        cumulativeDistance += segmentDistance;
      }

      // Add current position to history
      positionHistory.push({
        x,
        y,
        z,
        cumulativeDistance,
        timestamp: currentTime,
      });

      // Remove points beyond maxTrailDistanceM (based on path distance)
      if (positionHistory.length > 1) {
        const newestDistance = positionHistory[positionHistory.length - 1].cumulativeDistance;
        
        // Remove points that are beyond the max trail distance
        while (positionHistory.length > 1) {
          const oldestDistance = positionHistory[0].cumulativeDistance;
          const trailLength = newestDistance - oldestDistance;
          if (trailLength <= maxTrailDistanceM) break;
          positionHistory.shift();
        }
      }

      lastUpdateTime = currentTime;
    }

    // Call update callback with local coordinates and history
    onUpdate({
      x,
      y,
      z,
      headingDeg,
      positionHistory: [...positionHistory], // Send copy of history
    });

    animationFrameId = requestAnimationFrame(updatePosition);
  }

  return {
    start() {
      if (isRunning) return;
      isRunning = true;
      startTime = null;
      // Add initial position to history
      if (positionHistory.length === 0) {
        positionHistory.push({
          x,
          y,
          z,
          cumulativeDistance: 0,
          timestamp: performance.now(),
        });
      }
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
      x = 0;
      y = 0;
      z = initialAltitudeMeters;
      headingDeg = initialHeadingDeg;
      direction = 1;
      positionHistory = [];
      lastUpdateTime = null;
      cumulativeDistance = 0;
    },

    getState() {
      return {
        x,
        y,
        z,
        headingDeg: direction === 1 ? 0 : 180,
      };
    },
  };
}

