import { Component } from '@angular/core';
import { CompanyProfileCard } from '../dashboard/company-profile-card/company-profile-card';

@Component({
  selector: 'app-company',
  imports: [CompanyProfileCard],
  template: `
    <section class="ui-page">
      <header class="ui-page-head">
        <div>
          <p class="ui-eyebrow">Company</p>
          <h1>Company profile</h1>
          <p class="ui-sub">
            Your seller details are stored on the server and used on every invoice and its PDF.
          </p>
        </div>
      </header>

      <app-company-profile-card />
    </section>
  `,
})
export class CompanyPage {}
