import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  doc,
  writeBatch,
  serverTimestamp,
  increment,
  query,
  orderBy,
  collectionData,
  getDoc,
} from '@angular/fire/firestore';
import { Observable } from 'rxjs';

// This interface defines the data structure for each item in the invoice.
// It captures a snapshot of prices and profits at the time of sale.
interface InvoiceItem {
  productId: string;
  name: string;
  unit: string;
  qty: number;
  costPriceAtSale: number;
  baseSellPriceAtSale: number;
  marginOverridePercent?: number;
  finalSellPricePerUnit: number;
  lineSubTotal: number;
  lineCostTotal: number;
  lineProfit: number;
}

// This is the main payload that the component will send to the service to be saved.
export interface SaveInvoicePayload {
  customer: { name: string,   phone?: string; };
  items: InvoiceItem[];
  subTotal: number;
  paymentMode: 'cash' | 'upi' | 'mixed';
  discount: { mode: 'flat' | 'percent'; value: number };
  discountAmount: number;
  grandTotal: number;
  profitTotalBeforeDiscount: number;
  profitTotalAfterDiscount: number;
}
export interface Invoice extends SaveInvoicePayload {
  id: string;
  createdAt: { toDate: () => Date }; // Firestore timestamp object
}

@Injectable({ providedIn: 'root' })
export class InvoiceService {
  private firestore: Firestore = inject(Firestore);

  /**
   * Saves an invoice and atomically decrements stock for each product sold.
   * @param payload The complete invoice data.
   * @returns The ID of the newly created invoice document.
   */
  async saveInvoiceWithStock(payload: SaveInvoicePayload): Promise<string> {
    const invoicesRef = collection(this.firestore, 'invoices');
    const invoiceDocRef = doc(invoicesRef); // Create a new document with a unique ID
    const batch = writeBatch(this.firestore);

    // 1. Add the new invoice document to the batch
    const invoiceDoc = {
      ...payload,
      createdAt: serverTimestamp(), // Use server time for consistency
    };
    batch.set(invoiceDocRef, invoiceDoc);

    // 2. Add stock decrements for each product to the batch
    for (const item of payload.items) {
      const productRef = doc(this.firestore, `products/${item.productId}`);
      // Use the atomic `increment` operator to safely decrement stock
      batch.update(productRef, {
        quantity: increment(-item.qty),
      });
    }

    // 3. Commit the batch. All operations succeed or fail together.
    await batch.commit();

    return invoiceDocRef.id;
  }

  /**
   * Retrieves all invoices from Firestore, ordered by most recent first.
   */
  getInvoices(): Observable<Invoice[]> {
    const invoicesRef = collection(this.firestore, 'invoices');
    // Query to order invoices by creation date, descending
    const q = query(invoicesRef, orderBy('createdAt', 'desc'));
    return collectionData(q, { idField: 'id' }) as Observable<Invoice[]>;
  }

  /**
   * Deletes an invoice and restores the stock of all products sold in it.
   * This is an atomic operation using a batched write.
   * @param invoiceId The ID of the invoice to delete.
   */
  async deleteInvoiceAndRestoreStock(invoiceId: string): Promise<void> {
    const invoiceRef = doc(this.firestore, `invoices/${invoiceId}`);
    const batch = writeBatch(this.firestore);

    // 1. First, read the invoice document to find out what was sold
    const invoiceSnap = await getDoc(invoiceRef);
    if (!invoiceSnap.exists()) {
      throw new Error('Invoice not found!');
    }
    const invoiceData = invoiceSnap.data() as Invoice;

    // 2. Add the invoice deletion to the batch
    batch.delete(invoiceRef);

    // 3. For each item in the invoice, add a stock increment to the batch
    for (const item of invoiceData.items) {
      const productRef = doc(this.firestore, `products/${item.productId}`);
      // Use the atomic `increment` operator to safely add the quantity back
      batch.update(productRef, { quantity: increment(item.qty) });
    }

    // 4. Commit the batch. All operations succeed or fail together.
    await batch.commit();
  }
    /**
   * Retrieves a single invoice document by its ID.
   */
  getInvoiceById(id: string): Promise<Invoice> {
    const invoiceRef = doc(this.firestore, `invoices/${id}`);
    return getDoc(invoiceRef).then(snap => {
      if (!snap.exists()) throw new Error('Invoice not found');
      return { id: snap.id, ...snap.data() } as Invoice;
    });
  }
    /**
   * Atomically updates an invoice by replacing it.
   * Restores old stock, deletes old invoice, creates new one, and decrements new stock.
   */
async updateInvoiceInPlace(invoiceId: string, newPayload: SaveInvoicePayload): Promise<void> {
    const invoiceRef = doc(this.firestore, `invoices/${invoiceId}`);
    const batch = writeBatch(this.firestore);

    // 1. Get the original invoice to calculate stock differences
    const originalInvoiceSnap = await getDoc(invoiceRef);
    if (!originalInvoiceSnap.exists()) {
      throw new Error('Invoice to update does not exist.');
    }
    const originalInvoice = originalInvoiceSnap.data() as Invoice;

    // 2. Calculate the stock adjustments (the "delta")
    const stockAdjustments = new Map<string, number>(); // Key: productId, Value: change in quantity

    // A. Account for items in the original invoice
    for (const oldItem of originalInvoice.items) {
      const currentQty = stockAdjustments.get(oldItem.productId) ?? 0;
      // Add the old quantity back to stock
      stockAdjustments.set(oldItem.productId, currentQty + oldItem.qty);
    }

    // B. Account for items in the new invoice
    for (const newItem of newPayload.items) {
      const currentQty = stockAdjustments.get(newItem.productId) ?? 0;
      // Subtract the new quantity from stock
      stockAdjustments.set(newItem.productId, currentQty - newItem.qty);
    }

    // 3. Apply the final stock adjustments to the batch
    for (const [productId, qtyChange] of stockAdjustments.entries()) {
      if (qtyChange !== 0) { // Only update if there's a change
        const productRef = doc(this.firestore, `products/${productId}`);
        batch.update(productRef, { quantity: increment(qtyChange) });
      }
    }

    // 4. Update the original invoice document with the new data
    batch.update(invoiceRef, { ...newPayload, lastModifiedAt: serverTimestamp() });

    // 5. Commit all operations atomically
    await batch.commit();
  }
}
