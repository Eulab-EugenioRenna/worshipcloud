import {
  ImportBibleRequestSchema,
  ImportSongsRequestSchema,
  type ImportBibleRequestDto,
  type ImportSourceAdapterDto,
  type ImportSourceDto,
  type ImportSourceKindDto,
  type ImportSongsRequestDto,
  type RemoteImportRequestDto,
} from '@worship/shared-dto';
import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { lookup } from 'node:dns/promises';
import { request as httpsRequest } from 'node:https';
import { isIP, type LookupFunction } from 'node:net';
import { z } from 'zod';

const ConfiguredSourceSchema = z.object({
  id: z.string().min(1).max(80),
  name: z.string().min(1).max(120),
  kind: z.enum(['Bible', 'Song']),
  adapter: z.enum(['canonical-json', 'getbible-v2']),
  description: z.string().max(300).optional(),
  urlTemplate: z.string().url(),
  headers: z.record(z.string(), z.string()).optional(),
});

type ConfiguredSource = z.infer<typeof ConfiguredSourceSchema>;

const GetBibleSchema = z.object({
  translation: z.string().min(1),
  abbreviation: z.string().min(1),
  lang: z.string().min(1),
  books: z.array(
    z.object({
      nr: z.number().int().positive(),
      name: z.string().min(1),
      chapters: z.array(
        z.object({
          chapter: z.number().int().positive(),
          verses: z.array(
            z.object({
              verse: z.number().int().positive(),
              text: z.string().min(1),
            }),
          ),
        }),
      ),
    }),
  ),
});

const GET_BIBLE_SOURCE: ConfiguredSource = {
  id: 'getbible-v2',
  name: 'GetBible.net',
  kind: 'Bible',
  adapter: 'getbible-v2',
  description:
    'Catalogo pubblico GetBible API v2. Inserisci il codice della traduzione, ad esempio kjv.',
  urlTemplate: 'https://api.getbible.net/v2/{resource}.json',
};

@Injectable()
export class ImportSourcesService {
  private readonly configuredSources: readonly ConfiguredSource[];

  constructor(private readonly config: ConfigService) {
    const raw = this.config.get<string>('IMPORT_SOURCES_JSON') ?? '[]';
    const parsed = z.array(ConfiguredSourceSchema).safeParse(JSON.parse(raw));
    if (!parsed.success)
      throw new Error('IMPORT_SOURCES_JSON has an invalid source definition');
    const ids = new Set<string>([GET_BIBLE_SOURCE.id]);
    for (const source of parsed.data) {
      if (ids.has(source.id))
        throw new Error(`Duplicate import source id: ${source.id}`);
      ids.add(source.id);
    }
    this.configuredSources = [GET_BIBLE_SOURCE, ...parsed.data];
  }

  list(kind: ImportSourceKindDto): ImportSourceDto[] {
    return this.configuredSources
      .filter((source) => source.kind === kind)
      .map((source) => ({
        id: source.id,
        name: source.name,
        kind: source.kind,
        adapter: source.adapter,
        ...(source.description ? { description: source.description } : {}),
        requiresResource: source.urlTemplate.includes('{resource}'),
      }));
  }

  async loadBible(
    input: RemoteImportRequestDto,
  ): Promise<ImportBibleRequestDto> {
    const { adapter, payload } = await this.fetchResource('Bible', input);
    try {
      if (adapter === 'getbible-v2') return this.fromGetBible(payload);
      return ImportBibleRequestSchema.parse(payload);
    } catch {
      throw new BadGatewayException(
        'The remote source does not match the Bible import contract',
      );
    }
  }

  async loadSongs(
    input: RemoteImportRequestDto,
  ): Promise<ImportSongsRequestDto> {
    const { payload } = await this.fetchResource('Song', input);
    try {
      return ImportSongsRequestSchema.parse(payload);
    } catch {
      throw new BadGatewayException(
        'The remote source does not match the song import contract',
      );
    }
  }

