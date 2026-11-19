import { Component, ElementRef, computed, inject, signal } from '@angular/core';
import { BuilderColor } from './builder-color';
import { BuilderIcon } from './builder-icon';
import {
  DesignElement,
  FONTS,
  LineDash,
  Orientation,
  PageSize,
  TableColumnKey,
  TableElement,
  TextAlign,
  TOTALS_LABELS,
  TotalsElement,
  TotalsRowKey,
} from './builder.model';
import { AlignMode, BuilderStore } from './builder.store';
import { readImageFile } from './design-storage.service';

type Popover = 'spacing' | 'transparency' | 'position' | 'corners' | 'columns' | 'rows' | 'align';

const ALIGN_ORDER: TextAlign[] = ['left', 'center', 'right', 'justify'];
const ALIGN_ICON: Record<TextAlign, string> = {
  left: 'alignLeft',
  center: 'alignCenter',
  right: 'alignRight',
  justify: 'alignJustify',
};

/** Contextual property bar above the canvas (Canva's top toolbar). */
@Component({
  selector: 'app-builder-toolbar',
  imports: [BuilderColor, BuilderIcon],
  templateUrl: './builder-toolbar.html',
  styleUrl: './builder-toolbar.scss',
  host: {
    '(document:pointerdown)': 'outside($event)',
    '(document:keydown.escape)': 'popover.set(null)',
  },
})
export class BuilderToolbar {
  protected readonly store = inject(BuilderStore);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly fonts = FONTS;
  protected readonly alignIcon = ALIGN_ICON;
  protected readonly totalsLabels = TOTALS_LABELS;
  protected readonly totalsKeys: TotalsRowKey[] = [
    'subtotal',
    'discount',
    'tax',
    'total',
    'paid',
    'balance',
  ];
  protected readonly alignModes: Array<{ mode: AlignMode; icon: string; label: string }> = [
    { mode: 'left', icon: 'alignLeftEdge', label: 'Left' },
    { mode: 'center', icon: 'alignHCenter', label: 'Centre' },
    { mode: 'right', icon: 'alignRightEdge', label: 'Right' },
    { mode: 'top', icon: 'alignTopEdge', label: 'Top' },
    { mode: 'middle', icon: 'alignVCenter', label: 'Middle' },
    { mode: 'bottom', icon: 'alignBottomEdge', label: 'Bottom' },
  ];

  protected readonly popover = signal<Popover | null>(null);
  protected readonly popoverAt = signal({ left: 0, top: 0 });

  protected readonly selected = this.store.selected;
  protected readonly single = this.store.single;
  protected readonly design = this.store.design;

  protected readonly text = computed(() => {
    const el = this.single();
    return el?.type === 'text' ? el : null;
  });
  protected readonly shape = computed(() => {
    const el = this.single();
    return el?.type === 'shape' ? el : null;
  });
  protected readonly line = computed(() => {
    const el = this.single();
    return el?.type === 'line' ? el : null;
  });
  protected readonly image = computed(() => {
    const el = this.single();
    return el?.type === 'image' ? el : null;
  });
  protected readonly table = computed(() => {
    const el = this.single();
    return el?.type === 'table' ? el : null;
  });
  protected readonly totals = computed(() => {
    const el = this.single();
    return el?.type === 'totals' ? el : null;
  });
  /** Font controls shared by text, tables and totals. */
  protected readonly typed = computed(() => this.text() ?? this.table() ?? this.totals());
  protected readonly allLocked = computed(
    () => this.selected().length > 0 && this.selected().every((el) => el.locked),
  );
  protected readonly hasGroup = computed(() => this.selected().some((el) => el.groupId));
  protected readonly opacity = computed(() => Math.round((this.selected()[0]?.opacity ?? 1) * 100));

  protected toggle(key: Popover, event: MouseEvent): void {
    if (this.popover() === key) {
      this.popover.set(null);
      return;
    }
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const width = 280;
    this.popoverAt.set({
      left: Math.max(
        8,
        Math.min(rect.left + rect.width / 2 - width / 2, window.innerWidth - width - 8),
      ),
      top: rect.bottom + 8,
    });
    this.popover.set(key);
  }

