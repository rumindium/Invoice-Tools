export enum WorkspaceRole {
  OWNER = 'OWNER',
  ADMIN = 'ADMIN',
  MEMBER = 'MEMBER',
  VIEWER = 'VIEWER',
}

export enum DocumentType {
  QUOTATION = 'QUOTATION',
  SALES_ORDER = 'SALES_ORDER',
  DELIVERY_ORDER = 'DELIVERY_ORDER',
  INVOICE = 'INVOICE',
  RECEIPT = 'RECEIPT',
  CREDIT_NOTE = 'CREDIT_NOTE',
  DEBIT_NOTE = 'DEBIT_NOTE',
}

export enum DocumentStatus {
  DRAFT = 'DRAFT',
  SENT = 'SENT',
  ACCEPTED = 'ACCEPTED',
  REJECTED = 'REJECTED',
  EXPIRED = 'EXPIRED',
  CONFIRMED = 'CONFIRMED',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  ISSUED = 'ISSUED',
  PARTIALLY_PAID = 'PARTIALLY_PAID',
  PAID = 'PAID',
  OVERDUE = 'OVERDUE',
  VOID = 'VOID',
  PARTIALLY_DELIVERED = 'PARTIALLY_DELIVERED',
  DELIVERED = 'DELIVERED',
}

export enum TaxMode {
  EXCLUSIVE = 'EXCLUSIVE',
  INCLUSIVE = 'INCLUSIVE',
}

export enum DiscountType {
  NONE = 'NONE',
  PERCENT = 'PERCENT',
  AMOUNT = 'AMOUNT',
}

export enum CustomerType {
  INDIVIDUAL = 'INDIVIDUAL',
  BUSINESS = 'BUSINESS',
}

export enum CatalogKind {
  PRODUCT = 'PRODUCT',
  SERVICE = 'SERVICE',
}

export enum QuotationLabel {
  QUOTATION = 'QUOTATION',
  SPH = 'SPH',
  BOTH = 'BOTH',
}

export enum PaymentMethod {
  CASH = 'CASH',
  BANK_TRANSFER = 'BANK_TRANSFER',
  CARD = 'CARD',
  OTHER = 'OTHER',
}

export enum PaymentStatus {
  RECORDED = 'RECORDED',
  VOIDED = 'VOIDED',
}

export enum RelationType {
  CONVERTED_TO = 'CONVERTED_TO',
  REVISED_FROM = 'REVISED_FROM',
  RECEIPT_FOR = 'RECEIPT_FOR',
  CREDIT_OF = 'CREDIT_OF',
  DEBIT_OF = 'DEBIT_OF',
}

export enum SequenceReset {
  NEVER = 'NEVER',
  YEARLY = 'YEARLY',
  MONTHLY = 'MONTHLY',
}

export enum JobStatus {
  QUEUED = 'QUEUED',
  RUNNING = 'RUNNING',
  SUCCEEDED = 'SUCCEEDED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}
