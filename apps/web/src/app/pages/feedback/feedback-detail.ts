import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  FEEDBACK_ACTION_LABEL,
  FEEDBACK_CATEGORY_LABEL,
  FEEDBACK_SOURCE_ICON,
  FEEDBACK_STATUS_LABEL,
  Feedback,
  FeedbackService,
  FeedbackStatus,
  RELATED_TYPE_LABEL,
  feedbackCategoryClass,
  feedbackStatusClass,
  relatedLink,
  sourceText,
} from '../../core/feedback.service';
import { formatDate } from '../../core/format';
import { apiErrorMessage } from '../../core/http-error';
import { StarRating } from '../../ui/star-rating';

const STEPS: FeedbackStatus[] = ['NEW', 'IN_PROGRESS', 'RESOLVED'];

@Component({
  selector: 'app-feedback-detail',
  imports: [RouterLink, StarRating],
  templateUrl: './feedback-detail.html',
  styleUrls: ['../invoices/invoice-detail.scss', './feedback-detail.scss'],
})
export class FeedbackDetailPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly feedbackApi = inject(FeedbackService);

  protected readonly feedback = signal<Feedback | null>(null);
  protected readonly loading = signal(true);
  protected readonly loadError = signal('');
  protected readonly actionError = signal('');
  protected readonly busy = signal(false);
  protected readonly selectedStatus = signal<FeedbackStatus | ''>('');
  protected readonly resolution = signal('');

  protected readonly statusLabel = FEEDBACK_STATUS_LABEL;
  protected readonly actionLabel = FEEDBACK_ACTION_LABEL;
  protected readonly categoryLabel = FEEDBACK_CATEGORY_LABEL;
  protected readonly sourceIcon = FEEDBACK_SOURCE_ICON;
  protected readonly relatedTypeLabel = RELATED_TYPE_LABEL;
  protected readonly statusClass = feedbackStatusClass;
  protected readonly categoryClass = feedbackCategoryClass;
  protected readonly relatedLink = relatedLink;
  protected readonly sourceText = sourceText;
  protected readonly formatDate = formatDate;

  protected readonly history = computed(() => (this.feedback()?.history ?? []).slice().reverse());
  protected readonly tracker = computed(() => {
    const index = STEPS.indexOf(this.feedback()?.status ?? 'NEW');
    return STEPS.map((key, position) => ({
      key,
      label: FEEDBACK_STATUS_LABEL[key],
      state: position < index ? 'done' : position === index ? 'current' : 'todo',
    }));
  });

  constructor() {
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe(() => void this.load());
  }

  protected isLink(value: string): boolean {
    return /^https?:\/\//i.test(value);
  }

  protected updateSelection(event: Event): void {
    this.selectedStatus.set((event.target as HTMLSelectElement).value as FeedbackStatus);
    this.actionError.set('');
  }

  protected updateResolution(event: Event): void {
    this.resolution.set((event.target as HTMLTextAreaElement).value);
  }

  protected async applyStatus(): Promise<void> {
    const feedback = this.feedback();
    const status = this.selectedStatus();
    if (!feedback || !status) return;

    if (status === 'RESOLVED' && this.resolution().trim().length < 3) {
      this.actionError.set('Describe how the feedback was resolved.');
      return;
    }

    this.busy.set(true);
    this.actionError.set('');
    try {
      this.feedback.set(
        await this.feedbackApi.changeStatus(
          feedback.id,
          status,
          status === 'RESOLVED' ? this.resolution().trim() : undefined,
        ),
      );
      this.selectedStatus.set('');
      this.resolution.set('');
    } catch (error) {
      this.actionError.set(apiErrorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }

  protected async remove(): Promise<void> {
    const feedback = this.feedback();
    if (!feedback || !confirm(`Delete the feedback "${feedback.subject}"?`)) return;

    this.busy.set(true);
    try {
      await this.feedbackApi.remove(feedback.id);
      await this.router.navigate(['/feedback']);
    } catch (error) {
      this.actionError.set(apiErrorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }

  protected historyTitle(entry: Feedback['history'][number]): string {
    if (entry.action === 'feedback.created') return 'Feedback logged';
    if (entry.action === 'feedback.updated') return 'Feedback edited';
    const label = (status: FeedbackStatus | null) => (status ? FEEDBACK_STATUS_LABEL[status] : '—');
    return `${label(entry.fromStatus)} → ${label(entry.toStatus)}`;
  }

  protected formatDateTime(value: string): string {
    return new Intl.DateTimeFormat('en-US', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value));
  }

  private async load(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('id');
    this.loading.set(true);
    this.loadError.set('');
    this.selectedStatus.set('');
    this.resolution.set('');

    if (!id) {
      this.loadError.set('Feedback not found.');
      this.loading.set(false);
      return;
    }

    try {
      this.feedback.set(await this.feedbackApi.get(id));
    } catch (error) {
      this.loadError.set(apiErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }
}
