// Mock environment variables first
process.env.GEMINI_API_KEY = 'test-api-key';

// Mock GoogleGenerativeAI
const mockGenerateContent = jest.fn();
const mockGetGenerativeModel = jest.fn().mockReturnValue({
  generateContent: mockGenerateContent
});

jest.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
    getGenerativeModel: mockGetGenerativeModel
  }))
}));

import { extractShowFields } from '../../src/extractors/extractFieldsGemini';

describe('extractShowFields', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should extract valid show data from HTML', async () => {
           const mockResponse = {
         response: {
           text: () => `{
             "title": "Test Exhibition",
             "artists": ["John Doe", "Jane Smith"],
             "start_date": "2025-03-15",
             "end_date": "2025-04-20",
             "press_release": "This exhibition features contemporary works...",
             "image_url": "http://gallery.com/image1.jpg",
             "additional_images": ["http://gallery.com/image2.jpg"]
           }`
         }
       };
    
    mockGenerateContent.mockResolvedValueOnce(mockResponse);

    const mockHtml = `
      <h1>Test Exhibition</h1>
      <p>Artists: John Doe, Jane Smith</p>
      <p>March 15 - April 20, 2025</p>
      <p>This exhibition features contemporary works...</p>
      <img src="http://gallery.com/image1.jpg" />
    `;
    
    const result = await extractShowFields(mockHtml, 'http://test-gallery.com');
    
    expect(result.title).toBe('Test Exhibition');
    expect(result.artists).toEqual(['John Doe', 'Jane Smith']);
    expect(result.start_date).toBe('2025-03-15');
    expect(result.end_date).toBe('2025-04-20');
    expect(result.press_release).toContain('contemporary works');
         expect(result.image_url).toBe('http://gallery.com/image1.jpg');
     expect(result.additional_images).toEqual(['http://gallery.com/image2.jpg']);
    expect(result.gallery_url).toBe('http://test-gallery.com');
    expect(result.extracted_at).toBeTruthy();
    expect(result.has_been_enriched).toBe(true);
    expect(result.source_url).toBe('http://test-gallery.com');
  });

  it('should handle JSON wrapped in markdown code blocks', async () => {
    const mockResponse = {
      response: {
        text: () => `\`\`\`json
        {
          "title": "Markdown Test",
          "artists": ["Test Artist"],
                     "start_date": "2025-01-01",
           "end_date": "2025-02-01",
           "press_release": "Test release",
           "image_url": "",
           "additional_images": []
        }
        \`\`\``
      }
    };
    
    mockGenerateContent.mockResolvedValueOnce(mockResponse);

    const result = await extractShowFields('<div>test</div>', 'http://test.com');
    
    expect(result.title).toBe('Markdown Test');
    expect(result.artists).toEqual(['Test Artist']);
  });

  it('should handle missing fields gracefully', async () => {
    const mockResponse = {
      response: {
        text: () => `{
          "title": "Minimal Show",
          "artists": [],
          "start_date": "",
          "end_date": "",
          "press_release": "",
          "image_url": "",
          "additional_images": []
        }`
      }
    };
    
    mockGenerateContent.mockResolvedValueOnce(mockResponse);

    const result = await extractShowFields('<div>Minimal content</div>', 'http://test.com');
    
    expect(result.title).toBe('Minimal Show');
    expect(result.artists).toEqual([]);
    expect(result.additional_images).toEqual([]);
    expect(result.gallery_url).toBe('http://test.com');
  });

  it('should throw error on Gemini API failure', async () => {
    mockGenerateContent.mockRejectedValueOnce(new Error('API error'));

    await expect(extractShowFields('<div>test</div>', 'http://test.com'))
      .rejects
      .toThrow('Gemini extraction failed: API error');
  });

  it('should throw error on invalid JSON response', async () => {
    const mockResponse = {
      response: {
        text: () => 'Invalid JSON response'
      }
    };
    
    mockGenerateContent.mockResolvedValueOnce(mockResponse);

    await expect(extractShowFields('<div>test</div>', 'http://test.com'))
      .rejects
      .toThrow('Gemini extraction failed:');
  });

  it('should call Gemini with correct model and prompt', async () => {
    const mockResponse = {
      response: {
        text: () => `{
          "title": "Test",
          "artists": [],
          "start_date": "",
          "end_date": "",
          "press_release": "",
          "image_url": "",
          "additional_images": []
        }`
      }
    };
    
    mockGenerateContent.mockResolvedValueOnce(mockResponse);

    const testHtml = '<div>test content</div>';
    await extractShowFields(testHtml, 'http://gallery.com');
    
    expect(mockGetGenerativeModel).toHaveBeenCalledWith({ model: 'gemini-1.5-flash' });
    expect(mockGenerateContent).toHaveBeenCalledWith(
      expect.stringContaining('You are an expert art gallery website parser')
    );
    expect(mockGenerateContent).toHaveBeenCalledWith(
      expect.stringContaining(testHtml)
    );
  });
}); 