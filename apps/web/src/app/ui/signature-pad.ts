import {
  AfterViewInit,
  Component,
  ElementRef,
  forwardRef,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

/** Data URLs above this length are rejected by the API (see SIGNATURE_IMAGE_MAX_LENGTH). */
export const SIGNATURE_MAX_LENGTH = 90_000;

const CANVAS_WIDTH = 480;
const CANVAS_HEIGHT = 170;
const EXPORT_MAX_WIDTH = 600;
const EXPORT_MAX_HEIGHT = 200;
const TRIM_PADDING = 8;
const INK = '#0f1f4d';

/**
 * Signature field: draw with a mouse, finger or pen, or upload a PNG/JPEG. The value is a
 * trimmed PNG data URL (empty string when there is no signature).
 */
@Component({
  selector: 'app-signature-pad',
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => SignaturePad), multi: true },
  ],
  template: `
    <div class="pad" [class.is-disabled]="disabled()" [class.has-value]="hasValue()">
      <canvas
        #canvas
        data-testid="signature-canvas"
        [attr.aria-label]="label()"
        role="img"
        (pointerdown)="start($event)"
        (pointermove)="move($event)"
        (pointerup)="end($event)"
        (pointercancel)="end($event)"
        (pointerleave)="end($event)"
      ></canvas>
      @if (!hasValue()) {
        <span class="pad-hint" aria-hidden="true">Sign here</span>
      }
      <span class="pad-baseline" aria-hidden="true"></span>
    </div>
    <div class="pad-actions">
      <label class="pad-button">
        <input
          type="file"
          accept="image/png,image/jpeg"
          data-testid="signature-upload"
          [disabled]="disabled()"
          (change)="upload($event)"
        />
        Upload image
      </label>
      <button
        class="pad-button"
        type="button"
        data-testid="signature-clear"
        [disabled]="disabled() || !hasValue()"
        (click)="clear()"
      >
        Clear
      </button>
      @if (error()) {
        <span class="pad-error" role="alert">{{ error() }}</span>
      }
    </div>
  `,
  styles: `
    :host {
      display: grid;
      gap: 8px;
    }
    .pad {
      position: relative;
      border: 1px dashed var(--border-strong, #cbd5e1);
      border-radius: 10px;
      background:
        linear-gradient(#fff, #fff) padding-box,
        repeating-linear-gradient(0deg, transparent, transparent 23px, rgba(15, 23, 42, 0.03) 24px);
      touch-action: none;
      aspect-ratio: ${CANVAS_WIDTH} / ${CANVAS_HEIGHT};
      max-width: ${CANVAS_WIDTH}px;
    }
    .pad.has-value {
      border-style: solid;
      border-color: rgba(37, 99, 235, 0.35);
    }
    .pad.is-disabled {
      opacity: 0.6;
      pointer-events: none;
    }
    canvas {
      display: block;
      width: 100%;
      height: 100%;
      cursor: crosshair;
    }
    .pad-hint {
      position: absolute;
      inset: 0;
      display: grid;
      place-items: center;
      color: var(--faint, #94a3b8);
      font-size: 12px;
      pointer-events: none;
    }
    .pad-baseline {
      position: absolute;
      right: 24px;
      bottom: 30px;
      left: 24px;
      border-bottom: 1px solid rgba(15, 23, 42, 0.12);
      pointer-events: none;
    }
    .pad-actions {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
    }
    .pad-button {
      display: inline-flex;
      align-items: center;
      border: 1px solid var(--border, #e2e8f0);
      border-radius: 7px;
      background: var(--surface, #fff);
      padding: 6px 10px;
      color: var(--text, #0f172a);
      cursor: pointer;
      font: inherit;
      font-size: 11px;
      font-weight: 600;
    }
    .pad-button:disabled {
      cursor: not-allowed;
      opacity: 0.5;
    }
    .pad-button input {
      display: none;
    }
    .pad-error {
      color: var(--danger, #dc2626);
      font-size: 10.5px;
    }
  `,
})
export class SignaturePad implements ControlValueAccessor, AfterViewInit {
  readonly label = input('Signature drawing area');

  protected readonly hasValue = signal(false);
  protected readonly disabled = signal(false);
  protected readonly error = signal('');

  private readonly canvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private context: CanvasRenderingContext2D | null = null;
  private drawing = false;
  private lastPoint: { x: number; y: number } | null = null;
  private pendingValue = '';
  private onChange: (value: string) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  ngAfterViewInit(): void {
    const canvas = this.canvasRef().nativeElement;
    const ratio = Math.max(1, Math.min(window.devicePixelRatio || 1, 3));
    canvas.width = CANVAS_WIDTH * ratio;
    canvas.height = CANVAS_HEIGHT * ratio;
    this.context = canvas.getContext('2d');
    this.context?.scale(ratio, ratio);
    this.resetStyle();

    if (this.pendingValue) {
      void this.paintImage(this.pendingValue);
    }
  }

