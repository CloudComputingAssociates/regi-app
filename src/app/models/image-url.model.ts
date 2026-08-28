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
