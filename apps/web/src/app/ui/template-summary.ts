import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DocumentTemplate } from '../core/template.service';

/**
 * Card that tells which template a document is generated with, and links to the template
 * page while the document still follows it (drafts, new documents).
 */
@Component({
  selector: 'app-template-summary',
  imports: [RouterLink],
  template: `
    <section class="ui-card template-summary" [attr.data-testid]="testId()">
      <span
        class="template-summary-swatch"
        [style.background]="template().accentColor"
        aria-hidden="true"
      ></span>
      <div class="template-summary-body">
        <span>Template</span>
        <strong [attr.data-testid]="testId() + '-name'">{{ template().name }}</strong>
        <small>{{ template().locked ? lockedText() : followText() }}</small>
      </div>
      @if (!template().locked) {
        <a class="ui-link" [routerLink]="changeLink()">Change</a>
      }
    </section>
  `,
  styles: `
    .template-summary {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 14px 16px;
    }

    .template-summary-swatch {
      width: 30px;
      height: 30px;
      flex: none;
      border-radius: 8px;
      box-shadow: inset 0 0 0 1px rgba(15, 23, 42, 0.12);
    }

    .template-summary-body {
      display: grid;
      flex: 1;
      gap: 1px;
      min-width: 0;
    }

    .template-summary-body span {
      color: var(--faint);
      font-size: 9.5px;
      font-weight: 700;
      letter-spacing: 0.07em;
      text-transform: uppercase;
    }

    .template-summary-body strong {
      font-size: 13px;
    }

    .template-summary-body small {
      color: var(--muted);
      font-size: 10.5px;
    }
  `,
})
export class TemplateSummary {
  readonly template = input.required<DocumentTemplate>();
  readonly changeLink = input.required<string>();
  readonly followText = input('Applied automatically to this document and its PDF');
  readonly lockedText = input('Kept from when this document was issued');
  readonly testId = input('document-template');
}
