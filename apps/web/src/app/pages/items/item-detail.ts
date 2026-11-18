import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CatalogItemService, ItemDetail, ItemKind } from '../../core/catalog-item.service';
import { formatDate, formatIdr } from '../../core/format';
import { apiErrorMessage } from '../../core/http-error';
import { STATUS_LABEL, displayStatus, statusClass } from '../../core/invoice.service';
import { UnitService } from '../../core/unit.service';
import { CurrencyInputDirective } from '../../ui/currency-input';

@Component({
  selector: 'app-item-detail',
  imports: [ReactiveFormsModule, RouterLink, CurrencyInputDirective],
  templateUrl: './item-detail.html',
  styleUrl: './item-detail.scss',
})
export class ItemDetailPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  private readonly itemsApi = inject(CatalogItemService);
  private readonly unitsApi = inject(UnitService);

  protected readonly detail = signal<ItemDetail | null>(null);
  protected readonly loading = signal(true);
  protected readonly loadError = signal('');
  protected readonly actionError = signal('');
  protected readonly editing = signal(false);
  protected readonly saving = signal(false);
  protected readonly formError = signal('');
  protected readonly units = signal<string[]>([]);

  protected readonly formatDate = formatDate;
  protected readonly formatIdr = formatIdr;
  protected readonly statusLabel = STATUS_LABEL;
  protected readonly statusClass = statusClass;
  protected readonly displayStatus = displayStatus;

  protected readonly item = computed(() => this.detail()?.item ?? null);

  /** Units offered in the edit form, keeping this item's unit when it is no longer listed. */
  protected readonly unitOptions = computed(() => {
    const names = [...this.units()];
    const current = this.form.controls.unit.value;

    if (current && !names.includes(current)) {
      names.unshift(current);
    }

    return names;
  });

  protected readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(160)]],
    kind: ['SERVICE' as ItemKind, Validators.required],
    unitPrice: [0, [Validators.required, Validators.min(0)]],
    unit: ['unit'],
    description: [''],
    isActive: [true],
  });

  constructor() {
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe(() => void this.load());
    void this.loadUnits();
  }

  protected kindLabel(kind: ItemKind): string {
    return kind === 'PRODUCT' ? 'Product' : 'Service';
  }

  protected openEdit(): void {
    const item = this.item();
    if (!item) return;

    this.form.reset({
      name: item.name,
      kind: item.kind,
      unitPrice: item.unitPrice,
      unit: item.unit,
      description: item.description ?? '',
      isActive: item.isActive,
    });
    this.formError.set('');
    this.editing.set(true);
  }

  protected closeEdit(): void {
    this.editing.set(false);
    this.formError.set('');
  }

  protected async submit(): Promise<void> {
    const item = this.item();
    if (!item) return;

    this.formError.set('');

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.formError.set('Item name and price are required.');
      return;
    }

    const value = this.form.getRawValue();
    this.saving.set(true);

    try {
      await this.itemsApi.update(item.id, {
        kind: value.kind,
        name: value.name,
        unitPrice: Number(value.unitPrice),
        unit: value.unit || undefined,
        description: value.description || undefined,
        isActive: value.isActive,
      });

      this.editing.set(false);
      await this.load();
    } catch (error) {
      this.formError.set(apiErrorMessage(error));
    } finally {
      this.saving.set(false);
    }
  }

  protected async remove(): Promise<void> {
    const item = this.item();
    if (!item) return;

    if (!confirm(`Archive ${item.name}? Invoices that already use it keep their lines.`)) {
      return;
    }

    this.actionError.set('');

    try {
      await this.itemsApi.archive(item.id);
      await this.router.navigate(['/items']);
    } catch (error) {
      this.actionError.set(apiErrorMessage(error));
    }
  }

  private async loadUnits(): Promise<void> {
    try {
      const units = await this.unitsApi.list();
      this.units.set(units.map((unit) => unit.name));
    } catch {
      this.units.set([]);
    }
  }

  private async load(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('id');
    this.loading.set(true);
    this.loadError.set('');
    this.editing.set(false);

    if (!id) {
      this.loadError.set('Item not found.');
      this.loading.set(false);
      return;
    }

    try {
      this.detail.set(await this.itemsApi.detail(id));
    } catch (error) {
      this.loadError.set(apiErrorMessage(error));
      this.detail.set(null);
    } finally {
      this.loading.set(false);
    }
  }
}
