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
    // Full-screen editor, outside the app shell (no sidebar), still behind sign-in.
    path: 'templates/builder/:id',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/template-builder/template-builder').then((page) => page.TemplateBuilderPage),
    title: 'Template Editor — Rumindium Invoice',
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
        path: 'quotations',
        loadComponent: () =>
          import('./pages/quotations/quotations').then((page) => page.QuotationsPage),
        title: 'My Quotations — Rumindium Invoice',
      },
      {
        path: 'quotations/new',
        loadComponent: () =>
          import('./pages/quotations/quotation-editor').then((page) => page.QuotationEditorPage),
        title: 'Create Quotation — Rumindium Invoice',
      },
      {
        path: 'quotations/:id/revisions/:revision',
        loadComponent: () =>
          import('./pages/quotations/quotation-detail').then((page) => page.QuotationDetailPage),
        title: 'Quotation version — Rumindium Invoice',
      },
      {
        path: 'quotations/:id',
        loadComponent: () =>
          import('./pages/quotations/quotation-detail').then((page) => page.QuotationDetailPage),
        title: 'Quotation — Rumindium Invoice',
      },
      {
        path: 'goods-receipts',
        loadComponent: () =>
          import('./pages/goods-receipts/goods-receipts').then((page) => page.GoodsReceiptsPage),
        title: 'My Goods Receipts — Rumindium Invoice',
      },
      {
        path: 'goods-receipts/new',
        loadComponent: () =>
          import('./pages/goods-receipts/goods-receipt-new').then(
            (page) => page.GoodsReceiptNewPage,
          ),
        title: 'New Goods Receipt — Rumindium Invoice',
      },
      {
        path: 'goods-receipts/:id/edit',
        loadComponent: () =>
          import('./pages/goods-receipts/goods-receipt-editor').then(
            (page) => page.GoodsReceiptEditorPage,
          ),
        title: 'Edit Goods Receipt — Rumindium Invoice',
      },
      {
        path: 'goods-receipts/:id/revisions/:revision',
        loadComponent: () =>
          import('./pages/goods-receipts/goods-receipt-detail').then(
            (page) => page.GoodsReceiptDetailPage,
          ),
        title: 'Goods Receipt version — Rumindium Invoice',
      },
      {
        path: 'goods-receipts/:id',
        loadComponent: () =>
          import('./pages/goods-receipts/goods-receipt-detail').then(
            (page) => page.GoodsReceiptDetailPage,
          ),
        title: 'Goods Receipt — Rumindium Invoice',
      },
      {
        path: 'documents',
        loadComponent: () =>
          import('./pages/documents/documents').then((page) => page.DocumentsPage),
        title: 'My Invoices — Rumindium Invoice',
      },
      {
        path: 'documents/:id/revisions/:revision',
        loadComponent: () =>
          import('./pages/invoices/invoice-detail').then((page) => page.InvoiceDetailPage),
        title: 'Invoice version — Rumindium Invoice',
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
        path: 'templates/quotations',
        loadComponent: () =>
          import('./pages/templates/document-templates').then((page) => page.DocumentTemplatesPage),
        data: { documentType: 'quotation' },
        title: 'Quotation Templates — Rumindium Invoice',
      },
      {
        path: 'templates/goods-receipts',
        loadComponent: () =>
          import('./pages/templates/document-templates').then((page) => page.DocumentTemplatesPage),
        data: { documentType: 'goods-receipt' },
        title: 'Goods Receipt Templates — Rumindium Invoice',
      },
      {
        path: 'templates/invoices',
        loadComponent: () =>
          import('./pages/templates/document-templates').then((page) => page.DocumentTemplatesPage),
        data: { documentType: 'invoice' },
        title: 'Invoice Templates — Rumindium Invoice',
      },
      {
        path: 'templates/builder',
        loadComponent: () =>
          import('./pages/template-builder/template-library').then(
            (page) => page.TemplateLibraryPage,
          ),
        title: 'Template Builder — Rumindium Invoice',
      },
      { path: 'templates', pathMatch: 'full', redirectTo: 'templates/quotations' },
      {
        path: 'feedback',
        loadComponent: () =>
          import('./pages/feedback/feedback-list').then((page) => page.FeedbackListPage),
        title: 'Feedback — Rumindium Invoice',
      },
      {
        path: 'feedback/new',
        loadComponent: () =>
          import('./pages/feedback/feedback-editor').then((page) => page.FeedbackEditorPage),
        title: 'Log Feedback — Rumindium Invoice',
      },
      {
        path: 'feedback/:id/edit',
        loadComponent: () =>
          import('./pages/feedback/feedback-editor').then((page) => page.FeedbackEditorPage),
        title: 'Edit Feedback — Rumindium Invoice',
      },
      {
        path: 'feedback/:id',
        loadComponent: () =>
          import('./pages/feedback/feedback-detail').then((page) => page.FeedbackDetailPage),
        title: 'Feedback — Rumindium Invoice',
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
