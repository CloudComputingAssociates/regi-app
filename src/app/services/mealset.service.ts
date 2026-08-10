// src/app/services/mealset.service.ts
//
// MealSet subsystem client. Covers the entitled-set dropdown (app side) and the
// full MealSetOwner authoring surface (my sets CRUD, meal junctions, owner
// profile, read-only contract) plus the shared mealset image upload.
//
// Uses the app's shared HttpClient — Auth0's authHttpInterceptorFn attaches the
// JWT automatically (see app.config.ts allowedList). Client role checks are
// cosmetic; the server enforces the MealSetOwner role on every owner endpoint.
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import {
  MealSet,
  MealSetSummary,
  MealSetOwnerProfile,
  MealSetContractView,
  CreateMealSetRequest,
  UpdateMealSetRequest,
  AddMealSetMealRequest,
  UpdateMealSetOwnerProfileRequest,
  Meal,
} from '../models';

/** Response of POST /api/image/upload/mealset. Not part of mealset.schema (it's
 *  the image service's shape) — declared here from the documented contract. */
export interface MealSetImageUploadResponse {
  success: boolean;
  cdn_url: string;
  thumbnail_url: string;
}

@Injectable({ providedIn: 'root' })
export class MealSetService {
  private http = inject(HttpClient);
  private baseUrl = `${environment.apiUrl}/mealset`;
  private apiUrl = environment.apiUrl;

  // ---- App side: entitled sets for the Binder dropdown ----------------------
  /** GET /api/mealset — the caller's entitled sets (lightweight summaries). */
  getEntitled(): Observable<MealSetSummary[]> {
    return this.http.get<MealSetSummary[]>(this.baseUrl);
  }

  // ---- Owner side: authored sets CRUD ---------------------------------------
  /** GET /api/mealset/authored — full rows for sets the caller owns. */
  getAuthored(): Observable<MealSet[]> {
    return this.http.get<MealSet[]>(`${this.baseUrl}/authored`);
  }

  /** POST /api/mealset — create a set (author-writable fields only). */
  createSet(body: CreateMealSetRequest): Observable<MealSet> {
    return this.http.post<MealSet>(this.baseUrl, body);
  }

  /** PATCH /api/mealset/{id} — partial update (only provided fields change). */
  updateSet(id: number, body: UpdateMealSetRequest): Observable<MealSet> {
    return this.http.patch<MealSet>(`${this.baseUrl}/${id}`, body);
  }

  // ---- Owner side: set ⇄ meal junctions -------------------------------------
  /** POST /api/mealset/{id}/meals — junction a caller-owned meal into a set. */
  addMeal(setId: number, body: AddMealSetMealRequest): Observable<unknown> {
    return this.http.post(`${this.baseUrl}/${setId}/meals`, body);
  }

  /** DELETE /api/mealset/{id}/meals/{mealId} — unassign a meal from a set. */
  removeMeal(setId: number, mealId: number): Observable<unknown> {
    return this.http.delete(`${this.baseUrl}/${setId}/meals/${mealId}`);
  }

  /** The caller's own meals — the assignable pool for the set meal picker. */
  getOwnMeals(): Observable<Meal[]> {
    return this.http.get<Meal[]>(`${this.apiUrl}/meal`, {
      params: { scope: 'binder', limit: '100' },
    });
  }

  /** Meals currently in a set: GET /api/meal?mealSetIds={id}, keeping only the
   *  entries the server tags with this set's id. */
  getSetMeals(setId: number): Observable<Meal[]> {
    return this.http.get<Meal[]>(`${this.apiUrl}/meal`, {
      params: { mealSetIds: String(setId), limit: '100' },
    });
  }

  // ---- Owner side: authoring identity ---------------------------------------
  /** GET /api/mealsetownerprofile — the caller's authoring identity. */
  getOwnerProfile(): Observable<MealSetOwnerProfile> {
    return this.http.get<MealSetOwnerProfile>(`${this.apiUrl}/mealsetownerprofile`);
  }

  /** PUT /api/mealsetownerprofile — upsert the caller's authoring identity. */
  updateOwnerProfile(body: UpdateMealSetOwnerProfileRequest): Observable<MealSetOwnerProfile> {
    return this.http.put<MealSetOwnerProfile>(`${this.apiUrl}/mealsetownerprofile`, body);
  }

  // ---- Owner side: read-only contract ---------------------------------------
  /** GET /api/mealset/contract — the caller's rev-share deal (404 if none). */
  getContract(): Observable<MealSetContractView> {
    return this.http.get<MealSetContractView>(`${this.baseUrl}/contract`);
  }

  // ---- Shared: image upload -------------------------------------------------
  /** POST /api/image/upload/mealset — multipart (image file, optional slug name).
   *  Returns the CDN urls; store cdn_url into a mealSetPic/authorPic field via the
   *  PATCH/PUT endpoints. Keys are per-upload UUIDs — replacing a pic just stores
   *  the new url; there is no delete call. */
  uploadImage(image: File, name?: string): Observable<MealSetImageUploadResponse> {
    const form = new FormData();
    form.append('image', image);
    if (name) form.append('name', name);
    return this.http.post<MealSetImageUploadResponse>(`${this.apiUrl}/image/upload/mealset`, form);
  }
}
