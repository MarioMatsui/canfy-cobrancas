import {
  BadRequestException, Body, Controller, ForbiddenException, Get, NotFoundException,
  Param, Post, Request, Res, UploadedFile, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { randomBytes } from 'crypto';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

type UploadedMedia = { buffer: Buffer; mimetype: string; size: number; originalname: string };
const MAX_BYTES = 8 * 1024 * 1024;
const FILE_RE = /^[a-f0-9]{48}\.(?:png|jpg|webp|pdf)$/;

/**
 * Persistent, volume-backed media for public commercial product assets.
 * No PHI, prescriptions or patient documents may be uploaded here.
 * The public GET route is deliberate: product photographs and public COAs
 * are intended to be accessible to catalog viewers in both applications.
 */
@Controller('products/media')
export class ProductMediaController {
  private storagePath(): string {
    return process.env.PRODUCT_MEDIA_DIR || join(process.cwd(), 'product-media');
  }

  @Post('upload')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_BYTES } }))
  async upload(
    @Request() req: { user: { role: string } },
    @UploadedFile() file: UploadedMedia | undefined,
    @Body('kind') kind: 'image' | 'coa',
  ) {
    if (req.user.role !== 'ADMIN') throw new ForbiddenException('Apenas administradores podem carregar arquivos');
    if (kind !== 'image' && kind !== 'coa') throw new BadRequestException('Tipo de mídia inválido');
    if (!file?.buffer || file.size < 1 || file.size > MAX_BYTES) throw new BadRequestException('Arquivo vazio ou grande demais');
    const bytes = file.buffer;
    const jpg = bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    const png = bytes.length > 7 && bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
    const webp = bytes.length > 11 && bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP';
    const pdf = bytes.length > 4 && bytes.subarray(0, 5).toString() === '%PDF-';
    const extension = kind === 'coa'
      ? (pdf ? 'pdf' : null)
      : (png ? 'png' : jpg ? 'jpg' : webp ? 'webp' : null);
    if (!extension) throw new BadRequestException(kind === 'coa' ? 'Envie um PDF válido' : 'Envie JPG, PNG ou WEBP válido');
    const filename = randomBytes(24).toString('hex') + '.' + extension;
    if (!process.env.PRODUCT_MEDIA_PUBLIC_BASE_URL) throw new BadRequestException('PRODUCT_MEDIA_PUBLIC_BASE_URL não configurada');
    await mkdir(this.storagePath(), { recursive: true, mode: 0o750 });
    await writeFile(join(this.storagePath(), filename), bytes, { flag: 'wx', mode: 0o640 });
    const configuredBase = process.env.PRODUCT_MEDIA_PUBLIC_BASE_URL;
    if (!configuredBase) {
      throw new BadRequestException('PRODUCT_MEDIA_PUBLIC_BASE_URL não configurada para servir os arquivos');
    }
    const base = new URL(configuredBase);
    if (!['https:', 'http:'].includes(base.protocol)) throw new BadRequestException('URL pública de mídia inválida');
    return { url: base.toString().replace(/\/$/, '') + '/' + filename };
  }

  @Get('file/:filename')
  async read(@Param('filename') filename: string, @Res() res: Response) {
    if (!FILE_RE.test(filename)) throw new NotFoundException();
    let bytes: Buffer;
    try { bytes = await readFile(join(this.storagePath(), filename)); }
    catch { throw new NotFoundException('Arquivo não encontrado'); }
    const ext = filename.split('.').pop();
    const contentType: Record<string, string> = {
      png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', pdf: 'application/pdf',
    };
    res.setHeader('Content-Type', contentType[ext!] || 'application/octet-stream');
    res.setHeader('Content-Disposition', 'inline');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
    res.send(bytes);
  }
}
