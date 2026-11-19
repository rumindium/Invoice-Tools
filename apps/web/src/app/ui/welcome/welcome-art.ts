import { Component, computed, input } from '@angular/core';

export type WelcomeArtKind = 'welcome' | 'flow' | 'brand' | 'track' | 'company';

/**
 * Vector illustrations of the welcome slides. Colours come from the slide (--art-a, --art-b);
 * small parts float, draw or grow while the slide is active (paused otherwise, and off for
 * reduced motion). The company storefront shows the name and logo as they are typed.
 */
@Component({
  selector: 'app-welcome-art',
  template: `
    @switch (kind()) {
      @case ('welcome') {
        <svg
          viewBox="0 0 420 380"
          role="img"
          aria-labelledby="art-welcome-title"
          data-testid="welcome-art-welcome"
        >
          <title id="art-welcome-title">A stack of invoices with a paid stamp and coins</title>
          <circle cx="210" cy="190" r="160" class="glow" />
          <g class="float-slow">
            <rect
              x="64"
              y="92"
              width="170"
              height="222"
              rx="16"
              class="paper faded"
              transform="rotate(-9 150 200)"
            />
          </g>
          <g class="float">
            <rect x="138" y="56" width="206" height="266" rx="18" class="paper shadowed" />
            <path d="M138 74a18 18 0 0 1 18-18h170a18 18 0 0 1 18 18v30H138z" class="fill-a" />
            <circle cx="166" cy="80" r="11" fill="#fff" opacity="0.9" />
            <rect x="185" y="73" width="78" height="7" rx="3.5" fill="#fff" opacity="0.9" />
            <rect x="185" y="85" width="48" height="5" rx="2.5" fill="#fff" opacity="0.6" />
            @for (row of rows; track row) {
              <rect x="160" [attr.y]="row" width="92" height="7" rx="3.5" class="line" />
              <rect x="286" [attr.y]="row" width="38" height="7" rx="3.5" class="line strong" />
            }
            <rect x="160" y="252" width="164" height="1.5" class="line" />
            <rect x="232" y="266" width="92" height="26" rx="8" class="fill-a" />
            <rect x="244" y="276" width="54" height="6" rx="3" fill="#fff" opacity="0.9" />
          </g>
          <g class="stamp">
            <circle cx="318" cy="232" r="42" class="stamp-ring" />
            <circle cx="318" cy="232" r="34" class="stamp-ring thin" />
            <text
              x="318"
              y="240"
              text-anchor="middle"
              class="stamp-text"
              transform="rotate(-14 318 232)"
            >
              PAID
            </text>
          </g>
          <g class="float-fast">
            <ellipse cx="92" cy="300" rx="26" ry="26" class="coin" />
            <text x="92" y="306" text-anchor="middle" class="coin-text">Rp</text>
            <ellipse cx="126" cy="326" rx="18" ry="18" class="coin" />
          </g>
          <path d="M360 84l5 13 13 5-13 5-5 13-5-13-13-5 13-5z" class="sparkle" />
          <path d="M74 112l3.5 9 9 3.5-9 3.5-3.5 9-3.5-9-9-3.5 9-3.5z" class="sparkle delay" />
        </svg>
      }
      @case ('flow') {
        <svg
          viewBox="0 0 420 380"
          role="img"
          aria-labelledby="art-flow-title"
          data-testid="welcome-art-flow"
        >
          <title id="art-flow-title">A quotation becomes a goods receipt, then an invoice</title>
          <circle cx="210" cy="190" r="160" class="glow" />
          <path d="M152 100C182 100 192 118 192 140" class="connector" />
          <path d="M260 194C290 194 300 220 300 252" class="connector delay" />
          @for (card of flowCards; track card.label) {
            <!-- Position on the outer group: the float animation owns the inner one's transform. -->
            <g [attr.transform]="'translate(' + card.x + ' ' + card.y + ')'">
              <g [class]="'float ' + card.delay">
                <rect width="132" height="104" rx="16" class="paper shadowed" />
                <rect x="14" y="14" width="34" height="34" rx="10" [attr.class]="card.fill" />
                <text x="31" y="36" text-anchor="middle" class="badge-text">{{ card.mark }}</text>
                <rect x="56" y="18" width="58" height="7" rx="3.5" class="line strong" />
                <rect x="56" y="32" width="40" height="5" rx="2.5" class="line" />
                <rect x="14" y="62" width="104" height="6" rx="3" class="line" />
                <rect x="14" y="76" width="78" height="6" rx="3" class="line" />
                <text x="14" y="124" class="caption">{{ card.label }}</text>
                @if (card.done) {
                  <circle cx="124" cy="8" r="13" class="check-badge" />
                  <path d="M118 8l4 4 8-8" class="check-mark" />
                }
              </g>
            </g>
          }
        </svg>
      }
      @case ('brand') {
        <svg
          viewBox="0 0 420 380"
          role="img"
          aria-labelledby="art-brand-title"
          data-testid="welcome-art-brand"
        >
          <title id="art-brand-title">
            Document templates in different colours with a colour wheel
          </title>
          <circle cx="210" cy="190" r="160" class="glow" />
          @for (sheet of brandSheets; track sheet.color) {
            <g [attr.transform]="'rotate(' + sheet.angle + ' 210 330)'">
              <g class="float" [class.delay]="sheet.angle > 0">
                <rect x="150" y="96" width="120" height="160" rx="12" class="paper shadowed" />
                <path
                  d="M150 108a12 12 0 0 1 12-12h96a12 12 0 0 1 12 12v20H150z"
                  [attr.fill]="sheet.color"
                />
                <rect x="164" y="142" width="64" height="6" rx="3" class="line strong" />
                <rect x="164" y="156" width="92" height="5" rx="2.5" class="line" />
                <rect x="164" y="168" width="80" height="5" rx="2.5" class="line" />
                <rect x="164" y="180" width="88" height="5" rx="2.5" class="line" />
                <rect x="200" y="222" width="56" height="18" rx="5" [attr.fill]="sheet.color" />
              </g>
            </g>
          }
          <g class="spin" style="transform-origin: 332px 88px">
            @for (swatch of swatches; track swatch.color; let i = $index) {
              <circle
                [attr.cx]="332 + 34 * swatch.x"
                [attr.cy]="88 + 34 * swatch.y"
                r="13"
                [attr.fill]="swatch.color"
                stroke="#fff"
                stroke-width="3"
              />
            }
          </g>
          <circle cx="332" cy="88" r="12" fill="#fff" />
          <path d="M76 96l5 13 13 5-13 5-5 13-5-13-13-5 13-5z" class="sparkle" />
        </svg>
      }
      @case ('track') {
        <svg
          viewBox="0 0 420 380"
          role="img"
          aria-labelledby="art-track-title"
          data-testid="welcome-art-track"
        >
          <title id="art-track-title">
            A dashboard with a payment chart, a progress ring and reminders
          </title>
          <circle cx="210" cy="190" r="160" class="glow" />
          <g class="float-slow">
            <rect x="56" y="74" width="308" height="232" rx="20" class="paper shadowed" />
            <rect x="80" y="98" width="90" height="8" rx="4" class="line strong" />
            <rect x="80" y="112" width="56" height="6" rx="3" class="line" />
            @for (bar of bars; track bar.x) {
              <rect
                [attr.x]="bar.x"
                [attr.y]="270 - bar.h"
                width="22"
                [attr.height]="bar.h"
                rx="6"
                class="bar"
                [class.fill-a]="bar.accent"
                [style.animation-delay]="bar.delay"
              />
            }
            <rect x="80" y="272" width="156" height="2" class="line" />
            <circle cx="296" cy="176" r="40" class="ring-track" />
            <circle cx="296" cy="176" r="40" class="ring" transform="rotate(-90 296 176)" />
            <text x="296" y="182" text-anchor="middle" class="ring-text">72%</text>
            <rect x="262" y="236" width="70" height="16" rx="8" class="pill paid" />
            <rect x="262" y="258" width="52" height="16" rx="8" class="pill due" />
          </g>
          <g class="bell">
            <circle cx="352" cy="74" r="26" class="fill-a" />
            <path
              d="M352 60c-7 0-12 5-12 12v9l-4 5h32l-4-5v-9c0-7-5-12-12-12zm-5 29a5 5 0 0 0 10 0"
              fill="#fff"
            />
            <circle cx="366" cy="58" r="6" class="dot" />
          </g>
        </svg>
      }
      @case ('company') {
        <svg
          viewBox="0 0 420 380"
          role="img"
          aria-labelledby="art-company-title"
          data-testid="welcome-art-company"
        >
          <title id="art-company-title">Your company's storefront with its name on the sign</title>
          <circle cx="210" cy="190" r="160" class="glow" />
          <rect x="40" y="322" width="340" height="6" rx="3" fill="#fff" opacity="0.5" />
          <g class="float-slow">
            <rect x="82" y="120" width="256" height="202" rx="10" class="paper shadowed" />
            <rect x="72" y="150" width="276" height="16" rx="4" class="fill-a" />
            @for (scallop of scallops; track scallop) {
              <path
                [attr.d]="'M' + scallop + ' 166q11.5 22 23 0z'"
                [attr.class]="$index % 2 === 0 ? 'fill-a' : 'fill-white'"
              />
            }
            <rect x="112" y="82" width="196" height="52" rx="12" class="sign" />
            <circle cx="140" cy="108" r="17" fill="#fff" />
            @if (logo()) {
              <clipPath id="art-logo-clip"><circle cx="140" cy="108" r="15" /></clipPath>
              <image
                [attr.href]="logo()"
                x="125"
                y="93"
                width="30"
                height="30"
                clip-path="url(#art-logo-clip)"
                preserveAspectRatio="xMidYMid slice"
              />
            } @else {
              <text x="140" y="115" text-anchor="middle" class="initial">{{ initial() }}</text>
            }
            <text x="166" y="114" class="sign-text" data-testid="welcome-art-company-name">
              {{ signName() }}
            </text>
            <rect x="110" y="214" width="70" height="56" rx="6" class="window" />
            <rect x="240" y="214" width="70" height="56" rx="6" class="window" />
            <rect x="190" y="226" width="40" height="96" rx="6" class="fill-a door" />
            <circle cx="222" cy="276" r="3" fill="#fff" />
            <path d="M130 270c0-18 12-26 12-26s12 8 12 26z" class="plant" />
            <path d="M266 270c0-18 12-26 12-26s12 8 12 26z" class="plant" />
          </g>
          <path d="M360 70l5 13 13 5-13 5-5 13-5-13-13-5 13-5z" class="sparkle" />
          <path d="M58 150l3.5 9 9 3.5-9 3.5-3.5 9-3.5-9-9-3.5 9-3.5z" class="sparkle delay" />
        </svg>
      }
    }
  `,
  styleUrl: './welcome-art.scss',
  host: { '[class.is-active]': 'active()' },
})
export class WelcomeArt {
  readonly kind = input.required<WelcomeArtKind>();
  /** Animations run only on the visible slide. */
  readonly active = input(false);
  /** Company slide: the name and logo being entered. */
  readonly companyName = input('');
  readonly logo = input<string | null>(null);

