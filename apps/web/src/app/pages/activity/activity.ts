import { Component, computed, inject, signal } from '@angular/core';
import { AuditEvent, AuditService, AuditTargetType } from '../../core/audit.service';
import { formatIdr } from '../../core/format';
import { apiErrorMessage } from '../../core/http-error';

const ACTION_LABEL: Record<string, string> = {
  'auth.registered': 'Account created',
  'auth.login': 'Signed in',
  'auth.login_failed': 'Sign-in failed',
  'auth.logout': 'Signed out',
  'auth.email_verified': 'Email verified',
  'auth.password_reset_requested': 'Password reset requested',
  'auth.password_reset': 'Password reset',
  'auth.password_changed': 'Password changed',
  'auth.profile_updated': 'Profile updated',
  'quotation.revised': 'Quotation revised',
  'goods_receipt.revised': 'Goods receipt revised',
  'invoice.revised': 'Invoice revised',
  'quotation.created': 'Quotation created',
  'quotation.updated': 'Quotation updated',
  'quotation.deleted': 'Quotation deleted',
  'quotation.status_changed': 'Quotation status changed',
  'quotation.goods_receipt_created': 'Goods receipt generated from quotation',
  'goods_receipt.created': 'Goods receipt created',
  'goods_receipt.updated': 'Goods receipt updated',
  'goods_receipt.deleted': 'Goods receipt deleted',
  'goods_receipt.status_changed': 'Goods receipt status changed',
  'goods_receipt.invoice_created': 'Invoice generated from goods receipt',
  'quotation.termin_plan_created': 'Quotation split into goods receipt termins',
  'quotation.termin_plan_updated': 'Goods receipt termin split changed',
  'quotation.termin_plan_deleted': 'Goods receipt termin plan deleted',
  'goods_receipt.termin_plan_created': 'Goods receipt split into invoice termins',
  'goods_receipt.termin_plan_updated': 'Invoice termin split changed',
  'goods_receipt.termin_plan_deleted': 'Invoice termin plan deleted',
  'invoice.termin_plan_created': 'Invoice split into payment termins',
  'invoice.termin_plan_updated': 'Invoice termin split changed',
  'invoice.termin_plan_deleted': 'Invoice termin plan deleted',
  'invoice.created': 'Invoice created',
  'invoice.updated': 'Invoice updated',
  'invoice.deleted': 'Invoice deleted',
  'invoice.status_changed': 'Invoice status changed',
  'invoice.follow_up_added': 'Follow-up added',
  'invoice.follow_up_status_changed': 'Follow-up status changed',
  'invoice.follow_up_deleted': 'Follow-up deleted',
  'customer.created': 'Customer created',
  'customer.updated': 'Customer updated',
  'customer.archived': 'Customer archived',
  'customer.contact_added': 'PIC added',
  'customer.contact_updated': 'PIC updated',
  'customer.contact_removed': 'PIC removed',
  'item.created': 'Item created',
  'item.updated': 'Item updated',
  'item.archived': 'Item archived',
  'unit.created': 'Unit of measure added',
  'unit.removed': 'Unit of measure removed',
  'company.created': 'Company created',
  'feedback.created': 'Feedback logged',
  'feedback.updated': 'Feedback edited',
  'feedback.status_changed': 'Feedback status changed',
  'feedback.deleted': 'Feedback deleted',
  'company.updated': 'Company updated',
  'company.archived': 'Company archived',
  'template.applied': 'Template applied',
};

const TARGET_LABEL: Record<AuditTargetType | 'ALL', string> = {
  ALL: 'Everything',
  user: 'Account',
  quotation: 'Quotations',
  goods_receipt: 'Goods receipts',
  invoice: 'Invoices',
  customer: 'Customers',
  item: 'Items',
  unit: 'Units',
  company: 'Company',
  feedback: 'Feedback',
  template: 'Templates',
};

const PAGE_SIZE = 50;

