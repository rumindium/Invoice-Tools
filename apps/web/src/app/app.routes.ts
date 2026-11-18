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
    path: 'verify-email',
    loadComponent: () => import('./pages/auth/verify-email').then((page) => page.VerifyEmailPage),
    title: 'Verify your email — Rumindium Invoice',
  },
  {
    path: 'forgot-password',
    canActivate: [guestGuard],
    loadComponent: () =>
      import('./pages/auth/forgot-password').then((page) => page.ForgotPasswordPage),
    title: 'Forgot password — Rumindium Invoice',
  },
  {
    path: 'reset-password',
    canActivate: [guestGuard],
    loadComponent: () =>
      import('./pages/auth/reset-password').then((page) => page.ResetPasswordPage),
    title: 'Reset password — Rumindium Invoice',
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
        path: 'documents/:id',
        loadComponent: () =>
          import('./pages/invoices/invoice-detail').then((page) => page.InvoiceDetailPage),
        title: 'Invoice — Rumindium Invoice',
      },
      {
        path: 'invoices/new',
        loadComponent: () =>
          import('./pages/generate/document-generator').then((page) => page.DocumentGeneratorPage),
        title: 'Create Invoice — Rumindium Invoice',
      },
      {
        path: 'customers',
        loadComponent: () =>
          import('./pages/customers/customers').then((page) => page.CustomersPage),
        title: 'Customers — Rumindium Invoice',
      },
      {
        path: 'customers/:id',
        loadComponent: () =>
          import('./pages/customers/customer-detail').then((page) => page.CustomerDetailPage),
        title: 'Customer — Rumindium Invoice',
      },
      {
        path: 'items',
        loadComponent: () => import('./pages/items/items').then((page) => page.ItemsPage),
        title: 'Items — Rumindium Invoice',
      },
      {
        path: 'items/:id',
        loadComponent: () =>
          import('./pages/items/item-detail').then((page) => page.ItemDetailPage),
        title: 'Item — Rumindium Invoice',
      },
      {
        path: 'activity',
        loadComponent: () => import('./pages/activity/activity').then((page) => page.ActivityPage),
        title: 'Activity — Rumindium Invoice',
      },
      {
        path: 'company',
        loadComponent: () => import('./pages/company/company').then((page) => page.CompanyPage),
        title: 'Company — Rumindium Invoice',
      },
      {
        path: 'account',
        loadComponent: () => import('./pages/account/account').then((page) => page.AccountPage),
        title: 'Account — Rumindium Invoice',
      },
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
    ],
  },
  { path: '**', redirectTo: '' },
];
