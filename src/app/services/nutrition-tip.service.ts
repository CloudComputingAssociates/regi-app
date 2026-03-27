// src/app/services/nutrition-tip.service.ts
import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';

export interface NutritionTip {
  title: string;
  imageUrl: string;
  articleUrl: string;
}

@Injectable({
  providedIn: 'root'
})
export class NutritionTipService {
  private http = inject(HttpClient);
  private baseUrl = environment.apiUrl;

  private tipSignal = signal<NutritionTip | null>(null);
  private loadingSignal = signal(false);

  readonly tip = this.tipSignal.asReadonly();
  readonly loading = this.loadingSignal.asReadonly();

  async fetchTip(): Promise<void> {
    if (this.tipSignal()) return; // already loaded
    this.loadingSignal.set(true);
    try {
      const tip = await firstValueFrom(
        this.http.get<NutritionTip>(`${this.baseUrl}/nutrition-tip`)
      );
      this.tipSignal.set(tip);
    } catch {
      // Silent fail — tip card just won't show
    } finally {
      this.loadingSignal.set(false);
    }
  }
}
