import { Component, computed, input } from '@angular/core';
import { BuilderElement } from './builder-element';
import { DesignElement, PageSettings, pageDimensions, SampleContext } from './builder.model';

/** A live miniature of a page, drawn with the same renderer as the editor (in preview mode). */
@Component({
  selector: 'app-design-thumb',
  imports: [BuilderElement],
  template: `
    <div class="frame" [class.is-flat]="flat()" [style.height.px]="size().height * scale()">
      <div
        class="page"
        [style.width.px]="size().width"
        [style.height.px]="size().height"
        [style.background]="page().background"
        [style.transform]="'scale(' + scale() + ')'"
      >
        @for (el of visible(); track el.id) {
          <app-builder-element [element]="el" [context]="context()" [preview]="true" />
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
      border-radius: 6px;
      box-shadow:
        0 0 0 1px rgba(0, 0, 0, 0.06),
        0 2px 8px rgba(15, 23, 42, 0.08);
      background: #fff;
    }
    .frame.is-flat {
      border-radius: 0;
      box-shadow: none;
    }
    .page {
      position: absolute;
      top: 0;
      left: 0;
      overflow: hidden;
      transform-origin: 0 0;
      pointer-events: none;
    }
  `,
})
export class DesignThumb {
  readonly elements = input.required<DesignElement[]>();
  readonly page = input.required<PageSettings>();
  readonly context = input.required<SampleContext>();
  readonly width = input(132);
  /** No rounded corners or shadow (printing). */
  readonly flat = input(false);

  protected readonly size = computed(() => pageDimensions(this.page()));
  protected readonly scale = computed(() => this.width() / this.size().width);
  protected readonly visible = computed(() => this.elements().filter((el) => !el.hidden));
}
