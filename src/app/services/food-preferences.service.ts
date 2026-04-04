// src/app/services/food-preferences.service.ts
// Service for managing user food preferences (likes/dislikes)
// API: /user/preferences/food/*
import { Injectable, inject, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap, of, map, switchMap } from 'rxjs';
import { environment } from '../../environments/environment';
import { Food } from '../models/food.model';
import {
  GetFoodPreferencesResponse,
  FoodPreferenceItem,
  FoodPreferenceList,
  CreateFoodPreferenceRequest,
  CreateFoodPreferencesRequest,
  CreateFoodPreferencesResponse,
  DeleteFoodPreferencesRequest,
} from '../models/generated/food-preferences.schema';

/** Shape returned by /allowed/foods and /restricted/foods endpoints */
interface AllFoodRow {
  foodId: number;
  foodSource: string;
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
  yehApproved: boolean;
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

interface AllFoodsResponse {
  foods: AllFoodRow[];
  count: number;
}

// Re-export generated types for consumers
export type {
  GetFoodPreferencesResponse,
  FoodPreferenceItem,
  FoodPreferenceList,
  CreateFoodPreferenceRequest,
  CreateFoodPreferencesRequest,
  CreateFoodPreferencesResponse,
  DeleteFoodPreferencesRequest,
};

// Type aliases for backward compatibility
export type FoodPreference = FoodPreferenceItem;
export type FoodPreferencesResponse = GetFoodPreferencesResponse;
export type AllowedRestrictedResponse = FoodPreferenceList;
export type CreateFoodPreferenceItem = CreateFoodPreferenceRequest;
export type CreateFoodPreferenceResponse = CreateFoodPreferencesResponse;

// Pending change types
export type PendingChangeType = 'add-allowed' | 'add-restricted' | 'remove';

export interface PendingChange {
  foodId: number;
  type: PendingChangeType;
  foodSource?: string; // 'usda' or 'user'
  originalPreferenceId?: number; // For removals, we need to know what to delete
}

@Injectable({
  providedIn: 'root'
})
export class FoodPreferencesService {
  private http = inject(HttpClient);
  private baseUrl = environment.apiUrl;

  // Server state - what's saved in the database (maps foodId to preferenceId)
  private serverAllowedFoods = signal<Map<number, number>>(new Map());
  private serverRestrictedFoods = signal<Map<number, number>>(new Map());

  // Local state - reflects UI including unsaved changes (just foodId sets)
  private localAllowedFoods = signal<Set<number>>(new Set());
  private localRestrictedFoods = signal<Set<number>>(new Set());

  // Pending changes to be saved
  private pendingChanges = signal<Map<number, PendingChange>>(new Map());

  // Computed: has unsaved changes
  hasUnsavedChanges = computed(() => this.pendingChanges().size > 0);

  // Debounced auto-save
  private autoSaveTimer: ReturnType<typeof setTimeout> | null = null;
  private isSaving = false;

  private scheduleAutoSave(): void {
    if (this.autoSaveTimer) {
      clearTimeout(this.autoSaveTimer);
    }
    this.autoSaveTimer = setTimeout(() => {
      this.autoSaveTimer = null;
      if (this.isSaving || !this.hasUnsavedChanges()) return;
      this.isSaving = true;
      this.saveAllChanges().subscribe({
        next: () => { this.isSaving = false; },
        error: () => { this.isSaving = false; }
      });
    }, 500);
  }

  // Expose local state for UI (what the icons should show)
  isAllowed(foodId: number): boolean {
    return this.localAllowedFoods().has(foodId);
  }

  isRestricted(foodId: number): boolean {
    return this.localRestrictedFoods().has(foodId);
  }

  // Getters for filtering (returns Sets of foodIds)
  allowedFoods(): Set<number> {
    return this.localAllowedFoods();
  }

  restrictedFoods(): Set<number> {
    return this.localRestrictedFoods();
  }

