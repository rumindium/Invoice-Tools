import { Injectable, OnDestroy, computed, effect, inject, signal, untracked } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { CompanyService } from '../../core/company.service';
import { apiErrorMessage } from '../../core/http-error';
import {
  DesignConflictError,
  TemplateAssetView,
  TemplateDesignService,
  TemplateDesignView,
  toDesign,
  toPayload,
} from '../../core/template-design.service';
import {
  buildPreset,
  InsertRequest,
  STARTERS,
  starterElements,
  starterPage,
} from './builder-presets';
import { buildSampleContext } from './builder-sample';
import {
  blankDesign,
  boundsOf,
  Design,
  DesignElement,
  DesignKind,
  Frame,
  PageSettings,
  pageDimensions,
  uid,
  unionBounds,
} from './builder.model';
import { DesignAsset, imageSize } from './design-storage.service';

export type PanelKey =
  'templates' | 'elements' | 'text' | 'brand' | 'signature' | 'fields' | 'layers';
export type AlignMode = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom';

export interface Guides {
  vertical: number[];
  horizontal: number[];
}

function toAsset(view: TemplateAssetView): DesignAsset {
  return {
    id: view.id,
    kind: view.kind,
    name: view.name,
    src: view.dataUrl,
    createdAt: view.createdAt,
  };
}

export interface Toast {
  id: number;
  message: string;
  tone: 'info' | 'error';
}

const HISTORY_LIMIT = 200;
const COALESCE_MS = 900;
const AUTOSAVE_MS = 700;

/** Element types whose height follows their content. */
export const AUTO_HEIGHT_TYPES = new Set(['text', 'table', 'totals']);

/**
 * State and every editing operation of the template builder. Designs are immutable values: each
 * change replaces the design, so undo/redo simply keeps earlier designs.
 */
@Injectable()
export class BuilderStore implements OnDestroy {
  private readonly api = inject(TemplateDesignService);
  private readonly companies = inject(CompanyService);

  readonly design = signal<Design>(blankDesign('invoice'));
  readonly selection = signal<string[]>([]);
  readonly editingId = signal<string | null>(null);
  readonly hoverId = signal<string | null>(null);
  readonly panel = signal<PanelKey | null>('templates');
  readonly zoom = signal(0.75);
  readonly zoomMode = signal<'fit' | 'manual'>('fit');
  readonly preview = signal(false);
  readonly showMargins = signal(true);
  /** Millimetre rulers along the top and left of the canvas. */
  readonly showRulers = signal(true);
  readonly guides = signal<Guides>({ vertical: [], horizontal: [] });
  readonly saveState = signal<'saved' | 'pending' | 'saving' | 'error' | 'conflict'>('saved');
  /** A design from the API is open (nothing is saved before that). */
  readonly ready = signal(false);
  /** The workspace's designs (the Templates panel's "Your designs"). */
  readonly library = signal<TemplateDesignView[]>([]);
  /** Uploaded images and saved signatures. */
  readonly assets = signal<DesignAsset[]>([]);
  /** Document types whose active template the open design is. */
  readonly appliedTo = signal<DesignKind[]>([]);
  readonly savedAt = signal<Date | null>(null);
  readonly toasts = signal<Toast[]>([]);

  private past: Design[] = [];
  private future: Design[] = [];
  private readonly historyVersion = signal(0);
  private lastCheckpointKey: string | null = null;
  private lastCheckpointAt = 0;
  private gestureStart: Design | null = null;
  private gestureChanged = false;
  private clipboard: DesignElement[] = [];
  private pasteCount = 0;
  private insertCount = 0;
  private lastSaved: Design | null = null;
  private saveTimer: ReturnType<typeof setTimeout> | undefined;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private retryMs = 2000;
  private saving: Promise<boolean> | null = null;
  private saveQueued = false;
  private serverRevision = 1;

  /** Revision of the open design on the server. */
  revision(): number {
    return this.serverRevision;
  }
  private conflictRevision = 1;
  private toastId = 0;

