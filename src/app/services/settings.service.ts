// src/app/services/settings.service.ts
// Handles user settings persistence (defaultTabs, etc.)
import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '@auth0/auth0-angular';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';

// Settings response/request interface
export interface UserSettings {
  defaultTabs: string[];
  activeTabId?: string;
}

@Injectable({
  providedIn: 'root'
})
export class SettingsService {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private baseUrl = environment.apiUrl;

  // Settings state
  private settingsSignal = signal<UserSettings | null>(null);
  private loadingSignal = signal(false);

  // Public readonly signals
  readonly settings = this.settingsSignal.asReadonly();
  readonly isLoading = this.loadingSignal.asReadonly();

  /**
   * Load user settings from the API
   * Creates default settings if none exist
   */
  async loadSettings(): Promise<UserSettings> {
    this.loadingSignal.set(true);

    try {
      const token = await firstValueFrom(this.auth.getAccessTokenSilently());
      const url = `${this.baseUrl}/user/preferences/settings`;

      const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const settings: UserSettings = await response.json();
      this.settingsSignal.set(settings);
      console.log('[SettingsService] Loaded settings:', settings);
      return settings;

    } catch (error) {
      console.error('[SettingsService] Failed to load settings:', error);
      // Return default settings on error
      const defaultSettings: UserSettings = { defaultTabs: ['chat'] };
      this.settingsSignal.set(defaultSettings);
      return defaultSettings;
    } finally {
      this.loadingSignal.set(false);
    }
  }

  /**
   * Save user settings to the API
   */
  async saveSettings(settings: UserSettings): Promise<void> {
    this.loadingSignal.set(true);

    try {
      const token = await firstValueFrom(this.auth.getAccessTokenSilently());
      const url = `${this.baseUrl}/user/preferences/settings`;

      const response = await fetch(url, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(settings)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const savedSettings: UserSettings = await response.json();
      this.settingsSignal.set(savedSettings);
      console.log('[SettingsService] Saved settings:', savedSettings);

    } catch (error) {
      console.error('[SettingsService] Failed to save settings:', error);
      throw error;
    } finally {
      this.loadingSignal.set(false);
    }
  }

  /**
   * Save the current open tabs to settings
   */
  async saveOpenTabs(tabIds: string[], activeTabId?: string): Promise<void> {
    const settings: UserSettings = {
      defaultTabs: tabIds,
      activeTabId
    };
    await this.saveSettings(settings);
  }

  /**
   * Clear settings (on logout)
   */
  clearSettings(): void {
    this.settingsSignal.set(null);
  }
}
