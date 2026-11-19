import {
  afterNextRender,
  afterRenderEffect,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { BuilderElement } from './builder-element';
import { INSERT_MIME, InsertRequest } from './builder-presets';
import { AUTO_HEIGHT_TYPES, BuilderStore, Guides } from './builder.store';
import { boundsOf, DesignElement, Frame, unionBounds } from './builder.model';
import { readImageFile } from './design-storage.service';

type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

const ALL_HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
const TEXT_HANDLES: Handle[] = ['nw', 'ne', 'e', 'se', 'sw', 'w'];
const LINE_HANDLES: Handle[] = ['e', 'w'];
const PAGE_MARGIN = 40;
const SNAP_PX = 6;
const MIN_SIZE = 8;

interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
  rotation: number;
}

function snapAxis(edges: number[], targets: number[], threshold: number) {
  let best: number | null = null;
  for (const edge of edges) {
    for (const target of targets) {
      const delta = target - edge;
      if (Math.abs(delta) <= threshold && (best === null || Math.abs(delta) < Math.abs(best))) {
        best = delta;
      }
    }
  }
  if (best === null) {
    return { delta: 0, lines: [] as number[] };
  }
  const delta = best;
  const lines = targets.filter((target) =>
    edges.some((edge) => Math.abs(edge + delta - target) < 0.5),
  );
  return { delta, lines: [...new Set(lines)] };
}

function round(value: number): number {
  return Math.round(value * 2) / 2;
}

/**
 * The editing surface: the page at the current zoom, with selection handles, snapping guides,
 * marquee selection and drop targets drawn in screen space above it.
 */
@Component({
  selector: 'app-builder-canvas',
  imports: [BuilderElement],
  templateUrl: './builder-canvas.html',
  styleUrl: './builder-canvas.scss',
})
export class BuilderCanvas {
  protected readonly store = inject(BuilderStore);
  private readonly workspace = viewChild.required<ElementRef<HTMLElement>>('workspace');
  private readonly sizer = viewChild.required<ElementRef<HTMLElement>>('sizer');
  private readonly rulerX = viewChild<ElementRef<HTMLCanvasElement>>('rulerX');
  private readonly rulerY = viewChild<ElementRef<HTMLCanvasElement>>('rulerY');
  private rulerFrame = 0;

  protected readonly zoom = this.store.zoom;
  protected readonly page = this.store.page;
  protected readonly design = this.store.design;
  protected readonly margin = PAGE_MARGIN;

  protected readonly visible = computed(() => this.store.elements().filter((el) => !el.hidden));
  protected readonly marquee = signal<Box | null>(null);
  protected readonly badge = signal<{ text: string; left: number; top: number } | null>(null);
  protected readonly dropActive = signal(false);
  private readonly fit = signal(0.75);

  protected readonly selectionBoxes = computed(() =>
    this.store.preview()
      ? []
      : this.store.selected().map((el) => ({ ...this.box(el), id: el.id, locked: el.locked })),
  );

  protected readonly handleBox = computed(() => {
    const el = this.store.single();
    if (!el || el.locked || this.store.preview() || this.store.editingId() === el.id) {
      return null;
    }
    return this.box(el);
  });

  protected readonly handles = computed<Handle[]>(() => {
    const el = this.store.single();
    if (!el) return [];
    if (el.type === 'line') return LINE_HANDLES;
    if (AUTO_HEIGHT_TYPES.has(el.type)) return TEXT_HANDLES;
    return ALL_HANDLES;
  });

  protected readonly groupBox = computed(() => {
    const selected = this.store.selected();
    const bounds = this.store.selectionBounds();
    if (selected.length < 2 || !bounds || this.store.preview()) {
      return null;
    }
    const z = this.zoom();
    return {
      left: bounds.left * z,
      top: bounds.top * z,
      width: (bounds.right - bounds.left) * z,
      height: (bounds.bottom - bounds.top) * z,
    };
  });

