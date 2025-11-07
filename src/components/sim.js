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
  originAltitudeMeters = 0, // Absolute altitude of origin (for converting absolute targets to relative)
  onUpdate,
}) {
  // Helper function for degree-to-radian conversion
  const DEG_TO_RAD = Math.PI / 180;
  const toRadians = (deg) => deg * DEG_TO_RAD;
  const toDegrees = (rad) => rad / DEG_TO_RAD;

  // Simulation parameters
  const minSpeedMps = 60; // Minimum speed (meters per second)
  const maxSpeedMps = 130; // Maximum speed (meters per second)
  const speedAccelMps2 = 10; // Speed acceleration (m/s²)
  const maxTurnRateDegps = 3; // Maximum turn rate (degrees per second)
  const bankAngleSmoothingRate = 15; // Bank angle change rate (degrees per second)
  const maxClimbRateMps = 20.32; // Maximum climb rate (4000 fpm in m/s)
  const maxDescentRateMps = 20.32; // Maximum descent rate (4000 fpm in m/s)
  const maxPitchAngleDeg = 10; // Maximum pitch angle (degrees, ±10 degrees)
  const pitchAngleSmoothingRate = 3; // Pitch angle change rate (degrees per second)
  const g = 9.81; // Gravitational acceleration (m/s²)

  // Local coordinates (meters): x=east, y=north, z=up
  let x = 0; // east (meters)
  let y = 0; // north (meters)
  let z = initialAltitudeMeters; // altitude (meters)
  let headingDeg = initialHeadingDeg;
  let speedMps = 200; // Current speed (meters per second)
  let bankAngleDeg = 0; // Current bank angle (degrees, positive = right wing down)
  let pitchAngleDeg = 0; // Current pitch angle (degrees, positive = nose up)

  // Control inputs (set by keyboard)
  let speedInput = 0; // -1 to 1 (back to forward)
  let turnInput = 0; // -1 to 1 (left to right)
  let pitchInput = 0; // -1 to 1 (descend to climb)

  // Target values for automation (null = no target)
  let targetSpeedKt = null; // Target speed in knots
  let targetHeadingDeg = null; // Target heading in degrees
  let targetAltitudeFt = null; // Target altitude in feet (absolute, not relative)

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

    // Update speed based on input or automation target
    if (targetSpeedKt !== null) {
      // Convert target speed from knots to m/s (1 kt = 0.514444 m/s)
      const targetSpeedMps = targetSpeedKt * 0.514444;
      const speedDiff = targetSpeedMps - speedMps;
      const speedTolerance = 0.5; // 0.5 m/s tolerance
      
      if (Math.abs(speedDiff) > speedTolerance) {
        // Calculate required speed input to reach target
        const maxSpeedChange = speedAccelMps2 * deltaTime;
        if (speedDiff > 0) {
          speedInput = Math.min(1, speedDiff / maxSpeedChange);
        } else {
          speedInput = Math.max(-1, speedDiff / maxSpeedChange);
        }
      } else {
        // Close enough, maintain current speed
        speedInput = 0;
      }
    }
    
    const speedChange = speedInput * speedAccelMps2 * deltaTime;
    speedMps = Math.max(minSpeedMps, Math.min(maxSpeedMps, speedMps + speedChange));

    // Calculate target bank angle from turn rate and speed
    // Physics: turn_rate (rad/s) = (g * tan(bank_angle)) / speed
    // So: bank_angle = atan((turn_rate * speed) / g)
    let turnRate = turnInput * maxTurnRateDegps;
    
    // Automation: calculate turn input to reach target heading
    if (targetHeadingDeg !== null) {
      // Calculate shortest angular distance to target heading
      let headingDiff = targetHeadingDeg - headingDeg;
      // Normalize to [-180, 180]
      if (headingDiff > 180) headingDiff -= 360;
      if (headingDiff < -180) headingDiff += 360;
      
      const headingTolerance = 1; // 1 degree tolerance
      if (Math.abs(headingDiff) > headingTolerance) {
        // Calculate required turn rate (proportional control)
        const maxTurnRate = maxTurnRateDegps;
        const desiredTurnRate = Math.max(-maxTurnRate, Math.min(maxTurnRate, headingDiff * 2)); // P-gain of 2
        turnInput = desiredTurnRate / maxTurnRate;
      } else {
        // Close enough, stop turning
        turnInput = 0;
      }
      
      turnRate = turnInput * maxTurnRateDegps;
    }
    
    let targetBankAngleDeg = 0;
    if (Math.abs(turnRate) > 0.1 && speedMps > 10) {
      // Convert turn rate to radians per second
      const turnRateRadps = toRadians(turnRate);
      // Calculate required bank angle for coordinated turn
      targetBankAngleDeg = toDegrees(Math.atan((turnRateRadps * speedMps) / g));
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

    // Calculate target pitch angle from pitch input or automation target
    let targetPitchAngleDeg = 0;
    
    if (targetAltitudeFt !== null) {
      // Convert target altitude from feet to meters (1 ft = 0.3048 m)
      // Target altitude is absolute, so convert to relative to origin
      const targetAltitudeMetersAbsolute = targetAltitudeFt / 3.28084;
      const targetAltitudeMeters = targetAltitudeMetersAbsolute - originAltitudeMeters;
      const altitudeDiff = targetAltitudeMeters - z;
      const altitudeTolerance = 10; // 10 meters tolerance
      
      if (Math.abs(altitudeDiff) > altitudeTolerance) {
        // Calculate required vertical speed to reach target
        // Use proportional control with rate limiting
        const maxVerticalSpeedMps = altitudeDiff > 0 ? maxClimbRateMps : maxDescentRateMps;
        const desiredVerticalSpeedMps = Math.max(-maxDescentRateMps, Math.min(maxClimbRateMps, altitudeDiff * 0.1)); // P-gain of 0.1
        
        // Convert vertical speed to pitch angle
        // pitch = asin(vertical_speed / speed)
        if (speedMps > 10) {
          const requiredPitchRad = Math.asin(Math.max(-1, Math.min(1, desiredVerticalSpeedMps / speedMps)));
          const requiredPitchDeg = toDegrees(requiredPitchRad);
          targetPitchAngleDeg = Math.max(-maxPitchAngleDeg, Math.min(maxPitchAngleDeg, requiredPitchDeg));
          pitchInput = targetPitchAngleDeg / maxPitchAngleDeg;
        }
      } else {
        // Close enough, level off
        pitchInput = 0;
        targetPitchAngleDeg = 0;
      }
    } else if (Math.abs(pitchInput) > 0.1) {
      // Calculate target pitch angle based on input
      // Positive pitchInput = climb (nose up), negative = descend (nose down)
      targetPitchAngleDeg = pitchInput * maxPitchAngleDeg;
      // Clamp to reasonable limits
      targetPitchAngleDeg = Math.max(-maxPitchAngleDeg, Math.min(maxPitchAngleDeg, targetPitchAngleDeg));
    }

    // Smoothly transition pitch angle toward target
    const pitchAngleDiff = targetPitchAngleDeg - pitchAngleDeg;
    const maxPitchChange = pitchAngleSmoothingRate * deltaTime;
    if (Math.abs(pitchAngleDiff) > maxPitchChange) {
      pitchAngleDeg += Math.sign(pitchAngleDiff) * maxPitchChange;
    } else {
      pitchAngleDeg = targetPitchAngleDeg;
    }

    // Update heading based on turn input
    headingDeg = (headingDeg + turnRate * deltaTime) % 360;
    if (headingDeg < 0) headingDeg += 360;

    // Update altitude based on pitch angle
    // Convert pitch angle to vertical speed
    // Vertical speed = speed * sin(pitch_angle)
    const pitchRad = toRadians(pitchAngleDeg);
    let verticalSpeedMps = speedMps * Math.sin(pitchRad);
    
    // Clamp vertical speed to max rates
    if (verticalSpeedMps > 0) {
      // Climbing
      verticalSpeedMps = Math.min(verticalSpeedMps, maxClimbRateMps);
    } else if (verticalSpeedMps < 0) {
      // Descending
      verticalSpeedMps = Math.max(verticalSpeedMps, -maxDescentRateMps);
    }
    
    z += verticalSpeedMps * deltaTime;
    // Allow descent below initial altitude, but prevent going too far below ground
    // (e.g., -1000 meters below ground level as a safety limit)
    const minAltitudeMeters = initialAltitudeMeters - 1000;
    if (z < minAltitudeMeters) z = minAltitudeMeters;

    // Move forward based on heading and speed
    // Account for pitch angle: horizontal component = speed * cos(pitch)
    // Heading: 0 = north, 90 = east, 180 = south, 270 = west
    const headingRad = toRadians(headingDeg);
    const horizontalSpeedMps = speedMps * Math.cos(pitchRad);
    const distance = horizontalSpeedMps * deltaTime;
    x += Math.sin(headingRad) * distance; // east component
    y += Math.cos(headingRad) * distance; // north component

    // Update position history for trail
    const currentTime = timestamp;
    let shouldUpdateHistory = false;
    if (!lastUpdateTime || currentTime - lastUpdateTime >= updateIntervalMs) {
      shouldUpdateHistory = true;
      
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
      // Cache newest distance to avoid repeated array access
      if (positionHistory.length > 1) {
        const newestPoint = positionHistory[positionHistory.length - 1];
        const newestDistance = newestPoint.cumulativeDistance;
        
        // Remove points that are beyond the max trail distance
        // Use a more efficient approach: find the cutoff index
        while (positionHistory.length > 1) {
          const oldestPoint = positionHistory[0];
          const trailLength = newestDistance - oldestPoint.cumulativeDistance;
          if (trailLength <= maxTrailDistanceM) break;
          positionHistory.shift();
        }
      }

      lastUpdateTime = currentTime;
    }

    // Call update callback with local coordinates and history
    // Only copy positionHistory when it was actually updated to avoid unnecessary allocations
    onUpdate({
      x,
      y,
      z,
      headingDeg,
      bankAngleDeg,
      pitchAngleDeg,
      speedMps,
      positionHistory: shouldUpdateHistory ? [...positionHistory] : positionHistory,
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
      pitchAngleDeg = 0;
      speedMps = 200;
      speedInput = 0;
      turnInput = 0;
      pitchInput = 0;
      targetSpeedKt = null;
      targetHeadingDeg = null;
      targetAltitudeFt = null;
      positionHistory = [];
      lastUpdateTime = null;
      cumulativeDistance = 0;
    },

    setControls({ speed, turn, pitch }) {
      // speed: -1 (slow down) to 1 (speed up)
      // turn: -1 (left) to 1 (right)
      // pitch: -1 (descend) to 1 (climb)
      // Manual controls override automation
      if (speed !== undefined) {
        speedInput = Math.max(-1, Math.min(1, speed));
        if (speed !== 0) targetSpeedKt = null; // Clear automation if manual control
      }
      if (turn !== undefined) {
        turnInput = Math.max(-1, Math.min(1, turn));
        if (turn !== 0) targetHeadingDeg = null; // Clear automation if manual control
      }
      if (pitch !== undefined) {
        pitchInput = Math.max(-1, Math.min(1, pitch));
        if (pitch !== 0) targetAltitudeFt = null; // Clear automation if manual control
      }
    },

    getState() {
      return {
        x,
        y,
        z,
        headingDeg,
        bankAngleDeg,
        pitchAngleDeg,
        speedMps,
      };
    },

    // Automation functions: set target values (wrapper functions)
    setSpeed(targetSpeedKnots) {
      // Input: speed in knots
      // Clamp to reasonable limits (40-400 kt based on response schema)
      targetSpeedKt = Math.max(40, Math.min(400, targetSpeedKnots));
    },

    setHeading(targetHeadingDegrees) {
      // Input: heading in degrees (0-360)
      // Normalize to 0-360 range
      targetHeadingDeg = ((targetHeadingDegrees % 360) + 360) % 360;
    },

    setAltitude(targetAltitudeFeet) {
      // Input: altitude in feet (absolute, not relative)
      // Clamp to reasonable limits (-1000 to 60000 ft based on response schema)
      targetAltitudeFt = Math.max(-1000, Math.min(60000, targetAltitudeFeet));
    },

    // Clear automation targets
    clearSpeed() {
      targetSpeedKt = null;
    },

    clearHeading() {
      targetHeadingDeg = null;
    },

    clearAltitude() {
      targetAltitudeFt = null;
    },

    // Get current targets
    getTargets() {
      return {
        speedKt: targetSpeedKt,
        headingDeg: targetHeadingDeg,
        altitudeFt: targetAltitudeFt,
      };
    },
  };
}

