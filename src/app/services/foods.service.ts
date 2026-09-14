// src/app/services/foods.service.ts
import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, firstValueFrom } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import { Food, FoodSearchResponse } from '../models/food.model';
import {
  ServingGeometryPatchRequest,
  ServingGeometryPatchResponse,
} from '../models/serving-geometry.model';

export interface Category {
  id: number;
  name: string;
  description?: string;
  sortOrder: number;
}

@Injectable({
  providedIn: 'root'
})
export class FoodsService {
  private http = inject(HttpClient);
  private baseUrl = environment.apiUrl;

  /**
   * Search for foods by query string
   * @param query - Search term (food name/description)
   * @param limit - Maximum number of results to return (default: 50)
   * @returns Observable of search results with count and foods array
   */
  searchFoods(query: string, limit: number = 50): Observable<FoodSearchResponse> {
    const url = `${this.baseUrl}/foods/search?query=${encodeURIComponent(query)}&limit=${limit}`;
    return this.http.get<FoodSearchResponse>(url);
  }

  /**
   * Get all YEH-approved foods
   * @param limit - Maximum number of results to return (default: 50)
   * @returns Observable of search results with count and foods array
   */
  searchYehApprovedFoods(limit: number = 50): Observable<FoodSearchResponse> {
    const url = `${this.baseUrl}/foods/search/all/yehapproved?limit=${limit}`;
    return this.http.get<FoodSearchResponse>(url);
  }

  /** Query-capable Regi-approved search — the base /foods/search handler with the
   *  regiApproved filter (GET /api/foods/search?yehApproved=true&limit=…&query=…).
   *  Used by the Add-Food dialog's "Regi-approved" results section. */
  searchRegiApproved(query: string, limit: number = 8): Observable<FoodSearchResponse> {
    const url = `${this.baseUrl}/foods/search?yehApproved=true&limit=${limit}&query=${encodeURIComponent(query)}`;
    return this.http.get<FoodSearchResponse>(url);
  }

  /** PATCH /api/foods/serving-geometry — set/teach a food's portion geometry
   *  (unit + grams-per-unit + optional default quantity). A system food is
   *  CLONED to a UserFood first (response.cloned=true, userFoodId is the clone),
   *  a userfood is edited in place. Used by the Add-Food panel to ratify units. */
  patchServingGeometry(
    body: ServingGeometryPatchRequest,
  ): Observable<ServingGeometryPatchResponse> {
    return this.http.patch<ServingGeometryPatchResponse>(
      `${this.baseUrl}/foods/serving-geometry`,
      body,
    );
  }

  /** Kick off async AI image generation for a food. POST /foods/{id}/generate-image
   *  → 202 (regi-api emits the generation request; regi-image writes foodImage /
   *  foodImageThumbnail back later). Mirrors the meal generate-image contract; the
   *  caller polls the food until the image URL appears. NOTE: pending on regi-api —
   *  404s until that endpoint deploys. */
  generateFoodImage(foodId: number): Observable<void> {
    return this.http.post<void>(`${this.baseUrl}/foods/${foodId}/generate-image`, null);
  }

  /** Fetch a single canonical Food (Foods table) by id via GET /api/foods/{id}.
   *  This endpoint returns the nested FoodSchema shape directly (unlike the
   *  AllFoods-view endpoints, which return flat AllFoodRow), so no remap is
   *  needed — just stamp the foodSource discriminator. Used to resolve a meal
   *  item's full Food (per-100g values) when it isn't in the user's
   *  allowed-foods set (e.g. a generated-meal item that was never favorited). */
  getFoodById(id: number): Observable<Food> {
    return this.http.get<Food>(`${this.baseUrl}/foods/${id}`).pipe(
      map((food) => ({ ...food, foodSource: 'food' as const })),
    );
  }

  // Categories cache
  private categoriesSignal = signal<Category[]>([]);
  private categoriesLoaded = false;
  readonly categories = this.categoriesSignal.asReadonly();

  async loadCategories(): Promise<Category[]> {
    if (this.categoriesLoaded) return this.categoriesSignal();
    try {
      const cats = await firstValueFrom(
        this.http.get<Category[]>(`${this.baseUrl}/foods/categories`)
      );
      this.categoriesSignal.set(cats);
      this.categoriesLoaded = true;
      return cats;
    } catch {
      return [];
    }
  }

  /** Use AI to categorize a food name. Returns the matching Category or null. */
  async categorizeFood(foodName: string, categories: Category[]): Promise<Category | null> {
    if (!foodName || categories.length === 0) return null;

    const catList = categories.map(c => c.name).join(', ');
    try {
      const resp = await firstValueFrom(
        this.http.post<{ content: string }>(`${this.baseUrl}/ai`, {
          systemPrompt: `You are a food categorizer. Given a food name, respond with ONLY the category name from this list: ${catList}. No explanation, just the category name.`,
          userPrompt: `Categorize: "${foodName}"`,
          maxTokens: 20,
          temperature: 0
        })
      );
      const name = resp.content.trim();
      return categories.find(c => c.name.toLowerCase() === name.toLowerCase()) ?? null;
    } catch {
      return null;
    }
  }

  getCategoryName(categoryId: number | undefined | null): string | null {
    if (!categoryId) return null;
    const cat = this.categoriesSignal().find(c => c.id === categoryId);
    return cat?.name ?? null;
  }

  /**
   * Get image URL for a food image ObjectId
   * @param objectId - MongoDB ObjectId of the image
   * @returns Full URL to the image
   */
  getImageUrl(objectId: string): string {
    return `${this.baseUrl}/images/${objectId}`;
  }
}
