import { Component, OnInit, inject, signal, computed, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BaseChartDirective } from 'ng2-charts';
import { Chart, ChartConfiguration, ChartOptions, LineController, LineElement, PointElement, LinearScale, Title, CategoryScale, DoughnutController, ArcElement, Legend, Tooltip } from 'chart.js';
import { firstValueFrom } from 'rxjs';

import { Invoice, InvoiceService } from '../../services/invoice.service';
import { Product, ProductsService } from '../../services/products.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, BaseChartDirective],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.css']
})
export class DashboardComponent implements OnInit {
  private invoiceService = inject(InvoiceService);
  private productsService = inject(ProductsService);
  @ViewChild(BaseChartDirective) chart?: BaseChartDirective;

  constructor() {
    Chart.register(
      LineController, LineElement, PointElement, LinearScale, Title, CategoryScale,
      DoughnutController, ArcElement,Legend,Tooltip
    );
  }

  // --- RAW DATA SIGNALS ---
  private allInvoices = signal<Invoice[]>([]);
  private allProducts = signal<Product[]>([]);
  public isLoading = signal(true);

  // --- DATE FILTER SIGNALS ---
  public startDate = signal<string>(this.getISODate(-6)); // Default to 7 days ago (0-6)
  public endDate = signal<string>(this.getISODate(0));   // Default to today

  // === OVERALL BUSINESS HEALTH METRICS ===
  totalStockValueAtCost = computed(() => 
    this.allProducts().reduce((sum, p) => sum + ((p.rate ?? p.costPrice ?? 0) * p.quantity), 0)
  );
  totalStockValueAtSell = computed(() => 
    this.allProducts().reduce((sum, p) => sum + ((p.sellPrice ?? 0) * p.quantity), 0)
  );
  allTimeTotalSales = computed(() => 
    this.allInvoices().reduce((sum, inv) => sum + inv.grandTotal, 0)
  );
  allTimeTotalProfit = computed(() => 
    this.allInvoices().reduce((sum, inv) => sum + inv.profitTotalAfterDiscount, 0)
  );

  // === FILTERED METRICS (for the selected date range) ===
  filteredInvoices = computed(() => {
    const start = new Date(this.startDate() + 'T00:00:00'); // Ensure start of day
    const end = new Date(this.endDate() + 'T23:59:59');   // Ensure end of day

    if (!this.startDate() || !this.endDate()) return [];

    return this.allInvoices().filter(inv => {
      const invDate = inv.createdAt.toDate();
      return invDate >= start && invDate <= end;
    });
  });

  filteredTotalSales = computed(() => 
    this.filteredInvoices().reduce((sum, inv) => sum + inv.grandTotal, 0)
  );
  filteredTotalProfit = computed(() => 
    this.filteredInvoices().reduce((sum, inv) => sum + inv.profitTotalAfterDiscount, 0)
  );

   filteredUpiPayments = computed(() => 
    this.filteredInvoices()
      .filter(inv => inv.paymentMode === 'upi')
      .reduce((sum, inv) => sum + inv.grandTotal, 0)
  );

  filteredCashPayments = computed(() => 
    this.filteredInvoices()
      .filter(inv => inv.paymentMode === 'cash')
      .reduce((sum, inv) => sum + inv.grandTotal, 0)
  );
  filteredTopSellingItem = computed(() => {
    const itemCounts = new Map<string, { name: string; count: number }>();
    for (const invoice of this.filteredInvoices()) {
      for (const item of invoice.items) {
        const existing = itemCounts.get(item.productId) ?? { name: item.name, count: 0 };
        existing.count += item.qty;
        itemCounts.set(item.productId, existing);
      }
    }
    if (itemCounts.size === 0) return null;
    return [...itemCounts.values()].sort((a, b) => b.count - a.count)[0];
  });

