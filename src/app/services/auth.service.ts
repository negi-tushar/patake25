import { Injectable, inject } from '@angular/core';
import { Auth, signInWithEmailAndPassword, signOut, user, User } from '@angular/fire/auth';
import { from, Observable } from 'rxjs';
import { map } from 'rxjs/operators';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private auth: Auth = inject(Auth);

    private adminEmails = new Set<string>([
    'tushar@patake25.com' 
  ]);

  user$: Observable<User | null> = user(this.auth);

  login({ email, password }: any): Observable<void> {
    const promise = signInWithEmailAndPassword(this.auth, email, password).then(() => {});
    return from(promise);
  }
  
  /**
   * Returns an observable that emits `true` if the currently logged-in user
   * is an admin, and `false` otherwise.
   */
  public isAdmin(): Observable<boolean> {
    return user(this.auth).pipe(
      map((currentUser: User | null) => {
        if (!currentUser || !currentUser.email) {
          // If no user is logged in or they don't have an email, they are not an admin.
          console.log('No user logged in or email not available.');
          return false;
        }
        // Check if the user's email is in our list of admin emails.
        console.log(`Current user email: ${currentUser.email}`);
        console.log(`Is admin: ${this.adminEmails.has(currentUser.email)}`);
        return this.adminEmails.has(currentUser.email);
      })
    );
  }

  // /**
  //  * A simple getter for the current user's email.
  //  */
  // public getCurrentUserEmail(): Observable<string | null> {
  //   return user(this.auth).pipe(
  //     map(currentUser => currentUser?.email ?? null)
  //   );
  // }

  logout(): Observable<void> {
    return from(signOut(this.auth));
  }
}
