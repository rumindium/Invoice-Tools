import { Component, computed, input } from '@angular/core';
import { ChartPoint } from '../../core/chart';
import { formatIdrCompact } from '../../core/format';

@Component({
  selector: 'app-bar-chart',
  template: `
    <div class="chart" role="img" [attr.aria-label]="ariaLabel()">
      @for (point of points(); track point.label) {
        <div class="chart-col">
          <span class="chart-value">{{ display(point.value) }}</span>
          <span class="chart-track">
            <span
              class="chart-bar"
              [class.is-empty]="point.value === 0"
              [style.height.%]="height(point.value)"
              [attr.title]="point.label + ': ' + display(point.value)"
            ></span>
          </span>
          <span class="chart-label">{{ point.label }}</span>
        </div>
      }
    </div>
  `,
  styleUrl: './bar-chart.scss',
})
export class BarChart {
  readonly points = input<ChartPoint[]>([]);
  readonly mode = input<'money' | 'count'>('money');

  protected readonly ariaLabel = computed(() => `Bar chart with ${this.points().length} periods`);

  private readonly maxValue = computed(() =>
    Math.max(1, ...this.points().map((point) => point.value)),
  );

  protected height(value: number): number {
    return Math.max(2, Math.round((value / this.maxValue()) * 100));
  }

  protected display(value: number): string {
    return this.mode() === 'money' ? formatIdrCompact(value) : String(value);
  }
}
