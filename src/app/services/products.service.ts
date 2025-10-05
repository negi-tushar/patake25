import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  collectionData,
  doc,
  deleteDoc,
  updateDoc,
  addDoc,
  writeBatch,
  query,
  Query,
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';
import { CrackerCategory } from '../pages/products/products.component';
export interface Product {
  id?: string;

  // Core
  name: string;
  quantity: number;
  unit: string;
 category: CrackerCategory; 
  // Pricing
  // costPrice: what you pay (source of truth for margins)
  costPrice: number;

  // sellPrice: what you sell at (used in invoices)
  sellPrice: number;

  // Optional helper for UI bulk updates and visibility
  marginPercent?: number;

  // Legacy fields (if old code still references them)
  // rate: previously used price; keep as alias of costPrice during migration
  rate?: number;

  // amount: usually not stored on product, kept for backward compatibility
  amount?: number;

  // Metadata
  createdAt: Date;

  // UI state only (not necessary to persist)
  selected?: boolean;
}

@Injectable({
  providedIn: 'root'
})

export class ProductsService {
  private LOCAL_KEY = 'products_cache_v1';

  private firestore: Firestore = inject(Firestore);
  private productsCollection = collection(this.firestore, 'products');

  getProducts(customQuery?: Query): Observable<Product[]> {
    const q = customQuery || this.productsCollection;
    return collectionData(q, { idField: 'id' }) as Observable<Product[]>;
  }

  addProduct(product: Partial<Product>): Promise<any> {
    return addDoc(this.productsCollection, product);
  }

  updateProduct(productId: string, data: Partial<Product>): Promise<void> {
    const productDoc = doc(this.firestore, `products/${productId}`);
    return updateDoc(productDoc, data);
  }

  deleteProduct(productId: string): Promise<void> {
    const productDoc = doc(this.firestore, `products/${productId}`);
    return deleteDoc(productDoc);
  }

  deleteMultipleProducts(productIds: string[]): Promise<void> {
    const batch = writeBatch(this.firestore);
    productIds.forEach(id => {
      const productDoc = doc(this.firestore, `products/${id}`);
      batch.delete(productDoc);
    });
    return batch.commit();
  }
   saveToLocal(products: Product[]): void {
  try {
    localStorage.setItem(this.LOCAL_KEY, JSON.stringify(products));
  } catch {}
}

// Read array from local DB
 readFromLocal(): Product[] {
  try {
    const raw = localStorage.getItem(this.LOCAL_KEY);
    return raw ? JSON.parse(raw) as Product[] : [];
  } catch {
    return [];
  }
}
}
