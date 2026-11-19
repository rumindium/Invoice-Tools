import {
  afterNextRender,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  input,
  output,
  untracked,
  viewChild,
} from '@angular/core';
import {
  DesignElement,
  fieldLabel,
  fontStack,
  resolveText,
  SampleContext,
  SHAPE_PATHS,
  TABLE_COLUMN_LABELS,
  textSegments,
  TOTALS_LABELS,
  TotalsRowKey,
} from './builder.model';

const TOTALS_ORDER: TotalsRowKey[] = ['subtotal', 'discount', 'tax', 'total', 'paid', 'balance'];
const NUMERIC_COLUMNS = new Set(['quantity', 'price', 'tax', 'amount']);

/**
 * Draws one design element at its position. Used by the editor canvas and by thumbnails; text,
 * tables and totals size their height to their content and report it through `measured`.
 */
@Component({
  selector: 'app-builder-element',
  templateUrl: './builder-element.html',
  styleUrl: './builder-element.scss',
  host: {
    '[style.left.px]': 'element().x',
    '[style.top.px]': 'element().y',
    '[style.width.px]': 'element().width',
    '[style.height.px]': 'autoHeight() ? null : element().height',
    '[style.transform]': "element().rotation ? 'rotate(' + element().rotation + 'deg)' : null",
    '[style.opacity]': 'element().opacity',
    '[attr.data-type]': 'element().type',
    '[attr.data-name]': 'element().name',
    '[class.is-editing]': 'editing()',
  },
})
export class BuilderElement {
  readonly element = input.required<DesignElement>();
  readonly context = input.required<SampleContext>();
  readonly preview = input(false);
  readonly editing = input(false);

  readonly measured = output<number>();
  readonly textCommit = output<string>();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly editor = viewChild<ElementRef<HTMLElement>>('editor');

  protected readonly fontStack = fontStack;
  protected readonly shapePaths = SHAPE_PATHS;

  protected readonly autoHeight = computed(() =>
    ['text', 'table', 'totals'].includes(this.element().type),
  );

  protected readonly text = computed(() => {
    const el = this.element();
    return el.type === 'text' ? el : null;
  });
  protected readonly shape = computed(() => {
    const el = this.element();
    return el.type === 'shape' ? el : null;
  });
  protected readonly line = computed(() => {
    const el = this.element();
    return el.type === 'line' ? el : null;
  });
  protected readonly image = computed(() => {
    const el = this.element();
    return el.type === 'image' ? el : null;
  });
  protected readonly table = computed(() => {
    const el = this.element();
    return el.type === 'table' ? el : null;
  });
  protected readonly totals = computed(() => {
    const el = this.element();
    return el.type === 'totals' ? el : null;
  });

  /** Literal text and fields, each field with its sample value. */
  protected readonly segments = computed(() => {
    const el = this.text();
    if (!el) {
      return [];
    }
    const values = this.context().values;
    return textSegments(el.text).map((segment) => ({
      text: segment.token ? (values[segment.token] ?? segment.text) : segment.text,
      token: segment.token,
      known: segment.token ? segment.token in values : true,
      label: segment.token ? fieldLabel(segment.token) : '',
    }));
  });

  protected readonly resolved = computed(() => {
    const el = this.text();
    return el ? resolveText(el.text, this.context()) : '';
  });

  protected readonly imageSrc = computed(() => {
    const el = this.image();
    if (!el) {
      return null;
    }
    if (el.src) {
      return el.src;
    }
    if (el.role === 'logo') {
      return this.context().logoSrc;
    }
    return el.role === 'signature' ? (this.context().signatureSrc ?? null) : null;
  });

  protected readonly visibleColumns = computed(
    () => this.table()?.columns.filter((column) => column.visible) ?? [],
  );

  protected readonly totalsRows = computed(() => {
    const el = this.totals();
    if (!el) {
      return [];
    }
    return TOTALS_ORDER.filter((key) => el.rows[key]).map((key) => ({
      key,
      label: TOTALS_LABELS[key],
      value: this.context().totals[key],
    }));
  });

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      if (typeof ResizeObserver === 'undefined') {
        return;
      }
      const observer = new ResizeObserver(() => this.reportHeight());
      observer.observe(this.host.nativeElement);
      destroyRef.onDestroy(() => observer.disconnect());
    });

    // Entering edit mode: show the raw text (with {{fields}}), focus and select it. Only the
    // editor appearing triggers this — not later element updates (e.g. the height growing while
    // typing), which would otherwise reset the text mid-edit.
    effect(() => {
      const editor = this.editor()?.nativeElement;
      if (!editor || !this.editing()) {
        return;
      }
      const el = untracked(() => this.text());
      if (!el) {
        return;
      }
      editor.textContent = el.text;
      editor.focus();
      const range = document.createRange();
      range.selectNodeContents(editor);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    });
  }

  protected columnLabel(key: string, label: string): string {
    return label || TABLE_COLUMN_LABELS[key as keyof typeof TABLE_COLUMN_LABELS];
  }

  protected isNumeric(key: string): boolean {
    return NUMERIC_COLUMNS.has(key);
  }

  protected finishEditing(event: FocusEvent): void {
    const value = (event.target as HTMLElement).innerText.replace(/\n$/, '');
    this.textCommit.emit(value);
  }

  protected editorKeydown(event: KeyboardEvent): void {
    event.stopPropagation();
    if (event.key === 'Escape') {
      (event.target as HTMLElement).blur();
    }
  }

  private reportHeight(): void {
    if (!this.autoHeight()) {
      return;
    }
    const height = this.host.nativeElement.offsetHeight;
    if (height > 0 && Math.abs(height - this.element().height) >= 0.5) {
      this.measured.emit(height);
    }
  }
}
