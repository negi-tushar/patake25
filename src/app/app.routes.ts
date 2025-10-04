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
