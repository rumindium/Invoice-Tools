import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  FEEDBACK_CATEGORIES,
  FEEDBACK_CATEGORY_LABEL,
  FEEDBACK_SOURCES,
  FEEDBACK_SOURCE_ICON,
  FEEDBACK_SOURCE_LABEL,
  FEEDBACK_STATUS_LABEL,
  FeedbackCategory,
  FeedbackService,
  FeedbackSource,
  FeedbackStatus,
  RELATED_TYPE_LABEL,
  feedbackCategoryClass,
  feedbackStatusClass,
  relatedLink,
  sourceText,
} from '../../core/feedback.service';
import { formatDate } from '../../core/format';
import { StarRating } from '../../ui/star-rating';

@Component({
  selector: 'app-feedback-list',
  imports: [RouterLink, StarRating],
  templateUrl: './feedback-list.html',
  styleUrls: ['../documents/documents.scss', './feedback.scss'],
})
export class FeedbackListPage {
  private readonly feedbackApi = inject(FeedbackService);

  protected readonly rows = this.feedbackApi.rows;
  protected readonly loading = this.feedbackApi.listLoading;
  protected readonly loadError = this.feedbackApi.listError;
  protected readonly summary = this.feedbackApi.summary;

  protected readonly search = signal('');
  protected readonly status = signal<FeedbackStatus | 'OPEN' | 'ALL'>('ALL');
  protected readonly source = signal<FeedbackSource | 'ALL'>('ALL');
  protected readonly category = signal<FeedbackCategory | 'ALL'>('ALL');

  protected readonly sources = FEEDBACK_SOURCES;
  protected readonly categories = FEEDBACK_CATEGORIES;
  protected readonly sourceLabel = FEEDBACK_SOURCE_LABEL;
  protected readonly sourceIcon = FEEDBACK_SOURCE_ICON;
  protected readonly categoryLabel = FEEDBACK_CATEGORY_LABEL;
  protected readonly statusLabel = FEEDBACK_STATUS_LABEL;
  protected readonly relatedTypeLabel = RELATED_TYPE_LABEL;
  protected readonly statusClass = feedbackStatusClass;
  protected readonly categoryClass = feedbackCategoryClass;
  protected readonly relatedLink = relatedLink;
  protected readonly sourceText = sourceText;
  protected readonly formatDate = formatDate;

  private searchTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    void this.reload();
    void this.feedbackApi.loadSummary();
  }

  protected updateSearch(event: Event): void {
    this.search.set((event.target as HTMLInputElement).value);
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => void this.reload(), 250);
  }

  protected clearSearch(): void {
    this.search.set('');
    void this.reload();
  }

  protected setSource(source: FeedbackSource | 'ALL'): void {
    this.source.set(source);
    void this.reload();
  }

  protected updateStatus(event: Event): void {
    this.status.set((event.target as HTMLSelectElement).value as FeedbackStatus | 'OPEN' | 'ALL');
    void this.reload();
  }

  protected updateCategory(event: Event): void {
    this.category.set((event.target as HTMLSelectElement).value as FeedbackCategory | 'ALL');
    void this.reload();
  }

  private async reload(): Promise<void> {
    await this.feedbackApi.load({
      search: this.search(),
      status: this.status(),
      source: this.source(),
      category: this.category(),
    });
  }
}
