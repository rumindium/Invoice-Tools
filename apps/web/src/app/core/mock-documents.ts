export type DocumentStatus = 'PAID' | 'SENT' | 'DRAFT' | 'OVERDUE';

export interface MockDocument {
  id: string;
  number: string;
  customer: string;
  issueDate: string;
  total: number;
  status: DocumentStatus;
}

export const STATUS_LABEL: Record<DocumentStatus, string> = {
  PAID: 'Paid',
  SENT: 'Sent',
  DRAFT: 'Draft',
  OVERDUE: 'Overdue',
};

export const MOCK_DOCUMENTS: MockDocument[] = [
  {
    id: 'inv-1',
    number: 'INV/2026/0042',
    customer: 'PT Nusantara Jaya',
    issueDate: '2026-11-14',
    total: 974050,
    status: 'SENT',
  },
  {
    id: 'inv-2',
    number: 'INV/2026/0041',
    customer: 'CV Bumi Kreatif',
    issueDate: '2026-11-08',
    total: 2250000,
    status: 'OVERDUE',
  },
  {
    id: 'inv-3',
    number: 'INV/2026/0040',
    customer: 'Kopi Senja Studio',
    issueDate: '2026-11-05',
    total: 3850000,
    status: 'PAID',
  },
  {
    id: 'inv-4',
    number: 'INV/2026/0039',
    customer: 'PT Sinar Rasa',
    issueDate: '2026-11-01',
    total: 7800000,
    status: 'DRAFT',
  },
  {
    id: 'inv-5',
    number: 'INV/2026/0038',
    customer: 'CV Karya Pagi',
    issueDate: '2026-10-28',
    total: 1500000,
    status: 'PAID',
  },
];

export function formatIdr(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatDate(value: string): string {
  return new Intl.DateTimeFormat('en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(`${value}T00:00:00`));
}
