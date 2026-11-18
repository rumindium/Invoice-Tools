import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { ILike, IsNull, Repository } from 'typeorm';
import { ChartPoint, monthBuckets, monthlySeries } from '../common/series';
import { Customer, CustomerContact, Document } from '../database/entities';
import { CustomerType, DocumentStatus, DocumentType } from '../database/entities/enums';
import { toInvoiceListRow, type InvoiceListRow } from '../documents/views';
import { CustomerContactDto, CustomerInputDto, ListCustomersQueryDto } from './dto/customer.dto';

const BILLED_STATUSES: string[] = [
  DocumentStatus.ISSUED,
  DocumentStatus.PARTIALLY_PAID,
  DocumentStatus.PAID,
  DocumentStatus.OVERDUE,
];

const OPEN_STATUSES: string[] = [
  DocumentStatus.ISSUED,
  DocumentStatus.PARTIALLY_PAID,
  DocumentStatus.OVERDUE,
];

interface InvoiceRow {
  id: string;
  customerId: string | null;
  status: string;
  grandTotal: unknown;
  balanceDue: unknown;
  issueDate: string;
}

interface CustomerMetrics {
  invoiceCount: number;
  billedTotal: number;
  outstandingTotal: number;
  lastInvoiceDate: string | null;
}

export interface CustomerContactView {
  id: string;
  name: string;
  jobTitle: string | null;
  phone: string | null;
  createdAt: string;
}

export interface CustomerListRow {
  id: string;
  type: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  taxId: string | null;
  notes: string | null;
  invoiceCount: number;
  billedTotal: number;
  outstandingTotal: number;
  lastInvoiceDate: string | null;
  createdAt: string;
}

export interface CustomerSummary {
  totalCustomers: number;
  newThisMonth: number;
  withOutstanding: number;
  billedTotal: number;
  chart: ChartPoint[];
}

export interface CustomerDetail {
  customer: CustomerListRow & { contacts: CustomerContactView[] };
  stats: CustomerMetrics & { paidTotal: number };
  invoices: InvoiceListRow[];
}

function addressOf(customer: Customer): string | null {
  const address = customer.billingAddress as { line1?: string } | null;
  return address?.line1 ?? null;
}

function toContactView(contact: CustomerContact): CustomerContactView {
  return {
    id: contact.id,
    name: contact.name,
    jobTitle: contact.jobTitle,
    phone: contact.phone,
    createdAt: contact.createdAt.toISOString(),
  };
}

function toCustomerRow(customer: Customer, metrics: CustomerMetrics): CustomerListRow {
  return {
    id: customer.id,
    type: customer.type,
    name: customer.name,
    email: customer.email,
    phone: customer.phone,
    address: addressOf(customer),
    taxId: customer.taxId,
    notes: customer.notes,
    invoiceCount: metrics.invoiceCount,
    billedTotal: metrics.billedTotal,
    outstandingTotal: metrics.outstandingTotal,
    lastInvoiceDate: metrics.lastInvoiceDate,
    createdAt: customer.createdAt.toISOString(),
  };
}

const EMPTY_METRICS: CustomerMetrics = {
  invoiceCount: 0,
  billedTotal: 0,
  outstandingTotal: 0,
  lastInvoiceDate: null,
};

@Injectable()
export class CustomersService {
  constructor(
    @InjectRepository(Customer) private readonly customers: Repository<Customer>,
    @InjectRepository(CustomerContact) private readonly contacts: Repository<CustomerContact>,
    @InjectRepository(Document) private readonly documents: Repository<Document>,
  ) {}

