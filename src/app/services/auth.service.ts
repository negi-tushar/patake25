import { Injectable, inject } from '@angular/core';
import { Auth, signInWithEmailAndPassword, signOut, user, User } from '@angular/fire/auth';
import { from, Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private auth: Auth = inject(Auth);
  user$: Observable<User | null> = user(this.auth);

  login({ email, password }: any): Observable<void> {
    const promise = signInWithEmailAndPassword(this.auth, email, password).then(() => {});
    return from(promise);
  }

  logout(): Observable<void> {
    return from(signOut(this.auth));
  }
}
