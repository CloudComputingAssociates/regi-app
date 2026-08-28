// src/app/models/image-url.model.ts
//
// GET /api/image/url response DTO — HAND-MAINTAINED. Transcribed from the Go
// handler getImageURLHandler in regi-api/api/image.go (the Swagger @Success line:
// object{description, product_image_url, nutrition_facts_image_url,
// nutrition_facts_pending_url}). There is NO schemas/*.json for the image surface
// (it was ported from the old regi-image service), so this mirrors the handler
// directly — same precedent as fatsecret.model.ts.
//
// The endpoint looks up any existing CDN image URLs for a food by (fuzzy)
// description — used to SUGGEST a public/product photo for a just-added food.
// Fields are '' when nothing matched. Snake_case is the wire shape.

export interface ImageUrlLookupResponse {
  description: string;
  product_image_url: string;
  nutrition_facts_image_url: string;
  nutrition_facts_pending_url: string;
}

// ---- Open Food Facts (world.openfoodfacts.org) search --------------------
// Best-effort public product search used to SUGGEST a photo by NAME when our own
// CDN has none (regi-api only enriches from OFF by GTIN/barcode, so a name-add
// with no barcode never gets an OFF photo server-side). Public, CORS-enabled, no
// auth. Only the fields we request are populated; the rest of OFF's large shape
// is intentionally omitted.
export interface OpenFoodFactsProduct {
  product_name?: string;
  image_front_url?: string;
  image_url?: string;
}

export interface OpenFoodFactsSearchResponse {
  count: number;
  page: number;
  products: OpenFoodFactsProduct[];
}