  async list(
    workspaceId: string,
    query: ListCustomersQueryDto,
  ): Promise<{ items: CustomerListRow[]; total: number; summary: CustomerSummary }> {
    const search = query.search?.trim();
    const customers = await this.customers.find({
      where: {
        workspaceId,
        archivedAt: IsNull(),
        ...(search ? { name: ILike(`%${search}%`) } : {}),
      },
      order: { name: 'ASC' },
    });

    const { rows, summary } = await this.aggregate(workspaceId);

    return {
      items: customers.map((customer) =>
        toCustomerRow(customer, rows.get(customer.id) ?? EMPTY_METRICS),
      ),
      total: customers.length,
      summary,
    };
  }

  async summary(workspaceId: string): Promise<CustomerSummary> {
    const { summary } = await this.aggregate(workspaceId);
    return summary;
  }

  async detail(workspaceId: string, customerId: string): Promise<CustomerDetail> {
    const customer = await this.requireOwned(workspaceId, customerId);
    const { rows } = await this.aggregate(workspaceId);
    const metrics = rows.get(customer.id) ?? EMPTY_METRICS;

    const [contacts, invoices, paid] = await Promise.all([
      this.contacts.find({ where: { customerId }, order: { createdAt: 'ASC' } }),
      this.documents.find({
        where: {
          workspaceId,
          customerId,
          documentType: DocumentType.INVOICE,
          deletedAt: IsNull(),
        },
        relations: { customer: true },
        order: { issueDate: 'DESC', createdAt: 'DESC' },
        take: 50,
      }),
      this.documents.find({
        where: {
          workspaceId,
          customerId,
          documentType: DocumentType.INVOICE,
          deletedAt: IsNull(),
          status: DocumentStatus.PAID,
        },
        select: { id: true, grandTotal: true },
      }),
    ]);

    const paidTotal = paid.reduce((total, document) => total + Number(document.grandTotal), 0);

    return {
      customer: {
        ...toCustomerRow(customer, metrics),
        contacts: contacts.map(toContactView),
      },
      stats: { ...metrics, paidTotal },
      invoices: invoices.map((document) => toInvoiceListRow(document)),
    };
  }

  async listContacts(workspaceId: string, customerId: string): Promise<CustomerContactView[]> {
    await this.requireOwned(workspaceId, customerId);

    const contacts = await this.contacts.find({
      where: { customerId },
      order: { createdAt: 'ASC' },
    });

    return contacts.map(toContactView);
  }

  async create(workspaceId: string, dto: CustomerInputDto): Promise<CustomerListRow> {
    const customer = this.customers.create({
      id: randomUUID(),
      workspaceId,
      type: (dto.type ?? CustomerType.INDIVIDUAL) as CustomerType,
      name: dto.name.trim(),
      email: dto.email?.trim().toLowerCase() || null,
      phone: dto.phone?.trim() || null,
      billingAddress: dto.address?.trim() ? { line1: dto.address.trim() } : null,
      taxId: dto.taxId?.trim() || null,
      notes: dto.notes?.trim() || null,
    });

    const saved = await this.customers.save(customer);
    return toCustomerRow(saved, EMPTY_METRICS);
  }

  async update(
    workspaceId: string,
    customerId: string,
    dto: CustomerInputDto,
  ): Promise<CustomerListRow> {
    const customer = await this.requireOwned(workspaceId, customerId);

    Object.assign(customer, {
      type: (dto.type ?? customer.type) as CustomerType,
      name: dto.name.trim(),
      email: dto.email?.trim().toLowerCase() || null,
      phone: dto.phone?.trim() || null,
      billingAddress: dto.address?.trim() ? { line1: dto.address.trim() } : null,
      taxId: dto.taxId?.trim() || null,
      notes: dto.notes?.trim() || null,
    });

    const saved = await this.customers.save(customer);
    const { rows } = await this.aggregate(workspaceId);

    return toCustomerRow(saved, rows.get(saved.id) ?? EMPTY_METRICS);
  }

  async archive(workspaceId: string, customerId: string): Promise<void> {
    await this.requireOwned(workspaceId, customerId);

    await this.contacts.delete({ customerId });
    await this.customers.update({ id: customerId }, { archivedAt: new Date() });
  }