  private async fetchResource(
    kind: ImportSourceKindDto,
    input: RemoteImportRequestDto,
  ): Promise<{ adapter: ImportSourceAdapterDto; payload: unknown }> {
    if (input.url) {
      const url = new URL(input.url);
      return {
        adapter: 'canonical-json',
        payload: await this.fetchJson(url, {}, true),
      };
    }

    const source = this.configuredSources.find(
      (candidate) => candidate.id === input.sourceId,
    );
    if (!source || source.kind !== kind)
      throw new NotFoundException('Import source not found');
    if (source.urlTemplate.includes('{resource}') && !input.resource) {
      throw new BadRequestException(
        'This import source requires a resource identifier',
      );
    }
    const url = new URL(
      source.urlTemplate.replaceAll(
        '{resource}',
        encodeURIComponent(input.resource ?? ''),
      ),
    );
    return {
      adapter: source.adapter,
      payload: await this.fetchJson(
        url,
        this.resolveHeaders(source.headers),
        false,
      ),
    };
  }

  private fromGetBible(payload: unknown): ImportBibleRequestDto {
    const bible = GetBibleSchema.parse(payload);
    return ImportBibleRequestSchema.parse({
      translation: {
        locale: bible.lang,
        name: bible.translation,
        abbreviation: bible.abbreviation.toUpperCase(),
      },
      verses: bible.books.flatMap((book) =>
        book.chapters.flatMap((chapter) =>
          chapter.verses.map((verse) => ({
            book: book.name,
            bookOrder: book.nr,
            chapter: chapter.chapter,
            verse: verse.verse,
            text: verse.text,
          })),
        ),
      ),
    });
  }

  private resolveHeaders(
    headers: Record<string, string> | undefined,
  ): Record<string, string> {
    return Object.fromEntries(
      Object.entries(headers ?? {}).map(([name, value]) => {
        const match = /^\$\{([A-Z][A-Z0-9_]*)\}$/.exec(value);
        if (!match) return [name, value];
        const secret = process.env[match[1]];
        if (!secret)
          throw new BadRequestException(
            `Import source credential ${match[1]} is not configured`,
          );
        return [name, secret];
      }),
    );
  }

