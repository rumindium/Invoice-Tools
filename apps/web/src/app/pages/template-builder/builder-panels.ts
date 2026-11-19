import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { CompanyService } from '../../core/company.service';
import { BuilderIcon } from './builder-icon';
import {
  INSERT_MIME,
  InsertRequest,
  STARTERS,
  starterElements,
  starterPage,
} from './builder-presets';
import {
  BRAND_COLORS,
  Design,
  DesignKind,
  FIELDS,
  KIND_LABELS,
  SHAPE_PATHS,
  ShapeKind,
} from './builder.model';
import { BuilderStore } from './builder.store';
import { DesignAsset, readImageFile } from './design-storage.service';
import { DesignThumb } from './design-thumb';

/** A design in the "Your designs" list. */
type LibraryDesign = Pick<Design, 'id' | 'name' | 'kind' | 'page' | 'elements' | 'updatedAt'> & {
  appliedTo: DesignKind[];
};

interface Tile {
  preset: string;
  label: string;
}

/**
 * Left side panels: starter templates and saved designs, elements, text, brand & uploads, and
 * data fields. Every tile inserts on click (page centre) or by dragging it onto the page.
 */
@Component({
  selector: 'app-builder-panels',
  imports: [BuilderIcon, DesignThumb, RouterLink],
  templateUrl: './builder-panels.html',
  styleUrl: './builder-panels.scss',
})
export class BuilderPanels {
  protected readonly store = inject(BuilderStore);
  private readonly router = inject(Router);
  private readonly companies = inject(CompanyService);

  protected readonly kindLabels = KIND_LABELS;
  protected readonly brandColors = BRAND_COLORS;
  protected readonly fieldQuery = signal('');
  protected readonly uploading = signal(false);

  protected readonly hasCompanyLogo = computed(() => !!this.companies.company()?.logoDataUrl);

  protected readonly starters = computed(() =>
    STARTERS.map((starter) => ({
      ...starter,
      elements: starterElements(starter.key, starter.accent),
      page: starterPage(),
    })),
  );

  /**
   * The workspace's designs (newest first). The open design is shown live; the others keep their
   * objects, so their thumbnails don't redraw while you edit.
   */
  protected readonly savedDesigns = computed<LibraryDesign[]>(() => {
    const current = this.store.design();
    const applied = this.store.appliedTo();
    const live: LibraryDesign = { ...current, appliedTo: applied };
    const stored = this.store.library();
    return stored.some((design) => design.id === current.id)
      ? stored.map((design) => (design.id === current.id ? live : design))
      : [live, ...stored];
  });

  protected readonly uploads = computed<DesignAsset[]>(() =>
    this.store.assets().filter((asset) => asset.kind === 'upload'),
  );

  protected readonly fieldGroups = computed(() => {
    const query = this.fieldQuery().trim().toLowerCase();
    const values = this.store.context().values;
    const groups = new Map<
      string,
      Array<{ token: string; label: string; sample: string; code: string }>
    >();
    for (const field of FIELDS) {
      const sample = values[field.token] ?? '';
      const haystack = `${field.group} ${field.label} ${field.token} ${sample}`.toLowerCase();
      if (query && !haystack.includes(query)) {
        continue;
      }
      const list = groups.get(field.group) ?? [];
      list.push({ token: field.token, label: field.label, sample, code: `{{${field.token}}}` });
      groups.set(field.group, list);
    }
    return [...groups].map(([group, fields]) => ({ group, fields }));
  });

  protected readonly shapeTiles: Tile[] = [
    { preset: 'rect', label: 'Square' },
    { preset: 'rect-rounded', label: 'Rounded square' },
    { preset: 'rect-outline', label: 'Outlined square' },
    { preset: 'ellipse', label: 'Circle' },
    { preset: 'ellipse-outline', label: 'Outlined circle' },
    { preset: 'triangle', label: 'Triangle' },
    { preset: 'diamond', label: 'Diamond' },
    { preset: 'star', label: 'Star' },
    { preset: 'hexagon', label: 'Hexagon' },
    { preset: 'arrow', label: 'Arrow' },
    { preset: 'chevron', label: 'Chevron' },
  ];

  protected readonly lineTiles: Tile[] = [
    { preset: 'line', label: 'Line' },
    { preset: 'line-thick', label: 'Thick line' },
    { preset: 'line-dashed', label: 'Dashed line' },
    { preset: 'line-dotted', label: 'Dotted line' },
  ];

