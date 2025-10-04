import { Component, OnInit, inject, signal, computed, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BaseChartDirective } from 'ng2-charts';
import { CategoryScale, Chart, ChartConfiguration, ChartOptions, LinearScale, LineController, LineElement, PointElement, Title } from 'chart.js';

import { Invoice, InvoiceService } from '../../services/invoice.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, BaseChartDirective],
  templateUrl: './dashboard.component.html',
})
export class DashboardComponent implements OnInit {
  private invoiceService = inject(InvoiceService);

  // --- Get a reference to the chart canvas in the template ---
  @ViewChild(BaseChartDirective) chart?: BaseChartDirective;

  // --- START OF FIX ---
  constructor() {
    // Register all the required components for a line chart.
    // This tells Chart.js how to build everything it needs.
    Chart.register(
      LineController,
      LineElement,
      PointElement,
      LinearScale,
      Title,
      CategoryScale
    );
  }
  // --- State Signals ---
   invoices = signal<Invoice[]>([]);
  public isLoading = signal(true); // Add a loading state for better UX

  // --- KPI Signals (Computed from raw data) ---
  totalSales = computed(() => this.invoices().reduce((sum, inv) => sum + (inv.grandTotal ?? 0), 0));
  totalInvoices = computed(() => this.invoices().length);
  totalProfit = computed(() => this.invoices().reduce((sum, inv) => sum + (inv.profitTotalAfterDiscount ?? 0), 0));
  avgSaleValue = computed(() => {
    const count = this.totalInvoices();
    return count > 0 ? this.totalSales() / count : 0;
  });
  

  topSellingItem = computed(() => {
    const itemCounts = new Map<string, { name: string; count: number }>();
    for (const invoice of this.invoices()) {
      for (const item of invoice.items) {
        const existing = itemCounts.get(item.productId) ?? { name: item.name, count: 0 };
        existing.count += item.qty;
        itemCounts.set(item.productId, existing);
      }
    }
    if (itemCounts.size === 0) return null;
    return [...itemCounts.values()].sort((a, b) => b.count - a.count)[0];
  });

  // --- Chart Configuration ---
  public lineChartData: ChartConfiguration<'line'>['data'] = {
    labels: [],
    datasets: [
      { data: [], label: 'Sales', fill: 'origin', tension: 0.4, backgroundColor: 'rgba(59, 130, 246, 0.2)', borderColor: '#3B82F6' },
      { data: [], label: 'Profit', fill: 'origin', tension: 0.4, backgroundColor: 'rgba(22, 163, 74, 0.2)', borderColor: '#16A34A' },
    ],
  };
  public lineChartOptions: ChartOptions<'line'> = { responsive: true, maintainAspectRatio: false };

  ngOnInit(): void {
    this.isLoading.set(true);
    this.invoiceService.getInvoices().subscribe(invoice => {
      // --- THE FIX: PART 1 ---
      // 1. Log the data to ensure it's arriving correctly
      console.log('Fetched Invoices:', invoice);

      // 2. Filter out any voided invoices
      // const validInvoices = invoices.filter(inv => (inv as any).status !== 'VOIDED');
      this.invoices.set(invoice);
      console.log('Valid Invoices after filtering VOIDED:', invoice);
      
      // 3. Update the chart's data
      this.updateChartData(invoice);

      // 4. Manually trigger the chart to redraw itself
      this.chart?.update();

      this.isLoading.set(false);
    });
  }

  private updateChartData(invoices: Invoice[]): void {
    if (invoices.length === 0) return;

    const salesByDate = new Map<string, { sales: number; profit: number }>();
    for (const invoice of invoices) {
      // Make sure createdAt and its toDate method exist
      if (invoice.createdAt?.toDate) {
        const date = invoice.createdAt.toDate().toLocaleDateString();
        const existing = salesByDate.get(date) ?? { sales: 0, profit: 0 };
        existing.sales += invoice.grandTotal ?? 0;
        existing.profit += invoice.profitTotalAfterDiscount ?? 0;
        salesByDate.set(date, existing);
      }
    }

    const sortedDates = [...salesByDate.keys()].sort((a, b) => new Date(a).getTime() - new Date(b).getTime());

    this.lineChartData.labels = sortedDates;
    this.lineChartData.datasets[0].data = sortedDates.map(date => salesByDate.get(date)!.sales);
    this.lineChartData.datasets[1].data = sortedDates.map(date => salesByDate.get(date)!.profit);
  }
}
