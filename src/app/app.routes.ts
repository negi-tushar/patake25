import { Routes } from '@angular/router';
import { LoginComponent } from './pages/login/login.component';
import { authGuard } from './guards/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    component: LoginComponent
  },
  {
    path: 'dashboard',
    canActivate: [authGuard], // This route is now protected
    loadComponent: () =>
      import('./pages/dashboard/dashboard.component').then(m => m.DashboardComponent)
  },
  {
    path: 'products',
    canActivate: [authGuard], // Protect this route
    loadComponent: () =>
      import('./pages/products/products.component').then(m => m.ProductsComponent)
  },
   {
    path: 'invoice',
    canActivate: [authGuard], // Protect this route
    loadComponent: () =>
      import('./pages/invoice/invoice.component').then(m => m.NewInvoiceComponent)
  },
  {
    path: 'invoices/edit/:id', // Route for editing an existing invoice
    canActivate: [authGuard],
    loadComponent: () => import('./pages/invoice/invoice.component').then(m => m.NewInvoiceComponent)
  },
   {
    path: 'sales',
    canActivate: [authGuard], // Protect this route
    loadComponent: () =>
      import('./pages/sales/sales.component').then(m => m.SalesComponent)
  },
  // Redirect to dashboard if logged in, otherwise to login
  {
    path: '',
    redirectTo: 'dashboard',
    pathMatch: 'full'
  },
  // Fallback route
  {
    path: '**',
    redirectTo: 'login'
  }
];