  protected readonly blockTiles: Array<Tile & { icon: string; hint: string }> = [
    { preset: 'table', label: 'Items table', icon: 'table', hint: 'Line items with prices' },
    { preset: 'totals', label: 'Totals', icon: 'totals', hint: 'Subtotal, tax, balance' },
    { preset: 'logo', label: 'Company logo', icon: 'brand', hint: 'Always your latest logo' },
    {
      preset: 'signature-block',
      label: 'Signature block',
      icon: 'signature',
      hint: 'Signature, name, title',
    },
    { preset: 'title', label: 'Document title', icon: 'text', hint: 'Invoice / Quotation …' },
    { preset: 'combo-bill-to', label: 'Bill to', icon: 'fields', hint: 'Customer details' },
    {
      preset: 'combo-meta',
      label: 'Document details',
      icon: 'fields',
      hint: 'Number, dates, reference',
    },
    { preset: 'combo-footer', label: 'Footer', icon: 'margins', hint: 'Rule and company line' },
  ];

  protected readonly textCombos: Array<Tile & { sample: string; sub: string }> = [
    {
      preset: 'title',
      label: 'Document title',
      sample: 'INVOICE',
      sub: 'Follows the document type',
    },
    {
      preset: 'combo-bill-to',
      label: 'Bill to',
      sample: 'BILL TO',
      sub: 'Customer name and address',
    },
    {
      preset: 'combo-meta',
      label: 'Details',
      sample: 'No. · Date · Due',
      sub: 'Number, dates and reference',
    },
    {
      preset: 'combo-payment',
      label: 'Payment',
      sample: 'PAYMENT DETAILS',
      sub: 'Your payment terms',
    },
    { preset: 'combo-notes', label: 'Notes', sample: 'NOTES', sub: 'Document notes' },
    {
      preset: 'combo-thanks',
      label: 'Thank you',
      sample: 'Thank you for your business!',
      sub: 'A warm closing line',
    },
    {
      preset: 'combo-footer',
      label: 'Footer',
      sample: 'Company · Address · Phone',
      sub: 'Rule and contact line',
    },
  ];

  protected shapePath(preset: string): string {
    return SHAPE_PATHS[preset as ShapeKind] ?? '';
  }

  /* ------------------------------------------------------------------------------ inserting */

  protected dragStart(event: DragEvent, request: InsertRequest): void {
    event.dataTransfer?.setData(INSERT_MIME, JSON.stringify(request));
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'copy';
    }
  }

  protected insert(request: InsertRequest): void {
    void this.store.insert(request);
  }

  /** Clicking a field adds it to the selected text, or as a new text element. */
  protected insertField(token: string): void {
    const selected = this.store.single();
    if (selected?.type === 'text' && !selected.locked) {
      const joiner = selected.text && !/\s$/.test(selected.text) ? ' ' : '';
      this.store.update(selected.id, { text: `${selected.text}${joiner}{{${token}}}` });
      return;
    }
    this.insert({ preset: 'field', data: token });
  }

  protected selectedText = computed(() => {
    const selected = this.store.single();
    return selected?.type === 'text' ? selected : null;
  });

  /* ----------------------------------------------------------------------------- templates */

  protected applyStarter(key: string): void {
    this.store.applyStarter(key);
    this.store.notify('Template applied. Press Ctrl+Z to undo.');
  }

  protected async open(design: LibraryDesign): Promise<void> {
    if (design.id === this.store.design().id) {
      return;
    }
    await this.store.saveNow();
    void this.router.navigate(['/templates/builder', design.id]);
  }

  protected inUseLabel(kinds: DesignKind[]): string {
    return kinds.map((kind) => `${KIND_LABELS[kind].toLowerCase()}s`).join(', ');
  }

  protected relative(iso: string): string {
    const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)} h ago`;
    return new Date(iso).toLocaleDateString();
  }

  /* ------------------------------------------------------------------------------- uploads */

  protected async upload(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = [...(input.files ?? [])];
    input.value = '';
    if (files.length === 0) {
      return;
    }
    this.uploading.set(true);
    let added = 0;
    for (const file of files) {
      try {
        if (await this.store.addAsset('upload', file.name, await readImageFile(file))) {
          added += 1;
        }
      } catch (error) {
        this.store.notify((error as Error).message, 'error');
      }
    }
    this.uploading.set(false);
    if (added > 0) {
      this.store.notify(
        added === 1
          ? 'Image uploaded. Click it or drag it onto the page.'
          : `${added} images uploaded.`,
      );
    }
  }

  protected removeAsset(asset: DesignAsset): void {
    void this.store.removeAsset(asset.id);
  }
}
