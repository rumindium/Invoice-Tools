import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type {
  Design,
  DesignElement,
  DesignKind,
  PageSettings,
} from '../pages/template-builder/builder.model';
import { ApiConfigService } from './api-config.service';
import type { TemplateSettings } from './template.service';

/** A design as stored by the API (`/api/v1/template-designs`). */
export interface TemplateDesignView {
  id: string;
  name: string;
  kind: DesignKind;
  accentColor: string;
  page: PageSettings;
  elements: DesignElement[];
  /** Saves must send the revision they are based on. */
  revision: number;
  /** Document types whose active template this design is. */
  appliedTo: DesignKind[];
  createdAt: string;
  updatedAt: string;
}

export interface TemplateAssetView {
  id: string;
  kind: 'upload' | 'signature';
  name: string;
  dataUrl: string;
  byteSize: number;
  createdAt: string;
}

export type DesignPayload = Pick<Design, 'name' | 'kind' | 'accentColor' | 'page' | 'elements'>;

/** Thrown when someone else saved the design since it was loaded. */
export class DesignConflictError extends Error {
  constructor(readonly serverRevision: number) {
    super('This design was changed somewhere else.');
  }
}

/** The document type already has its (one) template. */
export class TemplateExistsError extends Error {
  constructor(
    readonly designId: string | null,
    message = 'This document type already has a template.',
  ) {
    super(message);
  }
}

/** The builder's design as a full editor model. */
export function toDesign(view: TemplateDesignView): Design {
  return {
    version: 1,
    id: view.id,
    name: view.name,
    kind: view.kind,
    accentColor: view.accentColor,
    page: view.page,
    elements: view.elements,
    createdAt: view.createdAt,
    updatedAt: view.updatedAt,
  };
}

export function toPayload(design: Pick<Design, keyof DesignPayload>): DesignPayload {
  return {
    name: design.name,
    kind: design.kind,
    accentColor: design.accentColor,
    page: design.page,
    elements: design.elements,
  };
}

/** Template builder designs and the image library, stored per workspace by the API. */
@Injectable({ providedIn: 'root' })
export class TemplateDesignService {
  private readonly http = inject(HttpClient);
  private readonly api = inject(ApiConfigService);

  private async url(path = ''): Promise<string> {
    return `${await this.api.apiOrigin}/api/v1${path}`;
  }

  async list(kind?: DesignKind): Promise<TemplateDesignView[]> {
    const params = kind ? new HttpParams().set('kind', kind) : undefined;
    const response = await firstValueFrom(
      this.http.get<{ designs: TemplateDesignView[] }>(await this.url('/template-designs'), {
        params,
        withCredentials: true,
      }),
    );
    return response.designs;
  }

  async get(id: string): Promise<TemplateDesignView> {
    const response = await firstValueFrom(
      this.http.get<{ design: TemplateDesignView }>(
        await this.url(`/template-designs/${encodeURIComponent(id)}`),
        { withCredentials: true },
      ),
    );
    return response.design;
  }

  /** Creates the workspace's template for a document type (one per type). */
  async create(payload: DesignPayload): Promise<TemplateDesignView> {
    try {
      const response = await firstValueFrom(
        this.http.post<{ design: TemplateDesignView }>(
          await this.url('/template-designs'),
          payload,
          { withCredentials: true },
        ),
      );
      return response.design;
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === 409) {
        throw new TemplateExistsError(error.error?.designId ?? null, error.error?.message);
      }
      throw error;
    }
  }

  async update(id: string, payload: DesignPayload, revision: number): Promise<TemplateDesignView> {
    try {
      const response = await firstValueFrom(
        this.http.put<{ design: TemplateDesignView }>(
          await this.url(`/template-designs/${encodeURIComponent(id)}`),
          { ...payload, revision },
          { withCredentials: true },
        ),
      );
      return response.design;
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === 409) {
        throw new DesignConflictError(Number(error.error?.revision) || revision);
      }
      throw error;
    }
  }

  async remove(id: string): Promise<void> {
    await firstValueFrom(
      this.http.delete(await this.url(`/template-designs/${encodeURIComponent(id)}`), {
        withCredentials: true,
      }),
    );
  }

  /** Makes the design the active template for a document type (its own kind by default). */
  async apply(
    id: string,
    documentType?: DesignKind,
  ): Promise<{ settings: TemplateSettings; design: TemplateDesignView }> {
    return firstValueFrom(
      this.http.post<{ settings: TemplateSettings; design: TemplateDesignView }>(
        await this.url(`/template-designs/${encodeURIComponent(id)}/apply`),
        documentType ? { documentType } : {},
        { withCredentials: true },
      ),
    );
  }

  /**
   * Address of the server-rendered preview PDF (sample data), for opening in a browser tab; the
   * session cookie goes along. `revision` keeps a cached copy of an older version from showing.
   */
  async previewPdfHref(id: string, revision: number): Promise<string> {
    return `${await this.url(`/template-designs/${encodeURIComponent(id)}/preview.pdf`)}?v=${revision}`;
  }

  /** The design with sample data as a server-rendered PDF (object URL). */
  async previewPdfUrl(id: string, documentType?: DesignKind): Promise<string> {
    const params = documentType ? new HttpParams().set('documentType', documentType) : undefined;
    const blob = await firstValueFrom(
      this.http.get(await this.url(`/template-designs/${encodeURIComponent(id)}/preview.pdf`), {
        params,
        responseType: 'blob',
        withCredentials: true,
      }),
    );
    return URL.createObjectURL(blob);
  }

  async assets(kind?: 'upload' | 'signature'): Promise<TemplateAssetView[]> {
    const params = kind ? new HttpParams().set('kind', kind) : undefined;
    const response = await firstValueFrom(
      this.http.get<{ assets: TemplateAssetView[] }>(await this.url('/template-assets'), {
        params,
        withCredentials: true,
      }),
    );
    return response.assets;
  }

  async addAsset(
    kind: 'upload' | 'signature',
    name: string,
    dataUrl: string,
  ): Promise<TemplateAssetView> {
    const response = await firstValueFrom(
      this.http.post<{ asset: TemplateAssetView }>(
        await this.url('/template-assets'),
        { kind, name: name.slice(0, 120), dataUrl },
        { withCredentials: true },
      ),
    );
    return response.asset;
  }

  async removeAsset(id: string): Promise<void> {
    await firstValueFrom(
      this.http.delete(await this.url(`/template-assets/${encodeURIComponent(id)}`), {
        withCredentials: true,
      }),
    );
  }
}
