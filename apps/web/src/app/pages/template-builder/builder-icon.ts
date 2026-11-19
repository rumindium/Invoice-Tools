import { Component, computed, input } from '@angular/core';

/** Line icons (24 × 24, stroke) used across the template builder. */
const ICONS: Record<string, string[]> = {
  templates: ['M4 4h7v9H4zM13 4h7v5h-7zM13 11h7v9h-7zM4 15h7v5H4z'],
  elements: [
    'M7 3l4 7H3z',
    'M17.5 10a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z',
    'M4 14h7v7H4z',
    'M14 14h7v7h-7z',
  ],
  text: ['M5 6V4h14v2', 'M12 4v16', 'M9 20h6'],
  brand: ['M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.4 6.8 19.1l1-5.8L3.5 9.2l5.9-.9z'],
  upload: ['M12 16V4', 'm7 9 5-5 5 5', 'M5 20h14'],
  signature: ['M3 17c3-1 4-9 6-9s-1 9 2 9 3-5 5-5 1 4 5 4', 'M3 21h18'],
  fields: [
    'M8 4c-2 0-3 1-3 3v2c0 1-1 2-2 3 1 1 2 2 2 3v2c0 2 1 3 3 3',
    'M16 4c2 0 3 1 3 3v2c0 1 1 2 2 3-1 1-2 2-2 3v2c0 2-1 3-3 3',
  ],
  layers: ['m12 3 9 5-9 5-9-5z', 'm3 13 9 5 9-5'],
  undo: ['M9 14 4 9l5-5', 'M4 9h10.5a5.5 5.5 0 0 1 0 11H11'],
  redo: ['m15 14 5-5-5-5', 'M20 9H9.5a5.5 5.5 0 0 0 0 11H13'],
  back: ['m15 18-6-6 6-6'],
  eye: ['M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z', 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z'],
  eyeOff: [
    'M3 3l18 18',
    'M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3 3.9M6.6 6.6C3.6 8.4 2 12 2 12s3.5 7 10 7a9.6 9.6 0 0 0 5.4-1.6',
    'M9.9 9.9a3 3 0 0 0 4.2 4.2',
  ],
  lock: ['M6 11h12v9H6z', 'M8.5 11V8a3.5 3.5 0 0 1 7 0v3'],
  unlock: ['M6 11h12v9H6z', 'M8.5 11V8a3.5 3.5 0 0 1 6.8-1.2'],
  copy: ['M9 9h11v11H9z', 'M5 15H4V4h11v1'],
  trash: ['M4 7h16', 'M10 11v6M14 11v6', 'M6 7l1 13h10l1-13', 'M9 7V4h6v3'],
  bold: ['M7 5h6a3.5 3.5 0 0 1 0 7H7z', 'M7 12h7a3.5 3.5 0 0 1 0 7H7z'],
  italic: ['M10 5h8', 'M6 19h8', 'M15 5 9 19'],
  underline: ['M7 4v7a5 5 0 0 0 10 0V4', 'M5 20h14'],
  uppercase: [
    'M3 18 7 6l4 12',
    'M4.5 14h5',
    'M14 18V9h3.5a2.3 2.3 0 0 1 0 4.5H14h4a2.3 2.3 0 0 1 0 4.5z',
  ],
  alignLeft: ['M4 6h16', 'M4 10h10', 'M4 14h16', 'M4 18h10'],
  alignCenter: ['M4 6h16', 'M7 10h10', 'M4 14h16', 'M7 18h10'],
  alignRight: ['M4 6h16', 'M10 10h10', 'M4 14h16', 'M10 18h10'],
  alignJustify: ['M4 6h16', 'M4 10h16', 'M4 14h16', 'M4 18h16'],
  spacing: ['M4 20h16', 'M4 4h16', 'M8 16l4-8 4 8', 'M9.5 13h5'],
  transparency: [
    'M4 4h16v16H4z',
    'M4 4h4v4H4zM12 4h4v4h-4zM8 8h4v4H8zM16 8h4v4h-4zM4 12h4v4H4zM12 12h4v4h-4zM8 16h4v4H8zM16 16h4v4h-4z',
  ],
  position: [
    'M12 3v18',
    'M3 12h18',
    'm9 6 3-3 3 3',
    'm9 18 3 3 3-3',
    'm6 9-3 3 3 3',
    'm18 9 3 3-3 3',
  ],
  group: ['M3 3h7v7H3z', 'M14 14h7v7h-7z', 'M10 6.5h7.5V14', 'M14 17.5H6.5V10'],
  ungroup: ['M3 3h7v7H3z', 'M14 14h7v7h-7z'],
  plus: ['M12 5v14', 'M5 12h14'],
  minus: ['M5 12h14'],
  close: ['m6 6 12 12', 'M18 6 6 18'],
  download: ['M12 4v12', 'm7 11 5 5 5-5', 'M5 20h14'],
  print: ['M7 8V3h10v5', 'M6 17H4v-7h16v7h-2', 'M7 14h10v7H7z'],
  file: ['M7 3h7l5 5v13H7z', 'M14 3v5h5'],
  import: ['M12 20V8', 'm7 13 5-5 5 5', 'M5 4h14'],
  keyboard: ['M3 6h18v12H3z', 'M7 10h.01M11 10h.01M15 10h.01M7 14h10'],
  fit: ['M4 9V4h5', 'M15 4h5v5', 'M20 15v5h-5', 'M9 20H4v-5'],
  margins: ['M4 4h16v16H4z', 'M8 8h8v8H8z'],
  ruler: ['M3 8h18v8H3z', 'M7 8v3M11 8v4M15 8v3M19 8v2'],
  check: ['m5 12 5 5 9-10'],
  image: ['M3 5h18v14H3z', 'm3 16 5-5 4 4 3-3 6 6', 'M15.5 9.5h.01'],
  table: ['M3 5h18v14H3z', 'M3 10h18', 'M3 14.5h18', 'M9 10v9'],
  totals: ['M6 4h12', 'M6 4l6 8-6 8h12'],
  replace: [
    'M4 12a8 8 0 0 1 14-5.3L20 9',
    'M20 4v5h-5',
    'M20 12a8 8 0 0 1-14 5.3L4 15',
    'M4 20v-5h5',
  ],
  columns: ['M4 4h16v16H4z', 'M10 4v16', 'M15 4v16'],
  rows: ['M4 4h16v16H4z', 'M4 10h16', 'M4 15h16'],
  forward: ['M8 8h12v12H8z', 'M4 16V4h12'],
  arrangeFront: ['M9 9h11v11H9z', 'M4 4h11v11H4z'],
  more: ['M5 12h.01', 'M12 12h.01', 'M19 12h.01'],
  search: ['M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z', 'm20 20-4-4'],
  drag: ['M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01'],
  sparkle: [
    'M12 3v4M12 17v4M3 12h4M17 12h4',
    'm6 6 2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6',
  ],
  page: ['M6 3h12v18H6z'],
  landscape: ['M3 6h18v12H3z'],
  palette: [
    'M12 3a9 9 0 1 0 0 18c1 0 1.5-.8 1.5-1.6 0-.9-.7-1.4-.7-2.2 0-.9.7-1.4 1.6-1.4H16a5 5 0 0 0 5-5C21 6.6 17 3 12 3z',
    'M7.5 11.5h.01M9.5 7.5h.01M14.5 7.5h.01',
  ],
  help: [
    'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z',
    'M9.5 9a2.5 2.5 0 0 1 4.9.7c0 1.6-2.4 2.3-2.4 3.8',
    'M12 17h.01',
  ],
  alignLeftEdge: ['M4 3v18', 'M8 7h10v4H8z', 'M8 13h6v4H8z'],
  alignHCenter: ['M12 3v18', 'M6 7h12v4H6z', 'M8 13h8v4H8z'],
  alignRightEdge: ['M20 3v18', 'M6 7h10v4H6z', 'M10 13h6v4h-6z'],
  alignTopEdge: ['M3 4h18', 'M7 8v10h4V8z', 'M13 8v6h4V8z'],
  alignVCenter: ['M3 12h18', 'M7 6v12h4V6z', 'M13 8v8h4V8z'],
  alignBottomEdge: ['M3 20h18', 'M7 6v10h4V6z', 'M13 10v6h4v-6z'],
};

@Component({
  selector: 'app-tb-icon',
  host: { 'aria-hidden': 'true' },
  template: `
    <svg viewBox="0 0 24 24" [attr.width]="size()" [attr.height]="size()">
      @for (path of paths(); track $index) {
        <path [attr.d]="path" />
      }
    </svg>
  `,
  styles: `
    :host {
      display: inline-flex;
      flex: none;
    }
    svg {
      fill: none;
      stroke: currentColor;
      stroke-width: 1.8;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
  `,
})
export class BuilderIcon {
  readonly name = input.required<string>();
  readonly size = input(18);
  protected readonly paths = computed(() => ICONS[this.name()] ?? []);
}