  /**
   * Get all user food preferences (allowed and restricted) and initialize local state
   */
  getAllPreferences(): Observable<FoodPreferencesResponse> {
    return this.http.get<FoodPreferencesResponse>(`${this.baseUrl}/user/preferences/food`).pipe(
      tap(response => {
        // Update server state
        const allowedMap = new Map<number, number>();
        const restrictedMap = new Map<number, number>();

        response.allowed.foods.forEach(f => { if (f.foodId != null) allowedMap.set(f.foodId, f.preferenceId); });
        response.restricted.foods.forEach(f => { if (f.foodId != null) restrictedMap.set(f.foodId, f.preferenceId); });

        this.serverAllowedFoods.set(allowedMap);
        this.serverRestrictedFoods.set(restrictedMap);

        // Merge server state with any pending local changes (user may have toggled icons
        // while this request was in flight — don't wipe those changes)
        const pending = this.pendingChanges();
        if (pending.size === 0) {
          // No pending changes — just sync local state to server
          this.localAllowedFoods.set(new Set(allowedMap.keys()));
          this.localRestrictedFoods.set(new Set(restrictedMap.keys()));
        } else {
          // Pending changes exist — rebuild local state from server + pending
          const localAllowed = new Set(allowedMap.keys());
          const localRestricted = new Set(restrictedMap.keys());
          for (const [foodId, change] of pending) {
            if (change.type === 'add-allowed') {
              localAllowed.add(foodId);
              localRestricted.delete(foodId);
            } else if (change.type === 'add-restricted') {
              localRestricted.add(foodId);
              localAllowed.delete(foodId);
            } else if (change.type === 'remove') {
              localAllowed.delete(foodId);
              localRestricted.delete(foodId);
            }
          }
          this.localAllowedFoods.set(localAllowed);
          this.localRestrictedFoods.set(localRestricted);
        }
      })
    );
  }

  /**
   * Get only allowed (favorite) food preferences
   */
  getAllowedPreferences(): Observable<AllowedRestrictedResponse> {
    return this.http.get<AllowedRestrictedResponse>(`${this.baseUrl}/user/preferences/food/allowed`).pipe(
      tap(response => {
        const allowedMap = new Map<number, number>();
        response.foods.forEach(f => { if (f.foodId != null) allowedMap.set(f.foodId, f.preferenceId); });
        this.serverAllowedFoods.set(allowedMap);
        this.localAllowedFoods.set(new Set(allowedMap.keys()));
      })
    );
  }

  /**
   * Get only restricted food preferences
   */
  getRestrictedPreferences(): Observable<AllowedRestrictedResponse> {
    return this.http.get<AllowedRestrictedResponse>(`${this.baseUrl}/user/preferences/food/restricted`).pipe(
      tap(response => {
        const restrictedMap = new Map<number, number>();
        response.foods.forEach(f => { if (f.foodId != null) restrictedMap.set(f.foodId, f.preferenceId); });
        this.serverRestrictedFoods.set(restrictedMap);
        this.localRestrictedFoods.set(new Set(restrictedMap.keys()));
      })
    );
  }

