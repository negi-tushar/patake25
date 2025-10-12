import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { Firestore } from '@angular/fire/firestore';
import { ProductsService, Product } from '../../services/products.service';
import { InvoiceService, SaveInvoicePayload } from '../../services/invoice.service';
import { ActivatedRoute, Router } from '@angular/router';

type DiscountMode = 'flat' | 'percent';
declare var bootstrap: any;

interface CartLine {
  productId: string;
  name: string;
  unit: string;
  qty: number;
  costPrice: number;
  mrp: number; // MRP = cost * 1.2
  sellPrice: number;
}

@Component({
  selector: 'app-new-invoice',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './invoice.component.html',
})
export class NewInvoiceComponent implements OnInit {
  private fb = inject(FormBuilder);
  private productsService = inject(ProductsService);
  private invoiceService = inject(InvoiceService);
  private firestore = inject(Firestore);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  allProducts: Product[] = [];
  filteredProducts = signal<Product[]>([]);
  searchControl = this.fb.control('', { nonNullable: true });
  paymentMode = signal<'cash' | 'upi'>('upi');
  customerName = this.fb.control('', { nonNullable: true });
  customerPhone = this.fb.control('');
  lines = signal<CartLine[]>([]);
  discountMode = signal<DiscountMode>('flat');
  discountValue = signal(0);
  saving = signal(false);
  toast = signal<{ type: 'success' | 'error'; msg: string } | null>(null);
  editMode = signal(false);
  editingInvoiceId: string | null = null;
  private previewModal: any;
  margin: number = 1.3;

  // Helper: Calculate MRP (cost * 1.2)
  getMRP(p: Product): number {
    const cost = p.sellPrice ?? p.rate ?? 0;
    return this.round2(cost * this.margin);
  }

  // Helper: Get discount per item (MRP - sellPrice)
  getItemDiscount(p: Product): number {
    return Math.max(0, this.getMRP(p) - (p.sellPrice ?? 0));
  }

  // Computed: Subtotal based on MRP
subTotalMRP = computed(() => {
  return this.round2(this.lines().reduce((sum, l) => {
    const mrp = this.round2(l.sellPrice * this.margin);
    return sum + (mrp * l.qty);
  }, 0));
});  
  // Computed: Subtotal based on actual sell prices
  subTotal = computed(() => this.lines().reduce((sum, l) => sum + l.sellPrice * l.qty, 0));
  
  // Computed: Built-in discount (from MRP to sell price)
  builtInDiscount = computed(() => this.round2(this.subTotalMRP() - this.subTotal()));
  
  // Computed: Extra discount amount
  extraDiscountAmount = computed(() => {
    const value = Number(this.discountValue() || 0);
    if (this.discountMode() === 'percent') {
      return this.round2((this.subTotal() * value) / 100);
    }
    return this.round2(value);
  });

  // Computed: Grand total
  grandTotal = computed(() => this.round2(this.subTotal() - this.extraDiscountAmount()));
  

// Profit calculation before the EXTRA discount is applied
profitBeforeDiscount = computed(()=> {

  return  this.round2(this.lines().reduce((sum, l) => sum + ((l.sellPrice - l.costPrice) * l.qty), 0))
}
 
);

// FINAL PROFIT: The profit from the sale minus the extra discount given.
profitAfterDiscount = computed(() => 
  this.round2(this.profitBeforeDiscount() - this.extraDiscountAmount())
);

  async ngOnInit(): Promise<void> {
    this.editingInvoiceId = this.route.snapshot.paramMap.get('id');
    this.editMode.set(!!this.editingInvoiceId);
    
    this.allProducts = await firstValueFrom(this.productsService.getProducts());
    this.filteredProducts.set(this.allProducts);

    this.searchControl.valueChanges.pipe(debounceTime(200), distinctUntilChanged()).subscribe(term => {
      const searchTerm = term.toLowerCase().trim();
      this.filteredProducts.set(
        searchTerm ? this.allProducts.filter(p => p.name.toLowerCase().includes(searchTerm)) : this.allProducts
      );
    });

    if (this.editMode()) {
      await this.loadInvoiceForEditing(this.editingInvoiceId!);
    }
    
    this.previewModal = new bootstrap.Modal(document.getElementById('previewModal'));
  }

  openPreviewModal(): void {
    if (this.lines().length === 0) {
      this.showToast('Cart is empty. Add items to preview.', 'error');
      return;
    }
    this.previewModal.show();
  }

