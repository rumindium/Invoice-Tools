import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { CompanyService } from '../../core/company.service';
import { apiErrorMessage } from '../../core/http-error';
import { TemplateDesignService } from '../../core/template-design.service';
import { BuilderCanvas } from './builder-canvas';
import { BuilderIcon } from './builder-icon';
import { BuilderLayersPanel } from './builder-layers-panel';
import { BuilderPanels } from './builder-panels';
import { BuilderSignaturePanel } from './builder-signature-panel';
import { BuilderStatusbar } from './builder-statusbar';
import { BuilderToasts } from './builder-toasts';
import { BuilderToolbar } from './builder-toolbar';
import { DesignKind, isDesign, pageDimensions } from './builder.model';
import { BuilderStore, PanelKey } from './builder.store';
import { readImageFile } from './design-storage.service';
import { DesignThumb } from './design-thumb';

interface Tab {
  key: PanelKey;
  label: string;
  title: string;
  /** Small heading above the panel title. */
  eyebrow: string;
  icon: string;
}

const KIND_TITLES: Record<DesignKind, string> = {
  invoice: 'Invoice',
  'goods-receipt': 'Goods Receipt',
  quotation: 'Quotation',
};

const TABS: Tab[] = [
  {
    key: 'templates',
    label: 'Design',
    title: 'Starters & my templates',
    eyebrow: 'Layouts',
    icon: 'templates',
  },
  { key: 'elements', label: 'Elements', title: 'Elements', eyebrow: 'Build', icon: 'elements' },
  { key: 'text', label: 'Text', title: 'Text', eyebrow: 'Typography', icon: 'text' },
  {
    key: 'brand',
    label: 'Brand',
    title: 'Logo, brand & uploads',
    eyebrow: 'Identity',
    icon: 'brand',
  },
  {
    key: 'signature',
    label: 'Signature',
    title: 'Signature',
    eyebrow: 'Sign-off',
    icon: 'signature',
  },
  {
    key: 'fields',
    label: 'Fields',
    title: 'Data fields',
    eyebrow: 'Document data',
    icon: 'fields',
  },
  { key: 'layers', label: 'Layers', title: 'Layers', eyebrow: 'Structure', icon: 'layers' },
];

const SHORTCUTS: Array<[string, string]> = [
  ['Ctrl + Z', 'Undo'],
  ['Ctrl + Shift + Z / Ctrl + Y', 'Redo'],
  ['Ctrl + C / X / V', 'Copy, cut, paste (also images from the clipboard)'],
  ['Ctrl + D', 'Duplicate'],
  ['Delete / Backspace', 'Delete selection'],
  ['Ctrl + A', 'Select all'],
  ['Ctrl + G / Ctrl + Shift + G', 'Group / ungroup'],
  ['Ctrl + ] / Ctrl + [', 'Bring forward / send backward (Shift: to front / back)'],
  ['Arrow keys', 'Nudge 1 px (Shift: 10 px)'],
  ['Enter / double-click', 'Edit text'],
  ['Esc', 'Stop editing, then clear the selection'],
  ['Shift + drag', 'Keep to one axis, keep proportions, snap rotation to 15°'],
  ['Alt + drag', 'Move or resize without snapping'],
  ['Ctrl + scroll, Ctrl + + / −', 'Zoom; Ctrl + 0 fits the page'],
  ['Ctrl + S', 'Save now'],
];

/**
 * Rumindium Template Studio, the full-screen template editor: tools on the left, the page with
 * rulers in the centre, the contextual toolbar on top and a status bar below. Opened from the
 * template list (/templates/builder); templates are saved by the API.
 */
