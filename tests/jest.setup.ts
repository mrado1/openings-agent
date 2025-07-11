import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables for testing
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

// Global test configuration
beforeAll(() => {
  // Set test environment variables
  process.env.NODE_ENV = 'test';
  
  // Configure console output for tests
  if (process.env.CI) {
    // Reduce console output in CI environment
    console.log = jest.fn();
    console.warn = jest.fn();
  }
});

// Global error handling for tests
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  throw reason;
});

// Mock external dependencies that might not be available in test environment
jest.mock('axios', () => ({
  get: jest.fn(),
  post: jest.fn(),
  put: jest.fn(),
  delete: jest.fn(),
  defaults: {
    headers: {
      common: {}
    }
  }
}));

// API key validation warning
if (!process.env.GEMINI_API_KEY && !process.env.GOOGLE_SEARCH_API_KEY) {
  console.warn('⚠️ Warning: API keys not found. Integration tests will be skipped.');
  console.warn('📋 To run integration tests, create .env.local with:');
  console.warn('   GEMINI_API_KEY=your_gemini_key_here');
  console.warn('   GOOGLE_SEARCH_API_KEY=your_google_search_key_here');
  console.warn('   GOOGLE_SEARCH_ENGINE_ID=your_search_engine_id_here');
}

// Test timeout configuration
jest.setTimeout(30000); // 30 seconds default timeout

export {}; 