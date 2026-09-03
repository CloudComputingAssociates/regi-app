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

/** What KIND of photo a capture command targets — extensible (a plain string so a
 *  new kind, e.g. a MealSet-studio image, doesn't need a code change to send). The
 *  phone routes the upload by this: meal→source=meal, food/mealset→source=user,
 *  avatar→the avatar endpoint. */
export type CaptureKind = 'meal' | 'food' | 'avatar' | 'mealset' | (string & {});

/** Generic capture target — replaces the meal-only `mealId`. `name` is display-only:
 *  the phone shows it on the shutter screen ("Take a photo — {name}"). `id` is the
 *  entity id (null for avatar, which is keyed off the user). */
export interface CaptureTarget {
  kind: CaptureKind;
  id: number | null;
  name: string;
}

/** Legacy command discriminator (still sent for meal/avatar back-compat). */
export type TetherCommandType = 'captureMeal' | 'captureFood' | 'captureAvatar' | 'captureMealset' | 'capture';

/** POST /api/tether/device/{deviceId}/command body. Prefer the generic `capture`
 *  target; `mealId` is kept ONLY so the current (pre-generic) API/phone still resolve
 *  a meal capture during rollout. `ttlSeconds` omitted → the server default (300s).
 *  The command is DURABLE for ttlSeconds regardless of whether the phone is connected
 *  — issue optimistically; there is no "device not live" rejection. */
export interface TetherCommandRequest {
  type: TetherCommandType;
  mealId?: number | null; // legacy back-compat (kind === 'meal' only)
  capture?: CaptureTarget;
  ttlSeconds?: number | null;
}

/** 202 response to a command POST — the messageId to match against the results
 *  poll (this is the ONLY handle back to the eventual result). */
export interface TetherCommandResponse {
  messageId: string;
}

/** One completed command from GET /api/tether/results. `result` is the opaque
 *  body the phone supplied (e.g. an image ref); absent on failure. `kind`/`mealId`
 *  echo the target so the web routes its refresh (we match on our own outstanding
 *  map by messageId, so these are advisory). */
export interface TetherResult {
  messageId: string;
  deviceId?: number | null;
  kind?: CaptureKind;
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