@Component({
  selector: 'app-template-builder',
  imports: [
    RouterLink,
    BuilderCanvas,
    BuilderIcon,
    BuilderToolbar,
    BuilderPanels,
    BuilderSignaturePanel,
    BuilderLayersPanel,
    BuilderStatusbar,
    BuilderToasts,
    DesignThumb,
  ],
  providers: [BuilderStore],
  templateUrl: './template-builder.html',
  styleUrl: './template-builder.scss',
  host: {
    '(document:keydown)': 'keydown($event)',
    '(document:paste)': 'paste($event)',
    '(document:pointerdown)': 'closeMenus($event)',
    '(window:beforeunload)': 'beforeUnload($event)',
  },
})
export class TemplateBuilderPage {
  protected readonly store = inject(BuilderStore);
  private readonly api = inject(TemplateDesignService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly companies = inject(CompanyService);

  protected readonly tabs = TABS;
  protected readonly shortcuts = SHORTCUTS;
  protected readonly design = this.store.design;
  protected readonly menuOpen = signal(false);
  protected readonly shortcutsOpen = signal(false);
  protected readonly printing = signal(false);
  protected readonly savingTo = signal(false);
  protected readonly previewing = signal(false);
  /** Set when the design could not be loaded (the page offers a retry). */
  protected readonly loadError = signal('');
  /** "Invoice", "Goods Receipt", "Quotation": the document type this template is for. */
  protected readonly kindTitle = computed(() => KIND_TITLES[this.design().kind]);
  private openToken = 0;
  /** Set when a real paste event arrives, so the keyboard fallback does not paste twice. */
  private pasteHandled = false;

  protected readonly panelTitle = computed(
    () => TABS.find((tab) => tab.key === this.store.panel())?.title ?? '',
  );
  protected readonly panelEyebrow = computed(
    () => TABS.find((tab) => tab.key === this.store.panel())?.eyebrow ?? '',
  );
  protected readonly saveLabel = computed(() => {
    switch (this.store.saveState()) {
      case 'pending':
      case 'saving':
        return 'Saving…';
      case 'error':
        return 'Not saved';
      case 'conflict':
        return 'Changed elsewhere';
      default:
        return 'All changes saved';
    }
  });

  constructor() {
    void this.companies.ensureLoaded();
    void this.store.refreshAssets();
    void this.store.refreshLibrary();
    this.route.paramMap
      .pipe(takeUntilDestroyed())
      .subscribe((params) => void this.openDesign(params.get('id') ?? ''));
  }

  /* ------------------------------------------------------------------------------ designs */

  /** Opens the template in the URL; a missing one sends you back to the template list. */
  private async openDesign(id: string): Promise<void> {
    const token = ++this.openToken;
    if (id === this.design().id && this.store.ready()) {
      return;
    }
    try {
      const view = await this.api.get(id);
      if (token === this.openToken) {
        this.loadError.set('');
        this.store.load(view);
      }
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === 404) {
        void this.router.navigate(['/templates/builder'], { queryParams: { missing: 1 } });
        return;
      }
      this.loadError.set(apiErrorMessage(error));
    }
  }

  protected retryOpen(): void {
    this.loadError.set('');
    void this.openDesign(this.route.snapshot.paramMap.get('id') ?? '');
  }

  protected rename(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.store.renameDesign(input.value);
    input.value = this.design().name;
  }

  /** "Save to Invoice": saves the template and returns to the template list. */
  protected async saveTo(): Promise<void> {
    this.menuOpen.set(false);
    this.savingTo.set(true);
    const saved = await this.store.saveNow();
    this.savingTo.set(false);
    if (saved) {
      void this.router.navigate(['/templates/builder'], {
        queryParams: { saved: this.design().kind },
      });
    }
  }

  protected async deleteDesign(): Promise<void> {
    this.menuOpen.set(false);
    const design = this.design();
    const used = this.store.appliedTo().length
      ? ' Documents that use it go back to the default layout (issued ones keep their look).'
      : '';
    if (!confirm(`Delete “${design.name}”? This cannot be undone.${used}`)) {
      return;
    }
    try {
      await this.api.remove(design.id);
    } catch (error) {
      this.store.notify(apiErrorMessage(error), 'error');
      return;
    }
    this.store.ready.set(false);
    void this.router.navigate(['/templates/builder'], { queryParams: { deleted: design.kind } });
  }

  /** Opens the template as a server-rendered PDF with sample data in a new tab. */
  protected async previewPdf(): Promise<void> {
    this.menuOpen.set(false);
    // Open the tab within the click, so popup blockers allow it; fill it when the PDF is ready.
    const tab = window.open('', '_blank');
    this.previewing.set(true);
    try {
      if (!(await this.store.saveNow())) {
        throw new Error('Save the design first.');
      }
      const url = await this.api.previewPdfHref(this.design().id, this.store.revision());
      if (tab) {
        tab.location.href = url;
      } else {
        window.open(url, '_blank');
      }
    } catch (error) {
      tab?.close();
      this.store.notify(`The PDF could not be created: ${apiErrorMessage(error)}`, 'error');
    } finally {
      this.previewing.set(false);
    }
  }

  /** Warns before leaving with unsaved changes (and saves them). */
  protected beforeUnload(event: BeforeUnloadEvent): void {
    if (this.store.hasUnsavedChanges()) {
      void this.store.saveNow();
      event.preventDefault();
    }
  }

