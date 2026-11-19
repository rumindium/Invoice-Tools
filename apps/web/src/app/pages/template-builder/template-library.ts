import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CompanyService } from '../../core/company.service';
import { apiErrorMessage } from '../../core/http-error';
import {
  TemplateDesignService,
  TemplateDesignView,
  TemplateExistsError,
} from '../../core/template-design.service';
import { STARTERS, starterElements, starterPage } from './builder-presets';
import { buildSampleContext } from './builder-sample';
import { DesignKind, SampleContext } from './builder.model';
import { DesignStorageService, moveLegacyDesigns } from './design-storage.service';
import { DesignThumb } from './design-thumb';

interface Slot {
  kind: DesignKind;
  /** "Invoice", "Goods Receipt", "Quotation". */
  title: string;
  /** "invoice", "goods receipt", "quotation" (in sentences). */
  singular: string;
  plural: string;
  createLink: string;
  createLabel: string;
  templatesLink: string;
}

/** The three sections, in this order: one template per document type. */
const SLOTS: Slot[] = [
  {
    kind: 'invoice',
    title: 'Invoice',
    singular: 'invoice',
    plural: 'invoices',
    createLink: '/invoices/new',
    createLabel: 'Create an invoice',
    templatesLink: '/templates/invoices',
  },
  {
    kind: 'goods-receipt',
    title: 'Goods Receipt',
    singular: 'goods receipt',
    plural: 'goods receipts',
    createLink: '/goods-receipts/new',
    createLabel: 'Create a goods receipt',
    templatesLink: '/templates/goods-receipts',
  },
  {
    kind: 'quotation',
    title: 'Quotation',
    singular: 'quotation',
    plural: 'quotations',
    createLink: '/quotations/new',
    createLabel: 'Create a quotation',
    templatesLink: '/templates/quotations',
  },
];

/**
 * The Template Builder's start page: My Invoice, My Goods Receipt and My Quotation Template.
 * Each document type holds one template — edit it, apply it, or create it when there is none.
 */
