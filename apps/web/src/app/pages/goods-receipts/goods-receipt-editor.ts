import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  FormArray,
  FormBuilder,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  GoodsReceipt,
  GoodsReceiptService,
  formatQuantity,
} from '../../core/goods-receipt.service';
import { formatDate } from '../../core/format';
import { apiErrorMessage } from '../../core/http-error';
import { TemplateSummary } from '../../ui/template-summary';

type LineGroup = FormGroup<{
  id: FormControl<string>;
  receivedQuantity: FormControl<number>;
  rejectedQuantity: FormControl<number>;
  remarks: FormControl<string>;
}>;

interface LineValue {
  id: string;
  receivedQuantity: number;
  rejectedQuantity: number;
  remarks: string;
}

@Component({
  selector: 'app-goods-receipt-editor',
  imports: [ReactiveFormsModule, RouterLink, TemplateSummary],
  templateUrl: './goods-receipt-editor.html',
  styleUrls: ['../generate/document-generator.scss', './goods-receipt-editor.scss'],
})
export class GoodsReceiptEditorPage {
  private readonly fb = inject(FormBuilder);
  private readonly receiptsApi = inject(GoodsReceiptService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly receipt = signal<GoodsReceipt | null>(null);
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly saveError = signal('');
  protected readonly lineValues = signal<LineValue[]>([]);
  /** Revising a received receipt: saving creates the next version. */
  protected readonly revising = signal(false);
  protected readonly submitLabel = computed(() => {
    if (this.saving()) return 'Saving…';
    return this.revising()
      ? `Save as version ${(this.receipt()?.revision ?? 1) + 1}`
      : 'Save goods receipt';
  });
  /** Drafts are edited; received receipts only through a revision. */
  protected readonly canSave = computed(() => {
    const status = this.receipt()?.status;
    return status === 'DRAFT' || (this.revising() && status === 'RECEIVED');
  });
  protected readonly formatQuantity = formatQuantity;
  protected readonly formatDate = formatDate;

  protected readonly form = this.fb.nonNullable.group({
    receiptDate: ['', Validators.required],
    deliveryNoteNumber: [''],
    carrier: [''],
    vehicleNumber: [''],
    receivingLocation: [''],
    deliveredByName: [''],
    checkedByName: [''],
    receivedByName: [''],
    receivedByTitle: [''],
    notes: [''],
    revisionReason: [''],
    lines: this.fb.array<LineGroup>([]),
  });

  protected get lines(): FormArray<LineGroup> {
    return this.form.controls.lines;
  }

  protected readonly totals = computed(() => {
    const receipt = this.receipt();
    const values = this.lineValues();
    const ordered = receipt?.lines.reduce((total, line) => total + line.orderedQuantity, 0) ?? 0;
    const received = values.reduce((total, line) => total + Number(line.receivedQuantity || 0), 0);
    const rejected = values.reduce((total, line) => total + Number(line.rejectedQuantity || 0), 0);
    return { ordered, received, rejected, accepted: received - rejected };
  });

  constructor() {
    this.form.controls.lines.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.lineValues.set(this.form.controls.lines.getRawValue() as LineValue[]));
    void this.load();
  }

  protected ordered(index: number): number {
    return this.receipt()?.lines[index]?.orderedQuantity ?? 0;
  }

  protected accepted(index: number): number {
    const value = this.lineValues()[index];
    return value ? Number(value.receivedQuantity || 0) - Number(value.rejectedQuantity || 0) : 0;
  }

  /** Per-line rule from the API: 0 ≤ rejected ≤ received ≤ ordered. */
  protected lineError(index: number): string {
    const value = this.lineValues()[index];
    if (!value) return '';
    const received = Number(value.receivedQuantity);
    const rejected = Number(value.rejectedQuantity);
    if (!Number.isFinite(received) || !Number.isFinite(rejected) || received < 0 || rejected < 0) {
      return 'Enter zero or more.';
    }
    if (received > this.ordered(index)) {
      return `At most ${formatQuantity(this.ordered(index))} can be received.`;
    }
    if (rejected > received) {
      return 'Rejected cannot exceed received.';
    }
    return '';
  }

