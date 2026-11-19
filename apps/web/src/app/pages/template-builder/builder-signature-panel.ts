import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SignaturePad } from '../../ui/signature-pad';
import { BuilderIcon } from './builder-icon';
import { INSERT_MIME, InsertRequest } from './builder-presets';
import { BuilderStore } from './builder.store';
import { DesignAsset } from './design-storage.service';

/**
 * Draw or upload a signature (the app's signature pad), keep it in the library, and drop it on the
 * page — into the selected signature slot when there is one.
 */
@Component({
  selector: 'app-builder-signature-panel',
  imports: [FormsModule, SignaturePad, BuilderIcon],
  template: `
    <section class="section" data-testid="panel-signature">
      <p class="lede">
        @if (slot()) {
          <strong>A signature slot is selected</strong> — your signature goes straight into it.
        } @else {
          Draw with your mouse, finger or pen, or upload a PNG/JPEG.
        }
      </p>
      <app-signature-pad
        label="Draw your signature"
        [ngModel]="drawing()"
        (ngModelChange)="drawing.set($event)"
      />
      <div class="actions">
        <button
          type="button"
          class="btn primary"
          data-testid="signature-use"
          [disabled]="!drawing()"
          (click)="useDrawing()"
        >
          <app-tb-icon name="check" [size]="16" />
          {{ slot() ? 'Place in slot' : 'Add to page' }}
        </button>
        <button
          type="button"
          class="btn"
          data-testid="signature-save"
          [disabled]="!drawing()"
          (click)="save()"
        >
          Save for later
        </button>
      </div>

      <h3>Saved signatures</h3>
      <div class="grid" data-testid="saved-signatures">
        @for (asset of signatures(); track asset.id) {
          <div class="item">
            <button
              type="button"
              class="thumb"
              draggable="true"
              data-testid="saved-signature"
              [attr.aria-label]="'Use ' + asset.name"
              (click)="use(asset.src)"
              (dragstart)="dragStart($event, { preset: 'signature', data: asset.src })"
            >
              <img [src]="asset.src" [alt]="asset.name" />
            </button>
            <button
              type="button"
              class="remove"
              [attr.aria-label]="'Remove ' + asset.name"
              (click)="remove(asset)"
            >
              <app-tb-icon name="close" [size]="12" />
            </button>
          </div>
        } @empty {
          <p class="empty">Saved signatures appear here, ready to reuse.</p>
        }
      </div>

      <h3>Signature block</h3>
      <button
        type="button"
        class="block"
        draggable="true"
        data-testid="tile-signature-block"
        (click)="insert({ preset: 'signature-block' })"
        (dragstart)="dragStart($event, { preset: 'signature-block' })"
      >
        <span class="sig-slot">Signature</span>
        <span class="sig-line"></span>
        <strong>Signatory name</strong>
        <span>Signatory title</span>
      </button>
    </section>
  `,
  styles: `
    .section {
      padding: 4px 16px 28px;
    }
    h3 {
      margin: 22px 0 8px;
      color: var(--st-text, #1b1f27);
      font-family: var(--font-sans);
      font-size: 13px;
      font-weight: 700;
    }
    .lede {
      margin: 6px 0 12px;
      color: var(--st-muted, #5b6474);
      font-size: 11.5px;
      line-height: 1.5;
    }
    .lede strong {
      color: var(--st-accent-ink, #1e40af);
    }
    .actions {
      display: flex;
      gap: 8px;
      margin-top: 10px;
    }
    .btn {
      display: inline-flex;
      height: 36px;
      flex: 1;
      align-items: center;
      justify-content: center;
      gap: 6px;
      border: 1px solid var(--st-line, #e5e7eb);
      border-radius: 9px;
      background: #fff;
      color: var(--st-text, #1b1f27);
      cursor: pointer;
      font: inherit;
      font-size: 12.5px;
      font-weight: 650;
    }
    .btn.primary {
      border: 0;
      background: var(--st-accent, #2563eb);
      color: #fff;
    }
    .btn:disabled {
      cursor: not-allowed;
      opacity: 0.45;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
    }
    .item {
      position: relative;
    }
    .thumb {
      display: grid;
      width: 100%;
      height: 70px;
      place-items: center;
      border: 1px solid var(--st-line, #e5e7eb);
      border-radius: 10px;
      background: #fff;
      padding: 6px;
      cursor: grab;
    }
    .thumb:hover {
      border-color: var(--st-accent-line, #bfdbfe);
    }
    .thumb img {
      max-width: 100%;
      max-height: 100%;
    }
    .remove {
      position: absolute;
      top: 4px;
      right: 4px;
      display: grid;
      width: 20px;
      height: 20px;
      place-items: center;
      border: 0;
      border-radius: 50%;
      background: rgba(27, 31, 39, 0.7);
      color: #fff;
      cursor: pointer;
      opacity: 0;
    }
    .item:hover .remove,
    .remove:focus-visible {
      opacity: 1;
    }
    .empty {
      grid-column: 1 / -1;
      margin: 0;
      color: var(--st-faint, #8b93a1);
      font-size: 12px;
    }
    .block {
      display: grid;
      width: 100%;
      justify-items: center;
      gap: 3px;
      border: 1px solid var(--st-line, #e5e7eb);
      border-radius: 12px;
      background: var(--st-bg, #f7f8fa);
      padding: 14px;
      cursor: grab;
      font: inherit;
    }
    .block:hover {
      border-color: var(--st-accent-line, #bfdbfe);
      background: var(--st-accent-soft, #eff6ff);
    }
    .sig-slot {
      border: 1.5px dashed #93c5fd;
      border-radius: 6px;
      padding: 8px 26px;
      color: var(--st-accent, #2563eb);
      font-size: 11px;
      font-weight: 600;
    }
    .sig-line {
      width: 70%;
      margin: 4px 0 2px;
      border-top: 1px solid #9ca3af;
    }
    .block strong {
      color: var(--st-text, #1b1f27);
      font-size: 12px;
    }
    .block span:last-child {
      color: var(--st-muted, #5b6474);
      font-size: 11px;
    }
  `,
})
export class BuilderSignaturePanel {
  private readonly store = inject(BuilderStore);
  protected readonly drawing = signal('');

