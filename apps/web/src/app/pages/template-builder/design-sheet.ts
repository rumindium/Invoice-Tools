import {
  afterNextRender,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  input,
  signal,
} from '@angular/core';
import { BuilderElement } from './builder-element';
import { DesignElement, PageSettings, pageDimensions, SampleContext } from './builder.model';

/** Elements starting this close to the bottom edge are footers (as in the PDF renderer). */
const FOOTER_BAND = 140;

/**
 * A document drawn with its template-builder design, scaled to the available width. Like the
 * PDF, the items table grows with the document's lines and everything designed below it moves
 * along; footers stay at the bottom of the (longer) page.
 */
@Component({
  selector: 'app-design-sheet',
  imports: [BuilderElement],
  template: `
    <div class="frame" [style.height.px]="height() * scale()">
      <div
        class="sheet"
        [attr.data-testid]="testId()"
        [attr.data-design-id]="designId()"
        [style.width.px]="size().width"
        [style.height.px]="height()"
        [style.background]="page().background"
        [style.transform]="'scale(' + scale() + ')'"
      >
        @for (el of placed(); track el.id) {
          <app-builder-element
            [element]="el"
            [context]="context()"
            [preview]="true"
            (measured)="measure(el.id, $event)"
          />
        }
        @if (stamp(); as stamp) {
          <div class="stamp" data-testid="design-stamp" aria-hidden="true">{{ stamp }}</div>
        }
      </div>
    </div>
  `,
  styles: `
    :host {
      display: block;
      width: 100%;
    }
    .frame {
      position: relative;
      overflow: hidden;
      border: 1px solid #e5e7eb;
      border-radius: 4px;
      background: #fff;
      box-shadow:
        0 1px 2px rgba(15, 23, 42, 0.06),
        0 12px 32px -12px rgba(15, 23, 42, 0.18);
    }
    .sheet {
      position: absolute;
      top: 0;
      left: 0;
      overflow: hidden;
      transform-origin: 0 0;
    }
    .stamp {
      position: absolute;
      top: 44%;
      left: 50%;
      color: rgba(220, 38, 38, 0.1);
      font:
        800 110px/1 Helvetica,
        Arial,
        sans-serif;
      letter-spacing: 0.04em;
      white-space: nowrap;
      transform: translate(-50%, -50%) rotate(-30deg);
      pointer-events: none;
    }
  `,
})
export class DesignSheet {
  readonly page = input.required<PageSettings>();
  readonly elements = input.required<DesignElement[]>();
  readonly context = input.required<SampleContext>();
  readonly stamp = input<string | null>(null);
  readonly designId = input<string | null>(null);
  readonly testId = input('design-sheet');

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly width = signal(794);
  private readonly heights = signal<Record<string, number>>({});

  protected readonly size = computed(() => pageDimensions(this.page()));
  protected readonly scale = computed(() => Math.min(1.5, this.width() / this.size().width));

  private readonly visible = computed(() => this.elements().filter((el) => !el.hidden));
  private readonly table = computed(() => this.visible().find((el) => el.type === 'table') ?? null);

  /** How much the items table grew (or shrank) against the design. */
  private readonly delta = computed(() => {
    const table = this.table();
    return table ? (this.heights()[table.id] ?? table.height) - table.height : 0;
  });

  protected readonly height = computed(() => this.size().height + Math.max(0, this.delta()));

  protected readonly placed = computed(() => {
    const table = this.table();
    const delta = this.delta();
    if (!table || delta === 0) {
      return this.visible();
    }
    const tableBottom = table.y + table.height;
    const footerLine = this.size().height - FOOTER_BAND;
    return this.visible().map((el) => {
      if (el === table) return el;
      if (el.y >= footerLine) return { ...el, y: el.y + Math.max(0, delta) };
      if (el.y >= tableBottom - 1) return { ...el, y: el.y + delta };
      return el;
    });
  });

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      const update = () => this.width.set(this.host.nativeElement.clientWidth || 794);
      update();
      const observer = new ResizeObserver(update);
      observer.observe(this.host.nativeElement);
      destroyRef.onDestroy(() => observer.disconnect());
    });
  }

  protected measure(id: string, height: number): void {
    if (id === this.table()?.id) {
      this.heights.update((heights) => ({ ...heights, [id]: height }));
    }
  }
}
