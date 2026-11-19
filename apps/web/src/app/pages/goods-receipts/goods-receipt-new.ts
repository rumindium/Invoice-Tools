import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { formatDate, formatMoney } from '../../core/format';
import { GoodsReceiptService, GoodsReceiptSource } from '../../core/goods-receipt.service';
import { apiErrorMessage } from '../../core/http-error';
import { DocumentTemplate, TemplateService } from '../../core/template.service';
import { TemplateSummary } from '../../ui/template-summary';
import { TerminDraft, TerminService } from '../../core/termin.service';
import { TerminDialog } from '../../ui/termins/termin-dialog';

/**
 * Goods receipts always come from an accepted quotation: this page lists the accepted
 * quotations that have not been received yet and generates the receipt in one click.
 */
@Component({
  selector: 'app-goods-receipt-new',
  imports: [RouterLink, TemplateSummary, TerminDialog],
  templateUrl: './goods-receipt-new.html',
  styleUrls: ['../documents/documents.scss', './goods-receipt-new.scss'],
})
export class GoodsReceiptNewPage {
  private readonly receiptsApi = inject(GoodsReceiptService);
  private readonly router = inject(Router);
  private readonly templatesApi = inject(TemplateService);
  private readonly terminsApi = inject(TerminService);

  protected readonly sources = signal<GoodsReceiptSource[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly creating = signal<string | null>(null);
  /** The quotation whose "Create goods receipt" dialog is open. */
  protected readonly choosing = signal<GoodsReceiptSource | null>(null);
  protected readonly dialogError = signal('');
  /** The goods receipt template new receipts are generated with. */
  protected readonly template = signal<DocumentTemplate | null>(null);

  protected readonly formatDate = formatDate;
  protected readonly formatMoney = formatMoney;

  constructor() {
    void this.load();
    void this.loadTemplate();
  }

  /** Asks how the quotation is received: one goods receipt or payment termins. */
  protected choose(source: GoodsReceiptSource): void {
    if (this.creating()) return;
    this.dialogError.set('');
    this.choosing.set(source);
  }

  protected async create(draft: TerminDraft): Promise<void> {
    const source = this.choosing();
    if (!source || this.creating()) return;

    this.creating.set(source.id);
    this.dialogError.set('');

    try {
      const receiptId = draft.split
        ? (await this.terminsApi.forQuotation(source.id, draft)).documents[0]?.id
        : (await this.receiptsApi.createFromQuotation(source.id)).id;
      this.choosing.set(null);
      if (receiptId) {
        await this.router.navigate(['/goods-receipts', receiptId]);
      } else {
        await this.load();
      }
    } catch (error) {
      this.dialogError.set(apiErrorMessage(error));
    } finally {
      this.creating.set(null);
    }
  }

  private async loadTemplate(): Promise<void> {
    try {
      const { active } = await this.templatesApi.settings('goods-receipt');
      this.template.set({
        key: active.key,
        name: active.name,
        accentColor: active.accentColor,
        locked: false,
      });
    } catch {
      this.template.set(null);
    }
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    try {
      this.sources.set(await this.receiptsApi.sources());
    } catch (error) {
      this.error.set(apiErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }
}
