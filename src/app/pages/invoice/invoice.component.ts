import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder } from '@angular/forms';
import { Observable, firstValueFrom } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { Firestore, doc, getDoc } from '@angular/fire/firestore';

import { ProductsService, Product } from '../../services/products.service';
import { InvoiceService, SaveInvoicePayload } from '../../services/invoice.service';
import { ActivatedRoute, Router } from '@angular/router';

type DiscountMode = 'flat' | 'percent';

// Represents a single line item in the invoice cart
interface CartLine {
  productId: string;
  name: string;
  unit: string;
  qty: number;
  costPrice: number;
  baseSellPrice: number;
  sellPrice: number;
  marginPercent?: number;
}

@Component({
  selector: 'app-new-invoice',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './invoice.component.html',
})
export class NewInvoiceComponent implements OnInit {
  // --- Injected Services ---
  private fb = inject(FormBuilder);
  private productsService = inject(ProductsService);
  private invoiceService = inject(InvoiceService);
  private firestore = inject(Firestore);
  
    private route = inject(ActivatedRoute);
  private router = inject(Router);

  // --- State for Product Picker ---
  allProducts: Product[] = [];
  filteredProducts = signal<Product[]>([]);
  searchControl = this.fb.control('', { nonNullable: true });
  
  // --- State for Edit Mode ---
  editMode = signal(false);
  editingInvoiceId: string | null = null;

  // --- State for Invoice Details ---
  customerName = this.fb.control('', { nonNullable: true });
  lines = signal<CartLine[]>([]);
  discountMode = signal<DiscountMode>('flat');
  discountValue = signal(0);
  saving = signal(false);
  toast = signal<{ type: 'success' | 'error'; msg: string } | null>(null);

  // --- Computed Totals (Reactive Calculations) ---
  subTotal = computed(() => this.lines().reduce((sum, l) => sum + l.sellPrice * l.qty, 0));
  profitBeforeDiscount = computed(() => this.lines().reduce((sum, l) => sum + (l.sellPrice - l.costPrice) * l.qty, 0));
  
  discountAmount = computed(() => {
    const value = Number(this.discountValue() || 0);
    if (this.discountMode() === 'percent') {
      return this.round2((this.subTotal() * value) / 100);
    }
    return this.round2(value);
  });

  grandTotal = computed(() => this.round2(this.subTotal() - this.discountAmount()));
  profitAfterDiscount = computed(() => this.round2(this.profitBeforeDiscount() - this.discountAmount()));

  async ngOnInit(): Promise<void> {
    this.editingInvoiceId = this.route.snapshot.paramMap.get('id');
    this.editMode.set(!!this.editingInvoiceId);
    // Load all products from the cache-aware service
    this.allProducts = await firstValueFrom(this.productsService.getProducts());
    this.filteredProducts.set(this.allProducts);

    // Set up debounced search
    this.searchControl.valueChanges.pipe(debounceTime(200), distinctUntilChanged()).subscribe(term => {
      const searchTerm = term.toLowerCase().trim();
      this.filteredProducts.set(
        searchTerm ? this.allProducts.filter(p => p.name.toLowerCase().includes(searchTerm)) : this.allProducts
      );
    });
     // If in edit mode, load the invoice and pre-fill the form
    if (this.editMode()) {
      await this.loadInvoiceForEditing(this.editingInvoiceId!);
    }
  }

   // New method to pre-fill the form
  private async loadInvoiceForEditing(id: string): Promise<void> {
    try {
      const invoice = await this.invoiceService.getInvoiceById(id);
      
      // Pre-fill form state
      this.customerName.setValue(invoice.customer.name);
      this.discountMode.set(invoice.discount.mode);
      this.discountValue.set(invoice.discount.value);
      
      // Pre-fill cart lines
      const cartLines: CartLine[] = invoice.items.map(item => ({
        productId: item.productId,
        name: item.name,
        unit: item.unit,
        qty: item.qty,
        costPrice: item.costPriceAtSale,
        baseSellPrice: item.baseSellPriceAtSale,
        sellPrice: item.finalSellPricePerUnit,
        marginPercent: item.marginOverridePercent,
      }));
      this.lines.set(cartLines);

    } catch (error) {
      this.showToast('Failed to load invoice for editing.', 'error');
      this.router.navigate(['/sales']);
    }
  }

