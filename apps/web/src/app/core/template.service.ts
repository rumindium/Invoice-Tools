import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type {
  DesignElement,
  DesignKind,
  PageSettings,
} from '../pages/template-builder/builder.model';
import { ApiConfigService } from './api-config.service';

export type TemplateKey = 'classic' | 'modern' | 'minimal' | 'elegant' | 'bold';
/** Kept for code written before goods receipt templates. */
export type QuotationTemplateKey = TemplateKey;

/** Document types with templates, as they appear in API URLs. */
export type TemplateDocumentType = 'quotation' | 'goods-receipt' | 'invoice';

/** A template-builder design carried by a document (`key: 'custom'`). */
export interface DocumentDesign {
  id: string;
  name: string;
  kind: DesignKind;
  accentColor: string;
  page: PageSettings;
  elements: DesignElement[];
  revision: number;
}

/** The template a document is drawn with. */
export interface DocumentTemplate {
  key: TemplateKey | 'custom';
  name: string;
  accentColor: string;
  /** True once the document left draft and keeps its design. */
  locked: boolean;
  /** Set for template-builder designs: drawn instead of a built-in layout. */
  design?: DocumentDesign | null;
}

export interface TemplateOption {
  key: TemplateKey;
  name: string;
  tagline: string;
  description: string;
  highlights: string[];
  defaultColor: string;
  /** The company's colour for this layout (last choice or the layout's default). */
  accentColor: string;
  active: boolean;
}

export interface TemplateSettings {
  documentType: string;
  company: { id: string; name: string };
  active: {
    templateId: string | null;
    key: TemplateKey | 'custom';
    name: string;
    accentColor: string;
    appliedAt: string | null;
    /** The applied template-builder design, when `key` is `custom`. */
    design: { id: string; name: string; revision: number } | null;
  };
  templates: TemplateOption[];
  palette: Array<{ name: string; color: string }>;
}

@Injectable({ providedIn: 'root' })
export class TemplateService {
  private readonly http = inject(HttpClient);
  private readonly api = inject(ApiConfigService);

  async settings(documentType: TemplateDocumentType): Promise<TemplateSettings> {
    const origin = await this.api.apiOrigin;
    const response = await firstValueFrom(
      this.http.get<{ settings: TemplateSettings }>(`${origin}/api/v1/templates/${documentType}`, {
        withCredentials: true,
      }),
    );
    return response.settings;
  }

  async apply(
    documentType: TemplateDocumentType,
    key: TemplateKey,
    accentColor: string,
  ): Promise<TemplateSettings> {
    const origin = await this.api.apiOrigin;
    const response = await firstValueFrom(
      this.http.put<{ settings: TemplateSettings }>(
        `${origin}/api/v1/templates/${documentType}`,
        { key, accentColor },
        { withCredentials: true },
      ),
    );
    return response.settings;
  }

  /**
   * Address of the sample PDF (opened in a new tab; the session cookie goes along). Browser tabs
   * can't be pointed at another tab's object URL, so this is the API address itself.
   */
  async previewPdfHref(
    documentType: TemplateDocumentType,
    key: TemplateKey,
    accentColor: string,
  ): Promise<string> {
    const origin = await this.api.apiOrigin;
    const params = new HttpParams().set('key', key).set('accentColor', accentColor);
    return `${origin}/api/v1/templates/${documentType}/preview.pdf?${params.toString()}`;
  }

  /** A sample PDF drawn by the same renderer as real documents, as an object URL. */
  async previewPdfUrl(
    documentType: TemplateDocumentType,
    key: TemplateKey,
    accentColor: string,
  ): Promise<string> {
    const origin = await this.api.apiOrigin;
    const params = new HttpParams().set('key', key).set('accentColor', accentColor);
    const blob = await firstValueFrom(
      this.http.get(`${origin}/api/v1/templates/${documentType}/preview.pdf`, {
        params,
        responseType: 'blob',
        withCredentials: true,
      }),
    );
    return URL.createObjectURL(blob);
  }
}
