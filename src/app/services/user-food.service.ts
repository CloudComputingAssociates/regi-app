// src/app/services/user-food.service.ts
import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { UserFood, CreateUserFoodRequest } from '../models/user-food.model';

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
