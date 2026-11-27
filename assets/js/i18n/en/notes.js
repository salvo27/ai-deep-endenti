// Same entries as ../it/notes.js, which is the reference: tests/unit/i18n.test.mjs checks it.
export const notes = {
  tab: {
    intro: 'Meetings, links, open questions and loose thoughts about this idea. Each note is a Markdown text, with images.',
    newNote: 'New note',
    empty: 'No notes yet. Write meeting notes here, and anything that does not fit in a sheet.',
  },
  page: {
    downloadMarkdown: 'Download .md',
    downloadPdf: 'Download PDF',
    fileName: 'note',
    empty: 'The note is empty.',
  },
  images: {
    chooseImage: 'Choose a JPEG, PNG or WebP image.',
    tooLarge: 'The image is too large: 25 MB at most.',
    unsupported: 'Unsupported format: use a JPEG, PNG or WebP image.',
    cannotProcess: 'The browser cannot process the image.',
    cannotReduce: 'The image cannot be made small enough.',
    description: 'image',
    alt: 'Image of the note',
    missing: (alt) => (alt ? `Image no longer available: ${alt}` : 'Image no longer available'),
  },
  markdown: {
    date: (date) => `Date: ${date}`,
    unavailable: (alt) => `image not available: ${alt}`,
    notImported: (alt) => `image not imported: ${alt}`,
    unnamed: 'unnamed',
  },
};
