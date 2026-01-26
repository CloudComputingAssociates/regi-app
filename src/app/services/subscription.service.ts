// src/app/services/subscription.service.ts
import { Injectable, inject, signal, computed } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { AuthService } from '@auth0/auth0-angular';
import { catchError, switchMap, tap } from 'rxjs/operators';
import { Observable, of, throwError } from 'rxjs';
import { environment } from '../../environments/environment';

// Backend API response format
interface BackendSubscriptionResponse {
  hasActiveSubscription: boolean;
  subscriptionTier?: string;
  subscriptionStatus?: string;
  expiresAt?: string;
}

// Frontend subscription status interface
export interface SubscriptionStatus {
  hasActiveSubscription: boolean;
  subscriptionType?: 'monthly' | 'annual';
  status?: 'active' | 'cancelled' | 'expired' | 'trialing';
  expiresAt?: string;
}

// Stripe product/price interface
export interface StripeProduct {
  id: string;
  name: string;
  priceId: string;
  amount: number; // in cents
  currency: string;
  interval: 'month' | 'year';
  discount?: number;
}

@Injectable({
  providedIn: 'root'
})
export class SubscriptionService {
  private http = inject(HttpClient);
  private auth = inject(AuthService);

  // API base URL from environment configuration
  private readonly API_BASE_URL = environment.apiUrl;

  // Reactive state using signals
  private subscriptionStatusSignal = signal<SubscriptionStatus | null>(null);
  private loadingSignal = signal<boolean>(false);
  private errorSignal = signal<string | null>(null);
  private productsSignal = signal<StripeProduct[]>([]);

  // Public computed signals
  readonly subscriptionStatus = this.subscriptionStatusSignal.asReadonly();
  readonly isLoading = this.loadingSignal.asReadonly();
  readonly error = this.errorSignal.asReadonly();
  readonly products = this.productsSignal.asReadonly();

  // Computed: should show membership gate
  readonly shouldShowMembershipGate = computed(() => {
    const status = this.subscriptionStatusSignal();
    // Show gate if we have status data and user doesn't have active subscription
    return status !== null && !status.hasActiveSubscription;
  });

  /**
   * Check the current user's subscription status
   * Returns an observable that emits the subscription status
   */
  checkSubscriptionStatus(): Observable<SubscriptionStatus> {
    this.loadingSignal.set(true);
    this.errorSignal.set(null);

    // First ensure user is authenticated
    return this.auth.isAuthenticated$.pipe(
      switchMap(isAuthenticated => {
        if (!isAuthenticated) {
          // User not authenticated - they need to sign up
          const status: SubscriptionStatus = { hasActiveSubscription: false };
          this.subscriptionStatusSignal.set(status);
          this.loadingSignal.set(false);
          return of(status);
        }

        // User is authenticated - check subscription status from backend
        return this.http.get<BackendSubscriptionResponse>(`${this.API_BASE_URL}/user/account/status`).pipe(
          tap(backendResponse => {
            // Map backend response to frontend format
            const status: SubscriptionStatus = {
              hasActiveSubscription: backendResponse.hasActiveSubscription,
              subscriptionType: backendResponse.subscriptionTier as 'monthly' | 'annual',
              status: backendResponse.subscriptionStatus as 'active' | 'cancelled' | 'expired' | 'trialing',
              expiresAt: backendResponse.expiresAt
            };
            this.subscriptionStatusSignal.set(status);
            this.loadingSignal.set(false);
          }),
          catchError((error: HttpErrorResponse) => {
            console.error('Error checking subscription status:', error);

            // 404 = User exists but no subscription record
            if (error.status === 404) {
              const noSubStatus: SubscriptionStatus = { hasActiveSubscription: false };
              this.subscriptionStatusSignal.set(noSubStatus);
              this.loadingSignal.set(false);
              return of(noSubStatus);
            }

            // For ANY error (including 401), just set status to null and don't show gate
            // Let Auth0 handle authentication state - we shouldn't interfere
            this.errorSignal.set(error.message || 'Failed to check subscription status');
            this.loadingSignal.set(false);
            this.subscriptionStatusSignal.set(null);
            return of(null as unknown as SubscriptionStatus);
          })
        );
      })
    );
  }

  /**
   * Get available subscription products from backend
   * @returns Observable with product list
   */
  getProducts(): Observable<{ products: StripeProduct[] }> {
    return this.http.get<{ products: StripeProduct[] }>(
      `${this.API_BASE_URL}/user/account/products`
    ).pipe(
      tap(response => {
        this.productsSignal.set(response.products);
      }),
      catchError(error => {
        console.error('Error fetching products:', error);
        return throwError(() => error);
      })
    );
  }

  /**
   * Create a Stripe checkout session for subscription
   * @param priceId - Stripe price ID from backend
   * @returns Observable with checkout session URL
   */
  createCheckoutSession(priceId: string): Observable<{ url: string }> {
    return this.http.post<{ sessionId: string; url: string }>(
      `${this.API_BASE_URL}/user/account/checkout`,
      { priceId }
    ).pipe(
      catchError(error => {
        console.error('Error creating checkout session:', error);
        return throwError(() => error);
      })
    );
  }

  /**
   * Cancel the current user's subscription
   * @returns Observable with cancellation confirmation
   */
  cancelSubscription(): Observable<{ status: string; message: string }> {
    return this.http.post<{ status: string; message: string }>(
      `${this.API_BASE_URL}/user/account/cancel`,
      {}
    ).pipe(
      tap(() => {
        // Update local state to reflect cancellation
        this.subscriptionStatusSignal.update(status =>
          status ? { ...status, status: 'cancelled' } : null
        );
      }),
      catchError(error => {
        console.error('Error cancelling subscription:', error);
        return throwError(() => error);
      })
    );
  }

  /**
   * Deactivate user account (soft delete)
   * This cancels any active subscription and marks the account as inactive
   * @returns Observable with deactivation confirmation
   */
  deactivateAccount(): Observable<{
    success: boolean;
    message: string;
    subscriptionCanceled: boolean;
    deactivatedAt?: string;
  }> {
    return this.http.delete<{
      success: boolean;
      message: string;
      subscriptionCanceled: boolean;
      deactivatedAt?: string;
    }>(`${this.API_BASE_URL}/user/account`).pipe(
      tap(() => {
        // Clear subscription status after deactivation
        this.clearStatus();
      }),
      catchError(error => {
        console.error('Error deactivating account:', error);
        return throwError(() => error);
      })
    );
  }

  /**
   * Refresh subscription status from backend
   */
  refreshStatus(): void {
    this.checkSubscriptionStatus().subscribe();
  }

  /**
   * Clear subscription status (e.g., on logout)
   */
  clearStatus(): void {
    this.subscriptionStatusSignal.set(null);
    this.errorSignal.set(null);
    this.loadingSignal.set(false);
  }
}
