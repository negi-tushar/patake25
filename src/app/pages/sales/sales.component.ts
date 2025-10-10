import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { Observable } from 'rxjs';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

import { Invoice, InvoiceService } from '../../services/invoice.service';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-sales',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './sales.component.html',
})
export class SalesComponent implements OnInit {
  private authService = inject(AuthService);

  private invoiceService = inject(InvoiceService);
  private router = inject(Router);

  sales$: Observable<Invoice[]> | undefined;
  public isAdmin = signal(false);
  public showProfit = signal(false);
// Add this constant at the top of your component class
private readonly MRP_MARKUP_PERCENT = 20;

// Helper method to round numbers consistently
private round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

  ngOnInit(): void {
    this.sales$ = this.invoiceService.getInvoices();
    this.authService.isAdmin().subscribe((isUserAdmin) => {
      this.isAdmin.set(isUserAdmin);
    });
  }

  navigateToCreateInvoice(): void {
    this.router.navigate(['/invoice']);
  }

  editInvoice(id: string): void {
    // This now navigates to the pre-filled "Create Invoice" screen
    this.router.navigate(['/invoices/edit', id]);
  }

  async deleteInvoice(id: string): Promise<void> {
    if (
      confirm(
        'Are you sure you want to delete this invoice? This will restore the stock of all items sold.'
      )
    ) {
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
  
  // --- Header ---
  doc.setFontSize(20);
  doc.text('Invoice', 14, 22);
  doc.setFontSize(12);
  doc.text(`Invoice ID: ${invoice.id}`, 14, 30);
  doc.text(`Date: ${invoice.createdAt.toDate().toLocaleDateString()}`, 14, 36);
  doc.text(`Customer: ${invoice.customer.name}`, 14, 42);
  doc.text(`Payment Mode: ${invoice.paymentMode || 'N/A'}`, 14, 48);

  // --- Table ---
  const tableBody = invoice.items.map(item => [
    item.name,
    item.qty,
    item.baseSellPriceAtSale.toFixed(2), // MRP
    item.finalSellPricePerUnit.toFixed(2), // Actual Price
    item.lineSubTotal.toFixed(2) // Total
  ]);

  autoTable(doc, {
    startY: 55,
    head: [['Item', 'Qty', 'MRP (₹)', 'Price (₹)', 'Total (₹)']],
    body: tableBody,
    theme: 'grid',
    headStyles: { fillColor: [41, 128, 186], textColor: 255, fontStyle: 'bold' }
  });

  // --- Footer Totals ---
  const finalY = (doc as any).lastAutoTable.finalY;
  doc.setFontSize(12);
  
  const subTotalMRP = invoice.items.reduce((sum, i) => sum + (i.baseSellPriceAtSale * i.qty), 0);
  const builtInDiscount = subTotalMRP - invoice.subTotal;

  doc.text(`Total MRP:`, 14, finalY + 10);
  doc.text(`${this.round2(subTotalMRP).toFixed(2)}`, 200, finalY + 10, { align: 'right' });
  
  doc.text(`Built-in Discount:`, 14, finalY + 16);
  doc.text(`- ${this.round2(builtInDiscount).toFixed(2)}`, 200, finalY + 16, { align: 'right' });

  doc.text(`Subtotal:`, 14, finalY + 22);
  doc.text(`${invoice.subTotal.toFixed(2)}`, 200, finalY + 22, { align: 'right' });

  if (invoice.discountAmount > 0) {
    doc.setTextColor(231, 76, 60); // red
    doc.text(`Extra Discount:`, 14, finalY + 28);
    doc.text(`- ${invoice.discountAmount.toFixed(2)}`, 200, finalY + 28, { align: 'right' });
    doc.setTextColor(0, 0, 0); // reset color
  }

  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text(`Grand Total:`, 14, finalY + 36);
  doc.text(`${invoice.grandTotal.toFixed(2)}`, 200, finalY + 36, { align: 'right' });
  
  // --- Save PDF ---
  const fileName = `Invoice-${invoice.customer.name.replace(/\s+/g, '_')}-${invoice.id.substring(0, 5)}.pdf`;
  doc.save(fileName);
}

sendWhatsAppBill(sale: Invoice): void {
  if (!sale.customer.phone) {
    alert('No phone number is available for this customer.');
    return;
  }

  let message = `*Invoice for ${sale.customer.name}*\n\n`;
  message += `Here is your bill summary:\n\n`;
  
  sale.items.forEach(item => {
    const mrp = item.baseSellPriceAtSale.toFixed(2);
    const price = item.finalSellPricePerUnit.toFixed(2);
    const total = item.lineSubTotal.toFixed(2);
    message += `*${item.name}* (${item.qty} x ${price})\n`;
    message += `~${mrp}~ *${price}* = *${total}*\n\n`;
  });

  message += `-----------------------\n`;
  
  const subTotalMRP = sale.items.reduce((sum, i) => sum + (i.baseSellPriceAtSale * i.qty), 0);
  const builtInDiscount = subTotalMRP - sale.subTotal;
  
  message += `Total MRP: ~${this.round2(subTotalMRP).toFixed(2)}~\n`;
  message += `Item Discounts: -${this.round2(builtInDiscount).toFixed(2)}\n`;
  message += `Subtotal: ${sale.subTotal.toFixed(2)}\n`;
  
  if (sale.discountAmount > 0) {
    message += `Extra Discount: -${sale.discountAmount.toFixed(2)}\n`;
  }
  
  message += `*Grand Total: ${sale.grandTotal.toFixed(2)}*\n\n`;
  message += `Payment via *${sale.paymentMode || 'N/A'}*.\nThank you for your purchase!`;

  const isMobile = /Android|iPhone|iPad/i.test(navigator.userAgent);
  let phoneNumber = sale.customer.phone.replace(/\D/g, '');
  if (!phoneNumber.startsWith('91')) {
    phoneNumber = '91' + phoneNumber;
  }
  
  const whatsappUrl = isMobile
    ? `whatsapp://send?phone=${phoneNumber}&text=${encodeURIComponent(message)}`
    : `https://web.whatsapp.com/send?phone=${phoneNumber}&text=${encodeURIComponent(message)}`;
    
  window.open(whatsappUrl, '_blank');
}

// Method to toggle profit visibility
toggleProfitVisibility(): void {
  this.showProfit.update(currentValue => !currentValue);
}


}
