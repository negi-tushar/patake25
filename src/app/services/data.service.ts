import { Injectable, inject } from '@angular/core';
import { Firestore, collection, collectionData } from '@angular/fire/firestore';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class DataService {
  private firestore: Firestore = inject(Firestore);

  getInvoices(): Observable<any[]> {
    const invoicesCollection = collection(this.firestore, 'invoices');
    return collectionData(invoicesCollection, { idField: 'id' });
  }
}
