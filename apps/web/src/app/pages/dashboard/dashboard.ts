import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { formatDate, formatIdr } from '../../core/format';
import {
  InvoiceService,
  STATUS_LABEL,
  displayStatus,
  statusClass,
} from '../../core/invoice.service';
import { CompanyProfileCard } from './company-profile-card/company-profile-card';

interface Stat {
  label: string;
  value: string;
  detail: string;
  tone: 'blue' | 'amber' | 'violet' | 'green';
  icon: 'documents' | 'clock' | 'check' | 'edit';
}

@Component({
  selector: 'app-dashboard',
  imports: [RouterLink, CompanyProfileCard],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
})
export class DashboardPage {
  private readonly auth = inject(AuthService);
  private readonly invoicesApi = inject(InvoiceService);

  protected readonly user = this.auth.user;
  protected readonly workspace = this.auth.workspace;
  protected readonly statusLabel = STATUS_LABEL;
  protected readonly formatDate = formatDate;
  protected readonly formatIdr = formatIdr;
  protected readonly statusClass = statusClass;
  protected readonly displayStatus = displayStatus;

  protected readonly recent = computed(() =>
    this.invoicesApi
      .invoices()
      .slice(0, 5)
      .map((row) => ({
        id: row.id,
        number: row.number ?? 'Draft',
        customer: row.customerName,
        issueDate: row.issueDate,
        total: row.total,
        status: displayStatus(row),
      })),
  );

  protected readonly greeting = computed(() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  });

  protected readonly firstName = computed(
    () => this.user()?.displayName.split(/\s+/)[0] ?? 'there',
  );

  protected readonly stats = computed<Stat[]>(() => {
    const summary = this.invoicesApi.summary();

    return [
      {
        label: 'Total invoices',
        value: String(summary?.totalInvoices ?? 0),
        detail: `+${summary?.totalThisMonth ?? 0} this month`,
        tone: 'blue',
        icon: 'documents',
      },
      {
        label: 'Unpaid',
        value: formatIdr(summary?.outstandingTotal ?? 0),
        detail: `${summary?.outstandingCount ?? 0} awaiting payment`,
        tone: 'amber',
        icon: 'clock',
      },
      {
        label: 'Paid',
        value: String(summary?.paidCount ?? 0),
        detail: `${formatIdr(summary?.paidTotal ?? 0)} received`,
        tone: 'green',
        icon: 'check',
      },
      {
        label: 'Drafts',
        value: String(summary?.draftCount ?? 0),
        detail: 'Need completion',
        tone: 'violet',
        icon: 'edit',
      },
    ];
  });

  constructor() {
    void this.invoicesApi.loadInvoices();
    void this.invoicesApi.loadSummary();
  }
}
