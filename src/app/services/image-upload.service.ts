// src/app/services/image-upload.service.ts
import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { ImageUrlLookupResponse } from '../models/image-url.model';

export interface ProductUploadResponse {
  success: boolean;
  cdn_url: string;
  thumbnail_url: string;
  food_id: number;
}

/** POST /api/image/upload/avatar response — keyed off the JWT user, so no food_id. */
export interface AvatarUploadResponse {
  success: boolean;
  cdn_url: string;
  thumbnail_url: string;
}

interface NutritionUploadResponse {
  success: boolean;
  cdn_url: string;
  description: string;
  status: string;
}

@Injectable({
  providedIn: 'root'
})
export class ImageUploadService {
  private http = inject(HttpClient);
  private imageApiUrl = environment.imageApiUrl;

  /** GET /api/image/url?description= — look up an existing CDN product photo for
   *  a food by (fuzzy) description. Used by the Add-Food panel to SUGGEST a photo
   *  for a just-added food that has none. Fields are '' when nothing matched. */
  async lookupImageUrl(description: string): Promise<ImageUrlLookupResponse> {
    const params = new HttpParams().set('description', description);
    return firstValueFrom(
      this.http.get<ImageUrlLookupResponse>(
        `${this.imageApiUrl}/api/image/url`,
        { params },
      ),
    );
  }

  /** Photo SUGGESTION by name from Open Food Facts — DISABLED in the browser.
   *
   *  The legacy cgi/search.pl sends NO Access-Control-Allow-Origin and OFF
   *  rate-limits (~10 req/min/IP); both surface as CORS console errors, and the
   *  image_urls it returns are hotlink-blocked (net::ERR_FAILED in <img>). Photo
   *  suggestion is enrichment, never a dependency, so we degrade to "no
   *  suggestion" rather than spray the console with doomed cross-origin calls.
   *
   *  Re-enable by moving OFF server-side behind a regi-api endpoint (proper
   *  User-Agent + response caching), then call THAT here. Until then this is a
   *  no-op that returns '' without touching the network. */
  async searchOpenFoodFactsImage(_description: string): Promise<string> {
    return '';
  }

  /** POST /api/image/upload/avatar — set the authenticated user's avatar (keyed
   *  by the JWT, no id in the body). Returns the CDN + thumbnail urls. NOTE: this
   *  endpoint is part of the pending avatar handoff; until it deploys the call
   *  404s and callers fall back to a local preview. */
  async uploadUserAvatar(image: File): Promise<AvatarUploadResponse> {
    const formData = new FormData();
    formData.append('source', 'user');
    formData.append('image', image);

    return firstValueFrom(
      this.http.post<AvatarUploadResponse>(
        `${this.imageApiUrl}/api/image/upload/avatar`,
        formData,
      ),
    );
  }

  async uploadProductImage(foodId: number, image: File): Promise<ProductUploadResponse> {
    const formData = new FormData();
    formData.append('foodId', foodId.toString());
    formData.append('source', 'user');
    formData.append('image', image);

    return firstValueFrom(
      this.http.post<ProductUploadResponse>(
        `${this.imageApiUrl}/api/image/upload/product`,
        formData
      )
    );
  }

  async uploadMealImage(mealId: number, image: File): Promise<ProductUploadResponse> {
    const formData = new FormData();
    formData.append('foodId', mealId.toString());
    formData.append('source', 'meal');
    formData.append('image', image);

    return firstValueFrom(
      this.http.post<ProductUploadResponse>(
        `${this.imageApiUrl}/api/image/upload/product`,
        formData
      )
    );
  }

  async uploadNutritionImage(
    foodId: number,
    nutritionImage: File,
    ingredientsImage?: File
  ): Promise<NutritionUploadResponse> {
    const formData = new FormData();
    formData.append('foodId', foodId.toString());
    formData.append('source', 'user');
    formData.append('nutritionImage', nutritionImage);

    if (ingredientsImage) {
      formData.append('ingredientsImage', ingredientsImage);
    }

    return firstValueFrom(
      this.http.post<NutritionUploadResponse>(
        `${this.imageApiUrl}/api/image/upload/nutrition`,
        formData
      )
    );
  }
}
