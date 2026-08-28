import path from "path";
import multer from "multer";

export const ALLOWED_MIME_TYPES: Record<string, string[]> = {
  'application/pdf': ['.pdf'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/jpg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'application/msword': ['.doc'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
};

export const DANGEROUS_EXTENSIONS = new Set([
  '.exe', '.bat', '.cmd', '.sh', '.ps1', '.msi', '.vbs', '.vbe', '.js', '.jse',
  '.wsf', '.wsh', '.scr', '.pif', '.com', '.hta', '.cpl', '.inf', '.reg',
  '.rgs', '.msp', '.mst', '.jar', '.py', '.rb', '.pl', '.php', '.asp',
  '.aspx', '.jsp', '.cgi', '.dll', '.sys', '.drv', '.bin', '.elf', '.app',
  '.deb', '.rpm', '.dmg', '.iso', '.img', '.vhd', '.vmdk', '.ova', '.ovf',
  '.swf', '.svg', '.html', '.htm', '.xhtml', '.xml',
]);

export const MAGIC_BYTES: Record<string, { bytes: number[]; offset?: number }[]> = {
  'application/pdf': [{ bytes: [0x25, 0x50, 0x44, 0x46] }],
  'image/jpeg': [{ bytes: [0xFF, 0xD8, 0xFF] }],
  'image/jpg': [{ bytes: [0xFF, 0xD8, 0xFF] }],
  'image/png': [{ bytes: [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A] }],
  'application/msword': [{ bytes: [0xD0, 0xCF, 0x11, 0xE0] }],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': [{ bytes: [0x50, 0x4B, 0x03, 0x04] }],
};

export const MAX_FILE_SIZE = 5 * 1024 * 1024;
const MAX_FILENAME_LENGTH = 200;

export function sanitizeFilename(filename: string): string {
  let safe = filename.replace(/\0/g, '');
  safe = path.basename(safe);
  safe = safe.replace(/\.\./g, '');
  safe = safe.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_');
  safe = safe.replace(/\s+/g, '_');
  safe = safe.replace(/_{2,}/g, '_');
  safe = safe.trim().replace(/^\.+/, '');
  if (safe.length > MAX_FILENAME_LENGTH) {
    const ext = path.extname(safe);
    safe = safe.substring(0, MAX_FILENAME_LENGTH - ext.length) + ext;
  }
  return safe || 'unnamed_file';
}

export function validateMagicBytes(buffer: Buffer, mimeType: string): boolean {
  const signatures = MAGIC_BYTES[mimeType];
  if (!signatures) return true;
  return signatures.some(sig => {
    const offset = sig.offset || 0;
    if (buffer.length < offset + sig.bytes.length) return false;
    return sig.bytes.every((byte, i) => buffer[offset + i] === byte);
  });
}

export function validateUploadedFile(file: Express.Multer.File): { valid: boolean; error?: string } {
  if (!file || !file.buffer || file.buffer.length === 0) {
    return { valid: false, error: 'No file provided or file is empty' };
  }

  if (file.size > MAX_FILE_SIZE) {
    return { valid: false, error: `File size exceeds maximum of ${MAX_FILE_SIZE / (1024 * 1024)}MB` };
  }

  const originalName = file.originalname || '';
  if (originalName.includes('\0')) {
    return { valid: false, error: 'Invalid filename: contains null bytes' };
  }

  const ext = path.extname(originalName).toLowerCase();
  if (!ext) {
    return { valid: false, error: 'File must have a valid extension' };
  }

  if (DANGEROUS_EXTENSIONS.has(ext)) {
    return { valid: false, error: `File type '${ext}' is not allowed for security reasons` };
  }

  const allowedExtensions = Object.values(ALLOWED_MIME_TYPES).flat();
  if (!allowedExtensions.includes(ext)) {
    return { valid: false, error: `File extension '${ext}' is not allowed. Accepted: PDF, JPG, PNG, DOC, DOCX` };
  }

  const mimeType = file.mimetype;
  if (!ALLOWED_MIME_TYPES[mimeType]) {
    return { valid: false, error: `File type '${mimeType}' is not allowed. Accepted: PDF, JPEG, PNG, DOC, DOCX` };
  }

  const allowedExtsForMime = ALLOWED_MIME_TYPES[mimeType];
  if (!allowedExtsForMime.includes(ext)) {
    return { valid: false, error: `File extension '${ext}' does not match its type '${mimeType}'` };
  }

  if (!validateMagicBytes(file.buffer, mimeType)) {
    return { valid: false, error: 'File content does not match its declared type. The file may be corrupted or disguised.' };
  }

  return { valid: true };
}

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { 
    fileSize: MAX_FILE_SIZE + 1024,
    fieldSize: 10 * 1024 * 1024, // 10MB for form fields like invoiceData, invLines
  },
});
