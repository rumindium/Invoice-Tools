import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

interface RuntimeConfig {
  apiOrigin: string;
}

@Injectable({ providedIn: 'root' })
export class ApiConfigService {
  private readonly http = inject(HttpClient);
  private originPromise?: Promise<string>;

  get apiOrigin(): Promise<string> {
    this.originPromise ??= firstValueFrom(this.http.get<RuntimeConfig>('/assets/config.json'))
      .then((config) => config.apiOrigin)
      .catch(() => 'http://localhost:4310');

    return this.originPromise;
  }
}
