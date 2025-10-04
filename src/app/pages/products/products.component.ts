import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormsModule,
  ReactiveFormsModule,
  FormBuilder,
  Validators,
} from '@angular/forms';
import { firstValueFrom, Observable } from 'rxjs';
import { Product, ProductsService } from '../../services/products.service';
import Papa from 'papaparse';
import {
  Firestore,
  collection,
  writeBatch,
  doc,
} from '@angular/fire/firestore';
import { BehaviorSubject } from 'rxjs';

declare var bootstrap: any; // For Bootstrap modal control

@Component({
  selector: 'app-products',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './products.component.html',
})
export class ProductsComponent implements OnInit {
  private productsService = inject(ProductsService);
  private firestore = inject(Firestore);
  private fb = inject(FormBuilder);
  private productsRef = collection(this.firestore, 'products');
  private productsSubject = new BehaviorSubject<Product[]>([]);


bulkMarginPercent: number = Number(localStorage.getItem('bulk_margin') ?? 20);
bulkScope: 'selected' | 'all' = 'selected';

  products$ = this.productsSubject.asObservable();
  productForm = this.fb.group({
    id: [''],
    name: ['', Validators.required],
    quantity: [0, [Validators.required, Validators.min(0)]],
    unit: ['box', Validators.required],
    rate: [0, [Validators.required, Validators.min(0)]],
    amount: [{ value: 0, disabled: true }],
  });

  isEditMode = false;
  private productModal: any;
  selectedProductIds = new Set<string>();

  showToastFlag = signal(false);
  toastMessage = signal('');
  toastType = signal<'success' | 'error'>('success');

  async ngOnInit(): Promise<void> {
    // 1) Try local first
    const cached = this.productsService.readFromLocal();
    if (cached.length > 0) {
      this.productsSubject.next(cached);
    } else {
      // 2) Fallback to Firestore if no cache
      const fresh = await firstValueFrom(this.productsService.getProducts());
      this.productsSubject.next(fresh);
      this.productsService.saveToLocal(fresh);
    }

    this.productModal = new bootstrap.Modal(
      document.getElementById('productModal')
    );
    this.productForm
      .get('quantity')
      ?.valueChanges.subscribe(() => this.calculateAmount());
    this.productForm
      .get('rate')
      ?.valueChanges.subscribe(() => this.calculateAmount());
  }

  // Rounds to 2 decimals
private round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

canApplyMargin(): boolean {
  if (this.bulkMarginPercent == null || isNaN(this.bulkMarginPercent) || this.bulkMarginPercent < 0) return false;
  if (this.bulkScope === 'selected') return this.selectedProductIds.size > 0;
  return true;
}

async applyMargin(): Promise<void> {
  try {
    // Persist last used margin
    localStorage.setItem('bulk_margin', String(this.bulkMarginPercent));

    const percent = Number(this.bulkMarginPercent);
    if (isNaN(percent) || percent < 0) {
      this.toast('Enter a valid margin percentage.', 'error');
      return;
    }

    // Resolve target products based on scope
    const allProducts = await firstValueFrom(this.products$);
    const targets = this.bulkScope === 'all'
      ? allProducts
      : allProducts.filter(p => this.selectedProductIds.has(p.id!));

    if (targets.length === 0) {
      this.toast('No products to update.', 'error');
      return;
    }

    // Prepare updates: new sellPrice from costPrice
    const updates = targets.map(p => {
      const cost = (p as any).costPrice ?? p.rate ?? 0; // fallback if migrating
      const newSell = this.round2(Number(cost) * (1 + percent / 100));
      return {
        id: p.id!,
        sellPrice: newSell,
        marginPercent: percent
      };
    });

    // Apply in batches
    const chunkSize = 400;
    for (let i = 0; i < updates.length; i += chunkSize) {
      const chunk = updates.slice(i, i + chunkSize);
      const batch = writeBatch(this.firestore);
      chunk.forEach(u => {
        const ref = doc(this.firestore, `products/${u.id}`);
        batch.update(ref, { sellPrice: u.sellPrice, marginPercent: u.marginPercent });
      });
      await batch.commit();
    }

    // Update local cache and UI
    const current = [...this.productsSubject.value];
    const map = new Map(current.map(p => [p.id!, p]));
    updates.forEach(u => {
      const existing = map.get(u.id);
      if (existing) {
        (existing as any).sellPrice = u.sellPrice;
        (existing as any).marginPercent = u.marginPercent;
      }
    });
    const next = Array.from(map.values());
    this.productsSubject.next(next);
    this.productsService .saveToLocal(next);

    this.toast(`Applied ${percent}% margin to ${updates.length} product(s).`, 'success');

  } catch (err) {
    console.error('applyMargin error', err);
    this.toast('Failed to apply margin.', 'error');
  }
}


  async refreshFromServer(): Promise<void> {
    const fresh = await firstValueFrom(this.productsService.getProducts());
    this.productsSubject.next(fresh);
    this.productsService.saveToLocal(fresh);
    this.toast('Products refreshed from server.', 'success');
  }

  // --- Modal and Form Logic ---
  openProductModal(product?: Product): void {
    if (product) {
      this.isEditMode = true;
      this.productForm.setValue({
        id: product.id || '',
        name: product.name,
        quantity: product.quantity,
        unit: product.unit,
        rate: product.rate??0,
        amount: product.amount??0,
      });
    } else {
      this.isEditMode = false;
      this.productForm.reset({
        name: '',
        quantity: 0,
        unit: 'box',
        rate: 0,
        amount: 0,
      });
    }
    this.productModal.show();
  }

