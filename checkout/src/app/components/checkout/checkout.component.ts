import { Component, OnInit, ViewChild, ElementRef } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { ApiService } from '../../api.service';
import AdyenCheckout from '@adyen/adyen-web';
import { environment } from '../../../environments/environment';
import { HttpClient } from '@angular/common/http';
import { map, mergeMap, tap } from 'rxjs/operators'

@Component({
  selector: 'app-checkout',
  templateUrl: './checkout.component.html',
})
export class CheckoutComponent implements OnInit {
  @ViewChild('hook', { static: true }) hook: ElementRef;
  type: string = '';
  sessionId: string = '';
  redirectResult: string = '';
  clientKey: string = '';

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private apiService: ApiService,
    private http: HttpClient
  ) {
    this.hook = new ElementRef('');
  }

  handleServerResponse(res: any, component: any) {
    if (res.action != null) {
      component.handleAction(res.action);
    } else {
      switch (res.resultCode) {
        case 'Authorised':
          this.router.navigate(['/result/success']);
          break;
        case 'Pending':
        case 'Received':
          this.router.navigate(['/result/pending']);
          break;
        case 'Refused':
          this.router.navigate(['/result/failed']);
          break;
        default:
          this.router.navigate(['/result/error']);
          break;
      }
    }
  }

  ngOnInit(): void {
    this.type = this.route.snapshot.queryParamMap.get('type') || '';
    this.sessionId = this.route.snapshot.queryParamMap.get('sessionId') || '';
    this.redirectResult = this.route.snapshot.queryParamMap.get('redirectResult') || '';

    // obtain ADYEN_CLIENT_KEY
    this.http
      .get<any>('/api/config', {observe: 'response'})
      .pipe(
        map(response => response.body),
        map(body => {
          this.clientKey = body.api_key;
          console.log(`this.clientKey ${this.clientKey}`);
        }),
        mergeMap(() => this.apiService.sessions()),
        map(response => {
          console.log(`this.clientKey ${response}`);
          if (!this.sessionId) {
            return this.createAdyenCheckout(response).then(checkout => checkout.create(this.type).mount(this.hook.nativeElement));
          } else {
            // existing session: complete Checkout
            return this.finalizeCheckout();
          }
        })
      )
      .subscribe();
  }

  async createAdyenCheckout(session: any) {

      const configuration = {
          clientKey: this.clientKey,
          locale: "en_US",
          environment: "test",  // change to live for production
          showPayButton: true,
          session: session,
          paymentMethodsConfiguration: {
              ideal: {
                  showImage: true
              },
              card: {
                  hasHolderName: true,
                  holderNameRequired: true,
                  name: "Credit or debit card",
                  amount: {
                      value: 10000,
                      currency: "EUR"
                  }
              },
              paypal: {
                  amount: {
                      currency: "USD",
                      value: 10000
                  },
                  environment: "test",
                  countryCode: "US"   // Only needed for test. This will be automatically retrieved when you are in production.
              }
          },
          onPaymentCompleted: (state: any, component: any) => {
              this.handleServerResponse(state, component);
          },
          onError: (error: any, component: any) => {
              console.error(error.name, error.message, error.stack, component);
          }
      };

      return await AdyenCheckout(configuration);
  }

  // Some payment methods use redirects. This is where we finalize the operation
  async finalizeCheckout() {
    try {
        // Create AdyenCheckout re-using existing Session
        const checkout = await this.createAdyenCheckout({id: this.sessionId});

        // Submit the extracted redirectResult (to trigger onPaymentCompleted() handler)
        checkout.submitDetails({details: this.redirectResult});
    } catch (error) {
        console.error(error);
        alert("Error occurred. Look at console for details");
    }
  }

}
