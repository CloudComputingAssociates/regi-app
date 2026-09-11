// src/app/services/recipe.service.ts
//
// Recipe import + status reads. Uses the app's shared HttpClient — Auth0's
// authHttpInterceptorFn (see app.config.ts, allowedList `${apiUrl}/*`) attaches
// the JWT automatically, so calls need no manual token handling.
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { RecipeStatus, RecipeImportResponse } from '../models/recipe.model';

@Injectable({ providedIn: 'root' })
export class RecipeService {
  private http = inject(HttpClient);
  private baseUrl = `${environment.apiUrl}/recipe`;

  /** GET /api/recipe/{id} — owner-scoped import status (404 if deleted/not ours). */
  getStatus(recipeId: number): Observable<RecipeStatus> {
    return this.http.get<RecipeStatus>(`${this.baseUrl}/${recipeId}`);
  }

  /** POST /api/recipe/import — upload a PDF as multipart; returns the 202 body.
   *  NOTE: the multipart field name is ASSUMED to be "file" — it isn't
   *  determinable from anything in regi-app. Verify with one curl before relying
   *  on it (see the feature report). */
  importRecipe(pdf: File): Observable<RecipeImportResponse> {
    const form = new FormData();
    form.append('file', pdf);
    return this.http.post<RecipeImportResponse>(`${this.baseUrl}/import`, form);
  }
}
