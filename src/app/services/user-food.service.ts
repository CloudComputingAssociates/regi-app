// src/app/services/user-food.service.ts
import { Injectable, inject, signal } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { UserFood, CreateUserFoodRequest, UpdateUserFoodCategoryRequest } from '../models/user-food.model';
import {
  FatSecretCandidatesResponse,
  FromFatSecretRequest,
  UpcLookupRequest,
  FoodAddResult,
} from '../models/fatsecret.model';

interface ListUserFoodsResponse {
  foods: UserFood[];
  count: number;
}

@Injectable({
  providedIn: 'root'
})
export class UserFoodService {
  private http = inject(HttpClient);
  private baseUrl = `${environment.apiUrl}/userfoods`;

  private userFoodsSignal = signal<UserFood[]>([]);
  private loadingSignal = signal(false);

  readonly userFoods = this.userFoodsSignal.asReadonly();
  readonly loading = this.loadingSignal.asReadonly();

  async listUserFoods(): Promise<UserFood[]> {
    this.loadingSignal.set(true);
    try {
      const resp = await firstValueFrom(
        this.http.get<ListUserFoodsResponse>(this.baseUrl)
      );
      this.userFoodsSignal.set(resp.foods || []);
      return resp.foods || [];
    } catch {
      return [];
    } finally {
      this.loadingSignal.set(false);
    }
  }

  /** Fetch a single UserFood by id (GET /api/userfoods/{id}). Caller-scoped on
   *  the API (WHERE UserFoodID = @p1 AND UserID = @p2 → own-row-or-404, no share
   *  gate), so a fresh dynamic ingredient (ShareCandidate=1, ShareApproved=0)
   *  still returns. Used to resolve meal items backed by a userfood that isn't in
   *  the allowed-foods curation set. Returns null on any error. */
  // ---- Add-food-by-name / barcode (typeahead miss path) ---------------------
  /** GET /api/userfoods/fatsecret-search?q=&max= — slim FatSecret candidates. */
  searchFatSecret(q: string, max = 8): Observable<FatSecretCandidatesResponse> {
    const params = new HttpParams().set('q', q).set('max', String(max));
    return this.http.get<FatSecretCandidatesResponse>(`${this.baseUrl}/fatsecret-search`, { params });
  }

  /** POST /api/userfoods/from-fatsecret — create a UserFood from a candidate id
   *  (server AI-categorizes when categoryId is omitted). Returns FoodAddResult. */
  createFromFatSecret(body: FromFatSecretRequest): Observable<FoodAddResult> {
    return this.http.post<FoodAddResult>(`${this.baseUrl}/from-fatsecret`, body);
  }

  /** POST /api/userfoods/barcode — create a UserFood from a scanned UPC/GTIN.
   *  404 when the barcode isn't found. Returns FoodAddResult. */
  lookupBarcode(body: UpcLookupRequest): Observable<FoodAddResult> {
    return this.http.post<FoodAddResult>(`${this.baseUrl}/barcode`, body);
  }

  async getUserFoodById(id: number): Promise<UserFood | null> {
    try {
      return await firstValueFrom(
        this.http.get<UserFood>(`${this.baseUrl}/${id}`)
      );
    } catch {
      return null;
    }
  }

  async createUserFood(req: CreateUserFoodRequest): Promise<UserFood | null> {
    try {
      const food = await firstValueFrom(
        this.http.post<UserFood>(this.baseUrl, req)
      );
      this.userFoodsSignal.update(list => [...list, food]);
      return food;
    } catch {
      return null;
    }
  }

  async updateUserFood(id: number, req: Partial<CreateUserFoodRequest>): Promise<UserFood | null> {
    try {
      const food = await firstValueFrom(
        this.http.put<UserFood>(`${this.baseUrl}/${id}`, req)
      );
      this.userFoodsSignal.update(list =>
        list.map(f => f.id === id ? food : f)
      );
      return food;
    } catch {
      return null;
    }
  }

  /** Update ONLY a userfood's category. Deliberately a category-only PATCH, NOT
   *  the full-replace PUT (updateUserFood) — that endpoint SETs every column, so
   *  a partial body would null out serving unit, images, UPC, etc. Requires
   *  PATCH /api/userfoods/{id}/category on the API; error-swallowed so it's a
   *  harmless no-op until that endpoint ships. */
  /** Update ONLY a userfood's display NAME (shortDescription). A name-only PATCH,
   *  NOT the full-replace PUT (which nulls other columns) — mirrors
   *  setUserFoodCategory. Requires PATCH /api/userfoods/{id}/name on the API;
   *  error-swallowed so it's a harmless no-op until that endpoint ships. */
  async setUserFoodName(id: number, name: string): Promise<boolean> {
    try {
      await firstValueFrom(
        this.http.patch<UserFood>(`${this.baseUrl}/${id}/name`, { shortDescription: name })
      );
      this.userFoodsSignal.update(list =>
        list.map(f => f.id === id ? { ...f, shortDescription: name } : f)
      );
      return true;
    } catch {
      return false;
    }
  }

  async setUserFoodCategory(id: number, categoryId: number): Promise<boolean> {
    try {
      const body: UpdateUserFoodCategoryRequest = { categoryId };
      await firstValueFrom(
        this.http.patch<UserFood>(`${this.baseUrl}/${id}/category`, body)
      );
      this.userFoodsSignal.update(list =>
        list.map(f => f.id === id ? { ...f, categoryId } : f)
      );
      return true;
    } catch {
      return false;
    }
  }

  async listCommunityFoods(): Promise<UserFood[]> {
    try {
      const resp = await firstValueFrom(
        this.http.get<ListUserFoodsResponse>(`${this.baseUrl}/community`)
      );
      return resp.foods || [];
    } catch {
      return [];
    }
  }

  async deleteUserFood(id: number): Promise<boolean> {
    try {
      await firstValueFrom(
        this.http.delete(`${this.baseUrl}/${id}`)
      );
      this.userFoodsSignal.update(list => list.filter(f => f.id !== id));
      return true;
    } catch {
      return false;
    }
  }
}
