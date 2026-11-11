/** Geometry for the Rainbow Wheel: 12 equal wedges numbered clockwise from the top pointer. */
export const WHEEL_WEDGES = 12;
export const WHEEL_SLICE = 360 / WHEEL_WEDGES;

/** Clockwise rotation (deg) that brings wedge i's centre under the top pointer after `turns` full turns. */
export function landingRotation(i: number, turns = 6) {
  return 360 * turns - (i * WHEEL_SLICE + WHEEL_SLICE / 2);
}
/** Which wedge sits under the top pointer for a given clockwise rotation (deg). */
export function wedgeAtPointer(rotation: number) {
  const a = (((-rotation) % 360) + 360) % 360;
  return Math.floor(a / WHEEL_SLICE) % WHEEL_WEDGES;
}