  private async fetchJson(
    initialUrl: URL,
    headers: Record<string, string>,
    validateEveryUrl: boolean,
  ): Promise<unknown> {
    if (validateEveryUrl) return this.fetchPublicJson(initialUrl, headers);
    let url = initialUrl;
    for (let redirect = 0; redirect <= 3; redirect += 1) {
      let response: Response;
      try {
        response = await fetch(url, {
          headers: { accept: 'application/json', ...headers },
          redirect: 'manual',
          signal: AbortSignal.timeout(60_000),
        });
      } catch {
        throw new BadGatewayException(
          'The remote import source is unavailable',
        );
      }
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location || redirect === 3)
          throw new BadGatewayException(
            'The remote import source redirected too many times',
          );
        const redirected = new URL(location, url);
        if (redirected.origin !== url.origin) {
          throw new BadGatewayException(
            'Configured import sources may not redirect credentials to another origin',
          );
        }
        url = redirected;
        continue;
      }
      if (!response.ok)
        throw new BadGatewayException(
          `The remote import source returned HTTP ${response.status}`,
        );
      const bytes = await this.readLimited(response, 25 * 1024 * 1024);
      try {
        return JSON.parse(new TextDecoder().decode(bytes));
      } catch {
        throw new BadGatewayException(
          'The remote import source did not return valid JSON',
        );
      }
    }
    throw new BadGatewayException(
      'The remote import source could not be loaded',
    );
  }

  private async fetchPublicJson(
    initialUrl: URL,
    headers: Record<string, string>,
  ): Promise<unknown> {
    let url = initialUrl;
    for (let redirect = 0; redirect <= 3; redirect += 1) {
      const address = await this.resolvePublicAddress(url);
      const result = await this.requestPinned(url, address, headers);
      if (result.status >= 300 && result.status < 400) {
        const location = result.location;
        if (!location || redirect === 3) {
          throw new BadGatewayException(
            'The remote import source redirected too many times',
          );
        }
        url = new URL(location, url);
        continue;
      }
      if (result.status < 200 || result.status >= 300) {
        throw new BadGatewayException(
          `The remote import source returned HTTP ${result.status}`,
        );
      }
      try {
        return JSON.parse(new TextDecoder().decode(result.body));
      } catch {
        throw new BadGatewayException(
          'The remote import source did not return valid JSON',
        );
      }
    }
    throw new BadGatewayException(
      'The remote import source could not be loaded',
    );
  }

  private requestPinned(
    url: URL,
    address: { address: string; family: number },
    headers: Record<string, string>,
  ): Promise<{ status: number; location?: string; body: Uint8Array }> {
    const pinnedLookup: LookupFunction = (_hostname, options, callback) => {
      if (options.all) callback(null, [address]);
      else callback(null, address.address, address.family);
    };
    return new Promise((resolve, reject) => {
      const request = httpsRequest(
        url,
        {
          headers: { accept: 'application/json', ...headers },
          lookup: pinnedLookup,
          servername: url.hostname,
        },
        (response) => {
          const status = response.statusCode ?? 502;
          const location = response.headers.location;
          if (status >= 300 && status < 400) {
            response.resume();
            resolve({
              status,
              ...(location ? { location } : {}),
              body: new Uint8Array(),
            });
            return;
          }
          const declaredLength = Number(
            response.headers['content-length'] ?? 0,
          );
          if (declaredLength > 25 * 1024 * 1024) {
            response.destroy();
            reject(
              new BadGatewayException(
                'The remote import payload exceeds 25 MB',
              ),
            );
            return;
          }
          const chunks: Uint8Array[] = [];
          let total = 0;
          response.on('data', (chunk: Buffer) => {
            total += chunk.byteLength;
            if (total > 25 * 1024 * 1024) {
              response.destroy(new Error('payload limit exceeded'));
              return;
            }
            chunks.push(chunk);
          });
          response.on('end', () => {
            const body = new Uint8Array(total);
            let offset = 0;
            for (const chunk of chunks) {
              body.set(chunk, offset);
              offset += chunk.byteLength;
            }
            resolve({ status, ...(location ? { location } : {}), body });
          });
          response.on('error', (error) => {
            reject(
              error.message === 'payload limit exceeded'
                ? new BadGatewayException(
                    'The remote import payload exceeds 25 MB',
                  )
                : new BadGatewayException(
                    'The remote import source is unavailable',
                  ),
            );
          });
        },
      );
      request.setTimeout(60_000, () => request.destroy(new Error('timeout')));
      request.on('error', () =>
        reject(
          new BadGatewayException('The remote import source is unavailable'),
        ),
      );
      request.end();
    });
  }

  private async readLimited(
    response: Response,
    limit: number,
  ): Promise<Uint8Array> {
    const length = Number(response.headers.get('content-length') ?? 0);
    if (length > limit)
      throw new BadGatewayException('The remote import payload exceeds 25 MB');
    if (!response.body)
      throw new BadGatewayException(
        'The remote import source returned an empty response',
      );
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) {
        await reader.cancel();
        throw new BadGatewayException(
          'The remote import payload exceeds 25 MB',
        );
      }
      chunks.push(value);
    }
    const joined = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      joined.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return joined;
  }

  private async resolvePublicAddress(
    url: URL,
  ): Promise<{ address: string; family: number }> {
    if (url.protocol !== 'https:')
      throw new BadRequestException('Public import URLs must use HTTPS');
    const hostname = url.hostname.toLowerCase();
    if (hostname === 'localhost' || hostname.endsWith('.local'))
      throw new BadRequestException('Private import URLs are not allowed');
    let addresses: readonly { address: string; family: number }[];
    try {
      addresses = await lookup(hostname, { all: true });
    } catch {
      throw new BadRequestException(
        'The import URL hostname could not be resolved',
      );
    }
    if (
      !addresses.length ||
      addresses.some(({ address }) => this.isPrivateAddress(address))
    ) {
      throw new BadRequestException('Private import URLs are not allowed');
    }
    return addresses[0];
  }

  private isPrivateAddress(address: string): boolean {
    if (isIP(address) === 4) {
      const [a, b] = address.split('.').map(Number);
      return (
        a === 0 ||
        a === 10 ||
        a === 127 ||
        (a === 169 && b === 254) ||
        (a === 172 && b >= 16 && b <= 31) ||
        (a === 192 && b === 168) ||
        a >= 224
      );
    }
    const normalized = address.toLowerCase();
    if (normalized.startsWith('::ffff:')) {
      return this.isPrivateAddress(normalized.slice('::ffff:'.length));
    }
    return (
      normalized === '::1' ||
      normalized === '::' ||
      normalized.startsWith('fc') ||
      normalized.startsWith('fd') ||
      normalized.startsWith('fe8') ||
      normalized.startsWith('fe9') ||
      normalized.startsWith('fea') ||
      normalized.startsWith('feb')
    );
  }
}