  protected readonly hoverBox = computed(() => {
    const id = this.store.hoverId();
    if (!id || this.store.preview() || this.store.selection().includes(id)) {
      return null;
    }
    const el = this.store.elements().find((entry) => entry.id === id);
    return el && !el.hidden ? this.box(el) : null;
  });

  protected readonly guideLines = computed(() => {
    const guides: Guides = this.store.guides();
    const z = this.zoom();
    return {
      vertical: guides.vertical.map((x) => x * z),
      horizontal: guides.horizontal.map((y) => y * z),
    };
  });

  constructor() {
    const destroyRef = inject(DestroyRef);

    // Rulers follow zoom, page size, the selection and scrolling.
    afterRenderEffect(() => {
      this.zoom();
      this.page();
      this.store.selectionBounds();
      this.store.showRulers();
      this.drawRulers();
    });

    afterNextRender(() => {
      const workspace = this.workspace().nativeElement;
      const observer = new ResizeObserver(() => {
        this.measureFit();
        this.scheduleRulers();
      });
      observer.observe(workspace);
      destroyRef.onDestroy(() => observer.disconnect());
      this.measureFit();
    });

    // Follow the window size while in "fit" mode; page size changes refit too.
    effect(() => {
      const fit = this.fit();
      const mode = this.store.zoomMode();
      this.page();
      if (mode === 'fit') {
        untracked(() => this.store.zoom.set(fit));
      }
    });
    effect(() => {
      this.page();
      untracked(() => this.measureFit());
    });
  }

  /* -------------------------------------------------------------------------------- rulers */

  protected scheduleRulers(): void {
    cancelAnimationFrame(this.rulerFrame);
    this.rulerFrame = requestAnimationFrame(() => this.drawRulers());
  }

  /** Millimetre rulers: page edges, the selection's extent, and ticks that adapt to the zoom. */
  private drawRulers(): void {
    const sizer = this.sizer()?.nativeElement;
    const top = this.rulerX()?.nativeElement;
    const left = this.rulerY()?.nativeElement;
    if (!sizer || !top || !left) {
      return;
    }
    const zoom = this.zoom();
    const page = this.page();
    const bounds = this.store.selectionBounds();
    const sizerRect = sizer.getBoundingClientRect();
    const pxPerMm = (96 / 25.4) * zoom;
    const major = [1, 2, 5, 10, 20, 50, 100].find((step) => step * pxPerMm >= 56) ?? 100;
    const minor = major === 1 ? 0.5 : major === 2 ? 1 : major / 5;

    const draw = (canvas: HTMLCanvasElement, horizontal: boolean) => {
      const rect = canvas.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(rect.width * ratio);
      canvas.height = Math.round(rect.height * ratio);
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.scale(ratio, ratio);
      // "along" runs with the ruler, "across" is its thickness.
      const length = horizontal ? rect.width : rect.height;
      const depth = horizontal ? rect.height : rect.width;
      const fill = (along: number, across: number, size: number, thickness: number) =>
        horizontal
          ? ctx.fillRect(along, across, size, thickness)
          : ctx.fillRect(across, along, thickness, size);
      const origin = horizontal ? sizerRect.left - rect.left : sizerRect.top - rect.top;
      const extent = (horizontal ? page.width : page.height) * zoom;

      ctx.fillStyle = '#f7f8fa';
      fill(0, 0, length, depth);
      ctx.fillStyle = '#ffffff';
      fill(origin, 0, extent, depth);

      if (bounds) {
        const from = origin + (horizontal ? bounds.left : bounds.top) * zoom;
        const to = origin + (horizontal ? bounds.right : bounds.bottom) * zoom;
        ctx.fillStyle = 'rgba(37, 99, 235, 0.12)';
        fill(from, 0, to - from, depth);
        ctx.fillStyle = '#2563eb';
        fill(from, 0, 1, depth);
        fill(to - 1, 0, 1, depth);
      }

      ctx.fillStyle = '#c4cbd6';
      const labels: Array<[number, string]> = [];
      let mm = Math.floor(-origin / pxPerMm / minor) * minor;
      for (let guard = 0; guard < 5000; guard += 1, mm += minor) {
        const position = Math.round(origin + mm * pxPerMm);
        if (position > length) break;
        const rounded = Math.round(mm * 100) / 100;
        const isMajor = Math.abs(rounded / major - Math.round(rounded / major)) < 1e-6;
        const isHalf =
          !isMajor && Math.abs((rounded * 2) / major - Math.round((rounded * 2) / major)) < 1e-6;
        const tick = Math.round(isMajor ? depth * 0.55 : isHalf ? depth * 0.35 : depth * 0.2);
        fill(position, depth - tick, 1, tick);
        if (isMajor) labels.push([position, String(Math.round(rounded))]);
      }

      ctx.fillStyle = '#8b93a1';
      ctx.font = "500 9px 'IBM Plex Mono', ui-monospace, monospace";
      for (const [position, label] of labels) {
        if (horizontal) {
          ctx.textBaseline = 'top';
          ctx.fillText(label, position + 3, 3);
        } else {
          ctx.save();
          ctx.translate(3, position + 3);
          ctx.rotate(Math.PI / 2);
          ctx.textBaseline = 'bottom';
          ctx.fillText(label, 0, 0);
          ctx.restore();
        }
      }
      ctx.fillStyle = '#e5e7eb';
      fill(0, depth - 1, length, 1);
    };

    draw(top, true);
    draw(left, false);
  }

