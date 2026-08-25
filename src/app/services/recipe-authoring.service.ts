// src/app/services/recipe-authoring.service.ts
//
// Thin HTTP wrapper for the recipe authoring subsystem (MealSetOwner-gated on the
// server). CRUD methods return Observables so the editor can inspect errors
// itself — the publish gate (422) and reorder conflict (409) are shown INLINE in
// the editor, never as generic toasts, so this service does NOT swallow/toast
// them. The cooking-method vocabulary is fetched once and cached in a signal.
import { Injectable, inject, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Observable, firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import {
  CookingMethod,
  CreateMealFromRecipeRequest,
  CreateRecipeIngredientRequest,
  CreateRecipeRequest,
  ListCookingMethodsResponse,
  ListRecipesResponse,
  Meal,
  RecipeResponse,
  RecipeType,
  ReorderIngredientsRequest,
  UpdateRecipeIngredientRequest,
  UpdateRecipeRequest,
} from '../models';

@Injectable({ providedIn: 'root' })
export class RecipeAuthoringService {
  private http = inject(HttpClient);
  private apiUrl = environment.apiUrl;
  private baseUrl = `${environment.apiUrl}/recipe/authoring`;

  // ---- Recipe header CRUD ---------------------------------------------------
  /** POST /api/recipe/authoring — create a draft (recipeType stamped 'authored'). */
  createRecipe(body: CreateRecipeRequest): Observable<RecipeResponse> {
    return this.http.post<RecipeResponse>(this.baseUrl, body);
  }

  /** GET /api/recipe/authoring — the caller's recipes (summaries). Optional
   *  ?type=imported|authored filters by provenance server-side. */
  listRecipes(type?: RecipeType): Observable<ListRecipesResponse> {
    const options = type ? { params: new HttpParams().set('type', type) } : {};
    return this.http.get<ListRecipesResponse>(this.baseUrl, options);
  }

  /** GET /api/recipe/authoring/{id} — header + ordered ingredient lines. */
  getRecipe(id: number): Observable<RecipeResponse> {
    return this.http.get<RecipeResponse>(`${this.baseUrl}/${id}`);
  }

  /** PATCH /api/recipe/authoring/{id} — partial header update (incl. archive /
   *  publish). A publish attempt that fails the gate returns 422. */
  updateRecipe(id: number, body: UpdateRecipeRequest): Observable<RecipeResponse> {
    return this.http.patch<RecipeResponse>(`${this.baseUrl}/${id}`, body);
  }

  /** DELETE /api/recipe/authoring/{id} — permanent removal; 204 No Content. */
  deleteRecipe(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }

  // ---- Ingredient lines (each mutation but DELETE returns the fresh recipe) --
  /** POST .../{id}/ingredient — append a line; returns the updated recipe. */
  addIngredient(id: number, body: CreateRecipeIngredientRequest): Observable<RecipeResponse> {
    return this.http.post<RecipeResponse>(`${this.baseUrl}/${id}/ingredient`, body);
  }

  /** PATCH .../{id}/ingredient/{iid} — edit a line; returns the updated recipe. */
  updateIngredient(
    id: number,
    iid: number,
    body: UpdateRecipeIngredientRequest,
  ): Observable<RecipeResponse> {
    return this.http.patch<RecipeResponse>(`${this.baseUrl}/${id}/ingredient/${iid}`, body);
  }

  /** DELETE .../{id}/ingredient/{iid} — 204 No Content. */
  deleteIngredient(id: number, iid: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}/ingredient/${iid}`);
  }

  /** PUT .../{id}/ingredient-order — full id permutation. 409 when the id set no
   *  longer matches the recipe's lines (caller reloads). Returns the fresh recipe. */
  reorderIngredients(id: number, body: ReorderIngredientsRequest): Observable<RecipeResponse> {
    return this.http.put<RecipeResponse>(`${this.baseUrl}/${id}/ingredient-order`, body);
  }

  /** POST .../{id}/create-meal — materialize a pinned Binder meal from the fully
   *  resolved recipe. Response is the created Meal. 422 when any line is unbound. */
  createMealFromRecipe(id: number, body: CreateMealFromRecipeRequest): Observable<Meal> {
    return this.http.post<Meal>(`${this.baseUrl}/${id}/create-meal`, body);
  }

  // ---- Cooking-method vocabulary (cached) -----------------------------------
  private cookingMethodsSignal = signal<CookingMethod[]>([]);
  readonly cookingMethods = this.cookingMethodsSignal.asReadonly();
  private cookingMethodsLoaded = false;

  /** Fetch GET /api/cookingmethods once; subsequent calls are no-ops. A failure
   *  leaves the list empty (the picker just shows no options). */
  async ensureCookingMethods(): Promise<void> {
    if (this.cookingMethodsLoaded) return;
    try {
      const res = await firstValueFrom(
        this.http.get<ListCookingMethodsResponse>(`${this.apiUrl}/cookingmethods`),
      );
      this.cookingMethodsSignal.set(res?.cookingMethods ?? []);
      this.cookingMethodsLoaded = true;
    } catch {
      // leave empty; free-text meals just won't show a method
    }
  }

  /** Look up a cooking-method name by id from the cache (empty when unknown). */
  cookingMethodName(id: number | null | undefined): string {
    if (id == null) return '';
    return this.cookingMethodsSignal().find((m) => m.id === id)?.name ?? '';
  }

  /** Pull an inline-displayable message out of an authoring error response
   *  (422 publish gate / 409 reorder conflict / other). */
  static messageFor(err: unknown, fallback: string): string {
    if (err instanceof HttpErrorResponse) {
      const body = err.error;
      if (typeof body === 'string' && body.trim()) return body.trim();
      if (body && typeof body === 'object') {
        const m = (body as { error?: string; message?: string }).error
          ?? (body as { message?: string }).message;
        if (m) return m;
      }
    }
    return fallback;
  }
}
