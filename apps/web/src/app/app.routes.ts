import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/auth.guard';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('./pages/home/home').then((page) => page.HomePage),
    title: 'Rumindium Invoice — Invoicing for small businesses',
  },
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () => import('./pages/auth/login').then((page) => page.LoginPage),
    title: 'Sign in — Rumindium Invoice',
  },
  {
    path: 'register',
    canActivate: [guestGuard],
    loadComponent: () => import('./pages/auth/register').then((page) => page.RegisterPage),
    title: 'Create account — Rumindium Invoice',
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./layouts/app-shell').then((layout) => layout.AppShell),
    children: [
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./pages/dashboard/dashboard').then((page) => page.DashboardPage),
        title: 'Dashboard — Rumindium Invoice',
      },
      {
        path: 'documents',
        loadComponent: () =>
          import('./pages/documents/documents').then((page) => page.DocumentsPage),
        title: 'My Invoices — Rumindium Invoice',
      },
      {
        path: 'invoices/new',
        loadComponent: () =>
          import('./pages/generate/document-generator').then((page) => page.DocumentGeneratorPage),
        title: 'Create Invoice — Rumindium Invoice',
      },
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
    ],
  },
  { path: '**', redirectTo: '' },
];
