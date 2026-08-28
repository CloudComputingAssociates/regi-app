// src/app/services/image-upload.service.ts
import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import {
  ImageUrlLookupResponse,
  OpenFoodFactsSearchResponse,
} from '../models/image-url.model';

export interface ProductUploadResponse {
  success: boolean;
  cdn_url: string;
  thumbnail_url: string;
  food_id: number;
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

  /** Best-effort photo SUGGESTION by name from Open Food Facts (.org). Used when
   *  our own CDN has no image for a just-added food — regi-api only pulls OFF
   *  images by GTIN, so a name-add with no barcode never gets one server-side.
   *  Public + CORS-enabled + no auth. Returns the best front image URL, or ''. */
  async searchOpenFoodFactsImage(description: string): Promise<string> {
    const params = new HttpParams()
      .set('search_terms', description)
      .set('search_simple', '1')
      .set('action', 'process')
      .set('json', '1')
      .set('page_size', '5')
      .set('fields', 'product_name,image_front_url,image_url');
    try {
      const res = await firstValueFrom(
        this.http.get<OpenFoodFactsSearchResponse>(
          'https://world.openfoodfacts.org/cgi/search.pl',
          { params },
        ),
      );
      const hit = (res?.products ?? []).find((p) => p.image_front_url || p.image_url);
      return hit?.image_front_url || hit?.image_url || '';
    } catch {
      return '';
    }
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