  readonly elements = computed(() => this.design().elements);
  readonly page = computed(() => pageDimensions(this.design().page));
  readonly context = computed(() =>
    buildSampleContext(this.companies.company(), this.design().kind),
  );
  readonly selected = computed(() => {
    const ids = new Set(this.selection());
    return this.elements().filter((element) => ids.has(element.id));
  });
  readonly single = computed(() => {
    const selected = this.selected();
    return selected.length === 1 ? selected[0] : null;
  });
  readonly selectionBounds = computed(() => unionBounds(this.selected()));
  readonly canUndo = computed(() => this.historyVersion() >= 0 && this.past.length > 0);
  readonly canRedo = computed(() => this.historyVersion() >= 0 && this.future.length > 0);
  /** The selection is exactly one group. */
  readonly selectionIsGroup = computed(() => {
    const selected = this.selected();
    const groupId = selected[0]?.groupId;
    return selected.length > 1 && !!groupId && selected.every((el) => el.groupId === groupId);
  });
  /** Colours used in the design, for the colour picker's "Document colours". */
  readonly documentColors = computed(() => {
    const colors = new Set<string>();
    for (const element of this.elements()) {
      const candidates: Array<string | null> =
        element.type === 'text'
          ? [element.color, element.background]
          : element.type === 'shape'
            ? [element.fill, element.stroke]
            : element.type === 'line'
              ? [element.stroke]
              : element.type === 'table'
                ? [element.headerFill, element.textColor]
                : element.type === 'totals'
                  ? [element.accentFill, element.textColor]
                  : [];
      for (const color of candidates) {
        if (color) {
          colors.add(color.toLowerCase());
        }
      }
    }
    colors.add(this.design().page.background.toLowerCase());
    return [...colors].slice(0, 14);
  });

  constructor() {
    effect(() => {
      const design = this.design();
      untracked(() => {
        if (this.ready() && design !== this.lastSaved) {
          this.scheduleSave();
        }
      });
    });
  }

