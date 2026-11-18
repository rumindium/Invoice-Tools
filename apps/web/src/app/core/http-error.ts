import { HttpErrorResponse } from '@angular/common/http';

const MESSAGE_TRANSLATIONS: Record<string, string> = {
  'Email sudah terdaftar.': 'This email is already registered.',
  'Email atau password salah.': 'Incorrect email or password.',
  'Email tidak valid.': 'Enter a valid email address.',
  'Nama minimal 2 karakter.': 'Name must be at least 2 characters.',
  'Nama maksimal 80 karakter.': 'Name must be at most 80 characters.',
  'Password minimal 8 karakter.': 'Password must be at least 8 characters.',
  'Password maksimal 128 karakter.': 'Password must be at most 128 characters.',
  'Sesi tidak ditemukan.': 'Session not found.',
  'Sesi sudah berakhir.': 'Your session has expired.',
  'Customer name minimal 2 karakter.': 'Customer name must be at least 2 characters.',
  'Company name minimal 2 karakter.': 'Company name must be at least 2 characters.',
  'Company name maksimal 160 karakter.': 'Company name must be at most 160 characters.',
  'Address maksimal 400 karakter.': 'Address must be at most 400 characters.',
  'Phone maksimal 40 karakter.': 'Phone must be at most 40 characters.',
  'Logo terlalu besar.': 'The logo is too large.',
  'Currency harus kode ISO tiga huruf.': 'Currency must be a three-letter ISO code.',
  'Invoice date tidak valid.': 'Enter a valid invoice date.',
  'Due date tidak valid.': 'Enter a valid due date.',
  'Quantity must be greater than zero.': 'Quantity must be greater than zero.',
  'Unit price cannot be negative.': 'Unit price cannot be negative.',
  'Add at least one item.': 'Add at least one item.',
  'Unsupported invoice status.': 'Unsupported invoice status.',
};

function translate(message: string): string {
  return MESSAGE_TRANSLATIONS[message] ?? message;
}

export function apiErrorMessage(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    const body = error.error as { message?: string | string[] } | null;
    if (body && Array.isArray(body.message)) {
      return body.message.map(translate).join(' ');
    }
    if (body && typeof body.message === 'string') {
      return translate(body.message);
    }
    if (error.status === 0) {
      return 'Unable to connect to the API. Make sure the server is running on port 4310.';
    }
    return 'Something went wrong. Please try again.';
  }

  return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
}