  protected receiveAll(): void {
    this.lines.controls.forEach((control, index) =>
      control.patchValue({ receivedQuantity: this.ordered(index), rejectedQuantity: 0 }),
    );
  }

  protected async submit(): Promise<void> {
    const receipt = this.receipt();
    if (!receipt) return;

    this.saveError.set('');
    const lineErrors = this.lines.controls.map((_, index) => this.lineError(index)).filter(Boolean);

    if (this.form.invalid || lineErrors.length > 0) {
      this.form.markAllAsTouched();
      this.saveError.set(
        lineErrors.length > 0
          ? 'Check the highlighted quantities: rejected ≤ received ≤ ordered.'
          : 'Enter the receipt date.',
      );
      return;
    }

    const value = this.form.getRawValue();

    if (this.revising() && value.revisionReason.trim().length < 3) {
      this.form.controls.revisionReason.markAsTouched();
      this.saveError.set('Describe what was wrong before saving the new version.');
      return;
    }

    this.saving.set(true);

    try {
      const payload = {
        receiptDate: value.receiptDate,
        deliveryNoteNumber: value.deliveryNoteNumber.trim() || undefined,
        carrier: value.carrier.trim() || undefined,
        vehicleNumber: value.vehicleNumber.trim() || undefined,
        receivingLocation: value.receivingLocation.trim() || undefined,
        deliveredByName: value.deliveredByName.trim() || undefined,
        checkedByName: value.checkedByName.trim() || undefined,
        receivedByName: value.receivedByName.trim() || undefined,
        receivedByTitle: value.receivedByTitle.trim() || undefined,
        notes: value.notes.trim() || undefined,
        lines: (value.lines as LineValue[]).map((line) => ({
          id: line.id,
          receivedQuantity: Number(line.receivedQuantity),
          rejectedQuantity: Number(line.rejectedQuantity),
          remarks: line.remarks.trim() || undefined,
        })),
      };
      if (this.revising()) {
        await this.receiptsApi.revise(receipt.id, {
          ...payload,
          reason: value.revisionReason.trim(),
        });
      } else {
        await this.receiptsApi.update(receipt.id, payload);
      }
      await this.router.navigate(['/goods-receipts', receipt.id]);
    } catch (error) {
      this.saveError.set(apiErrorMessage(error));
    } finally {
      this.saving.set(false);
    }
  }

  private createLine(line: GoodsReceipt['lines'][number]): LineGroup {
    return this.fb.nonNullable.group({
      id: [line.id],
      receivedQuantity: [line.receivedQuantity, [Validators.required, Validators.min(0)]],
      rejectedQuantity: [line.rejectedQuantity, [Validators.required, Validators.min(0)]],
      remarks: [line.remarks ?? ''],
    });
  }

  private async load(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) return;

    try {
      const receipt = await this.receiptsApi.get(id);
      this.receipt.set(receipt);

      this.revising.set(
        this.route.snapshot.queryParamMap.get('revise') === '1' && receipt.status === 'RECEIVED',
      );

      if (!this.canSave()) {
        this.saveError.set(
          receipt.status === 'RECEIVED'
            ? 'A received goods receipt is corrected with a revision. Use Revise on its page.'
            : 'Only draft goods receipts can be edited.',
        );
      }

      this.form.patchValue({
        receiptDate: receipt.receiptDate,
        deliveryNoteNumber: receipt.details.deliveryNoteNumber ?? '',
        carrier: receipt.details.carrier ?? '',
        vehicleNumber: receipt.details.vehicleNumber ?? '',
        receivingLocation: receipt.details.receivingLocation ?? '',
        deliveredByName: receipt.details.deliveredByName ?? '',
        checkedByName: receipt.details.checkedByName ?? '',
        receivedByName: receipt.details.receivedByName ?? '',
        receivedByTitle: receipt.details.receivedByTitle ?? '',
        notes: receipt.notes ?? '',
      });
      this.lines.clear();
      receipt.lines.forEach((line) => this.lines.push(this.createLine(line)));
      this.lineValues.set(this.lines.getRawValue() as LineValue[]);
    } catch (error) {
      this.saveError.set(apiErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }
}