  private measureFit(): void {
    const workspace = this.workspace()?.nativeElement;
    if (!workspace) {
      return;
    }
    const page = this.page();
    const available = {
      width: workspace.clientWidth - 96,
      height: workspace.clientHeight - 96,
    };
    if (available.width <= 0 || available.height <= 0) {
      return;
    }
    const fit = Math.min(available.width / page.width, available.height / page.height, 1.5);
    this.fit.set(Math.max(0.1, Math.floor(fit * 100) / 100));
  }

  private box(el: DesignElement): Box {
    const z = this.zoom();
    return {
      left: el.x * z,
      top: el.y * z,
      width: el.width * z,
      height: el.height * z,
      rotation: el.rotation,
    };
  }

  private toPage(event: { clientX: number; clientY: number }): { x: number; y: number } {
    const rect = this.sizer().nativeElement.getBoundingClientRect();
    const z = this.zoom();
    return { x: (event.clientX - rect.left) / z, y: (event.clientY - rect.top) / z };
  }

  private track(move: (event: PointerEvent) => void, end: (event: PointerEvent) => void): void {
    const onMove = (event: PointerEvent) => move(event);
    const onUp = (event: PointerEvent) => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      end(event);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  }

  private snapTargets(exclude: Set<string>): { x: number[]; y: number[] } {
    const page = this.page();
    const x = [0, page.width / 2, page.width, PAGE_MARGIN, page.width - PAGE_MARGIN];
    const y = [0, page.height / 2, page.height, PAGE_MARGIN, page.height - PAGE_MARGIN];
    for (const el of this.visible()) {
      if (exclude.has(el.id)) {
        continue;
      }
      const b = boundsOf(el);
      x.push(b.left, (b.left + b.right) / 2, b.right);
      y.push(b.top, (b.top + b.bottom) / 2, b.bottom);
    }
    return { x, y };
  }

  /* ----------------------------------------------------------------------------- elements */

