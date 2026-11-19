import { Component, computed, inject, signal } from '@angular/core';
import { BuilderIcon } from './builder-icon';
import { DesignElement } from './builder.model';
import { BuilderStore } from './builder.store';

const TYPE_ICON: Record<DesignElement['type'], string> = {
  text: 'text',
  shape: 'elements',
  line: 'minus',
  image: 'image',
  table: 'table',
  totals: 'totals',
};

const LAYER_MIME = 'application/x-rinv-layer';

/** Stacking order, top layer first: select, rename, hide, lock and drag to reorder. */
@Component({
  selector: 'app-builder-layers-panel',
  imports: [BuilderIcon],
  template: `
    <section class="section" data-testid="panel-layers">
      <p class="lede">Top of the list is in front. Drag to reorder, double-click to rename.</p>
      <ul class="layers" data-testid="layers-list">
        @for (layer of layers(); track layer.element.id) {
          <li
            class="layer"
            draggable="true"
            [class.is-selected]="layer.selected"
            [class.is-hidden]="layer.element.hidden"
            [class.drop-above]="dropTarget() === layer.index && dropAbove()"
            [class.drop-below]="dropTarget() === layer.index && !dropAbove()"
            [attr.data-testid]="'layer-' + layer.element.id"
            (dragstart)="dragStart($event, layer.element.id)"
            (dragover)="dragOver($event, layer.index)"
            (dragleave)="dropTarget.set(null)"
            (drop)="drop($event, layer.index)"
          >
            <span class="grip"><app-tb-icon name="drag" [size]="16" /></span>
            <span class="type"><app-tb-icon [name]="icon(layer.element)" [size]="16" /></span>
            @if (renaming() === layer.element.id) {
              <input
                class="rename"
                aria-label="Layer name"
                data-testid="layer-rename"
                [value]="layer.element.name"
                (keydown.enter)="finishRename(layer.element.id, $event)"
                (keydown.escape)="renaming.set(null)"
                (blur)="finishRename(layer.element.id, $event)"
              />
            } @else {
              <button
                type="button"
                class="name"
                [attr.aria-pressed]="layer.selected"
                (click)="select(layer.element.id, $event)"
                (dblclick)="renaming.set(layer.element.id)"
              >
                <strong>{{ layer.element.name }}</strong>
                <span>{{ layer.element.type }}{{ layer.element.groupId ? ' · grouped' : '' }}</span>
              </button>
            }
            <button
              type="button"
              class="toggle"
              [class.is-on]="layer.element.hidden"
              [attr.aria-label]="(layer.element.hidden ? 'Show ' : 'Hide ') + layer.element.name"
              [attr.data-testid]="'layer-visibility-' + layer.element.id"
              (click)="store.toggleHidden(layer.element.id)"
            >
              <app-tb-icon [name]="layer.element.hidden ? 'eyeOff' : 'eye'" [size]="15" />
            </button>
            <button
              type="button"
              class="toggle"
              [class.is-on]="layer.element.locked"
              [attr.aria-label]="(layer.element.locked ? 'Unlock ' : 'Lock ') + layer.element.name"
              [attr.data-testid]="'layer-lock-' + layer.element.id"
              (click)="toggleLock(layer.element)"
            >
              <app-tb-icon [name]="layer.element.locked ? 'lock' : 'unlock'" [size]="15" />
            </button>
          </li>
        } @empty {
          <li class="empty">Nothing on the page yet.</li>
        }
      </ul>
    </section>
  `,
  styles: `
    .section {
      padding: 4px 12px 28px;
    }
    .lede {
      margin: 6px 4px 12px;
      color: var(--st-muted, #5b6474);
      font-size: 11.5px;
      line-height: 1.5;
    }
    .layers {
      display: grid;
      gap: 2px;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .layer {
      position: relative;
      display: flex;
      align-items: center;
      gap: 4px;
      border-radius: 9px;
      padding: 3px 4px;
    }
    .layer:hover {
      background: var(--st-surface-2, #f1f3f9);
    }
    .layer.is-selected {
      background: var(--st-accent-soft, #eff6ff);
    }
    .layer.is-hidden .name,
    .layer.is-hidden .type {
      opacity: 0.45;
    }
    .layer.drop-above::before,
    .layer.drop-below::after {
      position: absolute;
      right: 6px;
      left: 6px;
      height: 2px;
      border-radius: 2px;
      background: var(--st-accent, #2563eb);
      content: '';
    }
    .layer.drop-above::before {
      top: -2px;
    }
    .layer.drop-below::after {
      bottom: -2px;
    }
    .grip {
      color: var(--st-faint, #8b93a1);
      cursor: grab;
    }
    .type {
      display: grid;
      width: 28px;
      height: 28px;
      flex: none;
      place-items: center;
      border-radius: 7px;
      background: #fff;
      color: var(--st-muted, #5b6474);
      box-shadow: inset 0 0 0 1px var(--st-line, #e5e7eb);
    }
    .name {
      display: grid;
      min-width: 0;
      flex: 1;
      border: 0;
      background: none;
      padding: 3px 4px;
      cursor: pointer;
      font: inherit;
      text-align: left;
    }
    .name strong {
      overflow: hidden;
      color: var(--st-text, #1b1f27);
      font-size: 12.5px;
      font-weight: 600;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .name span {
      color: var(--st-faint, #8b93a1);
      font-size: 10.5px;
      text-transform: capitalize;
    }
    .rename {
      min-width: 0;
      flex: 1;
      border: 1px solid var(--st-accent, #2563eb);
      border-radius: 6px;
      padding: 5px 7px;
      font: inherit;
      font-size: 12.5px;
      outline: none;
    }
    .toggle {
      display: grid;
      width: 28px;
      height: 28px;
      flex: none;
      place-items: center;
      border: 0;
      border-radius: 7px;
      background: none;
      color: var(--st-faint, #8b93a1);
      cursor: pointer;
      opacity: 0;
    }
    .layer:hover .toggle,
    .toggle.is-on,
    .toggle:focus-visible {
      opacity: 1;
    }
    .toggle:hover {
      background: var(--st-line, #e5e7eb);
      color: var(--st-text, #1b1f27);
    }
    .toggle.is-on {
      color: #d97706;
    }
    .empty {
      padding: 12px 6px;
      color: var(--st-faint, #8b93a1);
      font-size: 12px;
    }
  `,
})
export class BuilderLayersPanel {
  protected readonly store = inject(BuilderStore);
  protected readonly renaming = signal<string | null>(null);
  protected readonly dropTarget = signal<number | null>(null);
  protected readonly dropAbove = signal(true);

