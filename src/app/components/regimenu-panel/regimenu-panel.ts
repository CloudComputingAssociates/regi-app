// src/app/components/regimenu-panel/regimenu-panel.ts
import { Component, ChangeDetectionStrategy, inject, signal, computed, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TabService } from '../../services/tab.service';
import { ChatService } from '../../services/chat.service';
import { PlanningService } from '../../services/planning.service';
import { NotificationService } from '../../services/notification.service';
import { ChatOutputComponent } from '../chat/chat-output/chat-output';

@Component({
  selector: 'app-regimenu-panel',
  imports: [CommonModule, FormsModule, MatTooltipModule, ChatOutputComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="panel-container">
      <!-- Header with plan name and actions -->
      <div class="plan-header">
        <div class="header-left">
          <span class="plan-label">Plan</span>
          @if (planningService.hasPlan()) {
            <input
              type="text"
              class="plan-name-input"
              [value]="planningService.planName()"
              (input)="onPlanNameInput($event)"
              (blur)="onPlanNameBlur()"
              (keydown.enter)="$event.target.blur()"
              spellcheck="false" />
            <button
              class="favorite-btn"
              [class.active]="planningService.isFavorite()"
              (click)="toggleFavorite()"
              matTooltip="Toggle Favorite"
              matTooltipPosition="above">
              {{ planningService.isFavorite() ? '★' : '☆' }}
            </button>
          } @else {
            <span class="plan-name empty">RegiMenu℠</span>
          }
        </div>
        <div class="header-actions">
          @if (planningService.hasPlan()) {
            <button
              class="icon-btn save-btn"
              [class.has-changes]="hasChanges()"
              [disabled]="!hasChanges() || isSaving()"
              (click)="savePlan()"
              matTooltip="Save Plan"
              matTooltipPosition="above">
              @if (isSaving()) {
                <span class="spinner"></span>
              } @else {
                ✓
              }
            </button>
          }
          <button
            class="generate-btn"
            (click)="generatePlan()"
            [disabled]="planningService.loading() || planningService.hasPlan()"
            matTooltip="Generate Meal Plan"
            matTooltipPosition="above">
            @if (planningService.loading()) {
              <span class="spinner"></span>
            } @else {
              Generate
            }
          </button>
          <button
            class="icon-btn close-btn"
            (click)="closePanel()"
            matTooltip="Close"
            matTooltipPosition="above">
            ✕
          </button>
        </div>
      </div>

      <!-- Plan items list -->
      <div class="plan-list-container">
        @if (planningService.loading()) {
          <div class="loading-message">
            <div class="spinner-large"></div>
            <p>Generating your meal plan...</p>
          </div>
        } @else if (planningService.error()) {
          <div class="error-message">
            <p>{{ planningService.error() }}</p>
          </div>
        } @else if (!planningService.hasPlan()) {
          <div class="empty-message">
            <p class="placeholder-text">Intelligent meal planning powered by AI</p>
            <p class="placeholder-subtext">Click "Generate" to create a meal plan</p>
          </div>
        } @else {
          <div class="plan-list" #planList>
            @for (item of planningService.planItems(); track item.id; let i = $index) {
              <div
                class="plan-item"
                [class.swiping]="swipingIndex() === i"
                [style.transform]="getSwipeTransform(i)"
                (touchstart)="onTouchStart($event, i)"
                (touchmove)="onTouchMove($event, i)"
                (touchend)="onTouchEnd($event, i)">

                <div class="item-content">
                  <!-- Thumbnail -->
                  <div class="item-thumbnail">
                    @if (item.foodImageThumbnail) {
                      <img [src]="item.foodImageThumbnail" alt="" class="thumbnail-img">
                    } @else {
                      <div class="thumbnail-placeholder"></div>
                    }
                  </div>

                  <!-- Description and quantity -->
                  <div class="item-details">
                    <span class="item-description">
                      {{ item.shortDescription || item.foodName }}
                    </span>
                    <span class="item-quantity">{{ formatQuantity(item.quantity, item.unit) }} {{ item.unit }}</span>
                  </div>

                  <!-- Macros summary -->
                  <div class="item-macros">
                    @if (item.calories) {
                      <span class="macro">{{ item.calories }} cal</span>
                    }
                  </div>
                </div>

                <!-- Delete action (revealed on swipe) -->
                <div class="delete-action">
                  <span>Delete</span>
                </div>
              </div>
            }
          </div>
        }
      </div>

      <!-- Totals footer -->
      @if (planningService.hasPlan()) {
        <div class="plan-totals">
          <span class="total-label">Daily Totals:</span>
          <span class="total-value">{{ planningService.currentPlan()?.totalCalories ?? 0 }} cal</span>
          <span class="total-value">{{ planningService.currentPlan()?.totalProteinG?.toFixed(0) ?? 0 }}g P</span>
          <span class="total-value">{{ planningService.currentPlan()?.totalCarbG?.toFixed(0) ?? 0 }}g C</span>
          <span class="total-value">{{ planningService.currentPlan()?.totalFatG?.toFixed(0) ?? 0 }}g F</span>
        </div>
      }

      <!-- Mini chat panel (bottom-attached, collapsible) -->
      @if (hasRegimenuMessages() || chatService.regimenuIsLoading()) {
        <div class="mini-chat-panel" [class.collapsed]="isChatCollapsed()">
          <button class="mini-chat-toggle" (click)="toggleChat()">
            <span class="toggle-icon">{{ isChatCollapsed() ? '▲' : '▼' }}</span>
            <span class="toggle-label">AI Chat</span>
          </button>
          @if (!isChatCollapsed()) {
            <app-chat-output context="regimenu" [condensed]="true" />
          }
        </div>
      }
    </div>
  `,
  styleUrls: ['./regimenu-panel.scss']
})
export class RegimenuPanelComponent {
  private tabService = inject(TabService);
  chatService = inject(ChatService);
  planningService = inject(PlanningService);
  private notificationService = inject(NotificationService);

  @ViewChild('planList') planListRef!: ElementRef<HTMLElement>;

  isChatCollapsed = signal(false);
  hasChanges = signal(false);
  isSaving = signal(false);
  private pendingName: string | null = null;

  // Swipe state
  swipingIndex = signal<number | null>(null);
  swipeOffset = signal(0);

  // Touch tracking
  private touchStartX = 0;
  private touchStartY = 0;
  private touchStartTime = 0;
  private isSwiping = false;

  hasRegimenuMessages = computed(() => this.chatService.regimenuMessages().length > 0);

  formatQuantity(quantity: number, unit: string): string {
    if (unit === 'g') {
      return String(Math.ceil(quantity));
    }
    if (unit === 'oz') {
      return String(Math.ceil(quantity * 10) / 10);
    }
    return String(Math.round(quantity * 10) / 10);
  }

  toggleChat(): void {
    this.isChatCollapsed.update(v => !v);
  }

  onPlanNameInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.pendingName = value;
    this.hasChanges.set(true);
  }

  onPlanNameBlur(): void {
    // Changes are saved via the save button
  }

  async savePlan(): Promise<void> {
    const plan = this.planningService.currentPlan();
    if (!plan) return;

    this.isSaving.set(true);
    try {
      const updates: { name?: string } = {};
      if (this.pendingName !== null) {
        updates.name = this.pendingName;
      }
      await this.planningService.updatePlan(plan.id, updates);
      this.pendingName = null;
      this.hasChanges.set(false);
      this.notificationService.show('Plan saved', 'success');
    } catch {
      this.notificationService.show('Failed to save plan', 'error');
    } finally {
      this.isSaving.set(false);
    }
  }

  closePanel(): void {
    this.tabService.closeTab('meal-planning');
  }

  async generatePlan(): Promise<void> {
    try {
      await this.planningService.generatePlan();
      this.notificationService.show('Meal plan generated', 'success');
    } catch {
      this.notificationService.show('Failed to generate plan', 'error');
    }
  }

  async toggleFavorite(): Promise<void> {
    try {
      await this.planningService.toggleFavorite();
    } catch {
      this.notificationService.show('Failed to update favorite', 'error');
    }
  }

  // Swipe handling for delete
  onTouchStart(event: TouchEvent, index: number): void {
    const touch = event.touches[0];
    this.touchStartX = touch.clientX;
    this.touchStartY = touch.clientY;
    this.touchStartTime = Date.now();
    this.isSwiping = false;
  }

  onTouchMove(event: TouchEvent, index: number): void {
    const touch = event.touches[0];
    const deltaX = touch.clientX - this.touchStartX;
    const deltaY = touch.clientY - this.touchStartY;

    // Only allow left swipe (negative deltaX) and ignore vertical scrolling
    if (Math.abs(deltaY) > Math.abs(deltaX)) {
      return;
    }

    if (deltaX < -10) {
      this.isSwiping = true;
      this.swipingIndex.set(index);
      // Limit swipe to -100px (delete action width)
      this.swipeOffset.set(Math.max(deltaX, -100));
      event.preventDefault();
    }
  }

  onTouchEnd(event: TouchEvent, index: number): void {
    if (!this.isSwiping) {
      this.resetSwipe();
      return;
    }

    const deltaTime = Date.now() - this.touchStartTime;
    const threshold = -50; // Halfway point

    // If swiped past threshold or fast swipe, trigger delete
    if (this.swipeOffset() < threshold || (this.swipeOffset() < -20 && deltaTime < 200)) {
      this.deleteItem(index);
    }

    this.resetSwipe();
  }

  private resetSwipe(): void {
    this.swipingIndex.set(null);
    this.swipeOffset.set(0);
    this.isSwiping = false;
  }

  getSwipeTransform(index: number): string {
    if (this.swipingIndex() === index) {
      return `translateX(${this.swipeOffset()}px)`;
    }
    return 'translateX(0)';
  }

  deleteItem(index: number): void {
    const items = this.planningService.planItems();
    if (items[index]) {
      this.planningService.deleteItem(items[index].id!);
      this.notificationService.show('Item removed', 'success');
    }
  }
}