  /**
   * Toggle favorite status locally (no API call)
   * Updates local state and tracks pending change
   */
  toggleFavoriteLocal(foodId: number, foodSource?: string): void {
    const localAllowed = new Set(this.localAllowedFoods());
    const localRestricted = new Set(this.localRestrictedFoods());
    const changes = new Map(this.pendingChanges());
    console.log('[FoodPreferencesService] Current state - localAllowed:', [...localAllowed], 'localRestricted:', [...localRestricted], 'pendingChanges:', [...changes.entries()]);

    const wasAllowed = localAllowed.has(foodId);
    const wasRestricted = localRestricted.has(foodId);
    const serverAllowedPrefId = this.serverAllowedFoods().get(foodId);
    const serverRestrictedPrefId = this.serverRestrictedFoods().get(foodId);

    if (wasAllowed) {
      // Currently allowed -> remove it
      localAllowed.delete(foodId);

      if (serverAllowedPrefId) {
        changes.set(foodId, { foodId, type: 'remove', foodSource, originalPreferenceId: serverAllowedPrefId });
      } else {
        changes.delete(foodId);
      }
    } else {
      localAllowed.add(foodId);

      if (wasRestricted) {
        localRestricted.delete(foodId);
      }

      if (serverAllowedPrefId) {
        changes.delete(foodId);
      } else if (serverRestrictedPrefId) {
        changes.set(foodId, { foodId, type: 'add-allowed', foodSource, originalPreferenceId: serverRestrictedPrefId });
      } else {
        changes.set(foodId, { foodId, type: 'add-allowed', foodSource });
      }
    }

    this.localAllowedFoods.set(localAllowed);
    this.localRestrictedFoods.set(localRestricted);
    this.pendingChanges.set(changes);
    this.scheduleAutoSave();
  }

  /**
   * Toggle restricted status locally
   * Updates local state, tracks pending change, and auto-saves
   */
  toggleRestrictedLocal(foodId: number, foodSource?: string): void {
    const localAllowed = new Set(this.localAllowedFoods());
    const localRestricted = new Set(this.localRestrictedFoods());
    const changes = new Map(this.pendingChanges());

    const wasAllowed = localAllowed.has(foodId);
    const wasRestricted = localRestricted.has(foodId);
    const serverAllowedPrefId = this.serverAllowedFoods().get(foodId);
    const serverRestrictedPrefId = this.serverRestrictedFoods().get(foodId);

    if (wasRestricted) {
      localRestricted.delete(foodId);

      if (serverRestrictedPrefId) {
        changes.set(foodId, { foodId, type: 'remove', foodSource, originalPreferenceId: serverRestrictedPrefId });
      } else {
        changes.delete(foodId);
      }
    } else {
      localRestricted.add(foodId);

      if (wasAllowed) {
        localAllowed.delete(foodId);
      }

      if (serverRestrictedPrefId) {
        changes.delete(foodId);
      } else if (serverAllowedPrefId) {
        changes.set(foodId, { foodId, type: 'add-restricted', foodSource, originalPreferenceId: serverAllowedPrefId });
      } else {
        changes.set(foodId, { foodId, type: 'add-restricted', foodSource });
      }
    }

    this.localAllowedFoods.set(localAllowed);
    this.localRestrictedFoods.set(localRestricted);
    this.pendingChanges.set(changes);
    this.scheduleAutoSave();
  }