  protected exportJson(): void {
    this.menuOpen.set(false);
    const design = this.design();
    const blob = new Blob([JSON.stringify(design, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${
      design.name
        .replace(/[^\w-]+/g, '-')
        .replace(/^-|-$/g, '')
        .toLowerCase() || 'design'
    }.template.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /**
   * Imports a design file into this template (each document type has one template, so the file
   * replaces the page's content; undo brings it back).
   */
  protected async importJson(event: Event): Promise<void> {
    this.menuOpen.set(false);
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) {
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      parsed = null;
    }
    if (!isDesign(parsed)) {
      this.store.notify('That file is not a template design exported from this builder.', 'error');
      return;
    }
    this.store.replaceContent(parsed);
    this.store.notify(`Imported “${parsed.name}”. Press Ctrl+Z to undo.`);
  }

  /** Prints the page (Save as PDF in the print dialog) with sample data, at its real size. */
  protected print(): void {
    this.menuOpen.set(false);
    this.store.editingId.set(null);
    const { width, height } = pageDimensions(this.design().page);
    const style = document.createElement('style');
    style.textContent = `@page { size: ${width}px ${height}px; margin: 0; }`;
    document.head.appendChild(style);
    const cleanup = () => {
      style.remove();
      this.printing.set(false);
      window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);
    this.printing.set(true);
    // Let the print copy render (and its images decode) before opening the dialog.
    setTimeout(() => window.print(), 120);
  }

  /* ---------------------------------------------------------------------------------- ui */

  protected togglePanel(key: PanelKey): void {
    this.store.panel.update((current) => (current === key ? null : key));
  }

  protected togglePreview(): void {
    this.store.preview.update((value) => !value);
    this.store.editingId.set(null);
    if (this.store.preview()) {
      this.store.selection.set([]);
    }
  }

  protected closeMenus(event: PointerEvent): void {
    if (this.menuOpen() && !(event.target as HTMLElement).closest('.file-menu')) {
      this.menuOpen.set(false);
    }
  }

  /* --------------------------------------------------------------------------- keyboard */

  protected keydown(event: KeyboardEvent): void {
    const target = event.target as HTMLElement;
    const typing =
      target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
    const mod = event.ctrlKey || event.metaKey;
    const key = event.key.toLowerCase();
    const store = this.store;

    if (mod && key === 's') {
      event.preventDefault();
      void store.saveNow(true);
      return;
    }
    if (key === 'escape' && this.shortcutsOpen()) {
      this.shortcutsOpen.set(false);
      return;
    }
    if (key === 'escape' && this.menuOpen()) {
      this.menuOpen.set(false);
      return;
    }
    if (typing) {
      return;
    }

    const handled = (): void => event.preventDefault();

    if (mod) {
      if (key === 'z') {
        handled();
        if (event.shiftKey) store.redo();
        else store.undo();
      } else if (key === 'y') {
        handled();
        store.redo();
      } else if (key === 'd') {
        handled();
        store.duplicateSelected();
      } else if (key === 'c') {
        store.copySelected();
      } else if (key === 'x') {
        store.cutSelected();
      } else if (key === 'v') {
        // Browsers fire "paste" (handled below, incl. images) but not always without an
        // editable focus; fall back to the builder's own clipboard.
        this.pasteHandled = false;
        setTimeout(() => {
          if (!this.pasteHandled) {
            store.paste();
          }
        }, 60);
      } else if (key === 'a') {
        handled();
        store.selectAll();
      } else if (key === 'g') {
        handled();
        if (event.shiftKey) store.ungroup();
        else store.group();
      } else if (key === '=' || key === '+') {
        handled();
        store.zoomBy(1.2);
      } else if (key === '-') {
        handled();
        store.zoomBy(1 / 1.2);
      } else if (key === '0') {
        handled();
        store.fitZoom();
      } else if (key === ']' || key === '}') {
        handled();
        store.arrange(event.shiftKey ? 'front' : 'forward');
      } else if (key === '[' || key === '{') {
        handled();
        store.arrange(event.shiftKey ? 'back' : 'backward');
      }
      return;
    }

    switch (key) {
      case 'delete':
      case 'backspace':
        handled();
        store.removeSelected();
        break;
      case 'escape':
        // An open popover closes first (it listens for Escape itself); a second Escape deselects.
        if (document.querySelector('.tb-pop, app-builder-color .pop')) break;
        if (store.selection().length > 0) store.clearSelection();
        else if (store.preview()) store.preview.set(false);
        break;
      case 'arrowleft':
      case 'arrowright':
      case 'arrowup':
      case 'arrowdown': {
        if (store.selection().length === 0) return;
        handled();
        const step = event.shiftKey ? 10 : 1;
        const dx = key === 'arrowleft' ? -step : key === 'arrowright' ? step : 0;
        const dy = key === 'arrowup' ? -step : key === 'arrowdown' ? step : 0;
        store.nudge(dx, dy);
        break;
      }
      case 'enter': {
        const el = store.single();
        if (el?.type === 'text' && !el.locked) {
          handled();
          store.editingId.set(el.id);
        }
        break;
      }
      case '?':
        this.shortcutsOpen.set(true);
        break;
    }
  }

  /** Ctrl+V: images from the system clipboard, otherwise the builder's own clipboard. */
  protected async paste(event: ClipboardEvent): Promise<void> {
    const target = event.target as HTMLElement;
    if (target.isContentEditable || ['INPUT', 'TEXTAREA'].includes(target.tagName)) {
      return;
    }
    this.pasteHandled = true;
    const file = [...(event.clipboardData?.files ?? [])].find((entry) =>
      entry.type.startsWith('image/'),
    );
    if (file) {
      event.preventDefault();
      try {
        const src = await readImageFile(file);
        await this.store.insert({ preset: 'image', data: src });
        void this.store.addAsset('upload', file.name || 'Pasted image', src);
      } catch (error) {
        this.store.notify((error as Error).message, 'error');
      }
      return;
    }
    if (this.store.paste()) {
      event.preventDefault();
    }
  }
}
