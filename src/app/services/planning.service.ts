// src/app/services/planning.service.ts
import { Injectable, inject, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import {
  Plan,
  PlanItem,
  GeneratePlanRequest,
  UpdatePlanRequest,
  ListPlansResponse,
  ListPlansRequest
} from '../models/planning.model';

@Injectable({
  providedIn: 'root'
})
export class PlanningService {
  private http = inject(HttpClient);
  private baseUrl = environment.apiUrl;

  // Current plan state
  private currentPlanSignal = signal<Plan | null>(null);
  private loadingSignal = signal(false);
  private errorSignal = signal<string | null>(null);

  // Stubbed prompt for first pass (will come from PromptMe chat later)
  private readonly STUBBED_PROMPT = 'I want a daily plan with dark chicken, eggs, cottage cheese and ground beef plus vegetables and pecorino romano cheese 1 oz';

  // Public accessors
  readonly currentPlan = this.currentPlanSignal.asReadonly();
  readonly loading = this.loadingSignal.asReadonly();
  readonly error = this.errorSignal.asReadonly();

  // Computed values
  readonly planItems = computed(() => this.currentPlanSignal()?.items ?? []);
  readonly planName = computed(() => this.currentPlanSignal()?.name ?? '');
  readonly isFavorite = computed(() => this.currentPlanSignal()?.isFavorite ?? false);
  readonly hasPlan = computed(() => this.currentPlanSignal() !== null);

  /**
   * Generate a new meal plan via AI
   */
  async generatePlan(planType: 'day' | 'week' = 'day', planDate?: string): Promise<Plan> {
    this.loadingSignal.set(true);
    this.errorSignal.set(null);

    const date = planDate ?? new Date().toISOString().split('T')[0];
    const request: GeneratePlanRequest = {
      planType,
      planDate: date,
      promptGist: this.STUBBED_PROMPT
    };

    try {
      const plan = await firstValueFrom(
        this.http.post<Plan>(`${this.baseUrl}/plan/generate`, request)
      );
      this.currentPlanSignal.set(plan);
      return plan;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to generate plan';
      this.errorSignal.set(message);
      throw err;
    } finally {
      this.loadingSignal.set(false);
    }
  }

  /**
   * Get a plan by ID
   */
  async getPlan(planId: number): Promise<Plan> {
    this.loadingSignal.set(true);
    this.errorSignal.set(null);

    try {
      const plan = await firstValueFrom(
        this.http.get<Plan>(`${this.baseUrl}/plan/${planId}`)
      );
      this.currentPlanSignal.set(plan);
      return plan;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load plan';
      this.errorSignal.set(message);
      throw err;
    } finally {
      this.loadingSignal.set(false);
    }
  }

  /**
   * Update plan (name, favorite status, items)
   */
  async updatePlan(planId: number, updates: UpdatePlanRequest): Promise<Plan> {
    this.loadingSignal.set(true);
    this.errorSignal.set(null);

    try {
      const plan = await firstValueFrom(
        this.http.put<Plan>(`${this.baseUrl}/plan/${planId}`, updates)
      );
      this.currentPlanSignal.set(plan);
      return plan;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update plan';
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
    const plan = this.currentPlanSignal();
    if (!plan) return;

    await this.updatePlan(plan.id, { isFavorite: !plan.isFavorite });
  }

  /**
   * Delete a plan item (local only for now)
   */
  deleteItem(itemId: number): void {
    const plan = this.currentPlanSignal();
    if (!plan) return;

    const updatedItems = plan.items.filter(item => item.id !== itemId);
    this.currentPlanSignal.set({
      ...plan,
      items: updatedItems
    });
  }

  /**
   * List plans with filters
   */
  listPlans(params?: ListPlansRequest): Observable<ListPlansResponse> {
    const queryParams = new URLSearchParams();
    if (params?.planType) queryParams.set('planType', params.planType);
    if (params?.status) queryParams.set('status', params.status);
    if (params?.isFavorite !== undefined) queryParams.set('isFavorite', String(params.isFavorite));
    if (params?.startDate) queryParams.set('startDate', params.startDate);
    if (params?.endDate) queryParams.set('endDate', params.endDate);
    if (params?.limit) queryParams.set('limit', String(params.limit));
    if (params?.offset) queryParams.set('offset', String(params.offset));

    const url = `${this.baseUrl}/plans?${queryParams.toString()}`;
    return this.http.get<ListPlansResponse>(url);
  }

  /**
   * Clear current plan
   */
  clearPlan(): void {
    this.currentPlanSignal.set(null);
    this.errorSignal.set(null);
  }
}
