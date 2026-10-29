import { Controller, Inject, Injectable, Module, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ENV, type Env } from '../config.js';
import { AppError, type AuthUser, badRequest, CurrentUser } from '../common/http.js';

/** Detect the real type from magic bytes; the client-supplied mimetype is never trusted. */
export function sniffImage(buf: Buffer): { ext: string; mime: string } | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0x89 && buf.toString('ascii', 1, 4) === 'PNG') return { ext: 'png', mime: 'image/png' };
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { ext: 'jpg', mime: 'image/jpeg' };
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return { ext: 'webp', mime: 'image/webp' };
  return null;
}

export const UPLOAD_DIR = join(process.cwd(), 'uploads');

@Injectable()
export class StorageService {
  constructor(@Inject(ENV) private env: Env) {}

  async put(key: string, data: Buffer, mime: string) {
    if (this.env.STORAGE_DRIVER === 'supabase') {
      const res = await fetch(`${this.env.SUPABASE_URL}/storage/v1/object/${this.env.SUPABASE_BUCKET}/${key}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.env.SUPABASE_SERVICE_KEY}`, 'Content-Type': mime, 'x-upsert': 'false' },
        body: new Uint8Array(data),
      });
      if (!res.ok) throw new AppError(502, 'STORAGE_ERROR', 'Upload failed, please try again');
      return `${this.env.SUPABASE_URL}/storage/v1/object/public/${this.env.SUPABASE_BUCKET}/${key}`;
    }
    // Local disk is for development only.
    const path = join(UPLOAD_DIR, key);
    await mkdir(join(path, '..'), { recursive: true });
    await writeFile(path, data);
    return `${this.env.API_PUBLIC_URL}/uploads/${key}`;
  }
}

@ApiTags('uploads')
@Controller('uploads')
class UploadsController {
  constructor(private storage: StorageService) {}

  @Post('image')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024, files: 1 } }))
  async image(@CurrentUser() u: AuthUser, @UploadedFile() file?: { buffer: Buffer; size: number }) {
    if (!file) throw badRequest('NO_FILE', 'Choose an image to upload');
    const kind = sniffImage(file.buffer);
    if (!kind) throw badRequest('UNSUPPORTED_TYPE', 'Only PNG, JPEG or WebP images are allowed');
    const key = `users/${u.id}/${Date.now()}-${randomBytes(6).toString('hex')}.${kind.ext}`;
    return { url: await this.storage.put(key, file.buffer, kind.mime) };
  }
}

@Module({ controllers: [UploadsController], providers: [StorageService] })
export class UploadsModule {}
