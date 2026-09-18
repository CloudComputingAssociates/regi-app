// src/app/models/tether.models.ts
//
// Hand-transcribed from schemas/tether.schema.json (regi-api). The web side
// hand-maintains these TS models (same convention as the Dart/Go sides) — keep
// in sync with the schema; do not invent fields.
//
// (see FoodAddResult import below).
//
// SCAN contract (kind 'scan' → command type 'scanBarcode'): id is null, name is
// display-only. On a 'done' result the phone returns a FoodAddResult in
// result.foodResult; on 'failed' it returns a result.reason
// ('notFound'|'cancelled'|'error'). These fields are OPTIONAL and additive — the
// image-capture kinds (meal/food/avatar/mealset) still carry only cdnUrl/thumbnailUrl.
import { FoodAddResult } from './fatsecret.model';

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

/** Command discriminator. `type` is a coarse hint; the `capture` target is authoritative. */
export type TetherCommandType = 'captureMeal' | 'captureFood' | 'captureAvatar' | 'captureMealset' | 'scanBarcode' | 'capture';

/** POST /api/tether/command body — USER-LEVEL: no deviceId. The API delivers the
 *  command to whichever of the user's phones is currently LIVE (gate the UI on
 *  presence.anyLive; the enqueue 409s if none is live). `ttlSeconds` omitted → the
 *  server default (300s). */
export interface TetherCommandRequest {
  type: TetherCommandType;
  capture: CaptureTarget;
  ttlSeconds?: number | null;
}

/** 202 response to a command POST — the messageId to match against the results
 *  poll (this is the ONLY handle back to the eventual result). */
export interface TetherCommandResponse {
  messageId: string;
}

/** The phone's result payload. Image-capture kinds carry the stored CDN URI (and
 *  thumbnail). The 'scan' kind instead carries the parsed food on success
 *  (foodResult) or a reason on failure — both optional/additive. */
export interface TetherCaptureResult {
  cdnUrl?: string;
  thumbnailUrl?: string;
  /** 'scan' kind, 'done' result — the created/resolved food. */
  foodResult?: FoodAddResult;
  /** 'scan' kind, 'failed' result — why the scan didn't produce a food. */
  reason?: 'notFound' | 'cancelled' | 'error';
}

/** One completed command from GET /api/tether/results. `deviceId` is WHICH of the
 *  user's phones did it (traceability); `kind`/`id` echo the target so the web routes
 *  its refresh (we also match on our own outstanding map by messageId). `result.cdnUrl`
 *  is the stored image URI — the receipt. */
export interface TetherResult {
  messageId: string;
  deviceId?: number | null;
  kind?: CaptureKind;
  id?: number | null;
  status: 'done' | 'failed';
  result?: TetherCaptureResult;
}

/** GET /api/tether/results — AT-MOST-ONCE per-user cursor: each result is returned
 *  exactly once, then the server advances the cursor (don't expect to re-fetch). */
export interface TetherResultsResponse {
  results: TetherResult[];
  pollIntervalSeconds: number;
}
