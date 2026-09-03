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

/** Command discriminator sent to a device. */
export type TetherCommandType = 'captureMeal' | 'captureAvatar';

/** POST /api/tether/device/{deviceId}/command body. `mealId` is required for
 *  captureMeal (the meal the phone's photo attaches to), omitted/null otherwise.
 *  `ttlSeconds` omitted → the server default (300s). The command is DURABLE for
 *  ttlSeconds regardless of whether the phone is currently connected — issue
 *  optimistically; there is no "device not live" rejection anymore. */
export interface TetherCommandRequest {
  type: TetherCommandType;
  mealId?: number | null;
  ttlSeconds?: number | null;
}

/** 202 response to a command POST — the messageId to match against the results
 *  poll (this is the ONLY handle back to the eventual result). */
export interface TetherCommandResponse {
  messageId: string;
}

/** One completed command from GET /api/tether/results. `result` is the opaque
 *  body the phone supplied (e.g. an image ref); absent on failure. */
export interface TetherResult {
  messageId: string;
  deviceId?: number | null;
  mealId?: number | null;
  status: 'done' | 'failed';
  result?: unknown;
}

/** GET /api/tether/results — AT-MOST-ONCE per-user cursor: each result is returned
 *  exactly once, then the server advances the cursor (don't expect to re-fetch). */
export interface TetherResultsResponse {
  results: TetherResult[];
  pollIntervalSeconds: number;
}