@Component({
  selector: 'app-activity',
  templateUrl: './activity.html',
  styleUrl: './activity.scss',
})
export class ActivityPage {
  private readonly auditApi = inject(AuditService);

  protected readonly events = signal<AuditEvent[]>([]);
  protected readonly total = signal(0);
  protected readonly page = signal(1);
  protected readonly loading = signal(true);
  protected readonly loadingMore = signal(false);
  protected readonly error = signal('');
  protected readonly filter = signal<AuditTargetType | 'ALL'>('ALL');

  protected readonly filters = Object.keys(TARGET_LABEL) as Array<AuditTargetType | 'ALL'>;
  protected readonly filterLabel = TARGET_LABEL;

  protected readonly hasMore = computed(() => this.events().length < this.total());

  protected readonly formatIdr = formatIdr;

  constructor() {
    void this.load(true);
  }

  protected actionLabel(event: AuditEvent): string {
    return ACTION_LABEL[event.action] ?? event.action;
  }

  protected targetLabel(event: AuditEvent): string {
    const metadata = event.metadata ?? {};
    const named = metadata['name'] ?? metadata['number'] ?? metadata['activity'];

    if (typeof named === 'string' && named.trim()) {
      return named;
    }

    return event.targetId.length > 12 ? `${event.targetId.slice(0, 8)}…` : event.targetId;
  }

  protected detail(event: AuditEvent): string {
    const metadata = event.metadata ?? {};
    const parts: string[] = [];

    if (typeof metadata['from'] === 'string' || typeof metadata['to'] === 'string') {
      const from = typeof metadata['from'] === 'string' ? metadata['from'] : '—';
      const to = typeof metadata['to'] === 'string' ? metadata['to'] : '—';
      parts.push(`${from} → ${to}`);
    }

    if (typeof metadata['method'] === 'string') {
      parts.push(metadata['method']);
    }

    const total = metadata['total'];
    if (typeof total === 'number' && total > 0) {
      parts.push(formatIdr(total));
    }

    const termin = metadata['termin'] as { sequence?: number; count?: number } | undefined;
    if (termin && typeof termin.sequence === 'number') {
      parts.push(`Termin ${termin.sequence}${termin.count ? ` of ${termin.count}` : ''}`);
    }

    const percentages = metadata['percentages'];
    if (Array.isArray(percentages) && event.action.includes('.termin_plan_')) {
      parts.push(percentages.map((value) => `${value}%`).join(' / '));
    }

    if (event.action.startsWith('auth.') && typeof metadata['email'] === 'string') {
      parts.push(metadata['email']);
    }

    return parts.join(' · ');
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

  protected actor(event: AuditEvent): string {
    return event.actorName ?? event.actorEmail ?? 'System';
  }

  protected setFilter(filter: AuditTargetType | 'ALL'): void {
    if (this.filter() === filter) {
      return;
    }

    this.filter.set(filter);
    void this.load(true);
  }

  protected async loadMore(): Promise<void> {
    if (this.loadingMore() || !this.hasMore()) {
      return;
    }

    this.loadingMore.set(true);

    try {
      const next = await this.auditApi.list({
        page: this.page() + 1,
        pageSize: PAGE_SIZE,
        targetType: this.filter(),
      });

      this.events.update((events) => [...events, ...next.events]);
      this.page.set(next.page);
      this.total.set(next.total);
    } catch (error) {
      this.error.set(apiErrorMessage(error));
    } finally {
      this.loadingMore.set(false);
    }
  }

  private async load(reset: boolean): Promise<void> {
    if (reset) {
      this.loading.set(true);
      this.error.set('');
    }

    try {
      const result = await this.auditApi.list({
        page: 1,
        pageSize: PAGE_SIZE,
        targetType: this.filter(),
      });

      this.events.set(result.events);
      this.total.set(result.total);
      this.page.set(result.page);
    } catch (error) {
      this.error.set(apiErrorMessage(error));
      this.events.set([]);
      this.total.set(0);
    } finally {
      this.loading.set(false);
    }
  }
}
