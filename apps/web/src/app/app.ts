import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { PageTransitionService } from './core/page-transition.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  template: '<router-outlet />',
})
export class App {
  constructor() {
    // Instantiated for every route so page transitions cover the public and signed-in pages alike.
    inject(PageTransitionService);
  }
}
