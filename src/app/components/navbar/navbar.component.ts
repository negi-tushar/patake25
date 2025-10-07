import { Component, inject } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { AuthService } from '../../services/auth.service';

declare var bootstrap: any; 

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [RouterModule],
  templateUrl: './navbar.component.html',
})


export class NavbarComponent {
  private authService = inject(AuthService);
  private router = inject(Router);

   closeNavbar() {
    const navbar = document.getElementById('mainNavbar');
    if (navbar) {
      const bsCollapse = bootstrap.Collapse.getInstance(navbar) 
                        || new bootstrap.Collapse(navbar, { toggle: false });
      bsCollapse.hide();
    }
  }

  logout(): void {
    this.authService.logout().subscribe(() => {
      this.router.navigate(['/login']);
    });
  }
}