  protected elementPointerDown(event: PointerEvent, el: DesignElement): void {
    if (event.button !== 0 || this.store.preview() || this.store.editingId() === el.id) {
      return;
    }
    event.stopPropagation();
    event.preventDefault();
    const active = document.activeElement as HTMLElement | null;
    if (active?.isContentEditable) {
      active.blur();
    }

    if (event.shiftKey || event.metaKey || event.ctrlKey) {
      this.store.select(el.id, true);
      return;
    }
    if (!this.store.selection().includes(el.id)) {
      this.store.select(el.id);
    }

    const movable = this.store.selected().filter((entry) => !entry.locked);
    if (movable.length === 0) {
      return;
    }
    const start = this.toPage(event);
    const origins = new Map(movable.map((entry) => [entry.id, { x: entry.x, y: entry.y }]));
    const startBounds = unionBounds(movable)!;
    const targets = this.snapTargets(new Set(origins.keys()));
    let started = false;

    this.store.beginGesture();
    this.track(
      (move) => {
        const point = this.toPage(move);
        let dx = point.x - start.x;
        let dy = point.y - start.y;
        if (!started && Math.hypot(dx, dy) * this.zoom() < 3) {
          return;
        }
        started = true;
        if (move.shiftKey) {
          if (Math.abs(dx) > Math.abs(dy)) dy = 0;
          else dx = 0;
        }
        let guides: Guides = { vertical: [], horizontal: [] };
        if (!move.altKey) {
          const threshold = SNAP_PX / this.zoom();
          const sx = snapAxis(
            [
              startBounds.left + dx,
              (startBounds.left + startBounds.right) / 2 + dx,
              startBounds.right + dx,
            ],
            targets.x,
            threshold,
          );
          const sy = snapAxis(
            [
              startBounds.top + dy,
              (startBounds.top + startBounds.bottom) / 2 + dy,
              startBounds.bottom + dy,
            ],
            targets.y,
            threshold,
          );
          dx += sx.delta;
          dy += sy.delta;
          guides = { vertical: sx.lines, horizontal: sy.lines };
        }
        this.store.guides.set(guides);
        this.store.setFrames(
          new Map(
            [...origins].map(([id, origin]) => [
              id,
              { x: round(origin.x + dx), y: round(origin.y + dy) },
            ]),
          ),
        );
        const z = this.zoom();
        this.badge.set({
          text: `X ${Math.round(startBounds.left + dx)}  ·  Y ${Math.round(startBounds.top + dy)}`,
          left: ((startBounds.left + startBounds.right) / 2 + dx) * z,
          top: (startBounds.bottom + dy) * z + 14,
        });
      },
      () => {
        this.store.endGesture();
        this.badge.set(null);
      },
    );
  }

  protected elementDoubleClick(el: DesignElement): void {
    if (this.store.preview() || el.locked) {
      return;
    }
    this.store.selectOnly(el.id);
    if (el.type === 'text') {
      this.store.editingId.set(el.id);
    } else if (el.type === 'image' && el.role === 'signature') {
      this.store.panel.set('signature');
    }
  }

  protected commitText(id: string, text: string): void {
    this.store.commitText(id, text);
  }

  /* -------------------------------------------------------------------------------- resize */

