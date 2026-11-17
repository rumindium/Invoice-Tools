import { Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormArray, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { formatIdr } from '../../core/mock-documents';

function isoDate(offsetDays = 0): string {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

@Component({
  selector: 'app-document-generator',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './document-generator.html',
  styleUrl: './document-generator.scss',
})
export class DocumentGeneratorPage {
  private readonly fb = inject(FormBuilder);

  protected readonly config = {
    title: 'Create invoice',
    description: 'A bill for agreed work or products.',
    number: 'INV/2026/0043',
    dateLabel: 'Invoice date',
    dueLabel: 'Due date',
    submitLabel: 'Save invoice',
  };

  protected readonly saved = signal(false);
  protected readonly totals = signal({ subtotal: 0, tax: 0, total: 0 });
  protected readonly formatIdr = formatIdr;

  protected readonly form = this.fb.nonNullable.group({
    documentNumber: [this.config.number],
    issueDate: [isoDate(), Validators.required],
    dueDate: [isoDate(14)],
    customerName: ['PT Nusantara Jaya', Validators.required],
    customerEmail: ['finance@nusantarajaya.co.id', [Validators.required, Validators.email]],
    customerAddress: ['Jl. Jend. Sudirman No. 52, Jakarta'],
    items: this.fb.array([
      this.createItem('Visual identity design', 2, 500000, 11),
      this.createItem('Website implementation', 1, 2500000, 11),
    ]),
    notes: ['Payment by bank transfer to the account shown on the invoice.'],
  });

  protected get items(): FormArray {
    return this.form.controls.items;
  }

  constructor() {
    this.form.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.recalculate());
    this.recalculate();
  }

  protected addItem(): void {
    this.items.push(this.createItem());
    this.recalculate();
  }

  protected removeItem(index: number): void {
    if (this.items.length > 1) {
      this.items.removeAt(index);
      this.recalculate();
    }
  }

  protected lineTotal(index: number): number {
    const item = this.items.at(index).getRawValue() as {
      quantity: number;
      unitPrice: number;
      taxRate: number;
    };
    return Number(item.quantity) * Number(item.unitPrice) * (1 + Number(item.taxRate) / 100);
  }

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.saved.set(true);
  }

  protected dismissSaved(): void {
    this.saved.set(false);
  }

  private createItem(description = '', quantity = 1, unitPrice = 0, taxRate = 11) {
    return this.fb.nonNullable.group({
      description: [description, Validators.required],
      quantity: [quantity, [Validators.required, Validators.min(0.01)]],
      unitPrice: [unitPrice, [Validators.required, Validators.min(0)]],
      taxRate: [taxRate, [Validators.min(0), Validators.max(100)]],
    });
  }

  private recalculate(): void {
    const value = this.form.getRawValue();

    let subtotal = 0;
    let tax = 0;

    for (const item of value.items) {
      const line = Number(item.quantity) * Number(item.unitPrice);
      subtotal += line;
      tax += line * (Number(item.taxRate) / 100);
    }

    this.totals.set({ subtotal, tax, total: subtotal + tax });
  }
}
