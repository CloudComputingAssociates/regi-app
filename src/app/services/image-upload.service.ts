// src/app/services/image-upload.service.ts
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';

interface ProductUploadResponse {
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