  async addContact(
    workspaceId: string,
    customerId: string,
    dto: CustomerContactDto,
  ): Promise<CustomerContactView> {
    await this.requireOwned(workspaceId, customerId);

    const contact = await this.contacts.save(
      this.contacts.create({
        id: randomUUID(),
        customerId,
        name: dto.name.trim(),
        jobTitle: dto.jobTitle?.trim() || null,
        phone: dto.phone?.trim() || null,
      }),
    );

    return toContactView(contact);
  }

  async updateContact(
    workspaceId: string,
    customerId: string,
    contactId: string,
    dto: CustomerContactDto,
  ): Promise<CustomerContactView> {
    await this.requireOwned(workspaceId, customerId);

    const contact = await this.contacts.findOne({ where: { id: contactId, customerId } });
    if (!contact) {
      throw new NotFoundException('PIC not found.');
    }

    Object.assign(contact, {
      name: dto.name.trim(),
      jobTitle: dto.jobTitle?.trim() || null,
      phone: dto.phone?.trim() || null,
    });

    return toContactView(await this.contacts.save(contact));
  }

  async removeContact(workspaceId: string, customerId: string, contactId: string): Promise<void> {
    await this.requireOwned(workspaceId, customerId);

    const result = await this.contacts.delete({ id: contactId, customerId });
    if (!result.affected) {
      throw new NotFoundException('PIC not found.');
    }
  }

  private async requireOwned(workspaceId: string, customerId: string): Promise<Customer> {
    const customer = await this.customers.findOne({
      where: { id: customerId, workspaceId, archivedAt: IsNull() },
    });

    if (!customer) {
      throw new NotFoundException('Customer not found.');
    }

    return customer;
  }

  private async aggregate(
    workspaceId: string,
  ): Promise<{ rows: Map<string, CustomerMetrics>; summary: CustomerSummary }> {
    const documents = (await this.documents.find({
      where: { workspaceId, documentType: DocumentType.INVOICE, deletedAt: IsNull() },
      select: {
        id: true,
        customerId: true,
        status: true,
        grandTotal: true,
        balanceDue: true,
        issueDate: true,
      },
    })) as InvoiceRow[];

    const rows = new Map<string, CustomerMetrics>();
    const billed: Array<{ issueDate: string; amount: number }> = [];
    let billedTotal = 0;

    for (const document of documents) {
      if (!document.customerId) {
        continue;
      }

      const metrics = rows.get(document.customerId) ?? { ...EMPTY_METRICS };
      const total = Number(document.grandTotal);
      const balance = Number(document.balanceDue);
      const isBilled = BILLED_STATUSES.includes(document.status);

      metrics.invoiceCount += 1;
      if (isBilled) {
        metrics.billedTotal += total;
        billedTotal += total;
        billed.push({ issueDate: document.issueDate, amount: total });
      }

      if (OPEN_STATUSES.includes(document.status)) {
        metrics.outstandingTotal += balance;
      }

      if (!metrics.lastInvoiceDate || document.issueDate > metrics.lastInvoiceDate) {
        metrics.lastInvoiceDate = document.issueDate;
      }

      rows.set(document.customerId, metrics);
    }

    const customers = await this.customers.find({
      where: { workspaceId, archivedAt: IsNull() },
      select: { id: true, createdAt: true },
    });

    const monthPrefix = new Date().toISOString().slice(0, 7);
    const newThisMonth = customers.filter(
      (customer) => customer.createdAt.toISOString().slice(0, 7) === monthPrefix,
    ).length;
    const withOutstanding = [...rows.values()].filter(
      (metrics) => metrics.outstandingTotal > 0,
    ).length;

    return {
      rows,
      summary: {
        totalCustomers: customers.length,
        newThisMonth,
        withOutstanding,
        billedTotal,
        chart: monthlySeries(monthBuckets(), billed),
      },
    };
  }
}
