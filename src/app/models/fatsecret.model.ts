// src/app/models/fatsecret.model.ts
//
// FatSecret + UPC "add food" wire DTOs — HAND-MAINTAINED. Transcribed
// field-for-field from regi-api/models/fatsecret.go (hand-written Go DTOs; there
// is NO schemas/*.json for the FatSecret surface). The name-lookup flow mirrors
// the UPC scan: a slim candidate search (GET /api/userfoods/fatsecret-search),
// then create-by-id (POST /api/userfoods/from-fatsecret).
import { UserFood } from './user-food.model';

/**
 * Response of POST /api/userfoods/from-fatsecret (and the UPC scan): the resolved
 * UserFood plus create/dedup status. imageStatus is a hint for a follow-up
 * product photo ("" when already populated / disabled).
 */
export interface FoodAddResult {
  /** The resolved UserFood; null when none was produced. */
  food: UserFood | null;
  created: boolean;
  alreadyExisted: boolean;
  preferenceId: number;
  imageStatus?: string;
}

/**
 * One slim FatSecret search hit (GET /api/userfoods/fatsecret-search). Brand is
 * empty for generic foods; servingDescription/calories come from the default (or
 * first) serving inline; calories is null when the hit has no serving.
 */
export interface FatSecretCandidate {
  fatsecretFoodId: string;
  name: string;
  brand: string;
  servingDescription: string;
  calories?: string | null;
}

/** GET /api/userfoods/fatsecret-search response wrapper: { candidates: [...] }. */
export interface FatSecretCandidatesResponse {
  candidates: FatSecretCandidate[];
}

/**
 * POST /api/userfoods/barcode body — create a UserFood from a scanned UPC/GTIN.
 * upcCode required; userDescription/categoryId optional (category defaults to 9
 * "Processed" server-side). Response is FoodAddResult.
 */
export interface UpcLookupRequest {
  upcCode: string;
  userDescription?: string;
  categoryId?: number | null;
}

/**
 * POST /api/userfoods/from-fatsecret body — create a UserFood from a candidate.
 * fatsecretFoodId is required; the rest optional. Response is FoodAddResult.
 */
export interface FromFatSecretRequest {
  fatsecretFoodId: string;
  userDescription?: string;
  categoryId?: number | null;
}
