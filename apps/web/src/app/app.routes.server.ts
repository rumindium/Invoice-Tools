import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  { path: '', renderMode: RenderMode.Prerender },
  { path: 'login', renderMode: RenderMode.Client },
  { path: 'register', renderMode: RenderMode.Client },
  { path: 'dashboard', renderMode: RenderMode.Client },
  { path: 'documents', renderMode: RenderMode.Client },
  { path: 'documents/**', renderMode: RenderMode.Client },
  { path: 'invoices/**', renderMode: RenderMode.Client },
  { path: 'company', renderMode: RenderMode.Client },
  { path: '**', renderMode: RenderMode.Prerender },
];
