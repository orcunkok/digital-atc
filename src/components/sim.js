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
  initialAltitudeMeters = 0,
  originAltitudeMeters = 0, // Absolute altitude of origin (for converting absolute targets to relative)
  initialSpeedKt = 140, // Initial speed in knots
  onUpdate,
}) {
  // Conversion constants
  const DEG_TO_RAD = Math.PI / 180;
  const KT_TO_MPS = 0.514444; // knots to meters per second
  const FT_TO_M = 0.3048; // feet to meters (1 ft = 0.3048 m)
  const FPM_TO_MPS = 1 / 196.85; // feet per minute to meters per second

  // Helper functions
  const toRadians = (deg) => deg * DEG_TO_RAD;
  const toDegrees = (rad) => rad / DEG_TO_RAD;
  const normalizeHeading = (heading) => {
    heading = heading % 360;
    return heading < 0 ? heading + 360 : heading;
  };
  const normalizeHeadingDiff = (diff) => {
    if (diff > 180) return diff - 360;
    if (diff < -180) return diff + 360;
    return diff;
  };

  // Simulation parameters - Jet-liner class with demo-friendly turn rates
  const minSpeedMps = 80 * KT_TO_MPS; // Minimum speed ~80 kt (meters per second)
  const maxSpeedMps = 250 * KT_TO_MPS; // Maximum speed ~250 kt (meters per second) - jet-liner cruise
  const speedAccelMps2 = 2.0; // Speed acceleration (m/s²) - realistic for jet-liner
  const maxTurnRateDegps = 3; // Maximum turn rate (degrees per second) - kept demo-friendly
  const bankAngleSmoothingRate = 15; // Bank angle change rate (degrees per second)
  const maxClimbRateMps = 30.48; // Maximum climb rate (6000 fpm in m/s) - jet-liner capability
  const maxDescentRateMps = 25.4; // Maximum descent rate (5000 fpm in m/s) - jet-liner capability
  const maxPitchAngleDeg = 15; // Maximum pitch angle (degrees, ±15 degrees)
  const pitchAngleSmoothingRate = 3; // Pitch angle change rate (degrees per second)
  const g = 9.81; // Gravitational acceleration (m/s²)
  
  // Tolerance constants
  const SPEED_TOLERANCE_MPS = 0.5; // 0.5 m/s tolerance for speed
  const HEADING_TOLERANCE_DEG = 1; // 1 degree tolerance for heading
  const ALTITUDE_TOLERANCE_M = 10; // 10 meters tolerance for altitude

  // Local coordinates (meters): x=east, y=north, z=up
  let x = 0; // east (meters)
  let y = 0; // north (meters)
  let z = initialAltitudeMeters; // altitude (meters)
  let headingDeg = initialHeadingDeg;
  let speedMps = initialSpeedKt * KT_TO_MPS; // Current speed (meters per second) - initialize from scenario
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
  let verticalSpeedLimitFpm = null; // Vertical speed limit in feet per minute (constrains climb/descent rate)
  
  // Make originAltitudeMeters updatable for scenario changes
  let currentOriginAltitudeMeters = originAltitudeMeters;

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
    let targetSpeedMps = null;
    if (targetSpeedKt !== null) {
      targetSpeedMps = targetSpeedKt * KT_TO_MPS;
      const speedDiff = targetSpeedMps - speedMps;
      
      if (Math.abs(speedDiff) > SPEED_TOLERANCE_MPS) {
        // Calculate required speed input to reach target
        const maxSpeedChange = speedAccelMps2 * deltaTime;
        speedInput = Math.max(-1, Math.min(1, speedDiff / maxSpeedChange));
      } else {
        // Close enough, snap to target and maintain
        speedInput = 0;
        speedMps = targetSpeedMps;
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
      let headingDiff = normalizeHeadingDiff(targetHeadingDeg - headingDeg);
      
      if (Math.abs(headingDiff) > HEADING_TOLERANCE_DEG) {
        // Calculate required turn rate (proportional control, P-gain of 2)
        const desiredTurnRate = Math.max(-maxTurnRateDegps, Math.min(maxTurnRateDegps, headingDiff * 2));
        turnInput = desiredTurnRate / maxTurnRateDegps;
      } else {
        // Close enough, snap to target and stop turning
        turnInput = 0;
        headingDeg = targetHeadingDeg;
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
    bankAngleDeg += Math.abs(bankAngleDiff) > maxBankChange 
      ? Math.sign(bankAngleDiff) * maxBankChange 
      : bankAngleDiff;

    // Calculate target pitch angle from pitch input or automation target
    let targetPitchAngleDeg = 0;
    
    if (targetAltitudeFt !== null) {
      // Convert target altitude from feet to meters (absolute to relative)
      const targetAltitudeMeters = (targetAltitudeFt * FT_TO_M) - currentOriginAltitudeMeters;
      const altitudeDiff = targetAltitudeMeters - z;
      
      if (Math.abs(altitudeDiff) > ALTITUDE_TOLERANCE_M) {
        // Calculate required vertical speed to reach target (P-gain of 0.1)
        let desiredVerticalSpeedMps = Math.max(-maxDescentRateMps, Math.min(maxClimbRateMps, altitudeDiff * 0.1));
        
        // Apply vertical speed limit if set
        if (verticalSpeedLimitFpm !== null) {
          const limitMps = verticalSpeedLimitFpm * FPM_TO_MPS;
          desiredVerticalSpeedMps = Math.max(-limitMps, Math.min(limitMps, desiredVerticalSpeedMps));
        }
        
        // Convert vertical speed to pitch angle using maxPitchAngleDeg
        // pitch = asin(vertical_speed / speed)
        if (speedMps > 10) {
          const requiredPitchRad = Math.asin(Math.max(-1, Math.min(1, desiredVerticalSpeedMps / speedMps)));
          const requiredPitchDeg = toDegrees(requiredPitchRad);
          // Clamp to maxPitchAngleDeg parameter
          targetPitchAngleDeg = Math.max(-maxPitchAngleDeg, Math.min(maxPitchAngleDeg, requiredPitchDeg));
          pitchInput = targetPitchAngleDeg / maxPitchAngleDeg;
        }
      } else {
        // Close enough, snap to target and level off
        z = targetAltitudeMeters;
        pitchInput = 0;
        targetPitchAngleDeg = 0;
        targetAltitudeFt = null; // Clear target once reached
      }
    } else if (Math.abs(pitchInput) > 0.1) {
      // Calculate target pitch angle based on input
      // Positive pitchInput = climb (nose up), negative = descend (nose down)
      targetPitchAngleDeg = Math.max(-maxPitchAngleDeg, Math.min(maxPitchAngleDeg, pitchInput * maxPitchAngleDeg));
    }

    // Smoothly transition pitch angle toward target
    const pitchAngleDiff = targetPitchAngleDeg - pitchAngleDeg;
    const maxPitchChange = pitchAngleSmoothingRate * deltaTime;
    pitchAngleDeg += Math.abs(pitchAngleDiff) > maxPitchChange 
      ? Math.sign(pitchAngleDiff) * maxPitchChange 
      : pitchAngleDiff;

    // Update heading based on turn input
    headingDeg = normalizeHeading(headingDeg + turnRate * deltaTime);

    // Update altitude based on pitch angle
    // Vertical speed = speed * sin(pitch_angle)
    const pitchRad = toRadians(pitchAngleDeg);
    const sinPitch = Math.sin(pitchRad);
    const cosPitch = Math.cos(pitchRad);
    let verticalSpeedMps = speedMps * sinPitch;
    
    // Clamp vertical speed to max rates
    verticalSpeedMps = verticalSpeedMps > 0 
      ? Math.min(verticalSpeedMps, maxClimbRateMps)
      : Math.max(verticalSpeedMps, -maxDescentRateMps);
    
    // Apply vertical speed limit if set
    if (verticalSpeedLimitFpm !== null) {
      const limitMps = verticalSpeedLimitFpm * FPM_TO_MPS;
      verticalSpeedMps = Math.max(-limitMps, Math.min(limitMps, verticalSpeedMps));
    }
    
    z += verticalSpeedMps * deltaTime;
    // Prevent going too far below ground (safety limit)
    const minAltitudeMeters = initialAltitudeMeters - 1000;
    if (z < minAltitudeMeters) z = minAltitudeMeters;

    // Move forward based on heading and speed
    // Horizontal component = speed * cos(pitch)
    const headingRad = toRadians(headingDeg);
    const distance = speedMps * cosPitch * deltaTime;
    x += Math.sin(headingRad) * distance; // east component
    y -= Math.cos(headingRad) * distance; // north component (Mapbox y increases southward)

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
      // More efficient: find cutoff index instead of repeated shift() operations
      if (positionHistory.length > 1) {
        const newestDistance = cumulativeDistance;
        let cutoffIndex = 0;
        
        // Find first point that should be kept
        for (let i = 0; i < positionHistory.length - 1; i++) {
          const trailLength = newestDistance - positionHistory[i].cumulativeDistance;
          if (trailLength <= maxTrailDistanceM) {
            cutoffIndex = i;
            break;
          }
        }
        
        // Remove old points in one operation
        if (cutoffIndex > 0) {
          positionHistory = positionHistory.slice(cutoffIndex);
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
    get isRunning() {
      return isRunning;
    },

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
      speedMps = initialSpeedKt * KT_TO_MPS; // Use initial speed from scenario
      speedInput = 0;
      turnInput = 0;
      pitchInput = 0;
      targetSpeedKt = null;
      targetHeadingDeg = null;
      targetAltitudeFt = null;
      verticalSpeedLimitFpm = null;
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
        if (pitch !== 0) {
          targetAltitudeFt = null; // Clear automation if manual control
        }
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
      targetHeadingDeg = normalizeHeading(targetHeadingDegrees);
    },

    setAltitude(targetAltitudeFeet) {
      // Input: altitude in feet (absolute, not relative)
      // Clamp to reasonable limits (-1000 to 60000 ft based on response schema)
      targetAltitudeFt = Math.max(-1000, Math.min(60000, targetAltitudeFeet));
    },

    setVerticalSpeedLimit(limitFeetPerMinute) {
      // Input: vertical speed limit in feet per minute (absolute value, constrains both climb and descent)
      // Clamp to reasonable limits (0 to 4000 fpm)
      if (limitFeetPerMinute === null || limitFeetPerMinute === '') {
        verticalSpeedLimitFpm = null;
      } else {
        const absLimit = limitFeetPerMinute < 0 ? -limitFeetPerMinute : limitFeetPerMinute;
        verticalSpeedLimitFpm = absLimit > 4000 ? 4000 : (absLimit < 0 ? 0 : absLimit);
      }
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

    clearVerticalSpeedLimit() {
      verticalSpeedLimitFpm = null;
    },

    // Get current targets
    getTargets() {
      return {
        speedKt: targetSpeedKt,
        headingDeg: targetHeadingDeg,
        altitudeFt: targetAltitudeFt,
        verticalSpeedLimitFpm: verticalSpeedLimitFpm,
      };
    },
    
    updateOriginAltitude(newOriginAltitudeMeters) {
      // Update the origin altitude used for absolute-to-relative conversions
      currentOriginAltitudeMeters = newOriginAltitudeMeters;
    },
  };
}

