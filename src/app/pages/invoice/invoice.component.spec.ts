import { ComponentFixture, TestBed } from '@angular/core/testing';

import { NewInvoiceComponent } from './invoice.component';

describe('InvoiceComponent', () => {
  let component: NewInvoiceComponent;
  let fixture: ComponentFixture<NewInvoiceComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [NewInvoiceComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(NewInvoiceComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
