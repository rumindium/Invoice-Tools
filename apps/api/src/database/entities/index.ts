import { Company, DocumentTemplate } from './company.entity';
import { CatalogItem, Customer, CustomerContact } from './customer.entity';
import {
  Document,
  DocumentItem,
  DocumentNumberSequence,
  DocumentRelation,
  DocumentRevision,
} from './document.entity';
import { CustomerFeedback } from './feedback.entity';
import { InvoiceFollowUp } from './follow-up.entity';
import { Asset, Payment, PrintToken } from './payment.entity';
import { AuditEvent, BackgroundJob, IdempotencyKey } from './system.entity';
import { TemplateAsset, TemplateDesign } from './template-design.entity';
import { TerminPlan, TerminPlanItem } from './termin.entity';
import { UnitOfMeasure } from './unit.entity';
import { AuthToken, Session, User } from './user.entity';
import { Workspace, WorkspaceMember } from './workspace.entity';

export const entities = [
  User,
  Session,
  AuthToken,
  Workspace,
  WorkspaceMember,
  Company,
  DocumentTemplate,
  TemplateDesign,
  TemplateAsset,
  Customer,
  CustomerContact,
  CatalogItem,
  UnitOfMeasure,
  Document,
  DocumentItem,
  DocumentNumberSequence,
  DocumentRelation,
  DocumentRevision,
  TerminPlan,
  TerminPlanItem,
  InvoiceFollowUp,
  CustomerFeedback,
  Payment,
  Asset,
  PrintToken,
  BackgroundJob,
  AuditEvent,
  IdempotencyKey,
];

export {
  Asset,
  AuditEvent,
  AuthToken,
  BackgroundJob,
  CatalogItem,
  Company,
  Customer,
  CustomerContact,
  CustomerFeedback,
  Document,
  DocumentItem,
  DocumentNumberSequence,
  DocumentRelation,
  DocumentRevision,
  DocumentTemplate,
  IdempotencyKey,
  InvoiceFollowUp,
  Payment,
  PrintToken,
  Session,
  TemplateAsset,
  TemplateDesign,
  TerminPlan,
  TerminPlanItem,
  UnitOfMeasure,
  User,
  Workspace,
  WorkspaceMember,
};
