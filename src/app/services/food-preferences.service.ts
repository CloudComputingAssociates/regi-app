// src/app/services/food-preferences.service.ts
// Service for managing user food preferences (likes/dislikes)
// API: /user/preferences/food/*
import { Injectable, inject, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap, of, map, switchMap } from 'rxjs';
import { environment } from '../../environments/environment';
import {
  GetFoodPreferencesResponse,
  FoodPreferenceItem,
  FoodPreferenceList,
  CreateFoodPreferenceRequest,
  CreateFoodPreferencesRequest,
  CreateFoodPreferencesResponse,
  DeleteFoodPreferencesRequest,
} from '../models/generated/food-preferences.schema';

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

        // Initialize local state to match server
        this.localAllowedFoods.set(new Set(allowedMap.keys()));
        this.localRestrictedFoods.set(new Set(restrictedMap.keys()));

        // Clear any pending changes
        this.pendingChanges.set(new Map());
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
  toggleFavoriteLocal(foodId: number): void {
    console.log('[FoodPreferencesService] toggleFavoriteLocal called with foodId:', foodId);
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
        // Was saved on server, need to delete
        changes.set(foodId, { foodId, type: 'remove', originalPreferenceId: serverAllowedPrefId });
      } else {
        // Was only local (pending add), just remove the pending change
        changes.delete(foodId);
      }
    } else {
      // Not allowed -> make it allowed
      localAllowed.add(foodId);

      // If it was restricted, remove from restricted
      if (wasRestricted) {
        localRestricted.delete(foodId);
      }

      // Track the change
      if (serverAllowedPrefId) {
        // Already saved as allowed on server, no change needed
        changes.delete(foodId);
      } else if (serverRestrictedPrefId) {
        // Was restricted on server, need to delete that and add allowed
        // For simplicity, we'll handle this as add-allowed (server will handle conflict)
        changes.set(foodId, { foodId, type: 'add-allowed', originalPreferenceId: serverRestrictedPrefId });
      } else {
        // New preference
        changes.set(foodId, { foodId, type: 'add-allowed' });
      }
    }

    this.localAllowedFoods.set(localAllowed);
    this.localRestrictedFoods.set(localRestricted);
    this.pendingChanges.set(changes);
    console.log('[FoodPreferencesService] After toggle - localAllowed:', [...this.localAllowedFoods()], 'pendingChanges:', [...this.pendingChanges().entries()]);
  }

  /**
   * Toggle restricted status locally (no API call)
   * Updates local state and tracks pending change
   */
  toggleRestrictedLocal(foodId: number): void {
    const localAllowed = new Set(this.localAllowedFoods());
    const localRestricted = new Set(this.localRestrictedFoods());
    const changes = new Map(this.pendingChanges());

    const wasAllowed = localAllowed.has(foodId);
    const wasRestricted = localRestricted.has(foodId);
    const serverAllowedPrefId = this.serverAllowedFoods().get(foodId);
    const serverRestrictedPrefId = this.serverRestrictedFoods().get(foodId);

    if (wasRestricted) {
      // Currently restricted -> remove it
      localRestricted.delete(foodId);

      if (serverRestrictedPrefId) {
        // Was saved on server, need to delete
        changes.set(foodId, { foodId, type: 'remove', originalPreferenceId: serverRestrictedPrefId });
      } else {
        // Was only local (pending add), just remove the pending change
        changes.delete(foodId);
      }
    } else {
      // Not restricted -> make it restricted
      localRestricted.add(foodId);

      // If it was allowed, remove from allowed
      if (wasAllowed) {
        localAllowed.delete(foodId);
      }

      // Track the change
      if (serverRestrictedPrefId) {
        // Already saved as restricted on server, no change needed
        changes.delete(foodId);
      } else if (serverAllowedPrefId) {
        // Was allowed on server, need to delete that and add restricted
        changes.set(foodId, { foodId, type: 'add-restricted', originalPreferenceId: serverAllowedPrefId });
      } else {
        // New preference
        changes.set(foodId, { foodId, type: 'add-restricted' });
      }
    }

    this.localAllowedFoods.set(localAllowed);
    this.localRestrictedFoods.set(localRestricted);
    this.pendingChanges.set(changes);
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
        // Add or flip to allowed - API will upsert
        toUpsert.push({ foodId: change.foodId, allowed: true });
      } else if (change.type === 'add-restricted') {
        // Add or flip to restricted - API will upsert
        toUpsert.push({ foodId: change.foodId, allowed: false });
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
}
