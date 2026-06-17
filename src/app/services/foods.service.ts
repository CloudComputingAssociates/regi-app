// src/app/services/foods.service.ts
import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, firstValueFrom } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import { Food, FoodSearchResponse } from '../models/food.model';

// Raw shape returned by the AllFoods-view endpoints (e.g. /api/lists/{name}/items).
// Differs from FoodSchema in two ways: the id key is `foodId`, and nutrition
// fields are flattened to the root instead of nested under `nutritionFacts`.
interface AllFoodRow {
  foodId: number;
  foodSource?: string;
  description: string;
  shortDescription?: string;
  categoryId?: number;
  categoryName?: string;
  dataSource?: string;
  servingSizeMultiplicand?: number;
  servingUnit?: string;
  servingGramsPerUnit?: number;
  glycemicIndex?: number;
  glycemicLoad?: number;
  foodImage?: string;
  foodImageThumbnail?: string;
  nutritionFactsImage?: string;
  yehApproved?: boolean;
  calories?: number;
  proteinG?: number;
  totalFatG?: number;
  saturatedFatG?: number;
  totalCarbohydrateG?: number;
  dietaryFiberG?: number;
  sodiumMG?: number;
  transFatG?: number;
  cholesterolMG?: number;
  totalSugarsG?: number;
  addedSugarsG?: number;
  vitaminDMcg?: number;
  calciumMG?: number;
  ironMG?: number;
  potassiumMG?: number;
  servingSizeG?: number;
  servingSizeHousehold?: string;
  productPurchaseLink?: string;
}

export interface Category {
  id: number;
  name: string;
  description?: string;
  sortOrder: number;
}

export interface FoodList {
  name: string;
  description: string;
  toolTip?: string;
  assigned?: boolean;
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

  // All curated lists (for the dropdown). Optional foodId adds an `assigned`
  // flag per list — not needed here, used by the detail-panel work.
  getLists(foodId?: number, foodSource: string = 'usda'): Observable<{ lists: FoodList[]; count: number }> {
    let url = `${this.baseUrl}/lists`;
    if (foodId != null) {
      url += `?foodId=${foodId}&foodSource=${foodSource}`;
    }
    return this.http.get<{ lists: FoodList[]; count: number }>(url);
  }

  // Hydrated foods in a list. The server returns AllFoodRow shape (foodId,
  // flat macros) rather than the FoodSchema shape (id, nested
  // nutritionFacts) — without remapping, `food.id` is undefined for every
  // row, which silently breaks isAllowed(food.id), drag-drop, selection,
  // and every other downstream lookup. Remap to the FoodSchema shape so
  // callers can treat list items identically to /foods/search results.
  getListItems(name: string): Observable<FoodSearchResponse> {
    return this.http.get<{ foods: AllFoodRow[]; count: number }>(
      `${this.baseUrl}/lists/${encodeURIComponent(name)}/items`,
    ).pipe(
      map(resp => ({
        foods: (resp?.foods ?? []).map(row => FoodsService.allFoodRowToFood(row)),
        count: resp?.count ?? 0,
      } as FoodSearchResponse)),
    );
  }

  /** Map an AllFoodRow (the view-endpoint shape) to the Food (FoodSchema)
   *  shape the UI expects. Static so other services / tests can reuse it. */
  static allFoodRowToFood(row: AllFoodRow): Food {
    return {
      id: row.foodId,
      description: row.description,
      shortDescription: row.shortDescription,
      categoryName: row.categoryName,
      foodRequestType: 'unknown',
      foodSource: row.foodSource === 'user' ? 'user' : 'usda',
      dataSource: row.dataSource ?? (row.foodSource === 'user' ? 'user' : 'USDA-FNDDS'),
      yehApproved: row.yehApproved ?? false,
      glycemicIndex: row.glycemicIndex ?? 0,
      glycemicLoad: row.glycemicLoad,
      servingSizeMultiplicand: row.servingSizeMultiplicand ?? 1,
      servingUnit: row.servingUnit,
      servingGramsPerUnit: row.servingGramsPerUnit,
      foodImage: row.foodImage,
      foodImageThumbnail: row.foodImageThumbnail,
      nutritionFactsImage: row.nutritionFactsImage,
      verifiedType: 'unknown',
      verifiedBy: '',
      duplicateCount: 0,
      productPurchaseLink: row.productPurchaseLink,
      nutritionFacts: {
        calories: row.calories ?? 0,
        proteinG: row.proteinG ?? 0,
        totalFatG: row.totalFatG ?? 0,
        saturatedFatG: row.saturatedFatG ?? 0,
        transFatG: row.transFatG ?? 0,
        cholesterolMG: row.cholesterolMG ?? 0,
        totalCarbohydrateG: row.totalCarbohydrateG ?? 0,
        dietaryFiberG: row.dietaryFiberG ?? 0,
        totalSugarsG: row.totalSugarsG ?? 0,
        addedSugarsG: row.addedSugarsG,
        sodiumMG: row.sodiumMG ?? 0,
        vitaminDMcg: row.vitaminDMcg ?? 0,
        calciumMG: row.calciumMG ?? 0,
        ironMG: row.ironMG ?? 0,
        potassiumMG: row.potassiumMG ?? 0,
        servingSizeG: row.servingSizeG ?? 0,
        servingSizeHousehold: row.servingSizeHousehold ?? '',
      },
    };
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
