import { NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { EntityManager, In, IsNull, Repository } from 'typeorm';
import {
  AuditEvent,
  CatalogItem,
  Company,
  Customer,
  CustomerContact,
  DocumentItem,
  DocumentNumberSequence,
} from '../database/entities';
import { DiscountType, DocumentType, SequenceReset } from '../database/entities/enums';
import { calculateDocument } from './calculation';

/**
 * Building blocks shared by every sales document (invoices, quotations): the customer
 * snapshot, catalog links, item rows, numbering and the audit-based history.
 */

export interface ContactSnapshot {
  id: string | null;
  name: string;
  jobTitle: string | null;
  phone: string | null;
}

export interface CustomerSnapshot extends Record<string, unknown> {
  id: string | null;
  name: string;
  email: string | null;
  address: string | null;
  phone: string | null;
  contact: ContactSnapshot | null;
}

export interface DocumentCustomerInput {
  id?: string;
  contactId?: string;
  name: string;
  email?: string;
  address?: string;
  phone?: string;
}

/** A person to address the document to when no saved PIC is picked (quotations). */
export interface AttentionInput {
  name?: string;
  jobTitle?: string;
}

export interface DocumentHistoryEntry {
  id: string;
  action: string;
  fromStatus: string | null;
  toStatus: string | null;
  reason: string | null;
  /** The version a revision created (revision events only). */
  revision: number | null;
  /** Termin documents: which termin was generated (creation events only). */
  termin: { sequence: number; count: number; percentage: number } | null;
  actorName: string | null;
  at: string;
}

export function toDateOnly(value: string): string {
  return value.slice(0, 10);
}

export function customerAddress(customer: Customer): string | null {
  return (customer.billingAddress as { line1?: string } | null)?.line1 ?? null;
}

function attentionSnapshot(attention?: AttentionInput): ContactSnapshot | null {
  const name = attention?.name?.trim();
  return name
    ? { id: null, name, jobTitle: attention?.jobTitle?.trim() || null, phone: null }
    : null;
}

export async function resolveDocumentCustomer(
  manager: EntityManager,
  workspaceId: string,
  customer: DocumentCustomerInput,
  attention?: AttentionInput,
): Promise<{ customer: Customer; snapshot: CustomerSnapshot }> {
  const repository = manager.getRepository(Customer);
  const name = customer.name.trim();
  const email = customer.email?.trim().toLowerCase() || null;
  const address = customer.address?.trim() || null;
  const phone = customer.phone?.trim() || null;
  const customerId = customer.id?.trim();

  if (!customerId) {
    const created = await findOrCreateCustomer(manager, workspaceId, {
      id: null,
      name,
      email,
      address,
      phone,
    });

    return {
      customer: created,
      snapshot: {
        id: created.id,
        name,
        email,
        address,
        phone,
        contact: attentionSnapshot(attention),
      },
    };
  }

  const existing = await repository.findOne({
    where: { id: customerId, workspaceId, archivedAt: IsNull() },
  });

  if (!existing) {
    throw new NotFoundException('Customer not found.');
  }

  let contact: ContactSnapshot | null;
  const contactId = customer.contactId?.trim();

  if (contactId) {
    const found = await manager.getRepository(CustomerContact).findOne({
      where: { id: contactId, customerId: existing.id },
    });

    if (!found) {
      throw new NotFoundException('PIC not found.');
    }

    contact = {
      id: found.id,
      name: found.name,
      jobTitle: found.jobTitle,
      phone: found.phone,
    };
  } else {
    contact = attentionSnapshot(attention);
  }

  return {
    customer: existing,
    snapshot: {
      id: existing.id,
      name,
      email: email ?? existing.email,
      address: address ?? customerAddress(existing),
      phone: phone ?? existing.phone,
      contact,
    },
  };
}

async function findOrCreateCustomer(
  manager: EntityManager,
  workspaceId: string,
  snapshot: {
    id: string | null;
    name: string;
    email: string | null;
    address: string | null;
    phone: string | null;
  },
): Promise<Customer> {
  const repository = manager.getRepository(Customer);
  const existing = await repository.findOne({
    where: { workspaceId, name: snapshot.name, archivedAt: IsNull() },
  });

  if (existing) {
    if (snapshot.email) {
      existing.email = snapshot.email;
    }

    if (snapshot.phone) {
      existing.phone = snapshot.phone;
    }

    if (snapshot.address) {
      existing.billingAddress = { line1: snapshot.address };
    }

    return repository.save(existing);
  }

  return repository.save(
    repository.create({
      id: randomUUID(),
      workspaceId,
      name: snapshot.name,
      email: snapshot.email,
      phone: snapshot.phone,
      billingAddress: snapshot.address ? { line1: snapshot.address } : null,
    }),
  );
}

/** An id from another workspace, or from an archived item, is dropped instead of failing the save. */
export async function resolveCatalogItemIds(
  manager: EntityManager,
  workspaceId: string,
  items: Array<{ catalogItemId?: string }>,
): Promise<Array<string | null>> {
  const ids = [
    ...new Set(
      items.map((item) => item.catalogItemId?.trim()).filter((id): id is string => Boolean(id)),
    ),
  ];

  if (ids.length === 0) {
    return items.map(() => null);
  }

  const found = await manager.getRepository(CatalogItem).find({
    where: { workspaceId, id: In(ids), archivedAt: IsNull() },
    select: { id: true },
  });
  const valid = new Set(found.map((item) => item.id));

  return items.map((item) => {
    const id = item.catalogItemId?.trim();
    return id && valid.has(id) ? id : null;
  });
}

export async function saveDocumentItems(
  manager: EntityManager,
  documentId: string,
  items: ReturnType<typeof calculateDocument>['items'],
  catalogItemIds: Array<string | null>,
): Promise<void> {
  const repository = manager.getRepository(DocumentItem);

  await repository.save(
    items.map((item, index) =>
      repository.create({
        id: randomUUID(),
        documentId,
        position: item.position,
        catalogItemId: catalogItemIds[index] ?? null,
        itemName: item.name,
        description: item.description,
        unit: item.unit,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        discountType: item.discountType as DiscountType,
        discountRate: item.discountRate,
        discountAmount: item.discountAmount,
        taxRate: item.taxRate,
        taxAmount: item.taxAmount,
        lineSubtotal: item.lineSubtotal,
        lineTotal: item.lineTotal,
      }),
    ),
  );
}

/**
 * Next number in the company's sequence for one document type, locked for the transaction.
 * Patterns support {YYYY}, {YY}, {MM} and {seq}/{SEQ}; the sequence resets yearly by default.
 */
export async function nextDocumentNumber(
  manager: EntityManager,
  company: Company,
  issueDate: string,
  documentType: DocumentType,
  defaultPattern: string,
  defaultPadding = 4,
): Promise<string> {
  const repository = manager.getRepository(DocumentNumberSequence);
  const year = issueDate.slice(0, 4);
  const month = issueDate.slice(5, 7);
  const existing = await repository.findOne({
    where: { companyId: company.id, documentType },
    lock: { mode: 'pessimistic_write' },
  });

  const resetPolicy = existing?.resetPolicy ?? SequenceReset.YEARLY;
  const periodKey =
    resetPolicy === SequenceReset.MONTHLY
      ? `${year}-${month}`
      : resetPolicy === SequenceReset.NEVER
        ? 'ALL'
        : year;
  const nextValue = existing && existing.periodKey === periodKey ? existing.nextValue : 1;
  const pattern = existing?.pattern ?? defaultPattern;
  const padding = existing?.padding ?? defaultPadding;
  const sequence = String(nextValue).padStart(padding, '0');

  const documentNumber = pattern
    .replace('{YYYY}', year)
    .replace('{YY}', year.slice(2))
    .replace('{MM}', month)
    .replace('{seq}', sequence)
    .replace('{SEQ}', sequence);

  if (existing) {
    await repository.update(
      { id: existing.id },
      { periodKey, nextValue: nextValue + 1, lastIssuedAt: new Date() },
    );
  } else {
    await repository.save(
      repository.create({
        id: randomUUID(),
        companyId: company.id,
        documentType,
        pattern,
        resetPolicy,
        padding,
        periodKey,
        nextValue: nextValue + 1,
        lastIssuedAt: new Date(),
      }),
    );
  }

  return documentNumber;
}

/** Status changes and edits of one document, oldest first, read from the audit log. */
export async function documentHistory(
  audit: Repository<AuditEvent>,
  targetType: string,
  documentId: string,
): Promise<DocumentHistoryEntry[]> {
  const events = await audit.find({
    where: { targetType, targetId: documentId },
    relations: { actor: true },
    order: { createdAt: 'ASC', id: 'ASC' },
  });

  return events.map((event) => {
    const metadata = (event.metadata ?? {}) as {
      from?: string | null;
      to?: string | null;
      reason?: string | null;
      revision?: number | null;
      termin?: { sequence: number; count: number; percentage: number } | null;
    };

    return {
      id: String(event.id),
      action: event.action,
      fromStatus: metadata.from ?? null,
      toStatus: metadata.to ?? null,
      reason: metadata.reason ?? null,
      revision: metadata.revision ?? null,
      termin: metadata.termin ?? null,
      actorName: event.actor?.displayName ?? null,
      at: event.createdAt.toISOString(),
    };
  });
}