  async saveProduct(): Promise<void> {
    if (this.productForm.invalid) return;
    const formData = this.productForm.getRawValue();
    const productData: Partial<Product> = {
      name: formData.name ?? '',
      quantity: formData.quantity ?? 0,
      unit: formData.unit ?? 'box',
      rate: formData.rate ?? 0,
      amount: formData.amount ?? 0,
    };

    try {
      if (this.isEditMode) {
        await this.productsService.updateProduct(formData.id!, productData);
        const merged: Product = {
          id: formData.id!,
          ...(productData as Product),
        };
        this.upsertLocal(merged);
        this.toast('Product updated successfully.', 'success');
      } else {
        // await this.productsService.addProduct({ ...productData, createdAt: new Date() });
        const docRef = await this.productsService.addProduct({
          ...productData,
          createdAt: new Date(),
        });
        // Mirror into local cache/UI with the new id
        this.addLocal({ id: docRef.id, ...productData, createdAt: new Date() });
        this.toast('Product added successfully.', 'success');
      }
      this.productModal.hide();
    } catch (error) {
      this.toast('Failed to save product.', 'error');
    }
  }

  calculateAmount(): void {
    const quantity = this.productForm.get('quantity')?.value || 0;
    const rate = this.productForm.get('rate')?.value || 0;
    this.productForm.patchValue(
      { amount: quantity * rate },
      { emitEvent: false }
    );
  }

  // --- Deletion Logic ---
  async deleteSingleProduct(product: Product): Promise<void> {
    if (confirm(`Are you sure you want to delete "${product.name}"?`)) {
      try {
        await this.productsService.deleteProduct(product.id!);
        this.removeLocal(product.id!);

        this.toast('Product deleted successfully.', 'success');
      } catch (error) {
        this.toast('Failed to delete product.', 'error');
      }
    }
  }

  onProductSelect(productId: string, event: Event): void {
    const isChecked = (event.target as HTMLInputElement).checked;
    if (isChecked) {
      this.selectedProductIds.add(productId);
    } else {
      this.selectedProductIds.delete(productId);
    }
  }

  isAllSelected(totalProducts: number): boolean {
    return totalProducts > 0 && this.selectedProductIds.size === totalProducts;
  }

  async toggleSelectAll(event: any): Promise<void> {
    const isChecked = event.target.checked;
    const products = await firstValueFrom(this.products$); // Get current list once
    if (isChecked) {
      products.forEach((p) => this.selectedProductIds.add(p.id!));
    } else {
      this.selectedProductIds.clear();
    }
  }
  async deleteSelected(): Promise<void> {
    if (this.selectedProductIds.size === 0) return;

    if (
      confirm(
        `Are you sure you want to delete ${this.selectedProductIds.size} selected products?`
      )
    ) {
      const ids = Array.from(this.selectedProductIds);

      try {
        await this.productsService.deleteMultipleProducts(
          Array.from(this.selectedProductIds)
        );
        ids.forEach((id) => this.removeLocal(id));
        this.selectedProductIds.clear();
        this.toast(
          `${this.selectedProductIds.size} products deleted.`,
          'success'
        );
        this.selectedProductIds.clear();
      } catch (error) {
        this.toast('Failed to delete products.', 'error');
      }
    }
  }

  // --- CSV Import ---
  onCsvSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        const cleaned = (results.data as any[])
          .map((row) => {
            const normalizedRow: { [key: string]: any } = {};
            for (const key in row) {
              normalizedRow[key.trim().toLowerCase()] = row[key];
            }
            const name = (normalizedRow['name'] || normalizedRow['item'] || '')
              .toString()
              .trim();
            const quantity = Number(normalizedRow['quantity'] || 0);
            const rate = Number(normalizedRow['rate'] || 0);
            return {
              name,
              quantity: isFinite(quantity) ? quantity : 0,
              unit: (normalizedRow['unit'] || 'box').toString().trim(),
              rate: isFinite(rate) ? rate : 0,
              amount: Number(normalizedRow['amount'] || quantity * rate),
              createdAt: new Date(),
            };
          })
          .filter((r) => r.name.length > 0);

        if (cleaned.length === 0) {
          this.toast('CSV has no valid rows.', 'error');
          return;
        }

        try {
          const batch = writeBatch(this.firestore);
          cleaned.forEach((row) => {
            const ref = doc(this.productsRef);
            batch.set(ref, row);
          });
          await batch.commit();
await this.refreshFromServer(); 
          this.toast(`Imported ${cleaned.length} products.`, 'success');
        } catch (err) {
          this.toast('CSV import failed.', 'error');
        } finally {
          input.value = '';
        }
      },
      error: () => this.toast('Error reading CSV.', 'error'),
    });
  }

  // --- Toast Utility ---
  toast(message: string, type: 'success' | 'error'): void {
    this.toastMessage.set(message);
    this.toastType.set(type);
    this.showToastFlag.set(true);
    setTimeout(() => this.showToastFlag.set(false), 3000);
  }

  private upsertLocal(product: Product): void {
    const list = [...this.productsSubject.value];
    const idx = list.findIndex((p) => p.id === product.id);
    if (idx > -1) {
      list[idx] = product;
    } else {
      list.unshift(product);
    }
    this.productsSubject.next(list);
    this.productsService.saveToLocal(list);
  }

  private removeLocal(productId: string): void {
    const list = this.productsSubject.value.filter((p) => p.id !== productId);
    this.productsSubject.next(list);
    this.productsService.saveToLocal(list);
  }

  private addLocal(temp: Partial<Product> & { id: string }): void {
    const list = [temp as Product, ...this.productsSubject.value];
    this.productsSubject.next(list);
    this.productsService.saveToLocal(list);
  }
}
