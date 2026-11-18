import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiConfigService } from './api-config.service';

/** A unit of measure: `id` is null for the built-in ones every workspace starts with. */
export interface UnitOption {
  id: string | null;
  name: string;
  isCustom: boolean;
}

@Injectable({ providedIn: 'root' })
export class UnitService {
  private readonly http = inject(HttpClient);
  private readonly api = inject(ApiConfigService);

  async list(): Promise<UnitOption[]> {
    const origin = await this.api.apiOrigin;
    const response = await firstValueFrom(
      this.http.get<{ units: UnitOption[] }>(`${origin}/api/v1/units`, { withCredentials: true }),
    );

    return response.units;
  }

  async create(name: string): Promise<UnitOption> {
    const origin = await this.api.apiOrigin;
    const response = await firstValueFrom(
      this.http.post<{ unit: UnitOption }>(
        `${origin}/api/v1/units`,
        { name },
        { withCredentials: true },
      ),
    );

    return response.unit;
  }

  async remove(id: string): Promise<void> {
    const origin = await this.api.apiOrigin;

    await firstValueFrom(
      this.http.delete<void>(`${origin}/api/v1/units/${id}`, { withCredentials: true }),
    );
  }
}
