import {
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { CompanyService } from '../../core/company.service';
import { apiErrorMessage } from '../../core/http-error';
import { TemplateDesignService, TemplateDesignView } from '../../core/template-design.service';
import { TemplateSettings } from '../../core/template.service';
import { buildSampleContext } from '../template-builder/builder-sample';
import { DesignKind, KIND_LABELS } from '../template-builder/builder.model';
import { DesignThumb } from '../template-builder/design-thumb';

/**
 * "My … template" on a document type's template page: the template-builder template of that type,
 * one click to use one for every new document, or to open it in the builder.
 */
@Component({
  selector: 'app-custom-designs',
  imports: [RouterLink, DesignThumb],
  template: `
    <section class="custom" aria-labelledby="custom-designs-heading" data-testid="custom-designs">
      <header class="custom-head">
        <div>
          <h2 id="custom-designs-heading">My {{ label() }} template</h2>
          <p>
            Made in the Template Builder — your own layout, logo, signature and fields, filled with
            each {{ label() }}’s data. Each document type has one.
          </p>
        </div>
        <a class="ui-btn ui-btn-ghost" routerLink="/templates/builder" data-testid="open-builder">
          Open Template Builder
        </a>
      </header>

      @if (error()) {
        <div class="ui-alert" role="alert">{{ error() }}</div>
      }

      <div class="custom-grid">
        @for (design of designs(); track design.id) {
          <article
            class="custom-card"
            [class.is-active]="design.id === activeDesignId()"
            [attr.data-testid]="'custom-design-' + design.id"
          >
            <a
              class="custom-thumb"
              [routerLink]="['/templates/builder', design.id]"
              [attr.aria-label]="'Edit ' + design.name"
            >
              <app-design-thumb
                [elements]="design.elements"
                [page]="design.page"
                [context]="context()"
                [width]="168"
              />
            </a>
            <div class="custom-body">
              <strong>{{ design.name }}</strong>
              @if (design.id === activeDesignId()) {
                <span class="ui-badge ui-badge-green" data-testid="custom-design-active"
                  >In use</span
                >
              } @else {
                <button
                  class="ui-btn ui-btn-primary ui-btn-sm"
                  type="button"
                  [disabled]="applying() === design.id"
                  [attr.data-testid]="'use-design-' + design.id"
                  (click)="apply(design)"
                >
                  {{ applying() === design.id ? 'Applying…' : 'Use this design' }}
                </button>
              }
              <a class="ui-link" [routerLink]="['/templates/builder', design.id]">Edit</a>
            </div>
          </article>
        } @empty {
          <a
            class="custom-card custom-new"
            routerLink="/templates/builder"
            data-testid="new-custom-design"
          >
            <span aria-hidden="true">+</span>
            <strong>Design your own</strong>
            <small>Drag in your logo, text, shapes and signature</small>
          </a>
        }
      </div>
    </section>
  `,
  styles: `
    .custom {
      margin-bottom: 26px;
    }
    .custom-head {
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      gap: 16px;
      margin-bottom: 14px;
    }
    h2 {
      margin: 0;
      font-family: var(--font-sans);
      font-size: 16px;
      font-weight: 650;
      letter-spacing: -0.02em;
    }
    .custom-head p {
      margin: 4px 0 0;
      color: var(--muted);
      font-size: 12px;
    }
    .custom-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
      gap: 14px;
    }
    .custom-card {
      display: grid;
      gap: 10px;
      border: 1px solid var(--border);
      border-radius: 12px;
      background: var(--surface);
      padding: 10px;
    }
    .custom-card.is-active {
      border-color: var(--success);
      box-shadow: 0 0 0 3px var(--success-soft);
    }
    .custom-thumb {
      display: block;
      border-radius: 8px;
      background: var(--surface-2);
      padding: 6px 0;
    }
    .custom-thumb app-design-thumb {
      width: 168px;
      margin: 0 auto;
    }
    .custom-body {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
    }
    .custom-body strong {
      width: 100%;
      overflow: hidden;
      font-size: 12.5px;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .custom-new {
      min-height: 200px;
      place-content: center;
      justify-items: center;
      border-style: dashed;
      color: var(--muted);
      text-align: center;
      text-decoration: none;
    }
    .custom-new span {
      display: grid;
      width: 44px;
      height: 44px;
      place-items: center;
      border-radius: 50%;
      background: linear-gradient(135deg, #2563eb, #7c3aed);
      color: #fff;
      font-size: 24px;
    }
    .custom-new strong {
      color: var(--text);
      font-size: 13px;
    }
    .custom-new small {
      font-size: 11px;
    }
    .custom-new:hover {
      border-color: var(--accent);
    }
  `,
})
export class CustomDesigns {
  readonly documentType = input.required<DesignKind>();
  readonly activeDesignId = input<string | null>(null);
  readonly applied = output<TemplateSettings>();

  private readonly designsApi = inject(TemplateDesignService);
  private readonly companies = inject(CompanyService);

  protected readonly designs = signal<TemplateDesignView[]>([]);
  protected readonly applying = signal<string | null>(null);
  protected readonly error = signal('');
  protected readonly label = computed(() => KIND_LABELS[this.documentType()].toLowerCase());
  protected readonly context = computed(() =>
    buildSampleContext(this.companies.company(), this.documentType()),
  );

  constructor() {
    effect(() => {
      const kind = this.documentType();
      untracked(() => void this.load(kind));
    });
  }

  private async load(kind: DesignKind): Promise<void> {
    try {
      this.designs.set(await this.designsApi.list(kind));
      this.error.set('');
    } catch (error) {
      this.error.set(apiErrorMessage(error));
    }
  }

  protected async apply(design: TemplateDesignView): Promise<void> {
    this.applying.set(design.id);
    this.error.set('');
    try {
      const { settings } = await this.designsApi.apply(design.id, this.documentType());
      this.applied.emit(settings);
      await this.load(this.documentType());
    } catch (error) {
      this.error.set(apiErrorMessage(error));
    } finally {
      this.applying.set(null);
    }
  }
}