  // --- Cart Management Methods ---
  addLineFromProduct(p: Product): void {
    console.log('Adding product to cart:', p);
    const existingIndex = this.lines().findIndex(l => l.productId === p.id);
    
    if (existingIndex > -1) {
      // If item is already in cart, just increment its quantity
      this.lines.update(list => {
        list[existingIndex].qty += 1;
        return [...list];
      });
    } else {
      // --- START OF FIX ---
      // Use `costPrice` if it exists, otherwise fall back to `rate`.
      const cost = p.costPrice ?? p.rate ?? 0;
      const sell = p.sellPrice ?? cost; // Sell price defaults to cost if not set
      // --- END OF FIX ---

      const newLine: CartLine = {
        productId: p.id!,
        name: p.name,
        unit: p.unit,
        qty: 1,
        costPrice: cost,
        baseSellPrice: sell,
        sellPrice: sell,
        marginPercent: this.computeMarginPercent(cost, sell),
      };
      // Add the new line to the top of the cart
      this.lines.update(list => [newLine, ...list]);
    }
  }

  removeLine(index: number): void {
    this.lines.update(list => {
      list.splice(index, 1);
      return [...list];
    });
  }

  // --- Line Item Editing Methods ---
  changeQty(index: number, delta: number): void {
    this.lines.update(list => {
      list[index].qty = Math.max(1, list[index].qty + delta);
      return [...list];
    });
  }

  updateSellPrice(index: number, event: Event): void {
    const newPrice = Number((event.target as HTMLInputElement).value);
    this.lines.update(list => {
      list[index].sellPrice = this.round2(newPrice);
      list[index].marginPercent = this.computeMarginPercent(list[index].costPrice, newPrice);
      return [...list];
    });
  }

  updateMargin(index: number, event: Event): void {
    const newMargin = Number((event.target as HTMLInputElement).value);
    this.lines.update(list => {
      list[index].marginPercent = newMargin;
      list[index].sellPrice = this.round2(list[index].costPrice * (1 + newMargin / 100));
      return [...list];
    });
  }

  // --- Save Invoice Logic ---
   // --- Save Invoice Logic ---
  async saveInvoice(): Promise<void> {
    if (this.lines().length === 0) {
      return this.showToast('Add at least one item to the invoice.', 'error');
    }
    this.saving.set(true);

    try {
      // --- Stock validation has been removed as requested ---

      // Prepare the final invoice payload
      const payload: SaveInvoicePayload = {
        customer: { name: this.customerName.value?.trim() || 'John' },
        items: this.lines().map(l => ({
          productId: l.productId,
          name: l.name,
          unit: l.unit,
          qty: l.qty,
          costPriceAtSale: l.costPrice,
          baseSellPriceAtSale: l.baseSellPrice,
          marginOverridePercent: l.marginPercent,
          finalSellPricePerUnit: l.sellPrice,
          lineSubTotal: this.round2(l.sellPrice * l.qty),
          lineCostTotal: this.round2(l.costPrice * l.qty),
          lineProfit: this.round2((l.sellPrice - l.costPrice) * l.qty),
        })),
        subTotal: this.subTotal(),
        discount: { mode: this.discountMode(), value: this.discountValue() },
        discountAmount: this.discountAmount(),
        grandTotal: this.grandTotal(),
        profitTotalBeforeDiscount: this.profitBeforeDiscount(),
        profitTotalAfterDiscount: this.profitAfterDiscount(),
      };

      if (this.editMode()) {
        // --- EDIT LOGIC ---
        await this.invoiceService.updateInvoiceInPlace(this.editingInvoiceId!, payload);
        this.showToast(`Invoice updated successfully.`, 'success');
      } else {
        // --- CREATE LOGIC ---
        const newInvoiceId = await this.invoiceService.saveInvoiceWithStock(payload);
        this.showToast(`Invoice ${newInvoiceId} saved successfully.`, 'success');
      }

      // Reset form and navigate back to the sales list
      this.resetForm();
      this.router.navigate(['/sales']);

    } catch (e: any) {
      this.showToast(e.message || 'Failed to save invoice.', 'error');
    } finally {
      this.saving.set(false);
    }
  }

    private resetForm(): void {
    this.lines.set([]);
    this.customerName.reset();
    this.discountValue.set(0);
    this.editMode.set(false);
    this.editingInvoiceId = null;
  }

  // --- Helper Methods ---
  private computeMarginPercent(cost: number, sell: number): number {
    return cost > 0 ? this.round2(((sell - cost) / cost) * 100) : 0;
  }

  private round2(n: number): number {
    return Math.round((n + Number.EPSILON) * 100) / 100;
  }

  private showToast(msg: string, type: 'success' | 'error'): void {
    this.toast.set({ type, msg });
    setTimeout(() => this.toast.set(null), 3000);
  }
}
