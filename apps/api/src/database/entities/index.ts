import { Company, DocumentTemplate } from './company.entity';
import { CatalogItem, Customer } from './customer.entity';
import {
  Document,
  DocumentItem,
  DocumentNumberSequence,
  DocumentRelation,
  DocumentRevision,
} from './document.entity';
import { Asset, Payment, PrintToken } from './payment.entity';
import { AuditEvent, BackgroundJob, IdempotencyKey } from './system.entity';
import { Session, User } from './user.entity';
import { Workspace, WorkspaceMember } from './workspace.entity';

export const entities = [
  User,
  Session,
  Workspace,
  WorkspaceMember,
  Company,
  DocumentTemplate,
  Customer,
  CatalogItem,
  Document,
  DocumentItem,
  DocumentNumberSequence,
  DocumentRelation,
  DocumentRevision,
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
  BackgroundJob,
  CatalogItem,
  Company,
  Customer,
  Document,
  DocumentItem,
  DocumentNumberSequence,
  DocumentRelation,
  DocumentRevision,
  DocumentTemplate,
  IdempotencyKey,
  Payment,
  PrintToken,
  Session,
  User,
  Workspace,
  WorkspaceMember,
};
