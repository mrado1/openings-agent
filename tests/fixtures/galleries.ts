export interface TestGallery {
  name: string;
  website: string;
  city: string;
  expectedFields: string[];
  testShows: TestShow[];
  searchKeywords: string[];
  confidence_threshold: number;
}

export interface TestShow {
  title: string;
  artist: string;
  year: string;
  expectedUrl?: string;
  expectedFields: string[];
  searchHints: string[];
}

export const TEST_GALLERIES: TestGallery[] = [
  {
    name: 'Pace Gallery',
    website: 'https://www.pacegallery.com',
    city: 'New York',
    expectedFields: ['title', 'artists', 'start_date', 'end_date', 'press_release', 'images'],
    searchKeywords: ['pace', 'gallery', 'exhibition', 'contemporary'],
    confidence_threshold: 85,
    testShows: [
      {
        title: 'Telos Tales',
        artist: 'Alicja Kwade',
        year: '2025',
        expectedUrl: 'https://www.pacegallery.com/exhibitions/alicja-kwade-telos-tales/',
        expectedFields: ['title', 'artists', 'start_date', 'end_date', 'press_release', 'images'],
        searchHints: ['Alicja Kwade', 'sculptures', 'contemporary', 'space-time']
      }
    ]
  },
  {
    name: 'David Zwirner',
    website: 'https://www.davidzwirner.com',
    city: 'New York',
    expectedFields: ['title', 'artists', 'start_date', 'end_date', 'press_release'],
    searchKeywords: ['david', 'zwirner', 'gallery', 'exhibition'],
    confidence_threshold: 80,
    testShows: [
      {
        title: 'Recent Paintings',
        artist: 'Jeff Koons',
        year: '2024',
        expectedFields: ['title', 'artists', 'start_date', 'end_date', 'press_release'],
        searchHints: ['Jeff Koons', 'paintings', 'contemporary', 'sculpture']
      }
    ]
  },
  {
    name: 'Gagosian',
    website: 'https://gagosian.com',
    city: 'Global',
    expectedFields: ['title', 'artists', 'press_release', 'images'],
    searchKeywords: ['gagosian', 'gallery', 'exhibition', 'contemporary'],
    confidence_threshold: 80,
    testShows: [
      {
        title: 'New Works',
        artist: 'Damien Hirst',
        year: '2024',
        expectedFields: ['title', 'artists', 'press_release', 'images'],
        searchHints: ['Damien Hirst', 'contemporary', 'sculpture', 'paintings']
      }
    ]
  },
  {
    name: 'Hauser & Wirth',
    website: 'https://www.hauserwirth.com',
    city: 'Global',
    expectedFields: ['title', 'artists', 'start_date', 'end_date', 'press_release'],
    searchKeywords: ['hauser', 'wirth', 'gallery', 'exhibition'],
    confidence_threshold: 75,
    testShows: [
      {
        title: 'Retrospective',
        artist: 'Louise Bourgeois',
        year: '2024',
        expectedFields: ['title', 'artists', 'start_date', 'end_date', 'press_release'],
        searchHints: ['Louise Bourgeois', 'sculpture', 'retrospective', 'contemporary']
      }
    ]
  },
  {
    name: 'White Cube',
    website: 'https://whitecube.com',
    city: 'London',
    expectedFields: ['title', 'artists', 'press_release', 'images'],
    searchKeywords: ['white', 'cube', 'gallery', 'exhibition'],
    confidence_threshold: 75,
    testShows: [
      {
        title: 'New Exhibition',
        artist: 'Anselm Kiefer',
        year: '2024',
        expectedFields: ['title', 'artists', 'press_release', 'images'],
        searchHints: ['Anselm Kiefer', 'paintings', 'contemporary', 'large-scale']
      }
    ]
  }
];

export const FALLBACK_TEST_GALLERIES: TestGallery[] = [
  {
    name: 'Generic Gallery Test',
    website: 'https://example-gallery.com',
    city: 'Test City',
    expectedFields: ['title', 'artists'],
    searchKeywords: ['gallery', 'exhibition'],
    confidence_threshold: 50,
    testShows: [
      {
        title: 'Test Exhibition',
        artist: 'Test Artist',
        year: '2024',
        expectedFields: ['title', 'artists'],
        searchHints: ['test', 'exhibition', 'artist']
      }
    ]
  }
];

export function getTestGalleryByName(name: string): TestGallery | undefined {
  return TEST_GALLERIES.find(gallery => 
    gallery.name.toLowerCase().includes(name.toLowerCase()) ||
    name.toLowerCase().includes(gallery.name.toLowerCase())
  );
}

export function getTestShowsByGallery(galleryName: string): TestShow[] {
  const gallery = getTestGalleryByName(galleryName);
  return gallery ? gallery.testShows : [];
}

export function getAllTestShows(): TestShow[] {
  return TEST_GALLERIES.flatMap(gallery => gallery.testShows);
}

export const PRODUCTION_READY_GALLERIES = TEST_GALLERIES.filter(
  gallery => gallery.confidence_threshold >= 80
);

export const EXPERIMENTAL_GALLERIES = TEST_GALLERIES.filter(
  gallery => gallery.confidence_threshold < 80
); 