  protected readonly rows = [126, 146, 166, 186, 206, 226];
  protected readonly flowCards = [
    { x: 20, y: 48, label: 'Quotation', mark: 'Q', fill: 'fill-a', delay: '', done: true },
    {
      x: 128,
      y: 142,
      label: 'Goods receipt',
      mark: 'GR',
      fill: 'fill-b',
      delay: 'delay',
      done: true,
    },
    {
      x: 236,
      y: 254,
      label: 'Invoice',
      mark: 'INV',
      fill: 'fill-c',
      delay: 'delay-2',
      done: false,
    },
  ];
  protected readonly brandSheets = [
    { angle: -14, color: '#4f46e5' },
    { angle: 14, color: '#ea580c' },
    { angle: 0, color: '#0f766e' },
  ];
  protected readonly swatches = [
    { color: '#2563eb', x: 0, y: -1 },
    { color: '#7c3aed', x: 0.95, y: -0.31 },
    { color: '#dc2626', x: 0.59, y: 0.81 },
    { color: '#059669', x: -0.59, y: 0.81 },
    { color: '#b7791f', x: -0.95, y: -0.31 },
  ];
  protected readonly bars = [
    { x: 84, h: 58, delay: '0ms', accent: false },
    { x: 114, h: 92, delay: '80ms', accent: false },
    { x: 144, h: 74, delay: '160ms', accent: false },
    { x: 174, h: 120, delay: '240ms', accent: true },
    { x: 204, h: 100, delay: '320ms', accent: false },
  ];
  protected readonly scallops = [72, 95, 118, 141, 164, 187, 210, 233, 256, 279, 302, 325];

  protected readonly signName = computed(() => {
    const name = this.companyName().trim() || 'Your company';
    return name.length > 18 ? `${name.slice(0, 17)}…` : name;
  });
  protected readonly initial = computed(() =>
    (this.companyName().trim() || 'Y').charAt(0).toUpperCase(),
  );
}
