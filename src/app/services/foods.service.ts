// src/app/services/foods.service.ts
import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { FoodSearchResponse } from '../models/food.model';

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