  async saveFromPreview(): Promise<void> {
    await this.saveInvoice();
    if (!this.saving()) this.previewModal.hide();
  }

  private async loadInvoiceForEditing(id: string): Promise<void> {
    try {
      const invoice = await this.invoiceService.getInvoiceById(id);
      this.customerName.setValue(invoice.customer.name);
      this.customerPhone.setValue(invoice.customer.phone || '');
      this.paymentMode.set((invoice.paymentMode || 'upi') as 'upi' | 'cash');
      this.discountMode.set(invoice.discount.mode);
      this.discountValue.set(invoice.discount.value);
      
      const cartLines: CartLine[] = invoice.items.map(item => ({
        productId: item.productId,
        name: item.name,
        unit: item.unit,
        qty: item.qty,
        rate: item.costPriceAtSale,
        costPrice: item.costPriceAtSale,
        mrp: this.round2(item.finalSellPricePerUnit * this.margin),
        sellPrice: item.finalSellPricePerUnit,
      }));
      this.lines.set(cartLines);
    } catch (error) {
      this.showToast('Failed to load invoice for editing.', 'error');
      this.router.navigate(['/sales']);
    }
  }

  addLineFromProduct(p: Product): void {
    const existingIndex = this.lines().findIndex(l => l.productId === p.id);
    if (existingIndex > -1) {
      this.lines.update(list => {
        list[existingIndex].qty += 1;
        return [...list];
      });
    } else {
      const cost = p.rate ?? 0;
      const sell = p.sellPrice ?? cost;
      const mrp = this.round2(sell * this.margin);

      const newLine: CartLine = {
        productId: p.id!,
        name: p.name,
        unit: p.unit,
        qty: 1,
        costPrice: cost,
        mrp: mrp,
        sellPrice: sell,
      };
      this.lines.update(list => [newLine, ...list]);
    }
  }

  removeLine(index: number): void {
    this.lines.update(list => {
      list.splice(index, 1);
      return [...list];
    });
  }

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
      return [...list];
    });
  }

 async saveInvoice(): Promise<void> {
  if (this.lines().length === 0) {
    return this.showToast('Add at least one item to the invoice.', 'error');
  }
  this.saving.set(true);

  try {
    const payload: SaveInvoicePayload = {
      customer: { 
        name: this.customerName.value?.trim() || 'John', 
        phone: this.customerPhone.value?.trim() || '' 
      },
      paymentMode: this.paymentMode(),
      items: this.lines().map(l => ({
        // Ensure all fields have a default value and none are undefined
        productId: l.productId,
        name: l.name,
        unit: l.unit,
        qty: l.qty,
        costPriceAtSale: l.costPrice ?? 0,
        baseSellPriceAtSale: l.mrp ?? 0,
        // marginOverridePercent: undefined, // Use undefined instead of null
        finalSellPricePerUnit: l.sellPrice ?? 0,
        lineSubTotal: this.round2(l.sellPrice * l.qty),
        lineCostTotal: this.round2(l.costPrice * l.qty),
        lineProfit: this.round2((l.sellPrice - l.costPrice) * l.qty),
      })),
      subTotal: this.subTotal(),
      discount: { mode: this.discountMode(), value: this.discountValue() },
      discountAmount: this.extraDiscountAmount(),
      grandTotal: this.grandTotal(),
      profitTotalBeforeDiscount: this.profitBeforeDiscount(),
      profitTotalAfterDiscount: this.profitAfterDiscount(),
    };
    
    if (this.editMode()) {
      await this.invoiceService.updateInvoiceInPlace(this.editingInvoiceId!, payload);
      this.showToast(`Invoice updated successfully.`, 'success');
    } else {
      const newInvoiceId = await this.invoiceService.saveInvoiceWithStock(payload);
      this.showToast(`Invoice ${newInvoiceId} saved successfully.`, 'success');
    }
    
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
    this.customerPhone.reset();
    this.paymentMode.set('upi');
    this.discountValue.set(0);
    this.editMode.set(false);
    this.editingInvoiceId = null;
  }

  private round2(n: number): number {
    return Math.round((n + Number.EPSILON) * 100) / 100;
  }

  private showToast(msg: string, type: 'success' | 'error'): void {
    this.toast.set({ type, msg });
    setTimeout(() => this.toast.set(null), 3000);
  }
}
