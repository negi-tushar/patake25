import { Component, OnInit, inject, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { InvoiceService, Invoice } from '../../services/invoice.service';
import { firstValueFrom } from 'rxjs';

interface ItemProfitData {
  itemName: string;
  costPrice: number;
  sellPrice: number;
  totalQtySold: number;
  baseRevenue: number;      // Revenue at base sell price (before discount)
  totalRevenue: number;     // Actual revenue received (after discount)
  totalDiscount: number;    // Total discount given
  totalCost: number;
  totalProfit: number;
  profitMargin: number;
}

type SortOption = 'quantity' | 'profit' | 'revenue' | 'margin';

@Component({
  selector: 'app-profit-analysis',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './profit-analysis.component.html',
})
export class ProfitAnalysisComponent implements OnInit {
  private invoiceService = inject(InvoiceService);
  
  public allInvoices = signal<Invoice[]>([]);
  public isLoading = signal(true);
  public sortBy = signal<SortOption>('quantity');
  
  public itemProfitData = computed(() => {
    const invoices = this.allInvoices();
    const itemMap = new Map<string, ItemProfitData>();
    
    invoices.forEach(invoice => {
      invoice.items.forEach(item => {
        const existing = itemMap.get(item.name);
        
        // Calculate base revenue (at base sell price) and actual revenue (with discount)
        const baseRevenue = item.baseSellPriceAtSale * item.qty;
        const actualRevenue = item.lineSubTotal;
        const discountAmount = baseRevenue - actualRevenue;
        const cost = item.qty * item.costPriceAtSale;
        
        if (existing) {
          existing.totalQtySold += item.qty;
          existing.baseRevenue += baseRevenue;
          existing.totalRevenue += actualRevenue;
          existing.totalDiscount += discountAmount;
          existing.totalCost += cost;
          existing.totalProfit = existing.totalRevenue - existing.totalCost;
          existing.profitMargin = existing.totalRevenue > 0 
            ? (existing.totalProfit / existing.totalRevenue) * 100 
            : 0;
        } else {
          const totalProfit = actualRevenue - cost;
          
          itemMap.set(item.name, {
            itemName: item.name,
            costPrice: item.costPriceAtSale,
            sellPrice: item.baseSellPriceAtSale,
            totalQtySold: item.qty,
            baseRevenue: baseRevenue,
            totalRevenue: actualRevenue,
            totalDiscount: discountAmount,
            totalCost: cost,
            totalProfit: totalProfit,
            profitMargin: actualRevenue > 0 ? (totalProfit / actualRevenue) * 100 : 0,
          });
        }
      });
    });
    
    const items = Array.from(itemMap.values());
    
    const sortOption = this.sortBy();
    switch (sortOption) {
      case 'quantity':
        return items.sort((a, b) => b.totalQtySold - a.totalQtySold);
      case 'profit':
        return items.sort((a, b) => b.totalProfit - a.totalProfit);
      case 'revenue':
        return items.sort((a, b) => b.totalRevenue - a.totalRevenue);
      case 'margin':
        return items.sort((a, b) => b.profitMargin - a.profitMargin);
      default:
        return items;
    }
  });
  
  public totalRevenue = computed(() => 
    this.itemProfitData().reduce((sum, item) => sum + item.totalRevenue, 0)
  );
  
  public totalDiscount = computed(() => 
    this.itemProfitData().reduce((sum, item) => sum + item.totalDiscount, 0)
  );
  
  public totalProfit = computed(() => 
    this.itemProfitData().reduce((sum, item) => sum + item.totalProfit, 0)
  );
  
  public overallMargin = computed(() => 
    this.totalRevenue() > 0 ? (this.totalProfit() / this.totalRevenue()) * 100 : 0
  );

  async ngOnInit(): Promise<void> {
    this.isLoading.set(true);
    const invoices = await firstValueFrom(this.invoiceService.getInvoices());
    this.allInvoices.set(invoices.filter(inv => (inv as any).status !== 'VOIDED'));
    this.isLoading.set(false);
  }
}
