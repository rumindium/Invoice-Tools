import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  CatalogItemService,
  ItemKind,
  ItemListRow,
  ItemSummary,
} from '../../core/catalog-item.service';
import { formatDate, formatIdr } from '../../core/format';
import { apiErrorMessage } from '../../core/http-error';
import { UnitOption, UnitService } from '../../core/unit.service';
import { BarChart } from '../../ui/bar-chart/bar-chart';

type ItemsTab = 'items' | 'units';

@Component({
  selector: 'app-items',
  imports: [ReactiveFormsModule, RouterLink, BarChart],
  templateUrl: './items.html',
  styleUrl: './items.scss',
})
export class ItemsPage {
  private readonly fb = inject(FormBuilder);
  private readonly itemsApi = inject(CatalogItemService);
  private readonly unitsApi = inject(UnitService);

  protected readonly tab = signal<ItemsTab>('items');
  protected readonly rows = signal<ItemListRow[]>([]);
  protected readonly summary = signal<ItemSummary | null>(null);
  protected readonly loading = signal(true);
  protected readonly listError = signal('');
  protected readonly search = signal('');
  protected readonly actionError = signal('');

  protected readonly units = signal<UnitOption[]>([]);
  protected readonly unitError = signal('');
  protected readonly unitSaving = signal(false);
  protected readonly currentUnit = signal('unit');

  protected readonly editorOpen = signal(false);
  protected readonly editingId = signal<string | null>(null);
  protected readonly saving = signal(false);
  protected readonly formError = signal('');

  protected readonly formatDate = formatDate;
  protected readonly formatIdr = formatIdr;

  /** Units offered in the item form, keeping the item's own unit when it is no longer listed. */
  protected readonly unitOptions = computed(() => {
    const names = this.units().map((unit) => unit.name);
    const current = this.currentUnit();

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

  protected readonly unitForm = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(20)]],
  });

  private searchTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    void this.reload();
    void this.loadUnits();
  }

  protected setTab(tab: ItemsTab): void {
    this.tab.set(tab);
    this.unitError.set('');
  }

  protected updateSearch(event: Event): void {
    this.search.set((event.target as HTMLInputElement).value);
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => void this.reload(), 250);
  }

  protected clearSearch(): void {
    this.search.set('');
    void this.reload();
  }

  protected openCreate(): void {
    const unit = this.preferredUnit();

    this.form.reset({
      name: '',
      kind: 'SERVICE',
      unitPrice: 0,
      unit,
      description: '',
      isActive: true,
    });
    this.currentUnit.set(unit);
    this.editingId.set(null);
    this.formError.set('');
    this.editorOpen.set(true);
  }

  protected openEdit(row: ItemListRow): void {
    this.form.reset({
      name: row.name,
      kind: row.kind,
      unitPrice: row.unitPrice,
      unit: row.unit,
      description: row.description ?? '',
      isActive: row.isActive,
    });
    this.currentUnit.set(row.unit);
    this.editingId.set(row.id);
    this.formError.set('');
    this.editorOpen.set(true);
  }

  protected closeEditor(): void {
    this.editorOpen.set(false);
    this.editingId.set(null);
    this.formError.set('');
  }

  protected async submit(): Promise<void> {
    this.formError.set('');

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.formError.set('Item name and price are required.');
      return;
    }

    const value = this.form.getRawValue();
    const payload = {
      kind: value.kind,
      name: value.name,
      unitPrice: Number(value.unitPrice),
      unit: value.unit || undefined,
      description: value.description || undefined,
      isActive: value.isActive,
    };

    this.saving.set(true);

    try {
      const editingId = this.editingId();
      if (editingId) {
        await this.itemsApi.update(editingId, payload);
      } else {
        await this.itemsApi.create(payload);
      }

      this.closeEditor();
      await this.reload();
    } catch (error) {
      this.formError.set(apiErrorMessage(error));
    } finally {
      this.saving.set(false);
    }
  }

  protected async remove(row: ItemListRow): Promise<void> {
    this.actionError.set('');

    if (!confirm(`Archive ${row.name}? Invoices that already use it keep their lines.`)) {
      return;
    }

    try {
      await this.itemsApi.archive(row.id);
      await this.reload();
    } catch (error) {
      this.actionError.set(apiErrorMessage(error));
    }
  }

  protected async addUnit(): Promise<void> {
    this.unitError.set('');

    if (this.unitForm.invalid) {
      this.unitForm.markAllAsTouched();
      this.unitError.set('Enter a unit name of at most 20 characters.');
      return;
    }

    this.unitSaving.set(true);

    try {
      await this.unitsApi.create(this.unitForm.getRawValue().name);
      this.unitForm.reset({ name: '' });
      await this.loadUnits();
    } catch (error) {
      this.unitError.set(apiErrorMessage(error));
    } finally {
      this.unitSaving.set(false);
    }
  }

  protected async removeUnit(unit: UnitOption): Promise<void> {
    if (!unit.id) return;

    this.unitError.set('');

    if (!confirm(`Remove the unit “${unit.name}”? Items already using it keep their unit.`)) {
      return;
    }

    try {
      await this.unitsApi.remove(unit.id);
      await this.loadUnits();
    } catch (error) {
      this.unitError.set(apiErrorMessage(error));
    }
  }

  protected kindLabel(kind: ItemKind): string {
    return kind === 'PRODUCT' ? 'Product' : 'Service';
  }

  private preferredUnit(): string {
    const names = this.units().map((unit) => unit.name);

    return names.includes('unit') ? 'unit' : (names[0] ?? 'unit');
  }

  private async loadUnits(): Promise<void> {
    try {
      this.units.set(await this.unitsApi.list());
    } catch (error) {
      this.unitError.set(apiErrorMessage(error));
    }
  }

  private async reload(): Promise<void> {
    this.loading.set(true);
    this.listError.set('');

    try {
      const result = await this.itemsApi.list(this.search());
      this.rows.set(result.items);
      this.summary.set(result.summary);
    } catch (error) {
      this.listError.set(apiErrorMessage(error));
      this.rows.set([]);
    } finally {
      this.loading.set(false);
    }
  }
}