  protected resizeStart(event: PointerEvent, handle: Handle): void {
    const el = this.store.single();
    if (!el || el.locked || event.button !== 0) {
      return;
    }
    event.stopPropagation();
    event.preventDefault();

    const start = this.toPage(event);
    const origin = { ...el, fontSize: 'fontSize' in el ? el.fontSize : 0 };
    const sx = handle.includes('e') ? 1 : handle.includes('w') ? -1 : 0;
    const sy = handle.includes('s') ? 1 : handle.includes('n') ? -1 : 0;
    const corner = sx !== 0 && sy !== 0;
    const auto = AUTO_HEIGHT_TYPES.has(el.type);
    const radians = (origin.rotation * Math.PI) / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    const targets = this.snapTargets(new Set([el.id]));
    // Images keep their proportions from corners; Shift toggles that (like Canva).
    const keepRatio = (move: PointerEvent) =>
      corner && !auto && move.shiftKey !== (el.type === 'image');

    this.store.beginGesture();
    this.track(
      (move) => {
        const point = this.toPage(move);
        const dxp = point.x - start.x;
        const dyp = point.y - start.y;
        const lx = dxp * cos + dyp * sin;
        const ly = -dxp * sin + dyp * cos;
        let width = Math.max(MIN_SIZE, origin.width + sx * lx);
        let height = Math.max(MIN_SIZE, origin.height + sy * ly);
        let fontSize: number | undefined;
        const guides: Guides = { vertical: [], horizontal: [] };

        if (auto) {
          if (corner) {
            const factor = Math.max(0.2, width / origin.width);
            width = origin.width * factor;
            height = origin.height * factor;
            fontSize = Math.max(4, Math.round(origin.fontSize * factor * 10) / 10);
          } else {
            height = origin.height;
          }
        } else if (keepRatio(move)) {
          const factor = Math.max(width / origin.width, height / origin.height);
          width = Math.max(MIN_SIZE, origin.width * factor);
          height = Math.max(MIN_SIZE, origin.height * factor);
        }

        // Snap the dragged edge of an unrotated element (free resizes only).
        if (origin.rotation === 0 && !move.altKey && !(auto && corner) && !keepRatio(move)) {
          const threshold = SNAP_PX / this.zoom();
          if (sx !== 0) {
            const edge = sx === 1 ? origin.x + width : origin.x + origin.width - width;
            const snapped = snapAxis([edge], targets.x, threshold);
            width += sx * snapped.delta;
            guides.vertical = snapped.lines;
          }
          if (sy !== 0 && !auto) {
            const edge = sy === 1 ? origin.y + height : origin.y + origin.height - height;
            const snapped = snapAxis([edge], targets.y, threshold);
            height += sy * snapped.delta;
            guides.horizontal = snapped.lines;
          }
        }

        // Keep the opposite edge/corner fixed, in the element's rotated frame.
        const shiftX = (sx * (width - origin.width)) / 2;
        const shiftY = (sy * (height - origin.height)) / 2;
        const cx = origin.x + origin.width / 2 + shiftX * cos - shiftY * sin;
        const cy = origin.y + origin.height / 2 + shiftX * sin + shiftY * cos;
        const frame: Partial<Frame> & { fontSize?: number } = {
          x: round(cx - width / 2),
          y: round(cy - height / 2),
          width: round(width),
        };
        if (!auto || corner) {
          frame.height = round(height);
        }
        if (fontSize !== undefined) {
          frame.fontSize = fontSize;
        }
        this.store.guides.set(guides);
        this.store.setFrames(new Map([[el.id, frame]]));
        const z = this.zoom();
        this.badge.set({
          text:
            fontSize !== undefined
              ? `${fontSize} px`
              : `W ${Math.round(width)}  ×  H ${Math.round(height)}`,
          left: cx * z,
          top: (cy + height / 2) * z + 14,
        });
      },
      () => {
        this.store.endGesture();
        this.badge.set(null);
      },
    );
  }

  /* -------------------------------------------------------------------------------- rotate */

  protected rotateStart(event: PointerEvent): void {
    const el = this.store.single();
    if (!el || el.locked || event.button !== 0) {
      return;
    }
    event.stopPropagation();
    event.preventDefault();
    const center = { x: el.x + el.width / 2, y: el.y + el.height / 2 };
    const angleOf = (point: { x: number; y: number }) =>
      (Math.atan2(point.y - center.y, point.x - center.x) * 180) / Math.PI;
    const startAngle = angleOf(this.toPage(event));
    const startRotation = el.rotation;

    this.store.beginGesture();
    this.track(
      (move) => {
        let rotation = startRotation + angleOf(this.toPage(move)) - startAngle;
        rotation = ((((rotation + 180) % 360) + 360) % 360) - 180;
        if (move.shiftKey) {
          rotation = Math.round(rotation / 15) * 15;
        } else {
          const nearest = Math.round(rotation / 45) * 45;
          if (Math.abs(rotation - nearest) < 3) rotation = nearest;
        }
        rotation = Math.round(rotation);
        if (rotation === -180) rotation = 180;
        this.store.setFrames(new Map([[el.id, { rotation }]]));
        const z = this.zoom();
        this.badge.set({
          text: `${rotation}°`,
          left: center.x * z,
          top: (el.y + el.height) * z + 46,
        });
      },
      () => {
        this.store.endGesture();
        this.badge.set(null);
      },
    );
  }

