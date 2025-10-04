import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { Observable } from 'rxjs';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

import { Invoice, InvoiceService } from '../../services/invoice.service';

@Component({
  selector: 'app-sales',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './sales.component.html',
})
export class SalesComponent implements OnInit {
  private invoiceService = inject(InvoiceService);
  private router = inject(Router);

  sales$: Observable<Invoice[]> | undefined;

  ngOnInit(): void {
    this.sales$ = this.invoiceService.getInvoices();
  }

  navigateToCreateInvoice(): void {
    this.router.navigate(['/invoice']);
  }


  editInvoice(id: string): void {
    // This now navigates to the pre-filled "Create Invoice" screen
    this.router.navigate(['/invoices/edit', id]);
  }

  async deleteInvoice(id: string): Promise<void> {
    if (confirm('Are you sure you want to delete this invoice? This will restore the stock of all items sold.')) {
      try {
        await this.invoiceService.deleteInvoiceAndRestoreStock(id);
        // Optionally show a success toast
      } catch (error) {
        console.error(error);
        alert('Failed to delete invoice.');
      }
    }
  }

  downloadInvoice(invoice: Invoice): void {
    const doc = new jsPDF();

    // Add Header
    doc.setFontSize(20);
    doc.text('Invoice', 14, 22);
    doc.setFontSize(12);
    doc.text(`Invoice ID: ${invoice.id}`, 14, 30);
    doc.text(`Date: ${invoice.createdAt.toDate().toLocaleDateString()}`, 14, 36);
    doc.text(`Customer: ${invoice.customer.name}`, 14, 42);

    // Add Table
    autoTable(doc, {
      startY: 50,
      head: [['Item', 'Qty', 'Price', 'Total']],
      body: invoice.items.map(item => [
        item.name,
        item.qty,
        item.finalSellPricePerUnit.toFixed(2),
        item.lineSubTotal.toFixed(2)
      ]),
      theme: 'grid',
    });

    // Add Footer with Totals
    const finalY = (doc as any).lastAutoTable.finalY;
    doc.setFontSize(12);
    doc.text(`Subtotal: ${invoice.subTotal.toFixed(2)}`, 14, finalY + 10);
    doc.text(`Discount: -${invoice.discountAmount.toFixed(2)}`, 14, finalY + 16);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(`Grand Total: ${invoice.grandTotal.toFixed(2)}`, 14, finalY + 24);

    // Save the PDF
    const fileName = `Invoice-${invoice.customer.name.replace(' ', '_')}-${invoice.id.substring(0, 5)}.pdf`;
    doc.save(fileName);
  }
}