   stockByCategory = computed(() => {
    const categoryMap = new Map<string, number>();
    for (const product of this.allProducts()) {
      const category = product.category || 'Uncategorized';
      const value = (product.rate ?? product.costPrice ?? 0) * product.quantity;
      categoryMap.set(category, (categoryMap.get(category) || 0) + value);
    }
    // Sort by value, descending
    return Array.from(categoryMap.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  });

  // --- NEW: Chart configuration for the doughnut chart ---
// Add this helper method inside your DashboardComponent class
private shadeColor(color: string, percent: number): string {
  let R = parseInt(color.substring(1, 3), 16);
  let G = parseInt(color.substring(3, 5), 16);
  let B = parseInt(color.substring(5, 7), 16);

  R = Math.floor(R * (100 + percent) / 100);
  G = Math.floor(G * (100 + percent) / 100);
  B = Math.floor(B * (100 + percent) / 100);

  R = (R < 255) ? R : 255;  
  G = (G < 255) ? G : 255;  
  B = (B < 255) ? B : 255;  

  const RR = ((R.toString(16).length === 1) ? "0" + R.toString(16) : R.toString(16));
  const GG = ((G.toString(16).length === 1) ? "0" + G.toString(16) : G.toString(16));
  const BB = ((B.toString(16).length === 1) ? "0" + B.toString(16) : B.toString(16));

  return "#" + RR + GG + BB;
}

// Replace your existing doughnutChartData getter with this one
public get doughnutChartData(): ChartConfiguration<'doughnut'>['data'] {
  // A new, high-contrast color palette
  const distinctColors = [
    '#1f77b4', // Muted Blue
    '#ff7f0e', // Safety Orange
    '#2ca02c', // Cooked Asparagus Green
    '#d62728', // Brick Red
    '#9467bd', // Muted Purple
    '#8c564b', // Chestnut Brown
    '#e377c2', // Raspberry Pink
    '#7f7f7f', // Middle Gray
    '#bcbd22', // Curry Yellow-Green
    '#17becf'  // Pacific Blue
  ];

  return {
    labels: this.stockByCategory().map(c => c.name),
    datasets: [{
      data: this.stockByCategory().map(c => c.value),
      backgroundColor: distinctColors,
      // Automatically generate a slightly darker hover color
      hoverBackgroundColor: distinctColors.map(color => this.shadeColor(color, -10)),
      borderWidth: 1,
    }]
  };
}

  public doughnutChartOptions: ChartOptions<'doughnut'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true, // This is the key change to show the legend
        position: 'bottom', // Position the legend to the right of the chart
        labels: {
          boxWidth: 12, // Make the color boxes smaller
          padding: 20,    // Add some space between legend items
        }
      },
    }
  };



  // --- CHART CONFIG ---
  public lineChartData: ChartConfiguration<'line'>['data'] = { labels: [], datasets: [] };
  public lineChartOptions: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index',
      intersect: false,
    },
    plugins: {
      tooltip: {
        enabled: true,
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        titleFont: { size: 14, weight: 'bold' },
        bodyFont: { size: 12 },
        padding: 10,
        cornerRadius: 4,
      }
    },
    scales: {
      x: { grid: { display: false } },
      y: { beginAtZero: true }
    }
  };
  async ngOnInit(): Promise<void> {
    this.isLoading.set(true);
    const [invoices, products] = await Promise.all([
      firstValueFrom(this.invoiceService.getInvoices()),
      firstValueFrom(this.productsService.getProducts())
    ]);
    
    this.allInvoices.set(invoices.filter(inv => (inv as any).status !== 'VOIDED'));
    this.allProducts.set(products);
    
    this.updateChartData();
    this.isLoading.set(false);
  }

  onDateChange(): void {
    this.updateChartData();
  }

  private updateChartData(): void {
    const invoices = this.filteredInvoices();
    const isSingleDay = this.startDate() === this.endDate();
    
    if (isSingleDay) {
      // --- Aggregate by HOUR ---
      const hourlyData = new Map<number, { sales: number, profit: number }>();
      for (let i = 0; i < 24; i++) hourlyData.set(i, { sales: 0, profit: 0 });

      for (const invoice of invoices) {
        const hour = invoice.createdAt.toDate().getHours();
        const entry = hourlyData.get(hour)!;
        entry.sales += invoice.grandTotal;
        entry.profit += invoice.profitTotalAfterDiscount;
      }
      this.lineChartData.labels = Array.from(hourlyData.keys()).map(h => `${h}:00`);
      this.lineChartData.datasets[0] = { data: Array.from(hourlyData.values()).map(d => d.sales), label: 'Sales', ...this.getDatasetOptions('sales') };
      this.lineChartData.datasets[1] = { data: Array.from(hourlyData.values()).map(d => d.profit), label: 'Profit', ...this.getDatasetOptions('profit') };

    } else {
      // --- Aggregate by DAY ---
      const dailyData = new Map<string, { sales: number, profit: number }>();
      let currentDate = new Date(this.startDate() + 'T00:00:00');
      const endDate = new Date(this.endDate() + 'T00:00:00');

      while (currentDate <= endDate) {
        dailyData.set(currentDate.toLocaleDateString(), { sales: 0, profit: 0 });
        currentDate.setDate(currentDate.getDate() + 1);
      }

      for (const invoice of invoices) {
        const dateStr = invoice.createdAt.toDate().toLocaleDateString();
        if (dailyData.has(dateStr)) {
          const entry = dailyData.get(dateStr)!;
          entry.sales += invoice.grandTotal;
          entry.profit += invoice.profitTotalAfterDiscount;
        }
      }
      this.lineChartData.labels = Array.from(dailyData.keys());
      this.lineChartData.datasets[0] = { data: Array.from(dailyData.values()).map(d => d.sales), label: 'Sales', ...this.getDatasetOptions('sales') };
      this.lineChartData.datasets[1] = { data: Array.from(dailyData.values()).map(d => d.profit), label: 'Profit', ...this.getDatasetOptions('profit') };
    }
    
    this.chart?.update();
  }

  private getISODate(dayOffset: number): string {
    const date = new Date();
    date.setDate(date.getDate() + dayOffset);
    return date.toISOString().split('T')[0];
  }

  private getDatasetOptions(type: 'sales' | 'profit') {
    return {
      fill: 'origin',
      tension: 0.4,
      backgroundColor: type === 'sales' ? 'rgba(59, 130, 246, 0.2)' : 'rgba(22, 163, 74, 0.2)',
      borderColor: type === 'sales' ? '#3B82F6' : '#16A34A',
    };
  }
}
