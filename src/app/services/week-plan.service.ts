// src/app/services/week-plan.service.ts
import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import {
  WeekPlan,
  WeekPlanSummary,
  DayPlan,
  DayPlanMeal,
  CreateWeekPlanRequest,
  UpdateWeekPlanRequest,
  CopyWeekPlanRequest,
  CreateDayPlanRequest,
  AssignMealRequest,
  ListWeekPlansResponse
} from '../models/planning.model';

@Injectable({
  providedIn: 'root'
})
export class WeekPlanService {
  private http = inject(HttpClient);
  private baseUrl = environment.apiUrl;

  private currentWeekPlanSignal = signal<WeekPlan | null>(null);
  private weekPlansSignal = signal<WeekPlanSummary[]>([]);
  private loadingSignal = signal(false);
  private errorSignal = signal<string | null>(null);

  readonly currentWeekPlan = this.currentWeekPlanSignal.asReadonly();
  readonly weekPlans = this.weekPlansSignal.asReadonly();
  readonly loading = this.loadingSignal.asReadonly();
  readonly error = this.errorSignal.asReadonly();

  async createWeekPlan(req: CreateWeekPlanRequest): Promise<WeekPlan> {
    this.loadingSignal.set(true);
    this.errorSignal.set(null);

    try {
      const wp = await firstValueFrom(
        this.http.post<WeekPlan>(`${this.baseUrl}/weekplan`, req)
      );
      this.currentWeekPlanSignal.set(wp);
      return wp;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create week plan';
      this.errorSignal.set(message);
      throw err;
    } finally {
      this.loadingSignal.set(false);
    }
  }

  async getWeekPlan(id: number): Promise<WeekPlan> {
    this.loadingSignal.set(true);
    this.errorSignal.set(null);

    try {
      const wp = await firstValueFrom(
        this.http.get<WeekPlan>(`${this.baseUrl}/weekplan/${id}`)
      );
      this.currentWeekPlanSignal.set(wp);
      return wp;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load week plan';
      this.errorSignal.set(message);
      throw err;
    } finally {
      this.loadingSignal.set(false);
    }
  }

  async listWeekPlans(): Promise<void> {
    this.loadingSignal.set(true);
    this.errorSignal.set(null);

    try {
      const resp = await firstValueFrom(
        this.http.get<ListWeekPlansResponse>(`${this.baseUrl}/weekplan`)
      );
      this.weekPlansSignal.set(resp.weekPlans);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to list week plans';
      this.errorSignal.set(message);
    } finally {
      this.loadingSignal.set(false);
    }
  }

  async updateWeekPlan(id: number, req: UpdateWeekPlanRequest): Promise<void> {
    await firstValueFrom(
      this.http.put(`${this.baseUrl}/weekplan/${id}`, req)
    );
  }

  async deleteWeekPlan(id: number): Promise<void> {
    await firstValueFrom(
      this.http.delete(`${this.baseUrl}/weekplan/${id}`)
    );
    if (this.currentWeekPlanSignal()?.id === id) {
      this.currentWeekPlanSignal.set(null);
    }
    this.weekPlansSignal.update(list => list.filter(wp => wp.id !== id));
  }

  async copyWeekPlan(id: number, req: CopyWeekPlanRequest): Promise<WeekPlan> {
    this.loadingSignal.set(true);
    this.errorSignal.set(null);

    try {
      const wp = await firstValueFrom(
        this.http.post<WeekPlan>(`${this.baseUrl}/weekplan/${id}/copy`, req)
      );
      this.currentWeekPlanSignal.set(wp);
      return wp;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to copy week plan';
      this.errorSignal.set(message);
      throw err;
    } finally {
      this.loadingSignal.set(false);
    }
  }

  async createDayPlan(req: CreateDayPlanRequest): Promise<DayPlan> {
    return firstValueFrom(
      this.http.post<DayPlan>(`${this.baseUrl}/dayplan`, req)
    );
  }

  async assignMealToDayPlan(dayPlanId: number, req: AssignMealRequest): Promise<DayPlanMeal> {
    return firstValueFrom(
      this.http.post<DayPlanMeal>(`${this.baseUrl}/dayplan/${dayPlanId}/meals`, req)
    );
  }

  async removeMealFromDayPlan(dayPlanId: number, dayPlanMealId: number): Promise<void> {
    await firstValueFrom(
      this.http.delete(`${this.baseUrl}/dayplan/${dayPlanId}/meals/${dayPlanMealId}`)
    );
  }

  /** Refresh the current week plan from the server */
  async refreshCurrentWeekPlan(): Promise<void> {
    const wp = this.currentWeekPlanSignal();
    if (wp) {
      await this.getWeekPlan(wp.id);
    }
  }

  clearCurrentWeekPlan(): void {
    this.currentWeekPlanSignal.set(null);
    this.errorSignal.set(null);
  }
}
