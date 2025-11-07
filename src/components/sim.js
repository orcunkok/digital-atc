/**
 * Point-mass aircraft simulation with keyboard controls
 * All calculations are in local coordinates (meters relative to origin)
 * @param {Object} options - Simulation options
 * @param {number} options.initialHeadingDeg - Initial heading in degrees
 * @param {number} options.initialAltitudeMeters - Initial altitude in meters
 * @param {Function} options.onUpdate - Callback function called with local state {x, y, z, headingDeg, speedMps}
 * @returns {Object} Simulation control object with start/stop/setControls methods
 */
export function createSim({
  initialHeadingDeg = 0,
  initialAltitudeMeters = 1000,
  onUpdate,
}) {
  // Simulation parameters
  const minSpeedMps = 60; // Minimum speed (meters per second)
  const maxSpeedMps = 130; // Maximum speed (meters per second)
  const speedAccelMps2 = 10; // Speed acceleration (m/s²)
  const maxTurnRateDegps = 3; // Maximum turn rate (degrees per second)
  const bankAngleSmoothingRate = 15; // Bank angle change rate (degrees per second)
  const g = 9.81; // Gravitational acceleration (m/s²)

  // Local coordinates (meters): x=east, y=north, z=up
  let x = 0; // east (meters)
  let y = 0; // north (meters)
  let z = initialAltitudeMeters; // altitude (meters)
  let headingDeg = initialHeadingDeg;
  let speedMps = 200; // Current speed (meters per second)
  let bankAngleDeg = 0; // Current bank angle (degrees, positive = right wing down)

  // Control inputs (set by keyboard)
  let speedInput = 0; // -1 to 1 (back to forward)
  let turnInput = 0; // -1 to 1 (left to right)

  let lastTimestamp = null;
  let animationFrameId = null;
  let isRunning = false;

  // Track position history for breadcrumb trail
  const maxTrailDistanceM = 5000; // Keep last 5000 meters
  let positionHistory = []; // Array of {x, y, z, cumulativeDistance}
  let lastUpdateTime = null;
  const updateIntervalMs = 50; // Update trail every 50ms (20 times per second)
  let cumulativeDistance = 0; // Total distance traveled along path

  function updatePosition(timestamp) {
    if (!isRunning) return;

    // Calculate delta time
    const deltaTime = lastTimestamp ? (timestamp - lastTimestamp) / 1000 : 0;
    lastTimestamp = timestamp;

    if (deltaTime <= 0 || deltaTime > 0.1) {
      // Skip invalid or large delta times
      animationFrameId = requestAnimationFrame(updatePosition);
      return;
    }

    // Update speed based on input
    const speedChange = speedInput * speedAccelMps2 * deltaTime;
    speedMps = Math.max(minSpeedMps, Math.min(maxSpeedMps, speedMps + speedChange));

    // Calculate target bank angle from turn rate and speed
    // Physics: turn_rate (rad/s) = (g * tan(bank_angle)) / speed
    // So: bank_angle = atan((turn_rate * speed) / g)
    const turnRate = turnInput * maxTurnRateDegps;
    let targetBankAngleDeg = 0;
    if (Math.abs(turnRate) > 0.1 && speedMps > 10) {
      // Convert turn rate to radians per second
      const turnRateRadps = (turnRate * Math.PI) / 180;
      // Calculate required bank angle for coordinated turn
      targetBankAngleDeg = (Math.atan((turnRateRadps * speedMps) / g) * 180) / Math.PI;
      // Clamp to reasonable limits (±30 degrees max)
      targetBankAngleDeg = Math.max(-30, Math.min(30, targetBankAngleDeg));
    }

    // Smoothly transition bank angle toward target
    const bankAngleDiff = targetBankAngleDeg - bankAngleDeg;
    const maxBankChange = bankAngleSmoothingRate * deltaTime;
    if (Math.abs(bankAngleDiff) > maxBankChange) {
      bankAngleDeg += Math.sign(bankAngleDiff) * maxBankChange;
    } else {
      bankAngleDeg = targetBankAngleDeg;
    }

    // Update heading based on turn input
    headingDeg = (headingDeg + turnRate * deltaTime) % 360;
    if (headingDeg < 0) headingDeg += 360;

    // Move forward based on heading and speed
    // Heading: 0 = north, 90 = east, 180 = south, 270 = west
    const headingRad = (headingDeg * Math.PI) / 180;
    const distance = speedMps * deltaTime;
    x += Math.sin(headingRad) * distance; // east component
    y += Math.cos(headingRad) * distance; // north component

    // Update position history for trail
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
      bankAngleDeg,
      speedMps,
      positionHistory: [...positionHistory], // Send copy of history
    });

    animationFrameId = requestAnimationFrame(updatePosition);
  }

  return {
    start() {
      if (isRunning) return;
      isRunning = true;
      lastTimestamp = null;
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
      lastTimestamp = null;
    },

    reset() {
      this.stop();
      x = 0;
      y = 0;
      z = initialAltitudeMeters;
      headingDeg = initialHeadingDeg;
      bankAngleDeg = 0;
      speedMps = 200;
      speedInput = 0;
      turnInput = 0;
      positionHistory = [];
      lastUpdateTime = null;
      cumulativeDistance = 0;
    },

    setControls({ speed, turn }) {
      // speed: -1 (slow down) to 1 (speed up)
      // turn: -1 (left) to 1 (right)
      if (speed !== undefined) speedInput = Math.max(-1, Math.min(1, speed));
      if (turn !== undefined) turnInput = Math.max(-1, Math.min(1, turn));
    },

    getState() {
      return {
        x,
        y,
        z,
        headingDeg,
        bankAngleDeg,
        speedMps,
      };
    },
  };
}

