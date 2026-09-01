// src/app/models/tether.models.ts
//
// Hand-transcribed from schemas/tether.schema.json (regi-api). The web side
// hand-maintains these TS models (same convention as the Dart/Go sides) — keep
// in sync with the schema; do not invent fields. This session consumes the
// /tether/presence response only.

/** A registered phone/device and its live-presence state. */
export interface TetherDevice {
  deviceId: number;
  deviceName: string;
  platform: string;
  live: boolean;
  lastSeenUtc: string | null;
}

/** Response of GET /tether/presence — whether the user has any registered
 *  device, whether any is currently live, the per-device list, and the
 *  server-authored poll cadence the client should honor after the first hit. */
export interface TetherPresenceResponse {
  registered: boolean;
  anyLive: boolean;
  devices: TetherDevice[];
  pollIntervalSeconds: number;
}

/** Discriminator for a queued mobile command. */
export type MobileCommandType = 'camera.captureMeal' | 'camera.captureAvatar';

/** POST /api/mobile/command body — the web app ENQUEUES a camera command for the
 *  caller's live phone. User-scoped (no deviceId in the path): the API routes it
 *  to the user's live device and answers 202 Accepted, or 409 when presence went
 *  stale and no device is live. `payload.mealId` rides only on camera.captureMeal
 *  (the meal the phone's photo attaches to); camera.captureAvatar omits payload.
 *  NOTE: this endpoint is part of the pending mobile-capture handoff — until the
 *  regi-api /mobile/command route deploys, these POSTs 404 and the callers surface
 *  a "try again" message. Keep in sync with the API's mobile-command schema. */
export interface MobileCommandRequest {
  type: MobileCommandType;
  payload?: { mealId: number };
}