@Component({
  selector: 'app-template-library',
  imports: [RouterLink, DesignThumb],
  templateUrl: './template-library.html',
  styleUrl: './template-library.scss',
})
export class TemplateLibraryPage {
  private readonly api = inject(TemplateDesignService);
  private readonly companies = inject(CompanyService);
  private readonly storage = inject(DesignStorageService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly slots = SLOTS;
  protected readonly starters = STARTERS;
  protected readonly designs = signal<TemplateDesignView[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly notice = signal<{ text: string; slot: Slot | null } | null>(null);
  /** Slot being worked on (create / apply / delete). */
  protected readonly busy = signal<DesignKind | null>(null);
  /** Starter chosen per empty slot. */
  protected readonly chosen = signal<Record<string, string>>({});
  /** The slot a notice is about (highlighted). */
  protected readonly highlight = signal<DesignKind | null>(null);

  protected readonly byKind = computed(() => {
    const map = new Map<DesignKind, TemplateDesignView>();
    for (const design of this.designs()) {
      if (!map.has(design.kind)) map.set(design.kind, design);
    }
    return map;
  });

  private readonly contexts = computed(() => {
    const company = this.companies.company();
    return new Map<DesignKind, SampleContext>(
      SLOTS.map((slot) => [slot.kind, buildSampleContext(company, slot.kind)]),
    );
  });

  protected readonly starterPreviews = computed(() =>
    STARTERS.map((starter) => ({
      ...starter,
      page: starterPage(),
      elements: starterElements(starter.key, starter.accent),
    })),
  );

  constructor() {
    void this.companies.ensureLoaded();
    void this.start();
  }

  private async start(): Promise<void> {
    const params = this.route.snapshot.queryParamMap;
    // Links from before the list page (?design=…) open that template in the editor.
    const legacyId = params.get('design');
    if (legacyId) {
      void this.router.navigate(['/templates/builder', legacyId], { replaceUrl: true });
      return;
    }
    const moved = await moveLegacyDesigns(this.storage, this.api);
    await this.load();

    const saved = this.slotOf(params.get('saved'));
    const deleted = this.slotOf(params.get('deleted'));
    if (moved > 0) {
      this.notice.set({
        text:
          moved === 1
            ? 'Moved 1 template saved in this browser to your account.'
            : `Moved ${moved} templates saved in this browser to your account.`,
        slot: null,
      });
    } else if (saved) {
      const applied = this.byKind().get(saved.kind)?.appliedTo.includes(saved.kind);
      this.notice.set({
        text: applied
          ? `Saved to My ${saved.title} Template. New ${saved.plural}, drafts and their PDFs use it.`
          : `Saved to My ${saved.title} Template. Apply it to use it for new ${saved.plural}.`,
        slot: applied ? saved : null,
      });
      this.highlight.set(saved.kind);
    } else if (deleted) {
      this.notice.set({ text: `My ${deleted.title} Template was deleted.`, slot: null });
    } else if (params.get('missing')) {
      this.error.set('That template no longer exists.');
    }
    if (saved || deleted || params.get('missing')) {
      void this.router.navigate([], { queryParams: {}, replaceUrl: true });
    }
  }

  private slotOf(kind: string | null): Slot | null {
    return SLOTS.find((slot) => slot.kind === kind) ?? null;
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    try {
      this.designs.set(await this.api.list());
      this.error.set('');
    } catch (error) {
      this.error.set(apiErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  protected context(kind: DesignKind): SampleContext {
    return this.contexts().get(kind)!;
  }

  protected starterFor(kind: DesignKind): string {
    return this.chosen()[kind] ?? 'classic';
  }

  protected choose(kind: DesignKind, starter: string): void {
    this.chosen.update((chosen) => ({ ...chosen, [kind]: starter }));
  }

  protected isApplied(design: TemplateDesignView): boolean {
    return design.appliedTo.includes(design.kind);
  }

  protected relative(iso: string): string {
    const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)} h ago`;
    return new Date(iso).toLocaleDateString();
  }

  /** Creates the slot's template from the chosen starter and opens it in the editor. */
  protected async create(slot: Slot): Promise<void> {
    const starter =
      STARTERS.find((entry) => entry.key === this.starterFor(slot.kind)) ?? STARTERS[0];
    this.busy.set(slot.kind);
    this.error.set('');
    try {
      const design = await this.api.create({
        name: `My ${slot.singular} template`,
        kind: slot.kind,
        accentColor: starter.accent,
        page: starterPage(),
        elements: starterElements(starter.key, starter.accent),
      });
      void this.router.navigate(['/templates/builder', design.id]);
    } catch (error) {
      if (error instanceof TemplateExistsError) {
        await this.load();
      }
      this.error.set(apiErrorMessage(error) || (error as Error).message);
    } finally {
      this.busy.set(null);
    }
  }

  /** Same as applying on the Invoice / Goods Receipt / Quotation Templates pages. */
  protected async apply(slot: Slot, design: TemplateDesignView): Promise<void> {
    this.busy.set(slot.kind);
    this.error.set('');
    try {
      const { settings } = await this.api.apply(design.id, slot.kind);
      this.notice.set({
        text: `${settings.active.name} is now your ${slot.singular} template. New ${slot.plural}, drafts and their PDFs use it automatically.`,
        slot,
      });
      this.highlight.set(slot.kind);
      await this.load();
    } catch (error) {
      this.error.set(apiErrorMessage(error));
    } finally {
      this.busy.set(null);
    }
  }

  protected async remove(slot: Slot, design: TemplateDesignView): Promise<void> {
    const used = this.isApplied(design)
      ? ` New ${slot.plural} go back to the default layout; issued ones keep their look.`
      : '';
    if (!confirm(`Delete your ${slot.singular} template “${design.name}”?${used}`)) {
      return;
    }
    this.busy.set(slot.kind);
    try {
      await this.api.remove(design.id);
      this.notice.set({ text: `My ${slot.title} Template was deleted.`, slot: null });
      await this.load();
    } catch (error) {
      this.error.set(apiErrorMessage(error));
    } finally {
      this.busy.set(null);
    }
  }

  protected async previewPdf(design: TemplateDesignView): Promise<void> {
    const tab = window.open('', '_blank');
    const url = await this.api.previewPdfHref(design.id, design.revision);
    if (tab) {
      tab.location.href = url;
    } else {
      window.open(url, '_blank');
    }
  }
}