  /**
   * Save all pending changes to the server
   * Returns observable that completes when all changes are saved
   *
   * The API supports upsert via POST - it will insert or update based on foodId.
   * So for state flips (Allowed<->Restricted), we just POST with the new allowed value.
   * DELETE is only needed for actual removals (user removes preference entirely).
   */
  saveAllChanges(): Observable<void> {
    const changes = Array.from(this.pendingChanges().values());
    console.log('[FoodPreferencesService] saveAllChanges called, pending changes:', changes);

    if (changes.length === 0) {
      console.log('[FoodPreferencesService] No changes to save');
      return of(undefined);
    }

    // Separate into deletes and upserts
    // DELETE: only for 'remove' type (user wants to completely remove the preference)
    // UPSERT (POST): for add-allowed and add-restricted (API handles insert or update)
    const toDelete: number[] = [];
    const toUpsert: CreateFoodPreferenceItem[] = [];

    for (const change of changes) {
      if (change.type === 'remove') {
        // User wants to remove the preference entirely
        if (change.originalPreferenceId) {
          toDelete.push(change.originalPreferenceId);
        }
      } else if (change.type === 'add-allowed') {
        toUpsert.push({ foodId: change.foodId, allowed: true, foodSource: change.foodSource });
      } else if (change.type === 'add-restricted') {
        toUpsert.push({ foodId: change.foodId, allowed: false, foodSource: change.foodSource });
      }
    }

    console.log('[FoodPreferencesService] toDelete:', toDelete);
    console.log('[FoodPreferencesService] toUpsert:', toUpsert);

    // Chain operations: delete first (if any), then upsert (if any), then refresh
    let operation$: Observable<unknown> = of(null);

    // Bulk delete if needed (only for actual removals)
    if (toDelete.length > 0) {
      console.log('[FoodPreferencesService] Adding DELETE operation');
      // Note: trailing slash required for bulk delete endpoint
      operation$ = this.http.request<{ deleted: number }>('DELETE', `${this.baseUrl}/user/preferences/food/`, {
        body: { preferenceIds: toDelete }
      }).pipe(
        tap(res => console.log('[FoodPreferencesService] DELETE response:', res))
      );
    }

    // Bulk upsert if needed (chain after delete)
    if (toUpsert.length > 0) {
      const requestBody = { items: toUpsert };
      console.log('[FoodPreferencesService] Adding POST (upsert) operation, request body:', JSON.stringify(requestBody));
      operation$ = operation$.pipe(
        switchMap(() => this.http.post<CreateFoodPreferenceResponse>(`${this.baseUrl}/user/preferences/food`, requestBody).pipe(
          tap(res => console.log('[FoodPreferencesService] POST (upsert) response:', res))
        ))
      );
    }

    // Clear pending changes and refresh from server
    return operation$.pipe(
      tap(() => {
        console.log('[FoodPreferencesService] Operations complete, clearing pending changes');
        this.pendingChanges.set(new Map());
      }),
      // Refresh from server to get accurate preferenceIds
      switchMap(() => {
        console.log('[FoodPreferencesService] Refreshing from server');
        return this.getAllPreferences();
      }),
      tap(() => console.log('[FoodPreferencesService] Refresh complete')),
      // Map to void
      map(() => undefined)
    );
  }

  /**
   * Discard all pending changes and reset local state to match server
   */
  discardChanges(): void {
    this.localAllowedFoods.set(new Set(this.serverAllowedFoods().keys()));
    this.localRestrictedFoods.set(new Set(this.serverRestrictedFoods().keys()));
    this.pendingChanges.set(new Map());
  }

  /**
   * Clear all state (e.g., on logout)
   */
  clearAll(): void {
    this.serverAllowedFoods.set(new Map());
    this.serverRestrictedFoods.set(new Map());
    this.localAllowedFoods.set(new Set());
    this.localRestrictedFoods.set(new Set());
    this.pendingChanges.set(new Map());
  }

  /**
   * Get full Food objects for user's allowed (favorite) preferences via AllFoods view
   */
  getAllowedFoodsFull(): Observable<Food[]> {
    return this.http.get<AllFoodsResponse>(`${this.baseUrl}/user/preferences/food/allowed/foods`).pipe(
      map(response => (response.foods || []).map(row => this.allFoodRowToFood(row)))
    );
  }

  /**
   * Get full Food objects for user's restricted preferences via AllFoods view
   */
  getRestrictedFoodsFull(): Observable<Food[]> {
    return this.http.get<AllFoodsResponse>(`${this.baseUrl}/user/preferences/food/restricted/foods`).pipe(
      map(response => (response.foods || []).map(row => this.allFoodRowToFood(row)))
    );
  }

  /** Map an AllFoodRow from the view endpoint to a Food object the UI can display */
  private allFoodRowToFood(row: AllFoodRow): Food {
    return {
      id: row.foodId,
      description: row.description,
      shortDescription: row.shortDescription,
      categoryName: row.categoryName,
      foodRequestType: 'unknown',
      dataSource: row.dataSource ?? (row.foodSource === 'user' ? 'user' : 'USDA-FNDDS'),
      yehApproved: row.yehApproved,
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
}