  protected readonly signatures = computed<DesignAsset[]>(() =>
    this.store.assets().filter((asset) => asset.kind === 'signature'),
  );

  /** The selected signature image, if any. */
  protected readonly slot = computed(() => {
    const el = this.store.single();
    return el?.type === 'image' && el.role === 'signature' && !el.locked ? el : null;
  });

  protected async save(): Promise<boolean> {
    const drawing = this.drawing();
    if (!drawing) {
      return false;
    }
    const saved = await this.store.addAsset(
      'signature',
      `Signature ${this.signatures().length + 1}`,
      drawing,
    );
    if (saved) {
      this.store.notify('Signature saved');
    }
    return Boolean(saved);
  }

  protected useDrawing(): void {
    const drawing = this.drawing();
    if (!drawing) {
      return;
    }
    this.use(drawing);
    if (!this.signatures().some((asset) => asset.src === drawing)) {
      void this.store.addAsset('signature', `Signature ${this.signatures().length + 1}`, drawing);
    }
  }

  protected use(src: string): void {
    const slot = this.slot();
    if (slot) {
      this.store.update(slot.id, { src });
      return;
    }
    void this.store.insert({ preset: 'signature', data: src });
  }

  protected insert(request: InsertRequest): void {
    void this.store.insert(request);
  }

  protected remove(asset: DesignAsset): void {
    void this.store.removeAsset(asset.id);
  }

  protected dragStart(event: DragEvent, request: InsertRequest): void {
    event.dataTransfer?.setData(INSERT_MIME, JSON.stringify(request));
  }
}
