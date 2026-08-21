/**
 * triggerAutoCheckIn is kept as a no-op so callers do not break.
 * Automatic continuous GPS polling has been removed to conserve battery.
 */
export function triggerAutoCheckIn(_eventId: string) {
  // Automatic geofence / background GPS polling removed to eliminate battery drain.
  // Check-in is handled via manual 1-tap Check In or Organizer QR Scan.
}

/**
 * useAutoCheckIn hook stub.
 * Automatic continuous background GPS polling has been disabled to eliminate battery drain.
 */
export function useAutoCheckIn() {
  // No active timers or background tasks.
}

