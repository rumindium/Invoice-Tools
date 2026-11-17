import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { CompanyProfileCard } from './company-profile-card/company-profile-card';
import {
  DocumentStatus,
  MOCK_DOCUMENTS,
  STATUS_LABEL,
  formatDate,
  formatIdr,
} from '../../core/mock-documents';

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

  protected readonly user = this.auth.user;
  protected readonly workspace = this.auth.workspace;
  protected readonly recent = MOCK_DOCUMENTS.slice(0, 5);
  protected readonly statusLabel = STATUS_LABEL;
  protected readonly formatDate = formatDate;
  protected readonly formatIdr = formatIdr;

  protected readonly greeting = computed(() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  });

  protected readonly firstName = computed(
    () => this.user()?.displayName.split(/\s+/)[0] ?? 'there',
  );

  protected readonly stats: Stat[] = [
    {
      label: 'Total invoices',
      value: '24',
      detail: '+3 this month',
      tone: 'blue',
      icon: 'documents',
    },
    {
      label: 'Unpaid',
      value: 'IDR 12.45m',
      detail: '3 invoices need attention',
      tone: 'amber',
      icon: 'clock',
    },
    {
      label: 'Paid',
      value: '11',
      detail: 'IDR 8.2m received',
      tone: 'green',
      icon: 'check',
    },
    {
      label: 'Drafts',
      value: '3',
      detail: 'Need completion',
      tone: 'violet',
      icon: 'edit',
    },
  ];

  protected statusClass(status: DocumentStatus): string {
    switch (status) {
      case 'PAID':
        return 'ui-badge ui-badge-green';
      case 'SENT':
        return 'ui-badge ui-badge-blue';
      case 'OVERDUE':
        return 'ui-badge ui-badge-red';
      default:
        return 'ui-badge ui-badge-neutral';
    }
  }
}