  ngOnDestroy(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
    }
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
    }
    if (this.ready() && this.design() !== this.lastSaved && this.saveState() !== 'conflict') {
      void this.persist();
    }
  }

  /* ---------------------------------------------------------------------------- loading/saving */

  /** Opens a design from the API. */
  load(view: TemplateDesignView): void {
    const design = toDesign(view);
    this.serverRevision = view.revision;
    this.appliedTo.set(view.appliedTo);
    this.lastSaved = design;
    this.design.set(design);
    this.past = [];
    this.future = [];
    this.bumpHistory();
    this.selection.set([]);
    this.editingId.set(null);
    this.saveState.set('saved');
    this.savedAt.set(new Date(view.updatedAt));
    this.ready.set(true);
    this.upsertLibrary(view);
  }

  /** Saves now (Ctrl+S, before leaving, before applying or previewing). */
  async saveNow(notify = false): Promise<boolean> {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = undefined;
    }
    const ok = await this.persist();
    if (ok && this.design() !== this.lastSaved) {
      // Edits arrived while saving: write those too.
      return this.saveNow(notify);
    }
    if (ok && notify) {
      this.notify('Design saved');
    }
    return ok;
  }

  /** Unsaved edits exist (used to warn before leaving the page). */
  hasUnsavedChanges(): boolean {
    return this.ready() && this.design() !== this.lastSaved;
  }

  private scheduleSave(): void {
    if (this.saveState() === 'conflict') {
      return;
    }
    this.saveState.set('pending');
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
    }
    this.saveTimer = setTimeout(() => {
      this.saveTimer = undefined;
      void this.persist();
    }, AUTOSAVE_MS);
  }

  /** One save at a time; a change made meanwhile is saved right after. */
  private persist(): Promise<boolean> {
    if (!this.ready() || this.saveState() === 'conflict') {
      return Promise.resolve(this.saveState() !== 'conflict');
    }
    if (this.saving) {
      this.saveQueued = true;
      return this.saving;
    }
    const design = this.design();
    if (design === this.lastSaved) {
      this.saveState.set('saved');
      return Promise.resolve(true);
    }
    this.saveState.set('saving');
    this.saving = (async () => {
      try {
        const view = await this.api.update(design.id, toPayload(design), this.serverRevision);
        this.serverRevision = view.revision;
        this.appliedTo.set(view.appliedTo);
        this.lastSaved = design;
        this.savedAt.set(new Date(view.updatedAt));
        this.retryMs = 2000;
        this.upsertLibrary({ ...view, elements: design.elements });
        this.saveState.set(this.design() === design ? 'saved' : 'pending');
        return true;
      } catch (error) {
        if (error instanceof DesignConflictError) {
          this.conflictRevision = error.serverRevision;
          this.saveState.set('conflict');
          return false;
        }
        this.saveState.set('error');
        const status = error instanceof HttpErrorResponse ? error.status : 0;
        if (status === 0 || status >= 500 || status === 408 || status === 429) {
          this.notify(
            'Couldn’t reach the server — your changes will be saved when it’s back.',
            'error',
          );
          this.scheduleRetry();
        } else {
          this.notify(`The design could not be saved: ${apiErrorMessage(error)}`, 'error');
        }
        return false;
      } finally {
        this.saving = null;
        if (this.saveQueued && this.saveState() !== 'conflict') {
          this.saveQueued = false;
          this.scheduleSave();
        }
      }
    })();
    return this.saving;
  }

  private scheduleRetry(): void {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
    }
    this.retryTimer = setTimeout(() => {
      this.retryTimer = undefined;
      void this.persist();
    }, this.retryMs);
    this.retryMs = Math.min(this.retryMs * 2, 30_000);
  }

  /** Conflict: drop local edits and open what is on the server. */
  async reloadLatest(): Promise<void> {
    try {
      const view = await this.api.get(this.design().id);
      this.saveState.set('saved');
      this.load(view);
      this.notify('Loaded the latest version');
    } catch (error) {
      this.notify(apiErrorMessage(error), 'error');
    }
  }

  /** Conflict: keep this version and overwrite the one on the server. */
  async keepMine(): Promise<void> {
    this.serverRevision = this.conflictRevision;
    this.saveState.set('pending');
    if (await this.saveNow()) {
      this.notify('Your version was saved');
    }
  }

  /* -------------------------------------------------------------------------- library/assets */

  async refreshLibrary(): Promise<void> {
    try {
      this.library.set(await this.api.list());
    } catch {
      // The panel keeps the last list; the next change refreshes it.
    }
  }

  private upsertLibrary(view: TemplateDesignView): void {
    this.library.update((list) =>
      list.some((entry) => entry.id === view.id)
        ? list.map((entry) => (entry.id === view.id ? view : entry))
        : [view, ...list],
    );
  }

  removeFromLibrary(id: string): void {
    this.library.update((list) => list.filter((entry) => entry.id !== id));
  }

  async refreshAssets(): Promise<void> {
    try {
      this.assets.set((await this.api.assets()).map(toAsset));
    } catch {
      // Keep what is shown.
    }
  }

  /** Adds an image to the library; null (with a message) when the API refuses it. */
  async addAsset(
    kind: DesignAsset['kind'],
    name: string,
    src: string,
  ): Promise<DesignAsset | null> {
    try {
      const asset = toAsset(await this.api.addAsset(kind, name, src));
      this.assets.update((list) => [
        asset,
        ...list.filter((entry) => entry.src !== src || entry.kind !== kind),
      ]);
      return asset;
    } catch (error) {
      this.notify(`The image could not be saved: ${apiErrorMessage(error)}`, 'error');
      return null;
    }
  }

  async removeAsset(id: string): Promise<void> {
    const before = this.assets();
    this.assets.update((list) => list.filter((asset) => asset.id !== id));
    try {
      await this.api.removeAsset(id);
    } catch (error) {
      this.assets.set(before);
      this.notify(apiErrorMessage(error), 'error');
    }
  }

  notify(message: string, tone: Toast['tone'] = 'info'): void {
    const id = ++this.toastId;
    // The same message again replaces the earlier toast instead of stacking up.
    this.toasts.update((toasts) => [
      ...toasts.filter((toast) => toast.message !== message).slice(-2),
      { id, message, tone },
    ]);
    setTimeout(() => this.dismissToast(id), tone === 'error' ? 6000 : 3200);
  }

  dismissToast(id: number): void {
    this.toasts.update((toasts) => toasts.filter((toast) => toast.id !== id));
  }

  /* ---------------------------------------------------------------------------------- history */

  private bumpHistory(): void {
    this.historyVersion.update((value) => value + 1);
  }

  /** Records the current design before a change; rapid changes with the same key coalesce. */
  checkpoint(key?: string): void {
    const now = Date.now();
    if (key && key === this.lastCheckpointKey && now - this.lastCheckpointAt < COALESCE_MS) {
      this.lastCheckpointAt = now;
      return;
    }
    this.past.push(this.design());
    if (this.past.length > HISTORY_LIMIT) {
      this.past.shift();
    }
    this.future = [];
    this.lastCheckpointKey = key ?? null;
    this.lastCheckpointAt = now;
    this.bumpHistory();
  }

  /** Starts a drag/resize/rotate; `endGesture` records one undo step if anything changed. */
  beginGesture(): void {
    this.gestureStart = this.design();
    this.gestureChanged = false;
  }

  endGesture(): void {
    if (this.gestureStart && this.gestureChanged) {
      this.past.push(this.gestureStart);
      if (this.past.length > HISTORY_LIMIT) {
        this.past.shift();
      }
      this.future = [];
      this.lastCheckpointKey = null;
      this.bumpHistory();
    }
    this.gestureStart = null;
    this.gestureChanged = false;
    this.guides.set({ vertical: [], horizontal: [] });
  }

  undo(): void {
    const previous = this.past.pop();
    if (!previous) {
      return;
    }
    this.future.push(this.design());
    this.restore(previous);
  }

  redo(): void {
    const next = this.future.pop();
    if (!next) {
      return;
    }
    this.past.push(this.design());
    this.restore(next);
  }

  private restore(design: Design): void {
    this.lastCheckpointKey = null;
    this.design.set(design);
    const ids = new Set(design.elements.map((element) => element.id));
    this.selection.update((selection) => selection.filter((id) => ids.has(id)));
    this.editingId.set(null);
    this.bumpHistory();
  }

  /* --------------------------------------------------------------------------------- mutation */

  private setElements(update: (elements: DesignElement[]) => DesignElement[]): void {
    this.design.update((design) => ({ ...design, elements: update(design.elements) }));
  }

  private patchWhere(
    predicate: (element: DesignElement) => boolean,
    patch: (element: DesignElement) => Partial<DesignElement>,
  ): void {
    this.setElements((elements) =>
      elements.map((element) =>
        predicate(element) ? ({ ...element, ...patch(element) } as DesignElement) : element,
      ),
    );
  }

  /** Patches elements by id, recording an undo step (coalesced by `key`). */
  update(ids: string | string[], patch: Partial<DesignElement>, key?: string): void {
    const set = new Set(Array.isArray(ids) ? ids : [ids]);
    this.checkpoint(key);
    this.patchWhere(
      (element) => set.has(element.id),
      () => patch,
    );
  }

  /** Patches every selected element (toolbar edits). */
  updateSelected(patch: Partial<DesignElement>, key?: string): void {
    this.update(this.selection(), patch, key);
  }

  /** Live frame updates during a gesture (no undo step of their own). */
  setFrames(frames: Map<string, Partial<Frame> & { fontSize?: number }>): void {
    this.gestureChanged = true;
    this.patchWhere(
      (element) => frames.has(element.id),
      (element) => frames.get(element.id) as Partial<DesignElement>,
    );
  }

  /** Content-driven height reported by the renderer; not an undoable change. */
  setAutoHeight(id: string, height: number): void {
    const element = this.elements().find((entry) => entry.id === id);
    if (!element || Math.abs(element.height - height) < 0.5) {
      return;
    }
    const rounded = Math.round(height * 10) / 10;
    this.design.update((design) => ({
      ...design,
      elements: design.elements.map((entry) =>
        entry.id === id ? { ...entry, height: rounded } : entry,
      ),
    }));
  }

  commitText(id: string, text: string): void {
    const element = this.elements().find((entry) => entry.id === id);
    this.editingId.set(null);
    if (!element || element.type !== 'text' || element.text === text) {
      return;
    }
    this.update(id, { text } as Partial<DesignElement>);
  }

  /* ---------------------------------------------------------------------------------- inserts */

  /** Adds elements (built at the origin) centred on `at`, or cascading from the page centre. */
  add(elements: DesignElement[], at?: { x: number; y: number }): void {
    if (elements.length === 0) {
      return;
    }
    const bounds = unionBounds(elements)!;
    const width = bounds.right - bounds.left;
    const height = bounds.bottom - bounds.top;
    const page = this.page();
    let center = at;
    if (!center) {
      const step = (this.insertCount++ % 6) * 18;
      center = { x: page.width / 2 + step, y: Math.min(page.height / 2, 360) + step };
    }
    const left = Math.round(
      Math.min(Math.max(center.x - width / 2, -width / 2), page.width - width / 2),
    );
    const top = Math.round(
      Math.min(Math.max(center.y - height / 2, -height / 2), page.height - height / 2),
    );
    const placed = elements.map((element) => ({
      ...element,
      x: element.x - bounds.left + left,
      y: element.y - bounds.top + top,
    }));
    this.checkpoint();
    this.setElements((current) => [...current, ...placed]);
    this.selection.set(placed.map((element) => element.id));
    this.editingId.set(null);
  }

  async insert(request: InsertRequest, at?: { x: number; y: number }): Promise<void> {
    const elements = buildPreset(request, this.design().accentColor);
    const image = elements.find((element) => element.type === 'image');
    if (image && image.type === 'image' && request.data && elements.length === 1) {
      const size = await imageSize(request.data);
      const max = image.role === 'signature' ? { w: 220, h: 90 } : { w: 320, h: 260 };
      const scale = Math.min(max.w / size.width, max.h / size.height, 1.5);
      image.width = Math.round(size.width * scale);
      image.height = Math.round(size.height * scale);
    }
    this.add(elements, at);
  }

  /* -------------------------------------------------------------------------------- selection */

  private withGroups(ids: string[]): string[] {
    const elements = this.elements();
    const groups = new Set(
      elements.filter((el) => ids.includes(el.id) && el.groupId).map((el) => el.groupId),
    );
    return elements
      .filter((el) => ids.includes(el.id) || (el.groupId && groups.has(el.groupId)))
      .map((el) => el.id);
  }

  select(id: string, additive = false): void {
    const ids = this.withGroups([id]);
    if (!additive) {
      this.selection.set(ids);
    } else if (this.selection().includes(id)) {
      this.selection.update((selection) => selection.filter((entry) => !ids.includes(entry)));
    } else {
      this.selection.update((selection) => [...new Set([...selection, ...ids])]);
    }
    if (this.editingId() && this.editingId() !== id) {
      this.editingId.set(null);
    }
  }

  /** Selects exactly this element, ignoring its group (layers panel, double click). */
  selectOnly(id: string): void {
    this.selection.set([id]);
  }

  clearSelection(): void {
    this.selection.set([]);
    this.editingId.set(null);
  }

  selectAll(): void {
    this.selection.set(
      this.elements()
        .filter((el) => !el.hidden)
        .map((el) => el.id),
    );
  }

  selectInRect(
    rect: { left: number; top: number; right: number; bottom: number },
    base: string[],
  ): void {
    const hits = this.elements()
      .filter((el) => !el.hidden && !el.locked)
      .filter((el) => {
        const b = boundsOf(el);
        return (
          b.left < rect.right && b.right > rect.left && b.top < rect.bottom && b.bottom > rect.top
        );
      })
      .map((el) => el.id);
    this.selection.set([...new Set([...base, ...this.withGroups(hits)])]);
  }

  /* ------------------------------------------------------------------------ structural edits */

  removeSelected(): void {
    const ids = new Set(
      this.selected()
        .filter((el) => !el.locked)
        .map((el) => el.id),
    );
    if (ids.size === 0) {
      if (this.selected().length > 0) {
        this.notify('Locked elements can’t be deleted. Unlock them first.');
      }
      return;
    }
    this.checkpoint();
    this.setElements((elements) => elements.filter((el) => !ids.has(el.id)));
    this.selection.set([]);
    this.editingId.set(null);
  }

  private cloneAll(elements: DesignElement[], offset: number): DesignElement[] {
    const groupMap = new Map<string, string>();
    return elements.map((element) => {
      let groupId = element.groupId;
      if (groupId) {
        if (!groupMap.has(groupId)) {
          groupMap.set(groupId, uid('grp'));
        }
        groupId = groupMap.get(groupId)!;
      }
      return {
        ...structuredClone(element),
        id: uid(),
        groupId,
        locked: false,
        x: element.x + offset,
        y: element.y + offset,
      };
    });
  }

  duplicateSelected(): void {
    const selected = this.selected();
    if (selected.length === 0) {
      return;
    }
    const clones = this.cloneAll(selected, 16);
    this.checkpoint();
    this.setElements((elements) => [...elements, ...clones]);
    this.selection.set(clones.map((el) => el.id));
  }

  copySelected(): boolean {
    if (this.selected().length === 0) {
      return false;
    }
    this.clipboard = structuredClone(this.selected());
    this.pasteCount = 0;
    return true;
  }

  cutSelected(): void {
    if (this.copySelected()) {
      this.removeSelected();
    }
  }

  paste(): boolean {
    if (this.clipboard.length === 0) {
      return false;
    }
    this.pasteCount += 1;
    const clones = this.cloneAll(this.clipboard, 16 * this.pasteCount);
    this.checkpoint();
    this.setElements((elements) => [...elements, ...clones]);
    this.selection.set(clones.map((el) => el.id));
    return true;
  }

  /** Moves the selection within the stacking order. */
  arrange(direction: 'forward' | 'backward' | 'front' | 'back'): void {
    const ids = new Set(this.selection());
    if (ids.size === 0) {
      return;
    }
    this.checkpoint();
    this.setElements((elements) => {
      const chosen = elements.filter((el) => ids.has(el.id));
      const rest = elements.filter((el) => !ids.has(el.id));
      if (direction === 'front') {
        return [...rest, ...chosen];
      }
      if (direction === 'back') {
        return [...chosen, ...rest];
      }
      const list = [...elements];
      const order = direction === 'forward' ? [...list.keys()].reverse() : [...list.keys()];
      for (const index of order) {
        const target = direction === 'forward' ? index + 1 : index - 1;
        if (
          ids.has(list[index].id) &&
          target >= 0 &&
          target < list.length &&
          !ids.has(list[target].id)
        ) {
          [list[index], list[target]] = [list[target], list[index]];
        }
      }
      return list;
    });
  }

  /** Layers panel drag: moves one element to a stacking index. */
  moveToIndex(id: string, index: number): void {
    const elements = this.elements();
    const from = elements.findIndex((el) => el.id === id);
    if (from === -1 || from === index) {
      return;
    }
    this.checkpoint();
    this.setElements((current) => {
      const list = [...current];
      const [moved] = list.splice(from, 1);
      list.splice(Math.max(0, Math.min(index, list.length)), 0, moved);
      return list;
    });
  }

  align(mode: AlignMode): void {
    const selected = this.selected().filter((el) => !el.locked);
    if (selected.length === 0) {
      return;
    }
    const grouped = selected.length > 1 && !this.selectionIsGroup();
    const page = this.page();
    const target = grouped
      ? unionBounds(selected)!
      : { left: 0, top: 0, right: page.width, bottom: page.height };
    // A single group aligns as one block to the page.
    const block = grouped ? null : unionBounds(selected)!;
    const frames = new Map<string, Partial<Frame>>();
    for (const element of selected) {
      const b = block ?? boundsOf(element);
      let dx = 0;
      let dy = 0;
      if (mode === 'left') dx = target.left - b.left;
      if (mode === 'right') dx = target.right - b.right;
      if (mode === 'center') dx = (target.left + target.right) / 2 - (b.left + b.right) / 2;
      if (mode === 'top') dy = target.top - b.top;
      if (mode === 'bottom') dy = target.bottom - b.bottom;
      if (mode === 'middle') dy = (target.top + target.bottom) / 2 - (b.top + b.bottom) / 2;
      frames.set(element.id, { x: Math.round(element.x + dx), y: Math.round(element.y + dy) });
    }
    this.checkpoint();
    this.setFrames(frames);
  }

  nudge(dx: number, dy: number): void {
    const movable = this.selected().filter((el) => !el.locked);
    if (movable.length === 0) {
      return;
    }
    this.checkpoint('nudge');
    this.setFrames(new Map(movable.map((el) => [el.id, { x: el.x + dx, y: el.y + dy }])));
  }

  group(): void {
    const ids = this.selection();
    if (ids.length < 2) {
      return;
    }
    this.update(ids, { groupId: uid('grp') });
    this.notify(`Grouped ${ids.length} elements`);
  }

  ungroup(): void {
    const ids = this.selection();
    if (!this.selected().some((el) => el.groupId)) {
      return;
    }
    this.update(ids, { groupId: null });
  }

  toggleLock(): void {
    const selected = this.selected();
    const lock = !selected.every((el) => el.locked);
    this.update(
      selected.map((el) => el.id),
      { locked: lock },
    );
  }

  toggleHidden(id: string): void {
    const element = this.elements().find((el) => el.id === id);
    if (!element) {
      return;
    }
    this.update(id, { hidden: !element.hidden });
    if (!element.hidden) {
      this.selection.update((selection) => selection.filter((entry) => entry !== id));
    }
  }

  rename(id: string, name: string): void {
    const trimmed = name.trim();
    if (trimmed) {
      this.update(id, { name: trimmed.slice(0, 60) });
    }
  }

  /* ------------------------------------------------------------------------------ design-wide */

  setPage(patch: Partial<PageSettings>, key?: string): void {
    this.checkpoint(key);
    this.design.update((design) => ({ ...design, page: { ...design.page, ...patch } }));
  }

  /** Replaces the page with an imported design (keeps this template's id and type; undoable). */
  replaceContent(source: Pick<Design, 'name' | 'accentColor' | 'page' | 'elements'>): void {
    this.checkpoint();
    this.design.update((design) => ({
      ...design,
      name: source.name.trim().slice(0, 80) || design.name,
      accentColor: source.accentColor,
      page: source.page,
      elements: source.elements,
    }));
    this.selection.set([]);
    this.editingId.set(null);
  }

  renameDesign(name: string): void {
    const trimmed = name.trim().slice(0, 80);
    if (!trimmed || trimmed === this.design().name) {
      return;
    }
    this.checkpoint();
    this.design.update((design) => ({ ...design, name: trimmed }));
  }

  /** Changes the brand colour and repaints every element that used the old one. */
  setAccent(color: string, key = 'accent'): void {
    const previous = this.design().accentColor.toLowerCase();
    const next = color.toLowerCase();
    if (previous === next) {
      return;
    }
    const swap = (value: string | null) =>
      value && value.toLowerCase() === previous ? next : value;
    this.checkpoint(key);
    this.design.update((design) => ({
      ...design,
      accentColor: next,
      page: { ...design.page, background: swap(design.page.background) ?? design.page.background },
      elements: design.elements.map((el): DesignElement => {
        switch (el.type) {
          case 'text':
            return { ...el, color: swap(el.color)!, background: swap(el.background) };
          case 'shape':
            return { ...el, fill: swap(el.fill), stroke: swap(el.stroke) };
          case 'line':
            return { ...el, stroke: swap(el.stroke)! };
          case 'table':
            return { ...el, headerFill: swap(el.headerFill)!, textColor: swap(el.textColor)! };
          case 'totals':
            return { ...el, accentFill: swap(el.accentFill)! };
          default:
            return el;
        }
      }),
    }));
  }

  /** Replaces the page with a starter layout (undoable). */
  applyStarter(key: string): void {
    const starter = STARTERS.find((entry) => entry.key === key);
    if (!starter) {
      return;
    }
    this.checkpoint();
    this.design.update((design) => ({
      ...design,
      accentColor: starter.accent,
      page: { ...starterPage(), size: design.page.size },
      elements: starterElements(key, starter.accent),
    }));
    this.selection.set([]);
    this.editingId.set(null);
  }

  /* ------------------------------------------------------------------------------------ zoom */

  setZoom(value: number): void {
    this.zoomMode.set('manual');
    this.zoom.set(Math.min(3, Math.max(0.1, Math.round(value * 100) / 100)));
  }

  zoomBy(factor: number): void {
    this.setZoom(this.zoom() * factor);
  }

  fitZoom(): void {
    this.zoomMode.set('fit');
  }
}
