import { Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DOCUMENT_STATUS_LABEL } from '../core/document-flow';
import { formatMoney } from '../core/format';
import { RevisionSummary } from '../core/revisions';

/**
 * "Older versions": the current version of a document and every version it replaced, each
 * viewable read-only and downloadable as the PDF it was at the time.
 */
@Component({
  selector: 'app-versions-card',
  imports: [RouterLink],
  template: `
    <section
      class="ui-card versions-card"
      aria-labelledby="versions-heading"
      data-testid="versions-card"
    >
      <header class="versions-head">
        <h2 id="versions-heading">Older versions</h2>
        <span class="versions-count">{{ revisions().length }}</span>
      </header>

      <div class="version is-current" data-testid="current-version">
        <span class="version-mark">v{{ revision() }}</span>
        <div class="version-body">
          <strong>Version {{ revision() }} · current</strong>
          <span>{{ revision() === 1 ? 'The original document.' : 'The latest revision.' }}</span>
        </div>
      </div>

      @for (item of revisions(); track item.revision) {
        <div class="version" data-testid="older-version">
          <span class="version-mark">v{{ item.revision }}</span>
          <div class="version-body">
            <strong>Version {{ item.revision }}</strong>
            <span>
              {{ statusLabel(item.status) }}{{ amount(item) }} · replaced
              {{ when(item.supersededAt)
              }}{{ item.supersededByName ? ' by ' + item.supersededByName : '' }}
            </span>
            @if (item.reason) {
              <span class="version-reason">“{{ item.reason }}”</span>
            }
            <span class="version-actions">
              <a class="ui-link" [routerLink]="[...baseLink(), 'revisions', item.revision]">View</a>
              <button
                class="ui-link"
                type="button"
                [attr.aria-label]="'Download PDF of version ' + item.revision"
                (click)="download.emit(item.revision)"
              >
                PDF
              </button>
            </span>
          </div>
        </div>
      } @empty {
        <p class="versions-hint">No older versions. {{ reviseHint() }}</p>
      }

      @if (revisionBlockedBy(); as blocked) {
        <p class="versions-blocked" data-testid="revision-blocked">{{ blocked }}</p>
      }
    </section>
  `,
  styles: `
    .versions-card {
      display: grid;
      gap: 10px;
      padding: 16px;
    }
    .versions-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .versions-head h2 {
      margin: 0;
      font-size: 13px;
      font-weight: 650;
    }
    .versions-count {
      border-radius: 99px;
      background: var(--surface-2, #f1f5f9);
      padding: 1px 8px;
      color: var(--muted);
      font-size: 10px;
      font-weight: 650;
    }
    .version {
      display: flex;
      gap: 10px;
      border-top: 1px solid var(--border);
      padding-top: 10px;
    }
    .version.is-current {
      border-top: 0;
      padding-top: 0;
    }
    .version-mark {
      display: grid;
      width: 28px;
      height: 24px;
      flex: none;
      place-items: center;
      border-radius: 6px;
      background: var(--surface-2, #f1f5f9);
      color: var(--muted);
      font-size: 10px;
      font-weight: 700;
    }
    .is-current .version-mark {
      background: var(--accent-soft);
      color: var(--accent);
    }
    .version-body {
      display: grid;
      gap: 2px;
      min-width: 0;
    }
    .version-body strong {
      font-size: 11.5px;
    }
    .version-body > span {
      color: var(--muted);
      font-size: 10px;
      line-height: 1.45;
    }
    .version-body .version-reason {
      color: var(--text);
      font-style: italic;
    }
    .version-actions {
      display: flex;
      gap: 12px;
      margin-top: 2px;
    }
    .version-actions .ui-link {
      border: 0;
      background: none;
      padding: 0;
      cursor: pointer;
      font-size: 10.5px;
      font-weight: 650;
    }
    .versions-hint,
    .versions-blocked {
      margin: 0;
      color: var(--muted);
      font-size: 10.5px;
      line-height: 1.5;
    }
    .versions-blocked {
      border-radius: 7px;
      background: var(--warning-soft, #fffbeb);
      padding: 8px 10px;
      color: #92400e;
    }
  `,
})
export class VersionsCard {
  readonly revision = input.required<number>();
  readonly revisions = input.required<RevisionSummary[]>();
  readonly revisionBlockedBy = input<string | null>(null);
  /** Route of the current document, e.g. ['/quotations', id]. */
  readonly baseLink = input.required<unknown[]>();
  readonly reviseHint = input('Revising keeps the replaced version here.');
  readonly currency = input('IDR');

  readonly download = output<number>();

  protected statusLabel(status: string): string {
    return DOCUMENT_STATUS_LABEL[status] ?? status;
  }

  protected amount(item: RevisionSummary): string {
    if (item.total !== null) return ` · ${formatMoney(item.total, this.currency())}`;
    if (item.acceptedQuantity !== null) return ` · ${item.acceptedQuantity} accepted`;
    return '';
  }

  protected when(value: string): string {
    return new Intl.DateTimeFormat('en-US', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value));
  }
}