  /* ------------------------------------------------------------------------------- marquee */

  protected workspacePointerDown(event: PointerEvent): void {
    if (event.button !== 0) {
      return;
    }
    const active = document.activeElement as HTMLElement | null;
    if (active?.isContentEditable) {
      active.blur();
    }
    if (this.store.preview()) {
      return;
    }
    const additive = event.shiftKey || event.metaKey || event.ctrlKey;
    const base = additive ? this.store.selection() : [];
    if (!additive) {
      this.store.clearSelection();
    }
    const start = this.toPage(event);
    this.track(
      (move) => {
        const point = this.toPage(move);
        const rect = {
          left: Math.min(start.x, point.x),
          top: Math.min(start.y, point.y),
          right: Math.max(start.x, point.x),
          bottom: Math.max(start.y, point.y),
        };
        if (
          (rect.right - rect.left) * this.zoom() < 4 &&
          (rect.bottom - rect.top) * this.zoom() < 4
        ) {
          return;
        }
        const z = this.zoom();
        this.marquee.set({
          left: rect.left * z,
          top: rect.top * z,
          width: (rect.right - rect.left) * z,
          height: (rect.bottom - rect.top) * z,
          rotation: 0,
        });
        this.store.selectInRect(rect, base);
      },
      () => this.marquee.set(null),
    );
  }

  /* ---------------------------------------------------------------------------- zoom/wheel */

  protected wheel(event: WheelEvent): void {
    if (!(event.ctrlKey || event.metaKey)) {
      return;
    }
    event.preventDefault();
    const anchor = this.toPage(event);
    this.store.setZoom(this.zoom() * Math.exp(-event.deltaY * 0.0015));
    requestAnimationFrame(() => {
      const rect = this.sizer().nativeElement.getBoundingClientRect();
      const workspace = this.workspace().nativeElement;
      workspace.scrollLeft += rect.left + anchor.x * this.zoom() - event.clientX;
      workspace.scrollTop += rect.top + anchor.y * this.zoom() - event.clientY;
    });
  }

  /* ------------------------------------------------------------------------------------ drop */

  protected dragOver(event: DragEvent): void {
    const types = event.dataTransfer?.types ?? [];
    if (types.includes(INSERT_MIME) || types.includes('Files')) {
      event.preventDefault();
      event.dataTransfer!.dropEffect = 'copy';
      this.dropActive.set(true);
    }
  }

  protected dragLeave(event: DragEvent): void {
    const next = event.relatedTarget as Node | null;
    if (!next || !this.workspace().nativeElement.contains(next)) {
      this.dropActive.set(false);
    }
  }

  protected async drop(event: DragEvent): Promise<void> {
    event.preventDefault();
    this.dropActive.set(false);
    const at = this.toPage(event);
    const transfer = event.dataTransfer;
    if (!transfer) {
      return;
    }
    const files = [...transfer.files].filter((file) => file.type.startsWith('image/'));
    if (files.length > 0) {
      for (const [index, file] of files.entries()) {
        try {
          const src = await readImageFile(file);
          // Placed right away, and kept in the library for reuse.
          void this.store.addAsset('upload', file.name, src);
          await this.store.insert(
            { preset: 'image', data: src },
            { x: at.x + index * 24, y: at.y + index * 24 },
          );
        } catch (error) {
          this.store.notify((error as Error).message, 'error');
        }
      }
      return;
    }
    const raw = transfer.getData(INSERT_MIME);
    if (raw) {
      try {
        await this.store.insert(JSON.parse(raw) as InsertRequest, at);
      } catch {
        this.store.notify('That item could not be added.', 'error');
      }
    }
  }
}
