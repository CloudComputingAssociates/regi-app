// src/app/services/settings.service.ts
// Consolidated settings service: loads all settings via GET /api/user/settings at startup,
// saves all settings via PUT /api/user/settings
import { Injectable, inject, signal } from '@angular/core';
import { AuthService } from '@auth0/auth0-angular';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import {
  AllSettings, TabSettings, RegiMenuSettings,
  DailyGoals, PersonalInfo, DefaultFoodListData, ShoppingStaple, CurrentPick
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
  // CONSOLIDATED PUT (save all settings)
  // ========================================================

  async saveSettings(settings: Partial<AllSettings>): Promise<AllSettings> {
    const response = await this.authFetch(`${this.baseUrl}/user/settings`, {
      method: 'PUT',
      body: JSON.stringify(settings)
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const saved: AllSettings = await response.json();
    this.allSettingsSignal.set(saved);
    console.log('[SettingsService] Saved all settings:', saved);
    return saved;
  }

  // ========================================================
  // INDIVIDUAL SAVES (use consolidated PUT)
  // ========================================================

  async saveTabSettings(data: TabSettings): Promise<TabSettings> {
    const saved = await this.saveSettings({ tabs: data });
    return saved.tabs || data;
  }

  async saveRegiMenuSettings(data: RegiMenuSettings): Promise<RegiMenuSettings> {
    const saved = await this.saveSettings({ regiMenu: data });
    return saved.regiMenu || data;
  }

  async saveDailyGoals(data: DailyGoals): Promise<DailyGoals> {
    const saved = await this.saveSettings({ dailyGoals: data });
    return saved.dailyGoals || data;
  }

  async saveDefaultFoodList(value: string): Promise<string> {
    const saved = await this.saveSettings({ defaultFoodList: value });
    return saved.defaultFoodList || value;
  }

  async savePersonalInfo(data: PersonalInfo): Promise<PersonalInfo> {
    const saved = await this.saveSettings({ personalInfo: data });
    return saved.personalInfo || data;
  }

  async saveShoppingStaples(data: ShoppingStaple[]): Promise<ShoppingStaple[]> {
    const saved = await this.saveSettings({ shoppingStaples: data });
    return saved.shoppingStaples || data;
  }

  /** Persist the user's basket picks. The consolidated PUT preserves every
   *  other settings field via server-side COALESCE, so only currentPicks is
   *  sent. Empty array explicitly clears all picks (server distinguishes
   *  [] from absent). Caller debounces — this method does NOT.
   *
   *  Returns the server's echo so the caller can detect server-side mutations
   *  (e.g. order normalization) and reconcile.
   *
   *  No `sendBeacon` companion exists: the API requires an Authorization
   *  Bearer token and `navigator.sendBeacon` can only carry cookies, so
   *  any beacon attempt would be rejected with 401 and silently dropped.
   *  Saves rely on the foods-panel 500ms debounce plus a 30s background
   *  retry; the edge case of "user drags a food and immediately closes
   *  the tab within 500ms" is accepted.
   */
  async saveCurrentPicks(picks: CurrentPick[]): Promise<CurrentPick[]> {
    const saved = await this.saveSettings({ currentPicks: picks });
    return saved.currentPicks ?? picks;
  }

  // ========================================================
  // CONVENIENCE
  // ========================================================

  async saveOpenTabs(tabIds: string[], activeTabId?: string): Promise<void> {
    // Filter out 'today' — it's always re-added on restore and isn't a valid API tab ID
    const filtered = tabIds.filter(id => id !== 'today');
    await this.saveTabSettings({ defaultTabs: filtered, activeTabId });
  }

  clearSettings(): void {
    this.allSettingsSignal.set(null);
  }
}
