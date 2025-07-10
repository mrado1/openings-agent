import { fetchAndCleanHtml } from '../../src/utils/fetchHtml';
import axios from 'axios';
import * as cheerio from 'cheerio';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('fetchAndCleanHtml', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should fetch and clean HTML successfully', async () => {
    const mockHtml = `
      <html>
        <head><title>Test</title></head>
        <body>
          <nav>Navigation</nav>
          <main>
            <h1>Exhibition Title</h1>
            <p>Content here</p>
          </main>
          <script>console.log('test');</script>
          <footer>Footer content</footer>
        </body>
      </html>
    `;
    
    mockedAxios.get.mockResolvedValueOnce({
      data: mockHtml
    });

    const result = await fetchAndCleanHtml('https://example.com');
    
    expect(mockedAxios.get).toHaveBeenCalledWith('https://example.com', {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; SceneBot/1.0)'
      }
    });

    // Should remove scripts, footer (but keep nav for Phase 3)
    expect(result).toContain('Navigation'); // Nav should be preserved
    expect(result).not.toContain('console.log'); // Scripts removed
    expect(result).not.toContain('Footer content'); // Footer removed
    
    // Should contain main content
    expect(result).toContain('Exhibition Title');
    expect(result).toContain('Content here');
  });

  it('should handle main tag extraction', async () => {
    const mockHtml = `
      <body>
        <nav>Nav</nav>
        <main>
          <h1>Main Content</h1>
        </main>
        <footer>Footer</footer>
      </body>
    `;
    
    mockedAxios.get.mockResolvedValueOnce({
      data: mockHtml
    });

    const result = await fetchAndCleanHtml('https://example.com');
    
    expect(result).toContain('Main Content');
    expect(result).toContain('Nav'); // Nav should be preserved for navigation
    expect(result).not.toContain('Footer'); // Footer should be removed
  });

  it('should limit content to 50000 characters', async () => {
    const longContent = 'a'.repeat(60000);
    const mockHtml = `<body>${longContent}</body>`;
    
    mockedAxios.get.mockResolvedValueOnce({
      data: mockHtml
    });

    const result = await fetchAndCleanHtml('https://example.com');
    
    expect(result.length).toBeLessThanOrEqual(50000);
  });

  it('should throw error on network failure', async () => {
    mockedAxios.get.mockRejectedValueOnce(new Error('Network error'));

    await expect(fetchAndCleanHtml('https://example.com'))
      .rejects
      .toThrow('Failed to fetch https://example.com: Network error');
  });

  it('should handle timeout', async () => {
    mockedAxios.get.mockRejectedValueOnce(new Error('timeout of 10000ms exceeded'));

    await expect(fetchAndCleanHtml('https://example.com'))
      .rejects
      .toThrow('Failed to fetch https://example.com: timeout of 10000ms exceeded');
  });
}); 