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

// ---- OFF product-image proxy (GET /api/foods/off-image?name=…) ------------
// HAND-MAINTAINED, transcribed from the Go handler in regi-api/api/foods.go
// (writeJSON {"imageUrl": OFFImageByName(name)}) — no schemas/*.json for this
// surface, same precedent as the DTOs above. Server-side proxy so the browser
// never hits Open Food Facts directly (CORS + rate-limit): regi-api queries OFF
// with a proper User-Agent + 24h cache and returns a single front-image URL.
// `imageUrl` is '' on any miss/error/timeout — never a client-facing error.
export interface OffImageResponse {
  imageUrl: string;
}
