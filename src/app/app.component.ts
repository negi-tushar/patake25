import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet } from '@angular/router';
import { NavbarComponent } from './components/navbar/navbar.component'; // Import Navbar
import { AuthService } from './services/auth.service'; // Import AuthService

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, NavbarComponent], // Add NavbarComponent
  templateUrl: './app.component.html',
})
export class AppComponent {
  // Make AuthService public so the template can access it
  public authService = inject(AuthService);
}
