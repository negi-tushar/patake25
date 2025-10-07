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

    // Add Header
    doc.setFontSize(20);
    doc.text('Invoice', 14, 22);
    doc.setFontSize(12);
    doc.text(`Invoice ID: ${invoice.id}`, 14, 30);
    doc.text(
      `Date: ${invoice.createdAt.toDate().toLocaleDateString()}`,
      14,
      36
    );
    doc.text(`Customer: ${invoice.customer.name}`, 14, 42);

    // Add Table
    autoTable(doc, {
      startY: 50,
      head: [['Item', 'Qty', 'Price', 'Total']],
      body: invoice.items.map((item) => [
        item.name,
        item.qty,
        item.finalSellPricePerUnit.toFixed(2),
        item.lineSubTotal.toFixed(2),
      ]),
      theme: 'grid',
    });

    // Add Footer with Totals
    const finalY = (doc as any).lastAutoTable.finalY;
    doc.setFontSize(12);
    doc.text(`Subtotal: ${invoice.subTotal.toFixed(2)}`, 14, finalY + 10);
    doc.text(
      `Discount: -${invoice.discountAmount.toFixed(2)}`,
      14,
      finalY + 16
    );
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(`Grand Total: ${invoice.grandTotal.toFixed(2)}`, 14, finalY + 24);

    // Save the PDF
    const fileName = `Invoice-${invoice.customer.name.replace(
      ' ',
      '_'
    )}-${invoice.id.substring(0, 5)}.pdf`;
    doc.save(fileName);
  }

  sendWhatsAppBill(sale: Invoice): void {
    if (!sale.customer.phone) {
      alert('No phone number is available for this customer.');
      return;
    }

    // 1. Format the bill into a plain text message
    // Note: %0A is the code for a line break in a URL
    let message = `*Invoice for ${sale.customer.name}*\n\n`;
    message += `Here is your bill summary:\n\n`;
    message += `*Items:*\n`;

    sale.items.forEach((item) => {
      const total = (item.finalSellPricePerUnit * item.qty).toFixed(2);
      message += `- ${item.name} (${item.qty} x ${item.finalSellPricePerUnit}) = *${total}*\n`;
    });

    message += `\n-----------------------\n`;
    message += `Subtotal: ${sale.subTotal.toFixed(2)}\n`;
    message += `Discount: -${sale.discountAmount.toFixed(2)}\n`;
    message += `*Grand Total: ${sale.grandTotal.toFixed(2)}*\n\n`;
    message += `Thank you for your purchase!`;
    const isMobile = /Android|iPhone|iPad/i.test(navigator.userAgent);

    // 2. Sanitize the phone number (remove spaces, +, etc.) and create the URL
    const phoneNumber = sale.customer.phone.replace(/\D/g, '');
    // const whatsappUrl = `https://wa.me/${phoneNumber}?text=${encodeURIComponent(message)}`;
    const whatsappUrl = isMobile
      ? `whatsapp://send?phone=${phoneNumber}&text=${encodeURIComponent(
          message
        )}`
      : `https://wa.me/${phoneNumber}?text=${encodeURIComponent(message)}`;
    // 3. Open the URL in a new tab
    window.open(whatsappUrl, '_blank');
  }
}
