import { isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { AuthService } from '../../core/auth.service';
import {
  TemplateDesignService,
  TemplateExistsError,
  toPayload,
} from '../../core/template-design.service';
import { Design, isDesign } from './builder.model';

/** An image in the library (uploads and saved signatures). */
export interface DesignAsset {
  id: string;
  kind: 'upload' | 'signature';
  name: string;
  src: string;
  createdAt: string;
}

/**
 * Designs and uploads saved in this browser by the earlier, browser-only builder; they are read
 * once and moved to the account (see `moveLegacyDesigns`).
 */
@Injectable({ providedIn: 'root' })
export class DesignStorageService {
  private readonly auth = inject(AuthService);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));

  private key(name: string): string {
    return `rinv.builder.${name}.v1.${this.auth.user()?.id ?? 'guest'}`;
  }

  private read<T>(name: string, fallback: T): T {
    if (!this.browser) {
      return fallback;
    }
    try {
      const raw = localStorage.getItem(this.key(name));
      return raw ? (JSON.parse(raw) as T) : fallback;
    } catch {
      return fallback;
    }
  }

  /** Designs saved in this browser by the earlier, browser-only builder. */
  legacyDesigns(): Design[] {
    return this.read<unknown[]>('designs', []).filter(isDesign);
  }

  legacyAssets(): DesignAsset[] {
    return this.read<DesignAsset[]>('assets', []).filter(
      (asset) => asset && typeof asset.src === 'string' && typeof asset.name === 'string',
    );
  }

  clearLegacy(): void {
    if (this.browser) {
      localStorage.removeItem(this.key('designs'));
      localStorage.removeItem(this.key('assets'));
    }
  }
}

/**
 * Reads an image file as a data URL, scaled down so its longer side is at most `maxSide`
 * (uploads live in localStorage, so they have to stay small).
 */
export async function readImageFile(file: File, maxSide = 1400): Promise<string> {
  if (!/^image\/(png|jpeg|webp|gif|svg\+xml)$/.test(file.type)) {
    throw new Error('Use a PNG, JPEG, WebP, GIF or SVG image.');
  }
  if (file.size > 8 * 1024 * 1024) {
    throw new Error('Images must be smaller than 8 MB.');
  }
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('The image could not be read.'));
    reader.readAsDataURL(file);
  });
  if (file.type === 'image/svg+xml' || file.type === 'image/gif') {
    return dataUrl;
  }

  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const element = new Image();
    element.onload = () => resolve(element);
    element.onerror = () => reject(new Error('The image could not be read.'));
    element.src = dataUrl;
  });
  const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
  if (scale === 1 && file.size < 400_000) {
    return dataUrl;
  }
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(image.naturalWidth * scale);
  canvas.height = Math.round(image.naturalHeight * scale);
  canvas.getContext('2d')?.drawImage(image, 0, 0, canvas.width, canvas.height);
  return file.type === 'image/jpeg'
    ? canvas.toDataURL('image/jpeg', 0.86)
    : canvas.toDataURL('image/png');
}

/** Natural size of an image data URL, for inserting it with the right aspect ratio. */
export function imageSize(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () =>
      resolve({ width: image.naturalWidth || 200, height: image.naturalHeight || 200 });
    image.onerror = () => resolve({ width: 200, height: 200 });
    image.src = src;
  });
}

/**
 * Moves designs and uploads kept in this browser by the earlier browser-only builder to the
 * account, once. Each document type holds one template: a design whose type already has one is
 * not moved. Returns how many designs moved.
 */
export async function moveLegacyDesigns(
  storage: DesignStorageService,
  api: TemplateDesignService,
): Promise<number> {
  const designs = storage.legacyDesigns();
  const assets = storage.legacyAssets();
  if (designs.length === 0 && assets.length === 0) {
    return 0;
  }
  const offline = (error: unknown) =>
    !(error instanceof HttpErrorResponse) || error.status === 0 || error.status >= 500;
  let moved = 0;
  let failed = false;
  // Newest first, so the most recent design of a type becomes its template.
  for (const design of [...designs].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))) {
    try {
      await api.create(toPayload(design));
      moved += 1;
    } catch (error) {
      failed ||= !(error instanceof TemplateExistsError) && offline(error);
    }
  }
  for (const asset of assets) {
    try {
      await api.addAsset(asset.kind, asset.name, asset.src);
    } catch (error) {
      failed ||= offline(error);
    }
  }
  if (!failed) {
    storage.clearLegacy();
  }
  return moved;
}
