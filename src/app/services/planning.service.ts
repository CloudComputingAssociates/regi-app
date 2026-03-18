// src/app/services/planning.service.ts
import { Injectable, inject, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import {
  Meal,
  MealItem,
  MealSummary,
  GenerateMealRequest,
  UpdateMealRequest,
  ListMealsRequest
} from '../models/planning.model';

@Injectable({
  providedIn: 'root'
})
export class PlanningService {
  private http = inject(HttpClient);
  private baseUrl = environment.apiUrl;

  // Current meal state
  private currentMealSignal = signal<Meal | null>(null);
  private loadingSignal = signal(false);
  private errorSignal = signal<string | null>(null);

  // Stubbed prompt for first pass (will come from PromptMe chat later)
  private readonly STUBBED_PROMPT = 'I want a meal with dark chicken, eggs, cottage cheese and ground beef plus vegetables and pecorino romano cheese 1 oz';

  // Public accessors
  readonly currentMeal = this.currentMealSignal.asReadonly();
  readonly loading = this.loadingSignal.asReadonly();
  readonly error = this.errorSignal.asReadonly();

  // Computed values
  readonly mealItems = computed(() => {
    const items = this.currentMealSignal()?.items ?? [];
    return [...items].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  });
  readonly mealName = computed(() => this.currentMealSignal()?.name ?? '');
  readonly isFavorite = computed(() => this.currentMealSignal()?.isFavorite ?? false);
  readonly hasMeal = computed(() => this.currentMealSignal() !== null);

  // Legacy aliases for backward compat during transition
  readonly currentPlan = this.currentMeal;
  readonly planItems = this.mealItems;
  readonly planName = this.mealName;
  readonly hasPlan = this.hasMeal;

  /**
   * Generate a new standalone meal via AI
   */
  async generateMeal(name?: string): Promise<Meal> {
    this.loadingSignal.set(true);
    this.errorSignal.set(null);

    const request: GenerateMealRequest = {
      promptGist: this.STUBBED_PROMPT,
      ...(name ? { name } : {})
    };

    try {
      const meal = await firstValueFrom(
        this.http.post<Meal>(`${this.baseUrl}/meal/generate`, request)
      );
      this.currentMealSignal.set(meal);
      return meal;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to generate meal';
      this.errorSignal.set(message);
      throw err;
    } finally {
      this.loadingSignal.set(false);
    }
  }

  /**
   * Create an empty meal with a name
   */
  async createMeal(name: string): Promise<Meal> {
    this.loadingSignal.set(true);
    this.errorSignal.set(null);

    try {
      const meal = await firstValueFrom(
        this.http.post<Meal>(`${this.baseUrl}/meal/create`, { name })
      );
      this.currentMealSignal.set(meal);
      return meal;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create meal';
      this.errorSignal.set(message);
      throw err;
    } finally {
      this.loadingSignal.set(false);
    }
  }

  /**
   * Get a meal by ID
   */
  async getMeal(mealId: number): Promise<Meal> {
    this.loadingSignal.set(true);
    this.errorSignal.set(null);

    try {
      const meal = await firstValueFrom(
        this.http.get<Meal>(`${this.baseUrl}/meal/${mealId}`)
      );
      this.currentMealSignal.set(meal);
      return meal;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load meal';
      this.errorSignal.set(message);
      throw err;
    } finally {
      this.loadingSignal.set(false);
    }
  }

  /**
   * Update meal (name, favorite status, items)
   */
  async updateMeal(mealId: number, updates: UpdateMealRequest): Promise<Meal> {
    this.loadingSignal.set(true);
    this.errorSignal.set(null);

    try {
      const meal = await firstValueFrom(
        this.http.put<Meal>(`${this.baseUrl}/meal/${mealId}`, updates)
      );
      this.currentMealSignal.set(meal);
      return meal;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update meal';
      this.errorSignal.set(message);
      throw err;
    } finally {
      this.loadingSignal.set(false);
    }
  }

  /**
   * Toggle favorite status
   */
  async toggleFavorite(): Promise<void> {
    const meal = this.currentMealSignal();
    if (!meal) return;

    await this.updateMeal(meal.id, { isFavorite: !meal.isFavorite });
  }

  /**
   * Add a meal item locally to the current meal
   */
  addItem(item: Omit<MealItem, 'id' | 'sortOrder'>): void {
    const meal = this.currentMealSignal();
    if (!meal) return;

    const items = meal.items ?? [];
    const maxSort = items.reduce((max, i) => Math.max(max, i.sortOrder ?? 0), 0);
    const newItem: MealItem = {
      ...item,
      sortOrder: maxSort + 1,
    };

    const updatedItems = [...items, newItem];

    // Recalculate totals
    const totalCalories = updatedItems.reduce((sum, i) => sum + (i.calories ?? 0), 0);
    const totalProteinG = updatedItems.reduce((sum, i) => sum + (i.proteinG ?? 0), 0);
    const totalFatG = updatedItems.reduce((sum, i) => sum + (i.fatG ?? 0), 0);
    const totalCarbG = updatedItems.reduce((sum, i) => sum + (i.carbG ?? 0), 0);
    const totalFiberG = updatedItems.reduce((sum, i) => sum + (i.fiberG ?? 0), 0);
    const totalSodiumMg = updatedItems.reduce((sum, i) => sum + (i.sodiumMg ?? 0), 0);

    this.currentMealSignal.set({
      ...meal,
      items: updatedItems,
      totalCalories,
      totalProteinG,
      totalFatG,
      totalCarbG,
      totalFiberG,
      totalSodiumMg,
    });
  }

  /**
   * Update a meal item locally by index
   */
  updateItem(index: number, updates: Partial<MealItem>): void {
    const meal = this.currentMealSignal();
    if (!meal) return;

    const sorted = [...meal.items].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    if (index < 0 || index >= sorted.length) return;

    const targetId = sorted[index].id;
    const updatedItems = meal.items.map(item =>
      item.id === targetId ? { ...item, ...updates } : item
    );

    const totalCalories = updatedItems.reduce((sum, i) => sum + (i.calories ?? 0), 0);
    const totalProteinG = updatedItems.reduce((sum, i) => sum + (i.proteinG ?? 0), 0);
    const totalFatG = updatedItems.reduce((sum, i) => sum + (i.fatG ?? 0), 0);
    const totalCarbG = updatedItems.reduce((sum, i) => sum + (i.carbG ?? 0), 0);
    const totalFiberG = updatedItems.reduce((sum, i) => sum + (i.fiberG ?? 0), 0);
    const totalSodiumMg = updatedItems.reduce((sum, i) => sum + (i.sodiumMg ?? 0), 0);

    this.currentMealSignal.set({
      ...meal,
      items: updatedItems,
      totalCalories,
      totalProteinG,
      totalFatG,
      totalCarbG,
      totalFiberG,
      totalSodiumMg,
    });
  }

  /**
   * Delete a meal item by sorted index
   */
  deleteItemByIndex(index: number): void {
    const meal = this.currentMealSignal();
    if (!meal) return;

    const sorted = [...(meal.items ?? [])].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    if (index < 0 || index >= sorted.length) return;

    const target = sorted[index];
    const updatedItems = meal.items.filter(item => item !== target);
    this.currentMealSignal.set({
      ...meal,
      items: updatedItems
    });
  }

  /**
   * List meals with filters
   */
  listMeals(params?: ListMealsRequest): Observable<MealSummary[]> {
    const queryParams = new URLSearchParams();
    if (params?.planType) queryParams.set('planType', params.planType);
    if (params?.status) queryParams.set('status', params.status);
    if (params?.isFavorite !== undefined) queryParams.set('isFavorite', String(params.isFavorite));
    if (params?.includeYeh !== undefined) queryParams.set('includeYeh', String(params.includeYeh));
    if (params?.limit) queryParams.set('limit', String(params.limit));
    if (params?.offset) queryParams.set('offset', String(params.offset));

    const url = `${this.baseUrl}/meal?${queryParams.toString()}`;
    return this.http.get<MealSummary[]>(url);
  }

  /**
   * Delete a meal plan permanently
   */
  async deleteMeal(mealId: number): Promise<void> {
    await firstValueFrom(
      this.http.delete(`${this.baseUrl}/meal/${mealId}`)
    );
    this.currentMealSignal.set(null);
  }

  /**
   * Clear current meal
   */
  clearMeal(): void {
    this.currentMealSignal.set(null);
    this.errorSignal.set(null);
  }

  // Legacy aliases
  async generatePlan(): Promise<Meal> { return this.generateMeal(); }
  async getPlan(id: number): Promise<Meal> { return this.getMeal(id); }
  async updatePlan(id: number, updates: UpdateMealRequest): Promise<Meal> { return this.updateMeal(id, updates); }
  clearPlan(): void { this.clearMeal(); }
}