  /** Elements top-first, with their stacking index. */
  protected readonly layers = computed(() => {
    const selected = new Set(this.store.selection());
    const elements = this.store.elements();
    return elements
      .map((element, index) => ({ element, index, selected: selected.has(element.id) }))
      .reverse();
  });

  protected icon(element: DesignElement): string {
    return TYPE_ICON[element.type];
  }

  protected select(id: string, event: MouseEvent): void {
    if (event.shiftKey || event.metaKey || event.ctrlKey) {
      this.store.select(id, true);
    } else {
      this.store.selectOnly(id);
    }
  }

  protected toggleLock(element: DesignElement): void {
    this.store.update(element.id, { locked: !element.locked });
  }

  protected finishRename(id: string, event: Event): void {
    if (this.renaming() !== id) {
      return;
    }
    this.store.rename(id, (event.target as HTMLInputElement).value);
    this.renaming.set(null);
  }

  protected dragStart(event: DragEvent, id: string): void {
    event.dataTransfer?.setData(LAYER_MIME, id);
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
    }
  }

  protected dragOver(event: DragEvent, index: number): void {
    if (!event.dataTransfer?.types.includes(LAYER_MIME)) {
      return;
    }
    event.preventDefault();
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    this.dropAbove.set(event.clientY < rect.top + rect.height / 2);
    this.dropTarget.set(index);
  }

  protected drop(event: DragEvent, index: number): void {
    const id = event.dataTransfer?.getData(LAYER_MIME);
    this.dropTarget.set(null);
    if (!id) {
      return;
    }
    event.preventDefault();
    const from = this.store.elements().findIndex((element) => element.id === id);
    // The list is reversed: "above" in the list means higher in the stack.
    let target = this.dropAbove() ? index + 1 : index;
    if (from < target) {
      target -= 1;
    }
    this.store.moveToIndex(id, target);
  }
}