  protected outside(event: PointerEvent): void {
    const target = event.target as HTMLElement;
    if (
      this.popover() &&
      !target.closest('.tb-pop') &&
      !(this.host.nativeElement.contains(target) && target.closest('[data-popover-toggle]'))
    ) {
      this.popover.set(null);
    }
  }

  /* ------------------------------------------------------------------------------ editing */

  protected patch(patch: Partial<DesignElement>, key?: string): void {
    this.store.updateSelected(patch, key);
  }

  protected number(event: Event): number {
    return Number((event.target as HTMLInputElement).value);
  }

  protected value(event: Event): string {
    return (event.target as HTMLInputElement | HTMLSelectElement).value;
  }

  protected fontSize(value: number): void {
    if (Number.isFinite(value)) {
      this.patch(
        { fontSize: Math.min(400, Math.max(4, Math.round(value * 10) / 10)) },
        'font-size',
      );
    }
  }

  protected stepFont(delta: number): void {
    const el = this.typed();
    if (el) {
      this.fontSize(el.fontSize + delta);
    }
  }

  protected cycleAlign(): void {
    const el = this.text();
    if (el) {
      const next = ALIGN_ORDER[(ALIGN_ORDER.indexOf(el.align) + 1) % ALIGN_ORDER.length];
      this.patch({ align: next });
    }
  }

  protected strokeWidth(value: number): void {
    if (Number.isFinite(value)) {
      this.patch({ strokeWidth: Math.min(60, Math.max(0, value)) }, 'stroke-width');
    }
  }

  protected lineWidth(value: number): void {
    const el = this.line();
    if (el && Number.isFinite(value)) {
      const width = Math.min(60, Math.max(1, value));
      this.patch({ strokeWidth: width, height: Math.max(width, 2) }, 'stroke-width');
    }
  }

  protected dash(event: Event): void {
    this.patch({ dash: this.value(event) as LineDash });
  }

  protected async replaceImage(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    const el = this.image();
    if (!file || !el) {
      return;
    }
    try {
      const src = await readImageFile(file);
      this.patch({ src, role: el.role === 'logo' ? 'image' : el.role });
      void this.store.addAsset(el.role === 'signature' ? 'signature' : 'upload', file.name, src);
    } catch (error) {
      this.store.notify((error as Error).message, 'error');
    }
  }

  protected useCompanyLogo(): void {
    this.patch({ src: null, role: 'logo', name: 'Company logo' });
  }

  protected toggleColumn(table: TableElement, key: TableColumnKey): void {
    const columns = table.columns.map((column) =>
      column.key === key ? { ...column, visible: !column.visible } : column,
    );
    if (columns.some((column) => column.visible)) {
      this.patch({ columns });
    }
  }

  protected renameColumn(table: TableElement, key: TableColumnKey, event: Event): void {
    const label = this.value(event).trim().slice(0, 30);
    this.patch(
      {
        columns: table.columns.map((column) =>
          column.key === key ? { ...column, label } : column,
        ),
      },
      `column-${key}`,
    );
  }

  protected toggleRow(totals: TotalsElement, key: TotalsRowKey): void {
    this.patch({ rows: { ...totals.rows, [key]: !totals.rows[key] } });
  }

  protected setFrame(field: 'x' | 'y' | 'width' | 'height' | 'rotation', event: Event): void {
    const el = this.single();
    const value = this.number(event);
    if (!el || !Number.isFinite(value)) {
      return;
    }
    const clamped =
      field === 'width' || field === 'height'
        ? Math.max(8, value)
        : field === 'rotation'
          ? ((((value + 180) % 360) + 360) % 360) - 180
          : value;
    this.store.update(el.id, { [field]: clamped });
  }

  /* --------------------------------------------------------------------------------- page */

  protected pageSize(event: Event): void {
    this.store.setPage({ size: this.value(event) as PageSize });
  }

  protected orientation(value: Orientation): void {
    this.store.setPage({ orientation: value });
  }
}
