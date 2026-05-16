import { describe, expect, it } from 'vitest';
import { parseFeed } from '@/server/integrations/rss/parseFeed';
import { sanitizeContent } from '@/server/integrations/rss/sanitizeContent';
import fs from 'node:fs/promises';
import path from 'node:path';

async function readFixture(name: string) {
  return fs.readFile(
    path.join(process.cwd(), 'src/server/integrations/rss/__fixtures__', name),
    'utf8',
  );
}

describe('rss parsing', () => {
  it('parses RSS feed title and items', async () => {
    const xml = await readFixture('rss.xml');
    const fetchedAt = new Date('2026-02-25T12:00:00Z');

    const feed = await parseFeed(xml, fetchedAt);

    expect(feed.title).toBe('Example RSS');
    expect(feed.items[0].title).toBe('Item 1');
    expect(feed.items[0].link).toBe('https://example.com/item1');
    expect(feed.items[0].publishedAt.toISOString()).toBe('2026-02-25T00:00:00.000Z');
    expect(feed.items[1].publishedAt.toISOString()).toBe(fetchedAt.toISOString());
  });

  it('extracts previewImage from enclosure', async () => {
    const xml = await readFixture('rss-enclosure.xml');
    const fetchedAt = new Date('2026-02-25T12:00:00Z');

    const feed = await parseFeed(xml, fetchedAt);

    expect(feed.items[0].previewImage).toBe('https://example.com/cover.jpg');
  });

  it('extracts previewImage from media:thumbnail', async () => {
    const xml = await readFixture('rss-media-thumbnail.xml');
    const fetchedAt = new Date('2026-02-25T12:00:00Z');

    const feed = await parseFeed(xml, fetchedAt);

    expect(feed.items[0].previewImage).toBe('https://example.com/thumb.png');
  });

  it('parses Atom feed title and items', async () => {
    const xml = await readFixture('atom.xml');
    const fetchedAt = new Date('2026-02-25T12:00:00Z');

    const feed = await parseFeed(xml, fetchedAt);

    expect(feed.title).toBe('Example Atom');
    expect(feed.items[0].title).toBe('Atom Item 1');
    expect(feed.items[0].link).toBe('https://example.com/atom1');
    expect(feed.items[0].publishedAt.toISOString()).toBe('2026-02-25T00:00:00.000Z');
  });

  it('parses optional feed language metadata', async () => {
    const xml = '<?xml version="1.0"?><rss version="2.0"><channel><title>Example</title><language>zh-CN</language><item><title>Item</title></item></channel></rss>';
    const feed = await parseFeed(xml, new Date('2026-03-07T00:00:00Z'));

    expect(feed.language).toBe('zh-CN');
  });

  it('sanitizes scripts and event handlers', () => {
    const cleaned = sanitizeContent(
      '<p>Hi</p><script>alert(1)</script><img src="https://example.com/a.png" onerror="alert(1)" />',
    );
    expect(cleaned).toContain('<p>Hi</p>');
    expect(cleaned).toContain('<img');
    expect(cleaned).toContain('src="https://example.com/a.png"');
    expect(cleaned).not.toContain('<script');
    expect(cleaned).not.toContain('onerror');
  });

  it('normalizes links and images with baseUrl', () => {
    const cleaned = sanitizeContent(
      [
        '<p>',
        '<a href="/post/1">relative</a>',
        '<a href="//news.ycombinator.com/">proto</a>',
        '<a href="#section">anchor</a>',
        '<a href="mailto:test@example.com">mail</a>',
        '<a href="javascript:alert(1)">bad</a>',
        '<img data-src="/img/a.jpg" data-srcset="/img/a.jpg 1x, /img/a@2x.jpg 2x" width="600" height="400" />',
        '<img src="javascript:alert(1)" />',
        '<table><tr><td colspan="2" rowspan="3">cell</td></tr></table>',
        '<p style="color:red" class="x">style</p>',
        '</p>',
      ].join(''),
      { baseUrl: 'https://example.com/a/b' },
    );

    expect(cleaned).toContain('href="https://example.com/post/1"');
    expect(cleaned).toContain('href="https://news.ycombinator.com/"');
    expect(cleaned).toContain('target="_blank"');
    expect(cleaned).toContain('rel="');
    expect(cleaned).toContain('noopener');
    expect(cleaned).toContain('noreferrer');
    expect(cleaned).toContain('ugc');

    expect(cleaned).toContain('href="#section"');
    expect(cleaned).toContain('href="mailto:test@example.com"');
    expect(cleaned).not.toContain('href="javascript:');

    expect(cleaned).toContain('src="https://example.com/img/a.jpg"');
    expect(cleaned).toContain('srcset="');
    expect(cleaned).toContain('https://example.com/img/a@2x.jpg');
    expect(cleaned).toContain('loading="lazy"');
    expect(cleaned).toContain('decoding="async"');
    expect(cleaned).toContain('width="600"');
    expect(cleaned).toContain('height="400"');
    expect(cleaned).not.toContain('javascript:alert');

    expect(cleaned).toContain('colspan="2"');
    expect(cleaned).toContain('rowspan="3"');

    expect(cleaned).not.toContain('style=');
    expect(cleaned).not.toContain('class=');
  });

  it('preserves safe article videos and normalizes media sources', () => {
    const cleaned = sanitizeContent(
      [
        '<video src="/media/story.mp4" poster="/media/poster.jpg" width="1280" height="720" autoplay muted loop playsinline preload="metadata" controls controlslist="nodownload" crossorigin="anonymous">',
        '<source src="/media/story.webm" type="video/webm" />',
        '<track src="/media/captions.vtt" kind="captions" srclang="zh" label="中文" default />',
        '</video>',
        '<video src="javascript:alert(1)" poster="javascript:alert(2)" autoplay="false"></video>',
        '<source src="data:text/html;base64,abc" type="video/mp4" />',
        '<track src="ftp://example.com/captions.vtt" kind="captions" />',
      ].join(''),
      { baseUrl: 'https://example.com/articles/1' },
    );

    expect(cleaned).toContain('<video');
    expect(cleaned).toContain('src="https://example.com/media/story.mp4"');
    expect(cleaned).toContain('poster="https://example.com/media/poster.jpg"');
    expect(cleaned).toContain('width="1280"');
    expect(cleaned).toContain('height="720"');
    expect(cleaned).toContain('controls="controls"');
    expect(cleaned).toContain('preload="metadata"');
    expect(cleaned).toContain('playsinline="playsinline"');
    expect(cleaned).toContain('muted="muted"');
    expect(cleaned).toContain('loop="loop"');
    expect(cleaned).toContain('controlslist="nodownload"');
    expect(cleaned).toContain('crossorigin="anonymous"');
    expect(cleaned).toContain('<source src="https://example.com/media/story.webm"');
    expect(cleaned).toContain('type="video/webm"');
    expect(cleaned).toContain('<track src="https://example.com/media/captions.vtt"');
    expect(cleaned).toContain('kind="captions"');
    expect(cleaned).toContain('srclang="zh"');
    expect(cleaned).toContain('label="中文"');
    expect(cleaned).toContain('default="default"');
    expect(cleaned).not.toContain('autoplay');
    expect(cleaned).not.toContain('javascript:');
    expect(cleaned).not.toContain('data:text/html');
    expect(cleaned).not.toContain('ftp://');
    expect(cleaned).not.toContain('<video controls="controls"></video>');
  });
});
