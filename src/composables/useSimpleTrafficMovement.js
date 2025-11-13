/**
 * Simple traffic movement composable
 * Moves aircraft along a straight line based on heading and speed
 * All calculations are in local coordinates (meters relative to origin)
 */

const KT_TO_MPS = 0.514444; // knots to meters per second
const DEG_TO_RAD = Math.PI / 180;

const toRadians = (deg) => deg * DEG_TO_RAD;

export function useSimpleTrafficMovement({
  initialX = 0,
  initialY = 0,
  initialZ = 0,
  headingDeg = 0,
  speedKt = 100,
}) {
  // Local coordinates (meters): x=east, y=north, z=up
  let x = initialX;
  let y = initialY;
  let z = initialZ;
  let headingDegrees = headingDeg;
  const speedMps = speedKt * KT_TO_MPS;

  function update(deltaTime) {
    if (deltaTime <= 0 || deltaTime > 0.1) return;

    // Move forward based on heading and speed
    const headingRad = toRadians(headingDegrees);
    const distance = speedMps * deltaTime;
    x += Math.sin(headingRad) * distance; // east component
    y -= Math.cos(headingRad) * distance; // north component (Mapbox y increases southward)
    // z stays constant (no vertical movement for simple traffic)
  }

  function getPosition() {
    return {
      x,
      y,
      z,
      headingDeg: headingDegrees,
    };
  }

  function setPosition(newX, newY, newZ, newHeadingDeg) {
    x = newX;
    y = newY;
    z = newZ;
    if (newHeadingDeg !== undefined) {
      headingDegrees = newHeadingDeg;
    }
  }

  return {
    update,
    getPosition,
    setPosition,
  };
}