  writeValue(value: string | null): void {
    this.pendingValue = value ?? '';
    this.hasValue.set(Boolean(value));

    if (!this.context) {
      return;
    }

    this.wipe();
    if (value) {
      void this.paintImage(value);
    }
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(disabled: boolean): void {
    this.disabled.set(disabled);
  }

  protected start(event: PointerEvent): void {
    if (this.disabled() || !this.context) return;

    event.preventDefault();
    this.canvasRef().nativeElement.setPointerCapture?.(event.pointerId);
    this.drawing = true;
    this.error.set('');
    this.lastPoint = this.point(event);

    // A dot for a single tap.
    this.context.beginPath();
    this.context.arc(this.lastPoint.x, this.lastPoint.y, 1.1, 0, Math.PI * 2);
    this.context.fill();
  }

  protected move(event: PointerEvent): void {
    if (!this.drawing || !this.context || !this.lastPoint) return;

    event.preventDefault();
    const next = this.point(event);
    const mid = { x: (this.lastPoint.x + next.x) / 2, y: (this.lastPoint.y + next.y) / 2 };

    this.context.beginPath();
    this.context.moveTo(this.lastPoint.x, this.lastPoint.y);
    this.context.quadraticCurveTo(this.lastPoint.x, this.lastPoint.y, mid.x, mid.y);
    this.context.lineTo(next.x, next.y);
    this.context.stroke();
    this.lastPoint = next;
  }

  protected end(event: PointerEvent): void {
    if (!this.drawing) return;

    event.preventDefault();
    this.drawing = false;
    this.lastPoint = null;
    this.hasValue.set(true);
    this.emit(this.exportTrimmed());
    this.onTouched();
  }

  protected clear(): void {
    this.wipe();
    this.hasValue.set(false);
    this.error.set('');
    this.emit('');
    this.onTouched();
  }

  protected async upload(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';

    if (!file) return;

    if (!/^image\/(png|jpeg)$/.test(file.type)) {
      this.error.set('Choose a PNG or JPEG image.');
      return;
    }

    try {
      const source = await this.readFile(file);
      const image = await this.loadImage(source);
      const dataUrl = this.downscale(image);

      if (dataUrl.length > SIGNATURE_MAX_LENGTH) {
        this.error.set('This image is too detailed. Use a smaller or simpler signature image.');
        return;
      }

      this.error.set('');
      this.wipe();
      await this.paintImage(dataUrl);
      this.hasValue.set(true);
      this.emit(dataUrl);
      this.onTouched();
    } catch {
      this.error.set('The image could not be read.');
    }
  }

  private emit(value: string): void {
    if (value.length > SIGNATURE_MAX_LENGTH) {
      this.error.set('The signature is too large; clear it and sign again.');
      return;
    }
    this.pendingValue = value;
    this.onChange(value);
  }

  private point(event: PointerEvent): { x: number; y: number } {
    const rect = this.canvasRef().nativeElement.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * CANVAS_WIDTH,
      y: ((event.clientY - rect.top) / rect.height) * CANVAS_HEIGHT,
    };
  }

  private resetStyle(): void {
    if (!this.context) return;
    this.context.lineCap = 'round';
    this.context.lineJoin = 'round';
    this.context.lineWidth = 2.4;
    this.context.strokeStyle = INK;
    this.context.fillStyle = INK;
  }

  private wipe(): void {
    this.context?.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    this.resetStyle();
  }

  private async paintImage(dataUrl: string): Promise<void> {
    if (!this.context) return;

    const image = await this.loadImage(dataUrl);
    const scale = Math.min(
      (CANVAS_WIDTH - 24) / image.width,
      (CANVAS_HEIGHT - 24) / image.height,
      1.5,
    );
    const width = image.width * scale;
    const height = image.height * scale;
    this.context.drawImage(
      image,
      (CANVAS_WIDTH - width) / 2,
      (CANVAS_HEIGHT - height) / 2,
      width,
      height,
    );
  }

  /** The drawn strokes cropped to their bounding box, so the PDF can scale them to fit. */
  private exportTrimmed(): string {
    const canvas = this.canvasRef().nativeElement;
    const context = canvas.getContext('2d');
    if (!context) return '';

    const { width, height } = canvas;
    const pixels = context.getImageData(0, 0, width, height).data;
    let top = height;
    let left = width;
    let right = -1;
    let bottom = -1;

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if (pixels[(y * width + x) * 4 + 3]! > 8) {
          if (x < left) left = x;
          if (x > right) right = x;
          if (y < top) top = y;
          if (y > bottom) bottom = y;
        }
      }
    }

    if (right < 0) return '';

    const pad = TRIM_PADDING * (width / CANVAS_WIDTH);
    const sx = Math.max(0, left - pad);
    const sy = Math.max(0, top - pad);
    const sw = Math.min(width, right + pad) - sx;
    const sh = Math.min(height, bottom + pad) - sy;
    const scale = Math.min(EXPORT_MAX_WIDTH / sw, EXPORT_MAX_HEIGHT / sh, 1);

    const output = document.createElement('canvas');
    output.width = Math.max(1, Math.round(sw * scale));
    output.height = Math.max(1, Math.round(sh * scale));
    output.getContext('2d')?.drawImage(canvas, sx, sy, sw, sh, 0, 0, output.width, output.height);

    return output.toDataURL('image/png');
  }

  private downscale(image: HTMLImageElement): string {
    const scale = Math.min(EXPORT_MAX_WIDTH / image.width, EXPORT_MAX_HEIGHT / image.height, 1);
    const output = document.createElement('canvas');
    output.width = Math.max(1, Math.round(image.width * scale));
    output.height = Math.max(1, Math.round(image.height * scale));
    output.getContext('2d')?.drawImage(image, 0, 0, output.width, output.height);

    const png = output.toDataURL('image/png');
    return png.length <= SIGNATURE_MAX_LENGTH ? png : output.toDataURL('image/jpeg', 0.85);
  }

  private readFile(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  private loadImage(source: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Unreadable image'));
      image.src = source;
    });
  }
}
