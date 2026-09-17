import {
  type BiblePassageTranslationVerseDto,
  type LanguageTagDto,
  type SongSectionInputDto,
  type SongTranslationInputDto,
} from '@worship/shared-dto';
import { BadGatewayException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StructuredLogger } from '../common/structured-logger.service';

@Injectable()
export class TranslationService {
  constructor(
    private readonly config: ConfigService,
    private readonly logger: StructuredLogger,
  ) {}

  async translateSong(input: {
    sourceLocale: LanguageTagDto;
    targetLocale: LanguageTagDto;
    title: string;
    sections: readonly SongSectionInputDto[];
  }): Promise<SongTranslationInputDto> {
    const title = await this.translateText(
      input.sourceLocale,
      input.targetLocale,
      input.title,
    );
    const sections: SongSectionInputDto[] = [];
    for (const section of input.sections) {
      sections.push({
        ...section,
        content: await this.translateText(
          input.sourceLocale,
          input.targetLocale,
          section.content,
        ),
      });
    }
    return {
      locale: input.targetLocale,
      title,
      sections,
    };
  }

  metadata(): { provider: string; model: string } {
    return {
      provider: 'LibreTranslate',
      model: 'self-hosted /translate',
    };
  }

  async translateBiblePassage(input: {
    sourceLocale: LanguageTagDto;
    targetLocale: LanguageTagDto;
    reference: string;
    verses: readonly BiblePassageTranslationVerseDto[];
  }): Promise<BiblePassageTranslationVerseDto[]> {
    const translated: BiblePassageTranslationVerseDto[] = [];
    for (const verse of input.verses) {
      translated.push({
        verse: verse.verse,
        text: await this.translateText(
          input.sourceLocale,
          input.targetLocale,
          verse.text,
        ),
      });
    }
    return translated;
  }

  private async translateText(
    sourceLocale: LanguageTagDto,
    targetLocale: LanguageTagDto,
    text: string,
  ): Promise<string> {
    const chunks = this.chunks(text);
    const translated: string[] = [];
    for (const chunk of chunks) {
      translated.push(await this.translateChunk(sourceLocale, targetLocale, chunk));
    }
    return translated.join('');
  }

  private async translateChunk(
    sourceLocale: LanguageTagDto,
    targetLocale: LanguageTagDto,
    text: string,
  ): Promise<string> {
    const url = `${this.config.getOrThrow<string>('LIBRETRANSLATE_URL')}/translate`;
    const apiKey = this.config.get<string>('LIBRETRANSLATE_API_KEY');
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          q: text,
          source: sourceLocale === 'und' ? 'auto' : sourceLocale.split('-')[0],
          target: targetLocale.split('-')[0],
          format: 'text',
          ...(apiKey ? { api_key: apiKey } : {}),
        }),
      });
    } catch (error) {
      this.logger.error({ event: 'translation.libretranslate.unreachable', error: error instanceof Error ? error.message : String(error) }, error instanceof Error ? error.stack : undefined, TranslationService.name);
      throw new BadGatewayException('Automatic translation provider is unavailable');
    }
    if (!response.ok) {
      this.logger.warn({ event: 'translation.libretranslate.rejected', status: response.status }, TranslationService.name);
      throw new BadGatewayException('Automatic translation provider rejected the request');
    }
    const result = await response.json() as unknown;
    try {
      if (!result || typeof result !== 'object' || typeof (result as Record<string, unknown>)['translatedText'] !== 'string') {
        throw new Error('Missing translatedText');
      }
      const translated = (result as Record<string, string>)['translatedText'];
      if (!translated.trim()) throw new Error('No translated text');
      return translated;
    } catch (error) {
      this.logger.warn({ event: 'translation.libretranslate.invalid-payload', error: error instanceof Error ? error.message : String(error) }, TranslationService.name);
      throw new BadGatewayException('Automatic translation provider returned an invalid payload');
    }
  }

  private chunks(text: string): string[] {
    const maxLength = 3_500;
    if (text.length <= maxLength) return [text];
    const chunks: string[] = [];
    let start = 0;
    while (start < text.length) {
      let end = Math.min(start + maxLength, text.length);
      if (end < text.length) {
        const breakAt = Math.max(
          text.lastIndexOf('\n', end),
          text.lastIndexOf(' ', end),
        );
        if (breakAt > start) end = breakAt + 1;
      }
      chunks.push(text.slice(start, end));
      start = end;
    }
    return chunks;
  }
}
