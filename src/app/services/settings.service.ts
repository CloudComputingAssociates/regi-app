// src/app/services/settings.service.ts
// Consolidated settings service: loads all settings via GET /api/user/settings at startup,
// saves individual groups via PUT /api/user/settings/{group}
import { Injectable, inject, signal } from '@angular/core';
import { AuthService } from '@auth0/auth0-angular';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import {
  AllSettings, TabSettings, RegiMenuSettings,
  DailyGoals, PersonalInfo, DefaultFoodListData
} from '../models/settings.models';

@Injectable({
  providedIn: 'root'
})
export class SettingsService {
  private auth = inject(AuthService);
  private baseUrl = environment.apiUrl;

  // Cached consolidated settings
  private allSettingsSignal = signal<AllSettings | null>(null);
  private loadingSignal = signal(false);

  readonly allSettings = this.allSettingsSignal.asReadonly();
  readonly isLoading = this.loadingSignal.asReadonly();

  // ========================================================
  // AUTH HELPER
  // ========================================================

  private async authFetch(url: string, options?: RequestInit): Promise<Response> {
    const token = await firstValueFrom(this.auth.getAccessTokenSilently());
    return fetch(url, {
      ...options,
      headers: {
        ...options?.headers,
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
  }

  // ========================================================
  // CONSOLIDATED GET (app startup)
  // ========================================================

  async loadSettings(): Promise<AllSettings> {
    this.loadingSignal.set(true);
    try {
      const response = await this.authFetch(`${this.baseUrl}/user/settings`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const all: AllSettings = await response.json();
      this.allSettingsSignal.set(all);
      console.log('[SettingsService] Loaded all settings:', all);
      return all;
    } catch (error) {
      console.error('[SettingsService] Failed to load settings:', error);
      const defaults: AllSettings = { tabs: { defaultTabs: ['chat'] } };
      this.allSettingsSignal.set(defaults);
      return defaults;
    } finally {
      this.loadingSignal.set(false);
    }
  }

  // ========================================================
  // INDIVIDUAL PUTs
  // ========================================================

  async saveTabSettings(data: TabSettings): Promise<TabSettings> {
    const response = await this.authFetch(`${this.baseUrl}/user/settings/tabs`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const saved: TabSettings = await response.json();
    this.allSettingsSignal.update(s => s ? { ...s, tabs: saved } : { tabs: saved });
    return saved;
  }

  async saveRegiMenuSettings(data: RegiMenuSettings): Promise<RegiMenuSettings> {
    const response = await this.authFetch(`${this.baseUrl}/user/settings/regimenu`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const saved: RegiMenuSettings = await response.json();
    this.allSettingsSignal.update(s => s ? { ...s, regiMenu: saved } : { regiMenu: saved });
    return saved;
  }

  async saveDailyGoals(data: DailyGoals): Promise<DailyGoals> {
    const response = await this.authFetch(`${this.baseUrl}/user/settings/dailygoals`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const saved: DailyGoals = await response.json();
    this.allSettingsSignal.update(s => s ? { ...s, dailyGoals: saved } : { dailyGoals: saved });
    return saved;
  }

  async saveDefaultFoodList(value: string): Promise<string> {
    const response = await this.authFetch(`${this.baseUrl}/user/settings/defaultfoodlist`, {
      method: 'PUT',
      body: JSON.stringify({ defaultFoodList: value } as DefaultFoodListData)
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const saved: DefaultFoodListData = await response.json();
    this.allSettingsSignal.update(s => s ? { ...s, defaultFoodList: saved.defaultFoodList } : { defaultFoodList: saved.defaultFoodList });
    return saved.defaultFoodList;
  }

  async savePersonalInfo(data: PersonalInfo): Promise<PersonalInfo> {
    const response = await this.authFetch(`${this.baseUrl}/user/settings/personalinfo`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const saved: PersonalInfo = await response.json();
    this.allSettingsSignal.update(s => s ? { ...s, personalInfo: saved } : { personalInfo: saved });
    return saved;
  }

  // ========================================================
  // CONVENIENCE
  // ========================================================

  async saveOpenTabs(tabIds: string[], activeTabId?: string): Promise<void> {
    await this.saveTabSettings({ defaultTabs: tabIds, activeTabId });
  }

  clearSettings(): void {
    this.allSettingsSignal.set(null);
  }
}
